const TIME_STEPS_MS = [
  60 * 1000,
  5 * 60 * 1000,
  10 * 60 * 1000,
  15 * 60 * 1000,
  30 * 60 * 1000,
  60 * 60 * 1000,
  2 * 60 * 60 * 1000,
  3 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  2 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  14 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
];

const DATE_FORMATTER = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
const TIME_FORMATTER = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' });
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en', { weekday: 'short' });

function normalizeNumber(value) {
  const normalized = Number(value.toFixed(10));
  return Object.is(normalized, -0) ? 0 : normalized;
}

function buildEvenlySpacedTicks(min, max, count) {
  if (min === max) return [min];
  return Array.from({ length: count }, (_value, index) => min + ((max - min) * index) / (count - 1));
}

function getNiceStep(rawStep) {
  if (!Number.isFinite(rawStep) || rawStep <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;

  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function countAlignedTicks(min, max, step) {
  const firstTick = Math.ceil(min / step) * step;
  if (firstTick > max) return 0;
  return Math.floor((max - firstTick) / step) + 1;
}

export function buildNumericAxis(minValue, maxValue, options = {}) {
  const tickCount = Math.max(2, options.tickCount || 5);
  const includeZero = Boolean(options.includeZero);
  const minFloor = Number.isFinite(options.minFloor) ? options.minFloor : null;
  let min = Number.isFinite(minValue) ? minValue : 0;
  let max = Number.isFinite(maxValue) ? maxValue : 0;

  if (includeZero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }

  if (min === max) {
    const padding = Math.max(Math.abs(max || min) * 0.1, 1);
    min -= padding;
    max += padding;
  }

  const step = getNiceStep((max - min) / (tickCount - 1));
  let axisMin = Math.floor(min / step) * step;
  let axisMax = Math.ceil(max / step) * step;

  if (minFloor !== null) {
    axisMin = Math.max(minFloor, axisMin);
  }

  if (axisMin === axisMax) {
    axisMax = axisMin + step;
  }

  const ticks = [];
  for (let value = axisMin; value <= axisMax + step / 2; value += step) {
    ticks.push(normalizeNumber(value));
  }

  return {
    min: normalizeNumber(axisMin),
    max: normalizeNumber(axisMax),
    ticks,
    step: normalizeNumber(step),
  };
}

export function buildTimeAxis(minTimestamp, maxTimestamp, targetTickCount = 4) {
  if (!Number.isFinite(minTimestamp) || !Number.isFinite(maxTimestamp)) {
    return { ticks: [], step: 0 };
  }

  if (minTimestamp === maxTimestamp) {
    return { ticks: [minTimestamp], step: 0 };
  }

  const maxTicks = Math.max(2, targetTickCount);
  let chosenStep = TIME_STEPS_MS[TIME_STEPS_MS.length - 1];

  for (const step of TIME_STEPS_MS) {
    const count = countAlignedTicks(minTimestamp, maxTimestamp, step);
    if (count >= 2 && count <= maxTicks) {
      chosenStep = step;
      break;
    }
    if (count === 1) {
      chosenStep = step;
      break;
    }
  }

  const firstTick = Math.ceil(minTimestamp / chosenStep) * chosenStep;
  const ticks = [];

  for (let value = firstTick; value <= maxTimestamp; value += chosenStep) {
    ticks.push(value);
  }

  if (ticks.length < 2) {
    return {
      ticks: buildEvenlySpacedTicks(minTimestamp, maxTimestamp, Math.min(maxTicks, 4)).map(normalizeNumber),
      step: normalizeNumber(maxTimestamp - minTimestamp),
    };
  }

  return {
    ticks: ticks.map(normalizeNumber),
    step: chosenStep,
  };
}

export function formatTimeTick(value, stepMs = 0) {
  const date = new Date(value);

  if (stepMs >= 24 * 60 * 60 * 1000) {
    return {
      primary: DATE_FORMATTER.format(date),
      secondary: WEEKDAY_FORMATTER.format(date),
    };
  }

  return {
    primary: TIME_FORMATTER.format(date),
    secondary: DATE_FORMATTER.format(date),
  };
}