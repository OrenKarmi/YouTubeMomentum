import { useMemo, useState } from 'react';
import MediaThumb from '../components/MediaThumb';
import { buildNumericAxis, buildTimeAxis, formatTimeTick } from './chartAxis';

const SERIES_COLORS = ['#38bdf8', '#a78bfa', '#f97316', '#22c55e', '#f43f5e', '#eab308', '#14b8a6', '#fb7185', '#818cf8', '#f59e0b'];
const CHART = {
  width: 760,
  height: 360,
  top: 24,
  right: 24,
  bottom: 84,
  left: 78,
};

function formatCompact(value) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

function formatCurrentViews(value) {
  if (!Number.isFinite(value)) return '—';
  return `${formatCompact(value)} views`;
}

function formatExactValue(value) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en').format(Math.round(value));
}

function formatWindowChange(value) {
  if (!Number.isFinite(value)) return '';
  return `Window ${value >= 0 ? '+' : ''}${formatCompact(value)}`;
}

function stopPropagation(event) {
  event.stopPropagation();
}

function formatTooltipTimestamp(value) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function buildPointTooltip(item, point) {
  return [
    `${item.title} — ${item.artist}`,
    formatTooltipTimestamp(point.timestamp),
    `Views: ${formatExactValue(point.views)}`,
  ].join('\n');
}

function buildLinePath(points, scaleX, scaleY) {
  if (points.length < 2) return '';

  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${scaleX(point.timestamp).toFixed(2)} ${scaleY(point.views).toFixed(2)}`)
    .join(' ');
}

export default function TrackViewsWidget({ items }) {
  const [highlightedTrackId, setHighlightedTrackId] = useState(null);

  const toggleTrackHighlight = (trackId) => {
    setHighlightedTrackId((current) => (current === trackId ? null : trackId));
  };

  const series = useMemo(() => items.map((item, index) => {
    const trend = item.trend || [];
    const firstPoint = trend[0] || null;
    const lastPoint = trend[trend.length - 1] || null;

    return {
      ...item,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      trend,
      currentViews: Number.isFinite(lastPoint?.views) ? lastPoint.views : item.views,
      windowChange: Number.isFinite(firstPoint?.views) && Number.isFinite(lastPoint?.views) && trend.length > 1
        ? lastPoint.views - firstPoint.views
        : null,
      lastPoint,
    };
  }), [items]);
  const activeTrackId = series.some((item) => item.id === highlightedTrackId) ? highlightedTrackId : null;

  const chart = useMemo(() => {
    const points = series.flatMap((item) => item.trend);

    if (!points.length) {
      return null;
    }

    const minX = Math.min(...points.map((point) => point.timestamp));
    const maxX = Math.max(...points.map((point) => point.timestamp));
    const minY = Math.min(...points.map((point) => point.views || 0));
    const maxY = Math.max(...points.map((point) => point.views || 0));
    const yAxis = buildNumericAxis(minY, maxY, { tickCount: 5, minFloor: 0 });
    const xAxis = buildTimeAxis(minX, maxX, 4);
    const chartMinY = yAxis.min;
    const chartMaxY = yAxis.max;
    const plotWidth = CHART.width - CHART.left - CHART.right;
    const plotHeight = CHART.height - CHART.top - CHART.bottom;
    const xRange = maxX - minX;
    const yRange = chartMaxY - chartMinY;
    const scaleX = (value) => (xRange === 0
      ? CHART.left + plotWidth / 2
      : CHART.left + ((value - minX) / xRange) * plotWidth);
    const scaleY = (value) => (yRange === 0
      ? CHART.top + plotHeight / 2
      : CHART.top + plotHeight - ((value - chartMinY) / yRange) * plotHeight);

    return {
      plotWidth,
      plotHeight,
      scaleX,
      scaleY,
      xTicks: xAxis.ticks,
      xTickStep: xAxis.step,
      yTicks: yAxis.ticks,
    };
  }, [series]);

  if (!items.length) return <div className="empty-state">No track views found for the current filters.</div>;
  if (!chart) return <div className="empty-state">Collecting history for the selected top tracks…</div>;

  return (
    <div className="trend-widget">
      <div className="trend-chart-panel">
        <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} className="trend-widget-chart" role="img" aria-label="Views chart for the top 10 tracks">
          {chart.yTicks.map((tick) => {
            const y = chart.scaleY(tick);

            return (
              <g key={`y-${tick}`}>
                <line x1={CHART.left} y1={y} x2={CHART.left + chart.plotWidth} y2={y} className="chart-grid-line" />
                <text x={CHART.left - 10} y={y + 4} className="chart-axis-label chart-axis-label-y">{formatCompact(Math.round(tick))}</text>
              </g>
            );
          })}

          {chart.xTicks.map((tick) => {
            const x = chart.scaleX(tick);
            const label = formatTimeTick(tick, chart.xTickStep);

            return (
              <g key={`x-${tick}`}>
                <line x1={x} y1={CHART.top} x2={x} y2={CHART.top + chart.plotHeight} className="chart-grid-line chart-grid-line-vertical" />
                <text x={x} y={CHART.top + chart.plotHeight + 20} textAnchor="middle" className="chart-axis-label">
                  <tspan x={x} dy="0">{label.primary}</tspan>
                  <tspan x={x} dy="1.15em">{label.secondary}</tspan>
                </text>
              </g>
            );
          })}

          <line x1={CHART.left} y1={CHART.top + chart.plotHeight} x2={CHART.left + chart.plotWidth} y2={CHART.top + chart.plotHeight} className="chart-axis-line" />
          <line x1={CHART.left} y1={CHART.top} x2={CHART.left} y2={CHART.top + chart.plotHeight} className="chart-axis-line" />

          {series.map((item) => {
            const selected = activeTrackId === item.id;
            const dimmed = activeTrackId && !selected;
            const opacity = dimmed ? 0.18 : 1;

            return (
              <g key={item.id} style={{ opacity }}>
                {item.trend.length > 1 ? <path d={buildLinePath(item.trend, chart.scaleX, chart.scaleY)} className="chart-series-line" style={{ stroke: item.color }} /> : null}
                {item.trend.map((point, index) => {
                  const isLastPoint = index === item.trend.length - 1;
                  const cx = chart.scaleX(point.timestamp);
                  const cy = chart.scaleY(point.views);

                  return (
                    <g key={`${item.id}-${point.timestamp}-${index}`}>
                      <circle cx={cx} cy={cy} r={isLastPoint ? '4.5' : '3.25'} className="chart-series-point" style={{ fill: item.color }} />
                      <circle cx={cx} cy={cy} r="9" fill="transparent">
                        <title>{buildPointTooltip(item, point)}</title>
                      </circle>
                    </g>
                  );
                })}
              </g>
            );
          })}

          <text x={CHART.left + chart.plotWidth / 2} y={CHART.height - 12} textAnchor="middle" className="chart-axis-title">Time</text>
          <text x="20" y={CHART.top + chart.plotHeight / 2} textAnchor="middle" transform={`rotate(-90 20 ${CHART.top + chart.plotHeight / 2})`} className="chart-axis-title">Views</text>
        </svg>
      </div>

      <div className="trend-series-menu" role="list" aria-label="Track views legend">
        {series.map((item) => {
          const selected = activeTrackId === item.id;
          const dimmed = activeTrackId && !selected;

          return (
            <div
              key={item.id}
              className={`trend-series-button${item.rank === 1 ? ' trend-series-button--top' : ''}${selected ? ' is-selected' : ''}${dimmed ? ' is-dimmed' : ''}`}
              onClick={() => toggleTrackHighlight(item.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  toggleTrackHighlight(item.id);
                }
              }}
              role="listitem"
              tabIndex={0}
              aria-pressed={selected}
            >
              <span className="trend-series-rank">{item.rank}</span>
              <span className="trend-series-swatch" style={{ backgroundColor: item.color }} aria-hidden="true" />
              <MediaThumb className={`media-icon trend-menu-icon${item.rank === 1 ? ' trend-menu-icon--top' : ''}`} src={item.thumbnail} alt="" />
              <div className="trend-menu-copy">
                <strong>
                  {item.videoUrl ? <a href={item.videoUrl} target="_blank" rel="noreferrer" className="entity-link" onClick={stopPropagation}>{item.title}</a> : item.title}
                </strong>
                <div className="trend-menu-meta">
                  <div className="trend-menu-meta-copy">
                    <span className="secondary-text">
                      {item.artistUrl ? <a href={item.artistUrl} target="_blank" rel="noreferrer" className="entity-link entity-link--secondary" onClick={stopPropagation}>{item.artist}</a> : item.artist}
                    </span>
                    {Number.isFinite(item.windowChange) ? <span className="trend-direction-pill" title="Net views gained during the visible selected period">{formatWindowChange(item.windowChange)}</span> : null}
                  </div>
                  <span className="trend-growth-pill">{formatCurrentViews(item.currentViews)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}