# YouTube Momentum

A full-stack dashboard for tracking YouTube music momentum: which tracks are accelerating, which artists are gaining speed, and which songs are breaking out across regions.

## What the app does

- fetches popular music videos from YouTube by region
- calculates momentum from snapshot history over a selected time window
- displays ranked leaderboards, rising tracks, trending artists, and viral alerts
- supports automatic backend refresh so history keeps accumulating even when no browser is open

## Project structure

- `client/` - React + Vite frontend
- `server/` - Express backend API and YouTube integration
- `server/services/youtubeDashboard.js` - data fetch, caching, history, momentum calculation, and dashboard payload shaping
- `server/lib/redis.js` - Redis connection helper
- `server/routes/dashboard.js` - `GET /api/dashboard`
- `client/src/App.jsx` - main dashboard composition
- `client/src/services/dashboardApi.js` - frontend API client

## Requirements

- Node.js 18+ for the backend dependencies
- a YouTube Data API key for live data
- Redis is optional, but strongly recommended if you want snapshot history to survive server restarts

Note: the current Vite version in `client/` declares a newer Node engine. If your local environment already runs the app successfully, keep using that version; otherwise prefer a current Node release.

## Environment setup

Create `server/.env` from `server/.env.example`.

Minimum example:

- `YOUTUBE_API_KEY=your_youtube_api_key_here`
- `PORT=3001`
- `YOUTUBE_CACHE_TTL_SECONDS=600`

Optional Redis configuration:

- `REDIS_URL=redis://user:password@host:port`

or:

- `REDIS_HOST=your_redis_host`
- `REDIS_PORT=6379`
- `REDIS_USERNAME=optional_username`
- `REDIS_PASSWORD=optional_password`

Optional auto-refresh configuration:

- `AUTO_REFRESH_ENABLED=true`
- `AUTO_REFRESH_INTERVAL_SECONDS=600`
- `AUTO_REFRESH_REGIONS=US,IL,FR,ES,GB,GLOBAL`

## How to run the project

### Install dependencies

From the repository root:

- `npm install`
- `npm install --prefix server`
- `npm install --prefix client`

### Run both frontend and backend in development

From the repository root:

- `npm run dev`

This starts:

- the backend on `http://localhost:3001`
- the frontend on `http://localhost:5173`

In development, Vite proxies `/api/*` requests to the backend via `client/vite.config.js`.

### Run each app separately

Backend only:

- `npm run dev:server`

Frontend only:

- `npm run dev:client`

You can also run inside each package directly:

- `npm run dev --prefix server`
- `npm run dev --prefix client`

### Production-style local run

Build the frontend:

- `npm run build`

Start the backend:

- `npm start`

Important: in the current repo, the Express server does not serve `client/dist` directly. The built frontend must be hosted separately or served by another web server/reverse proxy, with API requests routed to the Node backend.

### Windows note

If `npm` is not recognized in your terminal, use:

- `& 'C:\Program Files\nodejs\npm.cmd' run dev`

## Architecture

### Frontend

The frontend is a React app bootstrapped with Vite.

- `client/src/main.jsx` mounts the app
- `client/src/App.jsx` loads dashboard data, refresh settings, and renders the widget layout
- `client/src/services/dashboardApi.js` calls the backend endpoints
- `client/src/widgets/*` contains the dashboard widgets
- `client/src/components/*` contains reusable UI building blocks

The frontend is intentionally thin: it renders server-provided dashboard data rather than recalculating momentum in the browser.

### Backend

The backend is an Express service.

- `server/index.js` starts the app, loads env vars, exposes API routes, health info, and auto-refresh settings
- `server/routes/dashboard.js` parses request filters and delegates to the dashboard service
- `server/services/youtubeDashboard.js` is the main data engine

The backend is responsible for:

- fetching YouTube music data
- caching region results
- storing history snapshots
- calculating momentum and trends
- shaping the final payload consumed by the UI

### Data flow

1. the frontend calls `GET /api/dashboard`
2. the backend loads the current region entry from Redis or in-memory fallback
3. if cached data is still fresh, it is reused
4. otherwise the backend fetches fresh YouTube data and stores a new snapshot
5. momentum is calculated from the current snapshot, a comparison snapshot, and an earlier snapshot
6. the backend returns KPIs and widget-specific data structures to the frontend

### API endpoints

- `GET /api/dashboard` - main dashboard data
- `GET /api/settings/refresh` - current auto-refresh mode and options
- `PUT /api/settings/refresh` - switch between refresh profiles such as `10m` and `1m`
- `GET /api/health` - service, Redis, and auto-refresh health/status

## How momentum is calculated

Momentum is based on change in growth, not just raw views.

For a track:

- current gain = current views - comparison snapshot views
- previous gain = comparison snapshot views - earlier snapshot views
- momentum = current gain - previous gain

This means:

- positive momentum = view growth is accelerating
- negative momentum = view growth is decelerating
- zero momentum = growth rate is roughly flat

## How Redis is used

Redis is optional. If it is not configured, the app still works with in-memory storage for the current server process.

When Redis is configured, the backend uses it for persistence and shared state.

### What Redis stores

For each region, the backend stores:

- the latest track list
- metadata such as `updatedAt`, `fetchedAt`, `source`, and `lastError`
- a snapshot history list used for momentum and trend calculations

It also stores:

- the selected backend auto-refresh mode, so UI changes to refresh mode survive restarts

### Redis keys

Per region, keys follow this pattern:

- `ytm:region:{REGION}:tracks`
- `ytm:region:{REGION}:meta`
- `ytm:region:{REGION}:history`

Auto-refresh settings are stored at:

- `ytm:settings:auto-refresh`

### Why Redis matters here

Redis makes the dashboard materially better because it:

- preserves snapshot history across backend restarts
- allows momentum and rising-track calculations to continue building over time
- preserves the selected refresh mode after restart
- exposes meaningful Redis health through `/api/health`

Without Redis, cached data and history are lost whenever the backend restarts.

### Fallback behavior

If Redis is unavailable or misconfigured:

- the backend falls back to in-memory region entries
- the app can still serve data for the current process lifetime
- history persistence and persisted refresh mode are no longer durable across restarts

## Auto-refresh behavior

The backend can refresh YouTube data on a timer, independently of the browser.

Current supported refresh profiles:

- `10m` - refresh every 10 minutes, cache TTL 10 minutes
- `1m` - refresh every 1 minute, cache TTL 30 minutes

On startup, the server:

- loads any persisted refresh mode from Redis if available
- applies the corresponding refresh interval and cache TTL
- starts the auto-refresh timer

When the UI changes the refresh mode, the backend:

- applies the new mode immediately
- reschedules the timer
- persists the mode
- returns the response immediately
- triggers the actual refresh cycle in the background

## Deployment

### What this repository currently supports

This repo is structured as two deployable pieces:

- a static frontend build from `client/dist`
- a Node.js backend from `server/index.js`

There is no Dockerfile, process manager config, or built-in static file serving from Express in the current codebase, so deployment is currently a simple split deployment.

### Recommended production deployment model

1. build the frontend with `npm run build`
2. host `client/dist` on a static host or web server
3. run the backend with `npm start`
4. route frontend API calls to the backend `/api` endpoints
5. configure the required server environment variables
6. attach Redis if you want durable history and persisted refresh settings

### Production concerns to account for

- configure CORS and/or a reverse proxy appropriately for your frontend host
- ensure the frontend can reach the backend `/api` base URL in production
- keep `server/.env` or equivalent secret management out of version control
- use Redis for persistent history if momentum continuity matters
- monitor `GET /api/health` for Redis and auto-refresh status

### Example deployment checklist

- set `YOUTUBE_API_KEY`
- set `PORT`
- set Redis connection variables if using Redis
- decide whether `AUTO_REFRESH_ENABLED` should be on
- configure `AUTO_REFRESH_REGIONS`
- build the client
- run the server
- verify `/api/health`

## Quota-friendly YouTube usage

- uses `videos.list` with `chart=mostPopular` and `videoCategoryId=10`
- avoids `search.list`, which is much more expensive
- caches results per region using `YOUTUBE_CACHE_TTL_SECONDS`
- applies text search locally on cached results so typing in the UI does not trigger new YouTube API calls

## Important files

- `package.json` - root dev/build/start orchestration
- `client/vite.config.js` - Vite dev server and `/api` proxy
- `server/index.js` - backend bootstrap, health, and auto-refresh settings endpoints
- `server/routes/dashboard.js` - dashboard route
- `server/services/youtubeDashboard.js` - fetch, cache, history, momentum, and payload composition
- `server/lib/redis.js` - Redis connection and status helper
- `server/lib/autoRefreshSettings.js` - refresh profiles and env inference
- `server/lib/refreshModeUpdater.js` - non-blocking refresh-mode updates
- `server/data/mockDashboardFallback.js` - fallback payloads when live fetches fail
- `server/.env.example` - environment template

## Health and troubleshooting

Use `GET /api/health` to inspect:

- overall service availability
- Redis configured/connected state
- Redis error state
- current auto-refresh mode
- auto-refresh last run / last error

If live YouTube requests fail and no cached data is available, the app can fall back to mock data. If cached data exists, the backend can continue serving stale cached results with error info in the payload.
