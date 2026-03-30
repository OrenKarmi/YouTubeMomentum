const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_REFRESH_MODE,
  getRefreshProfile,
  inferRefreshModeFromEnv,
  normalizeRefreshMode,
} = require('./autoRefreshSettings');

test('normalizeRefreshMode falls back to the default mode', () => {
  assert.equal(normalizeRefreshMode('bad-mode'), DEFAULT_REFRESH_MODE);
  assert.equal(normalizeRefreshMode('1m'), '1m');
});

test('getRefreshProfile returns the 1 minute profile with a 30 minute cache ttl', () => {
  const profile = getRefreshProfile('1m');

  assert.equal(profile.intervalMinutes, 1);
  assert.equal(profile.cacheTtlMinutes, 30);
});

test('inferRefreshModeFromEnv detects the 1 minute profile from env values', () => {
  assert.equal(inferRefreshModeFromEnv({ AUTO_REFRESH_INTERVAL_SECONDS: '60' }), '1m');
  assert.equal(inferRefreshModeFromEnv({ YOUTUBE_CACHE_TTL_SECONDS: '1800' }), '1m');
  assert.equal(inferRefreshModeFromEnv({ AUTO_REFRESH_INTERVAL_SECONDS: '600' }), '10m');
});