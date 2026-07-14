// Thin client + normalizer for the Kawasaki GTFS API
// (https://github.com/tunatuna1733/kawasaki-gtfs-api).
// The base URL comes from an env var so it never reaches the browser; the kiosk/dashboard
// only ever talk to our own server, which proxies and reshapes the upstream responses.

import type { RouteConfig } from './config'

const BASE = (process.env.GTFS_API_BASE ?? '').replace(/\/+$/, '')
const FETCH_TIMEOUT_MS = 8000

if (!BASE) {
  console.warn('[gtfs] GTFS_API_BASE is not set — /api/stops and /api/departures will fail until it is configured.')
}

const apiFetch = async (path: string): Promise<Response> => {
  if (!BASE) throw new Error('GTFS_API_BASE is not configured')
  return fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
}

// --- Upstream response shapes (only the fields we use) ---------------------------------

export type Stop = { name: string; hiragana: string }

type UpstreamStop = {
  id: string
  name: string
  sequence: number
  delay: number
  time: number
  scheduledTime: number
}

type UpstreamTrip = {
  trip: {
    id: string
    routeData?: { routeID: string; routeName?: string; routeNameLong?: string }
    stops: UpstreamStop[]
  }
  vehicle?: { currentStatus?: string }
}

type DetailResponse = {
  success: boolean
  data?: { lastUpdated: number; data: UpstreamTrip[] }
  error?: string
}

// --- Normalized shapes returned to the browser -----------------------------------------

export type Departure = {
  routeName: string // bus line/route name for this specific trip
  timeMs: number | null // realtime predicted departure (epoch ms)
  scheduledMs: number | null // scheduled departure (epoch ms)
  delaySec: number // positive = late
  status: string // INCOMING_AT | STOPPED_AT | IN_TRANSIT_TO
  etaSec: number | null // seconds from now until departure (kiosk recomputes live per second)
}

export type RouteDepartures = {
  label: string
  from: string
  to: string
  departures: Departure[]
  error?: string
}

export type DeparturesPayload = {
  lastUpdated: number // epoch ms of this aggregation
  routes: RouteDepartures[]
}

// Convert an upstream timestamp to epoch milliseconds, tolerating the three plausible
// encodings (epoch ms, epoch seconds, or GTFS seconds-since-midnight) so formatting stays
// correct regardless of which the upstream actually uses.
const jstMidnightMs = (): number => {
  const JST = 9 * 60 * 60 * 1000
  return Math.floor((Date.now() + JST) / 86400000) * 86400000 - JST
}

const toEpochMs = (value: number | undefined | null): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  if (value > 1e12) return value // already epoch ms
  if (value > 1e9) return value * 1000 // epoch seconds
  return jstMidnightMs() + value * 1000 // seconds since midnight
}

export const fetchStops = async (): Promise<Stop[]> => {
  const res = await apiFetch('/stops')
  if (!res.ok) throw new Error(`stops request failed: ${res.status}`)
  return (await res.json()) as Stop[]
}

const normalizeTrip = (t: UpstreamTrip, from: string): Departure | null => {
  const stops = [...(t.trip.stops ?? [])].sort((a, b) => a.sequence - b.sequence)
  if (stops.length === 0) return null
  // The departure stop is the configured `from`; fall back to the first stop in sequence.
  const dep = stops.find((s) => s.name === from) ?? stops[0]
  const timeMs = toEpochMs(dep.time) ?? toEpochMs(dep.scheduledTime)
  const scheduledMs = toEpochMs(dep.scheduledTime)
  if (timeMs === null && scheduledMs === null) return null
  const basis = timeMs ?? scheduledMs
  return {
    routeName: t.trip.routeData?.routeName ?? t.trip.routeData?.routeNameLong ?? '',
    timeMs,
    scheduledMs,
    delaySec: typeof dep.delay === 'number' ? dep.delay : 0,
    status: t.vehicle?.currentStatus ?? '',
    etaSec: basis === null ? null : Math.round((basis - Date.now()) / 1000),
  }
}

const fetchRoute = async (route: RouteConfig, maxDepartures: number): Promise<RouteDepartures> => {
  const label = route.label ?? ''
  const base: RouteDepartures = { label, from: route.from, to: route.to, departures: [] }
  try {
    const res = await apiFetch(`/kawasaki-bus-detail?from=${encodeURIComponent(route.from)}&to=${encodeURIComponent(route.to)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as DetailResponse
    if (!json.success || !json.data) throw new Error(json.error ?? 'upstream returned no data')

    const trips = json.data.data ?? []
    base.departures = trips
      .map((t) => normalizeTrip(t, route.from))
      .filter((d): d is Departure => d !== null)
      // Drop buses that already left more than ~2 min ago; keep imminent/soon ones.
      .filter((d) => d.etaSec === null || d.etaSec >= -120)
      .sort((a, b) => (a.timeMs ?? a.scheduledMs ?? 0) - (b.timeMs ?? b.scheduledMs ?? 0))
      .slice(0, maxDepartures)
    return base
  } catch (err) {
    base.error = err instanceof Error ? err.message : String(err)
    return base
  }
}

// Fetch every configured route in parallel; per-route failures are captured as `error`
// so one dead route never blanks the whole board.
export const fetchDepartures = async (routes: RouteConfig[], maxDepartures: number): Promise<DeparturesPayload> => {
  const results = await Promise.all(routes.map((r) => fetchRoute(r, maxDepartures)))
  return { lastUpdated: Date.now(), routes: results }
}
