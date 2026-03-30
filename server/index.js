const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const dashboardRouter = require('./routes/dashboard');
const { getRedisClient, getRedisStatus } = require('./lib/redis');
const { updateAutoRefreshMode: updateAutoRefreshModeWithBackgroundRefresh } = require('./lib/refreshModeUpdater');
const { refreshRegionSnapshot } = require('./services/youtubeDashboard');
const {
  DEFAULT_REFRESH_MODE,
  REFRESH_PROFILES,
  normalizeRefreshMode,
  getRefreshProfile,
  inferRefreshModeFromEnv,
} = require('./lib/autoRefreshSettings');

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3001;
const AUTO_REFRESH_SETTINGS_KEY = 'ytm:settings:auto-refresh';

function parseBooleanEnv(value, defaultValue = false) {
  if (value == null || value === '') return defaultValue;

  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function getAutoRefreshRegions() {
  const raw = process.env.AUTO_REFRESH_REGIONS || 'US,IL,FR,ES,GB,GLOBAL';
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildRefreshSettingsResponse(mode) {
  return {
    ...getRefreshProfile(mode),
    options: Object.values(REFRESH_PROFILES),
  };
}

const autoRefresh = {
  enabled: parseBooleanEnv(process.env.AUTO_REFRESH_ENABLED, true),
  mode: inferRefreshModeFromEnv(process.env),
  intervalMs: getRefreshProfile(inferRefreshModeFromEnv(process.env)).intervalSeconds * 1000,
  regions: getAutoRefreshRegions(),
  timer: null,
  running: false,
  lastRunAt: null,
  lastError: null,
};

function clearAutoRefreshTimer() {
  if (autoRefresh.timer) {
    clearInterval(autoRefresh.timer);
    autoRefresh.timer = null;
  }
}

function scheduleAutoRefreshTimer() {
  clearAutoRefreshTimer();

  if (!autoRefresh.enabled) {
    return;
  }

  autoRefresh.timer = setInterval(runAutoRefreshCycle, autoRefresh.intervalMs);
}

async function saveAutoRefreshMode(mode) {
  try {
    const redis = await getRedisClient();
    if (!redis) return;

    await redis.set(
      AUTO_REFRESH_SETTINGS_KEY,
      JSON.stringify({
        mode,
        updatedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // Keep the in-memory setting even if persistence fails.
  }
}

async function loadPersistedAutoRefreshMode() {
  try {
    const redis = await getRedisClient();
    if (!redis) return null;

    const raw = await redis.get(AUTO_REFRESH_SETTINGS_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return normalizeRefreshMode(parsed?.mode);
  } catch {
    return null;
  }
}

function applyAutoRefreshMode(mode) {
  const profile = getRefreshProfile(mode);

  autoRefresh.mode = profile.mode;
  autoRefresh.intervalMs = profile.intervalSeconds * 1000;
  process.env.AUTO_REFRESH_INTERVAL_SECONDS = String(profile.intervalSeconds);
  process.env.YOUTUBE_CACHE_TTL_SECONDS = String(profile.cacheTtlSeconds);

  return profile;
}

async function runAutoRefreshCycle() {
  if (!autoRefresh.enabled || autoRefresh.running) {
    return;
  }

  autoRefresh.running = true;

  try {
    for (const region of autoRefresh.regions) {
      await refreshRegionSnapshot(region);
    }

    autoRefresh.lastRunAt = new Date().toISOString();
    autoRefresh.lastError = null;
    console.log(`Auto-refresh completed for regions: ${autoRefresh.regions.join(', ')}`);
  } catch (error) {
    autoRefresh.lastError = error.message;
    console.error(`Auto-refresh failed: ${error.message}`);
  } finally {
    autoRefresh.running = false;
  }
}

function startAutoRefresh() {
  if (!autoRefresh.enabled) {
    console.log('Backend auto-refresh disabled');
    return;
  }

  runAutoRefreshCycle();
  scheduleAutoRefreshTimer();
}

async function updateAutoRefreshMode(mode) {
  return updateAutoRefreshModeWithBackgroundRefresh(mode, {
    applyAutoRefreshMode,
    scheduleAutoRefreshTimer,
    saveAutoRefreshMode,
    runAutoRefreshCycle,
    buildRefreshSettingsResponse,
    onBackgroundRefreshError(error) {
      autoRefresh.lastError = error.message;
      console.error(`Background auto-refresh failed: ${error.message}`);
    },
  });
}

async function initializeAutoRefresh() {
  const persistedMode = await loadPersistedAutoRefreshMode();
  applyAutoRefreshMode(persistedMode || autoRefresh.mode || DEFAULT_REFRESH_MODE);
  startAutoRefresh();
}

app.use(cors());
app.use(express.json());

app.get('/api/settings/refresh', (_req, res) => {
  res.json(buildRefreshSettingsResponse(autoRefresh.mode));
});

app.put('/api/settings/refresh', async (req, res) => {
  const requestedMode = req.body?.mode;

  if (!REFRESH_PROFILES[requestedMode]) {
    res.status(400).json({
      error: 'Invalid refresh mode. Expected one of: 10m, 1m.',
    });
    return;
  }

  const settings = await updateAutoRefreshMode(requestedMode);
  res.json(settings);
});

app.get('/api/health', async (_req, res) => {
  try {
    const redis = await getRedisClient();
    if (redis) {
      await redis.ping();
    }
  } catch {
    // Status is reported via getRedisStatus().
  }

  res.json({
    ok: true,
    service: 'youtube-momentum-server',
    redis: getRedisStatus(),
    autoRefresh: {
      enabled: autoRefresh.enabled,
      mode: autoRefresh.mode,
      intervalSeconds: Math.round(autoRefresh.intervalMs / 1000),
      intervalMinutes: Math.round(autoRefresh.intervalMs / (60 * 1000)),
      cacheTtlMinutes: getRefreshProfile(autoRefresh.mode).cacheTtlMinutes,
      regions: autoRefresh.regions,
      running: autoRefresh.running,
      lastRunAt: autoRefresh.lastRunAt,
      lastError: autoRefresh.lastError,
    },
  });
});

app.use('/api/dashboard', dashboardRouter);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  initializeAutoRefresh().catch((error) => {
    autoRefresh.lastError = error.message;
    console.error(`Auto-refresh initialization failed: ${error.message}`);
    startAutoRefresh();
  });
});
