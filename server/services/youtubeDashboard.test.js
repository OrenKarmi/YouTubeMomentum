const test = require('node:test');
const assert = require('node:assert/strict');

const { __testUtils } = require('./youtubeDashboard');

test('backend tracks top 50 songs from the provider', () => {
  assert.equal(__testUtils.MAX_RESULTS, 50);
});

test('getRefreshIntervalMs reads AUTO_REFRESH_INTERVAL_SECONDS when configured', () => {
  const previousInterval = process.env.AUTO_REFRESH_INTERVAL_SECONDS;

  try {
    process.env.AUTO_REFRESH_INTERVAL_SECONDS = '90';
    assert.equal(__testUtils.getRefreshIntervalMs(), 90 * 1000);
  } finally {
    if (previousInterval == null) {
      delete process.env.AUTO_REFRESH_INTERVAL_SECONDS;
    } else {
      process.env.AUTO_REFRESH_INTERVAL_SECONDS = previousInterval;
    }
  }
});

test('shouldSkipFetch blocks forced refreshes when the last fetch is newer than the refresh interval', () => {
  const previousInterval = process.env.AUTO_REFRESH_INTERVAL_SECONDS;
  const previousTtl = process.env.YOUTUBE_CACHE_TTL_SECONDS;
  const now = Date.now();
  const recentEntry = {
    fetchedAt: now - 30 * 1000,
  };

  try {
    process.env.AUTO_REFRESH_INTERVAL_SECONDS = '600';
    process.env.YOUTUBE_CACHE_TTL_SECONDS = '1';

    assert.equal(__testUtils.shouldSkipFetch(recentEntry, now, { force: true }), true);
    assert.equal(__testUtils.shouldSkipFetch(recentEntry, now + 11 * 60 * 1000, { force: true }), false);
  } finally {
    if (previousInterval == null) {
      delete process.env.AUTO_REFRESH_INTERVAL_SECONDS;
    } else {
      process.env.AUTO_REFRESH_INTERVAL_SECONDS = previousInterval;
    }

    if (previousTtl == null) {
      delete process.env.YOUTUBE_CACHE_TTL_SECONDS;
    } else {
      process.env.YOUTUBE_CACHE_TTL_SECONDS = previousTtl;
    }
  }
});

test('shouldSkipFetch still honors the cache ttl for non-forced dashboard loads', () => {
  const previousInterval = process.env.AUTO_REFRESH_INTERVAL_SECONDS;
  const previousTtl = process.env.YOUTUBE_CACHE_TTL_SECONDS;
  const now = Date.now();
  const entry = {
    fetchedAt: now - 5 * 60 * 1000,
  };

  try {
    process.env.AUTO_REFRESH_INTERVAL_SECONDS = '60';
    process.env.YOUTUBE_CACHE_TTL_SECONDS = '1800';

    assert.equal(__testUtils.shouldSkipFetch(entry, now, { force: false }), true);
    assert.equal(__testUtils.shouldSkipFetch(entry, now, { force: true }), false);
  } finally {
    if (previousInterval == null) {
      delete process.env.AUTO_REFRESH_INTERVAL_SECONDS;
    } else {
      process.env.AUTO_REFRESH_INTERVAL_SECONDS = previousInterval;
    }

    if (previousTtl == null) {
      delete process.env.YOUTUBE_CACHE_TTL_SECONDS;
    } else {
      process.env.YOUTUBE_CACHE_TTL_SECONDS = previousTtl;
    }
  }
});

test('mapYoutubeItem builds direct song and artist YouTube urls', () => {
  const mapped = __testUtils.mapYoutubeItem({
    id: 'video123',
    snippet: {
      title: 'Song Title',
      channelTitle: 'Artist Name',
      channelId: 'channel456',
      thumbnails: { default: { url: 'https://img.test/thumb.jpg' } },
    },
    statistics: { viewCount: '10', likeCount: '2', commentCount: '1' },
  });

  assert.equal(mapped.videoUrl, 'https://www.youtube.com/watch?v=video123');
  assert.equal(mapped.artistUrl, 'https://www.youtube.com/channel/channel456');
});

test('findComparisonSnapshot returns current-only when only one snapshot exists', () => {
  const now = Date.now();
  const snapshot = __testUtils.buildSnapshot([{ id: 't1', views: 100 }], now);

  const result = __testUtils.findComparisonSnapshot([snapshot], now, '10m');

  assert.equal(result.mode, 'current-only');
  assert.equal(result.snapshotCount, 1);
  assert.equal(result.observedMs, 0);
});

test('findComparisonSnapshot falls back to a partial window when the request exceeds stored history', () => {
  const now = Date.now();
  const history = [
    __testUtils.buildSnapshot([{ id: 't1', views: 100 }], now - 4 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 140 }], now),
  ];

  const result = __testUtils.findComparisonSnapshot(history, now, '10m');

  assert.equal(result.mode, 'partial-window');
  assert.equal(result.snapshot, history[0]);
  assert.equal(Math.round(result.observedMs / (60 * 1000)), 4);
});

test('findComparisonSnapshot prefers a snapshot that satisfies the selected window', () => {
  const now = Date.now();
  const history = [
    __testUtils.buildSnapshot([{ id: 't1', views: 90 }], now - 70 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 120 }], now - 15 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 160 }], now),
  ];

  const result = __testUtils.findComparisonSnapshot(history, now, '1h');

  assert.equal(result.mode, 'window-match');
  assert.equal(result.snapshot, history[0]);
  assert.equal(Math.round(result.targetMs / (60 * 1000)), 60);
});

test('findComparisonSnapshot supports extended day, week, and month window keys', () => {
  const now = Date.now();
  const cases = [
    ['1d', 26 * 60, 24 * 60],
    ['1w', 8 * 24 * 60, 7 * 24 * 60],
    ['1m', 35 * 24 * 60, 30 * 24 * 60],
  ];

  for (const [windowKey, previousMinutes, expectedMinutes] of cases) {
    const history = [
      __testUtils.buildSnapshot([{ id: 't1', views: 100 }], now - previousMinutes * 60 * 1000),
      __testUtils.buildSnapshot([{ id: 't1', views: 140 }], now),
    ];

    const result = __testUtils.findComparisonSnapshot(history, now, windowKey);

    assert.equal(result.mode, 'window-match');
    assert.equal(Math.round(result.targetMs / (60 * 1000)), expectedMinutes);
  }
});

test('buildTrackTrend keeps only visible points with enough history and preserves the latest point', () => {
  const now = Date.now();
  const history = [
    __testUtils.buildSnapshot([{ id: 't1', views: 100 }], now - 130 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 160 }], now - 70 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 190 }], now - 30 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 210 }], now),
  ];

  const result = __testUtils.buildTrackTrend(history, 't1', now, '1h');

  assert.deepEqual(result.map((point) => point.growth), [-30, -10]);
  assert.equal(result[result.length - 1].timestamp, history[3].timestamp);
});

test('buildTrackViewsTrend includes the preceding sample so the first in-window gain can be computed', () => {
  const now = Date.now();
  const history = [
    __testUtils.buildSnapshot([{ id: 't1', views: 100 }], now - 130 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 160 }], now - 70 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 190 }], now - 30 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 210 }], now),
  ];

  const result = __testUtils.buildTrackViewsTrend(history, 't1', now, '1h');

  assert.deepEqual(result, [
    { timestamp: history[1].timestamp, views: 160 },
    { timestamp: history[2].timestamp, views: 190 },
    { timestamp: history[3].timestamp, views: 210 },
  ]);
});

test('normalizeHistory collapses near-identical duplicate snapshots and keeps the later timestamp', () => {
  const now = Date.now();
  const history = [
    __testUtils.buildSnapshot([{ id: 't1', views: 100 }], now - 40 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 100 }], now - 40 * 60 * 1000 + 80),
    __testUtils.buildSnapshot([{ id: 't1', views: 150 }], now - 20 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 150 }], now - 20 * 60 * 1000 + 90),
    __testUtils.buildSnapshot([{ id: 't1', views: 210 }], now),
  ];

  const result = __testUtils.normalizeHistory(history);

  assert.deepEqual(result.map((snapshot) => snapshot.timestamp), [
    history[1].timestamp,
    history[3].timestamp,
    history[4].timestamp,
  ]);
});

test('buildTrackViewsTrend removes duplicate samples before building the visible series', () => {
  const now = Date.now();
  const history = [
    __testUtils.buildSnapshot([{ id: 't1', views: 100 }], now - 40 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 100 }], now - 40 * 60 * 1000 + 80),
    __testUtils.buildSnapshot([{ id: 't1', views: 160 }], now - 30 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 160 }], now - 30 * 60 * 1000 + 75),
    __testUtils.buildSnapshot([{ id: 't1', views: 230 }], now - 20 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 230 }], now - 20 * 60 * 1000 + 65),
    __testUtils.buildSnapshot([{ id: 't1', views: 300 }], now),
  ];

  const result = __testUtils.buildTrackViewsTrend(history, 't1', now, '1h');

  assert.deepEqual(result, [
    { timestamp: history[1].timestamp, views: 100 },
    { timestamp: history[3].timestamp, views: 160 },
    { timestamp: history[5].timestamp, views: 230 },
    { timestamp: history[6].timestamp, views: 300 },
  ]);
});

test('buildTrackTrend removes duplicate samples before building the momentum series', () => {
  const now = Date.now();
  const history = [
    __testUtils.buildSnapshot([{ id: 't1', views: 100 }], now - 40 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 100 }], now - 40 * 60 * 1000 + 80),
    __testUtils.buildSnapshot([{ id: 't1', views: 160 }], now - 30 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 160 }], now - 30 * 60 * 1000 + 75),
    __testUtils.buildSnapshot([{ id: 't1', views: 230 }], now - 20 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 230 }], now - 20 * 60 * 1000 + 65),
    __testUtils.buildSnapshot([{ id: 't1', views: 310 }], now - 10 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 310 }], now - 10 * 60 * 1000 + 55),
    __testUtils.buildSnapshot([{ id: 't1', views: 390 }], now),
  ];

  const result = __testUtils.buildTrackTrend(history, 't1', now, '1h');

  assert.deepEqual(result.map((point) => point.timestamp), [
    history[5].timestamp,
    history[7].timestamp,
    history[8].timestamp,
  ]);
});

test('resolveWindowSelection supports amount plus unit filters', () => {
  const result = __testUtils.resolveWindowSelection({ windowAmount: '3', windowUnit: 'days' });

  assert.equal(result.amount, 3);
  assert.equal(result.unit, 'days');
  assert.equal(Math.round(result.requestedMs / (60 * 60 * 1000)), 72);
});

test('resolveMomentumComparisons uses the largest comparable partial window', () => {
  const now = Date.now();
  const history = [
    __testUtils.buildSnapshot([{ id: 't1', views: 100 }], now - 280 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 180 }], now - 140 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 320 }], now),
  ];

  const result = __testUtils.resolveMomentumComparisons(history, now, 24 * 60 * 60 * 1000);

  assert.equal(result.momentumAvailable, true);
  assert.equal(result.mode, 'partial-window');
  assert.equal(Math.round(result.effectiveWindowMs / (60 * 1000)), 140);
  assert.equal(Math.round(result.storedHistoryMs / (60 * 1000)), 280);
});

test('resolveMomentumComparisons prefers windows closest to the requested size when enough history exists', () => {
  const now = Date.now();
  const history = [
    __testUtils.buildSnapshot([{ id: 't1', views: 100 }], now - 18 * 60 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 500 }], now - 9 * 60 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 900 }], now - 2 * 60 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 1000 }], now - 60 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 1100 }], now),
  ];

  const result = __testUtils.resolveMomentumComparisons(history, now, 60 * 60 * 1000);

  assert.equal(result.mode, 'window-match');
  assert.equal(Math.round(result.effectiveWindowMs / (60 * 1000)), 60);
  assert.equal(result.currentComparison.snapshot.timestamp, history[3].timestamp);
  assert.equal(result.previousComparison.snapshot.timestamp, history[2].timestamp);
});

test('buildTrackTrend keeps all visible momentum points within the stored history limit', () => {
  const now = Date.now();
  let views = 100;
  const history = Array.from({ length: 120 }, (_value, index) => {
    if (index > 0) {
      const increment = index < 40 ? 10 : index < 80 ? 30 : 5;
      views += increment;
    }

    return __testUtils.buildSnapshot([{ id: 't1', views }], now - (119 - index) * 10 * 60 * 1000);
  });

  const result = __testUtils.buildTrackTrend(history, 't1', now, '6h');
  const visibleSnapshots = history.filter((snapshot) => snapshot.timestamp >= now - 6 * 60 * 60 * 1000);

  assert.equal(result.length, visibleSnapshots.length);
  assert.equal(result[0].timestamp, visibleSnapshots[0].timestamp);
  assert.equal(result[result.length - 1].timestamp, history[history.length - 1].timestamp);
  assert.ok(result.some((point) => point.growth < 0));
  assert.ok(result.some((point) => point.growth > 0));
});

test('calculateTrackMomentum can go negative when a track is cooling off versus the prior window', () => {
  const now = Date.now();
  const history = [
    __testUtils.buildSnapshot([{ id: 't1', views: 100 }], now - 130 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 160 }], now - 70 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 210 }], now),
  ];

  const result = __testUtils.calculateTrackMomentum(history, 't1', now, '1h', 210);

  assert.equal(result.currentGain, 50);
  assert.equal(result.previousGain, 60);
  assert.equal(result.growth, -10);
  assert.equal(result.available, true);
});

test('calculateTrackMomentum uses the requested window instead of a much larger historical pair when both are available', () => {
  const now = Date.now();
  const history = [
    __testUtils.buildSnapshot([{ id: 't1', views: 100 }], now - 18 * 60 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 900 }], now - 9 * 60 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 1900 }], now - 2 * 60 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 2000 }], now - 60 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 2100 }], now),
  ];

  const result = __testUtils.calculateTrackMomentum(history, 't1', now, '1h', 2100);

  assert.equal(result.currentGain, 100);
  assert.equal(result.previousGain, 100);
  assert.equal(result.growth, 0);
  assert.equal(result.available, true);
});

test('calculateTrackMomentum returns unavailable when the selected window lacks two full comparisons', () => {
  const now = Date.now();
  const history = [
    __testUtils.buildSnapshot([{ id: 't1', views: 100 }], now - 50 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 160 }], now),
  ];

  const result = __testUtils.calculateTrackMomentum(history, 't1', now, '1h', 160);

  assert.equal(result.available, false);
  assert.equal(result.growth, null);
  assert.equal(result.currentGain, null);
  assert.equal(result.previousGain, null);
});

test('buildDashboardPayload limits widgets and includes artist and track thumbnails', () => {
  const now = Date.now();
  const tracks = Array.from({ length: 12 }, (_value, index) => ({
    id: `t${index + 1}`,
    title: `Song ${index + 1}`,
    artist: index < 4 ? 'Artist A' : `Artist ${index + 1}`,
    views: 1000 - index * 50,
    growth: 200 - index * 10,
    thumbnail: `https://img.test/${index + 1}.jpg`,
    videoUrl: `https://www.youtube.com/watch?v=t${index + 1}`,
    artistUrl: `https://www.youtube.com/channel/artist${index + 1}`,
    trend: [
      { timestamp: now - 60000, views: 900 - index * 50 },
      { timestamp: now, views: 1000 - index * 50 },
    ],
  }));

  const payload = __testUtils.buildDashboardPayload(
    { region: 'US', window: '1h', search: '' },
    {
      tracks,
      updatedAt: new Date(now).toISOString(),
      fetchedAt: now,
      history: [__testUtils.buildSnapshot(tracks, now)],
      source: 'youtube',
      lastError: '',
      storage: 'memory',
    },
  );

  assert.equal(payload.widgets.songs.length, 10);
  assert.equal(payload.widgets.rising.length, 6);
  assert.equal(payload.widgets.trendTracks.length, 10);
  assert.equal(payload.widgets.viralAlerts.length, 0);
  assert.equal(payload.widgets.newSongs.length, 0);
  assert.equal(payload.widgets.songs[0].thumbnail, 'https://img.test/1.jpg');
  assert.equal(payload.widgets.songs[0].videoUrl, 'https://www.youtube.com/watch?v=t1');
  assert.equal(payload.widgets.songs[0].artistUrl, 'https://www.youtube.com/channel/artist1');
  assert.equal(payload.widgets.songs[0].growth, null);
  assert.deepEqual(payload.widgets.songs[0].trend, [{ timestamp: now, views: 1000 }]);
  assert.equal(payload.widgets.rising[0].thumbnail, 'https://img.test/1.jpg');
  assert.equal(payload.widgets.artists[0].thumbnail, 'https://img.test/1.jpg');
  assert.equal(payload.widgets.artists[0].artistUrl, 'https://www.youtube.com/channel/artist1');
  assert.equal(payload.widgets.artists[0].topTrackUrl, 'https://www.youtube.com/watch?v=t1');
  assert.deepEqual(payload.widgets.trendTracks[0].trend, []);
  assert.equal(payload.kpis.avgMomentum, null);
  assert.equal(payload.cache.momentumAvailable, false);
});

test('buildDashboardPayload preserves movement metadata and new-song detection with limited history', () => {
  const now = Date.now();
  const previousTracks = [
    { id: 't5', views: 980 },
    { id: 't1', views: 900 },
    { id: 't4', views: 850 },
    { id: 't2', views: 800 },
  ];
  const currentTracks = [
    { id: 't1', title: 'Song 1', artist: 'Artist 1', views: 1200, thumbnail: 'https://img.test/1.jpg' },
    { id: 't2', title: 'Song 2', artist: 'Artist 2', views: 1000, thumbnail: 'https://img.test/2.jpg' },
    { id: 't3', title: 'Song 3', artist: 'Artist 3', views: 920, thumbnail: 'https://img.test/3.jpg' },
    { id: 't4', title: 'Song 4', artist: 'Artist 4', views: 800, thumbnail: 'https://img.test/4.jpg' },
  ];

  const payload = __testUtils.buildDashboardPayload(
    { region: 'US', window: '1h', search: '' },
    {
      tracks: currentTracks,
      updatedAt: new Date(now).toISOString(),
      fetchedAt: now,
      history: [
        __testUtils.buildSnapshot(previousTracks, now - 40 * 60 * 1000),
        __testUtils.buildSnapshot(currentTracks, now),
      ],
      source: 'youtube',
      lastError: '',
      storage: 'memory',
    },
  );

  const climbedSong = payload.widgets.songs.find((item) => item.id === 't1');
  const newSong = payload.widgets.songs.find((item) => item.id === 't3');

  assert.equal(climbedSong.previousRank, 2);
  assert.equal(climbedSong.rankDelta, 1);
  assert.equal(climbedSong.growth, null);
  assert.equal(newSong.isNew, true);
  assert.equal(payload.kpis.newSongs, 1);
  assert.equal(payload.kpis.alerts, 0);
  assert.deepEqual(payload.widgets.viralAlerts, []);
  assert.equal(payload.widgets.newSongs[0].id, 't3');
  assert.equal(payload.cache.momentumAvailable, false);
});

test('buildDashboardPayload adds viral alerts when the selected window has enough history', () => {
  const now = Date.now();
  const payload = __testUtils.buildDashboardPayload(
    { region: 'US', window: '1h', search: '' },
    {
      tracks: [
        { id: 't1', title: 'Song 1', artist: 'Artist 1', views: 1300, thumbnail: 'https://img.test/1.jpg' },
        { id: 't2', title: 'Song 2', artist: 'Artist 2', views: 1100, thumbnail: 'https://img.test/2.jpg' },
        { id: 't3', title: 'Song 3', artist: 'Artist 3', views: 920, thumbnail: 'https://img.test/3.jpg' },
        { id: 't4', title: 'Song 4', artist: 'Artist 4', views: 810, thumbnail: 'https://img.test/4.jpg' },
      ],
      updatedAt: new Date(now).toISOString(),
      fetchedAt: now,
      history: [
        __testUtils.buildSnapshot([
          { id: 't5', views: 1000 },
          { id: 't1', views: 700 },
          { id: 't4', views: 830 },
          { id: 't2', views: 500 },
        ], now - 130 * 60 * 1000),
        __testUtils.buildSnapshot([
          { id: 't5', views: 980 },
          { id: 't1', views: 900 },
          { id: 't4', views: 850 },
          { id: 't2', views: 800 },
        ], now - 70 * 60 * 1000),
        __testUtils.buildSnapshot([
          { id: 't1', title: 'Song 1', artist: 'Artist 1', views: 1300, thumbnail: 'https://img.test/1.jpg' },
          { id: 't2', title: 'Song 2', artist: 'Artist 2', views: 1100, thumbnail: 'https://img.test/2.jpg' },
          { id: 't3', title: 'Song 3', artist: 'Artist 3', views: 920, thumbnail: 'https://img.test/3.jpg' },
          { id: 't4', title: 'Song 4', artist: 'Artist 4', views: 810, thumbnail: 'https://img.test/4.jpg' },
        ], now),
      ],
      source: 'youtube',
      lastError: '',
      storage: 'memory',
    },
  );

  assert.equal(payload.cache.momentumAvailable, true);
  assert.equal(payload.kpis.alerts, 3);
  assert.ok(payload.widgets.viralAlerts.some((item) => item.type === 'breakout' && item.id === 'alert-breakout-t1'));
  assert.ok(payload.widgets.viralAlerts.some((item) => item.type === 'rank-climb' && item.id === 'alert-rank-t2'));
  assert.ok(payload.widgets.viralAlerts.some((item) => item.type === 'new-entry' && item.id === 'alert-new-t3'));
});

test('buildDashboardPayload exposes negative momentum when a track slows down between windows', () => {
  const now = Date.now();
  const history = [
    __testUtils.buildSnapshot([
      { id: 't1', views: 100 },
      { id: 't2', views: 120 },
      { id: 't3', views: 80 },
    ], now - 130 * 60 * 1000),
    __testUtils.buildSnapshot([
      { id: 't1', views: 160 },
      { id: 't2', views: 170 },
      { id: 't3', views: 130 },
    ], now - 70 * 60 * 1000),
    __testUtils.buildSnapshot([
      { id: 't1', title: 'Song 1', artist: 'Artist 1', views: 210, thumbnail: 'https://img.test/1.jpg' },
      { id: 't2', title: 'Song 2', artist: 'Artist 2', views: 190, thumbnail: 'https://img.test/2.jpg' },
      { id: 't3', title: 'Song 3', artist: 'Artist 3', views: 220, thumbnail: 'https://img.test/3.jpg' },
    ], now),
  ];

  const payload = __testUtils.buildDashboardPayload(
    { region: 'US', window: '1h', search: '' },
    {
      tracks: [
        { id: 't1', title: 'Song 1', artist: 'Artist 1', views: 210, thumbnail: 'https://img.test/1.jpg' },
        { id: 't2', title: 'Song 2', artist: 'Artist 2', views: 190, thumbnail: 'https://img.test/2.jpg' },
        { id: 't3', title: 'Song 3', artist: 'Artist 3', views: 220, thumbnail: 'https://img.test/3.jpg' },
      ],
      updatedAt: new Date(now).toISOString(),
      fetchedAt: now,
      history,
      source: 'youtube',
      lastError: '',
      storage: 'memory',
    },
  );

  assert.equal(payload.widgets.songs.find((item) => item.id === 't1').growth, -10);
  assert.equal(payload.widgets.songs.find((item) => item.id === 't2').growth, -30);
  assert.equal(payload.widgets.songs.find((item) => item.id === 't3').growth, 40);
  assert.deepEqual(payload.widgets.songs.find((item) => item.id === 't3').trend, [
    { timestamp: history[1].timestamp, views: 130 },
    { timestamp: history[2].timestamp, views: 220 },
  ]);
  assert.equal(payload.widgets.trendTracks[0].id, 't3');
  assert.equal(payload.widgets.trendTracks[0].growth, payload.widgets.trendTracks[0].trend.at(-1).growth);
  assert.equal(payload.widgets.trendTracks[1].growth, payload.widgets.trendTracks[1].trend.at(-1).growth);
  assert.equal(payload.widgets.trendTracks[2].growth, payload.widgets.trendTracks[2].trend.at(-1).growth);
  assert.equal(payload.cache.momentumAvailable, true);
});

test('buildDashboardPayload includes selected-window views trends for the top songs', () => {
  const now = Date.now();
  const history = [
    __testUtils.buildSnapshot([
      { id: 't1', views: 100 },
      { id: 't2', views: 130 },
    ], now - 8 * 60 * 60 * 1000),
    __testUtils.buildSnapshot([
      { id: 't1', views: 180 },
      { id: 't2', views: 210 },
    ], now - 5 * 60 * 60 * 1000),
    __testUtils.buildSnapshot([
      { id: 't1', views: 260 },
      { id: 't2', views: 320 },
    ], now - 2 * 60 * 60 * 1000),
    __testUtils.buildSnapshot([
      { id: 't1', title: 'Song 1', artist: 'Artist 1', views: 340, thumbnail: 'https://img.test/1.jpg' },
      { id: 't2', title: 'Song 2', artist: 'Artist 2', views: 410, thumbnail: 'https://img.test/2.jpg' },
    ], now),
  ];

  const payload = __testUtils.buildDashboardPayload(
    { region: 'US', window: '6h', search: '' },
    {
      tracks: [
        { id: 't1', title: 'Song 1', artist: 'Artist 1', views: 340, thumbnail: 'https://img.test/1.jpg' },
        { id: 't2', title: 'Song 2', artist: 'Artist 2', views: 410, thumbnail: 'https://img.test/2.jpg' },
      ],
      updatedAt: new Date(now).toISOString(),
      fetchedAt: now,
      history,
      source: 'youtube',
      lastError: '',
      storage: 'memory',
    },
  );

  assert.deepEqual(payload.widgets.songs[0].trend, [
    { timestamp: history[0].timestamp, views: 130 },
    { timestamp: history[1].timestamp, views: 210 },
    { timestamp: history[2].timestamp, views: 320 },
    { timestamp: history[3].timestamp, views: 410 },
  ]);
  assert.deepEqual(payload.widgets.songs[1].trend, [
    { timestamp: history[0].timestamp, views: 100 },
    { timestamp: history[1].timestamp, views: 180 },
    { timestamp: history[2].timestamp, views: 260 },
    { timestamp: history[3].timestamp, views: 340 },
  ]);
});

test('buildDashboardPayload exposes a shared normalized time axis for both charts', () => {
  const now = Date.now();
  const history = [
    __testUtils.buildSnapshot([{ id: 't1', views: 100 }], now - 40 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 100 }], now - 40 * 60 * 1000 + 80),
    __testUtils.buildSnapshot([{ id: 't1', views: 160 }], now - 30 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 160 }], now - 30 * 60 * 1000 + 75),
    __testUtils.buildSnapshot([{ id: 't1', views: 230 }], now - 20 * 60 * 1000),
    __testUtils.buildSnapshot([{ id: 't1', views: 230 }], now - 20 * 60 * 1000 + 65),
    __testUtils.buildSnapshot([{ id: 't1', title: 'Song 1', artist: 'Artist 1', views: 300, thumbnail: 'https://img.test/1.jpg' }], now),
  ];

  const payload = __testUtils.buildDashboardPayload(
    { region: 'US', window: '1h', search: '' },
    {
      tracks: [
        { id: 't1', title: 'Song 1', artist: 'Artist 1', views: 300, thumbnail: 'https://img.test/1.jpg' },
      ],
      updatedAt: new Date(now).toISOString(),
      fetchedAt: now,
      history,
      source: 'youtube',
      lastError: '',
      storage: 'memory',
    },
  );

  assert.deepEqual(payload.charts.sharedTimeAxis, {
    start: history[1].timestamp,
    end: history[6].timestamp,
    ticks: [history[1].timestamp, history[3].timestamp, history[5].timestamp, history[6].timestamp],
  });
  assert.deepEqual(payload.widgets.songs[0].trend.map((point) => point.timestamp), [
    history[1].timestamp,
    history[3].timestamp,
    history[5].timestamp,
    history[6].timestamp,
  ]);
});

test('buildDashboardPayload returns partial-history metadata for amount and unit requests', () => {
  const now = Date.now();
  const payload = __testUtils.buildDashboardPayload(
    { region: 'US', windowAmount: '1', windowUnit: 'days', search: '' },
    {
      tracks: [
        { id: 't1', title: 'Song 1', artist: 'Artist 1', views: 300, thumbnail: 'https://img.test/1.jpg' },
        { id: 't2', title: 'Song 2', artist: 'Artist 2', views: 220, thumbnail: 'https://img.test/2.jpg' },
      ],
      updatedAt: new Date(now).toISOString(),
      fetchedAt: now,
      history: [
        __testUtils.buildSnapshot([
          { id: 't1', views: 100 },
          { id: 't2', views: 90 },
        ], now - 280 * 60 * 1000),
        __testUtils.buildSnapshot([
          { id: 't1', views: 180 },
          { id: 't2', views: 130 },
        ], now - 140 * 60 * 1000),
        __testUtils.buildSnapshot([
          { id: 't1', title: 'Song 1', artist: 'Artist 1', views: 300, thumbnail: 'https://img.test/1.jpg' },
          { id: 't2', title: 'Song 2', artist: 'Artist 2', views: 220, thumbnail: 'https://img.test/2.jpg' },
        ], now),
      ],
      source: 'youtube',
      lastError: '',
      storage: 'memory',
    },
  );

  assert.deepEqual(payload.filters, {
    region: 'US',
    search: '',
    windowAmount: 1,
    windowUnit: 'days',
  });
  assert.equal(payload.cache.comparisonMode, 'partial-window');
  assert.equal(payload.cache.requestedWindowMinutes, 1440);
  assert.equal(payload.cache.effectiveWindowMinutes, 140);
  assert.equal(payload.cache.observedMinutes, 140);
  assert.equal(payload.cache.storedHistoryMinutes, 280);
  assert.equal(payload.cache.momentumAvailable, true);
});

test('buildDashboardPayload hides momentum-derived widgets when the selected window lacks enough history', () => {
  const now = Date.now();
  const payload = __testUtils.buildDashboardPayload(
    { region: 'US', window: '6h', search: '' },
    {
      tracks: [
        { id: 't1', title: 'Song 1', artist: 'Artist 1', views: 210, thumbnail: 'https://img.test/1.jpg' },
        { id: 't2', title: 'Song 2', artist: 'Artist 2', views: 190, thumbnail: 'https://img.test/2.jpg' },
      ],
      updatedAt: new Date(now).toISOString(),
      fetchedAt: now,
      history: [
        __testUtils.buildSnapshot([
          { id: 't1', views: 100 },
          { id: 't2', views: 120 },
        ], now - 130 * 60 * 1000),
        __testUtils.buildSnapshot([
          { id: 't1', title: 'Song 1', artist: 'Artist 1', views: 210, thumbnail: 'https://img.test/1.jpg' },
          { id: 't2', title: 'Song 2', artist: 'Artist 2', views: 190, thumbnail: 'https://img.test/2.jpg' },
        ], now),
      ],
      source: 'youtube',
      lastError: '',
      storage: 'memory',
    },
  );

  assert.equal(payload.cache.momentumAvailable, false);
  assert.equal(payload.kpis.avgMomentum, null);
  assert.equal(payload.kpis.alerts, 0);
  assert.equal(payload.widgets.songs[0].growth, null);
  assert.deepEqual(payload.widgets.trendTracks[0].trend, []);
  assert.deepEqual(payload.widgets.viralAlerts, []);
});

test('isBlockedYoutubeItem blocks the specific BTS SWIM video id only', () => {
  assert.equal(__testUtils.isBlockedYoutubeItem({ id: 'b4iVv91Z6lY' }), true);
  assert.equal(__testUtils.isBlockedYoutubeItem({ id: 'RBaSiVjtKR4' }), false);
});