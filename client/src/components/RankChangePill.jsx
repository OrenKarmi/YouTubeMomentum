export default function RankChangePill({ previousRank, currentRank, isNew = false }) {
  if (isNew) {
    return <span className="rank-change rank-change--new">NEW</span>;
  }

  if (!previousRank || !currentRank || previousRank === currentRank) {
    return <span className="rank-change rank-change--neutral">—</span>;
  }

  const delta = previousRank - currentRank;
  const direction = delta > 0 ? 'up' : 'down';

  return (
    <span className={`rank-change rank-change--${direction}`} title={`Moved from #${previousRank} to #${currentRank}`}>
      {delta > 0 ? '↑' : '↓'}
      {Math.abs(delta)}
    </span>
  );
}