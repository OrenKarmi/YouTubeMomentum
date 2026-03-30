const { buildDashboardResponse: buildMockDashboardResponse } = require('../data/mockDashboardFallback');
const { getRedisClient } = require('../lib/redis');

const MUSIC_CATEGORY_ID = '10';
const MAX_RESULTS = 50;
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const HISTORY_LIMIT = 288;
const MAX_TREND_POINTS = HISTORY_LIMIT;
const SONGS_LEADERBOARD_LIMIT = 10;
const LEADERBOARD_LIMIT = 6;
const TREND_WIDGET_LIMIT = 10;
const ALERT_WIDGET_LIMIT = 3;
const NEW_SONG_WIDGET_LIMIT = 4;
const SHARED_AXIS_TICK_COUNT = 4;
const DUPLICATE_SNAPSHOT_GAP_MS = 1000;
const BLOCKED_VIDEO_IDS = new Set(['b4iVv91Z6lY']);
const REDIS_ENTRY_TTL_SECONDS = 7 * 24 * 60 * 60;
const WINDOW_UNIT_MS = {
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
  months: 30 * 24 * 60 * 60 * 1000,
};

const LEGACY_WINDOW_PRESETS = {
  '10m': { amount: 10, unit: 'minutes' },
  '1h': { amount: 1, unit: 'hours' },
  '6h': { amount: 6, unit: 'hours' },
  '1d': { amount: 1, unit: 'days' },
  '1w': { amount: 1, unit: 'weeks' },
  '1m': { amount: 1, unit: 'months' },
  '24h': { amount: 24, unit: 'hours' },
};

const WINDOW_MS = Object.fromEntries(
  Object.entries(LEGACY_WINDOW_PRESETS).map(([key, value]) => [key, value.amount * WINDOW_UNIT_MS[value.unit]]),
);

const regionCache = new Map();
const refreshPromises = new Map();

function normalizeRegion(region) {
  const normalized = String(region || 'US').trim().toUpperCase();

  if (normalized === 'GLOBAL') return null;
  if (normalized === 'ISRAEL') return 'IL';
  if (normalized === 'FRANCE') return 'FR';
  if (normalized === 'SPAIN') return 'ES';
  if (normalized === 'UK' || normalized === 'UNITED KINGDOM' || normalized === 'BRITAIN') return 'GB';
  if (normalized === 'USA') return 'US';
  return normalized || 'US';
}

function getApiKey() {
  return process.env.YOUTUBE_API_KEY || process.env.YouTube_API_KEY || '';
}

function getCacheTtlMs() {
  const raw = Number(process.env.YOUTUBE_CACHE_TTL_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? raw * 1000 : DEFAULT_CACHE_TTL_MS;
}

function getRefreshIntervalMs() {
  const raw = Number(process.env.AUTO_REFRESH_INTERVAL_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? raw * 1000 : DEFAULT_CACHE_TTL_MS;
}

function hasRecentFetch(entry, now, maxAgeMs) {
  const fetchedAt = Number(entry?.fetchedAt || 0);
  return fetchedAt > 0 && now - fetchedAt < maxAgeMs;
}

function shouldSkipFetch(entry, now, options = {}) {
  if (hasRecentFetch(entry, now, getRefreshIntervalMs())) {
    return true;
  }

  if (!options.force && hasRecentFetch(entry, now, getCacheTtlMs())) {
    return true;
  }

  return false;
}

function getRegionKey(region) {
  return normalizeRegion(region) || 'GLOBAL';
}

function getRedisKeys(regionKey) {
  return {
    tracksKey: `ytm:region:${regionKey}:tracks`,
    metaKey: `ytm:region:${regionKey}:meta`,
    historyKey: `ytm:region:${regionKey}:history`,
  };
}

function createEmptyEntry(storage = 'memory') {
  return {
    tracks: [],
    updatedAt: null,
    fetchedAt: 0,
    history: [],
    source: 'empty',
    lastError: '',
    storage,
  };
}

function parseJson(value, fallback) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeWindowUnit(unit) {
  const normalized = String(unit || '').trim().toLowerCase();

  if (['m', 'min', 'mins', 'minute', 'minutes'].includes(normalized)) return 'minutes';
  if (['h', 'hr', 'hrs', 'hour', 'hours'].includes(normalized)) return 'hours';
  if (['d', 'day', 'days'].includes(normalized)) return 'days';
  if (['w', 'wk', 'wks', 'week', 'weeks'].includes(normalized)) return 'weeks';
  if (['mo', 'mon', 'month', 'months'].includes(normalized)) return 'months';
  return 'hours';
}

function parseWindowAmount(value, fallback = 1) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseLegacyWindow(windowValue) {
  if (typeof windowValue !== 'string') {
    return null;
  }

  if (LEGACY_WINDOW_PRESETS[windowValue]) {
    return LEGACY_WINDOW_PRESETS[windowValue];
  }

  const match = windowValue.trim().toLowerCase().match(/^([0-9]+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|mon|month|months)$/);
  if (!match) {
    return null;
  }

  return {
    amount: parseWindowAmount(match[1], 1),
    unit: normalizeWindowUnit(match[2]),
  };
}

function resolveWindowSelection(filters = {}) {
  const legacyWindow = parseLegacyWindow(filters.window);
  const amount = parseWindowAmount(filters.windowAmount, legacyWindow?.amount || 1);
  const unit = normalizeWindowUnit(filters.windowUnit || legacyWindow?.unit || 'hours');

  return {
    amount,
    unit,
    requestedMs: amount * WINDOW_UNIT_MS[unit],
  };
}

function getWindowMs(windowKey) {
  if (Number.isFinite(windowKey) && windowKey > 0) {
    return windowKey;
  }

  const parsedWindow = parseLegacyWindow(windowKey);
  if (parsedWindow) {
    return parsedWindow.amount * WINDOW_UNIT_MS[parsedWindow.unit];
  }

  return WINDOW_MS[windowKey] || WINDOW_MS['1h'];
}

function pickThumbnail(snippet) {
  const thumbnails = snippet?.thumbnails || {};
  return thumbnails.maxres?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || '';
}

function buildYoutubeVideoUrl(videoId) {
  if (!videoId) return '';
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

function buildYoutubeChannelUrl(channelId) {
  if (!channelId) return '';
  return `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`;
}

function mapYoutubeItem(item) {
  const channelId = item.snippet?.channelId || '';

  return {
    id: item.id,
    title: item.snippet?.title || 'Unknown title',
    artist: item.snippet?.channelTitle || 'Unknown artist',
    channelId,
    views: Number(item.statistics?.viewCount || 0),
    likes: Number(item.statistics?.likeCount || 0),
    comments: Number(item.statistics?.commentCount || 0),
    publishedAt: item.snippet?.publishedAt || null,
    thumbnail: pickThumbnail(item.snippet),
    videoUrl: buildYoutubeVideoUrl(item.id),
    artistUrl: buildYoutubeChannelUrl(channelId),
  };
}

function isBlockedYoutubeItem(item) {
  return BLOCKED_VIDEO_IDS.has(item?.id);
}

async function fetchPopularMusicVideos(region) {
  const apiKey = getApiKey();
  const normalizedRegion = normalizeRegion(region);
  if (!apiKey) {
    throw new Error('Missing YOUTUBE_API_KEY in server/.env');
  }

  const params = new URLSearchParams({
    part: 'snippet,statistics',
    chart: 'mostPopular',
    videoCategoryId: MUSIC_CATEGORY_ID,
    maxResults: String(MAX_RESULTS),
    key: apiKey,
  });

  if (normalizedRegion) {
    params.set('regionCode', normalizedRegion);
  }

  const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`YouTube API error ${response.status}: ${text}`);
  }

  const json = await response.json();
  return (json.items || []).filter((item) => !isBlockedYoutubeItem(item)).map(mapYoutubeItem);
}

function getOrCreateRegionEntry(region) {
  if (!regionCache.has(region)) {
    regionCache.set(region, createEmptyEntry('memory'));
  }

  return regionCache.get(region);
}

function buildSnapshot(tracks, timestamp) {
  const viewsById = Object.fromEntries(tracks.map((track) => [track.id, track.views]));
  return { timestamp, viewsById };
}

function pushSnapshot(entry, tracks, timestamp) {
  entry.history.push(buildSnapshot(tracks, timestamp));

  if (entry.history.length > HISTORY_LIMIT) {
    entry.history.splice(0, entry.history.length - HISTORY_LIMIT);
  }
}

async function loadRegionEntry(regionKey) {
  let redis;

  try {
    redis = await getRedisClient();
  } catch {
    return getOrCreateRegionEntry(regionKey);
  }

  if (!redis) {
    return getOrCreateRegionEntry(regionKey);
  }

  const { tracksKey, metaKey, historyKey } = getRedisKeys(regionKey);
  let tracksJson;
  let metaJson;
  let historyItems;

  try {
    [tracksJson, metaJson, historyItems] = await Promise.all([
      redis.get(tracksKey),
      redis.get(metaKey),
      redis.lRange(historyKey, 0, HISTORY_LIMIT - 1),
    ]);
  } catch {
    return getOrCreateRegionEntry(regionKey);
  }

  const meta = parseJson(metaJson, {});
  const entry = {
    ...createEmptyEntry('redis'),
    tracks: parseJson(tracksJson, []),
    updatedAt: meta.updatedAt || null,
    fetchedAt: Number(meta.fetchedAt || 0),
    source: meta.source || 'empty',
    lastError: meta.lastError || '',
    history: (historyItems || []).map((item) => parseJson(item, null)).filter(Boolean).reverse(),
  };

  regionCache.set(regionKey, { ...entry, storage: 'memory' });
  return entry;
}

async function saveRegionEntry(regionKey, entry, options = {}) {
  regionCache.set(regionKey, { ...entry, storage: 'memory' });

  let redis;
  try {
    redis = await getRedisClient();
  } catch {
    return;
  }

  if (!redis) {
    return;
  }

  const { tracksKey, metaKey, historyKey } = getRedisKeys(regionKey);
  const multi = redis.multi();

  multi.set(
    tracksKey,
    JSON.stringify(entry.tracks),
    { EX: REDIS_ENTRY_TTL_SECONDS },
  );
  multi.set(
    metaKey,
    JSON.stringify({
      updatedAt: entry.updatedAt,
      fetchedAt: entry.fetchedAt,
      source: entry.source,
      lastError: entry.lastError,
    }),
    { EX: REDIS_ENTRY_TTL_SECONDS },
  );

  if (options.appendSnapshot && entry.history.length) {
    multi.lPush(historyKey, JSON.stringify(entry.history[entry.history.length - 1]));
    multi.lTrim(historyKey, 0, HISTORY_LIMIT - 1);
    multi.expire(historyKey, REDIS_ENTRY_TTL_SECONDS);
  }

  try {
    await multi.exec();
  } catch {
    // Keep the in-memory fallback even if Redis write fails.
  }
}

function findComparisonSnapshot(history, now, windowKey) {
  const targetAge = getWindowMs(windowKey);
  const targetTime = now - targetAge;

  if (!history.length) {
    return {
      snapshot: null,
      mode: 'none',
      observedMs: 0,
      targetMs: targetAge,
      snapshotCount: 0,
    };
  }

  if (history.length === 1) {
    return {
      snapshot: history[0],
      mode: 'current-only',
      observedMs: 0,
      targetMs: targetAge,
      snapshotCount: 1,
    };
  }

  for (let index = history.length - 2; index >= 0; index -= 1) {
    if (history[index].timestamp <= targetTime) {
      return {
        snapshot: history[index],
        mode: 'window-match',
        observedMs: Math.max(0, now - history[index].timestamp),
        targetMs: targetAge,
        snapshotCount: history.length,
      };
    }
  }

  const oldestPrior = history[0];
  return {
    snapshot: oldestPrior,
    mode: 'partial-window',
    observedMs: Math.max(0, now - oldestPrior.timestamp),
    targetMs: targetAge,
    snapshotCount: history.length,
  };
}

function downsampleTrendPoints(points, maxPoints = MAX_TREND_POINTS) {
  if (points.length <= maxPoints) {
    return points;
  }

  const sampled = [];
  let previousIndex = -1;

  for (let position = 0; position < maxPoints; position += 1) {
    const index = Math.round((position * (points.length - 1)) / (maxPoints - 1));
    if (index !== previousIndex) {
      sampled.push(points[index]);
      previousIndex = index;
    }
  }

  return sampled;
}

function areSnapshotViewsEqual(leftSnapshot, rightSnapshot) {
  const leftViews = leftSnapshot?.viewsById || {};
  const rightViews = rightSnapshot?.viewsById || {};
  const leftIds = Object.keys(leftViews);
  const rightIds = Object.keys(rightViews);

  if (leftIds.length !== rightIds.length) {
    return false;
  }

  return leftIds.every((trackId) => Object.prototype.hasOwnProperty.call(rightViews, trackId)
    && Number(leftViews[trackId] || 0) === Number(rightViews[trackId] || 0));
}

function normalizeHistory(history) {
  if (!Array.isArray(history) || !history.length) {
    return [];
  }

  const orderedHistory = [...history]
    .filter((snapshot) => Number.isFinite(snapshot?.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp);

  return orderedHistory.reduce((normalizedHistory, snapshot) => {
    const previousSnapshot = normalizedHistory[normalizedHistory.length - 1];

    if (
      previousSnapshot
      && snapshot.timestamp - previousSnapshot.timestamp <= DUPLICATE_SNAPSHOT_GAP_MS
      && areSnapshotViewsEqual(previousSnapshot, snapshot)
    ) {
      normalizedHistory[normalizedHistory.length - 1] = snapshot;
      return normalizedHistory;
    }

    normalizedHistory.push(snapshot);
    return normalizedHistory;
  }, []);
}

function downsampleTimestamps(timestamps, maxPoints = SHARED_AXIS_TICK_COUNT) {
  if (timestamps.length <= maxPoints) {
    return timestamps;
  }

  const sampled = [];
  let previousIndex = -1;

  for (let position = 0; position < maxPoints; position += 1) {
    const index = Math.round((position * (timestamps.length - 1)) / (maxPoints - 1));
    if (index !== previousIndex) {
      sampled.push(timestamps[index]);
      previousIndex = index;
    }
  }

  return sampled;
}

function buildSharedTimeAxis(history, now, windowKey) {
  const normalizedHistory = normalizeHistory(history);
  const windowStart = now - getWindowMs(windowKey);
  const timestamps = normalizedHistory
    .filter((snapshot) => snapshot.timestamp >= windowStart && snapshot.timestamp <= now)
    .map((snapshot) => snapshot.timestamp);

  if (!timestamps.length) {
    return null;
  }

  return {
    start: timestamps[0],
    end: timestamps[timestamps.length - 1],
    ticks: downsampleTimestamps(timestamps),
  };
}

function getSnapshotViews(snapshot, trackId) {
  if (!snapshot || !Object.prototype.hasOwnProperty.call(snapshot?.viewsById || {}, trackId)) {
    return null;
  }

  return Number(snapshot.viewsById[trackId] || 0);
}

function hasWindowMatch(comparison) {
  return comparison?.mode === 'window-match';
}

function isBetterComparisonCandidate(candidate, bestCandidate, requestedWindowMs, preferRequestedWindow) {
  if (!bestCandidate) {
    return true;
  }

  const candidateComparableWindowMs = Math.min(candidate.currentWindowMs, candidate.previousWindowMs);
  const bestComparableWindowMs = Math.min(bestCandidate.currentWindowMs, bestCandidate.previousWindowMs);
  const candidateImbalance = Math.abs(candidate.currentWindowMs - candidate.previousWindowMs);
  const bestImbalance = Math.abs(bestCandidate.currentWindowMs - bestCandidate.previousWindowMs);

  if (preferRequestedWindow) {
    const candidateRequestedDistance = Math.abs(candidate.currentWindowMs - requestedWindowMs)
      + Math.abs(candidate.previousWindowMs - requestedWindowMs);
    const bestRequestedDistance = Math.abs(bestCandidate.currentWindowMs - requestedWindowMs)
      + Math.abs(bestCandidate.previousWindowMs - requestedWindowMs);

    if (candidateRequestedDistance !== bestRequestedDistance) {
      return candidateRequestedDistance < bestRequestedDistance;
    }

    if (candidateImbalance !== bestImbalance) {
      return candidateImbalance < bestImbalance;
    }

    if (candidateComparableWindowMs !== bestComparableWindowMs) {
      return candidateComparableWindowMs > bestComparableWindowMs;
    }

    return candidate.currentSnapshot.timestamp > bestCandidate.currentSnapshot.timestamp;
  }

  if (candidateComparableWindowMs !== bestComparableWindowMs) {
    return candidateComparableWindowMs > bestComparableWindowMs;
  }

  if (candidateImbalance !== bestImbalance) {
    return candidateImbalance < bestImbalance;
  }

  return candidate.currentSnapshot.timestamp > bestCandidate.currentSnapshot.timestamp;
}

function createEmptyComparison(targetMs, snapshotCount) {
  return {
    snapshot: null,
    mode: 'none',
    observedMs: 0,
    targetMs,
    snapshotCount,
  };
}

function resolveMomentumComparisons(history, now, windowKey) {
  const requestedWindowMs = getWindowMs(windowKey);
  const relevantHistory = history.filter((snapshot) => snapshot.timestamp <= now);
  const snapshotCount = relevantHistory.length;
  const storedHistoryMs = snapshotCount ? Math.max(0, now - relevantHistory[0].timestamp) : 0;
  const preferRequestedWindow = storedHistoryMs >= requestedWindowMs * 2;
  const fallbackComparison = findComparisonSnapshot(relevantHistory, now, requestedWindowMs);

  if (snapshotCount < 3) {
    return {
      requestedWindowMs,
      effectiveWindowMs: 0,
      storedHistoryMs,
      currentComparison: fallbackComparison,
      previousComparison: createEmptyComparison(requestedWindowMs, snapshotCount),
      momentumAvailable: false,
      mode: fallbackComparison.mode,
    };
  }

  let bestCandidate = null;

  for (let currentIndex = snapshotCount - 2; currentIndex >= 1; currentIndex -= 1) {
    const currentSnapshot = relevantHistory[currentIndex];
    const currentWindowMs = Math.max(0, now - currentSnapshot.timestamp);
    if (currentWindowMs <= 0) {
      continue;
    }

    for (let previousIndex = currentIndex - 1; previousIndex >= 0; previousIndex -= 1) {
      const previousSnapshot = relevantHistory[previousIndex];
      const previousWindowMs = Math.max(0, currentSnapshot.timestamp - previousSnapshot.timestamp);
      const effectiveWindowMs = Math.min(requestedWindowMs, currentWindowMs, previousWindowMs);
      if (effectiveWindowMs <= 0) {
        continue;
      }

      const candidate = {
        currentSnapshot,
        previousSnapshot,
        currentWindowMs,
        previousWindowMs,
      };

      if (isBetterComparisonCandidate(candidate, bestCandidate, requestedWindowMs, preferRequestedWindow)) {
        bestCandidate = candidate;
      }
    }
  }

  if (!bestCandidate) {
    return {
      requestedWindowMs,
      effectiveWindowMs: 0,
      storedHistoryMs,
      currentComparison: fallbackComparison,
      previousComparison: createEmptyComparison(requestedWindowMs, snapshotCount),
      momentumAvailable: false,
      mode: fallbackComparison.mode,
    };
  }

  const effectiveWindowMs = Math.min(bestCandidate.currentWindowMs, bestCandidate.previousWindowMs);
  const mode = effectiveWindowMs >= requestedWindowMs ? 'window-match' : 'partial-window';

  return {
    requestedWindowMs,
    effectiveWindowMs,
    storedHistoryMs,
    currentComparison: {
      snapshot: bestCandidate.currentSnapshot,
      mode,
      observedMs: bestCandidate.currentWindowMs,
      targetMs: requestedWindowMs,
      snapshotCount,
    },
    previousComparison: {
      snapshot: bestCandidate.previousSnapshot,
      mode,
      observedMs: bestCandidate.previousWindowMs,
      targetMs: requestedWindowMs,
      snapshotCount,
    },
    momentumAvailable: true,
    mode,
  };
}

function createUnavailableMomentum() {
  return {
    growth: null,
    currentGain: null,
    previousGain: null,
    available: false,
  };
}

function calculateTrackMomentum(history, trackId, now, windowKey, currentViews = null) {
  const normalizedHistory = normalizeHistory(history);
  const relevantHistory = normalizedHistory.filter((snapshot) => snapshot.timestamp <= now);

  if (!relevantHistory.length) {
    return createUnavailableMomentum();
  }

  const currentSnapshot = relevantHistory[relevantHistory.length - 1];
  const resolvedCurrentViews = Number.isFinite(currentViews)
    ? currentViews
    : (getSnapshotViews(currentSnapshot, trackId) ?? 0);
  const resolvedComparisons = resolveMomentumComparisons(relevantHistory, now, windowKey);
  const comparison = resolvedComparisons.currentComparison;

  if (!resolvedComparisons.momentumAvailable || !comparison.snapshot) {
    return createUnavailableMomentum();
  }

  const comparisonViews = getSnapshotViews(comparison.snapshot, trackId);
  if (comparisonViews === null) {
    return createUnavailableMomentum();
  }

  const currentGain = resolvedCurrentViews - comparisonViews;
  const previousComparison = resolvedComparisons.previousComparison;

  const earlierViews = getSnapshotViews(previousComparison.snapshot, trackId);
  if (earlierViews === null) {
    return createUnavailableMomentum();
  }

  const previousGain = comparisonViews - earlierViews;

  return {
    growth: currentGain - previousGain,
    currentGain,
    previousGain,
    available: true,
  };
}

function buildTrackViewsTrend(history, trackId, now, windowKey) {
  const normalizedHistory = normalizeHistory(history);
  const trendPoints = normalizedHistory
    .filter((snapshot) => Object.prototype.hasOwnProperty.call(snapshot?.viewsById || {}, trackId))
    .map((snapshot) => ({
      timestamp: snapshot.timestamp,
      views: Number(snapshot.viewsById[trackId] || 0),
    }));

  if (!trendPoints.length) {
    return [];
  }

  const windowStart = now - getWindowMs(windowKey);
  const boundedPoints = trendPoints.filter((point) => point.timestamp <= now);
  const firstVisibleIndex = boundedPoints.findIndex((point) => point.timestamp >= windowStart);

  if (firstVisibleIndex === -1) {
    return [];
  }

  const previousPoint = firstVisibleIndex > 0 ? boundedPoints[firstVisibleIndex - 1] : null;
  const visiblePoints = boundedPoints.slice(firstVisibleIndex);

  const downsampledVisiblePoints = visiblePoints.length <= 2
    ? visiblePoints
    : downsampleTrendPoints(visiblePoints);

  if (!previousPoint) {
    return downsampledVisiblePoints;
  }

  return [previousPoint, ...downsampledVisiblePoints];
}

function buildTrackTrend(history, trackId, now, windowKey) {
  const normalizedHistory = normalizeHistory(history);
  const trendPoints = normalizedHistory
    .filter((snapshot) => Object.prototype.hasOwnProperty.call(snapshot?.viewsById || {}, trackId))
    .map((snapshot) => ({
      timestamp: snapshot.timestamp,
      views: Number(snapshot.viewsById[trackId] || 0),
    }));

  if (!trendPoints.length) {
    return [];
  }

  const windowStart = now - getWindowMs(windowKey);
  const visiblePoints = trendPoints.filter((point) => point.timestamp >= windowStart);
  const momentumPoints = visiblePoints.flatMap((point) => {
    const momentum = calculateTrackMomentum(normalizedHistory, trackId, point.timestamp, windowKey, point.views);
    return momentum.available
      ? [{
        ...point,
        growth: momentum.growth,
      }]
      : [];
  });

  if (momentumPoints.length <= 2) {
    return momentumPoints;
  }

  return downsampleTrendPoints(momentumPoints);
}

function buildRankLookup(snapshot) {
  const rankedIds = Object.entries(snapshot?.viewsById || {})
    .sort(([, viewsA], [, viewsB]) => Number(viewsB) - Number(viewsA))
    .map(([trackId], index) => [trackId, index + 1]);

  return Object.fromEntries(rankedIds);
}

function findFirstSeenAt(history, trackId) {
  const firstSnapshot = history.find((snapshot) => Object.prototype.hasOwnProperty.call(snapshot?.viewsById || {}, trackId));
  return firstSnapshot ? new Date(firstSnapshot.timestamp).toISOString() : null;
}

function buildViralAlerts(tracks) {
  const alerts = [];
  const usedTrackIds = new Set();

  const breakoutTrack = [...tracks]
    .filter((track) => Number.isFinite(track.growth))
    .sort((a, b) => b.growth - a.growth)[0];
  if (breakoutTrack && breakoutTrack.growth > 0) {
    alerts.push({
      id: `alert-breakout-${breakoutTrack.id}`,
      type: 'breakout',
      tone: 'hot',
      title: breakoutTrack.title,
      artist: breakoutTrack.artist,
      thumbnail: breakoutTrack.thumbnail,
      currentRank: breakoutTrack.currentRank,
      previousRank: breakoutTrack.previousRank,
      rankDelta: breakoutTrack.rankDelta,
      growth: breakoutTrack.growth,
      views: breakoutTrack.views,
      firstSeenAt: breakoutTrack.firstSeenAt,
    });
    usedTrackIds.add(breakoutTrack.id);
  }

  const strongestClimb = [...tracks]
    .filter((track) => track.rankDelta > 0)
    .sort((a, b) => b.rankDelta - a.rankDelta || ((b.growth ?? Number.NEGATIVE_INFINITY) - (a.growth ?? Number.NEGATIVE_INFINITY)))[0];

  if (strongestClimb && !usedTrackIds.has(strongestClimb.id)) {
    alerts.push({
      id: `alert-rank-${strongestClimb.id}`,
      type: 'rank-climb',
      tone: 'positive',
      title: strongestClimb.title,
      artist: strongestClimb.artist,
      thumbnail: strongestClimb.thumbnail,
      currentRank: strongestClimb.currentRank,
      previousRank: strongestClimb.previousRank,
      rankDelta: strongestClimb.rankDelta,
      growth: strongestClimb.growth,
      views: strongestClimb.views,
      firstSeenAt: strongestClimb.firstSeenAt,
    });
    usedTrackIds.add(strongestClimb.id);
  }

  const newEntry = [...tracks]
    .filter((track) => track.isNew)
    .sort((a, b) => b.views - a.views || ((b.growth ?? Number.NEGATIVE_INFINITY) - (a.growth ?? Number.NEGATIVE_INFINITY)))[0];

  if (newEntry && !usedTrackIds.has(newEntry.id)) {
    alerts.push({
      id: `alert-new-${newEntry.id}`,
      type: 'new-entry',
      tone: 'accent',
      title: newEntry.title,
      artist: newEntry.artist,
      thumbnail: newEntry.thumbnail,
      currentRank: newEntry.currentRank,
      previousRank: newEntry.previousRank,
      rankDelta: newEntry.rankDelta,
      growth: newEntry.growth,
      views: newEntry.views,
      firstSeenAt: newEntry.firstSeenAt,
    });
  }

  return alerts.slice(0, ALERT_WIDGET_LIMIT);
}

function buildArtists(tracks) {
  const byArtist = new Map();

  for (const track of tracks) {
    const current = byArtist.get(track.artist) || {
      id: `artist-${track.artist.toLowerCase().replace(/\s+/g, '-')}`,
      name: track.artist,
      score: 0,
      totalViews: 0,
      topTrack: track.title,
      topTrackUrl: track.videoUrl,
      topTrackViews: 0,
      thumbnail: track.thumbnail,
      artistUrl: track.artistUrl,
    };

    current.score += track.growth ?? 0;
    current.totalViews += track.views;
    if (track.views > current.topTrackViews) {
      current.topTrack = track.title;
      current.topTrackUrl = track.videoUrl;
      current.topTrackViews = track.views;
      current.thumbnail = track.thumbnail;
    }
    if (!current.artistUrl && track.artistUrl) {
      current.artistUrl = track.artistUrl;
    }

    byArtist.set(track.artist, current);
  }

  return [...byArtist.values()].sort((a, b) => b.score - a.score);
}

function applySearch(tracks, search) {
  const term = String(search || '').trim().toLowerCase();
  if (!term) return tracks;

  return tracks.filter((track) => `${track.title} ${track.artist}`.toLowerCase().includes(term));
}

function buildDashboardPayload(filters, entry) {
  const windowSelection = resolveWindowSelection(filters);
  const measurementTime = entry.fetchedAt || Date.now();
  const normalizedHistory = normalizeHistory(entry.history);
  const resolvedComparisons = resolveMomentumComparisons(normalizedHistory, measurementTime, windowSelection.requestedMs);
  const comparison = resolvedComparisons.currentComparison;
  const hasComparableHistory = Boolean(comparison.snapshot);
  const momentumAvailable = resolvedComparisons.momentumAvailable;
  const comparisonSnapshot = comparison.snapshot;
  const previousRanks = buildRankLookup(comparisonSnapshot);
  const sharedTimeAxis = buildSharedTimeAxis(normalizedHistory, measurementTime, windowSelection.requestedMs);

  const tracksWithGrowth = entry.tracks.map((track) => {
    const momentum = calculateTrackMomentum(normalizedHistory, track.id, measurementTime, windowSelection.requestedMs, track.views);

    return {
      ...track,
      growth: momentum.growth,
      momentumTrend: buildTrackTrend(normalizedHistory, track.id, measurementTime, windowSelection.requestedMs),
      viewsTrend: buildTrackViewsTrend(normalizedHistory, track.id, measurementTime, windowSelection.requestedMs),
    };
  });

  const filteredTracks = applySearch(tracksWithGrowth, filters.search);
  const rankedTracks = [...filteredTracks]
    .sort((a, b) => b.views - a.views)
    .map((track, index) => {
      const currentRank = index + 1;
      const previousRank = previousRanks[track.id] || null;
      const isNew = hasComparableHistory && previousRank === null;

      return {
        ...track,
        currentRank,
        previousRank,
        rankDelta: previousRank ? previousRank - currentRank : 0,
        isNew,
        firstSeenAt: findFirstSeenAt(normalizedHistory, track.id),
      };
    });

  const allSongs = rankedTracks.map((track) => ({
    id: track.id,
    rank: track.currentRank,
    title: track.title,
    artist: track.artist,
    growth: track.growth,
    views: track.views,
    trend: track.viewsTrend,
    thumbnail: track.thumbnail,
    videoUrl: track.videoUrl,
    artistUrl: track.artistUrl,
    previousRank: track.previousRank,
    rankDelta: track.rankDelta,
    isNew: track.isNew,
  }));

  const allRising = [...rankedTracks]
    .sort((a, b) => ((b.growth ?? Number.NEGATIVE_INFINITY) - (a.growth ?? Number.NEGATIVE_INFINITY)))
    .map((track, index) => ({
      id: track.id,
      rank: index + 1,
      title: track.title,
      artist: track.artist,
      growth: track.growth,
      thumbnail: track.thumbnail,
      videoUrl: track.videoUrl,
      artistUrl: track.artistUrl,
      currentRank: track.currentRank,
      previousRank: track.previousRank,
      rankDelta: track.rankDelta,
      isNew: track.isNew,
      trend: track.momentumTrend,
    }));

  const allArtists = buildArtists(rankedTracks).map((artist, index) => ({
    id: artist.id,
    rank: index + 1,
    name: artist.name,
    score: artist.score,
    topTrack: artist.topTrack,
    topTrackUrl: artist.topTrackUrl,
    thumbnail: artist.thumbnail,
    artistUrl: artist.artistUrl,
  }));

  const songs = allSongs.slice(0, SONGS_LEADERBOARD_LIMIT);
  const rising = allRising.slice(0, LEADERBOARD_LIMIT).map(({ trend, ...track }) => track);
  const artists = allArtists.slice(0, LEADERBOARD_LIMIT);
  const trendTracks = allRising.slice(0, TREND_WIDGET_LIMIT);
  const newSongs = rankedTracks
    .filter((track) => track.isNew)
    .sort((a, b) => Date.parse(b.firstSeenAt || 0) - Date.parse(a.firstSeenAt || 0) || b.views - a.views)
    .slice(0, NEW_SONG_WIDGET_LIMIT)
    .map((track) => ({
      id: track.id,
      title: track.title,
      artist: track.artist,
      views: track.views,
      growth: track.growth,
      thumbnail: track.thumbnail,
      currentRank: track.currentRank,
      firstSeenAt: track.firstSeenAt,
    }));
  const viralAlerts = momentumAvailable ? buildViralAlerts(rankedTracks) : [];

  const measurableTracks = allSongs.filter((track) => Number.isFinite(track.growth));
  const totalGrowth = measurableTracks.reduce((sum, track) => sum + track.growth, 0);

  return {
    filters: {
      region: filters.region,
      search: filters.search,
      windowAmount: windowSelection.amount,
      windowUnit: windowSelection.unit,
    },
    kpis: {
      tracks: allSongs.length,
      artists: allArtists.length,
      avgMomentum: measurableTracks.length ? Math.round(totalGrowth / measurableTracks.length) : null,
      newSongs: newSongs.length,
      alerts: viralAlerts.length,
    },
    charts: {
      sharedTimeAxis,
    },
    widgets: { songs, artists, rising, trendTracks, viralAlerts, newSongs },
    updatedAt: entry.updatedAt,
    source: entry.source,
    cache: {
      ttlSeconds: Math.round(getCacheTtlMs() / 1000),
      fetchedAt: entry.fetchedAt ? new Date(entry.fetchedAt).toISOString() : null,
      hasHistory: normalizedHistory.length > 1,
      lastError: entry.lastError || null,
      storage: entry.storage || 'memory',
      snapshotCount: normalizedHistory.length,
      comparisonMode: resolvedComparisons.mode,
      momentumAvailable,
      observedMinutes: Math.round(resolvedComparisons.effectiveWindowMs / (60 * 1000)),
      requestedWindowMinutes: Math.round(windowSelection.requestedMs / (60 * 1000)),
      effectiveWindowMinutes: Math.round(resolvedComparisons.effectiveWindowMs / (60 * 1000)),
      storedHistoryMinutes: Math.round(resolvedComparisons.storedHistoryMs / (60 * 1000)),
      targetWindowMinutes: Math.round(windowSelection.requestedMs / (60 * 1000)),
    },
  };
}

async function ensureFreshRegionData(region, options = {}) {
  const normalizedRegion = normalizeRegion(region);
  const regionKey = getRegionKey(region);
  const entry = await loadRegionEntry(regionKey);
  const now = Date.now();

  if (shouldSkipFetch(entry, now, options)) {
    return entry;
  }

  if (refreshPromises.has(regionKey)) {
    return refreshPromises.get(regionKey);
  }

  const refreshPromise = (async () => {
    const latestEntry = await loadRegionEntry(regionKey);
    const refreshTime = Date.now();

    if (shouldSkipFetch(latestEntry, refreshTime, options)) {
      return latestEntry;
    }

    try {
      const tracks = await fetchPopularMusicVideos(normalizedRegion);
      const nextEntry = {
        ...latestEntry,
        tracks,
        updatedAt: new Date(refreshTime).toISOString(),
        fetchedAt: refreshTime,
        source: 'youtube',
        lastError: '',
      };

      pushSnapshot(nextEntry, tracks, refreshTime);
      await saveRegionEntry(regionKey, nextEntry, { appendSnapshot: true });
      return nextEntry;
    } catch (error) {
      if (latestEntry.tracks.length) {
        const staleEntry = {
          ...latestEntry,
          source: 'youtube-stale-cache',
          lastError: error.message,
        };
        await saveRegionEntry(regionKey, staleEntry);
        return staleEntry;
      }

      throw error;
    } finally {
      refreshPromises.delete(regionKey);
    }
  })();

  refreshPromises.set(regionKey, refreshPromise);
  return refreshPromise;
}

async function buildDashboardResponse(filters) {
  try {
    const windowSelection = resolveWindowSelection(filters);
    const normalizedFilters = {
      ...filters,
      region: normalizeRegion(filters.region) || 'GLOBAL',
      search: String(filters.search || ''),
      windowAmount: windowSelection.amount,
      windowUnit: windowSelection.unit,
    };
    const entry = await ensureFreshRegionData(normalizedFilters.region, {
      force: Boolean(filters.force),
    });
    return buildDashboardPayload(normalizedFilters, entry);
  } catch (error) {
    const windowSelection = resolveWindowSelection(filters);
    const fallback = buildMockDashboardResponse({
      ...filters,
      region: normalizeRegion(filters.region) || 'GLOBAL',
      search: String(filters.search || ''),
      windowAmount: windowSelection.amount,
      windowUnit: windowSelection.unit,
    });
    return {
      ...fallback,
      source: 'mock-fallback',
      cache: {
        ttlSeconds: Math.round(getCacheTtlMs() / 1000),
        fetchedAt: null,
        hasHistory: false,
        lastError: error.message,
        storage: 'mock',
        snapshotCount: 0,
        comparisonMode: 'none',
        momentumAvailable: true,
        observedMinutes: 0,
        requestedWindowMinutes: Math.round(windowSelection.requestedMs / (60 * 1000)),
        effectiveWindowMinutes: Math.round(windowSelection.requestedMs / (60 * 1000)),
        storedHistoryMinutes: 0,
        targetWindowMinutes: Math.round(windowSelection.requestedMs / (60 * 1000)),
      },
    };
  }
}

async function refreshRegionSnapshot(region) {
  const normalizedRegion = normalizeRegion(region) || 'GLOBAL';
  return ensureFreshRegionData(normalizedRegion, { force: true });
}

module.exports = {
  buildDashboardResponse,
  refreshRegionSnapshot,
  __testUtils: {
    MAX_RESULTS,
    buildSnapshot,
    mapYoutubeItem,
    getRefreshIntervalMs,
    shouldSkipFetch,
    normalizeHistory,
    calculateTrackMomentum,
    buildDashboardPayload,
    buildTrackTrend,
    buildTrackViewsTrend,
    buildSharedTimeAxis,
    findComparisonSnapshot,
    resolveMomentumComparisons,
    resolveWindowSelection,
    isBlockedYoutubeItem,
  },
};
