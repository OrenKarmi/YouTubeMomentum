import { useMemo, useState } from 'react';
import MediaThumb from '../components/MediaThumb';
import { buildNumericAxis, buildTimeAxis, formatTimeTick } from './chartAxis';
import {
  LATEST_MOMENTUM_TOOLTIP,
  TRACK_MOMENTUM_TOOLTIP,
  TREND_CHANGE_TOOLTIP,
  TREND_CHART_MOMENTUM_TOOLTIP,
} from '../components/momentumTooltips';

const SERIES_COLORS = ['#38bdf8', '#a78bfa', '#f97316', '#22c55e', '#f43f5e', '#eab308', '#14b8a6', '#fb7185', '#818cf8', '#f59e0b'];
const CHART = {
  width: 760,
  height: 360,
  top: 24,
  right: 24,
  bottom: 84,
  left: 78,
};
const X_PADDING = 12;

function formatCompact(value) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

function formatGrowth(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${formatCompact(value)}`;
}

function formatExactValue(value) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en').format(Math.round(value));
}

function formatLatestMomentum(value) {
  if (!Number.isFinite(value)) return '';
  return `Latest ${formatGrowth(value)}`;
}

function getMomentumClassName(value) {
  if (value > 0) return 'momentum-positive';
  if (value < 0) return 'momentum-negative';
  return 'momentum-neutral';
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
    `Momentum: ${point.growth >= 0 ? '+' : ''}${formatExactValue(point.growth)}`,
  ].join('\n');
}

function resolveXAxis(points, sharedTimeAxis) {
  const pointTimestamps = points.map((point) => point.timestamp);
  const fallbackMin = Math.min(...pointTimestamps);
  const fallbackMax = Math.max(...pointTimestamps);
  const sharedStart = sharedTimeAxis?.start;
  const sharedEnd = sharedTimeAxis?.end;
  const minX = Number.isFinite(sharedStart) ? sharedStart : fallbackMin;
  const maxX = Number.isFinite(sharedEnd) ? sharedEnd : fallbackMax;
  const { ticks, step } = buildTimeAxis(minX, maxX, 4);

  return {
    minX,
    maxX,
    xTicks: ticks,
    xTickStep: step,
  };
}

function buildLinePath(points, scaleX, scaleY) {
  if (points.length < 2) return '';

  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${scaleX(point.timestamp).toFixed(2)} ${scaleY(point.growth).toFixed(2)}`)
    .join(' ');
}

export default function TrackTrendWidget({ items, momentumAvailable = true, sharedTimeAxis = null }) {
  const [highlightedTrackId, setHighlightedTrackId] = useState(null);

  const toggleTrackHighlight = (trackId) => {
    setHighlightedTrackId((current) => (current === trackId ? null : trackId));
  };

  const series = useMemo(() => items.map((item, index) => {
    const trend = item.trend || [];
    const firstPoint = trend[0] || null;
    const lastPoint = trend[trend.length - 1] || null;
    const chartDelta = Number.isFinite(firstPoint?.growth) && Number.isFinite(lastPoint?.growth)
      ? lastPoint.growth - firstPoint.growth
      : null;
    const currentGrowth = Number.isFinite(lastPoint?.growth) ? lastPoint.growth : item.growth;

    return {
      ...item,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      trend,
      firstPoint,
      lastPoint,
      currentGrowth,
      legendGrowth: Number.isFinite(chartDelta) ? chartDelta : currentGrowth,
    };
  }), [items]);
  const activeTrackId = series.some((item) => item.id === highlightedTrackId) ? highlightedTrackId : null;

  const chart = useMemo(() => {
    const points = series.flatMap((item) => item.trend);

    if (!points.length) {
      return null;
    }

    const { minX, maxX, xTicks, xTickStep } = resolveXAxis(points, sharedTimeAxis);
    const minY = Math.min(...points.map((point) => point.growth || 0));
    const maxY = Math.max(...points.map((point) => point.growth || 0));
    const yAxis = buildNumericAxis(minY, maxY, { tickCount: 5, includeZero: true });
    const chartMinY = yAxis.min;
    const chartMaxY = yAxis.max;
    const plotWidth = CHART.width - CHART.left - CHART.right;
    const plotHeight = CHART.height - CHART.top - CHART.bottom;
    const plotStartX = CHART.left + X_PADDING;
    const plotEndX = CHART.left + plotWidth - X_PADDING;
    const paddedPlotWidth = Math.max(plotEndX - plotStartX, 1);
    const xRange = maxX - minX;
    const yRange = chartMaxY - chartMinY;
    const scaleX = (value) => (xRange === 0
      ? plotStartX + paddedPlotWidth / 2
      : plotStartX + ((value - minX) / xRange) * paddedPlotWidth);
    const scaleY = (value) => (yRange === 0
      ? CHART.top + plotHeight / 2
      : CHART.top + plotHeight - ((value - chartMinY) / yRange) * plotHeight);

    return {
      plotWidth,
      plotHeight,
      scaleX,
      scaleY,
      zeroLineY: chartMinY <= 0 && chartMaxY >= 0 ? scaleY(0) : CHART.top + plotHeight,
      xTicks,
      xTickStep,
      yTicks: yAxis.ticks,
    };
  }, [series, sharedTimeAxis]);

  if (!momentumAvailable) return <div className="empty-state">Not enough history yet to chart reliable momentum for this window.</div>;
  if (!items.length) return <div className="empty-state">No track trends found for the current filters.</div>;
  if (!chart) return <div className="empty-state">Collecting history for the selected top tracks…</div>;

  return (
    <div className="trend-widget">
      <div className="trend-chart-panel">
        <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} className="trend-widget-chart" role="img" aria-label="Momentum chart for the top 10 rising tracks">
          {chart.yTicks.map((tick) => {
            const y = chart.scaleY(tick);

            return (
              <g key={`y-${tick}`}>
                <line x1={CHART.left} y1={y} x2={CHART.left + chart.plotWidth} y2={y} className="chart-grid-line" />
                <text x={CHART.left - 10} y={y + 4} className={`chart-axis-label chart-axis-label-y ${getMomentumClassName(tick)}`}>
                  <title>{TRACK_MOMENTUM_TOOLTIP}</title>
                  {formatGrowth(Math.round(tick))}
                </text>
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

          <line x1={CHART.left} y1={chart.zeroLineY} x2={CHART.left + chart.plotWidth} y2={chart.zeroLineY} className="chart-axis-line" />
          <line x1={CHART.left} y1={CHART.top} x2={CHART.left} y2={CHART.top + chart.plotHeight} className="chart-axis-line" />

          {series.map((item) => {
            const selected = activeTrackId === item.id;
            const dimmed = activeTrackId && !selected;
            const opacity = dimmed ? 0.18 : 1;

            return (
              <g key={item.id} style={{ opacity }}>
                {item.trend.length > 1 ? (
                  <path d={buildLinePath(item.trend, chart.scaleX, chart.scaleY)} className="chart-series-line" style={{ stroke: item.color }} />
                ) : null}
                {item.trend.map((point, index) => {
                  const isLastPoint = index === item.trend.length - 1;
                  const cx = chart.scaleX(point.timestamp);
                  const cy = chart.scaleY(point.growth);

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
          <text x="20" y={CHART.top + chart.plotHeight / 2} textAnchor="middle" transform={`rotate(-90 20 ${CHART.top + chart.plotHeight / 2})`} className="chart-axis-title chart-axis-title--tooltip">
            <title>{TREND_CHART_MOMENTUM_TOOLTIP}</title>
            Momentum
          </text>
        </svg>
      </div>

      <div className="trend-series-menu" role="list" aria-label="Track trend legend">
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
                  {item.videoUrl ? (
                    <a href={item.videoUrl} target="_blank" rel="noreferrer" className="entity-link" onClick={stopPropagation}>
                      {item.title}
                    </a>
                  ) : item.title}
                </strong>
                <div className="trend-menu-meta">
                  <div className="trend-menu-meta-copy">
                    <span className="secondary-text">
                      {item.artistUrl ? (
                        <a href={item.artistUrl} target="_blank" rel="noreferrer" className="entity-link entity-link--secondary" onClick={stopPropagation}>
                          {item.artist}
                        </a>
                      ) : item.artist}
                    </span>
                    {Number.isFinite(item.currentGrowth) ? (
                      <span
                        className={`trend-direction-pill tooltip-target ${getMomentumClassName(item.currentGrowth)}`}
                        title={LATEST_MOMENTUM_TOOLTIP}
                      >
                        {formatLatestMomentum(item.currentGrowth)}
                      </span>
                    ) : null}
                  </div>
                  <span
                    className={`trend-growth-pill tooltip-target ${getMomentumClassName(item.legendGrowth)}`}
                    title={TREND_CHANGE_TOOLTIP}
                  >
                    {formatGrowth(item.legendGrowth)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}