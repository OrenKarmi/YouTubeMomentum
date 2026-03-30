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
const DUPLICATE_SAMPLE_GAP_MS = 1000;
const X_PADDING = 12;

function formatCompact(value) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

function formatGain(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${formatCompact(value)}`;
}

function formatExactValue(value) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en').format(Math.round(value));
}

function formatLatestGain(value) {
  if (!Number.isFinite(value)) return '—';
  return `${formatGain(value)} views`;
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
    `Views gained: ${point.gain >= 0 ? '+' : ''}${formatExactValue(point.gain)}`,
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
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${scaleX(point.timestamp).toFixed(2)} ${scaleY(point.gain).toFixed(2)}`)
    .join(' ');
}

function normalizeTrend(trend) {
  if (!Array.isArray(trend) || !trend.length) return [];

  const ordered = [...trend].sort((a, b) => a.timestamp - b.timestamp);

  return ordered.reduce((normalized, point) => {
    const previousPoint = normalized[normalized.length - 1];

    if (
      previousPoint
      && previousPoint.views === point.views
      && point.timestamp - previousPoint.timestamp <= DUPLICATE_SAMPLE_GAP_MS
    ) {
      normalized[normalized.length - 1] = point;
      return normalized;
    }

    normalized.push(point);
    return normalized;
  }, []);
}

function buildGainTrend(trend) {
  const normalizedTrend = normalizeTrend(trend);
  if (normalizedTrend.length < 2) return [];

  return normalizedTrend.slice(1).map((point, index) => ({
    timestamp: point.timestamp,
    gain: point.views - normalizedTrend[index].views,
  }));
}

export default function TrackViewsDeltaWidget({ items, sharedTimeAxis = null }) {
  const [highlightedTrackId, setHighlightedTrackId] = useState(null);

  const series = useMemo(() => items.map((item, index) => {
    const trend = buildGainTrend(item.trend || []);
    const firstPoint = trend[0] || null;
    const lastPoint = trend[trend.length - 1] || null;

    return {
      ...item,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      trend,
      firstPoint,
      lastPoint,
      latestGain: Number.isFinite(lastPoint?.gain) ? lastPoint.gain : null,
      totalVisibleGain: Number.isFinite(firstPoint?.gain) && Number.isFinite(lastPoint?.gain)
        ? trend.reduce((sum, point) => sum + point.gain, 0)
        : null,
    };
  }), [items]);

  const activeTrackId = series.some((item) => item.id === highlightedTrackId) ? highlightedTrackId : null;

  const chart = useMemo(() => {
    const points = series.flatMap((item) => item.trend);
    if (!points.length) return null;

    const { minX, maxX, xTicks, xTickStep } = resolveXAxis(points, sharedTimeAxis);
    const minY = Math.min(...points.map((point) => point.gain || 0));
    const maxY = Math.max(...points.map((point) => point.gain || 0));
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
    const scaleX = (value) => (xRange === 0 ? plotStartX + paddedPlotWidth / 2 : plotStartX + ((value - minX) / xRange) * paddedPlotWidth);
    const scaleY = (value) => (yRange === 0 ? CHART.top + plotHeight / 2 : CHART.top + plotHeight - ((value - chartMinY) / yRange) * plotHeight);

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

  if (!items.length) return <div className="empty-state">No track views found for the current filters.</div>;
  if (!chart) return <div className="empty-state">Need at least two samples in the selected period to chart sample-to-sample view gains.</div>;

  return (
    <div className="trend-widget">
      <div className="trend-chart-panel">
        <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} className="trend-widget-chart" role="img" aria-label="Views gained between samples for the top 10 tracks">
          {chart.yTicks.map((tick) => {
            const y = chart.scaleY(tick);
            return (
              <g key={`y-${tick}`}>
                <line x1={CHART.left} y1={y} x2={CHART.left + chart.plotWidth} y2={y} className="chart-grid-line" />
                <text x={CHART.left - 10} y={y + 4} className="chart-axis-label chart-axis-label-y">{formatGain(Math.round(tick))}</text>
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
                {item.trend.length > 1 ? <path d={buildLinePath(item.trend, chart.scaleX, chart.scaleY)} className="chart-series-line" style={{ stroke: item.color }} /> : null}
                {item.trend.map((point, index) => {
                  const isLastPoint = index === item.trend.length - 1;
                  const cx = chart.scaleX(point.timestamp);
                  const cy = chart.scaleY(point.gain);

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
          <text x="20" y={CHART.top + chart.plotHeight / 2} textAnchor="middle" transform={`rotate(-90 20 ${CHART.top + chart.plotHeight / 2})`} className="chart-axis-title">Views gained</text>
        </svg>
      </div>

      <div className="trend-series-menu" role="list" aria-label="Track sample gains legend">
        {series.map((item) => {
          const selected = activeTrackId === item.id;
          const dimmed = activeTrackId && !selected;

          return (
            <div
              key={item.id}
              className={`trend-series-button${item.rank === 1 ? ' trend-series-button--top' : ''}${selected ? ' is-selected' : ''}${dimmed ? ' is-dimmed' : ''}`}
              onClick={() => setHighlightedTrackId((current) => (current === item.id ? null : item.id))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setHighlightedTrackId((current) => (current === item.id ? null : item.id));
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
                <strong>{item.videoUrl ? <a href={item.videoUrl} target="_blank" rel="noreferrer" className="entity-link" onClick={stopPropagation}>{item.title}</a> : item.title}</strong>
                <div className="trend-menu-meta">
                  <div className="trend-menu-meta-copy">
                    <span className="secondary-text">{item.artistUrl ? <a href={item.artistUrl} target="_blank" rel="noreferrer" className="entity-link entity-link--secondary" onClick={stopPropagation}>{item.artist}</a> : item.artist}</span>
                    {Number.isFinite(item.totalVisibleGain) ? <span className="trend-direction-pill" title="Total views gained across the visible sample-to-sample points">Visible total {formatGain(item.totalVisibleGain)}</span> : null}
                  </div>
                  <span className="trend-growth-pill">{formatLatestGain(item.latestGain)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}