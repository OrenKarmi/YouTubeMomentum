## Project name + team members

**Project:** YouTube Momentum  
**Team members:** Oren Karmi

## What it does

YouTube Momentum is a full-stack dashboard for tracking which music videos are accelerating on YouTube across regions. Instead of only showing the most-viewed tracks, it focuses on momentum: which songs are gaining speed, which artists are picking up traction, and which tracks are emerging as viral breakouts.

The app fetches popular music videos by region, stores repeated snapshots over time, and compares those snapshots across a selected time window. It then presents the results through leaderboards and charts such as total views, views gained between samples, rising tracks, trending artists, and viral alerts.

In short, it is a lightweight analytics layer on top of YouTube popularity data, designed to answer: “What is breaking out right now?”

## How it uses AI tooling in the build and/or runtime

This project uses AI tooling primarily in the **build/development process**, not as an end-user runtime feature.

AI-assisted coding tools were used to:

- accelerate prototyping of the React + Express app structure
- iterate on data modeling for momentum and trend calculations
- refactor backend caching and refresh logic
- debug chart alignment and sampling issues
- generate and refine targeted tests for edge cases
- speed up documentation and UX copy iteration

The AI acted as a development copilot rather than a decision-maker in production. Final behavior was still validated through local testing, builds, and manual inspection of the dashboard output.

## How it uses Redis (architecture / flow)

Redis is used as the app’s persistence and shared-state layer.

For each region, Redis stores:

- the latest fetched track list
- metadata such as `updatedAt`, `fetchedAt`, and error/source info
- snapshot history over time, which is required for momentum calculations and charts

Redis also stores the selected backend auto-refresh mode, so refresh settings persist across server restarts.

### Simple architecture / flow

1. The frontend requests dashboard data from the backend (`GET /api/dashboard`).
2. The backend checks Redis for the latest cached region data and stored history.
3. If the cached data is still fresh, it is reused.
4. If not, the backend fetches fresh YouTube music data and writes updated tracks, metadata, and a new history snapshot into Redis.
5. The backend computes momentum/trend metrics from the stored snapshot history.
6. The backend returns a pre-shaped payload for the frontend to render.

Why Redis matters here:

- it preserves history across backend restarts
- it allows momentum to improve over time as more snapshots accumulate
- it supports auto-refresh without relying on an open browser session
- it keeps refresh-mode settings durable across sessions

Without Redis, the app still works with in-memory fallback, but history is lost when the backend restarts.

## Simple run instructions

### Setup

1. Create `server/.env` from `server/.env.example`.
2. Add a valid `YOUTUBE_API_KEY`.
3. Optionally configure Redis with `REDIS_URL`.

### Run locally

From the repo root:

- `npm install`
- `npm install --prefix server`
- `npm install --prefix client`
- `npm run dev`

This starts:

- backend on `http://localhost:3001`
- frontend on `http://localhost:5173`

### One basic flow to try

1. Open the frontend in the browser.
2. Choose a region such as **US**.
3. Select a time window (for example, **1 hour**).
4. Review the **Rising Tracks Leaderboard** and **Views Gained Between Samples** chart.
5. Change the backend refresh mode (for example from **10 min** to **1 min**) and click **Refresh dashboard**.
6. Observe how the dashboard updates using cached/history-aware backend data and highlights tracks with accelerating momentum.

This demonstrates the main idea of the project: combining cached YouTube snapshots plus Redis-backed history to surface not only popularity, but acceleration.