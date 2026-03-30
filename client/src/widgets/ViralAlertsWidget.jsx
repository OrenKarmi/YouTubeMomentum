import MediaThumb from '../components/MediaThumb';

function formatCompact(value) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

function formatRelative(value) {
  if (!value) return 'just now';
  const diffMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  return `${diffHours}h ago`;
}

function getAlertLabel(type) {
  if (type === 'breakout') return 'Breakout';
  if (type === 'rank-climb') return 'Rank Climb';
  if (type === 'new-entry') return 'New Entry';
  return 'Alert';
}

function getAlertMetric(item) {
  if (item.type === 'breakout') return `${item.growth >= 0 ? '+' : ''}${formatCompact(item.growth)}`;
  if (item.type === 'rank-climb') return `↑${Math.abs(item.rankDelta || 0)}`;
  if (item.type === 'new-entry') return 'NEW';
  return `#${item.currentRank || '—'}`;
}

function getAlertDetail(item) {
  if (item.type === 'breakout') return `Now sitting at #${item.currentRank || '—'} by views.`;
  if (item.type === 'rank-climb') return `Jumped from #${item.previousRank} to #${item.currentRank}.`;
  if (item.type === 'new-entry') return `First seen ${formatRelative(item.firstSeenAt)} at #${item.currentRank || '—'}.`;
  return `${formatCompact(item.views)} total views.`;
}

export default function ViralAlertsWidget({ items, momentumAvailable = true }) {
  if (!momentumAvailable) return <div className="empty-state">Not enough history yet to unlock reliable momentum alerts for this window.</div>;
  if (!items.length) return <div className="empty-state">No alerts yet — collect another snapshot to unlock breakout and rank-change signals.</div>;

  return (
    <div className="alerts-list">
      {items.map((item) => (
        <article className={`alert-card alert-card--${item.tone || 'neutral'}`} key={item.id}>
          <div className="alert-card__topline">
            <span className="alert-badge">{getAlertLabel(item.type)}</span>
            <strong className="alert-metric">{getAlertMetric(item)}</strong>
          </div>

          <div className="media-block">
            <MediaThumb className="media-icon" src={item.thumbnail} alt="" />
            <div>
              <strong>{item.title}</strong>
              <span className="secondary-text">{item.artist}</span>
            </div>
          </div>

          <p className="alert-card__detail">{getAlertDetail(item)}</p>
        </article>
      ))}
    </div>
  );
}