const WINDOW_UNIT_MS = {
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
  months: 30 * 24 * 60 * 60 * 1000,
};

const LEGACY_WINDOW_MS = {
  '10m': 10 * WINDOW_UNIT_MS.minutes,
  '1h': 1 * WINDOW_UNIT_MS.hours,
  '6h': 6 * WINDOW_UNIT_MS.hours,
  '24h': 24 * WINDOW_UNIT_MS.hours,
  '1d': 1 * WINDOW_UNIT_MS.days,
  '1w': 1 * WINDOW_UNIT_MS.weeks,
  '1m': 1 * WINDOW_UNIT_MS.months,
};

const baseTracks = [
  { id: 't1', title: 'Midnight City', artist: 'Nova Lane', views: 3200000, hourGrowth: 42000, previousRank: 2 },
  { id: 't2', title: 'Neon Hearts', artist: 'Luma', views: 2800000, hourGrowth: 36000, previousRank: 1 },
  { id: 't3', title: 'Afterglow', artist: 'Sora', views: 2400000, hourGrowth: 51000, previousRank: 4 },
  { id: 't4', title: 'Signals', artist: 'Nova Lane', views: 1800000, hourGrowth: 22000, previousRank: 3 },
  { id: 't5', title: 'Velvet Skies', artist: 'Astra', views: 1600000, hourGrowth: 17000, previousRank: null, firstSeenOffsetMinutes: 20 },
  { id: 't6', title: 'Echo Run', artist: 'Luma', views: 1200000, hourGrowth: 14000, previousRank: 6 },
  { id: 't7', title: 'Static Bloom', artist: 'Kite Echo', views: 980000, hourGrowth: 12500, previousRank: 8 },
  { id: 't8', title: 'Moonwire', artist: 'Sora', views: 910000, hourGrowth: 11200, previousRank: 7 },
  { id: 't9', title: 'Silver Pulse', artist: 'Astra', views: 860000, hourGrowth: 9800, previousRank: 10 },
  { id: 't10', title: 'Night Arcade', artist: 'Nova Lane', views: 790000, hourGrowth: 9100, previousRank: 9 },
];

function resolveWindowMs(filters) {
  const amount = Number(filters.windowAmount);
  const unit = String(filters.windowUnit || '').toLowerCase();

  if (Number.isFinite(amount) && amount > 0 && WINDOW_UNIT_MS[unit]) {
    return amount * WINDOW_UNIT_MS[unit];
  }

  return LEGACY_WINDOW_MS[filters.window] || LEGACY_WINDOW_MS['1h'];
}

function buildMockViewsTrend(track, index, now, windowMs) {
  const earlyViews = Math.max(0, Math.round(track.views - track.hourGrowth * (1.9 + index * 0.04)));
  const midpointViews = Math.max(0, Math.round(track.views - track.hourGrowth * (0.85 + index * 0.03)));

  return [
    { timestamp: now - windowMs, views: earlyViews },
    { timestamp: now - Math.round(windowMs / 2), views: midpointViews },
    { timestamp: now, views: track.views },
  ];
}

function buildDashboardResponse(filters) {
  const now = Date.now();
  const windowMs = resolveWindowMs(filters);
  const sharedTimeline = [
    now - windowMs,
    now - Math.round(windowMs / 2),
    now,
  ];
  const search = String(filters.search || '').trim().toLowerCase();
  const filteredTracks = baseTracks.filter((track) => {
    if (!search) return true;
    return `${track.title} ${track.artist}`.toLowerCase().includes(search);
  });

  const songs = [...filteredTracks]
    .sort((a, b) => b.views - a.views)
    .map((track, index) => ({
      id: track.id,
      rank: index + 1,
      title: track.title,
      artist: track.artist,
      growth: track.hourGrowth,
      views: track.views,
      trend: buildMockViewsTrend(track, index, now, windowMs),
      previousRank: track.previousRank,
      rankDelta: track.previousRank ? track.previousRank - (index + 1) : 0,
      isNew: track.previousRank === null,
      thumbnail: '',
    }));

  const rising = [...filteredTracks]
    .sort((a, b) => b.hourGrowth - a.hourGrowth)
    .map((track, index) => {
      const songRank = songs.find((item) => item.id === track.id)?.rank || null;
      return {
        id: track.id,
        rank: index + 1,
        title: track.title,
        artist: track.artist,
        growth: track.hourGrowth,
        currentRank: songRank,
        previousRank: track.previousRank,
        rankDelta: track.previousRank && songRank ? track.previousRank - songRank : 0,
        isNew: track.previousRank === null,
        thumbnail: '',
      };
    });

  const artistMap = new Map();
  for (const track of filteredTracks) {
    const current = artistMap.get(track.artist) || { id: `artist-${track.artist}`, name: track.artist, score: 0, topTrack: track.title };
    current.score += track.hourGrowth;
    if (track.views > (current.topTrackViews || 0)) {
      current.topTrack = track.title;
      current.topTrackViews = track.views;
    }
    artistMap.set(track.artist, current);
  }

  const artists = [...artistMap.values()]
    .sort((a, b) => b.score - a.score)
    .map((artist, index) => ({ id: artist.id, rank: index + 1, name: artist.name, score: artist.score, topTrack: artist.topTrack, thumbnail: '' }));

  const trendTracks = rising.slice(0, 10).map((track, index) => ({
    ...track,
    trend: [
      { timestamp: now - windowMs, growth: track.growth + (index === 0 ? 12000 : 8000 - index * 350) },
      { timestamp: now - Math.round(windowMs / 2), growth: track.growth + (index === 0 ? 4000 : -3000 + index * 275) },
      { timestamp: now, growth: track.growth },
    ],
  }));

  const newSongs = songs
    .filter((track) => track.isNew)
    .map((track) => ({
      id: track.id,
      title: track.title,
      artist: track.artist,
      views: track.views,
      growth: filteredTracks.find((item) => item.id === track.id)?.hourGrowth || 0,
      currentRank: track.rank,
      firstSeenAt: new Date(now - ((filteredTracks.find((item) => item.id === track.id)?.firstSeenOffsetMinutes || 12) * 60 * 1000)).toISOString(),
      thumbnail: '',
    }));

  const viralAlerts = [];
  if (rising[0]) {
    viralAlerts.push({
      id: `alert-breakout-${rising[0].id}`,
      type: 'breakout',
      tone: 'hot',
      title: rising[0].title,
      artist: rising[0].artist,
      thumbnail: '',
      currentRank: rising[0].currentRank,
      previousRank: rising[0].previousRank,
      rankDelta: rising[0].rankDelta,
      growth: rising[0].growth,
      views: songs.find((item) => item.id === rising[0].id)?.views || 0,
      firstSeenAt: null,
    });
  }

  const climbingTrack = rising.find((track) => track.rankDelta > 0);
  if (climbingTrack) {
    viralAlerts.push({
      id: `alert-rank-${climbingTrack.id}`,
      type: 'rank-climb',
      tone: 'positive',
      title: climbingTrack.title,
      artist: climbingTrack.artist,
      thumbnail: '',
      currentRank: climbingTrack.currentRank,
      previousRank: climbingTrack.previousRank,
      rankDelta: climbingTrack.rankDelta,
      growth: climbingTrack.growth,
      views: songs.find((item) => item.id === climbingTrack.id)?.views || 0,
      firstSeenAt: null,
    });
  }

  if (newSongs[0]) {
    viralAlerts.push({
      id: `alert-new-${newSongs[0].id}`,
      type: 'new-entry',
      tone: 'accent',
      title: newSongs[0].title,
      artist: newSongs[0].artist,
      thumbnail: '',
      currentRank: newSongs[0].currentRank,
      previousRank: null,
      rankDelta: 0,
      growth: newSongs[0].growth,
      views: newSongs[0].views,
      firstSeenAt: newSongs[0].firstSeenAt,
    });
  }

  const totalGrowth = rising.reduce((sum, track) => sum + track.growth, 0);

  return {
    filters,
    kpis: {
      tracks: songs.length,
      artists: artists.length,
      avgMomentum: songs.length ? Math.round(totalGrowth / songs.length) : 0,
      newSongs: newSongs.length,
      alerts: viralAlerts.length,
    },
    charts: {
      sharedTimeAxis: {
        start: sharedTimeline[0],
        end: sharedTimeline[sharedTimeline.length - 1],
        ticks: sharedTimeline,
      },
    },
    widgets: { songs, artists, rising, trendTracks, newSongs, viralAlerts },
    updatedAt: new Date(now).toISOString(),
  };
}

module.exports = { buildDashboardResponse };
