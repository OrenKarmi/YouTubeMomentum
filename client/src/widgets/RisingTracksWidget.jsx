import MediaThumb from '../components/MediaThumb';
import RankChangePill from '../components/RankChangePill';
import { TRACK_MOMENTUM_TOOLTIP } from '../components/momentumTooltips';

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

export default function RisingTracksWidget({ items, momentumAvailable = true }) {
  if (!momentumAvailable) return <div className="empty-state">Not enough history yet to identify the fastest-rising tracks for this window.</div>;
  if (!items.length) return <div className="empty-state">No rising tracks found for the current filters.</div>;

  return (
    <table className="data-table">
      <thead><tr><th>#</th><th>Track</th><th>Move</th><th><span className="tooltip-target" title={TRACK_MOMENTUM_TOOLTIP}>Momentum</span></th></tr></thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td className="rank-cell">{item.rank}</td>
            <td>
              <div className="media-block">
                <MediaThumb className="media-icon" src={item.thumbnail} alt="" />
                <div>
                  <strong>{item.title}</strong>
                  <span className="secondary-text">{item.artist}</span>
                </div>
              </div>
            </td>
            <td><RankChangePill previousRank={item.previousRank} currentRank={item.currentRank} isNew={item.isNew} /></td>
            <td className={`growth-cell numeric-cell ${getMomentumClassName(item.growth)}`}><span className="tooltip-target" title={TRACK_MOMENTUM_TOOLTIP}>{formatGrowth(item.growth)}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
