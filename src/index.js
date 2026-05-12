import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  DEFAULT_OPTIONS,
  calculateAngleDegree,
  calculateLinearRegressionByPoints,
  calculateRSquaredByPoints,
  calculateReturnRate,
  filterStrongDowntrendStocks,
  generateSampleStocks,
} from "../strong-downtrend-filter.mjs";

const DEFAULT_CHART_FILE_PATH = "chart.html";
const DEFAULT_DIST_CHART_FILE_PATH = "dist/chart.html";
const DEFAULT_CHART_TYPE = "candlestick";
const DEFAULT_MARGIN = Object.freeze({
  top: 40,
  right: 90,
  bottom: 60,
  left: 30,
});
const COLORS = Object.freeze({
  background: "#0b1220",
  grid: "#243044",
  text: "#cbd5e1",
  mutedText: "#94a3b8",
  bullish: "#ef4444",
  bearish: "#3b82f6",
  regression: "#facc15",
  selectedLine: "#a3e635",
  axis: "#475569",
  panel: "#111827",
});

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatNumber = (value, digits = 2) =>
  Number.isFinite(value) ? round(value, digits).toLocaleString("ko-KR") : "-";

export const formatPrice = (value) =>
  Number.isFinite(value) ? Math.round(value).toLocaleString("ko-KR") : "-";

const formatChangeRateValue = (value) =>
  Number.isFinite(value) ? round(value, 2).toFixed(2) : "";

export const formatDateLabel = (date) => {
  const parts = String(date ?? "").split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : String(date ?? "");
};

const toPolylinePoints = (points) =>
  points.map((point) => `${point.xPixel},${point.yPixel}`).join(" ");

const getRegressionLine = ({ slopePixel, intercept, chartWidth }) => ({
  x1: 0,
  y1: intercept,
  x2: chartWidth,
  y2: slopePixel * chartWidth + intercept,
});

const isValidCandle = (candle) =>
  candle != null &&
  Number.isFinite(candle.open) &&
  Number.isFinite(candle.close) &&
  candle.open > 0 &&
  candle.close > 0;

const getSelectedPrice = (candle) =>
  candle.close >= candle.open ? candle.close : candle.open;

const getCandleHigh = (candle) =>
  Number.isFinite(candle.high) && candle.high > 0
    ? Math.max(candle.high, candle.open, candle.close)
    : Math.max(candle.open, candle.close);

const getCandleLow = (candle) =>
  Number.isFinite(candle.low) && candle.low > 0
    ? Math.min(candle.low, candle.open, candle.close)
    : Math.min(candle.open, candle.close);

const getRecentValidCandles = (prices, period) => {
  if (!Array.isArray(prices) || !Number.isInteger(period) || period < 2) {
    return [];
  }

  const validCandles = [...prices]
    .filter(isValidCandle)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return validCandles.length < period ? [] : validCandles.slice(-period);
};

const getValidCandlesSortedByDate = (prices) => {
  if (!Array.isArray(prices)) {
    return [];
  }

  return [...prices]
    .filter(isValidCandle)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
};

export const priceToY = (price, minPrice, maxPrice, chartHeight) => {
  if (
    !Number.isFinite(price) ||
    !Number.isFinite(minPrice) ||
    !Number.isFinite(maxPrice) ||
    !Number.isFinite(chartHeight) ||
    maxPrice === minPrice
  ) {
    return Number.NaN;
  }

  return chartHeight - ((price - minPrice) / (maxPrice - minPrice)) * chartHeight;
};

const priceToPlotY = (price, minPrice, maxPrice, plotTop, plotHeight) =>
  plotTop + priceToY(price, minPrice, maxPrice, plotHeight);

const createChartPointsByScale = ({
  selectedPrices,
  minPrice,
  maxPrice,
  plotLeft,
  plotTop,
  plotWidth,
  plotHeight,
  startIndex = 0,
  totalCount = selectedPrices.length,
}) => {
  if (!Array.isArray(selectedPrices) || selectedPrices.length < 2) {
    return [];
  }

  return selectedPrices.map((selectedPrice, index) => ({
    xPixel: plotLeft + ((startIndex + index) / (totalCount - 1 || 1)) * plotWidth,
    yPixel: priceToPlotY(selectedPrice, minPrice, maxPrice, plotTop, plotHeight),
    selectedPrice,
    index: startIndex + index,
  }));
};

const enrichResultForChart = (result, stocks, options) => {
  const margin = { ...DEFAULT_MARGIN, ...options.margin };
  const plotLeft = margin.left;
  const plotTop = margin.top;
  const plotWidth = options.chartWidth - margin.left - margin.right;
  const plotHeight = options.chartHeight - margin.top - margin.bottom;
  const stock = stocks.find((item) => item.code === result.code);
  const allCandles = getValidCandlesSortedByDate(stock?.prices);
  const renderPeriod = options.renderPeriod ?? options.period;
  const candles = allCandles.slice(-renderPeriod);
  const selectedPrices = candles.map(getSelectedPrice);
  const minRawPrice = Math.min(...candles.map(getCandleLow));
  const maxRawPrice = Math.max(...candles.map(getCandleHigh));
  const pricePadding = (maxRawPrice - minRawPrice) * 0.05 || maxRawPrice * 0.05;
  const minPrice = Math.max(minRawPrice - pricePadding, 1);
  const maxPrice = maxRawPrice + pricePadding;
  const points = createChartPointsByScale({
    selectedPrices,
    minPrice,
    maxPrice,
    plotLeft,
    plotTop,
    plotWidth,
    plotHeight,
  });
  const matchedPeriod = result.matchedPeriod ?? candles.length;
  const scanCandles = candles.slice(-matchedPeriod);
  const scanSelectedPrices = scanCandles.map(getSelectedPrice);
  const scanStartIndex = candles.length - scanCandles.length;
  const regressionPoints = createChartPointsByScale({
    selectedPrices: scanSelectedPrices,
    minPrice,
    maxPrice,
    plotLeft,
    plotTop,
    plotWidth,
    plotHeight,
    startIndex: scanStartIndex,
    totalCount: candles.length,
  });
  const { slopePixel, intercept } =
    calculateLinearRegressionByPoints(regressionPoints);
  const rSquared = calculateRSquaredByPoints(regressionPoints, slopePixel, intercept);
  const angleDegree = calculateAngleDegree(slopePixel);
  const returnRate = calculateReturnRate(scanSelectedPrices);

  return {
    ...result,
    type: stock?.type,
    allCandles,
    candles,
    selectedPrices,
    points,
    regressionPoints,
    minPrice,
    maxPrice,
    plotLeft,
    plotTop,
    plotWidth,
    plotHeight,
    margin,
    slopePixel,
    intercept,
    angleDegree,
    rSquared,
    returnRate,
    firstPrice: scanSelectedPrices[0],
    lastPrice: scanSelectedPrices.at(-1),
  };
};

export const calculateNicePriceTicks = (minPrice, maxPrice, tickCount = 6) => {
  if (
    !Number.isFinite(minPrice) ||
    !Number.isFinite(maxPrice) ||
    maxPrice <= minPrice ||
    tickCount < 2
  ) {
    return [];
  }

  const range = maxPrice - minPrice;
  const roughStep = range / (tickCount - 1);
  const basePower = 10 ** Math.floor(Math.log10(roughStep));
  const multipliers = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10];
  const candidates = multipliers.map((multiplier) => {
    const step = multiplier * basePower;
    const start = Math.ceil(minPrice / step) * step;
    const ticks = [];

    for (let value = start; value <= maxPrice + step * 0.5; value += step) {
      if (value >= minPrice && value <= maxPrice) {
        ticks.push(value);
      }
    }

    return { step, ticks };
  });
  const preferred = candidates
    .filter((candidate) => candidate.ticks.length >= 5 && candidate.ticks.length <= 8)
    .sort((a, b) => Math.abs(a.ticks.length - tickCount) - Math.abs(b.ticks.length - tickCount))[0];

  if (preferred) {
    return preferred.ticks;
  }

  return Array.from({ length: tickCount }, (_, index) =>
    minPrice + (range * index) / (tickCount - 1),
  );
};

const getDateLabelIndexes = (candles, labelCount = 5) => {
  if (!Array.isArray(candles) || candles.length === 0) {
    return [];
  }

  const count = Math.min(labelCount, candles.length);
  const indexes = new Set();

  for (let index = 0; index < count; index += 1) {
    indexes.add(Math.round((index / (count - 1 || 1)) * (candles.length - 1)));
  }

  return [...indexes].sort((a, b) => a - b);
};

export const createGridLines = ({
  priceTicks,
  dateLabelIndexes,
  candles,
  minPrice,
  maxPrice,
  plotLeft,
  plotTop,
  plotWidth,
  plotHeight,
}) => {
  const horizontalLines = priceTicks
    .map((price) => {
      const y = priceToPlotY(price, minPrice, maxPrice, plotTop, plotHeight);
      return `<line class="grid-line" x1="${plotLeft}" y1="${y}" x2="${plotLeft + plotWidth}" y2="${y}" />`;
    })
    .join("");
  const verticalLines = dateLabelIndexes
    .map((index) => {
      const x = plotLeft + (index / (candles.length - 1 || 1)) * plotWidth;
      return `<line class="grid-line" x1="${x}" y1="${plotTop}" x2="${x}" y2="${plotTop + plotHeight}" />`;
    })
    .join("");

  return `${horizontalLines}${verticalLines}`;
};

export const createAxisLabels = ({
  priceTicks,
  dateLabelIndexes,
  candles,
  minPrice,
  maxPrice,
  plotLeft,
  plotTop,
  plotWidth,
  plotHeight,
}) => {
  const priceLabels = priceTicks
    .map((price) => {
      const y = priceToPlotY(price, minPrice, maxPrice, plotTop, plotHeight);
      return `<text class="axis-label price-label" x="${plotLeft + plotWidth + 12}" y="${y + 5}">${formatPrice(price)}</text>`;
    })
    .join("");
  const dateLabels = dateLabelIndexes
    .map((index) => {
      const x = plotLeft + (index / (candles.length - 1 || 1)) * plotWidth;
      return `<text class="axis-label date-label" x="${x}" y="${plotTop + plotHeight + 34}">${formatDateLabel(candles[index]?.date)}</text>`;
    })
    .join("");

  return `${priceLabels}${dateLabels}`;
};

export const createCandleElements = (candles, options = {}) => {
  const {
    minPrice,
    maxPrice,
    plotLeft,
    plotTop,
    plotWidth,
    plotHeight,
  } = { ...DEFAULT_OPTIONS, ...options };
  const candleCount = candles.length;
  const candleWidth = Math.max(3, Math.min(18, (plotWidth / candleCount) * 0.55));
  const candleSlotWidth = plotWidth / candleCount;

  return candles
    .map((candle, index) => {
      const prevClose = candles[index - 1]?.close;
      const changeRate =
        Number.isFinite(prevClose) && prevClose > 0
          ? ((candle.close - prevClose) / prevClose) * 100
          : Number.NaN;
      const xCenter = plotLeft + (index / (candleCount - 1 || 1)) * plotWidth;
      const highY = priceToPlotY(
        getCandleHigh(candle),
        minPrice,
        maxPrice,
        plotTop,
        plotHeight,
      );
      const lowY = priceToPlotY(
        getCandleLow(candle),
        minPrice,
        maxPrice,
        plotTop,
        plotHeight,
      );
      const openY = priceToPlotY(candle.open, minPrice, maxPrice, plotTop, plotHeight);
      const closeY = priceToPlotY(candle.close, minPrice, maxPrice, plotTop, plotHeight);
      const bodyY = Math.min(openY, closeY);
      const rawBodyHeight = Math.abs(closeY - openY);
      const bodyHeight = Math.max(rawBodyHeight, 1);
      const adjustedBodyY = rawBodyHeight < 1 ? bodyY - 0.5 : bodyY;
      const isBullish = candle.close >= candle.open;
      const candleClass = isBullish ? "bullish" : "bearish";

      return `
        <line
          class="candle-wick ${candleClass}"
          x1="${xCenter}"
          y1="${highY}"
          x2="${xCenter}"
          y2="${lowY}"
        />
        <rect
          class="candle-body ${candleClass}"
          x="${xCenter - candleWidth / 2}"
          y="${adjustedBodyY}"
          width="${candleWidth}"
          height="${bodyHeight}"
        />
        <rect
          class="candle-hover-area"
          x="${xCenter - candleSlotWidth / 2}"
          y="${plotTop}"
          width="${candleSlotWidth}"
          height="${plotHeight}"
          fill="transparent"
          data-date="${escapeHtml(candle.date)}"
          data-open="${candle.open}"
          data-high="${getCandleHigh(candle)}"
          data-low="${getCandleLow(candle)}"
          data-close="${candle.close}"
          data-change-rate="${formatChangeRateValue(changeRate)}"
        />
      `;
    })
    .join("");
};

/**
 * Creates one SVG chart card for a filtered stock result.
 *
 * The SVG viewBox is exactly chartWidth x chartHeight, so plotted points use
 * the same xPixel/yPixel coordinates used by the regression calculation.
 */
export const createKiwoomStyleCandlestickChart = (stockResult, options = {}) => {
  const config = {
    ...DEFAULT_OPTIONS,
    margin: DEFAULT_MARGIN,
    showSelectedPriceLine: true,
    ...options,
  };
  const { chartWidth, chartHeight, minAngleDegree } = config;
  const {
    candles,
    plotLeft,
    plotTop,
    plotWidth,
    plotHeight,
    minPrice,
    maxPrice,
  } = stockResult;
  const priceLinePoints = toPolylinePoints(stockResult.points);
  const regressionStartPoint = stockResult.regressionPoints[0];
  const regressionEndPoint = stockResult.regressionPoints.at(-1);
  const regressionLine = getRegressionLine({
    slopePixel: stockResult.slopePixel,
    intercept: stockResult.intercept,
    chartWidth: regressionEndPoint?.xPixel ?? plotLeft + plotWidth,
  });
  regressionLine.x1 = regressionStartPoint?.xPixel ?? plotLeft;
  regressionLine.y1 =
    stockResult.slopePixel * regressionLine.x1 + stockResult.intercept;
  const thresholdSlope = Math.tan((minAngleDegree * Math.PI) / 180);
  const guideX = plotLeft + 28;
  const guideY = plotTop + plotHeight - 44;
  const guideLength = 120;
  const guideEndY = guideY + Math.min(thresholdSlope * guideLength, 95);
  const lastCandle = candles.at(-1);
  const lastClose = lastCandle?.close;
  const lastCloseY = priceToPlotY(lastClose, minPrice, maxPrice, plotTop, plotHeight);
  const priceTicks = calculateNicePriceTicks(minPrice, maxPrice, 7);
  const dateLabelIndexes = getDateLabelIndexes(candles, 5);
  const gridLines = createGridLines({
    priceTicks,
    dateLabelIndexes,
    candles,
    minPrice,
    maxPrice,
    plotLeft,
    plotTop,
    plotWidth,
    plotHeight,
  });
  const axisLabels = createAxisLabels({
    priceTicks,
    dateLabelIndexes,
    candles,
    minPrice,
    maxPrice,
    plotLeft,
    plotTop,
    plotWidth,
    plotHeight,
  });
  const candleElements = createCandleElements(stockResult.candles, {
    ...config,
    minPrice: stockResult.minPrice,
    maxPrice: stockResult.maxPrice,
    plotLeft,
    plotTop,
    plotWidth,
    plotHeight,
  });

  return `
    <article class="chart-card">
      <svg
        class="chart"
        viewBox="0 0 ${chartWidth} ${chartHeight}"
        role="img"
        aria-label="${escapeHtml(stockResult.code)} ${escapeHtml(stockResult.name)} Kiwoom style candlestick chart"
      >
        <rect x="0" y="0" width="${chartWidth}" height="${chartHeight}" class="chart-bg" />
        <rect x="${plotLeft}" y="${plotTop}" width="${plotWidth}" height="${plotHeight}" class="plot-bg" />
        <g class="grid">${gridLines}</g>
        <line class="axis-line" x1="${plotLeft + plotWidth}" y1="${plotTop}" x2="${plotLeft + plotWidth}" y2="${plotTop + plotHeight}" />
        <line class="axis-line" x1="${plotLeft}" y1="${plotTop + plotHeight}" x2="${plotLeft + plotWidth}" y2="${plotTop + plotHeight}" />
        <g class="axis-labels">${axisLabels}</g>

        <g class="chart-title">
          <text x="${plotLeft}" y="24">${escapeHtml(stockResult.name)} (${escapeHtml(stockResult.code)})</text>
          <text x="${plotLeft + 360}" y="24">angle ${formatNumber(stockResult.angleDegree)} deg</text>
          <text x="${plotLeft + 580}" y="24">slope ${formatNumber(stockResult.slopePixel, 4)}</text>
          <text x="${plotLeft + 780}" y="24">R2 ${formatNumber(stockResult.rSquared, 4)}</text>
          <text x="${plotLeft + 940}" y="24">return ${formatNumber(stockResult.returnRate)}%</text>
        </g>

        <g class="candles">
          ${candleElements}
        </g>
        ${
          config.showSelectedPriceLine
            ? `<polyline class="selected-price-line" points="${priceLinePoints}" />`
            : ""
        }
        <line
          class="regression-line"
          x1="${regressionLine.x1}"
          y1="${regressionLine.y1}"
          x2="${regressionLine.x2}"
          y2="${regressionLine.y2}"
        />

        <g class="angle-guide">
          <line x1="${guideX}" y1="${guideY}" x2="${guideX + guideLength}" y2="${guideY}" />
          <line x1="${guideX}" y1="${guideY}" x2="${guideX + guideLength}" y2="${guideEndY}" />
          <text x="${guideX}" y="${guideY - 12}">min ${formatNumber(minAngleDegree)} deg</text>
        </g>

        <line class="last-price-line" x1="${plotLeft}" y1="${lastCloseY}" x2="${plotLeft + plotWidth}" y2="${lastCloseY}" />
        <rect class="last-price-box" x="${plotLeft + plotWidth + 6}" y="${lastCloseY - 17}" width="78" height="34" rx="3" />
        <text class="last-price-text" x="${plotLeft + plotWidth + 45}" y="${lastCloseY + 6}">${formatPrice(lastClose)}</text>
      </svg>
    </article>
  `;
};

export const createCandlestickSvgChart = createKiwoomStyleCandlestickChart;

export const createSvgChart = (stockResult, options = {}) => {
  const config = {
    ...DEFAULT_OPTIONS,
    chartType: DEFAULT_CHART_TYPE,
    ...options,
  };

  return config.chartType === "candlestick"
    ? createKiwoomStyleCandlestickChart(stockResult, config)
    : createKiwoomStyleCandlestickChart(stockResult, config);
};

/**
 * Generates a complete static HTML document with SVG charts.
 */
export const generateChartHtml = (results, options = {}) => {
  const config = {
    ...DEFAULT_OPTIONS,
    chartType: DEFAULT_CHART_TYPE,
    ...options,
  };
  const cards = results.map((result) => createSvgChart(result, config)).join("");
  const interactivePayload = {
    options: {
      chartWidth: config.chartWidth,
      chartHeight: config.chartHeight,
      margin: { ...DEFAULT_MARGIN, ...config.margin },
      renderPeriod: config.renderPeriod ?? config.period,
      minRenderPeriod: config.minRenderPeriod ?? 30,
      maxRenderPeriod: config.maxRenderPeriod ?? 200,
      showSelectedPriceLine: config.showSelectedPriceLine !== false,
    },
    charts: results.map((result) => ({
      code: result.code,
      name: result.name,
      type: result.type,
      matchedPeriod: result.matchedPeriod,
      scanStartDate: result.scanStartDate,
      scanEndDate: result.scanEndDate,
      allCandles: result.allCandles,
    })),
  };
  const interactivePayloadJson = JSON.stringify(interactivePayload).replaceAll(
    "<",
    "\\u003c",
  );

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Strong Downtrend Charts</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: ${COLORS.background};
      --panel: ${COLORS.panel};
      --ink: ${COLORS.text};
      --muted: ${COLORS.mutedText};
      --grid: ${COLORS.grid};
      --axis: ${COLORS.axis};
      --selected-line: ${COLORS.selectedLine};
      --regression: ${COLORS.regression};
      --bullish: ${COLORS.bullish};
      --bearish: ${COLORS.bearish};
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: Arial, Helvetica, sans-serif;
    }

    main {
      width: min(1760px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0 44px;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: flex-end;
      margin-bottom: 16px;
    }

    h1 {
      margin: 0 0 6px;
      font-size: 24px;
      line-height: 1.2;
    }

    .summary {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
    }

    .legend {
      display: flex;
      gap: 14px;
      color: var(--muted);
      font-size: 13px;
      white-space: nowrap;
    }

    .legend span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .legend i {
      display: inline-block;
      width: 24px;
      height: 3px;
      border-radius: 99px;
    }

    .chart-list {
      display: grid;
      gap: 16px;
    }

    .chart-card {
      overflow: hidden;
      border: 1px solid #1f2937;
      border-radius: 6px;
      background: var(--panel);
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.24);
    }

    .chart {
      display: block;
      width: 100%;
      aspect-ratio: ${config.chartWidth} / ${config.chartHeight};
      max-height: 900px;
      background: var(--bg);
    }

    .chart-bg {
      fill: var(--bg);
    }

    .plot-bg {
      fill: #0f172a;
    }

    .grid-line {
      stroke: var(--grid);
      stroke-width: 1;
      shape-rendering: crispEdges;
    }

    .axis-line {
      stroke: var(--axis);
      stroke-width: 1.5;
      shape-rendering: crispEdges;
    }

    .axis-label {
      fill: var(--muted);
      font-size: 20px;
      dominant-baseline: middle;
    }

    .price-label {
      text-anchor: start;
    }

    .date-label {
      text-anchor: middle;
    }

    .selected-price-line {
      fill: none;
      stroke: var(--selected-line);
      stroke-width: 2.5;
      stroke-dasharray: 9 9;
      stroke-linejoin: round;
      stroke-linecap: round;
      opacity: 0.9;
    }

    .candle-wick {
      stroke-width: 2.2;
      stroke-linecap: round;
    }

    .candle-wick.bullish {
      stroke: var(--bullish);
    }

    .candle-wick.bearish {
      stroke: var(--bearish);
    }

    .candle-body {
      stroke-width: 1;
      rx: 1;
      shape-rendering: crispEdges;
    }

    .candle-body.bullish {
      fill: var(--bullish);
      stroke: var(--bullish);
    }

    .candle-body.bearish {
      fill: var(--bearish);
      stroke: var(--bearish);
    }

    .candle-hover-area {
      cursor: crosshair;
      pointer-events: all;
    }

    .regression-line {
      stroke: var(--regression);
      stroke-width: 3.2;
      stroke-linecap: round;
      opacity: 0.95;
    }

    .angle-guide line {
      stroke: var(--regression);
      stroke-width: 2;
      stroke-linecap: round;
      opacity: 0.8;
    }

    .angle-guide text {
      fill: var(--muted);
      font-size: 18px;
    }

    .chart-title text {
      fill: var(--ink);
      font-size: 20px;
      font-weight: 700;
    }

    .chart-title text:not(:first-child) {
      fill: var(--muted);
      font-size: 18px;
      font-weight: 600;
    }

    .last-price-line {
      stroke: var(--bullish);
      stroke-width: 1.5;
      stroke-dasharray: 5 6;
      opacity: 0.8;
    }

    .last-price-box {
      fill: var(--bullish);
      stroke: var(--bullish);
    }

    .last-price-text {
      fill: #ffffff;
      font-size: 18px;
      font-weight: 700;
      text-anchor: middle;
      dominant-baseline: middle;
    }

    #chart-tooltip {
      position: fixed;
      pointer-events: none;
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid #475569;
      color: #e5e7eb;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 13px;
      line-height: 1.55;
      z-index: 9999;
      display: none;
      white-space: nowrap;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
    }

    #chart-tooltip .tooltip-date {
      color: #ffffff;
      font-weight: 700;
      margin-bottom: 4px;
    }

    #chart-tooltip .tooltip-row {
      display: flex;
      justify-content: space-between;
      gap: 18px;
    }

    #chart-tooltip .change-up {
      color: var(--bullish);
      font-weight: 700;
    }

    #chart-tooltip .change-down {
      color: var(--bearish);
      font-weight: 700;
    }

    #chart-tooltip .change-flat {
      color: #94a3b8;
      font-weight: 700;
    }

    .viewport-hint {
      fill: var(--muted);
      font-size: 17px;
      text-anchor: end;
    }

    @media (max-width: 820px) {
      main {
        width: min(100vw - 20px, 1760px);
        padding-top: 16px;
      }

      .page-header,
      .chart-card {
        display: block;
      }

      .legend {
        margin-top: 12px;
        flex-wrap: wrap;
      }

    }
  </style>
</head>
<body>
  <main>
    <header class="page-header">
      <div>
        <h1>Strong Downtrend Charts</h1>
        <p class="summary">Top ${results.length} demo results, ${config.chartWidth}x${config.chartHeight}, ${escapeHtml(config.chartType)}, minAngleDegree ${formatNumber(config.minAngleDegree)} deg</p>
      </div>
      <div class="legend" aria-label="chart legend">
        <span><i style="background: var(--bullish)"></i>bullish candle</span>
        <span><i style="background: var(--bearish)"></i>bearish candle</span>
        <span><i style="background: var(--selected-line)"></i>selectedPrice</span>
        <span><i style="background: var(--regression)"></i>linear regression</span>
        <span><i style="background: var(--axis)"></i>price/date axis</span>
      </div>
    </header>
    <section class="chart-list">
      ${cards || "<p>No chart results.</p>"}
    </section>
  </main>
  <div id="chart-tooltip"></div>
  <script id="chart-data" type="application/json">${interactivePayloadJson}</script>
  <script>
    (() => {
      const tooltip = document.getElementById("chart-tooltip");
      const chartList = document.querySelector(".chart-list");
      const payload = JSON.parse(document.getElementById("chart-data").textContent);
      const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
      const formatPrice = (value) => {
        const number = Number(value);
        return Number.isFinite(number) ? Math.round(number).toLocaleString("ko-KR") : "-";
      };
      const formatNumber = (value, digits = 2) => {
        const number = Number(value);
        return Number.isFinite(number) ? number.toFixed(digits) : "-";
      };
      const formatDateLabel = (date) => {
        const parts = String(date || "").split("-");
        return parts.length === 3 ? parts[1] + "/" + parts[2] : String(date || "");
      };
      const selectedPrice = (candle) => candle.close >= candle.open ? candle.close : candle.open;
      const highPrice = (candle) => Math.max(candle.high || candle.open, candle.open, candle.close);
      const lowPrice = (candle) => Math.min(candle.low || candle.open, candle.open, candle.close);
      const priceToY = (price, minPrice, maxPrice, top, height) =>
        top + (height - ((price - minPrice) / (maxPrice - minPrice)) * height);
      const pointsToString = (points) => points.map((point) => point.x + "," + point.y).join(" ");
      const linearRegression = (points) => {
        const n = points.length;
        const sums = points.reduce((acc, point) => ({
          x: acc.x + point.x,
          y: acc.y + point.y,
          xy: acc.xy + point.x * point.y,
          x2: acc.x2 + point.x * point.x,
        }), { x: 0, y: 0, xy: 0, x2: 0 });
        const denominator = n * sums.x2 - sums.x * sums.x;
        const slope = denominator === 0 ? NaN : (n * sums.xy - sums.x * sums.y) / denominator;

        return { slope, intercept: Number.isFinite(slope) ? (sums.y - slope * sums.x) / n : NaN };
      };
      const rSquared = (points, slope, intercept) => {
        const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
        const sums = points.reduce((acc, point) => {
          const predictedY = slope * point.x + intercept;
          return {
            total: acc.total + (point.y - meanY) ** 2,
            residual: acc.residual + (point.y - predictedY) ** 2,
          };
        }, { total: 0, residual: 0 });

        return sums.total === 0 ? NaN : 1 - sums.residual / sums.total;
      };
      const priceTicks = (minPrice, maxPrice, count = 7) =>
        Array.from({ length: count }, (_, index) => minPrice + ((maxPrice - minPrice) * index) / (count - 1));
      const dateLabelIndexes = (candles, count = 5) =>
        Array.from(new Set(Array.from({ length: Math.min(count, candles.length) }, (_, index) =>
          Math.round((index / (Math.min(count, candles.length) - 1 || 1)) * (candles.length - 1))
        ))).sort((a, b) => a - b);
      const changeRateAt = (allCandles, index) => {
        const prevClose = allCandles[index - 1]?.close;
        return Number.isFinite(prevClose) && prevClose > 0
          ? ((allCandles[index].close - prevClose) / prevClose) * 100
          : NaN;
      };
      const states = payload.charts.map((chart) => {
        const maxPeriod = Math.min(payload.options.maxRenderPeriod, chart.allCandles.length);
        const renderPeriod = clamp(payload.options.renderPeriod, payload.options.minRenderPeriod, maxPeriod);

        return {
          renderPeriod,
          endIndex: chart.allCandles.length,
          isDragging: false,
          dragStartX: 0,
          dragStartEndIndex: chart.allCandles.length,
        };
      });
      const createChartSvg = (chart, state, chartIndex) => {
        const options = payload.options;
        const margin = options.margin;
        const chartWidth = options.chartWidth;
        const chartHeight = options.chartHeight;
        const plotLeft = margin.left;
        const plotTop = margin.top;
        const plotWidth = chartWidth - margin.left - margin.right;
        const plotHeight = chartHeight - margin.top - margin.bottom;
        const endIndex = clamp(state.endIndex, state.renderPeriod, chart.allCandles.length);
        const startIndex = endIndex - state.renderPeriod;
        const candles = chart.allCandles.slice(startIndex, endIndex);
        const minRawPrice = Math.min(...candles.map(lowPrice));
        const maxRawPrice = Math.max(...candles.map(highPrice));
        const padding = (maxRawPrice - minRawPrice) * 0.05 || maxRawPrice * 0.05;
        const minPrice = Math.max(minRawPrice - padding, 1);
        const maxPrice = maxRawPrice + padding;
        const candleWidth = Math.max(3, Math.min(18, (plotWidth / candles.length) * 0.55));
        const candleSlotWidth = plotWidth / candles.length;
        const selectedPoints = candles.map((candle, index) => ({
          x: plotLeft + (index / (candles.length - 1 || 1)) * plotWidth,
          y: priceToY(selectedPrice(candle), minPrice, maxPrice, plotTop, plotHeight),
        }));
        const regressionPeriod = Math.min(chart.matchedPeriod || candles.length, candles.length);
        const regressionStartIndex = candles.length - regressionPeriod;
        const regressionCandles = candles.slice(-regressionPeriod);
        const regressionPoints = regressionCandles.map((candle, index) => ({
          x: plotLeft + ((regressionStartIndex + index) / (candles.length - 1 || 1)) * plotWidth,
          y: priceToY(selectedPrice(candle), minPrice, maxPrice, plotTop, plotHeight),
        }));
        const regression = linearRegression(regressionPoints);
        const angle = Math.atan(regression.slope) * 180 / Math.PI;
        const r2 = rSquared(regressionPoints, regression.slope, regression.intercept);
        const firstSelected = selectedPrice(regressionCandles[0]);
        const lastSelected = selectedPrice(regressionCandles[regressionCandles.length - 1]);
        const returnRate = ((lastSelected - firstSelected) / firstSelected) * 100;
        const ticks = priceTicks(minPrice, maxPrice);
        const dateIndexes = dateLabelIndexes(candles);
        const grid = [
          ...ticks.map((price) => {
            const y = priceToY(price, minPrice, maxPrice, plotTop, plotHeight);
            return '<line class="grid-line" x1="' + plotLeft + '" y1="' + y + '" x2="' + (plotLeft + plotWidth) + '" y2="' + y + '" />';
          }),
          ...dateIndexes.map((index) => {
            const x = plotLeft + (index / (candles.length - 1 || 1)) * plotWidth;
            return '<line class="grid-line" x1="' + x + '" y1="' + plotTop + '" x2="' + x + '" y2="' + (plotTop + plotHeight) + '" />';
          }),
        ].join("");
        const labels = [
          ...ticks.map((price) => {
            const y = priceToY(price, minPrice, maxPrice, plotTop, plotHeight);
            return '<text class="axis-label price-label" x="' + (plotLeft + plotWidth + 12) + '" y="' + (y + 5) + '">' + formatPrice(price) + '</text>';
          }),
          ...dateIndexes.map((index) => {
            const x = plotLeft + (index / (candles.length - 1 || 1)) * plotWidth;
            return '<text class="axis-label date-label" x="' + x + '" y="' + (plotTop + plotHeight + 34) + '">' + formatDateLabel(candles[index].date) + '</text>';
          }),
        ].join("");
        const candleElements = candles.map((candle, index) => {
          const absoluteIndex = startIndex + index;
          const x = plotLeft + (index / (candles.length - 1 || 1)) * plotWidth;
          const highY = priceToY(highPrice(candle), minPrice, maxPrice, plotTop, plotHeight);
          const lowY = priceToY(lowPrice(candle), minPrice, maxPrice, plotTop, plotHeight);
          const openY = priceToY(candle.open, minPrice, maxPrice, plotTop, plotHeight);
          const closeY = priceToY(candle.close, minPrice, maxPrice, plotTop, plotHeight);
          const bodyY = Math.min(openY, closeY);
          const bodyHeight = Math.max(Math.abs(closeY - openY), 1);
          const candleClass = candle.close >= candle.open ? "bullish" : "bearish";
          const changeRate = changeRateAt(chart.allCandles, absoluteIndex);

          return [
            '<line class="candle-wick ' + candleClass + '" x1="' + x + '" y1="' + highY + '" x2="' + x + '" y2="' + lowY + '" />',
            '<rect class="candle-body ' + candleClass + '" x="' + (x - candleWidth / 2) + '" y="' + bodyY + '" width="' + candleWidth + '" height="' + bodyHeight + '" />',
            '<rect class="candle-hover-area" x="' + (x - candleSlotWidth / 2) + '" y="' + plotTop + '" width="' + candleSlotWidth + '" height="' + plotHeight + '" fill="transparent" data-date="' + candle.date + '" data-open="' + candle.open + '" data-high="' + highPrice(candle) + '" data-low="' + lowPrice(candle) + '" data-close="' + candle.close + '" data-change-rate="' + (Number.isFinite(changeRate) ? changeRate.toFixed(2) : "") + '" />',
          ].join("");
        }).join("");
        const lastClose = candles[candles.length - 1].close;
        const lastCloseY = priceToY(lastClose, minPrice, maxPrice, plotTop, plotHeight);
        const regressionX1 = regressionPoints[0]?.x ?? plotLeft;
        const regressionX2 = regressionPoints[regressionPoints.length - 1]?.x ?? plotLeft + plotWidth;

        return '<article class="chart-card" data-chart-index="' + chartIndex + '">' +
          '<svg class="chart" viewBox="0 0 ' + chartWidth + ' ' + chartHeight + '" role="img">' +
          '<rect x="0" y="0" width="' + chartWidth + '" height="' + chartHeight + '" class="chart-bg" />' +
          '<rect x="' + plotLeft + '" y="' + plotTop + '" width="' + plotWidth + '" height="' + plotHeight + '" class="plot-bg" />' +
          '<g class="grid">' + grid + '</g>' +
          '<line class="axis-line" x1="' + (plotLeft + plotWidth) + '" y1="' + plotTop + '" x2="' + (plotLeft + plotWidth) + '" y2="' + (plotTop + plotHeight) + '" />' +
          '<line class="axis-line" x1="' + plotLeft + '" y1="' + (plotTop + plotHeight) + '" x2="' + (plotLeft + plotWidth) + '" y2="' + (plotTop + plotHeight) + '" />' +
          '<g class="axis-labels">' + labels + '</g>' +
          '<g class="chart-title"><text x="' + plotLeft + '" y="24">' + chart.name + ' (' + chart.code + ')</text>' +
          '<text x="' + (plotLeft + 360) + '" y="24">angle ' + formatNumber(angle, 2) + ' deg</text>' +
          '<text x="' + (plotLeft + 580) + '" y="24">slope ' + formatNumber(regression.slope, 4) + '</text>' +
          '<text x="' + (plotLeft + 780) + '" y="24">R2 ' + formatNumber(r2, 4) + '</text>' +
          '<text x="' + (plotLeft + 940) + '" y="24">return ' + formatNumber(returnRate, 2) + '%</text></g>' +
          '<text class="viewport-hint" x="' + (plotLeft + plotWidth) + '" y="24">wheel zoom, drag pan · ' + state.renderPeriod + ' bars</text>' +
          '<g class="candles">' + candleElements + '</g>' +
          (options.showSelectedPriceLine ? '<polyline class="selected-price-line" points="' + pointsToString(selectedPoints) + '" />' : '') +
          '<line class="regression-line" x1="' + regressionX1 + '" y1="' + (regression.slope * regressionX1 + regression.intercept) + '" x2="' + regressionX2 + '" y2="' + (regression.slope * regressionX2 + regression.intercept) + '" />' +
          '<line class="last-price-line" x1="' + plotLeft + '" y1="' + lastCloseY + '" x2="' + (plotLeft + plotWidth) + '" y2="' + lastCloseY + '" />' +
          '<rect class="last-price-box" x="' + (plotLeft + plotWidth + 6) + '" y="' + (lastCloseY - 17) + '" width="78" height="34" rx="3" />' +
          '<text class="last-price-text" x="' + (plotLeft + plotWidth + 45) + '" y="' + (lastCloseY + 6) + '">' + formatPrice(lastClose) + '</text>' +
          '</svg></article>';
      };
      const renderAll = () => {
        chartList.innerHTML = payload.charts.map((chart, index) =>
          createChartSvg(chart, states[index], index)
        ).join("");
      };
      const formatChangeRate = (value) => {
        const number = Number(value);

        if (!Number.isFinite(number)) {
          return { text: "N/A", className: "change-flat" };
        }

        if (number > 0) {
          return { text: "+" + number.toFixed(2) + "%", className: "change-up" };
        }

        if (number < 0) {
          return { text: number.toFixed(2) + "%", className: "change-down" };
        }

        return { text: "0.00%", className: "change-flat" };
      };
      const showTooltip = (target, event) => {
        const changeRate = formatChangeRate(target.dataset.changeRate);

        tooltip.innerHTML = [
          '<div class="tooltip-date">' + target.dataset.date + '</div>',
          '<div class="tooltip-row"><span>시가</span><strong>' + formatPrice(target.dataset.open) + '</strong></div>',
          '<div class="tooltip-row"><span>고가</span><strong>' + formatPrice(target.dataset.high) + '</strong></div>',
          '<div class="tooltip-row"><span>저가</span><strong>' + formatPrice(target.dataset.low) + '</strong></div>',
          '<div class="tooltip-row"><span>종가</span><strong>' + formatPrice(target.dataset.close) + '</strong></div>',
          '<div class="tooltip-row"><span>전일 종가 대비</span><strong class="' + changeRate.className + '">' + changeRate.text + '</strong></div>',
        ].join("");
        tooltip.style.left = event.clientX + 12 + "px";
        tooltip.style.top = event.clientY + 12 + "px";
        tooltip.style.display = "block";
      };
      const hideTooltip = () => {
        tooltip.style.display = "none";
      };

      chartList.addEventListener("mousemove", (event) => {
        const target = event.target.closest(".candle-hover-area");
        if (target) {
          showTooltip(target, event);
        }
      });
      chartList.addEventListener("mouseleave", hideTooltip);
      chartList.addEventListener("wheel", (event) => {
        const card = event.target.closest(".chart-card");
        if (!card) return;
        event.preventDefault();

        const index = Number(card.dataset.chartIndex);
        const state = states[index];
        const chart = payload.charts[index];
        const maxPeriod = Math.min(payload.options.maxRenderPeriod, chart.allCandles.length);
        state.renderPeriod = clamp(
          state.renderPeriod + (event.deltaY < 0 ? -5 : 5),
          payload.options.minRenderPeriod,
          maxPeriod,
        );
        state.endIndex = clamp(state.endIndex, state.renderPeriod, chart.allCandles.length);
        hideTooltip();
        renderAll();
      }, { passive: false });
      chartList.addEventListener("mousedown", (event) => {
        const card = event.target.closest(".chart-card");
        if (!card) return;

        const index = Number(card.dataset.chartIndex);
        states[index].isDragging = true;
        states[index].dragStartX = event.clientX;
        states[index].dragStartEndIndex = states[index].endIndex;
      });
      window.addEventListener("mousemove", (event) => {
        states.forEach((state, index) => {
          if (!state.isDragging) return;

          const chart = payload.charts[index];
          const plotWidth =
            payload.options.chartWidth -
            payload.options.margin.left -
            payload.options.margin.right;
          const slotWidth = plotWidth / state.renderPeriod;
          const deltaBars = Math.trunc((event.clientX - state.dragStartX) / Math.max(slotWidth, 1));

          if (deltaBars !== 0) {
            state.endIndex = clamp(
              state.dragStartEndIndex - deltaBars,
              state.renderPeriod,
              chart.allCandles.length,
            );
            hideTooltip();
            renderAll();
          }
        });
      });
      window.addEventListener("mouseup", () => {
        states.forEach((state) => {
          state.isDragging = false;
        });
      });
      renderAll();
    })();
  </script>
</body>
</html>`;
};

export const saveChartHtml = (html, filePath = DEFAULT_CHART_FILE_PATH) => {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, html, "utf8");
};

export const run = () => {
  const generatedStocks = generateSampleStocks({
    stockCount: 100,
    candleCount: 240,
    seed: 20260512,
  });
  const strictOptions = { ...DEFAULT_OPTIONS, minAngleDegree: 45 };
  const demoOptions = {
    ...DEFAULT_OPTIONS,
    chartType: DEFAULT_CHART_TYPE,
    renderPeriod: 60,
    minRenderPeriod: 30,
    maxRenderPeriod: 200,
    scanMinPeriod: 10,
    scanMaxPeriod: 60,
    minAngleDegree: 29,
  };
  const strictResults = filterStrongDowntrendStocks(generatedStocks, strictOptions);
  const demoResults = filterStrongDowntrendStocks(generatedStocks, demoOptions);
  const chartResults = demoResults
    .slice(0, 5)
    .map((result) => enrichResultForChart(result, generatedStocks, demoOptions));
  const html = generateChartHtml(chartResults, demoOptions);

  console.log("strictResults: minAngleDegree = 45");
  console.table(strictResults);

  console.log("demoResults: minAngleDegree = 29");
  console.table(demoResults);

  saveChartHtml(html, DEFAULT_CHART_FILE_PATH);
  saveChartHtml(html, DEFAULT_DIST_CHART_FILE_PATH);
  console.log(`Created ${DEFAULT_CHART_FILE_PATH}`);
  console.log(`Created ${DEFAULT_DIST_CHART_FILE_PATH}`);
};

const isDirectRun = process.argv[1] === new URL(import.meta.url).pathname;

if (isDirectRun) {
  run();
}
