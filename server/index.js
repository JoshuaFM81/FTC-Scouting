const express = require('express')
const cors = require('cors')
const crypto = require('crypto')
const { Pool } = require('pg')

require('dotenv').config()

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

const TBA_HEADERS = {
  'X-TBA-Auth-Key': process.env.TBA_API_KEY
}

// MULTIUSER SYNC + POSTGRESQL
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : false
    })
  : null

const authToken = () =>
  crypto
    .createHash('sha256')
    .update(process.env.SCOUTING_PASSWORD || '')
    .digest('hex')

const requireSyncAuth = (req, res, next) => {
  const received =
    req.headers.authorization?.replace(/^Bearer\s+/i, '') || ''

  if (!process.env.SCOUTING_PASSWORD || received !== authToken()) {
    return res.status(401).json({
      error: 'No autorizado'
    })
  }

  next()
}

async function initializeDatabase() {
  if (!pool) {
    console.warn(
      'DATABASE_URL no está configurada. Sync multiusuario desactivado.'
    )
    return
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS scouting_records (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pit_records (
      id TEXT PRIMARY KEY,
      event_key TEXT NOT NULL,
      team_number INTEGER NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(event_key, team_number)
    );

    CREATE TABLE IF NOT EXISTS favorite_teams (
      team_number INTEGER PRIMARY KEY,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  console.log('Base de datos Quantum lista.')
}

initializeDatabase().catch((error) =>
  console.error('Error inicializando PostgreSQL:', error)
)

async function getStatboticsEventTeams(eventKey) {
  try {
    const response = await fetch(
      `https://api.statbotics.io/v3/team_events?event=${encodeURIComponent(
        eventKey
      )}&limit=1000`
    )

    if (!response.ok) {
      return []
    }

    const data = await response.json()

    return Array.isArray(data) ? data : []
  } catch (error) {
    console.error(`Error obteniendo EPA de ${eventKey}:`, error)
    return []
  }
}

function getStatboticsEpa(row) {
  const candidates = [
    row?.epa?.total_points?.mean,
    row?.epa?.breakdown?.total_points,
    row?.epa?.mean,
    row?.epa_end,
    row?.epa
  ]

  return (
    candidates.find(
      (value) =>
        typeof value === 'number' &&
        Number.isFinite(value)
    ) ?? null
  )
}

// OPR FINAL DE LA TEMPORADA ANTERIOR
// Guardamos resultados en memoria para no repetir
// las mismas consultas a TBA.

const previousSeasonOprCache = new Map()
const eventOprCache = new Map()

async function getEventOprData(eventKey) {
  if (eventOprCache.has(eventKey)) {
    return eventOprCache.get(eventKey)
  }

  const request = (async () => {
    try {
      const response = await fetch(
        `https://www.thebluealliance.com/api/v3/event/${eventKey}/oprs`,
        {
          headers: TBA_HEADERS
        }
      )

      if (!response.ok) {
        return null
      }

      const data = await response.json()

      if (!data || typeof data !== 'object') {
        return null
      }

      return data
    } catch (error) {
      console.error(
        `Error obteniendo OPR de ${eventKey}:`,
        error
      )

      return null
    }
  })()

  eventOprCache.set(eventKey, request)

  return request
}

async function getPreviousSeasonAverageOpr(
  teamNumber,
  currentYear
) {
  const previousYear = Number(currentYear) - 1
  const teamKey = `frc${teamNumber}`
  const cacheKey = `${teamKey}-${previousYear}-average`

  if (previousSeasonOprCache.has(cacheKey)) {
    return previousSeasonOprCache.get(cacheKey)
  }

  const request = (async () => {
    try {
      const eventsResponse = await fetch(
        `https://www.thebluealliance.com/api/v3/team/${teamKey}/events/${previousYear}`,
        {
          headers: TBA_HEADERS
        }
      )

      if (!eventsResponse.ok) {
        return null
      }

      const events = await eventsResponse.json()

      if (!Array.isArray(events) || events.length === 0) {
        return null
      }

      // TBA event_type 99 = offseason.
      // No cuenta para el promedio.
      const officialEvents = events.filter(
        (event) => event.event_type !== 99
      )

      const oprValues = []

      for (const event of officialEvents) {
        const oprData = await getEventOprData(event.key)
        const opr = oprData?.oprs?.[teamKey]

        if (
          typeof opr === 'number' &&
          Number.isFinite(opr)
        ) {
          oprValues.push(opr)
        }
      }

      if (oprValues.length === 0) {
        return null
      }

      return (
        oprValues.reduce(
          (sum, opr) => sum + opr,
          0
        ) / oprValues.length
      )
    } catch (error) {
      console.error(
        `Error obteniendo OPR promedio ${previousYear} de ${teamKey}:`,
        error
      )

      return null
    }
  })()

  previousSeasonOprCache.set(
    cacheKey,
    request
  )

  return request
}

app.get('/', (req, res) => {
  res.json({
    message: 'Quantum Scouting API funcionando'
  })
})

// LOGIN DE QUANTUM SCOUTING

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body
  const correctPassword =
    process.env.SCOUTING_PASSWORD

  if (!correctPassword) {
    console.error(
      'SCOUTING_PASSWORD no está configurada'
    )

    return res.status(500).json({
      ok: false,
      error:
        'La contraseña del servidor no está configurada'
    })
  }

  if (
    typeof password !== 'string' ||
    password !== correctPassword
  ) {
    return res.status(401).json({
      ok: false,
      error: 'Contraseña incorrecta'
    })
  }

  return res.json({
    ok: true,
    token: authToken()
  })
})

// INFORMACIÓN GENERAL DE UN EQUIPO

app.get(
  '/api/team/:teamNumber',
  async (req, res) => {
    const { teamNumber } = req.params

    try {
      const response = await fetch(
        `https://www.thebluealliance.com/api/v3/team/frc${teamNumber}`,
        {
          headers: TBA_HEADERS
        }
      )

      if (!response.ok) {
        return res
          .status(response.status)
          .json({
            error:
              'No se pudo encontrar el equipo'
          })
      }

      const data = await response.json()

      res.json({
        teamNumber: data.team_number,
        name: data.nickname,
        city: data.city,
        state: data.state_prov,
        country: data.country,
        rookieYear: data.rookie_year,
        website: data.website
      })
    } catch (error) {
      console.error(error)

      res.status(500).json({
        error:
          'Error al conectar con The Blue Alliance'
      })
    }
  }
)

// INFORMACIÓN DEL EQUIPO EN UN EVENTO

app.get(
  '/api/team/:teamNumber/event/:eventKey',
  async (req, res) => {
    const {
      teamNumber,
      eventKey
    } = req.params

    try {
      const [
        oprResponse,
        rankingsResponse,
        eventResponse
      ] = await Promise.all([
        fetch(
          `https://www.thebluealliance.com/api/v3/event/${eventKey}/oprs`,
          {
            headers: TBA_HEADERS
          }
        ),

        fetch(
          `https://www.thebluealliance.com/api/v3/event/${eventKey}/rankings`,
          {
            headers: TBA_HEADERS
          }
        ),

        fetch(
          `https://www.thebluealliance.com/api/v3/event/${eventKey}`,
          {
            headers: TBA_HEADERS
          }
        )
      ])

      if (!eventResponse.ok) {
        return res.status(404).json({
          error: 'Evento no encontrado'
        })
      }

      const eventData =
        await eventResponse.json()

      // OPR / DPR / CCWM

      let opr = null
      let dpr = null
      let ccwm = null

      if (oprResponse.ok) {
        const oprData =
          await oprResponse.json()

        const teamKey =
          `frc${teamNumber}`

        if (
          oprData &&
          typeof oprData === 'object'
        ) {
          opr =
            oprData.oprs?.[teamKey] ??
            null

          dpr =
            oprData.dprs?.[teamKey] ??
            null

          ccwm =
            oprData.ccwms?.[teamKey] ??
            null
        }
      }

      // RANKING / RECORD

      let rank = null

      let record = {
        wins: 0,
        losses: 0,
        ties: 0
      }

      if (rankingsResponse.ok) {
        const rankingsData =
          await rankingsResponse.json()

        const teamRanking =
          rankingsData?.rankings?.find(
            (team) =>
              team.team_key ===
              `frc${teamNumber}`
          )

        if (teamRanking) {
          rank = teamRanking.rank

          record = {
            wins:
              teamRanking.record?.wins ??
              0,

            losses:
              teamRanking.record
                ?.losses ?? 0,

            ties:
              teamRanking.record?.ties ??
              0
          }
        }
      }

      res.json({
        teamNumber:
          Number(teamNumber),

        event: {
          key: eventData.key,
          name: eventData.name,
          year: eventData.year,
          city: eventData.city,
          state: eventData.state_prov,
          country: eventData.country,
          startDate:
            eventData.start_date,
          endDate:
            eventData.end_date
        },

        stats: {
          opr,
          dpr,
          ccwm,
          rank,
          record
        }
      })
    } catch (error) {

          console.error(error)

      res.status(500).json({
        error: 'Error al obtener los datos del evento'
      })
    }
  }
)

// EVENTOS DE UNA TEMPORADA

app.get('/api/events/:year', async (req, res) => {
  const { year } = req.params

  try {
    const response = await fetch(
      `https://www.thebluealliance.com/api/v3/events/${year}`,
      {
        headers: TBA_HEADERS
      }
    )

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'No se pudieron obtener los eventos'
      })
    }

    const events = await response.json()

    const formattedEvents = events
      .map((event) => ({
        key: event.key,
        name: event.name,
        city: event.city,
        state: event.state_prov,
        country: event.country,
        startDate: event.start_date,
        endDate: event.end_date,
        eventType: event.event_type
      }))
      .sort((a, b) => {
        if (!a.startDate) return 1
        if (!b.startDate) return -1

        return new Date(a.startDate) - new Date(b.startDate)
      })

    res.json(formattedEvents)
  } catch (error) {
    console.error(error)

    res.status(500).json({
      error: 'Error al conectar con The Blue Alliance'
    })
  }
})

// EQUIPOS DE UN EVENTO
// TBA: Rank, Record, OPR, DPR y CCWM
// Statbotics: EPA
// Quantum: EPA Rank calculado dentro del evento

app.get('/api/event/:eventKey/teams', async (req, res) => {
  const { eventKey } = req.params

  try {
    const [
      teamsResponse,
      oprResponse,
      rankingsResponse,
      statboticsRows
    ] = await Promise.all([
      fetch(
        `https://www.thebluealliance.com/api/v3/event/${eventKey}/teams`,
        {
          headers: TBA_HEADERS
        }
      ),

      fetch(
        `https://www.thebluealliance.com/api/v3/event/${eventKey}/oprs`,
        {
          headers: TBA_HEADERS
        }
      ),

      fetch(
        `https://www.thebluealliance.com/api/v3/event/${eventKey}/rankings`,
        {
          headers: TBA_HEADERS
        }
      ),

      getStatboticsEventTeams(eventKey)
    ])

    if (!teamsResponse.ok) {
      return res.status(teamsResponse.status).json({
        error: 'No se pudieron obtener los equipos'
      })
    }

    const teams = await teamsResponse.json()

    let oprData = null
    let rankingsData = null

    if (oprResponse.ok) {
      oprData = await oprResponse.json()
    }

    if (rankingsResponse.ok) {
      rankingsData = await rankingsResponse.json()
    }

    const currentYearMatch = String(eventKey).match(/^(\d{4})/)
    const currentYear = currentYearMatch
      ? Number(currentYearMatch[1])
      : new Date().getFullYear()

    const formattedTeams = await Promise.all(
      teams.map(async (team) => {
        const teamKey = team.key

        const ranking = rankingsData?.rankings?.find(
          (item) => item.team_key === teamKey
        )

        const statbotics = statboticsRows.find(
          (item) =>
            Number(item.team) === Number(team.team_number)
        )

        const averageOpr =
          await getPreviousSeasonAverageOpr(
            team.team_number,
            currentYear
          )

        return {
          teamNumber: team.team_number,
          name: team.nickname,
          city: team.city,
          state: team.state_prov,
          country: team.country,

          opr: oprData?.oprs?.[teamKey] ?? null,
          dpr: oprData?.dprs?.[teamKey] ?? null,
          ccwm: oprData?.ccwms?.[teamKey] ?? null,

          epa: getStatboticsEpa(statbotics),

          // Se calcula después para asegurar que
          // EPA Rank corresponda a los equipos
          // de este evento.
          epaRank: null,

          averageOpr,
          averageOprYear: currentYear - 1,

          rank: ranking?.rank ?? null,

          record: {
            wins: ranking?.record?.wins ?? 0,
            losses: ranking?.record?.losses ?? 0,
            ties: ranking?.record?.ties ?? 0
          }
        }
      })
    )

    // EPA Rank:
    // EPA más alto = #1 dentro del evento.
    const teamsWithEpa = formattedTeams
      .filter(
        (team) =>
          typeof team.epa === 'number' &&
          Number.isFinite(team.epa)
      )
      .sort((a, b) => b.epa - a.epa)

    teamsWithEpa.forEach((team, index) => {
      team.epaRank = index + 1
    })

    formattedTeams.sort(
      (a, b) => a.teamNumber - b.teamNumber
    )

    res.json(formattedTeams)
  } catch (error) {
    console.error(error)

    res.status(500).json({
      error: 'Error al obtener los equipos del evento'
    })
  }
})


// ========================================
// SINCRONIZACIÓN MULTIUSUARIO
// ========================================

// DESCARGAR DATOS COMPARTIDOS

app.get('/api/sync', requireSyncAuth, async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      error: 'DATABASE_URL no está configurada'
    })
  }

  try {
    const [
      scoutingResult,
      pitResult,
      favoritesResult
    ] = await Promise.all([
      pool.query(
        `SELECT payload
         FROM scouting_records
         ORDER BY created_at DESC`
      ),

      pool.query(
        `SELECT payload
         FROM pit_records
         ORDER BY updated_at DESC`
      ),

      pool.query(
        `SELECT team_number
         FROM favorite_teams
         ORDER BY team_number`
      )
    ])

    res.json({
      scoutingRecords:
        scoutingResult.rows.map(
          (row) => row.payload
        ),

      pitRecords:
        pitResult.rows.map(
          (row) => row.payload
        ),

      favorites:
        favoritesResult.rows.map(
          (row) => Number(row.team_number)
        ),

      syncedAt: new Date().toISOString()
    })
  } catch (error) {
    console.error(
      'Error leyendo sincronización:',
      error
    )

    res.status(500).json({
      error:
        'No se pudieron sincronizar los datos'
    })
  }
})

// GUARDAR MATCH SCOUTING

app.post(
  '/api/sync/scouting',
  requireSyncAuth,
  async (req, res) => {
    if (!pool) {
      return res.status(503).json({
        error: 'DATABASE_URL no está configurada'
      })
    }

    try {
      const record = {
        ...req.body
      }

      record.id = String(
        record.id || crypto.randomUUID()
      )

      record.updatedAt =
        new Date().toISOString()

      await pool.query(
        `
          INSERT INTO scouting_records (
            id,
            payload
          )
          VALUES (
            $1,
            $2::jsonb
          )

          ON CONFLICT (id)
          DO UPDATE SET
            payload = EXCLUDED.payload,
            updated_at = NOW()
        `,
        [
          record.id,
          JSON.stringify(record)
        ]
      )

      res.json({
        ok: true,
        record
      })
    } catch (error) {
      console.error(
        'Error guardando Match Scouting:',
        error
      )

      res.status(500).json({
        error:
          'No se pudo guardar el Match Scouting'
      })
    }
  }
)

// ELIMINAR MATCH SCOUTING

app.delete(
  '/api/sync/scouting/:id',
  requireSyncAuth,
  async (req, res) => {
    if (!pool) {
      return res.status(503).json({
        error: 'DATABASE_URL no está configurada'
      })
    }

    try {
      await pool.query(
        `
          DELETE FROM scouting_records
          WHERE id = $1
        `,
        [String(req.params.id)]
      )

      res.json({
        ok: true
      })
    } catch (error) {
      console.error(
        'Error eliminando Match Scouting:',
        error
      )

      res.status(500).json({
        error:
          'No se pudo eliminar el Match Scouting'
      })
    }
  }
)

// GUARDAR / ACTUALIZAR PIT SCOUTING

app.put(
  '/api/sync/pit',
  requireSyncAuth,
  async (req, res) => {
    if (!pool) {
      return res.status(503).json({
        error: 'DATABASE_URL no está configurada'
      })
    }

    try {
      const record = {
        ...req.body
      }

      if (
        !record.eventKey ||
        !record.teamNumber
      ) {
        return res.status(400).json({
          error:
            'Falta el evento o el número de equipo'
        })
      }

      record.id = String(
        record.id || crypto.randomUUID()
      )

      record.updatedAt =
        new Date().toISOString()

      await pool.query(
        `
          INSERT INTO pit_records (
            id,
            event_key,
            team_number,
            payload
          )
          VALUES (
            $1,
            $2,
            $3,
            $4::jsonb
          )

          ON CONFLICT (
            event_key,
            team_number
          )

          DO UPDATE SET
            id = EXCLUDED.id,
            payload = EXCLUDED.payload,
            updated_at = NOW()
        `,
        [
          record.id,
          record.eventKey,
          Number(record.teamNumber),
          JSON.stringify(record)
        ]
      )

      res.json({
        ok: true,
        record
      })
    } catch (error) {
      console.error(
        'Error guardando Pit Scouting:',
        error
      )

      res.status(500).json({
        error:
          'No se pudo guardar el Pit Scouting'
      })
    }
  }
)

// ELIMINAR PIT SCOUTING

app.delete(
  '/api/sync/pit/:id',
  requireSyncAuth,
  async (req, res) => {
    if (!pool) {
      return res.status(503).json({
        error: 'DATABASE_URL no está configurada'
      })
    }

    try {
      await pool.query(
        `
          DELETE FROM pit_records
          WHERE id = $1
        `,
        [String(req.params.id)]
      )

      res.json({
        ok: true
      })
    } catch (error) {
      console.error(
        'Error eliminando Pit Scouting:',
        error
      )

      res.status(500).json({
        error:
          'No se pudo eliminar el Pit Scouting'
      })
    }
  }
)

// SINCRONIZAR FAVORITOS

app.put(
  '/api/sync/favorites',
  requireSyncAuth,
  async (req, res) => {
    if (!pool) {
      return res.status(503).json({
        error: 'DATABASE_URL no está configurada'
      })
    }

    const client =
      await pool.connect()

    try {
      const favorites =
        Array.isArray(req.body?.favorites)
          ? [
              ...new Set(
                req.body.favorites
                  .map(Number)
                  .filter(Number.isFinite)
              )
            ]
          : []

      await client.query('BEGIN')

      await client.query(
        'DELETE FROM favorite_teams'
      )

      for (
        const teamNumber of favorites
      ) {
        await client.query(
          `
            INSERT INTO favorite_teams (
              team_number
            )
            VALUES ($1)
            ON CONFLICT DO NOTHING
          `,
          [teamNumber]
        )
      }

      await client.query('COMMIT')

      res.json({
        ok: true,
        favorites
      })
    } catch (error) {
      await client
        .query('ROLLBACK')
        .catch(() => {})

      console.error(
        'Error guardando favoritos:',
        error
      )

      res.status(500).json({
        error:
          'No se pudieron guardar los favoritos'
      })
    } finally {
      client.release()
    }
  }
)

// MATCHES DE UN EVENTO

app.get(
  '/api/event/:eventKey/matches',
  async (req, res) => {
    const { eventKey } = req.params

    try {
      const response = await fetch(
        `https://www.thebluealliance.com/api/v3/event/${eventKey}/matches`,
        {
          headers: TBA_HEADERS
        }
      )

      if (!response.ok) {
        return res
          .status(response.status)
          .json({
            error:
              'No se pudieron obtener los matches'
          })
      }

      const matches =
        await response.json()

      const formattedMatches = matches
        .map((match) => ({
          key: match.key,
          compLevel:
            match.comp_level,
          setNumber:
            match.set_number,
          matchNumber:
            match.match_number,
          predictedTime:
            match.predicted_time,
          actualTime:
            match.actual_time,
          winningAlliance:
            match.winning_alliance,

          red: {
            teams:
              match.alliances?.red
                ?.team_keys?.map(
                  (teamKey) =>
                    Number(
                      teamKey.replace(
                        'frc',
                        ''
                      )
                    )
                ) || [],

            score:
              match.alliances?.red
                ?.score ?? null
          },

          blue: {
            teams:
              match.alliances?.blue
                ?.team_keys?.map(
                  (teamKey) =>
                    Number(
                      teamKey.replace(
                        'frc',
                        ''
                      )
                    )
                ) || [],

            score:
              match.alliances?.blue
                ?.score ?? null
          }
        }))
        .sort((a, b) => {
          const order = {
            qm: 1,
            ef: 2,
            qf: 3,
            sf: 4,
            f: 5
          }

          const levelDifference =
            (order[a.compLevel] || 99) -
            (order[b.compLevel] || 99)

          if (levelDifference !== 0) {
            return levelDifference
          }

          if (
            a.setNumber !==
            b.setNumber
          ) {
            return (
              a.setNumber -
              b.setNumber
            )
          }

          return (
            a.matchNumber -
            b.matchNumber
          )
        })

      res.json(formattedMatches)
    } catch (error) {
      console.error(error)

      res.status(500).json({
        error:
          'Error al obtener los matches del evento'
      })
    }
  }
)

// EVENTOS DE UN EQUIPO EN UNA TEMPORADA

app.get(
  '/api/team/:teamNumber/events/:year',
  async (req, res) => {
    const { teamNumber, year } = req.params

    try {
      const response = await fetch(
        `https://www.thebluealliance.com/api/v3/team/frc${teamNumber}/events/${year}`,
        {
          headers: TBA_HEADERS
        }
      )

      if (!response.ok) {
        return res.status(response.status).json({
          error:
            'No se pudieron obtener los eventos del equipo'
        })
      }

      const events = await response.json()

      const formattedEvents = events
        .map((event) => ({
          key: event.key,
          name: event.name,
          year: event.year,
          city: event.city,
          state: event.state_prov,
          country: event.country,
          startDate: event.start_date,
          endDate: event.end_date,
          eventType: event.event_type
        }))
        .sort((a, b) => {
          if (!a.startDate) return 1
          if (!b.startDate) return -1

          return (
            new Date(a.startDate) -
            new Date(b.startDate)
          )
        })

      res.json(formattedEvents)
    } catch (error) {
      console.error(error)

      res.status(500).json({
        error:
          'Error al obtener los eventos del equipo'
      })
    }
  }
)

// MATCHES DE UN EQUIPO EN UN EVENTO

app.get(
  '/api/team/:teamNumber/event/:eventKey/matches',
  async (req, res) => {
    const {
      teamNumber,
      eventKey
    } = req.params

    try {
      const response = await fetch(
        `https://www.thebluealliance.com/api/v3/team/frc${teamNumber}/event/${eventKey}/matches`,
        {
          headers: TBA_HEADERS
        }
      )

      if (!response.ok) {
        return res.status(response.status).json({
          error:
            'No se pudieron obtener los matches del equipo'
        })
      }

      const matches = await response.json()

      const formattedMatches = matches
        .map((match) => ({
          key: match.key,
          compLevel: match.comp_level,
          setNumber: match.set_number,
          matchNumber: match.match_number,
          predictedTime: match.predicted_time,
          actualTime: match.actual_time,
          winningAlliance:
            match.winning_alliance,

          red: {
            teams:
              match.alliances?.red?.team_keys?.map(
                (teamKey) =>
                  Number(
                    teamKey.replace('frc', '')
                  )
              ) || [],

            score:
              match.alliances?.red?.score ??
              null
          },

          blue: {
            teams:
              match.alliances?.blue?.team_keys?.map(
                (teamKey) =>
                  Number(
                    teamKey.replace('frc', '')
                  )
              ) || [],

            score:
              match.alliances?.blue?.score ??
              null
          }
        }))
        .sort((a, b) => {
          const order = {
            qm: 1,
            ef: 2,
            qf: 3,
            sf: 4,
            f: 5
          }

          const levelDifference =
            (order[a.compLevel] || 99) -
            (order[b.compLevel] || 99)

          if (levelDifference !== 0) {
            return levelDifference
          }

          if (
            a.setNumber !==
            b.setNumber
          ) {
            return (
              a.setNumber -
              b.setNumber
            )
          }

          return (
            a.matchNumber -
            b.matchNumber
          )
        })

      res.json(formattedMatches)
    } catch (error) {
      console.error(error)

      res.status(500).json({
        error:
          'Error al obtener los matches del equipo'
      })
    }
  }
)

// PREMIOS DE UN EQUIPO EN UN EVENTO

app.get(
  '/api/team/:teamNumber/event/:eventKey/awards',
  async (req, res) => {
    const {
      teamNumber,
      eventKey
    } = req.params

    try {
      const response = await fetch(
        `https://www.thebluealliance.com/api/v3/team/frc${teamNumber}/event/${eventKey}/awards`,
        {
          headers: TBA_HEADERS
        }
      )

      if (!response.ok) {
        return res.status(response.status).json({
          error:
            'No se pudieron obtener los premios'
        })
      }

      const awards = await response.json()

      const formattedAwards = awards.map(
        (award) => ({
          name: award.name,
          awardType: award.award_type,
          eventKey: award.event_key,
          recipients:
            award.recipient_list?.map(
              (recipient) => ({
                teamNumber:
                  recipient.team_key
                    ? Number(
                        recipient.team_key.replace(
                          'frc',
                          ''
                        )
                      )
                    : null,

                awardee:
                  recipient.awardee || null
              })
            ) || []
        })
      )

      res.json(formattedAwards)
    } catch (error) {
      console.error(error)

      res.status(500).json({
        error:
          'Error al obtener los premios'
      })
    }
  }
)

// PREMIOS DE UN EQUIPO EN UNA TEMPORADA

app.get(
  '/api/team/:teamNumber/awards/:year',
  async (req, res) => {
    const { teamNumber, year } = req.params

    try {
      const response = await fetch(
        `https://www.thebluealliance.com/api/v3/team/frc${teamNumber}/awards/${year}`,
        {
          headers: TBA_HEADERS
        }
      )

      if (!response.ok) {
        return res.status(response.status).json({
          error:
            'No se pudieron obtener los premios de la temporada'
        })
      }

      const awards = await response.json()

      const formattedAwards = awards.map(
        (award) => ({
          name: award.name,
          awardType: award.award_type,
          eventKey: award.event_key,

          recipients:
            award.recipient_list?.map(
              (recipient) => ({
                teamNumber:
                  recipient.team_key
                    ? Number(
                        recipient.team_key.replace(
                          'frc',
                          ''
                        )
                      )
                    : null,

                awardee:
                  recipient.awardee || null
              })
            ) || []
        })
      )

      res.json(formattedAwards)
    } catch (error) {
      console.error(error)

      res.status(500).json({
        error:
          'Error al obtener los premios de la temporada'
      })
    }
  }
)

// RANKING COMPLETO DEL EVENTO

app.get(
  '/api/event/:eventKey/rankings',
  async (req, res) => {
    const { eventKey } = req.params

    try {
      const response = await fetch(
        `https://www.thebluealliance.com/api/v3/event/${eventKey}/rankings`,
        {
          headers: TBA_HEADERS
        }
      )

      if (!response.ok) {
        return res.status(response.status).json({
          error:
            'No se pudo obtener el ranking del evento'
        })
      }

      const data = await response.json()

      const rankings =
        data?.rankings?.map(
          (ranking) => ({
            rank: ranking.rank,

            teamNumber: Number(
              ranking.team_key.replace(
                'frc',
                ''
              )
            ),

            record: {
              wins:
                ranking.record?.wins ?? 0,

              losses:
                ranking.record?.losses ?? 0,

              ties:
                ranking.record?.ties ?? 0
            },

            dq:
              ranking.dq ?? 0,

            matchesPlayed:
              ranking.matches_played ?? 0,

            sortOrders:
              ranking.sort_orders || []
          })
        ) || []

      res.json(rankings)
    } catch (error) {
      console.error(error)

      res.status(500).json({
        error:
          'Error al obtener el ranking del evento'
      })
    }
  }
)

// INFORMACIÓN GENERAL DEL EVENTO

app.get(
  '/api/event/:eventKey',
  async (req, res) => {
    const { eventKey } = req.params

    try {
      const response = await fetch(
        `https://www.thebluealliance.com/api/v3/event/${eventKey}`,
        {
          headers: TBA_HEADERS
        }
      )

      if (!response.ok) {
        return res.status(response.status).json({
          error: 'Evento no encontrado'
        })
      }

      const event = await response.json()

      res.json({
        key: event.key,
        name: event.name,
        year: event.year,
        city: event.city,
        state: event.state_prov,
        country: event.country,
        startDate: event.start_date,
        endDate: event.end_date,
        eventType: event.event_type,
        website: event.website
      })
    } catch (error) {
      console.error(error)

      res.status(500).json({
        error:
          'Error al obtener la información del evento'
      })
    }
  }
)

// OPR / DPR / CCWM DEL EVENTO

app.get(
  '/api/event/:eventKey/oprs',
  async (req, res) => {
    const { eventKey } = req.params

    try {
      const response = await fetch(
        `https://www.thebluealliance.com/api/v3/event/${eventKey}/oprs`,
        {
          headers: TBA_HEADERS
        }
      )

      if (!response.ok) {
        return res.status(response.status).json({
          error:
            'No se pudieron obtener OPR, DPR y CCWM'
        })
      }

      const data = await response.json()

      res.json({
        oprs: data?.oprs || {},
        dprs: data?.dprs || {},
        ccwms: data?.ccwms || {}
      })
    } catch (error) {
      console.error(error)

      res.status(500).json({
        error:
          'Error al obtener OPR, DPR y CCWM'
      })
    }
  }
)

// HEALTH CHECK
// Sirve para comprobar rápidamente que el backend
// está encendido y si PostgreSQL está configurado.

app.get('/api/health', async (req, res) => {
  let database = false

  if (pool) {
    try {
      await pool.query('SELECT 1')
      database = true
    } catch (error) {
      console.error(
        'Health check PostgreSQL:',
        error
      )
    }
  }

  res.json({
    ok: true,
    api: true,
    database,
    multiuserSync: database,
    time: new Date().toISOString()
  })
})

// 404 PARA RUTAS DE API NO EXISTENTES

app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'Ruta de API no encontrada'
  })
})

// INICIAR SERVIDOR

app.listen(PORT, () => {
  console.log(
    `Quantum Scouting API corriendo en http://localhost:${PORT}`
  )

  if (pool) {
    console.log(
      'Sincronización multiusuario: PostgreSQL configurado'
    )
  } else {
    console.log(
      'Sincronización multiusuario: modo local (falta DATABASE_URL)'
    )
  }
})