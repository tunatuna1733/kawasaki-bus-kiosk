import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { loadConfig, saveConfig } from './config'
import { fetchDepartures, fetchStops } from './gtfs'

const app = new Hono()

// --- Pages -----------------------------------------------------------------------------
// Kiosk display (full-screen board) and the LAN dashboard used to configure it.
app.get('/', serveStatic({ path: './public/kiosk.html' }))
app.get('/dashboard', serveStatic({ path: './public/dashboard.html' }))
app.get('/*', serveStatic({ root: './public' }))

// --- API -------------------------------------------------------------------------------

// Stop list for the dashboard's stop pickers.
app.get('/api/stops', async (c) => {
  try {
    return c.json(await fetchStops())
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 502)
  }
})

// Current kiosk configuration.
app.get('/api/config', async (c) => c.json(await loadConfig()))

// Save configuration from the dashboard.
app.post('/api/config', async (c) => {
  try {
    const body = await c.req.json()
    return c.json(await saveConfig(body))
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }
})

// Aggregated departures for every configured route — the kiosk's polling endpoint.
app.get('/api/departures', async (c) => {
  const config = await loadConfig()
  const payload = await fetchDepartures(config.routes, config.maxDepartures)
  return c.json({ ...payload, refreshSeconds: config.refreshSeconds })
})

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
}
