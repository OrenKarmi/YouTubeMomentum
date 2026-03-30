import MediaThumb from '../components/MediaThumb';
import { TRACK_MOMENTUM_TOOLTIP } from '../components/momentumTooltips';

function formatViews(value) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatGrowth(value) {
  if (!Number.isFinite(value)) return '—';
  const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
  return `${value >= 0 ? '+' : ''}${compact}`;
}

function getMomentumClassName(value) {
  if (value > 0) return 'momentum-positive';
  if (value < 0) return 'momentum-negative';
  return 'momentum-neutral';
}

function stopPropagation(event) {
  event.stopPropagation();
}

export default function SongsLeaderboardWidget({ items, momentumAvailable = true }) {
  if (!momentumAvailable) return <div className="empty-state">Not enough history yet to rank tracks by momentum for this window.</div>;
  if (!items.length) return <div className="empty-state">No songs found for the current filters.</div>;

  return (
    <table className="data-table">
      <thead><tr><th>#</th><th>Song</th><th><span className="tooltip-target" title={TRACK_MOMENTUM_TOOLTIP}>Momentum</span></th><th>Views</th></tr></thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id} className={item.rank === 1 ? 'leaderboard-row--top' : ''}>
            <td className="rank-cell">{item.rank}</td>
            <td>
              <div className="media-block">
                <MediaThumb className={`media-icon${item.rank === 1 ? ' media-icon--top' : ''}`} src={item.thumbnail} alt="" />
                <div>
                  <strong>
                    {item.videoUrl ? (
                      <a href={item.videoUrl} target="_blank" rel="noreferrer" className="entity-link" onClick={stopPropagation}>
                        {item.title}
                      </a>
                    ) : item.title}
                  </strong>
                  <span className="secondary-text">
                    {item.artistUrl ? (
                      <a href={item.artistUrl} target="_blank" rel="noreferrer" className="entity-link entity-link--secondary" onClick={stopPropagation}>
                        {item.artist}
                      </a>
                    ) : item.artist}
                  </span>
                </div>
              </div>
            </td>
            <td className={`growth-cell numeric-cell ${getMomentumClassName(item.growth)}`}>
              <span className="tooltip-target" title={TRACK_MOMENTUM_TOOLTIP}>{formatGrowth(item.growth)}</span>
            </td>
            <td className="numeric-cell">{formatViews(item.views)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
