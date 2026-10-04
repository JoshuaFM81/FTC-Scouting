const express = require('express')
const cors = require('cors')
const crypto = require('crypto')
const { Pool } = require('pg')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// ============================================================
// FIRST FTC EVENTS API
// ============================================================

const FTC_API_BASE_URL =
  'https://ftc-api.firstinspires.org/v2.0'

function getFtcHeaders() {
  const username = process.env.FTC_API_USERNAME
  const token = process.env.FTC_API_TOKEN

  if (!username || !token) {
    return null
  }

  const basicToken = Buffer.from(
    `${username}:${token}`
  ).toString('base64')

  return {
    Authorization: `Basic ${basicToken}`,
    Accept: 'application/json'
  }
}

function ftcCredentialsConfigured() {
  return Boolean(
    process.env.FTC_API_USERNAME &&
      process.env.FTC_API_TOKEN
  )
}

async function ftcFetch(path) {
  const headers = getFtcHeaders()

  if (!headers) {
    const error = new Error(
      'FTC_API_USERNAME o FTC_API_TOKEN no están configurados'
    )

    error.status = 503
    throw error
  }

  const response = await fetch(
    `${FTC_API_BASE_URL}${path}`,
    {
      headers
    }
  )

  if (!response.ok) {
    let message =
      `FIRST FTC Events API respondió ${response.status}`

    try {
      const body = await response.text()

      if (body) {
        message += `: ${body.slice(0, 300)}`
      }
    } catch {
      // Ignoramos errores leyendo el mensaje.
    }

    const error = new Error(message)
    error.status = response.status

    throw error
  }

  return response.json()
}

// ============================================================
// HELPERS
// ============================================================

function numberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  const number = Number(value)

  return Number.isFinite(number)
    ? number
    : null
}

function firstDefined(...values) {
  return values.find(
    (value) =>
      value !== undefined &&
      value !== null &&
      value !== ''
  )
}

function makeEventKey(season, eventCode) {
  return `${season}-${eventCode}`
}

function parseEventKey(eventKey) {
  const match = String(eventKey).match(
    /^(\d{4})-(.+)$/
  )

  if (!match) {
    return null
  }

  return {
    season: Number(match[1]),
    eventCode: match[2]
  }
}

async function findEventFromSeasonList(
  season,
  eventCode
) {
  const data = await ftcFetch(
    `/${season}/events`
  )

  const events = Array.isArray(data.events)
    ? data.events
    : []

  const requestedCode = String(eventCode)
    .trim()
    .toUpperCase()

  return (
    events.find((event) => {
      const apiCode = String(
        event.code ??
          event.eventCode ??
          ''
      )
        .trim()
        .toUpperCase()

      return apiCode === requestedCode
    }) || null
  )
}

function normalizeEvent(event, season) {
  const eventCode = firstDefined(
    event.code,
    event.eventCode
  )

  return {
    key: makeEventKey(
      season,
      eventCode
    ),

    eventCode,

    name: firstDefined(
      event.name,
      event.eventName,
      eventCode
    ),

    year: Number(season),

    city: firstDefined(
      event.city,
      event.venueCity
    ) ?? null,

    state: firstDefined(
      event.stateprov,
      event.stateProv,
      event.state,
      event.venueStateProv
    ) ?? null,

    country: firstDefined(
      event.country,
      event.venueCountry
    ) ?? null,

    startDate: firstDefined(
      event.dateStart,
      event.startDate
    ) ?? null,

    endDate: firstDefined(
      event.dateEnd,
      event.endDate
    ) ?? null,

    eventType: firstDefined(
      event.type,
      event.eventType
    ) ?? null,

    website: firstDefined(
      event.website,
      event.web
    ) ?? null,

    divisionCode:
      event.divisionCode ?? null,

    regionCode:
      event.regionCode ?? null
  }
}

function normalizeTeam(team) {
  return {
    teamNumber: numberOrNull(
      firstDefined(
        team.teamNumber,
        team.number
      )
    ),

    name: firstDefined(
      team.nameShort,
      team.nameFull,
      team.name,
      team.nickname
    ) ?? null,

    fullName: firstDefined(
      team.nameFull,
      team.name
    ) ?? null,

    city: team.city ?? null,

    state: firstDefined(
      team.stateProv,
      team.stateprov,
      team.state
    ) ?? null,

    country: team.country ?? null,

    rookieYear: numberOrNull(
      firstDefined(
        team.rookieYear,
        team.rookie
      )
    ),

    website: firstDefined(
      team.website,
      team.web
    ) ?? null,

    schoolName:
      team.schoolName ?? null,

    districtCode:
      team.districtCode ?? null,

    homeCMP:
      team.homeCMP ?? null
  }
}

function normalizeRanking(ranking) {
  const wins = numberOrNull(
    firstDefined(
      ranking.wins,
      ranking.winCount
    )
  ) ?? 0

  const losses = numberOrNull(
    firstDefined(
      ranking.losses,
      ranking.lossCount
    )
  ) ?? 0

  const ties = numberOrNull(
    firstDefined(
      ranking.ties,
      ranking.tieCount
    )
  ) ?? 0

  return {
    rank:
      numberOrNull(ranking.rank),

    teamNumber:
      numberOrNull(
        firstDefined(
          ranking.teamNumber,
          ranking.team
        )
      ),

    record: {
      wins,
      losses,
      ties
    },

    matchesPlayed:
      numberOrNull(
        firstDefined(
          ranking.matchesPlayed,
          ranking.played
        )
      ) ??
      wins + losses + ties,

    dq:
      numberOrNull(
        firstDefined(
          ranking.dq,
          ranking.disqualified
        )
      ) ?? 0,

    rankingPoints:
      numberOrNull(
        firstDefined(
          ranking.rankingPoints,
          ranking.rp
        )
      ),

    qualifyingPoints:
      numberOrNull(
        firstDefined(
          ranking.qualifyingPoints,
          ranking.qp
        )
      ),

    sortOrder1:
      numberOrNull(ranking.sortOrder1),

    sortOrder2:
      numberOrNull(ranking.sortOrder2),

    sortOrder3:
      numberOrNull(ranking.sortOrder3),

    sortOrder4:
      numberOrNull(ranking.sortOrder4),

    sortOrder5:
      numberOrNull(ranking.sortOrder5),

    sortOrder6:
      numberOrNull(ranking.sortOrder6)
  }
}

function getMatchTeams(match) {
  const red = []
  const blue = []

  const teams =
    match.teams ||
    match.matchTeams ||
    []

  if (Array.isArray(teams)) {
    teams.forEach((team) => {
      const teamNumber =
        numberOrNull(
          firstDefined(
            team.teamNumber,
            team.team
          )
        )

      if (!teamNumber) {
        return
      }

      const station = String(
        firstDefined(
          team.station,
          team.alliance,
          ''
        )
      ).toLowerCase()

      if (station.includes('red')) {
        red.push(teamNumber)
      }

      if (station.includes('blue')) {
        blue.push(teamNumber)
      }
    })
  }

  const directRed = [
    match.red1,
    match.red2,
    match.redTeam1,
    match.redTeam2
  ]
    .map(numberOrNull)
    .filter(Boolean)

  const directBlue = [
    match.blue1,
    match.blue2,
    match.blueTeam1,
    match.blueTeam2
  ]
    .map(numberOrNull)
    .filter(Boolean)

  return {
    red:
      red.length > 0
        ? [...new Set(red)]
        : [...new Set(directRed)],

    blue:
      blue.length > 0
        ? [...new Set(blue)]
        : [...new Set(directBlue)]
  }
}

function normalizeMatch(
  match,
  eventKey,
  defaultLevel
) {
  const teams = getMatchTeams(match)

  const rawLevel = String(
    firstDefined(
      match.tournamentLevel,
      defaultLevel,
      'qual'
    )
  )
    .trim()
    .toLowerCase()

  const level =
    rawLevel === 'qual' ||
    rawLevel === 'qualification' ||
    rawLevel === 'qualifications'
      ? 'qual'
      : rawLevel === 'playoff' ||
          rawLevel === 'playoffs' ||
          rawLevel === 'elim' ||
          rawLevel === 'elimination'
        ? 'playoff'
        : String(defaultLevel || 'qual')
            .trim()
            .toLowerCase() === 'playoff'
          ? 'playoff'
          : 'qual'

  const matchNumber =
    numberOrNull(
      firstDefined(
        match.matchNumber,
        match.match
      )
    ) ?? 0

  const series =
    numberOrNull(
      firstDefined(
        match.series,
        match.seriesNumber
      )
    ) ?? 0

  const compLevel =
    level === 'qual'
      ? 'qm'
      : 'po'

  const redScore =
    numberOrNull(
      firstDefined(
        match.scoreRedFinal,
        match.redScore,
        match.scoreRed
      )
    )

  const blueScore =
    numberOrNull(
      firstDefined(
        match.scoreBlueFinal,
        match.blueScore,
        match.scoreBlue
      )
    )

  let winningAlliance = null

  if (
    redScore !== null &&
    blueScore !== null
  ) {
    if (redScore > blueScore) {
      winningAlliance = 'red'
    } else if (blueScore > redScore) {
      winningAlliance = 'blue'
    } else {
      winningAlliance = ''
    }
  }

  const name =
    level === 'qual'
      ? `Qualification ${matchNumber}`
      : series > 0
        ? `Playoff ${series}-${matchNumber}`
        : `Playoff ${matchNumber}`

  return {
    key:
      `${eventKey}_${level}_${series}_${matchNumber}`,

    name,

    compLevel,

    tournamentLevel: level,

    setNumber: series,

    matchNumber,

    predictedTime:
      firstDefined(
        match.startTime,
        match.predictedTime,
        match.scheduledTime
      ) ?? null,

    actualTime:
      firstDefined(
        match.actualStartTime,
        match.actualTime
      ) ?? null,

    winningAlliance,

    red: {
      teams: teams.red,
      score: redScore
    },

    blue: {
      teams: teams.blue,
      score: blueScore
    }
  }
}

function sendFtcError(
  res,
  error,
  fallback
) {
  console.error(
    fallback,
    error.message
  )

  const status =
    Number.isInteger(error.status)
      ? error.status
      : 500

  if (status === 401) {
    return res.status(401).json({
      error:
        'FIRST rechazó las credenciales de FTC Events API'
    })
  }

  if (status === 404) {
    return res.status(404).json({
      error: fallback
    })
  }

  return res.status(status).json({
    error: fallback,

    details:
      process.env.NODE_ENV === 'production'
        ? undefined
        : error.message
  })
}

// ============================================================
// POSTGRESQL / NEON
// ============================================================

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString:
        process.env.DATABASE_URL,

      ssl:
        process.env.NODE_ENV ===
        'production'
          ? {
              rejectUnauthorized: false
            }
          : false
    })
  : null

const authToken = () =>
  crypto
    .createHash('sha256')
    .update(
      process.env.SCOUTING_PASSWORD || ''
    )
    .digest('hex')

const requireSyncAuth = (
  req,
  res,
  next
) => {
  const received =
    req.headers.authorization?.replace(
      /^Bearer\s+/i,
      ''
    ) || ''

  if (
    !process.env.SCOUTING_PASSWORD ||
    received !== authToken()
  ) {
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

  console.log(
    'Base de datos Quantum FTC lista.'
  )
}

initializeDatabase().catch((error) =>
  console.error(
    'Error inicializando PostgreSQL:',
    error
  )
)

// ============================================================
// ROOT
// ============================================================

app.get('/', (req, res) => {
  res.json({
    message:
      'Quantum FTC Scouting API funcionando',

    source:
      'FIRST FTC Events API',

    ftcApiConfigured:
      ftcCredentialsConfigured()
  })
})

// ============================================================
// LOGIN
// ============================================================

app.post(
  '/api/auth/login',
  (req, res) => {
    const { password } = req.body

    const correctPassword =
      process.env.SCOUTING_PASSWORD

    if (!correctPassword) {
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
  }
)

// ============================================================
// INFORMACIÓN DE TEMPORADA
// ============================================================

app.get(
  '/api/season/:year',
  async (req, res) => {
    const year = Number(req.params.year)

    try {
      const data =
        await ftcFetch(`/${year}`)

      res.json({
        year,

        gameName:
          data.gameName ?? null,

        eventCount:
          data.eventCount ?? 0,

        teamCount:
          data.teamCount ?? 0,

        kickoff:
          data.kickoff ?? null,

        rookieStart:
          data.rookieStart ?? null
      })
    } catch (error) {
      sendFtcError(
        res,
        error,
        'No se pudo obtener la temporada'
      )
    }
  }
)

// ============================================================
// EVENTOS DE UNA TEMPORADA
// ============================================================

app.get(
  '/api/events/:year',
  async (req, res) => {
    const year = Number(req.params.year)

    try {
      const data =
        await ftcFetch(
          `/${year}/events`
        )

      const events =
        Array.isArray(data.events)
          ? data.events
          : []

      const formattedEvents =
        events
          .map((event) =>
            normalizeEvent(
              event,
              year
            )
          )
          .filter(
            (event) =>
              event.eventCode
          )
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
      sendFtcError(
        res,
        error,
        'No se pudieron obtener los eventos'
      )
    }
  }
)

// ============================================================
// INFORMACIÓN GENERAL DE UN EVENTO
// ============================================================

app.get(
  '/api/event/:eventKey',
  async (req, res) => {
    const parsed = parseEventKey(
      req.params.eventKey
    )

    if (!parsed) {
      return res.status(400).json({
        error: 'Event key FTC inválido'
      })
    }

    const {
      season,
      eventCode
    } = parsed

    try {
      const event =
        await findEventFromSeasonList(
          season,
          eventCode
        )

      if (!event) {
        return res.status(404).json({
          error: 'Evento no encontrado',
          eventCode,
          season
        })
      }

      return res.json(
        normalizeEvent(
          event,
          season
        )
      )
    } catch (error) {
      sendFtcError(
        res,
        error,
        'No se pudo obtener el evento'
      )
    }
  }
)

// ============================================================
// DEBUG DE EVENTOS
// ============================================================

app.get(
  '/api/debug/events/:year',
  async (req, res) => {
    const year = Number(req.params.year)

    try {
      const data =
        await ftcFetch(
          `/${year}/events`
        )

      const events =
        Array.isArray(data.events)
          ? data.events
          : []

      const mexicoEvents =
        events.filter((event) =>
          JSON.stringify(event)
            .toLowerCase()
            .includes('mexico')
        )

      res.json(mexicoEvents)
    } catch (error) {
      sendFtcError(
        res,
        error,
        'No se pudieron obtener los eventos originales'
      )
    }
  }
)

// ============================================================
// INFORMACIÓN GENERAL DE UN EQUIPO
// ============================================================

app.get(
  '/api/team/:teamNumber',
  async (req, res) => {
    const teamNumber =
      Number(req.params.teamNumber)

    const requestedYear =
      Number(req.query.year)

    let season =       Number.isInteger(requestedYear) &&
      requestedYear >= 2019
        ? requestedYear
        : null

    try {
      if (!season) {
        const apiInfo =
          await ftcFetch('')

        season =
          numberOrNull(
            apiInfo.currentSeason
          ) ||
          numberOrNull(
            apiInfo.maxSeason
          ) ||
          new Date().getFullYear()
      }

      const data =
        await ftcFetch(
          `/${season}/teams?teamNumber=${teamNumber}`
        )

      const team =
        data.teams?.[0]

      if (!team) {
        return res.status(404).json({
          error:
            'No se pudo encontrar el equipo'
        })
      }

      res.json({
        ...normalizeTeam(team),
        season
      })
    } catch (error) {
      sendFtcError(
        res,
        error,
        'No se pudo obtener el equipo'
      )
    }
  }
)

// ============================================================
// EVENTOS DE UN EQUIPO
// ============================================================

app.get(
  '/api/team/:teamNumber/events/:year',
  async (req, res) => {
    const teamNumber =
      Number(req.params.teamNumber)

    const year =
      Number(req.params.year)

    try {
      const data =
        await ftcFetch(
          `/${year}/events?teamNumber=${teamNumber}`
        )

      const events =
        Array.isArray(data.events)
          ? data.events
          : []

      res.json(
        events
          .map((event) =>
            normalizeEvent(
              event,
              year
            )
          )
          .sort((a, b) => {
            if (!a.startDate) return 1
            if (!b.startDate) return -1

            return (
              new Date(a.startDate) -
              new Date(b.startDate)
            )
          })
      )
    } catch (error) {
      sendFtcError(
        res,
        error,
        'No se pudieron obtener los eventos del equipo'
      )
    }
  }
)

// ============================================================
// EQUIPOS DE UN EVENTO
// ============================================================

app.get(
  '/api/event/:eventKey/teams',
  async (req, res) => {
    const parsed =
      parseEventKey(
        req.params.eventKey
      )

    if (!parsed) {
      return res.status(400).json({
        error:
          'Event key FTC inválido'
      })
    }

    const {
      season,
      eventCode
    } = parsed

    try {
      const event =
        await findEventFromSeasonList(
          season,
          eventCode
        )

      if (!event) {
        return res.status(404).json({
          error: 'Evento no encontrado',
          season,
          eventCode
        })
      }

      let teamsData = {
        teams: []
      }

      let rankingsData = {
        rankings: []
      }

      try {
        teamsData =
          await ftcFetch(
            `/${season}/teams?eventCode=${encodeURIComponent(
              eventCode
            )}&excludeNonCompeting=true`
          )
      } catch (error) {
        if (error.status !== 404) {
          throw error
        }

        console.warn(
          `FIRST no devolvió equipos para ${season}-${eventCode}: ${error.message}`
        )
      }

      try {
        rankingsData =
          await ftcFetch(
            `/${season}/rankings/${encodeURIComponent(
              eventCode
            )}`
          )
      } catch (error) {
        if (error.status !== 404) {
          console.warn(
            `No se pudo obtener el ranking de ${season}-${eventCode}: ${error.message}`
          )
        }
      }

      const teams =
        Array.isArray(teamsData.teams)
          ? teamsData.teams
          : []

      const rankings =
        Array.isArray(
          rankingsData.rankings
        )
          ? rankingsData.rankings.map(
              normalizeRanking
            )
          : []

      const rankingMap =
        new Map(
          rankings.map(
            (ranking) => [
              Number(
                ranking.teamNumber
              ),
              ranking
            ]
          )
        )

      const formattedTeams =
        teams
          .map((team) => {
            const normalized =
              normalizeTeam(team)

            const ranking =
              rankingMap.get(
                Number(
                  normalized.teamNumber
                )
              )

            return {
              ...normalized,

              rank:
                ranking?.rank ??
                null,

              record:
                ranking?.record ?? {
                  wins: 0,
                  losses: 0,
                  ties: 0
                },

              matchesPlayed:
                ranking?.matchesPlayed ??
                0,

              rankingPoints:
                ranking?.rankingPoints ??
                null,

              qualifyingPoints:
                ranking?.qualifyingPoints ??
                null,

              opr: null,
              dpr: null,
              ccwm: null,
              epa: null,
              epaRank: null,
              averageOpr: null,
              averageOprYear: null
            }
          })
          .sort(
            (a, b) =>
              a.teamNumber -
              b.teamNumber
          )

      return res.json(
        formattedTeams
      )
    } catch (error) {
      sendFtcError(
        res,
        error,
        'No se pudieron obtener los equipos del evento'
      )
    }
  }
)

// ============================================================
// RANKINGS
// ============================================================

app.get(
  '/api/event/:eventKey/rankings',
  async (req, res) => {
    const parsed =
      parseEventKey(
        req.params.eventKey
      )

    if (!parsed) {
      return res.status(400).json({
        error:
          'Event key FTC inválido'
      })
    }

    const {
      season,
      eventCode
    } = parsed

    try {
      const data =
        await ftcFetch(
          `/${season}/rankings/${encodeURIComponent(
            eventCode
          )}`
        )

      const rankings =
        Array.isArray(data.rankings)
          ? data.rankings.map(
              normalizeRanking
            )
          : []

      res.json(rankings)
    } catch (error) {
      sendFtcError(
        res,
        error,
        'No se pudo obtener el ranking del evento'
      )
    }
  }
)

// ============================================================
// INFORMACIÓN DEL EQUIPO EN UN EVENTO
// ============================================================

app.get(
  '/api/team/:teamNumber/event/:eventKey',
  async (req, res) => {
    const teamNumber =
      Number(req.params.teamNumber)

    const parsed =
      parseEventKey(
        req.params.eventKey
      )

    if (!parsed) {
      return res.status(400).json({
        error:
          'Event key FTC inválido'
      })
    }

    const {
      season,
      eventCode
    } = parsed

    try {
      const event =
        await findEventFromSeasonList(
          season,
          eventCode
        )

      if (!event) {
        return res.status(404).json({
          error:
            'Evento no encontrado'
        })
      }

      let ranking = null

      try {
        const rankingData =
          await ftcFetch(
            `/${season}/rankings/${encodeURIComponent(
              eventCode
            )}?teamNumber=${teamNumber}`
          )

        if (
          Array.isArray(
            rankingData.rankings
          ) &&
          rankingData.rankings.length > 0
        ) {
          ranking =
            normalizeRanking(
              rankingData.rankings[0]
            )
        }
      } catch (error) {
        if (error.status !== 404) {
          console.warn(
            `No se pudo obtener el ranking del equipo ${teamNumber}: ${error.message}`
          )
        }
      }

      res.json({
        teamNumber,

        event:
          normalizeEvent(
            event,
            season
          ),

        stats: {
          rank:
            ranking?.rank ?? null,

          record:
            ranking?.record ?? {
              wins: 0,
              losses: 0,
              ties: 0
            },

          matchesPlayed:
            ranking?.matchesPlayed ??
            0,

          rankingPoints:
            ranking?.rankingPoints ??
            null,

          qualifyingPoints:
            ranking?.qualifyingPoints ??
            null,

          opr: null,
          dpr: null,
          ccwm: null
        }
      })
    } catch (error) {
      sendFtcError(
        res,
        error,
        'No se pudieron obtener los datos del equipo en el evento'
      )
    }
  }
)

// ============================================================
// MATCHES / HYBRID SCHEDULE
// ============================================================

async function getHybridSchedule(
  season,
  eventCode,
  level
) {
  const data =
    await ftcFetch(
      `/${season}/schedule/${encodeURIComponent(
        eventCode
      )}/${level}/hybrid`
    )

  return Array.isArray(data.schedule)
    ? data.schedule
    : []
}

app.get(
  '/api/event/:eventKey/matches',
  async (req, res) => {
    const eventKey =
      req.params.eventKey

    const parsed =
      parseEventKey(eventKey)

    if (!parsed) {
      return res.status(400).json({
        error:
          'Event key FTC inválido'
      })
    }

    const {
      season,
      eventCode
    } = parsed

    try {
      const [
        qualificationMatches,
        playoffMatches
      ] = await Promise.all([
        getHybridSchedule(
  season,
  eventCode,
  'qual'
).catch(() => []),

getHybridSchedule(
  season,
  eventCode,
  'playoff'
).catch(() => [])
      ])

      const formatted = [
        ...qualificationMatches.map(
          (match) =>
            normalizeMatch(
              match,
              eventKey,
              'qual'
            )
        ),

        ...playoffMatches.map(
          (match) =>
            normalizeMatch(
              match,
              eventKey,
              'playoff'
            )
        )
      ]

      formatted.sort((a, b) => {
        const levelA =
          a.tournamentLevel ===
          'qual'
            ? 1
            : 2

        const levelB =
          b.tournamentLevel ===
          'qual'
            ? 1
            : 2

        if (levelA !== levelB) {
          return levelA - levelB
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

      res.json(formatted)
    } catch (error) {
      sendFtcError(
        res,
        error,
        'No se pudieron obtener los matches del evento'
      )
    }
  }
)

// ============================================================
// MATCHES DE UN EQUIPO EN UN EVENTO
// ============================================================

app.get(
  '/api/team/:teamNumber/event/:eventKey/matches',
  async (req, res) => {
    const teamNumber =
      Number(req.params.teamNumber)

    const eventKey =
      req.params.eventKey

    const parsed =
      parseEventKey(eventKey)

    if (!parsed) {
      return res.status(400).json({
        error:
          'Event key FTC inválido'
      })
    }

    const {
      season,
      eventCode
    } = parsed

    try {
      const [
        qualificationMatches,
        playoffMatches
      ] = await Promise.all([
        getHybridSchedule(
          season,
          eventCode,
          'qual'
        ).catch(() => []),

        getHybridSchedule(
          season,
          eventCode,
          'playoff'
        ).catch(() => [])
      ])

      const matches = [
        ...qualificationMatches.map(
          (match) =>
            normalizeMatch(
              match,
              eventKey,
              'qual'
            )
        ),

        ...playoffMatches.map(
          (match) =>
            normalizeMatch(
              match,
              eventKey,
              'playoff'
            )
        )
      ]
        .filter((match) =>
          [
            ...match.red.teams,
            ...match.blue.teams
          ].includes(teamNumber)
        )
        .sort((a, b) => {
          const levelA =
            a.tournamentLevel === 'qual'
              ? 1
              : 2

          const levelB =
            b.tournamentLevel === 'qual'
              ? 1
              : 2

          if (levelA !== levelB) {
            return levelA - levelB
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

      res.json(matches)
    } catch (error) {
      sendFtcError(
        res,
        error,
        'No se pudieron obtener los matches del equipo'
      )
    }
  }
)

// ============================================================
// PREMIOS DE UN EVENTO
// ============================================================

app.get(
  '/api/event/:eventKey/awards',
  async (req, res) => {
    const parsed =
      parseEventKey(
        req.params.eventKey
      )

    if (!parsed) {
      return res.status(400).json({
        error:
          'Event key FTC inválido'
      })
    }

    const {
      season,
      eventCode
    } = parsed

    try {
      const data =
        await ftcFetch(
          `/${season}/awards/${encodeURIComponent(
            eventCode
          )}`
        )

      res.json(
        Array.isArray(data.awards)
          ? data.awards
          : []
      )
    } catch (error) {
      sendFtcError(
        res,
        error,
        'No se pudieron obtener los premios'
      )
    }
  }
)

// ============================================================
// PREMIOS DE UN EQUIPO EN UN EVENTO
// ============================================================

app.get(
  '/api/team/:teamNumber/event/:eventKey/awards',
  async (req, res) => {
    const teamNumber =
      Number(req.params.teamNumber)

    const parsed =
      parseEventKey(
        req.params.eventKey
      )

    if (!parsed) {
      return res.status(400).json({
        error:
          'Event key FTC inválido'
      })
    }

    const {
      season,
      eventCode
    } = parsed

    try {
      const data =
        await ftcFetch(
          `/${season}/awards/${encodeURIComponent(
            eventCode
          )}?teamNumber=${teamNumber}`
        )

      res.json(
        Array.isArray(data.awards)
          ? data.awards
          : []
      )
    } catch (error) {
      sendFtcError(
        res,
        error,
        'No se pudieron obtener los premios del equipo'
      )
    }
  }
)

// ============================================================
// PREMIOS DE UN EQUIPO EN UNA TEMPORADA
// ============================================================

app.get(
  '/api/team/:teamNumber/awards/:year',
  async (req, res) => {
    const teamNumber =
      Number(req.params.teamNumber)

    const year =
      Number(req.params.year)

    try {
      const data =
        await ftcFetch(
          `/${year}/awards/${teamNumber}`
        )

      res.json(
        Array.isArray(data.awards)
          ? data.awards
          : []
      )
    } catch (error) {
      sendFtcError(
        res,
        error,
        'No se pudieron obtener los premios de la temporada'
      )
    }
  }
)

// ============================================================
// ALIANZAS
// ============================================================

app.get(
  '/api/event/:eventKey/alliances',
  async (req, res) => {
    const parsed =
      parseEventKey(
        req.params.eventKey
      )

    if (!parsed) {
      return res.status(400).json({
        error:
          'Event key FTC inválido'
      })
    }

    const {
      season,
      eventCode
    } = parsed

    try {
      const data =
        await ftcFetch(
          `/${season}/alliances/${encodeURIComponent(
            eventCode
          )}`
        )

      res.json(
        Array.isArray(data.alliances)
          ? data.alliances
          : []
      )
    } catch (error) {
      sendFtcError(
        res,
        error,
        'No se pudieron obtener las alianzas'
      )
    }
  }
)

// ============================================================
// SCORE DETAILS
// ============================================================

app.get(
  '/api/event/:eventKey/scores/:level',
  async (req, res) => {
    const parsed =
      parseEventKey(
        req.params.eventKey
      )

    if (!parsed) {
      return res.status(400).json({
        error:
          'Event key FTC inválido'
      })
    }

    const level =
      req.params.level

    if (
      level !== 'qual' &&
      level !== 'playoff'
    ) {
      return res.status(400).json({
        error:
          'El nivel debe ser qual o playoff'
      })
    }

    const {
      season,
      eventCode
    } = parsed

    try {
      const data =
        await ftcFetch(
          `/${season}/scores/${encodeURIComponent(
            eventCode
          )}/${level}`
        )

      res.json(
        Array.isArray(
          data.matchScores
        )
          ? data.matchScores
          : []
      )
    } catch (error) {
      sendFtcError(
        res,
        error,
        'No se pudieron obtener los detalles de puntuación'
      )
    }
  }
)

// ============================================================
// SINCRONIZACIÓN MULTIUSUARIO
// ============================================================

app.get(
  '/api/sync',
  requireSyncAuth,
  async (req, res) => {
    if (!pool) {
      return res.status(503).json({
        error:
          'DATABASE_URL no está configurada'
      })
    }

    try {
      const [
        scoutingResult,
        pitResult,
        favoritesResult
      ] = await Promise.all([
        pool.query(`
          SELECT payload
          FROM scouting_records
          ORDER BY created_at DESC
        `),

        pool.query(`
          SELECT payload
          FROM pit_records
          ORDER BY updated_at DESC
        `),

        pool.query(`
          SELECT team_number
          FROM favorite_teams
          ORDER BY team_number
        `)
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
            (row) =>
              Number(
                row.team_number
              )
          ),

        syncedAt:
          new Date().toISOString()
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
  }
)

// ============================================================
// GUARDAR MATCH SCOUTING
// ============================================================

app.post(
  '/api/sync/scouting',
  requireSyncAuth,
  async (req, res) => {
    if (!pool) {
      return res.status(503).json({
        error:
          'DATABASE_URL no está configurada'
      })
    }

    try {
      const record = {
        ...req.body
      }

      record.id = String(
        record.id ||
          crypto.randomUUID()
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

// ============================================================
// ELIMINAR MATCH SCOUTING
// ============================================================

app.delete(
  '/api/sync/scouting/:id',
  requireSyncAuth,
  async (req, res) => {
    if (!pool) {
      return res.status(503).json({
        error:
          'DATABASE_URL no está configurada'
      })
    }

    try {
      await pool.query(
        `
          DELETE FROM scouting_records
          WHERE id = $1
        `,
        [
          String(req.params.id)
        ]
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

// ============================================================
// GUARDAR / ACTUALIZAR PIT SCOUTING
// ============================================================

app.put(
  '/api/sync/pit',
  requireSyncAuth,
  async (req, res) => {
    if (!pool) {
      return res.status(503).json({
        error:
          'DATABASE_URL no está configurada'
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
        record.id ||
          crypto.randomUUID()
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
          Number(
            record.teamNumber
          ),
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

// ============================================================
// ELIMINAR PIT SCOUTING
// ============================================================

app.delete(
  '/api/sync/pit/:id',
  requireSyncAuth,
  async (req, res) => {
    if (!pool) {
      return res.status(503).json({
        error:
          'DATABASE_URL no está configurada'
      })
    }

    try {
      await pool.query(
        `
          DELETE FROM pit_records
          WHERE id = $1
        `,
        [
          String(req.params.id)
        ]
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

// ============================================================
// FAVORITOS
// ============================================================

app.put(
  '/api/sync/favorites',
  requireSyncAuth,
  async (req, res) => {
    if (!pool) {
      return res.status(503).json({
        error:
          'DATABASE_URL no está configurada'
      })
    }

    const client =
      await pool.connect()

    try {
      const favorites =
        Array.isArray(
          req.body?.favorites
        )
          ? [
              ...new Set(
                req.body.favorites
                  .map(Number)
                  .filter(
                    Number.isFinite
                  )
              )
            ]
          : []

      await client.query(
        'BEGIN'
      )

      await client.query(
        'DELETE FROM favorite_teams'
      )

      for (
        const teamNumber
        of favorites
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

      await client.query(
        'COMMIT'
      )

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

// ============================================================
// HEALTH CHECK
// ============================================================

app.get(
  '/api/health',
  async (req, res) => {
    let database = false
    let firstApi = false
    let currentSeason = null

    if (pool) {
      try {
        await pool.query(
          'SELECT 1'
        )

        database = true
      } catch (error) {
        console.error(
          'Health check PostgreSQL:',
          error
        )
      }
    }

    if (
      ftcCredentialsConfigured()
    ) {
      try {
        const data =
          await ftcFetch('')

        firstApi = true

        currentSeason =
          data.currentSeason ??
          data.maxSeason ??
          null
      } catch (error) {
        console.error(
          'Health check FIRST FTC API:',
          error.message
        )
      }
    }

    res.json({
      ok: true,

      api: true,

      firstApi,

      ftcCredentialsConfigured:
        ftcCredentialsConfigured(),

      currentSeason,

      database,

      multiuserSync:
        database,

      source:
        'FIRST FTC Events API',

      time:
        new Date().toISOString()
    })
  }
)

// ============================================================
// 404
// ============================================================

app.use(
  '/api',
  (req, res) => {
    res.status(404).json({
      error:
        'Ruta de API no encontrada'
    })
  }
)

// ============================================================
// INICIAR SERVIDOR
// ============================================================

app.listen(
  PORT,
  () => {
    console.log(
      `Quantum FTC Scouting API corriendo en http://localhost:${PORT}`
    )

    if (
      ftcCredentialsConfigured()
    ) {
      console.log(
        'FIRST FTC Events API: credenciales configuradas'
      )
    } else {
      console.log(
        'FIRST FTC Events API: faltan FTC_API_USERNAME / FTC_API_TOKEN'
      )
    }

    if (pool) {
      console.log(
        'Sincronización multiusuario: PostgreSQL configurado'
      )
    } else {
      console.log(
        'Sincronización multiusuario: modo local (falta DATABASE_URL)'
      )
    }
  }
)

// cd server
// node index.js