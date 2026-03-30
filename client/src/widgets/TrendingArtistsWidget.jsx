import MediaThumb from '../components/MediaThumb';
import { ARTIST_TOTAL_MOMENTUM_TOOLTIP } from '../components/momentumTooltips';

function formatScore(value) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export default function TrendingArtistsWidget({ items, momentumAvailable = true }) {
  if (!momentumAvailable) return <div className="empty-state">Not enough history yet to rank artists by momentum for this window.</div>;
  if (!items.length) return <div className="empty-state">No artists found for the current filters.</div>;

  return (
    <table className="data-table">
      <thead><tr><th>#</th><th>Artist</th><th><span className="tooltip-target" title={ARTIST_TOTAL_MOMENTUM_TOOLTIP}>Total Momentum</span></th></tr></thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td className="rank-cell">{item.rank}</td>
            <td>
              <div className="media-block">
                <MediaThumb className="media-icon artist-icon" src={item.thumbnail} alt="" label={item.name?.charAt(0)?.toUpperCase() || 'A'} />
                <div>
                  <strong>
                    {item.artistUrl ? (
                      <a href={item.artistUrl} target="_blank" rel="noreferrer" className="entity-link">
                        {item.name}
                      </a>
                    ) : item.name}
                  </strong>
                  <span className="secondary-text">
                    {item.topTrackUrl ? (
                      <a href={item.topTrackUrl} target="_blank" rel="noreferrer" className="entity-link entity-link--secondary">
                        {item.topTrack}
                      </a>
                    ) : item.topTrack}
                  </span>
                </div>
              </div>
            </td>
            <td className="numeric-cell"><span className="tooltip-target" title={ARTIST_TOTAL_MOMENTUM_TOOLTIP}>{formatScore(item.score)}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
