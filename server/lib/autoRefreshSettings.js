const DEFAULT_REFRESH_MODE = '10m';

const REFRESH_PROFILES = {
  '10m': {
    mode: '10m',
    label: 'Every 10 minutes',
    intervalSeconds: 10 * 60,
    intervalMinutes: 10,
    cacheTtlSeconds: 10 * 60,
    cacheTtlMinutes: 10,
  },
  '1m': {
    mode: '1m',
    label: 'Every 1 minute',
    intervalSeconds: 60,
    intervalMinutes: 1,
    cacheTtlSeconds: 30 * 60,
    cacheTtlMinutes: 30,
  },
};

function normalizeRefreshMode(mode) {
  return REFRESH_PROFILES[mode] ? mode : DEFAULT_REFRESH_MODE;
}

function getRefreshProfile(mode) {
  return { ...REFRESH_PROFILES[normalizeRefreshMode(mode)] };
}

function inferRefreshModeFromEnv(env = process.env) {
  const intervalSeconds = Number(env.AUTO_REFRESH_INTERVAL_SECONDS);
  const cacheTtlSeconds = Number(env.YOUTUBE_CACHE_TTL_SECONDS);

  if (intervalSeconds === REFRESH_PROFILES['1m'].intervalSeconds || cacheTtlSeconds === REFRESH_PROFILES['1m'].cacheTtlSeconds) {
    return '1m';
  }

  return DEFAULT_REFRESH_MODE;
}

module.exports = {
  DEFAULT_REFRESH_MODE,
  REFRESH_PROFILES,
  normalizeRefreshMode,
  getRefreshProfile,
  inferRefreshModeFromEnv,
};