import MediaThumb from '../components/MediaThumb';

function formatViews(value) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

function formatSigned(value) {
  return `${value >= 0 ? '+' : ''}${formatViews(value)}`;
}

function formatRelative(value) {
  if (!value) return 'just now';
  const diffMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  return `${diffHours}h ago`;
}

export default function NewSongsWidget({ items }) {
  if (!items.length) return <div className="empty-state">No new songs detected yet for the selected comparison window.</div>;

  return (
    <div className="feed-list">
      {items.map((item) => (
        <article className="feed-item" key={item.id}>
          <MediaThumb className="media-icon" src={item.thumbnail} alt="" />

          <div className="feed-item__copy">
            <strong>{item.title}</strong>
            <span className="secondary-text">{item.artist}</span>
            <span className="feed-item__meta">Detected {formatRelative(item.firstSeenAt)} · #{item.currentRank || '—'} by views</span>
          </div>

          <div className="feed-item__stat">
            <strong>{formatViews(item.views)}</strong>
            <span>{item.growth ? formatSigned(item.growth) : 'New'}</span>
          </div>
        </article>
      ))}
    </div>
  );
}