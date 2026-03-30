function formatNumber(value) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

function formatMomentum(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${formatNumber(value)}`;
}

function formatUpdatedAt(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Waiting for first refresh';
}

function getSourceStatus(source) {
  if (source === 'youtube') return { label: 'Live data', tone: 'positive' };
  if (source === 'youtube-stale-cache') return { label: 'Stale cache', tone: 'warning' };
  if (source === 'mock-fallback') return { label: 'Fallback data', tone: 'neutral' };
  return { label: 'Collecting data', tone: 'neutral' };
}

const SINGULAR_WINDOW_UNITS = {
  minutes: 'minute',
  hours: 'hour',
  days: 'day',
  weeks: 'week',
  months: 'month',
};

function formatWindowSelection(filters) {
  const amount = Number.parseInt(filters?.windowAmount, 10);
  const unit = filters?.windowUnit || 'hours';
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 1;
  const singularUnit = SINGULAR_WINDOW_UNITS[unit] || 'hour';
  const labelUnit = safeAmount === 1 ? singularUnit : `${singularUnit}s`;
  return `${safeAmount} ${labelUnit}`;
}

function formatDurationMinutes(totalMinutes) {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return '0 min';

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];

  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours) parts.push(`${hours} hr`);
  if (minutes && parts.length < 2) parts.push(`${minutes} min`);

  return parts.join(' ');
}

function buildMomentumContext(cache, filters) {
  const requestedWindow = formatWindowSelection(filters);

  if (cache?.comparisonMode === 'partial-window' && cache?.effectiveWindowMinutes > 0) {
    return `Requested ${requestedWindow}; using ${formatDurationMinutes(cache.effectiveWindowMinutes)} of comparable history`;
  }

  if (cache?.momentumAvailable === false) {
    const storedHistory = cache?.storedHistoryMinutes > 0
      ? ` (${formatDurationMinutes(cache.storedHistoryMinutes)} stored so far)`
      : '';
    return `Need more history for ${requestedWindow}${storedHistory}`;
  }

  return `Selected window ${requestedWindow}`;
}

export default function KpiStrip({ kpis, updatedAt, loading, source, cache, refreshSettings, filters }) {
  const status = getSourceStatus(source);
  const momentumAvailable = cache?.momentumAvailable !== false;
  const requestedWindow = formatWindowSelection(filters);
  const items = [
    { label: 'Tracks tracked', value: kpis?.tracks || 0, context: `Region ${filters?.region || 'US'}` },
    { label: 'Artists active', value: kpis?.artists || 0, context: 'Across the current leaderboard' },
    {
      label: 'Avg momentum',
      value: formatMomentum(kpis?.avgMomentum),
      context: buildMomentumContext(cache, filters),
      tone: 'accent',
    },
    { label: 'New songs', value: kpis?.newSongs || 0, context: 'Missing from the baseline snapshot', tone: 'positive' },
    { label: 'Live alerts', value: kpis?.alerts || 0, context: 'High-signal changes to watch', tone: 'warning' },
  ];

  return (
    <section className="kpi-strip">
      <div className="kpi-strip__meta">
        <span className={`status-pill status-pill--${status.tone}`}>{status.label}</span>
        <span>Updated {formatUpdatedAt(updatedAt)}</span>
        <span>Refresh every {refreshSettings?.intervalMinutes || 0} min</span>
        <span>{cache?.snapshotCount || 0} snapshots</span>
        <span>Requested {requestedWindow}</span>
        {cache?.storedHistoryMinutes > 0 ? <span>Stored {formatDurationMinutes(cache.storedHistoryMinutes)} of history</span> : null}
        {momentumAvailable && cache?.comparisonMode === 'partial-window' && cache?.effectiveWindowMinutes > 0
          ? <span>Using partial window {formatDurationMinutes(cache.effectiveWindowMinutes)}</span>
          : null}
      </div>

      {items.map((item) => (
        <div className={`kpi${item.tone ? ` kpi--${item.tone}` : ''}`} key={item.label}>
          <div className="kpi-label">{item.label}</div>
          <div className="kpi-value">{loading ? '...' : typeof item.value === 'number' ? formatNumber(item.value) : item.value}</div>
          <div className="kpi-context">{item.context}</div>
        </div>
      ))}
    </section>
  );
}
