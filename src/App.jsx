import { useEffect, useMemo, useState } from 'react'
import './App.css'

const FIRST_FTC_YEAR = 2005
// FTC identifica cada temporada por el año en que inicia.
// Ejemplo: la temporada 2025-2026 se consulta como 2025 en la FIRST API.
const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_FTC_SEASON = new Date().getMonth() >= 6 ? CURRENT_YEAR : CURRENT_YEAR - 1
const LATEST_FTC_YEAR = CURRENT_FTC_SEASON

const eventMetricsCache = new Map()
const previousSeasonAverageOprCache = new Map()

const formatSeasonYears = (seasonYear) => {
  const startYear = Number(seasonYear)
  return `${startYear} - ${startYear + 1}`
}

// FIRST es la fuente principal. Esta lista solo se usa como respaldo
// cuando la API no devuelve gameName para temporadas históricas.
const FTC_GAME_NAME_FALLBACKS = {
  2025: 'DECODE',
  2024: 'INTO THE DEEP',
  2023: 'CENTERSTAGE',
  2022: 'POWERPLAY',
  2021: 'FREIGHT FRENZY',
  2020: 'ULTIMATE GOAL',
  2019: 'SKYSTONE',
  2018: 'ROVER RUCKUS',
  2017: 'RELIC RECOVERY',
  2016: 'VELOCITY VORTEX',
  2015: 'FIRST RES-Q',
  2014: 'CASCADE EFFECT',
  2013: 'BLOCK PARTY!',
  2012: 'RING IT UP!',
  2011: 'BOWLED OVER!',
  2010: 'GET OVER IT!',
  2009: 'HOT SHOT!',
  2008: 'FACE OFF!',
  2007: 'QUAD QUANDARY',
  2006: 'HANGIN-A-ROUND',
  2005: 'HALF-PIPE HUSTLE'
}

const SCOUTING_STORAGE_KEY = 'quantum-scouting-records'
const PIT_STORAGE_KEY = 'quantum-pit-scouting-records'
const FAVORITES_STORAGE_KEY = 'quantum-favorite-teams'
const AUTH_STORAGE_KEY = 'quantum-scouting-authenticated'
const AUTH_TOKEN_STORAGE_KEY = 'quantum-scouting-auth-token'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

const QUANTUM_FTC_TEAMS = [
  {
    number: 24831,
    primary: '#F05AA6',
    secondary: '#7B3FA1'
  },
  {
    number: 28076,
    primary: '#45B649',
    secondary: '#7B3FA1'
  }
]

const getQuantumTeam = (teamNumber) =>
  QUANTUM_FTC_TEAMS.find(
    (team) => Number(team.number) === Number(teamNumber)
  ) || null

const quantumTeamStyle = (teamNumber, strong = false) => {
  const team = getQuantumTeam(teamNumber)
  if (!team) return undefined

  const alpha = strong ? '30' : '18'
  return {
    background: `linear-gradient(90deg, ${team.primary}${alpha}, transparent 72%)`,
    boxShadow: `inset 4px 0 0 ${team.primary}`
  }
}

const quantumTeamTextStyle = (teamNumber) => {
  const team = getQuantumTeam(teamNumber)
  return team ? { color: team.primary, fontWeight: 800 } : undefined
}

const quantumTeamLabel = (item) => {
  const team = getQuantumTeam(item.teamNumber)
  const marker = team ? '★ ' : ''
  return `${marker}${item.teamNumber} — ${item.name || 'Equipo FTC'}`
}

const readLocal = (key, fallback) => {
  try {
    const saved = localStorage.getItem(key)
    return saved ? JSON.parse(saved) : fallback
  } catch {
    return fallback
  }
}

const average = (items, field) => {
  if (!items.length) return null
  const values = items
    .map((item) => Number(item[field]))
    .filter((value) => Number.isFinite(value))
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => sessionStorage.getItem(AUTH_STORAGE_KEY) === 'true' && Boolean(sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY))
  )
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const [year, setYear] = useState(String(CURRENT_FTC_SEASON))
  const [seasonNames, setSeasonNames] = useState({})
  const [view, setView] = useState('home')
  const [viewHistory, setViewHistory] = useState([])

  const seasons = Array.from(
    { length: LATEST_FTC_YEAR - FIRST_FTC_YEAR + 1 },
    (_, index) => LATEST_FTC_YEAR - index
  )

  const [teamInput, setTeamInput] = useState('24831')
  const [team, setTeam] = useState(null)
  const [teamEvents, setTeamEvents] = useState([])
  const [teamMatchHistory, setTeamMatchHistory] = useState([])
  const [loading, setLoading] = useState(false)

  const [events, setEvents] = useState([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [eventSearch, setEventSearch] = useState('')
  const [selectedEvent, setSelectedEvent] = useState(null)

  const [eventTeams, setEventTeams] = useState([])
  const [teamsLoading, setTeamsLoading] = useState(false)
  const [teamSearch, setTeamSearch] = useState('')
  const [teamSort, setTeamSort] = useState({ key: 'rank', direction: 'asc' })
  const [syncStatus, setSyncStatus] = useState('local')

  const [matches, setMatches] = useState([])
  const [matchesLoading, setMatchesLoading] = useState(false)
  const [matchSearch, setMatchSearch] = useState('')
  const [selectedMatch, setSelectedMatch] = useState(null)

  const [dashboardLoading, setDashboardLoading] = useState(false)

  const [compareEventKey, setCompareEventKey] = useState('')
  const [compareTeams, setCompareTeams] = useState([])
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareTeamNumbers, setCompareTeamNumbers] = useState(['', '', '', ''])

  const [allianceEventKey, setAllianceEventKey] = useState('')
  const [allianceTeams, setAllianceTeams] = useState([])
  const [redAlliance, setRedAlliance] = useState(['', ''])
  const [blueAlliance, setBlueAlliance] = useState(['', ''])

  const [pickEventKey, setPickEventKey] = useState('')
  const [pickTeams, setPickTeams] = useState([])
  const [pickSort, setPickSort] = useState('rank')
  const [pickSearch, setPickSearch] = useState('')

  const [liveEventKey, setLiveEventKey] = useState('')
  const [liveTeams, setLiveTeams] = useState([])
  const [liveMatches, setLiveMatches] = useState([])
  const [liveLoading, setLiveLoading] = useState(false)

  const [favorites, setFavorites] = useState(() =>
    readLocal(FAVORITES_STORAGE_KEY, [])
  )

  const [scoutingRecords, setScoutingRecords] = useState(() =>
    readLocal(SCOUTING_STORAGE_KEY, [])
  )

  const [pitRecords, setPitRecords] = useState(() =>
    readLocal(PIT_STORAGE_KEY, [])
  )

  const [scoutingForm, setScoutingForm] = useState({
    eventKey: '',
    matchKey: '',
    match: '',
    teamNumber: '',
    autoScore: '',
    teleopScore: '',
    endgameScore: '',
    cycles: '',
    defense: '0',
    consistency: '3',
    fouls: '0',
    breakdown: false,
    notes: ''
  })

  const [pitForm, setPitForm] = useState({
    eventKey: '',
    teamNumber: '',
    drivetrain: '',
    weight: '',
    width: '',
    length: '',
    height: '',
    mechanisms: '',
    capabilities: '',
    strategy: '',
    notes: ''
  })

  const [scoutingTab, setScoutingTab] = useState('match')

  useEffect(() => {
    localStorage.setItem(SCOUTING_STORAGE_KEY, JSON.stringify(scoutingRecords))
  }, [scoutingRecords])

  useEffect(() => {
    localStorage.setItem(PIT_STORAGE_KEY, JSON.stringify(pitRecords))
  }, [pitRecords])

  useEffect(() => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites))
  }, [favorites])

  const syncHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || ''}`
  })

  const refreshSharedData = async ({ silent = true } = {}) => {
    if (!isAuthenticated) return
    try {
      const response = await fetch(`${API_BASE_URL}/api/sync`, { headers: syncHeaders() })
      if (!response.ok) throw new Error('Sync no disponible')
      const data = await response.json()
      setScoutingRecords(Array.isArray(data.scoutingRecords) ? data.scoutingRecords : [])
      setPitRecords(Array.isArray(data.pitRecords) ? data.pitRecords : [])
      setFavorites(Array.isArray(data.favorites) ? data.favorites.map(Number) : [])
      setSyncStatus('synced')
    } catch (error) {
      if (!silent) console.error(error)
      setSyncStatus('local')
    }
  }

  useEffect(() => {
    if (!isAuthenticated) return
    refreshSharedData({ silent: false })
    const timer = window.setInterval(() => refreshSharedData(), 10000)
    return () => window.clearInterval(timer)
  }, [isAuthenticated])


  useEffect(() => {
    if (!isAuthenticated) return

    let cancelled = false

    const loadSeasonNames = async () => {
      const entries = await Promise.all(
        seasons.map(async (seasonYear) => {
          try {
            const response = await fetch(`${API_BASE_URL}/api/season/${seasonYear}`)
            if (!response.ok) return [seasonYear, '']
            const data = await response.json()
            return [seasonYear, String(data?.gameName || '').trim()]
          } catch {
            return [seasonYear, '']
          }
        })
      )

      if (!cancelled) {
        setSeasonNames(Object.fromEntries(entries))
      }
    }

    loadSeasonNames()

    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  const formatSeasonLabel = (seasonYear) => {
    const startYear = Number(seasonYear)
    const years = formatSeasonYears(startYear)
    const apiGameName = String(seasonNames[startYear] || '').trim()
    const gameName = apiGameName || FTC_GAME_NAME_FALLBACKS[startYear] || ''
    return gameName ? `${years} ${gameName}` : years
  }

  useEffect(() => {
    if (!isAuthenticated) return

    const loadEvents = async () => {
      setLoadingEvents(true)
      try {
        const response = await fetch(`${API_BASE_URL}/api/events/${year}`)
        if (!response.ok) throw new Error('No se pudieron cargar los eventos')
        const data = await response.json()
        setEvents(Array.isArray(data) ? data : [])
      } catch (error) {
        console.error(error)
        setEvents([])
      } finally {
        setLoadingEvents(false)
      }
    }
    loadEvents()
  }, [year, isAuthenticated])

  const handleLogin = async (event) => {
    event.preventDefault()
    setLoginError('')

    if (!loginPassword.trim()) {
      setLoginError('Escribe la contraseña.')
      return
    }

    setLoginLoading(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: loginPassword })
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Contraseña incorrecta')
      }

      sessionStorage.setItem(AUTH_STORAGE_KEY, 'true')
      sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, data.token)
      setIsAuthenticated(true)
      setLoginPassword('')
      setLoginError('')
    } catch (error) {
      console.error(error)
      setLoginError(error.message || 'No se pudo iniciar sesión.')
    } finally {
      setLoginLoading(false)
    }
  }

  const navigateTo = (newView) => {
    if (newView === view) return
    setViewHistory((history) => [...history, view])
    setView(newView)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goBack = () => {
    setViewHistory((history) => {
      if (!history.length) {
        setView('home')
        return []
      }
      setView(history[history.length - 1])
      return history.slice(0, -1)
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goHome = () => navigateTo('home')
  const goEvents = () => navigateTo('events')
  const goCompare = () => navigateTo('compare')
  const goScouting = () => navigateTo('scouting')
  const goFavorites = () => navigateTo('favorites')
  const goAlliances = () => navigateTo('alliances')
  const goPickList = () => navigateTo('pick-list')
  const goLive = () => navigateTo('live')

  const changeYear = (newYear) => {
    setYear(newYear)
    setTeam(null)
    setTeamEvents([])
    setTeamMatchHistory([])
    setSelectedEvent(null)
    setEventTeams([])
    setMatches([])
    setSelectedMatch(null)
    setCompareEventKey('')
    setCompareTeams([])
    setCompareTeamNumbers(['', '', '', ''])
    setAllianceEventKey('')
    setAllianceTeams([])
    setRedAlliance(['', '', ''])
    setBlueAlliance(['', '', ''])
    setPickEventKey('')
    setPickTeams([])
    setLiveEventKey('')
    setLiveTeams([])
    setLiveMatches([])
    setEventSearch('')
    setTeamSearch('')
    setMatchSearch('')
    setView('home')
    setViewHistory([])
  }

  // Calcula OPR, DPR y CCWM automáticamente usando los scores oficiales de los matches.
  // No requiere scouting manual: toma únicamente los resultados que entrega el backend/FIRST.
  const calculateEventMetrics = (teams, eventMatches) => {
    const teamNumbers = teams.map((team) => Number(team.teamNumber))
    const indexByTeam = new Map(teamNumbers.map((number, index) => [number, index]))
    const n = teamNumbers.length

    if (!n) return teams

    const rows = []
    const offenseScores = []
    const defenseScores = []

    for (const match of eventMatches) {
      const redTeams = (match.red?.teams || []).map(Number).filter((number) => indexByTeam.has(number))
      const blueTeams = (match.blue?.teams || []).map(Number).filter((number) => indexByTeam.has(number))
      const redScore = Number(match.red?.score)
      const blueScore = Number(match.blue?.score)

      if (!redTeams.length || !blueTeams.length) continue
      if (!Number.isFinite(redScore) || !Number.isFinite(blueScore) || redScore < 0 || blueScore < 0) continue

      const redRow = Array(n).fill(0)
      const blueRow = Array(n).fill(0)
      redTeams.forEach((number) => { redRow[indexByTeam.get(number)] = 1 })
      blueTeams.forEach((number) => { blueRow[indexByTeam.get(number)] = 1 })

      rows.push(redRow, blueRow)
      offenseScores.push(redScore, blueScore)
      defenseScores.push(blueScore, redScore)
    }

    if (!rows.length) return teams

    // Resuelve las ecuaciones normales (AᵀA)x=Aᵀb con una pequeña regularización
    // para que eventos con pocos matches también puedan mostrar una estimación estable.
    const solveLeastSquares = (scores) => {
      const matrix = Array.from({ length: n }, () => Array(n).fill(0))
      const vector = Array(n).fill(0)

      for (let r = 0; r < rows.length; r += 1) {
        const row = rows[r]
        for (let i = 0; i < n; i += 1) {
          if (!row[i]) continue
          vector[i] += row[i] * scores[r]
          for (let j = 0; j < n; j += 1) {
            if (row[j]) matrix[i][j] += row[i] * row[j]
          }
        }
      }

      for (let i = 0; i < n; i += 1) matrix[i][i] += 1e-8

      // Eliminación Gauss-Jordan con pivoteo parcial.
      const augmented = matrix.map((row, i) => [...row, vector[i]])
      for (let col = 0; col < n; col += 1) {
        let pivot = col
        for (let row = col + 1; row < n; row += 1) {
          if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivot][col])) pivot = row
        }
        ;[augmented[col], augmented[pivot]] = [augmented[pivot], augmented[col]]

        const divisor = augmented[col][col]
        if (Math.abs(divisor) < 1e-12) continue
        for (let j = col; j <= n; j += 1) augmented[col][j] /= divisor

        for (let row = 0; row < n; row += 1) {
          if (row === col) continue
          const factor = augmented[row][col]
          if (!factor) continue
          for (let j = col; j <= n; j += 1) {
            augmented[row][j] -= factor * augmented[col][j]
          }
        }
      }

      return augmented.map((row, i) =>
        Number.isFinite(row[n]) && Math.abs(row[i]) > 1e-12 ? row[n] : null
      )
    }

    const opr = solveLeastSquares(offenseScores)
    const dpr = solveLeastSquares(defenseScores)

    return teams.map((team, index) => ({
      ...team,
      opr: opr[index] ?? team.opr ?? null,
      dpr: dpr[index] ?? team.dpr ?? null,
      ccwm:
        opr[index] !== null && dpr[index] !== null
          ? opr[index] - dpr[index]
          : team.ccwm ?? null
    }))
  }

  const fetchEventTeams = async (eventKey) => {
    if (eventMetricsCache.has(eventKey)) return eventMetricsCache.get(eventKey)

    const request = (async () => {
      const response = await fetch(`${API_BASE_URL}/api/event/${eventKey}/teams`)
      if (!response.ok) throw new Error('No se pudieron obtener los equipos del evento')

      const data = await response.json()
      const teams = Array.isArray(data)
        ? data
        : Array.isArray(data.teams) ? data.teams : []

      try {
        const eventMatches = await fetchEventMatches(eventKey)
        return calculateEventMetrics(teams, eventMatches)
      } catch (error) {
        console.error('No se pudieron calcular métricas automáticas:', error)
        return teams
      }
    })()

    eventMetricsCache.set(eventKey, request)
    try {
      return await request
    } catch (error) {
      eventMetricsCache.delete(eventKey)
      throw error
    }
  }

  const getPreviousSeasonAverageOpr = async (teamNumber, currentSeasonYear) => {
    const previousYear = Number(currentSeasonYear) - 1
    if (previousYear < FIRST_FTC_YEAR) return null

    const cacheKey = `${teamNumber}-${previousYear}`
    if (previousSeasonAverageOprCache.has(cacheKey)) {
      return previousSeasonAverageOprCache.get(cacheKey)
    }

    const request = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/team/${teamNumber}/events/${previousYear}`)
        if (!response.ok) return null

        const data = await response.json()
        const previousEvents = Array.isArray(data)
          ? data
          : Array.isArray(data.events) ? data.events : []
        const oprValues = []

        for (const previousEvent of previousEvents) {
          try {
            const teamsAtEvent = await fetchEventTeams(previousEvent.key)
            const teamAtEvent = teamsAtEvent.find(
              (item) => Number(item.teamNumber) === Number(teamNumber)
            )
            const opr = Number(teamAtEvent?.opr)
            if (Number.isFinite(opr)) oprValues.push(opr)
          } catch (error) {
            console.warn(`No se pudo calcular OPR histórico de ${teamNumber} en ${previousEvent.key}:`, error)
          }
        }

        if (!oprValues.length) return null
        return oprValues.reduce((sum, value) => sum + value, 0) / oprValues.length
      } catch (error) {
        console.warn(`No se pudo calcular el OPR promedio previo de ${teamNumber}:`, error)
        return null
      }
    })()

    previousSeasonAverageOprCache.set(cacheKey, request)
    return request
  }

const fetchEventMatches = async (eventKey) => {
  const response = await fetch(
    `${API_BASE_URL}/api/event/${eventKey}/matches`
  )

  if (!response.ok) {
    throw new Error('No se pudieron obtener los matches del evento')
  }

  const data = await response.json()

  const matchList = Array.isArray(data)
    ? data
    : Array.isArray(data.matches)
      ? data.matches
      : []

  return matchList.map((match) => {
    let name = `Match ${match.matchNumber}`

    if (match.compLevel === 'qm') {
      name = `Qualification ${match.matchNumber}`
    } else if (match.compLevel === 'qf') {
      name = `Quarterfinal ${match.setNumber}-${match.matchNumber}`
    } else if (match.compLevel === 'sf') {
      name = `Semifinal ${match.setNumber}-${match.matchNumber}`
    } else if (match.compLevel === 'f') {
      name = `Final ${match.matchNumber}`
    }

    return {
      ...match,
      name
    }
  })
}

  const searchTeam = async (number = teamInput) => {
    const cleanNumber = String(number).trim()
    if (!cleanNumber) return

    setLoading(true)
    try {
      const [teamResponse, eventsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/team/${cleanNumber}`),
        fetch(`${API_BASE_URL}/api/team/${cleanNumber}/events/${year}`)
      ])

      if (!teamResponse.ok) throw new Error('Equipo no encontrado')
      if (!eventsResponse.ok) {
        throw new Error('No se pudieron obtener los eventos del equipo')
      }

      const teamData = await teamResponse.json()
      const eventsData = await eventsResponse.json()

      const seasonEvents = Array.isArray(eventsData)
        ? eventsData
        : (eventsData.events || [])

      // Igual que en Quantum Scouting FRC: cada evento del historial del equipo
      // muestra su rendimiento en ese evento. fetchEventTeams() ya agrega el
      // ranking/record oficial y calcula OPR, DPR y CCWM desde los matches.
      const enrichedSeasonEvents = await Promise.all(
        seasonEvents.map(async (teamEvent) => {
          try {
            const teamsAtEvent = await fetchEventTeams(teamEvent.key)
            const eventTeam = teamsAtEvent.find(
              (item) => Number(item.teamNumber) === Number(cleanNumber)
            )

            return {
              ...teamEvent,
              stats: eventTeam
                ? {
                    rank: eventTeam.rank ?? null,
                    record: eventTeam.record ?? null,
                    rs: eventTeam.rs ?? null,
                    matchPoints: eventTeam.matchPoints ?? null,
                    basePoints: eventTeam.basePoints ?? null,
                    autoPoints: eventTeam.autoPoints ?? null,
                    opr: eventTeam.opr ?? null,
                    dpr: eventTeam.dpr ?? null,
                    ccwm: eventTeam.ccwm ?? null
                  }
                : null
            }
          } catch (error) {
            console.error(
              `No se pudieron cargar estadísticas de ${teamEvent.key}:`,
              error
            )
            return { ...teamEvent, stats: null }
          }
        })
      )

      setTeam(teamData)
      setTeamEvents(enrichedSeasonEvents)
      setTeamInput(cleanNumber)

      // Cargar el historial de matches del equipo en sus eventos de la temporada.
      // Si un evento futuro todavía no tiene matches, simplemente aporta 0 registros.
      const matchGroups = await Promise.all(
        seasonEvents.map(async (teamEvent) => {
          try {
            const eventMatches = await fetchEventMatches(teamEvent.key)
            return eventMatches
              .filter((match) =>
                [...(match.red?.teams || []), ...(match.blue?.teams || [])]
                  .map(String)
                  .includes(String(cleanNumber))
              )
              .map((match) => ({
                ...match,
                eventKey: teamEvent.key,
                eventName: teamEvent.name
              }))
          } catch {
            return []
          }
        })
      )

      setTeamMatchHistory(matchGroups.flat())

      if (view !== 'home') navigateTo('home')
      else window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      console.error(error)
      setTeam(null)
      setTeamEvents([])
      setTeamMatchHistory([])
      alert('No se pudo obtener la información del equipo.')
    } finally {
      setLoading(false)
    }
  }

  const openEvent = (event) => {
    setSelectedEvent(event)
    navigateTo('event')
  }

  const openTeams = async (event = selectedEvent) => {
    if (!event?.key) return
    setTeamsLoading(true)
    try {
      const teams = await fetchEventTeams(event.key)
      const eventYear = Number(String(event.key).slice(0, 4)) || Number(year)
      const averageOprYear = eventYear - 1
      const teamsWithPreviousOpr = await Promise.all(
        teams.map(async (item) => ({
          ...item,
          averageOpr: await getPreviousSeasonAverageOpr(item.teamNumber, eventYear),
          averageOprYear
        }))
      )
      setSelectedEvent(event)
      setEventTeams(teamsWithPreviousOpr)
      setTeamSearch('')
      navigateTo('teams')
    } catch (error) {
      console.error(error)
      alert('No se pudieron cargar los equipos del evento.')
    } finally {
      setTeamsLoading(false)
    }
  }

  const openMatches = async (event = selectedEvent) => {
    if (!event?.key) return
    setMatchesLoading(true)
    try {
      const eventMatches = await fetchEventMatches(event.key)
      setSelectedEvent(event)
      setMatches(eventMatches)
      setMatchSearch('')
      navigateTo('matches')
    } catch (error) {
      console.error(error)
      alert('No se pudieron cargar los matches del evento.')
    } finally {
      setMatchesLoading(false)
    }
  }

  const openDashboard = async (event = selectedEvent) => {
    if (!event?.key) return
    setDashboardLoading(true)
    try {
      const [teams, eventMatches] = await Promise.all([
        fetchEventTeams(event.key),
        fetchEventMatches(event.key)
      ])
      setSelectedEvent(event)
      setEventTeams(teams)
      setMatches(eventMatches)
      navigateTo('dashboard')
    } catch (error) {
      console.error(error)
      alert('No se pudo cargar el dashboard del evento.')
    } finally {
      setDashboardLoading(false)
    }
  }

  const openTeam = async (teamNumber) => {
    setTeamInput(String(teamNumber))
    await searchTeam(teamNumber)
  }

  const openMatch = (match) => {
    setSelectedMatch(match)
    navigateTo('match-detail')
  }

  const toggleFavorite = async (teamNumber) => {
    const number = Number(teamNumber)
    const next = favorites.includes(number) ? favorites.filter(item => item !== number) : [...favorites, number]
    setFavorites(next)
    try {
      const response = await fetch(`${API_BASE_URL}/api/sync/favorites`, {
        method: 'PUT', headers: syncHeaders(), body: JSON.stringify({ favorites: next })
      })
      if (!response.ok) throw new Error('No se pudieron sincronizar favoritos')
      setSyncStatus('synced')
    } catch (error) {
      console.error(error)
      setSyncStatus('local')
    }
  }

  const isFavorite = (teamNumber) => favorites.includes(Number(teamNumber))

  const loadCompareEvent = async (eventKey) => {
    setCompareEventKey(eventKey)
    setCompareTeams([])
    setCompareTeamNumbers(['', '', '', ''])
    if (!eventKey) return

    setCompareLoading(true)
    try {
      setCompareTeams(await fetchEventTeams(eventKey))
    } catch (error) {
      console.error(error)
      alert('No se pudieron cargar los equipos para comparar.')
    } finally {
      setCompareLoading(false)
    }
  }

  const updateCompareTeam = (index, value) => {
    setCompareTeamNumbers((current) => {
      const copy = [...current]
      copy[index] = value
      return copy
    })
  }

  const selectedCompareTeams = compareTeamNumbers
    .filter(Boolean)
    .map((number) =>
      compareTeams.find(
        (item) => String(item.teamNumber) === String(number)
      )
    )
    .filter(Boolean)

  const loadAllianceEvent = async (eventKey) => {
    setAllianceEventKey(eventKey)
    setAllianceTeams([])
    setRedAlliance(['', '', ''])
    setBlueAlliance(['', '', ''])
    if (!eventKey) return
    try {
      setAllianceTeams(await fetchEventTeams(eventKey))
    } catch (error) {
      console.error(error)
      alert('No se pudieron cargar los equipos del evento.')
    }
  }

  const updateAllianceSlot = (color, index, value) => {
    const setter = color === 'red' ? setRedAlliance : setBlueAlliance
    setter((current) => {
      const copy = [...current]
      copy[index] = value
      return copy
    })
  }

  const loadPickEvent = async (eventKey) => {
    setPickEventKey(eventKey)
    setPickTeams([])
    if (!eventKey) return
    try {
      setPickTeams(await fetchEventTeams(eventKey))
    } catch (error) {
      console.error(error)
      alert('No se pudieron cargar los equipos del evento.')
    }
  }

  const loadLiveEvent = async (eventKey) => {
    setLiveEventKey(eventKey)
    setLiveTeams([])
    setLiveMatches([])
    if (!eventKey) return

    setLiveLoading(true)
    try {
      const [teams, eventMatches] = await Promise.all([
        fetchEventTeams(eventKey),
        fetchEventMatches(eventKey)
      ])
      setLiveTeams(teams)
      setLiveMatches(eventMatches)
    } catch (error) {
      console.error(error)
      alert('No se pudo cargar Live Event.')
    } finally {
      setLiveLoading(false)
    }
  }

  const updateScoutingField = (field, value) => {
    setScoutingForm((current) => ({ ...current, [field]: value }))
  }

  const updatePitField = (field, value) => {
    setPitForm((current) => ({ ...current, [field]: value }))
  }

  const selectedScoutingMatch = matches.find(
    (match) =>
      match.key === scoutingForm.matchKey ||
      match.name === scoutingForm.match
  )

  const matchTeams = selectedScoutingMatch
    ? [
        ...(selectedScoutingMatch.red?.teams || []),
        ...(selectedScoutingMatch.blue?.teams || [])
      ]
    : []

  const scoutingEvent = events.find(
    (event) => event.key === scoutingForm.eventKey
  )

  const scoutingEventTeams =
    selectedEvent?.key === scoutingForm.eventKey ? eventTeams : []

  const scoutingTeamOptions = matchTeams.length
    ? scoutingEventTeams.filter((item) =>
        matchTeams.map(String).includes(String(item.teamNumber))
      )
    : scoutingEventTeams

  const saveScoutingRecord = async (event) => {
    event.preventDefault()

    if (
      !scoutingForm.eventKey ||
      !scoutingForm.match ||
      !scoutingForm.teamNumber
    ) {
      alert('Selecciona evento, match y equipo.')
      return
    }

    const selectedScoutingEvent = events.find(
      (item) => item.key === scoutingForm.eventKey
    )

    const record = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      year,
      eventKey: scoutingForm.eventKey,
      eventName: selectedScoutingEvent?.name || scoutingForm.eventKey,
      matchKey: scoutingForm.matchKey,
      match: scoutingForm.match,
      teamNumber: Number(scoutingForm.teamNumber),
      autoScore: Number(scoutingForm.autoScore) || 0,
      teleopScore: Number(scoutingForm.teleopScore) || 0,
      endgameScore: Number(scoutingForm.endgameScore) || 0,
      cycles: Number(scoutingForm.cycles) || 0,
      defense: Number(scoutingForm.defense),
      consistency: Number(scoutingForm.consistency),
      fouls: Number(scoutingForm.fouls) || 0,
      breakdown: scoutingForm.breakdown,
      notes: scoutingForm.notes.trim()
    }

    setScoutingRecords((current) => [record, ...current])
    try {
      const response = await fetch(`${API_BASE_URL}/api/sync/scouting`, {
        method: 'POST', headers: syncHeaders(), body: JSON.stringify(record)
      })
      if (!response.ok) throw new Error('No se pudo sincronizar el scouting')
      const data = await response.json()
      setScoutingRecords(current => [data.record, ...current.filter(item => String(item.id) !== String(record.id))])
      setSyncStatus('synced')
    } catch (error) {
      console.error(error)
      setSyncStatus('local')
    }

    setScoutingForm((current) => ({
      ...current,
      matchKey: '',
      match: '',
      teamNumber: '',
      autoScore: '',
      teleopScore: '',
      endgameScore: '',
      cycles: '',
      defense: '0',
      consistency: '3',
      fouls: '0',
      breakdown: false,
      notes: ''
    }))

    alert('Scouting guardado.')
  }

  const savePitRecord = async (event) => {
    event.preventDefault()

    if (!pitForm.eventKey || !pitForm.teamNumber) {
      alert('Selecciona evento y equipo.')
      return
    }

    const selectedPitEvent = events.find(
      (item) => item.key === pitForm.eventKey
    )

    const record = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      year,
      eventKey: pitForm.eventKey,
      eventName: selectedPitEvent?.name || pitForm.eventKey,
      teamNumber: Number(pitForm.teamNumber),
      drivetrain: pitForm.drivetrain.trim(),
      weight: pitForm.weight,
      width: pitForm.width,
      length: pitForm.length,
      height: pitForm.height,
      mechanisms: pitForm.mechanisms.trim(),
      capabilities: pitForm.capabilities.trim(),
      strategy: pitForm.strategy.trim(),
      notes: pitForm.notes.trim()
    }

    setPitRecords((current) => {
      const withoutOld = current.filter(
        (item) =>
          !(
            item.eventKey === record.eventKey &&
            Number(item.teamNumber) === record.teamNumber
          )
      )
      return [record, ...withoutOld]
    })

    try {
      const response = await fetch(`${API_BASE_URL}/api/sync/pit`, {
        method: 'PUT', headers: syncHeaders(), body: JSON.stringify(record)
      })
      if (!response.ok) throw new Error('No se pudo sincronizar Pit Scouting')
      const data = await response.json()
      setPitRecords(current => [data.record, ...current.filter(item => !(item.eventKey === data.record.eventKey && Number(item.teamNumber) === Number(data.record.teamNumber)))])
      setSyncStatus('synced')
    } catch (error) {
      console.error(error)
      setSyncStatus('local')
    }
    alert('Pit Scouting guardado.')
  }

  const deleteScoutingRecord = async (id) => {
    setScoutingRecords(current => current.filter(record => String(record.id) !== String(id)))
    try {
      const response = await fetch(`${API_BASE_URL}/api/sync/scouting/${encodeURIComponent(id)}`, { method: 'DELETE', headers: syncHeaders() })
      if (!response.ok) throw new Error('No se pudo sincronizar la eliminación')
      setSyncStatus('synced')
    } catch (error) { console.error(error); setSyncStatus('local') }
  }

  const deletePitRecord = async (id) => {
    setPitRecords(current => current.filter(record => String(record.id) !== String(id)))
    try {
      const response = await fetch(`${API_BASE_URL}/api/sync/pit/${encodeURIComponent(id)}`, { method: 'DELETE', headers: syncHeaders() })
      if (!response.ok) throw new Error('No se pudo sincronizar la eliminación')
      setSyncStatus('synced')
    } catch (error) { console.error(error); setSyncStatus('local') }
  }

  const formatNumber = (number) => {
    if (
      number === null ||
      number === undefined ||
      Number.isNaN(Number(number))
    ) {
      return '—'
    }
    return Number(number).toFixed(1)
  }

  const formatRecord = (record) => {
    if (!record) return '—'
    return `${record.wins}-${record.losses}-${record.ties}`
  }

  const eventLocation = (event) =>
    [event?.city, event?.state, event?.country].filter(Boolean).join(', ')

  const teamScoutingStats = (teamNumber, eventKey = null) => {
    const records = scoutingRecords.filter(
      (record) =>
        Number(record.teamNumber) === Number(teamNumber) &&
        (!eventKey || record.eventKey === eventKey)
    )

    return {
      records,
      count: records.length,
      auto: average(records, 'autoScore'),
      teleop: average(records, 'teleopScore'),
      endgame: average(records, 'endgameScore'),
      cycles: average(records, 'cycles'),
      defense: average(records, 'defense'),
      consistency: average(records, 'consistency'),
      fouls: records.reduce((sum, item) => sum + (Number(item.fouls) || 0), 0),
      breakdowns: records.filter((item) => item.breakdown).length
    }
  }

  const teamPitRecord = (teamNumber, eventKey = null) =>
    pitRecords.find(
      (record) =>
        Number(record.teamNumber) === Number(teamNumber) &&
        (!eventKey || record.eventKey === eventKey)
    )

  const teamMatches = useMemo(() => {
    if (!team) return []

    const combined = [...teamMatchHistory]

    for (const match of matches) {
      const containsTeam = [
        ...(match.red?.teams || []),
        ...(match.blue?.teams || [])
      ]
        .map(String)
        .includes(String(team.teamNumber))

      if (containsTeam && !combined.some((item) => item.key === match.key)) {
        combined.push(match)
      }
    }

    return combined.sort((a, b) =>
      Number(b.actualTime || b.predictedTime || b.time || 0) -
      Number(a.actualTime || a.predictedTime || a.time || 0)
    )
  }, [team, teamMatchHistory, matches])

  const filteredEvents = events.filter((event) => {
    const search = eventSearch.toLowerCase().trim()
    if (!search) return true
    return (
      event.name?.toLowerCase().includes(search) ||
      event.city?.toLowerCase().includes(search) ||
      event.state?.toLowerCase().includes(search) ||
      event.country?.toLowerCase().includes(search) ||
      event.key?.toLowerCase().includes(search)
    )
  })

  const toggleTeamSort = (key, preferredDirection = 'desc') => {
    setTeamSort(current => ({
      key,
      direction: current.key === key ? (current.direction === 'desc' ? 'asc' : 'desc') : preferredDirection
    }))
  }

  const filteredTeams = useMemo(() => {
    const search = teamSearch.toLowerCase().trim()
    const filtered = eventTeams.filter(item => !search || String(item.teamNumber).includes(search) || item.name?.toLowerCase().includes(search))
    const getValue = item => {
      const scout = teamScoutingStats(item.teamNumber, selectedEvent?.key)
      if (teamSort.key === 'rank') return item.rank
      if (teamSort.key === 'teamNumber') return item.teamNumber
      if (teamSort.key === 'name') return item.name || ''
      if (teamSort.key === 'record') {
        const games = Number(item.record?.wins || 0) + Number(item.record?.losses || 0) + Number(item.record?.ties || 0)
        return games ? (Number(item.record?.wins || 0) + Number(item.record?.ties || 0) * .5) / games : null
      }
      if (teamSort.key === 'rs') return item.rs
      if (teamSort.key === 'matchPoints') return item.matchPoints
      if (teamSort.key === 'opr') return item.opr
      if (teamSort.key === 'dpr') return item.dpr
      if (teamSort.key === 'ccwm') return item.ccwm
      if (teamSort.key === 'scout') return scout.count
      if (teamSort.key === 'averageOpr') return item.averageOpr
      return null
    }
    return [...filtered].sort((a,b) => {
      const av=getValue(a), bv=getValue(b)
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const c = typeof av === 'string' || typeof bv === 'string'
        ? String(av).localeCompare(String(bv), 'es', { sensitivity: 'base' })
        : Number(av)-Number(bv)
      return teamSort.direction === 'asc' ? c : -c
    })
  }, [eventTeams, teamSearch, teamSort, scoutingRecords, selectedEvent?.key])

  const filteredMatches = matches.filter((match) => {
    const search = matchSearch.toLowerCase().trim()
    if (!search) return true
    const teams = [...(match.red?.teams || []), ...(match.blue?.teams || [])]
    return (
      match.name?.toLowerCase().includes(search) ||
      teams.some((number) => String(number).includes(search))
    )
  })

  const dashboardStats = useMemo(() => {
    const rankedTeams = eventTeams
      .filter((item) => item.rank !== null)
      .sort((a, b) => Number(a.rank) - Number(b.rank))

    const teamsWithOpr = eventTeams.filter((item) => item.opr !== null)

    const playedMatches = matches.filter(
      (match) =>
        match.red?.score !== null &&
        match.blue?.score !== null &&
        match.red?.score >= 0 &&
        match.blue?.score >= 0
    )

    const sortedOpr = [...teamsWithOpr]
      .sort((a, b) => Number(b.opr) - Number(a.opr))
      .slice(0, 10)

    const sortedCcwm = [...eventTeams]
      .filter((item) => item.ccwm !== null)
      .sort((a, b) => Number(b.ccwm) - Number(a.ccwm))
      .slice(0, 10)

    const averageScore = playedMatches.length
      ? playedMatches.reduce(
          (sum, match) =>
            sum + Number(match.red.score) + Number(match.blue.score),
          0
        ) /
        (playedMatches.length * 2)
      : null

    return {
      rankedTeams,
      teamsWithOpr,
      playedMatches,
      sortedOpr,
      sortedCcwm,
      averageScore
    }
  }, [eventTeams, matches])

  const allianceSummary = (numbers) => {
    const selected = numbers
      .filter(Boolean)
      .map((number) =>
        allianceTeams.find(
          (item) => String(item.teamNumber) === String(number)
        )
      )
      .filter(Boolean)

    const sumMetric = (field) => {
      const values = selected
        .map((item) => item[field])
        .filter((value) => value !== null && value !== undefined)
      return values.length
        ? values.reduce((sum, value) => sum + Number(value), 0)
        : null
    }

    const scouting = selected.map((item) =>
      teamScoutingStats(item.teamNumber, allianceEventKey)
    )

    const avgScout = (field) => {
      const values = scouting
        .map((item) => item[field])
        .filter((value) => value !== null)
      return values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null
    }

    return {
      teams: selected,
      opr: sumMetric('opr'),
      dpr: sumMetric('dpr'),
      ccwm: sumMetric('ccwm'),
      scoutingAuto: avgScout('auto'),
      scoutingTeleop: avgScout('teleop'),
      scoutingEndgame: avgScout('endgame'),
      defense: avgScout('defense'),
      consistency: avgScout('consistency')
    }
  }

  const redSummary = allianceSummary(redAlliance)
  const blueSummary = allianceSummary(blueAlliance)

  const sortedPickTeams = useMemo(() => {
    const search = pickSearch.toLowerCase().trim()
    const filtered = pickTeams.filter(
      (item) =>
        !search ||
        String(item.teamNumber).includes(search) ||
        item.name?.toLowerCase().includes(search)
    )

    const value = (item) => {
      const scouting = teamScoutingStats(item.teamNumber, pickEventKey)
      if (pickSort === 'rs') return Number(item.rs ?? -Infinity)
      if (pickSort === 'matchPoints') return Number(item.matchPoints ?? -Infinity)
      if (pickSort === 'opr') return Number(item.opr ?? -Infinity)
      if (pickSort === 'ccwm') return Number(item.ccwm ?? -Infinity)
      if (pickSort === 'defense') return Number(scouting.defense ?? -Infinity)
      if (pickSort === 'consistency') {
        return Number(scouting.consistency ?? -Infinity)
      }
      if (pickSort === 'scouting') return Number(scouting.count)
      return item.rank === null || item.rank === undefined
        ? Infinity
        : Number(item.rank)
    }

    return [...filtered].sort((a, b) =>
      ['rank'].includes(pickSort) ? value(a) - value(b) : value(b) - value(a)
    )
  }, [pickTeams, pickSearch, pickSort, scoutingRecords, pickEventKey])

  const favoriteTeamData = useMemo(() => {
    const found = new Map()

    for (const item of eventTeams) {
      if (favorites.includes(Number(item.teamNumber))) {
        found.set(Number(item.teamNumber), item)
      }
    }

    for (const item of compareTeams) {
      if (favorites.includes(Number(item.teamNumber))) {
        found.set(Number(item.teamNumber), item)
      }
    }

    return favorites.map((number) => ({
      teamNumber: number,
      ...(found.get(number) || {})
    }))
  }, [favorites, eventTeams, compareTeams])

  const liveData = useMemo(() => {
    const now = Math.floor(Date.now() / 1000)

    const played = liveMatches.filter(
      (match) =>
        match.red?.score !== null &&
        match.blue?.score !== null &&
        match.red?.score >= 0 &&
        match.blue?.score >= 0
    )

    const upcoming = liveMatches
      .filter((match) => {
        const time = match.predictedTime || match.time || 0
        return !played.includes(match) && (!time || time >= now)
      })
      .slice(0, 8)

    const recent = [...played].slice(-8).reverse()

    const ranked = [...liveTeams]
      .filter((item) => item.rank !== null)
      .sort((a, b) => Number(a.rank) - Number(b.rank))
      .slice(0, 10)

    const pending = []
    for (const match of upcoming.slice(0, 4)) {
      const teams = [...(match.red?.teams || []), ...(match.blue?.teams || [])]
      for (const teamNumber of teams) {
        const hasRecord = scoutingRecords.some(
          (record) =>
            record.eventKey === liveEventKey &&
            Number(record.teamNumber) === Number(teamNumber) &&
            (record.matchKey === match.key || record.match === match.name)
        )
        if (!hasRecord) {
          pending.push({ match: match.name, teamNumber })
        }
      }
    }

    return { upcoming, recent, ranked, pending }
  }, [liveMatches, liveTeams, scoutingRecords, liveEventKey])

  const selectedTeamScouting = team
    ? teamScoutingStats(team.teamNumber)
    : null

  const selectedTeamPit = team ? teamPitRecord(team.teamNumber) : null

  if (!isAuthenticated) {
    return (
      <LoginScreen
        password={loginPassword}
        setPassword={setLoginPassword}
        error={loginError}
        loading={loginLoading}
        onSubmit={handleLogin}
      />
    )
  }

  return (
    <div
      className="app"
      style={{
        '--quantum-pink': QUANTUM_FTC_TEAMS[0].primary,
        '--quantum-green': QUANTUM_FTC_TEAMS[1].primary,
        '--quantum-purple': QUANTUM_FTC_TEAMS[0].secondary
      }}
    >
      <header className="header">
        <div className="logo-area" onClick={goHome}>
          <h1>Quantum FTC Scouting</h1>
          <p>24831 · 28076 | FTC Team Intelligence</p>
        </div>

        <nav className="main-nav">
          <button className={view === 'home' ? 'active' : ''} onClick={goHome}>
            Inicio
          </button>
          <button
            className={
              ['events', 'event', 'teams', 'matches', 'match-detail', 'dashboard']
                .includes(view)
                ? 'active'
                : ''
            }
            onClick={goEvents}
          >
            Eventos
          </button>
          <button
            className={view === 'compare' ? 'active' : ''}
            onClick={goCompare}
          >
            Comparar
          </button>
          <button
            className={view === 'alliances' ? 'active' : ''}
            onClick={goAlliances}
          >
            Alianzas
          </button>
          <button
            className={view === 'scouting' ? 'active' : ''}
            onClick={goScouting}
          >
            Scouting
          </button>
          <button
            className={view === 'live' ? 'active' : ''}
            onClick={goLive}
          >
            Live
          </button>
        </nav>

        <div className="event-controls">
          <div className="selector-group">
            <label>Temporada</label>
            <select value={year} onChange={(e) => changeYear(e.target.value)}>
              {seasons.map((seasonYear) => (
                <option key={seasonYear} value={String(seasonYear)}>
                  {formatSeasonLabel(seasonYear)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main>
        {view === 'home' && (
          <>
            <section className="hero-section">
              <span className="section-label">QUANTUM FTC SCOUTING</span>
              <h2>Scouting FTC para 24831 y 28076.</h2>
              <p>
                Busca equipos, analiza eventos, revisa matches y convierte tus
                observaciones en datos útiles para estrategia.
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '14px',
                  marginTop: '24px'
                }}
              >
                {QUANTUM_FTC_TEAMS.map((quantumTeam) => (
                  <button
                    key={quantumTeam.number}
                    type="button"
                    onClick={() => searchTeam(quantumTeam.number)}
                    style={{
                      textAlign: 'left',
                      padding: '18px 20px',
                      borderRadius: '16px',
                      border: `1px solid ${quantumTeam.primary}`,
                      borderLeft: `6px solid ${quantumTeam.primary}`,
                      background: `linear-gradient(135deg, ${quantumTeam.primary}22, ${quantumTeam.secondary}22)`,
                      color: '#fff',
                      cursor: 'pointer'
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        color: quantumTeam.primary,
                        fontSize: '12px',
                        fontWeight: 800,
                        letterSpacing: '.14em',
                        marginBottom: '6px'
                      }}
                    >
                      FTC TEAM
                    </span>
                    <strong style={{ fontSize: '28px' }}>{quantumTeam.number}</strong>
                    <span
                      style={{
                        display: 'block',
                        color: '#cdbbd3',
                        marginTop: '5px'
                      }}
                    >
                      Ver equipo →
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="search-box">
              <label>Buscar equipo FTC</label>
              <div className="search-row">
                <input
                  type="number"
                  placeholder="Ej. 24831"
                  value={teamInput}
                  onChange={(e) => setTeamInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') searchTeam()
                  }}
                />
                <button onClick={() => searchTeam()} disabled={loading}>
                  {loading ? 'Buscando...' : 'Buscar'}
                </button>
              </div>
            </section>

            {team && (
              <>
                <section className="team-profile">
                  <div className="team-number">TEAM {team.teamNumber}</div>
                  <div className="team-profile-title-row">
                    <div>
                      <h2>{team.name}</h2>
                      <p>{eventLocation(team)}</p>
                    </div>
                    <button
                      className="favorite-button"
                      onClick={() => toggleFavorite(team.teamNumber)}
                    >
                      {isFavorite(team.teamNumber) ? '★ Favorito' : '☆ Favorito'}
                    </button>
                  </div>

                  <div className="team-meta">
                    {team.rookieYear && (
                      <span>Rookie Year: {team.rookieYear}</span>
                    )}
                    {team.website && (
                      <a href={team.website} target="_blank" rel="noreferrer">
                        Sitio web ↗
                      </a>
                    )}
                  </div>
                </section>

                <section className="team-performance-section">
                  <div className="section-heading">
                    <div>
                      <span className="section-label">PERFORMANCE</span>
                      <h2>Nuestro scouting</h2>
                      <p>
                        {selectedTeamScouting?.count || 0} matches observados
                      </p>
                    </div>
                  </div>

                  <div className="dashboard-summary">
                    <StatBox
                      label="AUTO PROM."
                      value={formatNumber(selectedTeamScouting?.auto)}
                    />
                    <StatBox
                      label="TELEOP PROM."
                      value={formatNumber(selectedTeamScouting?.teleop)}
                    />
                    <StatBox
                      label="ENDGAME PROM."
                      value={formatNumber(selectedTeamScouting?.endgame)}
                    />
                    <StatBox
                      label="CICLOS PROM."
                      value={formatNumber(selectedTeamScouting?.cycles)}
                    />
                    <StatBox
                      label="DEFENSA"
                      value={
                        selectedTeamScouting?.defense === null
                          ? '—'
                          : `${formatNumber(selectedTeamScouting?.defense)}/5`
                      }
                    />
                    <StatBox
                      label="CONSISTENCIA"
                      value={
                        selectedTeamScouting?.consistency === null
                          ? '—'
                          : `${formatNumber(
                              selectedTeamScouting?.consistency
                            )}/5`
                      }
                    />
                    <StatBox
                      label="FALLAS"
                      value={selectedTeamScouting?.breakdowns ?? 0}
                    />
                  </div>
                </section>

                <section className="team-performance-section">
                  <div className="section-heading">
                    <div>
                      <span className="section-label">PIT SCOUTING</span>
                      <h2>Robot</h2>
                    </div>
                  </div>

                  {selectedTeamPit ? (
                    <div className="pit-summary-card">
                      <p>
                        <strong>Drivetrain:</strong>{' '}
                        {selectedTeamPit.drivetrain || '—'}
                      </p>
                      <p>
                        <strong>Mecanismos:</strong>{' '}
                        {selectedTeamPit.mechanisms || '—'}
                      </p>
                      <p>
                        <strong>Capacidades:</strong>{' '}
                        {selectedTeamPit.capabilities || '—'}
                      </p>
                      <p>
                        <strong>Estrategia:</strong>{' '}
                        {selectedTeamPit.strategy || '—'}
                      </p>
                      {selectedTeamPit.notes && <p>{selectedTeamPit.notes}</p>}
                    </div>
                  ) : (
                    <div className="empty-state">
                      Todavía no hay Pit Scouting de este equipo.
                    </div>
                  )}
                </section>

                <section className="team-events-section">
                  <div className="section-heading">
                    <div>
                      <span className="section-label">TEMPORADA {formatSeasonLabel(year)}</span>
                      <h2>Eventos del equipo</h2>
                      <p>
                        {teamEvents.length}{' '}
                        {teamEvents.length === 1 ? 'evento' : 'eventos'}
                      </p>
                    </div>
                  </div>

                  {teamEvents.length ? (
                    <div className="team-events-list">
                      {teamEvents.map((teamEvent) => (
                        <article className="team-event-card" key={teamEvent.key}>
                          <div className="team-event-top">
                            <div>
                              <span className="event-key">{teamEvent.key}</span>
                              <h3>{teamEvent.name}</h3>
                              <p>{eventLocation(teamEvent)}</p>
                            </div>
                            <button
                              className="event-open-button"
                              onClick={() => openEvent(teamEvent)}
                            >
                              Ver evento →
                            </button>
                          </div>

                          <div className="event-stats-grid">
                            <StatBox
                              label="RANK"
                              value={
                                teamEvent.stats?.rank !== null &&
                                teamEvent.stats?.rank !== undefined
                                  ? `#${teamEvent.stats.rank}`
                                  : '—'
                              }
                            />
                            <StatBox
                              label="RECORD"
                              value={formatRecord(teamEvent.stats?.record)}
                            />
                            <StatBox
                              label="OPR"
                              value={formatNumber(teamEvent.stats?.opr)}
                            />
                            <StatBox
                              label="DPR"
                              value={formatNumber(teamEvent.stats?.dpr)}
                            />
                            <StatBox
                              label="CCWM"
                              value={formatNumber(teamEvent.stats?.ccwm)}
                            />
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      Este equipo no tiene eventos registrados en {formatSeasonLabel(year)}.
                    </div>
                  )}
                </section>

                {teamMatches.length > 0 && (
                  <section className="team-events-section">
                    <div className="section-heading">
                      <div>
                        <span className="section-label">MATCHES</span>
                        <h2>Historial cargado</h2>
                      </div>
                    </div>
                    <div className="matches-list">
                      {teamMatches.map((match) => (
                        <article
                          className="match-card clickable-match"
                          key={match.key}
                          onClick={() => openMatch(match)}
                        >
                          <div className="match-title">
                            <strong>{match.name}</strong>
                            <span className="match-status">Ver detalle →</span>
                          </div>
                          <MatchAlliances match={match} openTeam={openTeam} />
                        </article>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}

            <section className="quick-actions">
              <h2>Acciones rápidas</h2>
              <div className="actions home-actions">
                <button onClick={goScouting}>Scouting</button>
                <button onClick={goEvents}>Eventos</button>
                <button onClick={goCompare}>Comparar</button>
                <button onClick={goAlliances}>Alianzas</button>
                <button onClick={goPickList}>Pick List</button>
                <button onClick={goLive}>Live Event</button>
                <button onClick={goFavorites}>★ Favoritos</button>
              </div>
            </section>
          </>
        )}

        {view === 'events' && (
          <section className="events-page">
            <PageHeader
              label={`TEMPORADA ${formatSeasonLabel(year)}`}
              title="Eventos FTC"
              subtitle={`${events.length} eventos cargados`}
              onBack={goBack}
            />

            <div className="event-search-box">
              <input
                type="text"
                placeholder="Buscar por nombre, ciudad, estado o código..."
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
              />
            </div>

            {loadingEvents ? (
              <div className="empty-state">Cargando eventos...</div>
            ) : (
              <div className="events-browser-list">
                {filteredEvents.map((event) => (
                  <article
                    className="event-browser-card"
                    key={event.key}
                    onClick={() => openEvent(event)}
                  >
                    <div>
                      <span className="event-key">{event.key}</span>
                      <h3>{event.name}</h3>
                      <p>{eventLocation(event)}</p>
                      {event.startDate && (
                        <small>
                          {event.startDate}
                          {event.endDate && ` → ${event.endDate}`}
                        </small>
                      )}
                    </div>
                    <span className="event-arrow">→</span>
                  </article>
                ))}
                {!filteredEvents.length && (
                  <div className="empty-state">No se encontraron eventos.</div>
                )}
              </div>
            )}
          </section>
        )}

        {view === 'event' && selectedEvent && (
          <section className="event-page">
            <PageHeader
              label="EVENTO"
              title={selectedEvent.name}
              subtitle={eventLocation(selectedEvent)}
              onBack={goBack}
            />

            <div className="event-detail-card">
              <span className="event-key">{selectedEvent.key}</span>
              <h3>{selectedEvent.name}</h3>
              <p>{eventLocation(selectedEvent)}</p>
              {selectedEvent.startDate && (
                <p className="event-date">
                  {selectedEvent.startDate}
                  {selectedEvent.endDate && ` → ${selectedEvent.endDate}`}
                </p>
              )}
            </div>

            <section className="quick-actions">
              <h2>Información del evento</h2>
              <div className="actions event-actions-v2">
                <button
                  onClick={() => openDashboard(selectedEvent)}
                  disabled={dashboardLoading}
                >
                  {dashboardLoading ? 'Cargando...' : 'Dashboard'}
                </button>
                <button
                  onClick={() => openTeams(selectedEvent)}
                  disabled={teamsLoading}
                >
                  {teamsLoading ? 'Cargando...' : 'Equipos'}
                </button>
                <button
                  onClick={() => openMatches(selectedEvent)}
                  disabled={matchesLoading}
                >
                  {matchesLoading ? 'Cargando...' : 'Matches'}
                </button>
                <button
                  onClick={() => {
                    setLiveEventKey(selectedEvent.key)
                    loadLiveEvent(selectedEvent.key)
                    navigateTo('live')
                  }}
                >
                  Live Event
                </button>
              </div>
            </section>
          </section>
        )}

        {view === 'dashboard' && selectedEvent && (
          <section className="dashboard-page">
            <PageHeader
              label="DASHBOARD"
              title={selectedEvent.name}
              subtitle={eventLocation(selectedEvent)}
              onBack={goBack}
            />

            <div className="dashboard-summary">
              <StatBox label="EQUIPOS" value={eventTeams.length} />
              <StatBox
                label="CON RANKING"
                value={dashboardStats.rankedTeams.length}
              />
              <StatBox label="MATCHES" value={matches.length} />
              <StatBox
                label="JUGADOS"
                value={dashboardStats.playedMatches.length}
              />
              <StatBox
                label="SCORE PROM."
                value={
                  dashboardStats.averageScore === null
                    ? '—'
                    : dashboardStats.averageScore.toFixed(1)
                }
              />
            </div>

            <div className="dashboard-columns">
              <section className="ranking-panel">
                <div className="panel-heading">
                  <span className="section-label">RANKING</span>
                  <h3>Clasificación</h3>
                </div>
                <div className="mini-table-container">
                  <table className="mini-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Team</th>
                        <th>Record</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardStats.rankedTeams.slice(0, 10).map((item) => (
                        <tr
                          key={item.teamNumber}
                          onClick={() => openTeam(item.teamNumber)}
                        >
                          <td>#{item.rank}</td>
                          <td>
                            <strong>{item.teamNumber}</strong>
                          </td>
                          <td>{formatRecord(item.record)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="ranking-panel">
                <div className="panel-heading">
                  <span className="section-label">OPR</span>
                  <h3>OPR del evento</h3>
                </div>
                <div className="mini-table-container">
                  <table className="mini-table">
                    <thead>
                      <tr>
                        <th>Team</th>
                        <th>OPR</th>
                        <th>CCWM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardStats.sortedOpr.map((item) => (
                        <tr
                          key={item.teamNumber}
                          onClick={() => openTeam(item.teamNumber)}
                        >
                          <td>
                            <strong>{item.teamNumber}</strong>
                          </td>
                          <td>{formatNumber(item.opr)}</td>
                          <td>{formatNumber(item.ccwm)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <section className="ranking-panel ccwm-panel">
              <div className="panel-heading">
                <span className="section-label">CCWM</span>
                <h3>CCWM del evento</h3>
              </div>
              <div className="dashboard-team-cards">
                {dashboardStats.sortedCcwm.map((item, index) => (
                  <button
                    className="dashboard-team-card"
                    key={item.teamNumber}
                    style={quantumTeamStyle(item.teamNumber, true)}
                    onClick={() => openTeam(item.teamNumber)}
                  >
                    <span>#{index + 1}</span>
                    <strong>{item.teamNumber}</strong>
                    <small>{formatNumber(item.ccwm)} CCWM</small>
                  </button>
                ))}
              </div>
            </section>
          </section>
        )}

        {view === 'teams' && selectedEvent && (
          <section className="teams-page">
            <PageHeader
              label="EVENTO"
              title="Equipos"
              subtitle={`${selectedEvent.name} · ${eventTeams.length} equipos`}
              onBack={goBack}
            />

            <div className="team-table-search">
              <input
                type="text"
                placeholder="Buscar por número o nombre..."
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
              />
            </div>

            <div className="teams-table-container">
              <table className="teams-table">
                <thead>
                  <tr>
                    <th>★</th>
                    <SortableHeader label="Rank" sortKey="rank" sort={teamSort} onSort={toggleTeamSort} preferredDirection="asc" />
                    <SortableHeader label="Team" sortKey="teamNumber" sort={teamSort} onSort={toggleTeamSort} />
                    <SortableHeader label="Nombre" sortKey="name" sort={teamSort} onSort={toggleTeamSort} preferredDirection="asc" />
                    <SortableHeader label="Record" sortKey="record" sort={teamSort} onSort={toggleTeamSort} />
                    <SortableHeader label="RS" sortKey="rs" sort={teamSort} onSort={toggleTeamSort} />
                    <SortableHeader label="Match Pts" sortKey="matchPoints" sort={teamSort} onSort={toggleTeamSort} />
                    <SortableHeader label="OPR" sortKey="opr" sort={teamSort} onSort={toggleTeamSort} />
                    <SortableHeader label="DPR" sortKey="dpr" sort={teamSort} onSort={toggleTeamSort} />
                    <SortableHeader label="CCWM" sortKey="ccwm" sort={teamSort} onSort={toggleTeamSort} />
                    <SortableHeader
                      label={`Prom OPR ${Number(String(selectedEvent?.key || year).slice(0, 4)) - 1}`}
                      sortKey="averageOpr"
                      sort={teamSort}
                      onSort={toggleTeamSort}
                    />
                    <SortableHeader label="Scout" sortKey="scout" sort={teamSort} onSort={toggleTeamSort} />
                    
                  </tr>
                </thead>
                <tbody>
                  {filteredTeams.map((item) => {
                    const scout = teamScoutingStats(
                      item.teamNumber,
                      selectedEvent.key
                    )
                    return (
                      <tr key={item.teamNumber} style={quantumTeamStyle(item.teamNumber)}>
                        <td>
                          <button
                            className="favorite-star"
                            onClick={() => toggleFavorite(item.teamNumber)}
                          >
                            {isFavorite(item.teamNumber) ? '★' : '☆'}
                          </button>
                        </td>
                        <td onClick={() => openTeam(item.teamNumber)}>
                          {item.rank !== null ? `#${item.rank}` : '—'}
                        </td>
                        <td
                          className="team-number-cell"
                          style={quantumTeamTextStyle(item.teamNumber)}
                          onClick={() => openTeam(item.teamNumber)}
                        >
                          {item.teamNumber}
                        </td>
                        <td onClick={() => openTeam(item.teamNumber)}>
                          {item.name}
                        </td>
                        <td onClick={() => openTeam(item.teamNumber)}>
                          {formatRecord(item.record)}
                        </td>
                        <td onClick={() => openTeam(item.teamNumber)}>{formatNumber(item.rs)}</td>
                        <td onClick={() => openTeam(item.teamNumber)}>{formatNumber(item.matchPoints)}</td>
                        <td onClick={() => openTeam(item.teamNumber)}>
                          {formatNumber(item.opr)}
                        </td>
                        <td onClick={() => openTeam(item.teamNumber)}>
                          {formatNumber(item.dpr)}
                        </td>
                        <td onClick={() => openTeam(item.teamNumber)}>
                          {formatNumber(item.ccwm)}
                        </td>
                        <td onClick={() => openTeam(item.teamNumber)}>
                          {formatNumber(item.averageOpr)}
                        </td>
                        <td>{scout.count}</td>
                        
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {view === 'matches' && selectedEvent && (
          <section className="matches-page">
            <PageHeader
              label="EVENTO"
              title="Matches"
              subtitle={`${selectedEvent.name} · ${matches.length} matches`}
              onBack={goBack}
            />

            <div className="match-search">
              <input
                type="text"
                placeholder="Buscar match o equipo..."
                value={matchSearch}
                onChange={(e) => setMatchSearch(e.target.value)}
              />
            </div>

            <div className="matches-list">
              {filteredMatches.map((match) => (
                <article
                  className="match-card clickable-match"
                  key={match.key}
                  onClick={() => openMatch(match)}
                >
                  <div className="match-title">
                    <strong>{match.name}</strong>
                    <span className="match-status">Ver detalle →</span>
                  </div>
                  <MatchAlliances match={match} openTeam={openTeam} />
                </article>
              ))}
              {!filteredMatches.length && (
                <div className="no-matches">No se encontraron matches.</div>
              )}
            </div>
          </section>
        )}

        {view === 'match-detail' && selectedEvent && selectedMatch && (
          <section className="match-detail-page">
            <PageHeader
              label="MATCH"
              title={selectedMatch.name}
              subtitle={selectedEvent.name}
              onBack={goBack}
            />
            <div className="match-detail-card">
              <div className="match-detail-heading">
                <span className="event-key">{selectedMatch.key}</span>
                <h3>{selectedMatch.name}</h3>
              </div>
              <MatchAlliances
                match={selectedMatch}
                openTeam={openTeam}
                large
              />
            </div>
          </section>
        )}

        {view === 'compare' && (
          <section className="compare-page">
            <PageHeader
              label={`TEMPORADA ${formatSeasonLabel(year)}`}
              title="Comparar equipos"
              subtitle="Compara hasta cuatro equipos dentro del mismo evento."
              onBack={goBack}
            />

            <section className="compare-selector-card">
              <label>Evento</label>
              <EventSearchSelect
                events={events}
                value={compareEventKey}
                onChange={loadCompareEvent}
              />
              {compareLoading && <p className="loading-text">Cargando...</p>}
            </section>

            {compareEventKey && !compareLoading && (
              <>
                <section className="compare-pickers">
                  {compareTeamNumbers.map((number, index) => (
                    <TeamSelect
                      key={index}
                      label={`Equipo ${index + 1}`}
                      value={number}
                      teams={compareTeams}
                      onChange={(value) => updateCompareTeam(index, value)}
                    />
                  ))}
                </section>

                {selectedCompareTeams.length ? (
                  <section className="comparison-area">
                    <div className="comparison-grid">
                      {selectedCompareTeams.map((item) => {
                        const scout = teamScoutingStats(
                          item.teamNumber,
                          compareEventKey
                        )
                        return (
                          <article
                            className="comparison-card"
                            key={item.teamNumber}
                            style={quantumTeamStyle(item.teamNumber, true)}
                          >
                            <span className="section-label">TEAM</span>
                            <h3>{item.teamNumber}</h3>
                            <p>{item.name}</p>
                            <div className="comparison-stats">
                              <CompareStat
                                label="Rank"
                                value={item.rank !== null ? `#${item.rank}` : '—'}
                              />
                              <CompareStat
                                label="Record"
                                value={formatRecord(item.record)}
                              />
                              <CompareStat
                                label="RS"
                                value={formatNumber(item.rs)}
                              />
                              <CompareStat
                                label="Match Points"
                                value={formatNumber(item.matchPoints)}
                              />
                              <CompareStat
                                label="Base Points"
                                value={formatNumber(item.basePoints)}
                              />
                              <CompareStat
                                label="Auto Points"
                                value={formatNumber(item.autoPoints)}
                              />
                              <CompareStat
                                label="OPR (analítica)"
                                value={formatNumber(item.opr)}
                              />
                              <CompareStat
                                label="DPR"
                                value={formatNumber(item.dpr)}
                              />
                              <CompareStat
                                label="CCWM"
                                value={formatNumber(item.ccwm)}
                              />
                              <CompareStat label="Scout" value={scout.count} />
                              <CompareStat
                                label="Consistencia"
                                value={formatNumber(scout.consistency)}
                              />
                            </div>
                            <button
                              className="profile-button"
                              onClick={() => openTeam(item.teamNumber)}
                            >
                              Ver perfil
                            </button>
                          </article>
                        )
                      })}
                    </div>
                  </section>
                ) : (
                  <div className="empty-state">
                    Selecciona al menos un equipo.
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {view === 'alliances' && (
          <section className="compare-page">
            <PageHeader
              label="ALLIANCES"
              title="Comparación de alianzas"
              subtitle="Compara alianzas FTC de 2 equipos; las métricas analíticas apoyan estrategia y no predicen al ganador."
              onBack={goBack}
            />

            <section className="compare-selector-card">
              <label>Evento</label>
              <EventSearchSelect
                events={events}
                value={allianceEventKey}
                onChange={loadAllianceEvent}
              />
            </section>

            {allianceEventKey && (
              <div className="alliance-comparison-grid">
                <AllianceBuilder
                  color="red"
                  title="RED"
                  values={redAlliance}
                  teams={allianceTeams}
                  summary={redSummary}
                  onChange={updateAllianceSlot}
                  formatNumber={formatNumber}
                />
                <AllianceBuilder
                  color="blue"
                  title="BLUE"
                  values={blueAlliance}
                  teams={allianceTeams}
                  summary={blueSummary}
                  onChange={updateAllianceSlot}
                  formatNumber={formatNumber}
                />
              </div>
            )}
          </section>
        )}

        {view === 'pick-list' && (
          <section className="teams-page">
            <PageHeader
              label="STRATEGY"
              title="Pick List"
              subtitle="Ordena los datos; la decisión final sigue siendo de estrategia."
              onBack={goBack}
            />

            <div className="pick-controls">
              <EventSearchSelect
                events={events}
                value={pickEventKey}
                onChange={loadPickEvent}
              />

              <select
                value={pickSort}
                onChange={(e) => setPickSort(e.target.value)}
              >
                <option value="rank">Rank oficial</option>
                <option value="rs">RS</option>
                <option value="matchPoints">Match Points</option>
                <option value="opr">OPR (analítica)</option>
                <option value="ccwm">CCWM</option>
                <option value="defense">Defensa scouting</option>
                <option value="consistency">Consistencia scouting</option>
                <option value="scouting">Cantidad de observaciones</option>
              </select>

              <input
                placeholder="Buscar equipo..."
                value={pickSearch}
                onChange={(e) => setPickSearch(e.target.value)}
              />
            </div>

            {pickEventKey && (
              <div className="teams-table-container">
                <table className="teams-table">
                  <thead>
                    <tr>
                      <th>★</th>
                      <th>Rank</th>
                      <th>Team</th>
                      <th>Nombre</th>
                      <th>RS</th>
                      <th>Match Pts</th>
                      <th>OPR</th>
                      <th>CCWM</th>
                      <th>Defensa</th>
                      <th>Consistencia</th>
                      <th>Obs.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPickTeams.map((item) => {
                      const scout = teamScoutingStats(
                        item.teamNumber,
                        pickEventKey
                      )
                      return (
                        <tr key={item.teamNumber} style={quantumTeamStyle(item.teamNumber)}>
                          <td>
                            <button
                              className="favorite-star"
                              onClick={() => toggleFavorite(item.teamNumber)}
                            >
                              {isFavorite(item.teamNumber) ? '★' : '☆'}
                            </button>
                          </td>
                          <td>{item.rank !== null ? `#${item.rank}` : '—'}</td>
                          <td
                            className="team-number-cell"
                            onClick={() => openTeam(item.teamNumber)}
                          >
                            {item.teamNumber}
                          </td>
                          <td>{item.name}</td>
                          <td>{formatNumber(item.rs)}</td>
                          <td>{formatNumber(item.matchPoints)}</td>
                          <td>{formatNumber(item.opr)}</td>
                          <td>{formatNumber(item.ccwm)}</td>
                          <td>{formatNumber(scout.defense)}</td>
                          <td>{formatNumber(scout.consistency)}</td>
                          <td>{scout.count}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {view === 'live' && (
          <section className="dashboard-page">
            <PageHeader
              label="LIVE EVENT"
              title="Centro de competencia"
              subtitle="Próximos matches, ranking, resultados y scouting pendiente."
              onBack={goBack}
            />

            <section className="compare-selector-card">
              <label>Evento</label>
              <EventSearchSelect
                events={events}
                value={liveEventKey}
                onChange={loadLiveEvent}
              />
            </section>

            {liveLoading && <div className="empty-state">Cargando evento...</div>}

            {liveEventKey && !liveLoading && (
              <>
                <div className="dashboard-summary">
                  <StatBox label="EQUIPOS" value={liveTeams.length} />
                  <StatBox label="MATCHES" value={liveMatches.length} />
                  <StatBox
                    label="PRÓXIMOS"
                    value={liveData.upcoming.length}
                  />
                  <StatBox
                    label="SCOUTING PENDIENTE"
                    value={liveData.pending.length}
                  />
                </div>

                <div className="dashboard-columns">
                  <section className="ranking-panel">
                    <div className="panel-heading">
                      <span className="section-label">PRÓXIMOS</span>
                      <h3>Matches</h3>
                    </div>
                    {liveData.upcoming.length ? (
                      <div className="live-list">
                        {liveData.upcoming.map((match) => (
                          <button
                            key={match.key}
                            className="live-match-row"
                            onClick={() => {
                              setSelectedEvent(
                                events.find((item) => item.key === liveEventKey)
                              )
                              setSelectedMatch(match)
                              navigateTo('match-detail')
                            }}
                          >
                            <strong>{match.name}</strong>
                            <span>
                              {(match.red?.teams || []).join(' · ')} vs{' '}
                              {(match.blue?.teams || []).join(' · ')}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">
                        No hay próximos matches cargados.
                      </div>
                    )}
                  </section>

                  <section className="ranking-panel">
                    <div className="panel-heading">
                      <span className="section-label">RANKING</span>
                      <h3>Top 10</h3>
                    </div>
                    <div className="mini-table-container">
                      <table className="mini-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Team</th>
                            <th>Record</th>
                          </tr>
                        </thead>
                        <tbody>
                          {liveData.ranked.map((item) => (
                            <tr
                              key={item.teamNumber}
                              style={quantumTeamStyle(item.teamNumber)}
                              onClick={() => openTeam(item.teamNumber)}
                            >
                              <td>#{item.rank}</td>
                              <td>{item.teamNumber}</td>
                              <td>{formatRecord(item.record)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>

                <section className="ranking-panel">
                  <div className="panel-heading">
                    <span className="section-label">PENDIENTE</span>
                    <h3>Scouting por completar</h3>
                  </div>
                  {liveData.pending.length ? (
                    <div className="pending-grid">
                      {liveData.pending.map((item, index) => (
                        <button
                          className="pending-card"
                          style={quantumTeamStyle(item.teamNumber, true)}
                          key={`${item.match}-${item.teamNumber}-${index}`}
                          onClick={() => {
                            const event = events.find(
                              (entry) => entry.key === liveEventKey
                            )
                            setSelectedEvent(event)
                            setEventTeams(liveTeams)
                            setMatches(liveMatches)
                            const pendingMatch = liveMatches.find(
                              (match) => match.name === item.match
                            )
                            setScoutingForm((current) => ({
                              ...current,
                              eventKey: liveEventKey,
                              matchKey: pendingMatch?.key || '',
                              match: item.match,
                              teamNumber: String(item.teamNumber)
                            }))
                            setScoutingTab('match')
                            navigateTo('scouting')
                          }}
                        >
                          <strong>Team {item.teamNumber}</strong>
                          <span>{item.match}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      No hay scouting pendiente en los próximos matches.
                    </div>
                  )}
                </section>
              </>
            )}
          </section>
        )}

        {view === 'favorites' && (
          <section className="teams-page">
            <PageHeader
              label="GUARDADOS"
              title="Equipos favoritos"
              subtitle={`${favorites.length} equipos guardados`}
              onBack={goBack}
            />

            {favoriteTeamData.length ? (
              <div className="favorites-grid">
                {favoriteTeamData.map((item) => {
                  const scout = teamScoutingStats(item.teamNumber)
                  return (
                    <article
                      className="favorite-card"
                      key={item.teamNumber}
                      style={quantumTeamStyle(item.teamNumber, true)}
                    >
                      <button
                        className="favorite-star"
                        onClick={() => toggleFavorite(item.teamNumber)}
                      >
                        ★
                      </button>
                      <span className="section-label">TEAM</span>
                      <h2>{item.teamNumber}</h2>
                      <p>{item.name || 'Equipo guardado'}</p>
                      <small>{scout.count} observaciones</small>
                      <button
                        className="profile-button"
                        onClick={() => openTeam(item.teamNumber)}
                      >
                        Ver perfil
                      </button>
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="empty-state">
                Todavía no has marcado equipos como favoritos.
              </div>
            )}
          </section>
        )}

        {view === 'scouting' && (
          <section className="scouting-page">
            <PageHeader
              label="QUANTUM"
              title="Scouting"
              subtitle="Match Scouting y Pit Scouting."
              onBack={goBack}
            />

            <div className="scouting-warning">
              {syncStatus === 'synced'
                ? 'Sincronización multiusuario activa. Los datos se comparten entre dispositivos.'
                : 'Modo local: no se pudo conectar con la base de datos. Tus datos siguen guardados en este navegador.'}
            </div>

            <div className="scouting-tabs">
              <button
                className={scoutingTab === 'match' ? 'active' : ''}
                onClick={() => setScoutingTab('match')}
              >
                Match Scouting
              </button>
              <button
                className={scoutingTab === 'pit' ? 'active' : ''}
                onClick={() => setScoutingTab('pit')}
              >
                Pit Scouting
              </button>
            </div>

            {scoutingTab === 'match' && (
              <>
                <form className="scouting-form" onSubmit={saveScoutingRecord}>
                  <div className="form-grid">
                    <div className="form-field">
                      <label>Evento</label>
                      <EventSearchSelect
                        events={events}
                        value={scoutingForm.eventKey}
                        onChange={async (eventKey) => {
                          updateScoutingField('eventKey', eventKey)
                          updateScoutingField('matchKey', '')
                          updateScoutingField('match', '')
                          updateScoutingField('teamNumber', '')
                          setMatches([])
                          setEventTeams([])

                          if (!eventKey) {
                            setSelectedEvent(null)
                            return
                          }

                          const event = events.find((item) => item.key === eventKey)

                          try {
                            const [teams, eventMatches] = await Promise.all([
                              fetchEventTeams(eventKey),
                              fetchEventMatches(eventKey)
                            ])
                            setSelectedEvent(event)
                            setEventTeams(teams)
                            setMatches(eventMatches)
                          } catch (error) {
                            console.error(error)
                            alert('No se pudieron cargar los datos del evento.')
                          }
                        }}
                      />
                    </div>

                    <div className="form-field">
                      <label>Match</label>
                      <select
                        value={scoutingForm.matchKey}
                        onChange={(e) => {
                          const key = e.target.value
                          const match = matches.find((item) => item.key === key)
                          updateScoutingField('matchKey', key)
                          updateScoutingField('match', match?.name || '')
                          updateScoutingField('teamNumber', '')
                        }}
                        disabled={!scoutingEvent}
                      >
                        <option value="">Selecciona match</option>
                        {matches.map((match) => (
                          <option key={match.key} value={match.key}>
                            {match.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-field">
                      <label>Equipo</label>
                      <select
                        value={scoutingForm.teamNumber}
                        onChange={(e) =>
                          updateScoutingField('teamNumber', e.target.value)
                        }
                        disabled={!scoutingEvent || !scoutingForm.match}
                      >
                        <option value="">Selecciona equipo</option>
                        {scoutingTeamOptions.map((item) => (
                          <option
                            key={item.teamNumber}
                            value={item.teamNumber}
                            style={quantumTeamTextStyle(item.teamNumber)}
                          >
                            {quantumTeamLabel(item)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="scouting-score-grid">
                    <NumberField
                      label="Auto"
                      value={scoutingForm.autoScore}
                      onChange={(value) =>
                        updateScoutingField('autoScore', value)
                      }
                    />
                    <NumberField
                      label="Teleop"
                      value={scoutingForm.teleopScore}
                      onChange={(value) =>
                        updateScoutingField('teleopScore', value)
                      }
                    />
                    <NumberField
                      label="Endgame"
                      value={scoutingForm.endgameScore}
                      onChange={(value) =>
                        updateScoutingField('endgameScore', value)
                      }
                    />
                    <NumberField
                      label="Ciclos"
                      value={scoutingForm.cycles}
                      onChange={(value) =>
                        updateScoutingField('cycles', value)
                      }
                    />
                    <NumberField
                      label="Faltas"
                      value={scoutingForm.fouls}
                      onChange={(value) =>
                        updateScoutingField('fouls', value)
                      }
                    />
                  </div>

                  <div className="form-grid two-columns">
                    <RangeField
                      label="Defensa"
                      min="0"
                      max="5"
                      value={scoutingForm.defense}
                      onChange={(value) =>
                        updateScoutingField('defense', value)
                      }
                    />
                    <RangeField
                      label="Consistencia"
                      min="1"
                      max="5"
                      value={scoutingForm.consistency}
                      onChange={(value) =>
                        updateScoutingField('consistency', value)
                      }
                    />
                  </div>

                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={scoutingForm.breakdown}
                      onChange={(e) =>
                        updateScoutingField('breakdown', e.target.checked)
                      }
                    />
                    <span>El robot presentó una falla</span>
                  </label>

                  <div className="form-field">
                    <label>Notas</label>
                    <textarea
                      rows="5"
                      placeholder="Defensa, velocidad, problemas, estrategia, observaciones..."
                      value={scoutingForm.notes}
                      onChange={(e) =>
                        updateScoutingField('notes', e.target.value)
                      }
                    />
                  </div>

                  <button className="save-scouting-button" type="submit">
                    Guardar scouting
                  </button>
                </form>

                <section className="scouting-history">
                  <div className="section-heading">
                    <div>
                      <span className="section-label">REGISTROS</span>
                      <h2>Scouting guardado</h2>
                      <p>{scoutingRecords.length} registros</p>
                    </div>
                  </div>

                  {scoutingRecords.length ? (
                    <div className="scouting-records">
                      {scoutingRecords.map((record) => (
                        <article className="scouting-record" key={record.id}>
                          <div className="scouting-record-top">
                            <div>
                              <span className="event-key">
                                {record.eventName}
                              </span>
                              <h3>Team {record.teamNumber}</h3>
                              <p>{record.match}</p>
                            </div>
                            <button
                              className="delete-button"
                              onClick={() => deleteScoutingRecord(record.id)}
                            >
                              Eliminar
                            </button>
                          </div>

                          <div className="scouting-record-stats">
                            <StatBox label="AUTO" value={record.autoScore} />
                            <StatBox label="TELEOP" value={record.teleopScore} />
                            <StatBox
                              label="ENDGAME"
                              value={record.endgameScore}
                            />
                            <StatBox label="CICLOS" value={record.cycles ?? 0} />
                            <StatBox
                              label="DEFENSA"
                              value={`${record.defense}/5`}
                            />
                            <StatBox
                              label="CONSISTENCIA"
                              value={`${record.consistency}/5`}
                            />
                          </div>

                          {record.breakdown && (
                            <div className="breakdown-badge">
                              Falla registrada
                            </div>
                          )}

                          {record.notes && (
                            <p className="scouting-notes">{record.notes}</p>
                          )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      Todavía no tienes registros de scouting.
                    </div>
                  )}
                </section>
              </>
            )}

            {scoutingTab === 'pit' && (
              <>
                <form className="scouting-form" onSubmit={savePitRecord}>
                  <div className="form-grid">
                    <div className="form-field">
                      <label>Evento</label>
                      <EventSearchSelect
                        events={events}
                        value={pitForm.eventKey}
                        onChange={async (eventKey) => {
                          updatePitField('eventKey', eventKey)
                          updatePitField('teamNumber', '')
                          setEventTeams([])

                          if (!eventKey) {
                            setSelectedEvent(null)
                            return
                          }

                          try {
                            const teams = await fetchEventTeams(eventKey)
                            const event = events.find((item) => item.key === eventKey)
                            setSelectedEvent(event)
                            setEventTeams(teams)
                          } catch (error) {
                            console.error(error)
                            alert('No se pudieron cargar los equipos.')
                          }
                        }}
                      />
                    </div>

                    <div className="form-field">
                      <label>Equipo</label>
                      <select
                        value={pitForm.teamNumber}
                        onChange={(e) =>
                          updatePitField('teamNumber', e.target.value)
                        }
                        disabled={!pitForm.eventKey}
                      >
                        <option value="">Selecciona equipo</option>
                        {selectedEvent?.key === pitForm.eventKey &&
                          eventTeams.map((item) => (
                            <option
                              key={item.teamNumber}
                              value={item.teamNumber}
                              style={quantumTeamTextStyle(item.teamNumber)}
                            >
                              {quantumTeamLabel(item)}
                            </option>
                          ))}
                      </select>
                    </div>

                    <TextField
                      label="Drivetrain"
                      value={pitForm.drivetrain}
                      onChange={(value) => updatePitField('drivetrain', value)}
                      placeholder="Mecanum, tank, omni..."
                    />
                    <TextField
                      label="Peso"
                      value={pitForm.weight}
                      onChange={(value) => updatePitField('weight', value)}
                      placeholder="Opcional"
                    />
                  </div>

                  <div className="form-grid">
                    <TextField
                      label="Ancho"
                      value={pitForm.width}
                      onChange={(value) => updatePitField('width', value)}
                      placeholder="Opcional"
                    />
                    <TextField
                      label="Largo"
                      value={pitForm.length}
                      onChange={(value) => updatePitField('length', value)}
                      placeholder="Opcional"
                    />
                    <TextField
                      label="Alto"
                      value={pitForm.height}
                      onChange={(value) => updatePitField('height', value)}
                      placeholder="Opcional"
                    />
                  </div>

                  <TextAreaField
                    label="Mecanismos"
                    value={pitForm.mechanisms}
                    onChange={(value) => updatePitField('mechanisms', value)}
                  />
                  <TextAreaField
                    label="Capacidades"
                    value={pitForm.capabilities}
                    onChange={(value) => updatePitField('capabilities', value)}
                  />
                  <TextAreaField
                    label="Estrategia preferida"
                    value={pitForm.strategy}
                    onChange={(value) => updatePitField('strategy', value)}
                  />
                  <TextAreaField
                    label="Notas"
                    value={pitForm.notes}
                    onChange={(value) => updatePitField('notes', value)}
                  />

                  <button className="save-scouting-button" type="submit">
                    Guardar Pit Scouting
                  </button>
                </form>

                <section className="scouting-history">
                  <div className="section-heading">
                    <div>
                      <span className="section-label">PIT</span>
                      <h2>Registros del robot</h2>
                      <p>{pitRecords.length} registros</p>
                    </div>
                  </div>

                  {pitRecords.length ? (
                    <div className="scouting-records">
                      {pitRecords.map((record) => (
                        <article className="scouting-record" key={record.id}>
                          <div className="scouting-record-top">
                            <div>
                              <span className="event-key">
                                {record.eventName}
                              </span>
                              <h3>Team {record.teamNumber}</h3>
                              <p>{record.drivetrain || 'Drivetrain sin registrar'}</p>
                            </div>
                            <button
                              className="delete-button"
                              onClick={() => deletePitRecord(record.id)}
                            >
                              Eliminar
                            </button>
                          </div>
                          <p>
                            <strong>Mecanismos:</strong>{' '}
                            {record.mechanisms || '—'}
                          </p>
                          <p>
                            <strong>Capacidades:</strong>{' '}
                            {record.capabilities || '—'}
                          </p>
                          <p>
                            <strong>Estrategia:</strong>{' '}
                            {record.strategy || '—'}
                          </p>
                          {record.notes && <p>{record.notes}</p>}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      Todavía no tienes Pit Scouting guardado.
                    </div>
                  )}
                </section>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

function PageHeader({ label, title, subtitle, onBack }) {
  return (
    <div className="page-header">
      <div>
        <span className="section-label">{label}</span>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <BackButton onClick={onBack} />
    </div>
  )
}

function BackButton({ onClick }) {
  return (
    <button className="back-button" onClick={onClick}>
      ← Regresar
    </button>
  )
}

function StatBox({ label, value }) {
  return (
    <div className="event-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function CompareStat({ label, value }) {
  return (
    <div className="compare-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function NumberField({ label, value, onChange }) {
  return (
    <div className="form-field">
      <label>{label}</label>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function TextField({ label, value, onChange, placeholder = '' }) {
  return (
    <div className="form-field">
      <label>{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function TextAreaField({ label, value, onChange }) {
  return (
    <div className="form-field">
      <label>{label}</label>
      <textarea
        rows="4"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function RangeField({ label, min, max, value, onChange }) {
  return (
    <div className="form-field">
      <label>
        {label}: {value}/{max}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}


function SortableHeader({ label, sortKey, sort, onSort, preferredDirection = 'desc' }) {
  const active = sort.key === sortKey
  const arrow = active ? (sort.direction === 'desc' ? '▼' : '▲') : '↕'
  return (
    <th>
      <button type="button" className={`table-sort-button ${active ? 'active' : ''}`} onClick={() => onSort(sortKey, preferredDirection)} title={`Ordenar por ${label}`}>
        <span>{label}</span>
        <span className="sort-arrow">{arrow}</span>
      </button>
    </th>
  )
}

function EventSearchSelect({
  events,
  value,
  onChange,
  placeholder = 'Buscar evento, ciudad o código...'
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const selectedEvent = events.find((event) => event.key === value)

  const filteredEvents = events
    .filter((event) => {
      const query = search.toLowerCase().trim()
      if (!query) return true

      return (
        event.name?.toLowerCase().includes(query) ||
        event.city?.toLowerCase().includes(query) ||
        event.state?.toLowerCase().includes(query) ||
        event.country?.toLowerCase().includes(query) ||
        event.key?.toLowerCase().includes(query)
      )
    })
    .slice(0, 12)

  const selectEvent = (event) => {
    setSearch('')
    setOpen(false)
    onChange(event.key)
  }

  const clearEvent = () => {
    setSearch('')
    setOpen(false)
    onChange('')
  }

  return (
    <div className="event-search-select">
      {selectedEvent && !open ? (
        <div className="event-search-selected">
          <button
            type="button"
            className="event-search-selected-info"
            onClick={() => setOpen(true)}
          >
            <span className="event-search-key">{selectedEvent.key}</span>
            <strong>{selectedEvent.name}</strong>
            <small>
              {[selectedEvent.city, selectedEvent.state, selectedEvent.country]
                .filter(Boolean)
                .join(', ')}
            </small>
          </button>

          <button
            type="button"
            className="event-search-clear"
            onClick={clearEvent}
            title="Cambiar evento"
          >
            ×
          </button>
        </div>
      ) : (
        <>
          <input
            type="text"
            value={search}
            placeholder={placeholder}
            autoComplete="off"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setSearch(e.target.value)
              setOpen(true)
            }}
          />

          {open && (
            <div className="event-search-results">
              {filteredEvents.length ? (
                filteredEvents.map((event) => (
                  <button
                    type="button"
                    className="event-search-result"
                    key={event.key}
                    onClick={() => selectEvent(event)}
                  >
                    <span className="event-search-key">{event.key}</span>
                    <strong>{event.name}</strong>
                    <small>
                      {[event.city, event.state, event.country]
                        .filter(Boolean)
                        .join(', ')}
                    </small>
                  </button>
                ))
              ) : (
                <div className="event-search-empty">
                  No se encontraron eventos.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TeamSelect({ label, value, teams, onChange }) {
  return (
    <div className="compare-picker">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Sin seleccionar</option>
        {teams.map((item) => (
          <option
            key={item.teamNumber}
            value={item.teamNumber}
            style={quantumTeamTextStyle(item.teamNumber)}
          >
            {quantumTeamLabel(item)}
          </option>
        ))}
      </select>
    </div>
  )
}

function AllianceBuilder({
  color,
  title,
  values,
  teams,
  summary,
  onChange,
  formatNumber
}) {
  return (
    <article className={`alliance-builder ${color}-builder`}>
      <span className="section-label">{title}</span>
      <h2>Alianza {title}</h2>

      <div className="alliance-pickers">
        {values.map((value, index) => (
          <TeamSelect
            key={index}
            label={`Equipo ${index + 1}`}
            value={value}
            teams={teams}
            onChange={(newValue) => onChange(color, index, newValue)}
          />
        ))}
      </div>

      <div className="comparison-stats">
        <CompareStat label="OPR combinado (analítica)" value={formatNumber(summary.opr)} />
        <CompareStat label="DPR combinado (analítica)" value={formatNumber(summary.dpr)} />
        <CompareStat
          label="CCWM combinado (analítica)"
          value={formatNumber(summary.ccwm)}
        />
        <CompareStat
          label="Auto scouting"
          value={formatNumber(summary.scoutingAuto)}
        />
        <CompareStat
          label="Teleop scouting"
          value={formatNumber(summary.scoutingTeleop)}
        />
        <CompareStat
          label="Endgame scouting"
          value={formatNumber(summary.scoutingEndgame)}
        />
        <CompareStat
          label="Defensa"
          value={formatNumber(summary.defense)}
        />
        <CompareStat
          label="Consistencia"
          value={formatNumber(summary.consistency)}
        />
      </div>
    </article>
  )
}

function MatchAlliances({ match, openTeam, large = false }) {
  const teamClick = (event, teamNumber) => {
    event.stopPropagation()
    openTeam(teamNumber)
  }

  return (
    <div className={large ? 'alliances alliances-large' : 'alliances'}>
      <div
        className={
          match.winner === 'red'
            ? 'alliance red-alliance winner-alliance'
            : 'alliance red-alliance'
        }
      >
        <div className="alliance-title">RED</div>
        <div className="match-teams">
          {(match.red?.teams || []).map((teamNumber) => (
            <button
              key={teamNumber}
              className="match-team-button"
              style={quantumTeamTextStyle(teamNumber)}
              onClick={(event) => teamClick(event, teamNumber)}
            >
              {teamNumber}
            </button>
          ))}
        </div>
        <div className="match-score">
          {match.red?.score !== null && match.red?.score >= 0
            ? match.red.score
            : '—'}
        </div>
      </div>

      <div className="versus">VS</div>

      <div
        className={
          match.winner === 'blue'
            ? 'alliance blue-alliance winner-alliance'
            : 'alliance blue-alliance'
        }
      >
        <div className="alliance-title">BLUE</div>
        <div className="match-teams">
          {(match.blue?.teams || []).map((teamNumber) => (
            <button
              key={teamNumber}
              className="match-team-button"
              style={quantumTeamTextStyle(teamNumber)}
              onClick={(event) => teamClick(event, teamNumber)}
            >
              {teamNumber}
            </button>
          ))}
        </div>
        <div className="match-score">
          {match.blue?.score !== null && match.blue?.score >= 0
            ? match.blue.score
            : '—'}
        </div>
      </div>
    </div>
  )
}


function LoginScreen({ password, setPassword, error, loading, onSubmit }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        background:
          'radial-gradient(circle at top, rgba(187,69,168,.18), transparent 38%), #100817',
        color: '#fff'
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: 'min(440px, 100%)',
          padding: '38px',
          borderRadius: '22px',
          border: '1px solid rgba(187,69,168,.45)',
          background: 'rgba(31,15,42,.96)',
          boxShadow: '0 24px 70px rgba(0,0,0,.45)'
        }}
      >
        <div
          style={{
            fontSize: '12px',
            fontWeight: 800,
            letterSpacing: '0.2em',
            color: '#BB45A8',
            marginBottom: '12px'
          }}
        >
          QUANTUM
        </div>

        <h1 style={{ margin: 0, fontSize: '34px' }}>Quantum FTC Scouting</h1>
        <p style={{ margin: '10px 0 28px', color: '#cdbbd3' }}>
          Acceso privado · FTC 24831 + 28076
        </p>

        <label
          htmlFor="quantum-password"
          style={{ display: 'block', marginBottom: '8px', fontWeight: 700 }}
        >
          Contraseña
        </label>

        <input
          id="quantum-password"
          type="password"
          autoComplete="current-password"
          placeholder="Escribe la contraseña"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '14px 16px',
            borderRadius: '12px',
            border: '1px solid #6d3375',
            outline: 'none',
            background: '#160c20',
            color: '#fff',
            fontSize: '16px'
          }}
        />

        {error && (
          <p
            role="alert"
            style={{ margin: '12px 0 0', color: '#ff9cae', fontWeight: 700 }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            marginTop: '20px',
            padding: '14px 18px',
            border: '1px solid #BB45A8',
            borderRadius: '12px',
            background: loading ? '#54205d' : '#490D64',
            color: '#fff',
            fontSize: '16px',
            fontWeight: 800,
            cursor: loading ? 'wait' : 'pointer'
          }}
        >
          {loading ? 'Verificando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

export default App

// Terminal 1:
// cd server
// node index.js
//
// Terminal 2:
// npm run dev