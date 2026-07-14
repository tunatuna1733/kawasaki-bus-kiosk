# kawasaki-bus-kiosk

A simple kiosk-mode bus departure board for Kawasaki, backed by the
[kawasaki-gtfs-api](https://github.com/tunatuna1733/kawasaki-gtfs-api).

- **Kiosk display** (`/`) — full-screen board showing the next few departures for 2–3
  routes, auto-refreshing every ~10s. Meant for a dedicated screen.
- **Dashboard** (`/dashboard`) — a normal (mobile-friendly) page you open from another
  device on the LAN to choose the departure → destination stops for each route. Changes
  are picked up by the kiosk automatically on its next refresh.

The server (Bun + [Hono](https://hono.dev)) proxies the GTFS API so the API URL stays
server-side (set via env var), CORS is avoided, and the front-ends stay plain static HTML.

## Setup

```sh
bun install
cp .env.example .env   # then edit GTFS_API_BASE to point at your GTFS API instance
```

Environment variables (see `.env.example`):

| Variable         | Required | Default          | Description                                  |
| ---------------- | -------- | ---------------- | -------------------------------------------- |
| `GTFS_API_BASE`  | yes      | —                | Base URL of the kawasaki-gtfs-api server     |
| `PORT`           | no       | `3000`           | Port this kiosk server listens on            |
| `CONFIG_PATH`    | no       | `./config.json`  | Where dashboard settings are persisted       |

## Run

```sh
bun run dev
```

- Kiosk: `http://<host>:3000/`
- Dashboard: `http://<host>:3000/dashboard`

Open the dashboard from a phone/laptop on the same LAN, pick the stops for each route,
and press 保存 (Save). The kiosk board updates on its next poll.

## How it works

- `GET /api/stops` — proxies the GTFS `/stops` list (populates the dashboard pickers).
- `GET /api/config` / `POST /api/config` — read/write the persisted route configuration.
- `GET /api/departures` — for each configured route, calls the GTFS
  `/kawasaki-bus-detail` endpoint and returns the next departures (time, ETA, delay,
  vehicle status) for the kiosk to render.
