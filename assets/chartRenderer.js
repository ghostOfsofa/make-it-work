const COLORS = {
  background: "#0b1220",
  grid: "#243044",
  text: "#cbd5e1",
  muted: "#94a3b8",
  bullish: "#ef4444",
  bearish: "#3b82f6",
  regression: "#f87171",
  trendNextPrice: "#facc15",
  selectedLine: "#d946ef",
  axis: "#475569",
  matchedArea: "rgba(148, 163, 184, 0.18)",
  ema5: "#d946ef",
  ema20: "#eab308",
  ema60: "#22c55e",
  ema112: "#38bdf8",
  ema224: "#f97316",
  ema448: "#f8fafc",
  signal: "#22c55e",
  longEmaBadge: "#f59e0b",
  ichimokuSpanA: "#38bdf8",
  ichimokuSpanB: "#38bdf8",
  ichimokuBullishCloud: "rgba(56, 189, 248, 0.16)",
  ichimokuBearishCloud: "rgba(56, 189, 248, 0.16)",
  bollingerUpper: "#facc15",
  bollingerMiddle: "#a3a3a3",
  bollingerLower: "#a3a3a3",
  bollingerArrow: "#facc15",
  bollingerArrowStroke: "#f59e0b",
};

const EMA_STYLES = {
  ema5: { strokeWidth: 1.2, opacity: 0.55, glow: false },
  ema20: { strokeWidth: 1.4, opacity: 0.65, glow: false },
  ema60: { strokeWidth: 1.6, opacity: 0.75, glow: false },
  ema112: { strokeWidth: 2.4, opacity: 0.95, glow: true },
  ema224: { strokeWidth: 2.8, opacity: 1, glow: true },
  ema448: { strokeWidth: 3.2, opacity: 1, glow: true },
};

const DEFAULT_MARGIN = { top: 40, right: 90, bottom: 60, left: 30 };
const DESKTOP_PAGE_SIZE = 1;
const MOBILE_PAGE_SIZE = 20;
const MOBILE_BREAKPOINT = 980;
const DEFAULT_CHART_MODE = "detail";

const MINI_CHART_OPTIONS = {
  chartWidth: 900,
  chartHeight: 506,
  renderPeriod: 80,
  rightPaddingBars: 3,
  margin: { top: 28, right: 70, bottom: 42, left: 20 },
  showGrid: true,
  showAxisLabels: true,
  showTooltip: true,
  showEMA5: true,
  showEMA20: false,
  showEMA60: false,
  showEMA112: true,
  showEMA224: true,
  showEMA448: true,
  showLastPriceLabel: true,
  showEma5Label: true,
  emaLabelPeriod: 5,
  highlightLongEma: true,
  longEmaPeriods: [112, 224, 448],
  shortEmaPeriods: [5, 20, 60],
  showEmaLegend: true,
  emaLegendPlacement: "header",
  showEmaRightLabels: false,
  emaRightLabelsPlacement: "axis-margin",
  showLongEmaGlow: true,
  miniChartLongEmaOnly: true,
  showRegressionLine: true,
  showSelectedPriceLine: false,
  showMa5PriceGuide: true,
  showTrendNextPriceGuide: true,
  showIchimokuCloud: true,
  showSenkouSpanLines: true,
  showTenkanLine: false,
  showKijunLine: false,
  ichimokuDisplacement: 26,
  debugIchimokuRender: false,
  showBollingerUpperBand: true,
  showBollingerMiddleBand: false,
  showBollingerLowerBand: false,
  showBollingerYellowArrows: true,
  showMatchedArea: true,
  showCandleWick: true,
};

const DETAIL_CHART_OPTIONS = {
  chartWidth: 1600,
  chartHeight: 900,
  renderPeriod: 80,
  rightPaddingBars: 5,
  margin: DEFAULT_MARGIN,
  showGrid: true,
  showAxisLabels: true,
  showTooltip: true,
  showEMA5: true,
  showEMA20: true,
  showEMA60: true,
  showEMA112: true,
  showEMA224: true,
  showEMA448: true,
  showLastPriceLabel: true,
  showEma5Label: true,
  emaLabelPeriod: 5,
  highlightLongEma: true,
  longEmaPeriods: [112, 224, 448],
  shortEmaPeriods: [5, 20, 60],
  showEmaLegend: true,
  emaLegendPlacement: "header",
  showEmaRightLabels: true,
  emaRightLabelsPlacement: "axis-margin",
  showLongEmaGlow: true,
  miniChartLongEmaOnly: false,
  showRegressionLine: true,
  showSelectedPriceLine: false,
  showMa5PriceGuide: true,
  showTrendNextPriceGuide: true,
  showIchimokuCloud: true,
  showSenkouSpanLines: true,
  showTenkanLine: false,
  showKijunLine: false,
  ichimokuDisplacement: 26,
  debugIchimokuRender: false,
  showBollingerUpperBand: true,
  showBollingerMiddleBand: false,
  showBollingerLowerBand: false,
  showBollingerYellowArrows: true,
  showMatchedArea: true,
  showCandleWick: true,
};

let appData = null;
let screeningRuns = [];
let sortKey = "angle";
let currentPage = 1;
let isMobileLayout = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
const filters = {
  stockName: "",
};
const chartModes = new Map();

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const round = (value, digits = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return Number.NaN;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
};

const isFiniteValue = (value) =>
  value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

const formatPrice = (value) =>
  isFiniteValue(value) ? Math.round(Number(value)).toLocaleString("ko-KR") : "-";

const formatNumber = (value, digits = 2) =>
  isFiniteValue(value) ? round(Number(value), digits).toLocaleString("ko-KR") : "-";

const formatPercent = (value, digits = 2) => {
  if (!isFiniteValue(value)) return "-";
  const number = Number(value);
  return `${number > 0 ? "+" : ""}${number.toFixed(digits)}%`;
};

const calculateChangeRate = (value, prevClose) => {
  const price = Number(value);
  const base = Number(prevClose);
  if (!Number.isFinite(price) || !Number.isFinite(base) || base <= 0) return null;
  return ((price - base) / base) * 100;
};

const formatChangeRate = (rate) => {
  if (rate == null || !Number.isFinite(Number(rate))) return "N/A";
  const number = Number(rate);
  return `${number > 0 ? "+" : ""}${number.toFixed(2)}%`;
};

const getChangeRateClass = (rate) => {
  if (rate == null || !Number.isFinite(Number(rate)) || Number(rate) === 0) return "neutral";
  return Number(rate) > 0 ? "up" : "down";
};

const createTooltipPriceLine = (label, price, rate) => `
  <span>${label}: ${formatPrice(price)} <em class="tooltip-rate ${getChangeRateClass(rate)}">(${formatChangeRate(rate)})</em></span>
`;

const formatDateLabel = (date) => {
  const parts = String(date ?? "").split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : String(date ?? "");
};

const metric = (label, value, className = "") =>
  `<span class="metric ${className}"><b>${escapeHtml(label)}</b>${value}</span>`;

const formatLongEmaConvergenceLabel = (result) => {
  if (result.longEmaConditionReason === "THREE_EMA_CONVERGED") return "3개 모임";
  if (result.longEmaConditionReason === "TWO_EMA_CONVERGED") return "2개 모임";
  return result.isLongEmaConverged ? "YES" : "NO";
};

const trendPrice = (candle) => candle.high;

const unpackCandles = (rows = []) =>
  rows.map(([date, open, high, low, close]) => ({ date, open, high, low, close }));

const calculatePriceRange = (candles, indicatorValues = []) => {
  const values = [
    ...candles.flatMap((candle) => [
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      trendPrice(candle),
    ]),
    ...indicatorValues,
  ].filter((value) => value != null && Number.isFinite(Number(value)));
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return { minPrice: Number.NaN, maxPrice: Number.NaN };
  }
  const padding = Math.max((max - min) * 0.05, max * 0.005, 1);
  return { minPrice: Math.max(1, min - padding), maxPrice: max + padding };
};

const priceToY = (price, minPrice, maxPrice, plotHeight, marginTop) =>
  marginTop + ((maxPrice - price) / (maxPrice - minPrice)) * plotHeight;

const calculateNicePriceTicks = (minPrice, maxPrice, tickCount = 6) => {
  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || maxPrice <= minPrice) return [];
  const range = maxPrice - minPrice;
  const rawStep = range / Math.max(1, tickCount - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  const niceStep = residual >= 5 ? 5 * magnitude : residual >= 2 ? 2 * magnitude : magnitude;
  const start = Math.ceil(minPrice / niceStep) * niceStep;
  const ticks = [];
  for (let value = start; value <= maxPrice + niceStep * 0.5; value += niceStep) ticks.push(value);
  return ticks;
};

const createPolyline = (points, stroke, attrs = "") => {
  const valid = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (valid.length < 2) return "";
  return `<polyline points="${valid.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}" fill="none" stroke="${stroke}" ${attrs}/>`;
};

const splitValidLineSegments = (points) => {
  const segments = [];
  let current = [];

  points.forEach((point) => {
    if (Number.isFinite(point.x) && Number.isFinite(point.y)) {
      current.push(point);
      return;
    }

    if (current.length >= 2) segments.push(current);
    current = [];
  });

  if (current.length >= 2) segments.push(current);
  return segments;
};

const createIchimokuCloudPath = (segment, scale) => {
  if (segment.length < 2) return "";
  const upper = segment.map((point) => ({
    x: point.x,
    y: scale.y(point.upper),
  }));
  const lower = [...segment].reverse().map((point) => ({
    x: point.x,
    y: scale.y(point.lower),
  }));
  const points = [...upper, ...lower];
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return "";
  const [first, ...rest] = points;
  return `M ${first.x.toFixed(2)} ${first.y.toFixed(2)} ${rest.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ")} Z`;
};

const createIchimokuCloud = ({
  result,
  series,
  scale,
  options,
  renderStartIndex = 0,
  renderCandlesLength = 0,
  rightPaddingBars = 0,
}) => {
  if (result.screenType !== "JJAP_SUBAK" || !Array.isArray(series) || series.length < 2) {
    return "";
  }

  const points = series.map((item, index) => {
    const spanA = Number(item.senkouSpanA);
    const spanB = Number(item.senkouSpanB);
    const isValid = Number.isFinite(spanA) && Number.isFinite(spanB);
    return {
      index,
      x: scale.x(index),
      spanA,
      spanB,
      upper: isValid ? Math.max(spanA, spanB) : Number.NaN,
      lower: isValid ? Math.min(spanA, spanB) : Number.NaN,
      isValid,
    };
  });

  const segments = [];
  let current = [];
  points.forEach((point) => {
    if (point.isValid && Number.isFinite(point.x)) {
      current.push(point);
      return;
    }
    if (current.length >= 2) segments.push(current);
    current = [];
  });
  if (current.length >= 2) segments.push(current);

  if (!segments.length) return "";

  if (options.debugIchimokuRender) {
    const validPoints = segments.flat();
    console.debug("[ICHIMOKU RENDER]", {
      code: result.code,
      renderStartIndex,
      renderCandlesLength,
      rightPaddingBars,
      ichimokuPointCount: validPoints.length,
      firstDisplayIndex: validPoints[0]?.index ?? null,
      lastDisplayIndex: validPoints.at(-1)?.index ?? null,
    });
  }

  const showSenkouSpanLines =
    options.showSenkouSpanLines ?? options.showIchimokuLines ?? true;
  const spanALine = showSenkouSpanLines
    ? segments
        .map((segment) =>
          createPolyline(
            segment.map((point) => ({ x: point.x, y: scale.y(point.spanA) })),
            COLORS.ichimokuSpanA,
            `stroke-width="1.6" opacity="0.95" stroke-linecap="round" stroke-linejoin="round"`,
          ),
        )
        .join("")
    : "";
  const spanBLine = showSenkouSpanLines
    ? segments
        .map((segment) =>
          createPolyline(
            segment.map((point) => ({ x: point.x, y: scale.y(point.spanB) })),
            COLORS.ichimokuSpanB,
            `stroke-width="1.6" opacity="0.95" stroke-linecap="round" stroke-linejoin="round"`,
          ),
        )
        .join("")
    : "";

  const cloudFill = options.showIchimokuCloud
    ? segments
        .map((segment) => createIchimokuCloudPath(segment, scale))
        .filter(Boolean)
        .map((path) => `<path d="${path}" fill="${COLORS.ichimokuBullishCloud}"/>`)
        .join("")
    : "";

  return `${cloudFill}${spanALine}${spanBLine}`;
};

const calculateSMA = (values) => {
  if (!Array.isArray(values) || values.length === 0) return null;
  const validValues = values.map(Number).filter(Number.isFinite);
  if (validValues.length !== values.length) return null;
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
};

const calculateStandardDeviation = (values) => {
  const mean = calculateSMA(values);
  if (mean == null) return null;
  const variance =
    values.reduce((sum, value) => {
      const diff = Number(value) - mean;
      return sum + diff * diff;
    }, 0) / values.length;
  return Math.sqrt(variance);
};

const calculateShiftedBollingerBands = (candles, options = {}) => {
  const period = options.bollingerPeriod ?? 33;
  const multiplier = options.bollingerStdDevMultiplier ?? 0.1;
  const shiftBars = options.bollingerShiftBars ?? 25;
  const emptyBand = (date) => ({
    date,
    middleBand: null,
    upperBand: null,
    lowerBand: null,
    shiftedMiddleBand: null,
    shiftedUpperBand: null,
    shiftedLowerBand: null,
  });

  const bands = candles.map((candle, index) => {
    if (index < period - 1) return emptyBand(candle.date);
    const window = candles.slice(index - period + 1, index + 1);
    const closes = window.map((item) => Number(item.close));
    const middleBand = calculateSMA(closes);
    const stdDev = calculateStandardDeviation(closes);
    if (middleBand == null || stdDev == null) return emptyBand(candle.date);
    return {
      date: candle.date,
      middleBand,
      upperBand: middleBand + stdDev * multiplier,
      lowerBand: middleBand - stdDev * multiplier,
      shiftedMiddleBand: null,
      shiftedUpperBand: null,
      shiftedLowerBand: null,
    };
  });

  for (let index = 0; index < bands.length; index += 1) {
    const targetIndex = index + shiftBars;
    if (targetIndex < bands.length) {
      bands[targetIndex].shiftedMiddleBand = bands[index].middleBand;
      bands[targetIndex].shiftedUpperBand = bands[index].upperBand;
      bands[targetIndex].shiftedLowerBand = bands[index].lowerBand;
    }
  }

  return bands;
};

const calculateBollingerYellowArrowSignals = (candles, options = {}) => {
  const bands = calculateShiftedBollingerBands(candles, options);
  return candles.map((candle, index) => {
    const close = Number(candle.close);
    const shiftedUpperBand = bands[index]?.shiftedUpperBand;
    const prevClose = index > 0 ? Number(candles[index - 1]?.close) : null;
    const prevShiftedUpperBand = index > 0 ? bands[index - 1]?.shiftedUpperBand : null;
    return {
      date: candle.date,
      close,
      shiftedUpperBand,
      shiftedMiddleBand: bands[index]?.shiftedMiddleBand ?? null,
      shiftedLowerBand: bands[index]?.shiftedLowerBand ?? null,
      prevClose,
      prevShiftedUpperBand,
      isYellowArrow:
        Number.isFinite(prevClose) &&
        Number.isFinite(prevShiftedUpperBand) &&
        Number.isFinite(close) &&
        Number.isFinite(shiftedUpperBand) &&
        prevClose <= prevShiftedUpperBand &&
        close > shiftedUpperBand,
    };
  });
};

const createBollingerBandLines = ({ result, signals, scale, options }) => {
  if (
    result.screenType !== "JJAP_SUBAK" ||
    (!options.showBollingerUpperBand &&
      !options.showBollingerMiddleBand &&
      !options.showBollingerLowerBand)
  ) {
    return "";
  }
  const points = (signals ?? []).map((signal, index) => ({
    x: scale.x(index),
    upperBand: signal.shiftedUpperBand,
    middleBand: signal.shiftedMiddleBand,
    lowerBand: signal.shiftedLowerBand,
  }));
  const toBandPoint = (point, key) => ({
    x: point.x,
    y: isFiniteValue(point[key]) ? scale.y(Number(point[key])) : Number.NaN,
  });
  const createSegmentedPolyline = (bandPoints, stroke, attrs) =>
    splitValidLineSegments(bandPoints)
      .map((segment) => createPolyline(segment, stroke, attrs))
      .join("");

  return [
    options.showBollingerUpperBand
      ? createSegmentedPolyline(
          points.map((point) => toBandPoint(point, "upperBand")),
          COLORS.bollingerUpper,
          `stroke-width="3" opacity="1"`,
        )
      : "",
    options.showBollingerMiddleBand
      ? createSegmentedPolyline(
          points.map((point) => toBandPoint(point, "middleBand")),
          COLORS.bollingerMiddle,
          `stroke-width="1" opacity="0.55"`,
        )
      : "",
    options.showBollingerLowerBand
      ? createSegmentedPolyline(
          points.map((point) => toBandPoint(point, "lowerBand")),
          COLORS.bollingerLower,
          `stroke-width="1" opacity="0.45"`,
        )
      : "",
  ].join("");
};

const createBollingerYellowArrows = ({ result, signals, candles, scale, options }) => {
  if (result.screenType !== "JJAP_SUBAK" || !options.showBollingerYellowArrows) return "";
  return signals
    .map((signal, index) => {
      if (!signal.isYellowArrow) return "";
      const candle = candles[index];
      const x = scale.x(index);
      const lowY = scale.y(Number(candle?.low));
      const y = Math.min(lowY + 10, options.margin.top + (options.chartHeight - options.margin.top - options.margin.bottom) - 8);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
      return `
        <polygon points="${x},${y} ${x - 7},${y + 12} ${x + 7},${y + 12}"
          fill="${COLORS.bollingerArrow}" stroke="${COLORS.bollingerArrowStroke}" stroke-width="1.4"/>
      `;
    })
    .join("");
};

const getEmaStyle = (period) => EMA_STYLES[`ema${period}`] ?? EMA_STYLES.ema20;

const getVisibleEmaPeriods = (options) => [5, 20, 60, 112, 224, 448]
  .filter((period) => options[`showEMA${period}`])
  .filter((period) => !options.miniChartLongEmaOnly || options.longEmaPeriods.includes(period));

const createEmaPoints = (values, scale) =>
  (values ?? []).map((value, index) => ({
    x: scale.x(index),
    y: value == null ? Number.NaN : scale.y(Number(value)),
    value,
  }));

const createEmaLine = (values, scale, period, options) => {
  const style = getEmaStyle(period);
  const color = COLORS[`ema${period}`];
  const points = createEmaPoints(values, scale);
  const glow =
    options.showLongEmaGlow && style.glow
      ? createPolyline(
          points,
          color,
          `stroke-width="${style.strokeWidth + 4}" opacity="0.22" stroke-linecap="round" stroke-linejoin="round"`,
        )
      : "";
  const main = createPolyline(
    points,
    color,
    `stroke-width="${style.strokeWidth}" opacity="${style.opacity}" stroke-linecap="round" stroke-linejoin="round"`,
  );
  return `${glow}${main}`;
};

const latestFiniteValue = (values = []) => {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (value != null && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
};

const calculateLatestEMA = (candles, period) => {
  if (!Array.isArray(candles) || candles.length < period) return null;
  const values = candles.map((candle) => Number(candle.close));
  if (!values.every(Number.isFinite)) return null;
  const firstEma = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  const multiplier = 2 / (period + 1);
  return values.slice(period).reduce(
    (previousEma, value) => value * multiplier + previousEma * (1 - multiplier),
    firstEma,
  );
};

const adjustRightSideLabels = (labels, minGap = 28) => {
  const sorted = [...labels].sort((a, b) => a.y - b.y);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].y - sorted[index - 1].y < minGap) {
      sorted[index].y = sorted[index - 1].y + minGap;
    }
  }
  return sorted;
};

const createRightSideLabelElements = (labels, chartWidth, margin) =>
  adjustRightSideLabels(labels)
    .map((label) => `
      <rect x="${chartWidth - margin.right + 6}" y="${label.y - 13}" width="${label.width}" height="26" rx="4" fill="${label.color}" opacity="${label.opacity ?? 0.96}"/>
      <text x="${chartWidth - margin.right + 6 + label.width / 2}" y="${label.y + 6}" fill="${label.textColor ?? "white"}" font-size="${label.fontSize ?? 17}" font-weight="700" text-anchor="middle">${label.text}</text>
    `)
    .join("");

const createRightSideEmaLabels = ({ emaValues, scale, chartWidth, margin, plotHeight, options }) => {
  if (!options.showEmaRightLabels) return "";
  const labels = options.longEmaPeriods
    .map((period) => {
      const value = latestFiniteValue(emaValues[`ema${period}`]);
      if (value == null) return null;
      return {
        period,
        value,
        y: Math.min(margin.top + plotHeight - 14, Math.max(margin.top + 14, scale.y(value))),
        color: COLORS[`ema${period}`],
        textColor: period === 448 ? "#0f172a" : "white",
        text: `EMA${period} ${formatPrice(value)}`,
        width: 118,
      };
    })
    .filter(Boolean);
  return createRightSideLabelElements(labels, chartWidth, margin);
};

const createPriceAndEma5Labels = ({ lastCandle, previousCandle, emaValues, scale, chartWidth, margin, plotHeight, options }) => {
  const labels = [];
  if (options.showLastPriceLabel) {
    const lastY = scale.y(lastCandle.close);
    labels.push({
      key: "lastClose",
      y: Math.min(margin.top + plotHeight - 14, Math.max(margin.top + 14, lastY)),
      color: lastCandle.close >= previousCandle?.close ? COLORS.bullish : COLORS.bearish,
      text: formatPrice(lastCandle.close),
      width: 82,
      fontSize: 20,
    });
  }
  if (options.showEma5Label) {
    const ema5 = latestFiniteValue(emaValues[`ema${options.emaLabelPeriod}`]);
    if (ema5 != null) {
      const emaY = scale.y(ema5);
      labels.push({
        key: "ema5",
        y: Math.min(margin.top + plotHeight - 14, Math.max(margin.top + 14, emaY)),
        color: COLORS.ema5,
        text: `EMA5 ${formatPrice(ema5)}`,
        width: 112,
        fontSize: 17,
      });
    }
  }
  return createRightSideLabelElements(labels, chartWidth, margin);
};

const createEmaLegendHtml = (result, options = DETAIL_CHART_OPTIONS) => {
  if (!options.showEmaLegend) return "";
  const emaValues = appData?.emaData?.[result.code] ?? {};
  const periods = getVisibleEmaPeriods(options);
  const items = periods
    .map((period) => {
      const value = latestFiniteValue(emaValues[`ema${period}`]);
      const isLong = options.longEmaPeriods.includes(period);
      return `
        <span class="ema-legend-item ${isLong ? "long-ema" : ""}">
          <i class="ema-color-chip" style="background:${COLORS[`ema${period}`]}"></i>
          EMA${period} ${formatPrice(value)}
        </span>
      `;
    })
    .join("");
  const bearish = result.isLongEmaBearish
    ? `<span class="ema-bearish-badge">장기 역배열 YES · 112 &lt; 224 &lt; 448</span>`
    : `<span class="ema-bearish-badge off">장기 역배열 NO</span>`;
  return `
    <div class="ema-legend" aria-label="EMA 범례">
      ${bearish}
      ${items}
    </div>
  `;
};

const createGridLines = ({ chartWidth, chartHeight, margin, plotWidth, ticks, scale }) =>
  ticks
    .map((tick) => {
      const y = scale.y(tick);
      return `
        <line x1="${margin.left}" y1="${y}" x2="${chartWidth - margin.right}" y2="${y}" stroke="${COLORS.grid}" stroke-width="1"/>
        <text x="${chartWidth - margin.right + 12}" y="${y + 5}" fill="${COLORS.muted}" font-size="22">${formatPrice(tick)}</text>
      `;
    })
    .join("") +
  Array.from({ length: 6 }, (_, index) => {
    const x = margin.left + (plotWidth / 5) * index;
    return `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${chartHeight - margin.bottom}" stroke="${COLORS.grid}" stroke-width="1" opacity="0.65"/>`;
  }).join("");

const createAxisLabels = ({ candles, margin, chartHeight, scale }) => {
  const step = Math.max(1, Math.floor(candles.length / 5));
  return candles
    .map((candle, index) =>
      index % step === 0 || index === candles.length - 1
        ? `<text x="${scale.x(index)}" y="${chartHeight - margin.bottom + 34}" fill="${COLORS.muted}" font-size="22" text-anchor="middle">${formatDateLabel(candle.date)}</text>`
        : "",
    )
    .join("");
};

const createHoverAreas = ({ candles, margin, plotHeight, candleSlotWidth, scale, showTooltip }) =>
  !showTooltip
    ? ""
    : candles
        .map((candle, index) => {
          const prevClose = candles[index - 1]?.close;
          const openChangeRate = calculateChangeRate(candle.open, prevClose);
          const highChangeRate = calculateChangeRate(candle.high, prevClose);
          const lowChangeRate = calculateChangeRate(candle.low, prevClose);
          const closeChangeRate = calculateChangeRate(candle.close, prevClose);
          return `<rect class="candle-hover-area" x="${scale.x(index) - candleSlotWidth / 2}" y="${margin.top}" width="${candleSlotWidth}" height="${plotHeight}" fill="transparent"
        data-date="${escapeHtml(candle.date)}" data-open="${candle.open}" data-high="${candle.high}" data-low="${candle.low}" data-close="${candle.close}" data-prev-close="${prevClose ?? ""}"
        data-open-change-rate="${openChangeRate ?? ""}" data-high-change-rate="${highChangeRate ?? ""}" data-low-change-rate="${lowChangeRate ?? ""}" data-close-change-rate="${closeChangeRate ?? ""}"/>`;
        })
        .join("");

const createBuySignalMarker = (signal, scale, chartWidth, margin, showLabel) => {
  if (!signal || !Number.isFinite(Number(signal.currentPrice))) return "";
  const y = scale.y(Number(signal.currentPrice));
  if (!Number.isFinite(y)) return "";
  const x = chartWidth - margin.right - 24;
  return `
    <line x1="${margin.left}" y1="${y}" x2="${chartWidth - margin.right}" y2="${y}" stroke="${COLORS.signal}" stroke-width="2" stroke-dasharray="8 8"/>
    <circle cx="${x}" cy="${y}" r="${showLabel ? 9 : 5}" fill="${COLORS.signal}"/>
    ${showLabel ? `<text x="${x - 14}" y="${y - 14}" text-anchor="end" fill="${COLORS.signal}" font-size="22">MA5 돌파 ${formatPrice(signal.currentPrice)}</text>` : ""}
  `;
};

const createMa5PriceGuide = ({ ma5Price, scale, chartWidth, margin, options }) => {
  if (!options.showMa5PriceGuide || !Number.isFinite(Number(ma5Price))) return "";
  const y = scale.y(Number(ma5Price));
  if (!Number.isFinite(y)) return "";
  return `
    <line x1="${margin.left}" y1="${y}" x2="${chartWidth - margin.right}" y2="${y}" stroke="${COLORS.ema5}" stroke-width="1.5" opacity="0.42"/>
    ${options.showAxisLabels ? `<text x="${chartWidth - margin.right - 10}" y="${y - 8}" fill="${COLORS.ema5}" font-size="18" text-anchor="end" opacity="0.78">EMA5 ${formatPrice(ma5Price)}</text>` : ""}
  `;
};

const createTrendNextPriceGuide = ({ trendNextPrice, trendNextX, scale, chartWidth, margin, options }) => {
  if (!options.showTrendNextPriceGuide || !Number.isFinite(Number(trendNextPrice))) return "";
  const y = scale.y(Number(trendNextPrice));
  if (!Number.isFinite(y)) return "";
  const labelX = Number.isFinite(Number(trendNextX))
    ? Math.min(chartWidth - margin.right - 10, Number(trendNextX) + 80)
    : chartWidth - margin.right - 10;
  return `
    <line x1="${margin.left}" y1="${y}" x2="${chartWidth - margin.right}" y2="${y}" stroke="${COLORS.trendNextPrice}" stroke-width="1.5" opacity="0.46"/>
    ${options.showAxisLabels ? `<text x="${labelX}" y="${y + 18}" fill="${COLORS.trendNextPrice}" font-size="18" text-anchor="end" opacity="0.82">다음추세 ${formatPrice(trendNextPrice)}</text>` : ""}
  `;
};

const getStoredTrendLinePoints = ({ result, scale, candles, xStep }) => {
  const startIndex = candles.findIndex((candle) => candle.date === result.scanStartDate);
  const endIndex = candles.findIndex((candle) => candle.date === result.scanEndDate);
  const resolvedStartIndex = startIndex >= 0
    ? startIndex
    : Math.max(0, candles.length - Number(result.matchedPeriod || 0));
  const resolvedEndIndex = endIndex >= 0 ? endIndex : candles.length - 1;
  const startPrice = Number(result.trendLineStartPrice);
  const endPrice = Number(result.trendLineEndPrice);
  const nextPrice = Number(result.trendNextPrice);

  if (
    !Number.isFinite(startPrice) ||
    !Number.isFinite(endPrice) ||
    !Number.isFinite(nextPrice) ||
    resolvedStartIndex < 0 ||
    resolvedEndIndex < 0
  ) {
    return null;
  }

  const startX = scale.x(resolvedStartIndex);
  const endX = scale.x(resolvedEndIndex);
  const nextX = endX + xStep;
  const points = [
    [startX, scale.y(startPrice)],
    [endX, scale.y(endPrice)],
    [nextX, scale.y(nextPrice)],
  ];

  if (points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) {
    return null;
  }

  return { points, nextX };
};

const createStoredTrendLine = ({ trendLinePoints, options }) => {
  if (!options.showRegressionLine || !trendLinePoints) return "";
  return `<polyline points="${trendLinePoints.points.map(([x, y]) => `${x},${y}`).join(" ")}" fill="none" stroke="${COLORS.regression}" stroke-width="${options.chartWidth > 500 ? 3 : 2}" stroke-linecap="round" stroke-linejoin="round"/>`;
};

const createCandlestickSvgChart = (result, rawCandles, optionOverrides) => {
  const options = { ...DETAIL_CHART_OPTIONS, ...optionOverrides, margin: { ...DEFAULT_MARGIN, ...(optionOverrides.margin ?? {}) } };
  const candles = rawCandles.slice(-options.renderPeriod);
  if (candles.length < 2) return `<div class="empty-chart">차트 데이터 부족</div>`;
  const emaValues = appData?.emaData?.[result.code] ?? {};
  const ichimokuDisplacement = result.screenType === "JJAP_SUBAK"
    ? Math.max(0, Number(options.ichimokuDisplacement) || 26)
    : 0;
  const ichimokuSeries = (appData?.ichimokuData?.[result.code] ?? [])
    .slice(0, options.renderPeriod + ichimokuDisplacement);
  const visibleEmaPeriods = getVisibleEmaPeriods(options);
  const visibleEmaValues = visibleEmaPeriods
    .flatMap((period) => emaValues[`ema${period}`] ?? [])
    .filter((value) => value != null);
  const ichimokuValues = result.screenType === "JJAP_SUBAK"
    ? ichimokuSeries.flatMap((item) => [item.senkouSpanA, item.senkouSpanB]).filter((value) => value != null)
    : [];
  const bollingerOptions = {
    bollingerPeriod: result.bollingerPeriod ?? 33,
    bollingerStdDevMultiplier: result.bollingerStdDevMultiplier ?? 0.1,
    bollingerShiftBars: result.bollingerShiftBars ?? 25,
  };
  const storedBollingerSignals = (appData?.bollingerData?.[result.code] ?? []).slice(-options.renderPeriod);
  const bollingerSignals = result.screenType === "JJAP_SUBAK"
    ? storedBollingerSignals.length
      ? storedBollingerSignals
      : calculateBollingerYellowArrowSignals(candles, bollingerOptions)
    : [];
  const bollingerValues = result.screenType === "JJAP_SUBAK"
    ? bollingerSignals
        .flatMap((signal) => [
          signal.shiftedUpperBand,
          signal.shiftedMiddleBand,
          signal.shiftedLowerBand,
        ])
        .filter((value) => value != null)
    : [];
  const { chartWidth, chartHeight, margin } = options;
  const plotWidth = chartWidth - margin.left - margin.right;
  const plotHeight = chartHeight - margin.top - margin.bottom;
  const rightPaddingBars = Math.max(
    Math.floor(Number(options.rightPaddingBars) || 0),
    ichimokuDisplacement,
  );
  const virtualPeriod = candles.length + rightPaddingBars;
  const xStep = plotWidth / Math.max(1, virtualPeriod - 1);
  const { minPrice, maxPrice } = calculatePriceRange(candles, [
    ...visibleEmaValues,
    ...ichimokuValues,
    ...bollingerValues,
  ]);
  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) return `<div class="empty-chart">차트 범위 계산 실패</div>`;

  const scale = {
    x: (index) => margin.left + (index / Math.max(1, virtualPeriod - 1)) * plotWidth,
    y: (price) => priceToY(price, minPrice, maxPrice, plotHeight, margin.top),
  };
  const candleSlotWidth = plotWidth / virtualPeriod;
  const candleWidth = Math.max(2, Math.min(18, candleSlotWidth * 0.8));
  const renderPoints = candles.map((candle, index) => ({
    x: scale.x(index),
    y: scale.y(trendPrice(candle)),
  }));
  const scanPoints = renderPoints.slice(-result.matchedPeriod);
  const firstScanX = scanPoints[0]?.x;
  const lastScanX = scanPoints.at(-1)?.x;
  const matchedArea =
    options.showMatchedArea && Number.isFinite(firstScanX) && Number.isFinite(lastScanX)
      ? `<rect x="${firstScanX}" y="${margin.top}" width="${Math.max(0, lastScanX - firstScanX)}" height="${plotHeight}" fill="${COLORS.matchedArea}"/>`
      : "";
  const trendLinePoints = getStoredTrendLinePoints({ result, scale, candles, xStep });
  const regressionLine = createStoredTrendLine({ trendLinePoints, options });
  const ichimokuCloud = createIchimokuCloud({
    result,
    series: ichimokuSeries,
    scale,
    options,
    renderStartIndex: Math.max(0, rawCandles.length - candles.length),
    renderCandlesLength: candles.length,
    rightPaddingBars,
  });
  const bollingerLines = createBollingerBandLines({
    result,
    signals: bollingerSignals,
    scale,
    options,
  });
  const selectedLine =
    options.showSelectedPriceLine
      ? createPolyline(renderPoints, COLORS.selectedLine, `stroke-width="2" stroke-dasharray="7 7" opacity="0.85"`)
      : "";
  const shortEmaLines = options.shortEmaPeriods
    .filter((period) => visibleEmaPeriods.includes(period))
    .map((period) => createEmaLine(emaValues[`ema${period}`], scale, period, options))
    .join("");
  const longEmaLines = options.longEmaPeriods
    .filter((period) => visibleEmaPeriods.includes(period))
    .map((period) => createEmaLine(emaValues[`ema${period}`], scale, period, options))
    .join("");
  const candleElements = candles
    .map((candle, index) => {
      const color = candle.close >= candle.open ? COLORS.bullish : COLORS.bearish;
      const x = scale.x(index);
      const openY = scale.y(candle.open);
      const closeY = scale.y(candle.close);
      const bodyY = Math.min(openY, closeY);
      const bodyHeight = Math.max(1, Math.abs(closeY - openY));
      return `
        ${options.showCandleWick ? `<line x1="${x}" y1="${scale.y(candle.high)}" x2="${x}" y2="${scale.y(candle.low)}" stroke="${color}" stroke-width="2"/>` : ""}
        <rect x="${x - candleWidth / 2}" y="${bodyY}" width="${candleWidth}" height="${bodyHeight}" fill="${color}" stroke="${color}" stroke-width="0"/>
      `;
    })
    .join("");
  const bollingerArrows = createBollingerYellowArrows({
    result,
    signals: bollingerSignals,
    candles,
    scale,
    options,
  });
  const lastCandle = candles.at(-1);
  const previousCandle = candles.at(-2);
  const ma5Price = Number.isFinite(Number(result.ma5Price))
    ? Number(result.ma5Price)
    : calculateLatestEMA(candles, 5);
  const ticks = calculateNicePriceTicks(minPrice, maxPrice, 7);
  const grid = options.showGrid ? createGridLines({ chartWidth, chartHeight, margin, plotWidth, ticks, scale }) : "";
  const axisLabels = options.showAxisLabels ? createAxisLabels({ candles, margin, chartHeight, scale }) : "";

  return `
    <svg class="stock-chart" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="${escapeHtml(result.name)} 봉차트">
      <rect width="${chartWidth}" height="${chartHeight}" fill="${COLORS.background}"/>
      ${matchedArea}
      ${grid}
      ${createMa5PriceGuide({ ma5Price, scale, chartWidth, margin, options })}
      ${createTrendNextPriceGuide({ trendNextPrice: result.trendNextPrice, trendNextX: trendLinePoints?.nextX, scale, chartWidth, margin, options })}
      ${axisLabels}
      ${options.showAxisLabels ? `<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${chartHeight - margin.bottom}" stroke="${COLORS.axis}" stroke-width="1"/>
      <line x1="${chartWidth - margin.right}" y1="${margin.top}" x2="${chartWidth - margin.right}" y2="${chartHeight - margin.bottom}" stroke="${COLORS.axis}" stroke-width="1"/>` : ""}
      ${ichimokuCloud}
      ${bollingerLines}
      ${candleElements}
      ${selectedLine}
      ${shortEmaLines}
      ${longEmaLines}
      ${regressionLine}
      ${bollingerArrows}
      ${createBuySignalMarker(result.buySignal, scale, chartWidth, margin, options.showAxisLabels)}
      ${options.showAxisLabels ? createPriceAndEma5Labels({ lastCandle, previousCandle, emaValues, scale, chartWidth, margin, plotHeight, options }) : ""}
      ${options.showAxisLabels ? `<text x="${margin.left + 4}" y="30" fill="${COLORS.text}" font-size="22">${escapeHtml(result.name)} ${escapeHtml(result.code)} | 각도 ${formatNumber(result.angleDegree)}° | R² ${formatNumber(result.rSquared, 3)} | 수익률 ${formatPercent(result.returnRate)}</text>` : ""}
      ${createRightSideEmaLabels({ emaValues, scale, chartWidth, margin, plotHeight, options })}
      ${createHoverAreas({ candles, margin, plotHeight, candleSlotWidth, scale, showTooltip: options.showTooltip })}
    </svg>
  `;
};

const filterResults = (results) => {
  const keyword = String(filters.stockName ?? "").trim().toLowerCase();
  if (!keyword) return [...results];
  return results.filter((item) => {
    const name = String(item.name ?? "").toLowerCase();
    const code = String(item.code ?? "").toLowerCase();
    return name.includes(keyword) || code.includes(keyword);
  });
};

const getSortedResults = () => {
  const sorted = filterResults(appData?.results ?? []);
  const sorters = {
    rankNo: (a, b) => (a.rankNo ?? 0) - (b.rankNo ?? 0),
    angle: (a, b) => b.angleDegree - a.angleDegree,
    returnRate: (a, b) => a.returnRate - b.returnRate,
    currentReturnRateDesc: (a, b) => (b.currentReturnRate ?? -Infinity) - (a.currentReturnRate ?? -Infinity),
    currentReturnRateAsc: (a, b) => (a.currentReturnRate ?? Infinity) - (b.currentReturnRate ?? Infinity),
    rSquared: (a, b) => b.rSquared - a.rSquared,
    matchedPeriod: (a, b) => b.matchedPeriod - a.matchedPeriod,
  };
  return sorted.sort(sorters[sortKey] ?? sorters.angle);
};

const renderSummaryPanel = () => {
  const panel = document.getElementById("summary-panel");
  const { run, summary } = appData;
  panel.innerHTML = `
    <h1>우하향 스크리너</h1>
    <p class="subtitle">정적 JSON 기반 키움 HTS 스타일 차트</p>
    <label class="run-selector">
      <span>필터링 일자 선택</span>
      <select id="run-select">
        ${screeningRuns.map((run) => `
          <option value="${run.runId}" ${run.runId === run.runId && run.runId === appData.run.runId ? "selected" : ""}>
            ${escapeHtml(run.baseDate)} / ${escapeHtml(run.screenName ?? run.screenType ?? "-")} / run #${run.runId} / ${run.matchedStockCount ?? 0}종목
          </option>
        `).join("")}
      </select>
    </label>
    <label class="search-control" for="stock-name-search">
      <span>종목 검색</span>
      <input
        id="stock-name-search"
        type="search"
        value="${escapeHtml(filters.stockName)}"
        placeholder="종목명 또는 코드 입력"
        autocomplete="off"
      />
    </label>
    <section class="summary-panel">
      ${metric("latest run", run.runId ?? "-")}
      ${metric("필터명", run.screenName ?? run.screenType ?? "-")}
      ${metric("기준일", run.baseDate ?? "-")}
      ${metric("DB 전체", `${run.totalStockCount ?? 0}종목`)}
      ${metric("제외 종목", `${run.excludedStockCount ?? 0}종목`)}
      ${metric("검색 대상", `${run.screeningTargetCount ?? run.totalStockCount ?? 0}종목`)}
      ${metric("필터링", `${summary.filteredCount ?? 0}종목`)}
      ${metric("매수 신호", `${summary.buySignalCount ?? 0}건`)}
      ${metric("ETF/ETN 제외", run.excludeEtf || run.excludeEtn ? "ON" : "OFF")}
      ${metric("거래정지 제외", run.excludeTradingHalt ? "ON" : "OFF")}
      ${metric("환기 제외", run.excludeAttention ? "ON" : "OFF")}
      ${metric("EMA 역배열 필터", run.useEmaBearishFilter ? "ON" : "OFF")}
      ${metric("종가 < EMA5 필터", run.useLastPriceBelowEma5Filter ? "ON" : "OFF")}
      ${metric("EMA5-장기선 갭 필터", run.useEma5ToNearestLongEmaGapFilter ?? run.useEma5To112GapFilter ? `ON >= ${run.minEma5ToNearestLongEmaGapRate ?? run.minEma5To112GapRate ?? 10}%` : "OFF")}
      ${metric("renderPeriod", run.renderPeriod)}
      ${metric("scan", `${run.scanMinPeriod}~${run.scanMaxPeriod}`)}
      ${metric("minAngle", `${run.minAngleDegree}°`)}
      ${metric("minReturn", `${run.minReturnRate}%`)}
      ${metric("minR²", run.minRSquared)}
    </section>
    <p class="note">생성 시각: ${escapeHtml(summary.generatedAt ?? "-")}</p>
  `;
};

const renderResultCard = (result, visibleIndex, absoluteIndex) => {
  const signal = result.buySignal;
  const signalClass = signal ? "has-signal" : "";
  const candles = unpackCandles(appData.chartData[result.code] ?? []);
  const mode = chartModes.get(result.code) ?? DEFAULT_CHART_MODE;
  const chart =
    mode === "mini"
      ? createCandlestickSvgChart(result, candles, MINI_CHART_OPTIONS)
      : mode === "detail"
        ? createCandlestickSvgChart(result, candles, DETAIL_CHART_OPTIONS)
        : `<div class="empty-chart compact">차트 보기 버튼으로 렌더링</div>`;
  const legendOptions = mode === "mini" ? MINI_CHART_OPTIONS : DETAIL_CHART_OPTIONS;
  const legend = mode === "none" ? "" : createEmaLegendHtml(result, legendOptions);
  const badges = [
    result.isLongEmaBearish && `<span class="filter-badge">장기 역배열</span>`,
    result.isLastPriceBelowEma5 && `<span class="filter-badge">EMA5 아래</span>`,
    result.isEma5FarBelowEma112 && `<span class="filter-badge">Gap 10%+</span>`,
    signal
      ? `<span class="filter-badge signal">MA5 돌파 신호</span>`
      : `<span class="filter-badge off">신호 없음</span>`,
  ].filter(Boolean).join("");

  return `
    <article class="result-card ${signalClass}" data-code="${escapeHtml(result.code)}">
      <header class="card-header">
        <div>
          <span class="rank">#${absoluteIndex + 1}</span>
          <h2>${escapeHtml(result.name)}</h2>
          <p>${escapeHtml(result.code)} · ${escapeHtml(result.market ?? "-")}</p>
          <div class="card-badges">${badges}</div>
        </div>
        <div class="price-box">
          <strong>${formatPrice(result.lastClose)}</strong>
          <span class="${result.currentReturnRate >= 0 ? "up" : "down"}">현재 ${formatPercent(result.currentReturnRate ?? result.returnRate)}</span>
        </div>
      </header>
      ${legend ? `<div class="chart-card-header">${legend}</div>` : ""}
      <div class="chart-shell" id="chart-${escapeHtml(result.code)}">${chart}</div>
      <div class="card-actions">
        <button type="button" class="detail-toggle" data-code="${escapeHtml(result.code)}" aria-expanded="false">상세 보기</button>
      </div>
      <div class="metrics detail-panel" id="detail-${escapeHtml(result.code)}">
        ${metric("구간", `${result.matchedPeriod}일`)}
        ${metric("검색 기간", `${escapeHtml(result.scanStartDate)} ~ ${escapeHtml(result.scanEndDate)}`)}
        ${metric("각도", `${formatNumber(result.angleDegree)}°`)}
        ${metric("slope", formatNumber(result.slopePixel, 4))}
        ${metric("R²", formatNumber(result.rSquared, 4))}
        ${metric("수익률", formatPercent(result.returnRate), result.returnRate <= 0 ? "down" : "up")}
        ${metric("필터링 당시", formatPrice(result.filteredLastPrice ?? result.lastPrice))}
        ${metric("현재 기준일", escapeHtml(result.currentDate ?? "-"))}
        ${metric("현재 주가", formatPrice(result.currentPrice))}
        ${metric("현재 수익률", formatPercent(result.currentReturnRate), result.currentReturnRate > 0 ? "up" : result.currentReturnRate < 0 ? "down" : "")}
        ${metric("EMA5 기준값", formatPrice(result.ma5Price))}
        ${metric("EMA5", formatPrice(result.ema5))}
        ${metric("종가/EMA5", `${formatPrice(result.lastClose)} < ${formatPrice(result.ema5)}`)}
        ${metric("EMA5 아래", result.isLastPriceBelowEma5 ? "YES" : "NO", result.isLastPriceBelowEma5 ? "signal" : "")}
        ${metric("EMA5 위 장기선", result.nearestLongEmaAboveEma5Period ? `EMA${result.nearestLongEmaAboveEma5Period}` : "없음")}
        ${metric("EMA5 위 장기선 값", formatPrice(result.nearestLongEmaAboveEma5Value))}
        ${metric("EMA5-장기선 갭", formatPercent(result.ema5ToNearestLongEmaGapRate ?? result.ema5To112GapRate))}
        ${metric("EMA5-장기선 10% 이상", result.isEma5FarBelowEma112 ? "YES" : "NO", result.isEma5FarBelowEma112 ? "signal" : "")}
        ${metric("추세 시작가", formatPrice(result.trendLineStartPrice))}
        ${metric("추세 종료가", formatPrice(result.trendLineEndPrice))}
        ${metric("다음 추세선 기준가", formatPrice(result.trendNextPrice))}
        ${result.screenType === "JJAP_SUBAK" ? metric("일목 구름 위", result.isAboveIchimokuCloud ? "YES" : "NO", result.isAboveIchimokuCloud ? "signal" : "") : ""}
        ${result.screenType === "JJAP_SUBAK" ? metric("기준 구름", `${result.ichimokuDisplacement ?? 26}봉 이동 구름`) : ""}
        ${result.screenType === "JJAP_SUBAK" ? metric("구름 상단", formatPrice(result.shiftedCloudTop ?? result.cloudTop)) : ""}
        ${result.screenType === "JJAP_SUBAK" ? metric("구름 하단", formatPrice(result.shiftedCloudBottom ?? result.cloudBottom)) : ""}
        ${result.screenType === "JJAP_SUBAK" ? metric("Senkou A", formatPrice(result.shiftedSenkouSpanA ?? result.senkouSpanA)) : ""}
        ${result.screenType === "JJAP_SUBAK" ? metric("Senkou B", formatPrice(result.shiftedSenkouSpanB ?? result.senkouSpanB)) : ""}
        ${result.screenType === "JJAP_SUBAK" ? metric("구름대 이격률", formatPercent(result.ichimokuCloudGapRate), result.ichimokuCloudGapRate > 0 ? "up" : result.ichimokuCloudGapRate < 0 ? "down" : "") : ""}
        ${result.screenType === "JJAP_SUBAK" ? metric("이격 제한", "13% 미만") : ""}
        ${metric("장기 EMA 조건", escapeHtml(result.longEmaConditionReason ?? "-"))}
        ${metric("EMA 모임", formatLongEmaConvergenceLabel(result), result.isLongEmaConverged ? "signal" : "")}
        ${metric("EMA224/448 없음", result.isMissingLongEma ? "YES" : "NO")}
        ${metric("EMA 모임률", formatPercent(result.longEmaConvergenceRate))}
        ${result.screenType === "JJAP_SUBAK" ? metric("장기 EMA 정배열", result.isBullishLongEmaAlignment ? "YES" : "NO") : ""}
        ${result.screenType === "JJAP_SUBAK" ? metric("112-224 이격률", formatPercent(result.ema112To224GapRate)) : ""}
        ${result.screenType === "JJAP_SUBAK" ? metric("224-448 이격률", formatPercent(result.ema224To448GapRate)) : ""}
        ${result.screenType === "JJAP_SUBAK" ? metric("정배열 최대 이격", formatPercent(result.maxBullishLongEmaPairGapRate)) : ""}
        ${result.screenType === "JJAP_SUBAK" ? metric("정배열 이격 과다", result.isWideBullishLongEmaGap ? "YES" : "NO", result.isWideBullishLongEmaGap ? "down" : "") : ""}
        ${result.screenType === "JJAP_SUBAK" ? metric("구름 상단 > EMA112", result.isCloudTopAboveEma112 ? "YES" : "NO", result.isCloudTopAboveEma112 ? "down" : "") : ""}
        ${result.screenType === "JJAP_SUBAK" ? metric("구름상단 EMA112 제외", result.isExcludedByCloudTopAboveEma112 ? "YES" : "NO", result.isExcludedByCloudTopAboveEma112 ? "down" : "") : ""}
        ${result.screenType === "JJAP_SUBAK" ? metric("최고 장기 EMA", result.highestLongEmaPeriod ? `EMA${result.highestLongEmaPeriod}` : "-") : ""}
        ${result.screenType === "JJAP_SUBAK" ? metric("최고 장기 EMA 값", formatPrice(result.highestLongEmaValue)) : ""}
        ${result.screenType === "JJAP_SUBAK" ? metric("최고 장기 EMA 이격률", formatPercent(result.priceToHighestLongEmaGapRate), result.priceToHighestLongEmaGapRate > 0 ? "up" : result.priceToHighestLongEmaGapRate < 0 ? "down" : "") : ""}
        ${result.screenType === "JJAP_SUBAK" ? metric("최고 장기 EMA 과열", result.isOverHighestLongEmaGap ? "YES" : "NO", result.isOverHighestLongEmaGap ? "down" : "") : ""}
        ${result.screenType === "JJAP_SUBAK" ? metric("볼린저밴드", `${result.bollingerPeriod ?? 33} / ${result.bollingerStdDevMultiplier ?? 0.1} / ${result.bollingerShiftBars ?? 25}봉 앞으로 shift`) : ""}
        ${result.screenType === "JJAP_SUBAK" ? metric("최근 노란화살표", result.hasBollingerYellowArrowWithinRecentDays ? "YES" : "NO", result.hasBollingerYellowArrowWithinRecentDays ? "signal" : "") : ""}
        ${result.screenType === "JJAP_SUBAK" ? metric("최근 화살표 개수", result.bollingerYellowArrowCount ?? "-") : ""}
        ${result.screenType === "JJAP_SUBAK" ? metric("최근 상단선", formatPrice(result.latestShiftedUpperBand)) : ""}
        ${result.screenType === "JJAP_SUBAK" ? metric("종가 > 최근 상단선", result.latestCloseAboveShiftedUpperBand ? "YES" : "NO", result.latestCloseAboveShiftedUpperBand ? "signal" : "") : ""}
        ${metric("EMA20", formatPrice(result.ema20))}
        ${metric("EMA60", formatPrice(result.ema60))}
        ${metric("EMA112", formatPrice(result.ema112))}
        ${metric("EMA224", formatPrice(result.ema224))}
        ${metric("EMA448", formatPrice(result.ema448))}
        ${metric("장기 EMA 역배열", result.isLongEmaBearish ? "YES" : "NO", result.isLongEmaBearish ? "signal" : "")}
        ${metric("매수 신호", signal ? `발생 ${escapeHtml(signal.signalTime)}` : "없음", signal ? "signal" : "")}
        ${signal ? metric("신호가", formatPrice(signal.currentPrice), "signal") : ""}
        ${signal ? metric("필터가 대비", formatPercent(signal.profitRateFromFiltered), "signal") : ""}
      </div>
    </article>
  `;
};

const renderResultPanel = () => {
  const panel = document.getElementById("result-panel");
  const sorted = getSortedResults();
  const totalCount = appData?.results?.length ?? 0;
  const pageSize = isMobileLayout ? MOBILE_PAGE_SIZE : DESKTOP_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageItems = sorted.slice(start, start + pageSize);
  panel.innerHTML = `
    <header class="toolbar">
      <div>
        <h1>필터링 결과 ${sorted.length}개 종목</h1>
        <p>검색 결과: ${sorted.length} / ${totalCount}${isMobileLayout ? " · 모바일에서는 결과를 세로 스크롤로 확인합니다." : " · PC에서는 한 화면에 하나의 상세차트만 표시합니다."}</p>
      </div>
      <div class="actions">
        <select id="sort-select">
          <option value="angle" ${sortKey === "angle" ? "selected" : ""}>각도 내림차순</option>
          <option value="rankNo" ${sortKey === "rankNo" ? "selected" : ""}>필터링 순위 순</option>
          <option value="currentReturnRateDesc" ${sortKey === "currentReturnRateDesc" ? "selected" : ""}>현재 수익률 높은 순</option>
          <option value="currentReturnRateAsc" ${sortKey === "currentReturnRateAsc" ? "selected" : ""}>현재 수익률 낮은 순</option>
          <option value="returnRate" ${sortKey === "returnRate" ? "selected" : ""}>수익률 오름차순</option>
          <option value="rSquared" ${sortKey === "rSquared" ? "selected" : ""}>R² 내림차순</option>
          <option value="matchedPeriod" ${sortKey === "matchedPeriod" ? "selected" : ""}>검색 구간 길이</option>
        </select>
        <button id="download-csv" type="button">CSV 다운로드</button>
      </div>
    </header>
    <section class="results-list">
      ${pageItems.length ? pageItems.map((result, index) => renderResultCard(result, index, start + index)).join("") : `<div class="empty-state">필터링 결과가 없습니다.</div>`}
    </section>
    <nav class="pagination">
      <button type="button" id="prev-page" ${currentPage <= 1 ? "disabled" : ""}>이전</button>
      <span>${currentPage} / ${totalPages}${!isMobileLayout && pageItems[0] ? ` · #${start + 1} ${escapeHtml(pageItems[0].name)}` : ""}</span>
      <button type="button" id="next-page" ${currentPage >= totalPages ? "disabled" : ""}>다음</button>
    </nav>
  `;
};

const downloadCsv = () => {
  const columns = [
    "code",
    "name",
    "market",
    "matchedPeriod",
    "scanStartDate",
    "scanEndDate",
    "angleDegree",
    "slopePixel",
    "rSquared",
    "returnRate",
    "firstPrice",
    "lastPrice",
    "filteredLastPrice",
    "currentDate",
    "currentPrice",
    "currentReturnRate",
    "lastClose",
    "dailyChangeRate",
    "ema5",
    "ema20",
    "ema60",
    "ema112",
    "ema224",
    "ema448",
    "isLongEmaBearish",
    "isLastPriceBelowEma5",
    "ema5To112GapRate",
    "isEma5FarBelowEma112",
    "nearestLongEmaAboveEma5Period",
    "nearestLongEmaAboveEma5Value",
    "ema5ToNearestLongEmaGapRate",
    "ema5ToNearestLongEmaGapReason",
    "regressionIntercept",
    "trendNextX",
    "trendNextY",
    "trendNextPrice",
    "buySignalStatus",
    "signalTime",
    "signalCurrentPrice",
    "ma5Price",
    "profitRateFromFiltered",
  ];
  const rows = getSortedResults().map((row) => {
    const signal = row.buySignal ?? {};
    return [
      row.code,
      row.name,
      row.market,
      row.matchedPeriod,
      row.scanStartDate,
      row.scanEndDate,
      row.angleDegree,
      row.slopePixel,
      row.rSquared,
      row.returnRate,
      row.firstPrice,
      row.lastPrice,
      row.filteredLastPrice,
      row.currentDate,
      row.currentPrice,
      row.currentReturnRate,
      row.lastClose,
      row.dailyChangeRate,
      row.ema5,
      row.ema20,
      row.ema60,
      row.ema112,
      row.ema224,
      row.ema448,
      row.isLongEmaBearish ? 1 : 0,
      row.isLastPriceBelowEma5 ? 1 : 0,
      row.ema5To112GapRate,
      row.isEma5FarBelowEma112 ? 1 : 0,
      row.nearestLongEmaAboveEma5Period,
      row.nearestLongEmaAboveEma5Value,
      row.ema5ToNearestLongEmaGapRate,
      row.ema5ToNearestLongEmaGapReason,
      row.regressionIntercept,
      row.trendNextX,
      row.trendNextY,
      row.trendNextPrice,
      signal.status ?? "",
      signal.signalTime ?? "",
      signal.currentPrice ?? "",
      row.ma5Price ?? "",
      signal.profitRateFromFiltered ?? "",
    ];
  });
  const csv = [columns.join(","), ...rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `filtered-stocks-${appData.run.baseDate ?? "latest"}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
};

const renderChartForCode = (code, mode) => {
  chartModes.set(code, mode);
  const result = appData.results.find((item) => item.code === code);
  const container = document.getElementById(`chart-${code}`);
  if (!result || !container) return;
  if (mode === "none") {
    container.innerHTML = `<div class="empty-chart compact">차트 보기 버튼으로 렌더링</div>`;
    return;
  }
  const candles = unpackCandles(appData.chartData[code] ?? []);
  container.innerHTML = createCandlestickSvgChart(
    result,
    candles,
    mode === "detail" ? DETAIL_CHART_OPTIONS : MINI_CHART_OPTIONS,
  );
};

const attachEvents = () => {
  const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
  mediaQuery.addEventListener("change", (event) => {
    isMobileLayout = event.matches;
    currentPage = 1;
    renderResultPanel();
  });

  document.addEventListener("change", (event) => {
    if (event.target?.id === "sort-select") {
      sortKey = event.target.value;
      currentPage = 1;
      renderResultPanel();
    }
    if (event.target?.id === "run-select") {
      loadRunData(event.target.value).catch((error) => {
        document.getElementById("result-panel").innerHTML = `<div class="empty-state">run 데이터 로드 실패: ${escapeHtml(error.message)}</div>`;
      });
    }
  });
  document.addEventListener("input", (event) => {
    if (event.target?.id === "stock-name-search") {
      filters.stockName = event.target.value;
      currentPage = 1;
      renderResultPanel();
      const input = document.getElementById("stock-name-search");
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    }
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.id === "download-csv") downloadCsv();
    if (button.id === "prev-page") {
      currentPage = Math.max(1, currentPage - 1);
      renderResultPanel();
    }
    if (button.id === "next-page") {
      currentPage += 1;
      renderResultPanel();
    }
    if (button.classList.contains("detail-toggle")) {
      const code = button.dataset.code;
      const panel = document.getElementById(`detail-${code}`);
      const isOpen = panel?.classList.toggle("open");
      button.textContent = isOpen ? "상세 숨기기" : "상세 보기";
      button.setAttribute("aria-expanded", isOpen ? "true" : "false");
      return;
    }
    const action = button.dataset.action;
    const code = button.dataset.code;
    if (action && code) {
      renderChartForCode(code, action === "collapse" ? "none" : action);
    }
  });

  const tooltip = document.getElementById("chart-tooltip");
  document.addEventListener("mousemove", (event) => {
    const target = event.target.closest(".candle-hover-area");
    if (!target) {
      tooltip.style.display = "none";
      return;
    }
    const prevClose = Number(target.dataset.prevClose);
    const openRate = Number(target.dataset.openChangeRate);
    const highRate = Number(target.dataset.highChangeRate);
    const lowRate = Number(target.dataset.lowChangeRate);
    const closeRate = Number(target.dataset.closeChangeRate);
    tooltip.innerHTML = `
      <strong>${escapeHtml(target.dataset.date)}</strong>
      ${createTooltipPriceLine("시가", target.dataset.open, Number.isFinite(openRate) ? openRate : null)}
      ${createTooltipPriceLine("고가", target.dataset.high, Number.isFinite(highRate) ? highRate : null)}
      ${createTooltipPriceLine("저가", target.dataset.low, Number.isFinite(lowRate) ? lowRate : null)}
      ${createTooltipPriceLine("종가", target.dataset.close, Number.isFinite(closeRate) ? closeRate : null)}
      <span class="tooltip-base">기준: 전일 종가 ${Number.isFinite(prevClose) ? formatPrice(prevClose) : "N/A"}</span>
    `;
    tooltip.style.left = `${event.clientX + 12}px`;
    tooltip.style.top = `${event.clientY + 12}px`;
    tooltip.style.display = "grid";
  });
};

const fetchJson = async (url) => {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`failed to load ${url}: ${response.status}`);
  return response.json();
};

const loadRunData = async (runId) => {
  const version = document.documentElement.dataset.assetVersion;
  const dataUrl = `./assets/runs/run-${encodeURIComponent(runId)}.json${version ? `?v=${encodeURIComponent(version)}` : ""}`;
  appData = await fetchJson(dataUrl);
  currentPage = 1;
  chartModes.clear();
  renderSummaryPanel();
  renderResultPanel();
};

const boot = async () => {
  try {
    const version = document.documentElement.dataset.assetVersion;
    const runsUrl = `./assets/screening-runs.json${version ? `?v=${encodeURIComponent(version)}` : ""}`;
    const runsData = await fetchJson(runsUrl);
    screeningRuns = runsData.screeningRuns ?? [];
    if (runsData.selectedRunId) {
      await loadRunData(runsData.selectedRunId);
    } else {
      appData = { run: { runId: "-", baseDate: "-" }, summary: { filteredCount: 0, buySignalCount: 0 }, results: [], chartData: {}, emaData: {} };
      renderSummaryPanel();
      renderResultPanel();
    }
    attachEvents();
  } catch (error) {
    document.body.innerHTML = `<main class="content"><div class="empty-state">데이터 로드 실패: ${escapeHtml(error.message)}</div></main>`;
  }
};

boot();
