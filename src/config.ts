// Persistent kiosk configuration, edited from the dashboard and read by the kiosk.
// Stored as a JSON file on disk so it survives restarts and is shared by every viewer.

export type RouteConfig = {
  from: string // departure stop name (must match a GTFS stop name)
  to: string // destination stop name
  label?: string // optional display label (falls back to the route name from the API)
}

export type KioskConfig = {
  routes: RouteConfig[]
  refreshSeconds: number // how often the kiosk polls for fresh data
  maxDepartures: number // how many upcoming departures to show per route
}

const CONFIG_PATH = process.env.CONFIG_PATH ?? './config.json'

export const DEFAULT_CONFIG: KioskConfig = {
  routes: [],
  refreshSeconds: 10,
  maxDepartures: 3,
}

const clamp = (n: number, min: number, max: number, fallback: number) =>
  Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback

// Coerce arbitrary parsed JSON into a valid KioskConfig, dropping malformed entries.
export const normalizeConfig = (raw: unknown): KioskConfig => {
  const obj = (raw ?? {}) as Partial<KioskConfig>
  const routes: RouteConfig[] = Array.isArray(obj.routes)
    ? obj.routes
        .filter(
          (r): r is RouteConfig =>
            !!r && typeof r.from === 'string' && typeof r.to === 'string' && r.from.trim() !== '' && r.to.trim() !== '',
        )
        .map((r) => ({
          from: r.from.trim(),
          to: r.to.trim(),
          ...(r.label && typeof r.label === 'string' && r.label.trim() !== '' ? { label: r.label.trim() } : {}),
        }))
    : []

  return {
    routes,
    refreshSeconds: clamp(Number(obj.refreshSeconds), 5, 3600, DEFAULT_CONFIG.refreshSeconds),
    maxDepartures: clamp(Number(obj.maxDepartures), 1, 10, DEFAULT_CONFIG.maxDepartures),
  }
}

export const loadConfig = async (): Promise<KioskConfig> => {
  try {
    const file = Bun.file(CONFIG_PATH)
    if (!(await file.exists())) return { ...DEFAULT_CONFIG }
    return normalizeConfig(await file.json())
  } catch {
    // Corrupt or unreadable config should not take the kiosk down.
    return { ...DEFAULT_CONFIG }
  }
}

export const saveConfig = async (raw: unknown): Promise<KioskConfig> => {
  const config = normalizeConfig(raw)
  await Bun.write(CONFIG_PATH, JSON.stringify(config, null, 2))
  return config
}
