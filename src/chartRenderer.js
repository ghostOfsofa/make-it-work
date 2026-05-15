const COLORS = {
  background: "#0b1220",
  grid: "#243044",
  text: "#cbd5e1",
  muted: "#94a3b8",
  bullish: "#ef4444",
  bearish: "#3b82f6",
  regression: "#f87171",
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
  chartWidth: 480,
  chartHeight: 270,
  renderPeriod: 40,
  margin: { top: 18, right: 28, bottom: 20, left: 12 },
  showGrid: false,
  showAxisLabels: false,
  showTooltip: false,
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
  showSelectedPriceLine: true,
  showMatchedArea: true,
  showCandleWick: true,
};

const DETAIL_CHART_OPTIONS = {
  chartWidth: 1600,
  chartHeight: 900,
  renderPeriod: 80,
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
  showSelectedPriceLine: true,
  showMatchedArea: true,
  showCandleWick: true,
};

let appData = null;
let sortKey = "angle";
let currentPage = 1;
let isMobileLayout = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
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

const formatDateLabel = (date) => {
  const parts = String(date ?? "").split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : String(date ?? "");
};

const metric = (label, value, className = "") =>
  `<span class="metric ${className}"><b>${escapeHtml(label)}</b>${value}</span>`;

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

const linearRegression = (points) => {
  if (points.length < 2) return { slope: Number.NaN, intercept: Number.NaN };
  const n = points.length;
  const sumX = points.reduce((sum, point) => sum + point.x, 0);
  const sumY = points.reduce((sum, point) => sum + point.y, 0);
  const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0);
  const sumXX = points.reduce((sum, point) => sum + point.x * point.x, 0);
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return { slope: Number.NaN, intercept: Number.NaN };
  const slope = (n * sumXY - sumX * sumY) / denominator;
  return { slope, intercept: (sumY - slope * sumX) / n };
};

const createPolyline = (points, stroke, attrs = "") => {
  const valid = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (valid.length < 2) return "";
  return `<polyline points="${valid.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}" fill="none" stroke="${stroke}" ${attrs}/>`;
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
          const changeRate = prevClose > 0 ? ((candle.close - prevClose) / prevClose) * 100 : "";
          return `<rect class="candle-hover-area" x="${scale.x(index) - candleSlotWidth / 2}" y="${margin.top}" width="${candleSlotWidth}" height="${plotHeight}" fill="transparent"
        data-date="${escapeHtml(candle.date)}" data-open="${candle.open}" data-high="${candle.high}" data-low="${candle.low}" data-close="${candle.close}" data-change-rate="${changeRate}"/>`;
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

const createCandlestickSvgChart = (result, rawCandles, optionOverrides) => {
  const options = { ...DETAIL_CHART_OPTIONS, ...optionOverrides, margin: { ...DEFAULT_MARGIN, ...(optionOverrides.margin ?? {}) } };
  const candles = rawCandles.slice(-options.renderPeriod);
  if (candles.length < 2) return `<div class="empty-chart">차트 데이터 부족</div>`;
  const emaValues = appData?.emaData?.[result.code] ?? {};
  const visibleEmaPeriods = getVisibleEmaPeriods(options);
  const visibleEmaValues = visibleEmaPeriods
    .flatMap((period) => emaValues[`ema${period}`] ?? [])
    .filter((value) => value != null);

  const { chartWidth, chartHeight, margin } = options;
  const plotWidth = chartWidth - margin.left - margin.right;
  const plotHeight = chartHeight - margin.top - margin.bottom;
  const { minPrice, maxPrice } = calculatePriceRange(candles, visibleEmaValues);
  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) return `<div class="empty-chart">차트 범위 계산 실패</div>`;

  const scale = {
    x: (index) => margin.left + (index / Math.max(1, candles.length - 1)) * plotWidth,
    y: (price) => priceToY(price, minPrice, maxPrice, plotHeight, margin.top),
  };
  const candleSlotWidth = plotWidth / candles.length;
  const candleWidth = Math.max(2, Math.min(18, candleSlotWidth * 0.8));
  const renderPoints = candles.map((candle, index) => ({
    x: scale.x(index),
    y: scale.y(trendPrice(candle)),
  }));
  const scanPoints = renderPoints.slice(-result.matchedPeriod);
  const regression = linearRegression(scanPoints);
  const firstScanX = scanPoints[0]?.x;
  const lastScanX = scanPoints.at(-1)?.x;
  const matchedArea =
    options.showMatchedArea && Number.isFinite(firstScanX)
      ? `<rect x="${firstScanX}" y="${margin.top}" width="${chartWidth - margin.right - firstScanX}" height="${plotHeight}" fill="${COLORS.matchedArea}"/>`
      : "";
  const regressionLine =
    options.showRegressionLine && Number.isFinite(regression.slope)
      ? `<line x1="${firstScanX}" y1="${regression.slope * firstScanX + regression.intercept}" x2="${lastScanX}" y2="${regression.slope * lastScanX + regression.intercept}" stroke="${COLORS.regression}" stroke-width="${options.chartWidth > 500 ? 3 : 2}"/>`
      : "";
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
  const lastCandle = candles.at(-1);
  const previousCandle = candles.at(-2);
  const ticks = calculateNicePriceTicks(minPrice, maxPrice, 7);
  const grid = options.showGrid ? createGridLines({ chartWidth, chartHeight, margin, plotWidth, ticks, scale }) : "";
  const axisLabels = options.showAxisLabels ? createAxisLabels({ candles, margin, chartHeight, scale }) : "";

  return `
    <svg class="stock-chart" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="${escapeHtml(result.name)} 봉차트">
      <rect width="${chartWidth}" height="${chartHeight}" fill="${COLORS.background}"/>
      ${matchedArea}
      ${grid}
      ${axisLabels}
      ${options.showAxisLabels ? `<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${chartHeight - margin.bottom}" stroke="${COLORS.axis}" stroke-width="1"/>
      <line x1="${chartWidth - margin.right}" y1="${margin.top}" x2="${chartWidth - margin.right}" y2="${chartHeight - margin.bottom}" stroke="${COLORS.axis}" stroke-width="1"/>` : ""}
      ${candleElements}
      ${selectedLine}
      ${shortEmaLines}
      ${longEmaLines}
      ${regressionLine}
      ${createBuySignalMarker(result.buySignal, scale, chartWidth, margin, options.showAxisLabels)}
      ${options.showAxisLabels ? createPriceAndEma5Labels({ lastCandle, previousCandle, emaValues, scale, chartWidth, margin, plotHeight, options }) : ""}
      ${options.showAxisLabels ? `<text x="${margin.left + 4}" y="30" fill="${COLORS.text}" font-size="22">${escapeHtml(result.name)} ${escapeHtml(result.code)} | 각도 ${formatNumber(result.angleDegree)}° | R² ${formatNumber(result.rSquared, 3)} | 수익률 ${formatPercent(result.returnRate)}</text>` : ""}
      ${createRightSideEmaLabels({ emaValues, scale, chartWidth, margin, plotHeight, options })}
      ${createHoverAreas({ candles, margin, plotHeight, candleSlotWidth, scale, showTooltip: options.showTooltip })}
    </svg>
  `;
};

const getSortedResults = () => {
  const sorted = [...(appData?.results ?? [])];
  const sorters = {
    angle: (a, b) => b.angleDegree - a.angleDegree,
    returnRate: (a, b) => a.returnRate - b.returnRate,
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
    <section class="summary-panel">
      ${metric("latest run", run.runId ?? "-")}
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
  const ema5BelowBadge = result.isLastPriceBelowEma5
    ? `<span class="filter-badge">EMA5 아래</span>`
    : "";

  return `
    <article class="result-card ${signalClass}" data-code="${escapeHtml(result.code)}">
      <header class="card-header">
        <div>
          <span class="rank">#${absoluteIndex + 1}</span>
          <h2>${escapeHtml(result.name)}</h2>
          <p>${escapeHtml(result.code)} · ${escapeHtml(result.market ?? "-")} ${ema5BelowBadge}</p>
        </div>
        <div class="price-box">
          <strong>${formatPrice(result.lastClose)}</strong>
          <span class="${result.dailyChangeRate >= 0 ? "up" : "down"}">${formatPercent(result.dailyChangeRate)}</span>
        </div>
      </header>
      ${legend ? `<div class="chart-card-header">${legend}</div>` : ""}
      <div class="chart-controls">
        <button type="button" data-action="mini" data-code="${escapeHtml(result.code)}">미니 차트 보기</button>
        <button type="button" data-action="detail" data-code="${escapeHtml(result.code)}">상세 차트 보기</button>
        <button type="button" data-action="collapse" data-code="${escapeHtml(result.code)}">차트 접기</button>
      </div>
      <div class="chart-shell" id="chart-${escapeHtml(result.code)}">${chart}</div>
      <div class="metrics">
        ${metric("구간", `${result.matchedPeriod}일`)}
        ${metric("검색 기간", `${escapeHtml(result.scanStartDate)} ~ ${escapeHtml(result.scanEndDate)}`)}
        ${metric("각도", `${formatNumber(result.angleDegree)}°`)}
        ${metric("slope", formatNumber(result.slopePixel, 4))}
        ${metric("R²", formatNumber(result.rSquared, 4))}
        ${metric("수익률", formatPercent(result.returnRate), result.returnRate <= 0 ? "down" : "up")}
        ${metric("MA5", formatPrice(result.ma5Price))}
        ${metric("EMA5", formatPrice(result.ema5))}
        ${metric("종가/EMA5", `${formatPrice(result.lastClose)} < ${formatPrice(result.ema5)}`)}
        ${metric("EMA5 아래", result.isLastPriceBelowEma5 ? "YES" : "NO", result.isLastPriceBelowEma5 ? "signal" : "")}
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
  const pageSize = isMobileLayout ? MOBILE_PAGE_SIZE : DESKTOP_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageItems = sorted.slice(start, start + pageSize);
  panel.innerHTML = `
    <header class="toolbar">
      <div>
        <h1>필터링 결과 ${sorted.length}개 종목</h1>
        <p>${isMobileLayout ? "모바일에서는 결과를 세로 스크롤로 확인합니다." : "PC에서는 한 화면에 하나의 상세차트만 표시합니다."}</p>
      </div>
      <div class="actions">
        <select id="sort-select">
          <option value="angle" ${sortKey === "angle" ? "selected" : ""}>각도 내림차순</option>
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
    const rate = Number(target.dataset.changeRate);
    const rateClass = !Number.isFinite(rate) || rate === 0 ? "flat" : rate > 0 ? "up" : "down";
    tooltip.innerHTML = `
      <strong>${escapeHtml(target.dataset.date)}</strong>
      <span>시가: ${formatPrice(target.dataset.open)}</span>
      <span>고가: ${formatPrice(target.dataset.high)}</span>
      <span>저가: ${formatPrice(target.dataset.low)}</span>
      <span>종가: ${formatPrice(target.dataset.close)}</span>
      <span>전일 종가 대비: <em class="${rateClass}">${Number.isFinite(rate) ? formatPercent(rate) : "N/A"}</em></span>
    `;
    tooltip.style.left = `${event.clientX + 12}px`;
    tooltip.style.top = `${event.clientY + 12}px`;
    tooltip.style.display = "grid";
  });
};

const loadScreeningData = async () => {
  const version = document.documentElement.dataset.assetVersion;
  const dataUrl = `./assets/screening-data.json${version ? `?v=${encodeURIComponent(version)}` : ""}`;
  const response = await fetch(dataUrl, { cache: "no-cache" });
  if (!response.ok) throw new Error(`failed to load screening-data.json: ${response.status}`);
  return response.json();
};

const boot = async () => {
  try {
    appData = await loadScreeningData();
    renderSummaryPanel();
    renderResultPanel();
    attachEvents();
  } catch (error) {
    document.body.innerHTML = `<main class="content"><div class="empty-state">데이터 로드 실패: ${escapeHtml(error.message)}</div></main>`;
  }
};

boot();
