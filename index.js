import { writeFileSync } from "node:fs";
import {
  DEFAULT_OPTIONS,
  calculateAngleDegree,
  calculateLinearRegressionByPoints,
  calculateRSquaredByPoints,
  calculateReturnRate,
  filterStrongDowntrendStocks,
  generateSampleStocks,
} from "./strong-downtrend-filter.mjs";

const DEFAULT_CHART_FILE_PATH = "chart.html";
const DEFAULT_CHART_TYPE = "candlestick";

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

const getRecentValidCandles = (prices, period) => {
  if (!Array.isArray(prices) || !Number.isInteger(period) || period < 2) {
    return [];
  }

  const validCandles = [...prices]
    .filter(isValidCandle)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return validCandles.length < period ? [] : validCandles.slice(-period);
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

const createChartPointsByScale = ({
  selectedPrices,
  minPrice,
  maxPrice,
  chartWidth,
  chartHeight,
}) => {
  if (!Array.isArray(selectedPrices) || selectedPrices.length < 2) {
    return [];
  }

  return selectedPrices.map((selectedPrice, index) => ({
    xPixel: (index / (selectedPrices.length - 1)) * chartWidth,
    yPixel: priceToY(selectedPrice, minPrice, maxPrice, chartHeight),
    selectedPrice,
    index,
  }));
};

const enrichResultForChart = (result, stocks, options) => {
  const stock = stocks.find((item) => item.code === result.code);
  const candles = getRecentValidCandles(stock?.prices, options.period);
  const selectedPrices = candles.map(getSelectedPrice);
  const chartScalePrices = candles.flatMap((candle, index) => [
    candle.open,
    candle.close,
    selectedPrices[index],
  ]);
  const minPrice = Math.min(...chartScalePrices);
  const maxPrice = Math.max(...chartScalePrices);
  const points = createChartPointsByScale({
    selectedPrices,
    minPrice,
    maxPrice,
    chartWidth: options.chartWidth,
    chartHeight: options.chartHeight,
  });
  const { slopePixel, intercept } = calculateLinearRegressionByPoints(points);
  const rSquared = calculateRSquaredByPoints(points, slopePixel, intercept);
  const angleDegree = calculateAngleDegree(slopePixel);
  const returnRate = calculateReturnRate(selectedPrices);

  return {
    ...result,
    type: stock?.type,
    candles,
    selectedPrices,
    points,
    minPrice,
    maxPrice,
    slopePixel,
    intercept,
    angleDegree,
    rSquared,
    returnRate,
    firstPrice: selectedPrices[0],
    lastPrice: selectedPrices.at(-1),
  };
};

export const createCandleElements = (candles, options = {}) => {
  const {
    chartWidth,
    chartHeight,
    period,
    minPrice,
    maxPrice,
  } = { ...DEFAULT_OPTIONS, ...options };
  const candleWidth = (chartWidth / period) * 0.6;

  return candles
    .map((candle, index) => {
      const xCenter = (index / (period - 1)) * chartWidth;
      const openY = priceToY(candle.open, minPrice, maxPrice, chartHeight);
      const closeY = priceToY(candle.close, minPrice, maxPrice, chartHeight);
      const bodyY = Math.min(openY, closeY);
      const rawBodyHeight = Math.abs(closeY - openY);
      const bodyHeight = Math.max(rawBodyHeight, 1);
      const adjustedBodyY = rawBodyHeight < 1 ? bodyY - 0.5 : bodyY;
      const isBullish = candle.close >= candle.open;
      const candleClass = isBullish ? "bullish" : "bearish";

      return `
        <rect
          class="candle-body ${candleClass}"
          x="${xCenter - candleWidth / 2}"
          y="${adjustedBodyY}"
          width="${candleWidth}"
          height="${bodyHeight}"
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
export const createCandlestickSvgChart = (stockResult, options = {}) => {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const { chartWidth, chartHeight, minAngleDegree } = config;
  const priceLinePoints = toPolylinePoints(stockResult.points);
  const regressionLine = getRegressionLine({
    slopePixel: stockResult.slopePixel,
    intercept: stockResult.intercept,
    chartWidth,
  });
  const thresholdSlope = Math.tan((minAngleDegree * Math.PI) / 180);
  const guideX = 90;
  const guideY = chartHeight - 110;
  const guideLength = 170;
  const guideEndY = guideY + Math.min(thresholdSlope * guideLength, 130);
  const firstPoint = stockResult.points[0];
  const lastPoint = stockResult.points.at(-1);
  const candleElements = createCandleElements(stockResult.candles, {
    ...config,
    minPrice: stockResult.minPrice,
    maxPrice: stockResult.maxPrice,
  });

  return `
    <article class="chart-card">
      <header class="card-header">
        <div>
          <p class="code">${escapeHtml(stockResult.code)}</p>
          <h2>${escapeHtml(stockResult.name)}</h2>
        </div>
        <dl class="metrics">
          <div><dt>Angle</dt><dd>${formatNumber(stockResult.angleDegree)} deg</dd></div>
          <div><dt>Slope</dt><dd>${formatNumber(stockResult.slopePixel, 4)}</dd></div>
          <div><dt>R2</dt><dd>${formatNumber(stockResult.rSquared, 4)}</dd></div>
          <div><dt>Return</dt><dd>${formatNumber(stockResult.returnRate)}%</dd></div>
        </dl>
      </header>

      <svg
        class="chart"
        viewBox="0 0 ${chartWidth} ${chartHeight}"
        role="img"
        aria-label="${escapeHtml(stockResult.code)} ${escapeHtml(stockResult.name)} candlestick chart"
      >
        <rect x="0" y="0" width="${chartWidth}" height="${chartHeight}" class="plot-bg" />
        <g class="grid">
          ${Array.from({ length: 5 }, (_, index) => {
            const y = (chartHeight / 4) * index;
            return `<line x1="0" y1="${y}" x2="${chartWidth}" y2="${y}" />`;
          }).join("")}
          ${Array.from({ length: 9 }, (_, index) => {
            const x = (chartWidth / 8) * index;
            return `<line x1="${x}" y1="0" x2="${x}" y2="${chartHeight}" />`;
          }).join("")}
        </g>

        <g class="candles">
          ${candleElements}
        </g>
        <polyline class="price-line" points="${priceLinePoints}" />
        <line
          class="regression-line"
          x1="${regressionLine.x1}"
          y1="${regressionLine.y1}"
          x2="${regressionLine.x2}"
          y2="${regressionLine.y2}"
        />

        <circle class="endpoint first" cx="${firstPoint.xPixel}" cy="${firstPoint.yPixel}" r="10" />
        <circle class="endpoint last" cx="${lastPoint.xPixel}" cy="${lastPoint.yPixel}" r="10" />

        <g class="angle-guide">
          <line x1="${guideX}" y1="${guideY}" x2="${guideX + guideLength}" y2="${guideY}" />
          <line x1="${guideX}" y1="${guideY}" x2="${guideX + guideLength}" y2="${guideEndY}" />
          <text x="${guideX}" y="${guideY - 18}">minAngleDegree ${formatNumber(minAngleDegree)} deg</text>
        </g>

        <g class="chart-labels">
          <text x="34" y="48">max ${formatNumber(stockResult.maxPrice)}</text>
          <text x="34" y="${chartHeight - 28}">min ${formatNumber(stockResult.minPrice)}</text>
          <text x="${chartWidth - 470}" y="48">angle ${formatNumber(stockResult.angleDegree)} deg</text>
          <text x="${chartWidth - 470}" y="92">slopePixel ${formatNumber(stockResult.slopePixel, 4)}</text>
          <text x="${chartWidth - 470}" y="136">rSquared ${formatNumber(stockResult.rSquared, 4)}</text>
          <text x="${chartWidth - 470}" y="180">returnRate ${formatNumber(stockResult.returnRate)}%</text>
        </g>
      </svg>

      <footer class="card-footer">
        <span>firstPrice ${formatNumber(stockResult.firstPrice)}</span>
        <span>lastPrice ${formatNumber(stockResult.lastPrice)}</span>
        <span>period ${config.period}</span>
        <span>type ${escapeHtml(stockResult.type ?? "-")}</span>
      </footer>
    </article>
  `;
};

export const createSvgChart = (stockResult, options = {}) => {
  const config = {
    ...DEFAULT_OPTIONS,
    chartType: DEFAULT_CHART_TYPE,
    ...options,
  };

  return config.chartType === "candlestick"
    ? createCandlestickSvgChart(stockResult, config)
    : createCandlestickSvgChart(stockResult, config);
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

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Strong Downtrend Charts</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7f9;
      --panel: #ffffff;
      --ink: #18212f;
      --muted: #637083;
      --line: #d8dee8;
      --price: #1f7a5a;
      --regression: #c4382b;
      --guide: #805ad5;
      --bullish: #197a55;
      --bearish: #c24135;
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
      margin-bottom: 18px;
    }

    h1 {
      margin: 0 0 6px;
      font-size: 28px;
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
      gap: 18px;
    }

    .chart-card {
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: 0 10px 24px rgba(24, 33, 47, 0.06);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: flex-start;
      padding: 18px 20px 14px;
      border-bottom: 1px solid var(--line);
    }

    .code {
      margin: 0 0 4px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }

    h2 {
      margin: 0;
      font-size: 21px;
      line-height: 1.2;
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(92px, 1fr));
      gap: 10px;
      margin: 0;
      min-width: min(620px, 100%);
    }

    .metrics div {
      padding: 8px 10px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fafbfc;
    }

    dt {
      color: var(--muted);
      font-size: 12px;
    }

    dd {
      margin: 3px 0 0;
      font-size: 16px;
      font-weight: 700;
    }

    .chart {
      display: block;
      width: 100%;
      aspect-ratio: ${config.chartWidth} / ${config.chartHeight};
      max-height: 900px;
      background: #ffffff;
    }

    .plot-bg {
      fill: #ffffff;
    }

    .grid line {
      stroke: #e8edf3;
      stroke-width: 1;
    }

    .price-line {
      fill: none;
      stroke: var(--price);
      stroke-width: 5;
      stroke-dasharray: 14 12;
      stroke-linejoin: round;
      stroke-linecap: round;
    }

    .candle-body {
      stroke-width: 3;
      rx: 2;
    }

    .candle-body.bullish {
      fill: rgba(25, 122, 85, 0.82);
      stroke: var(--bullish);
    }

    .candle-body.bearish {
      fill: rgba(194, 65, 53, 0.82);
      stroke: var(--bearish);
    }

    .regression-line {
      stroke: var(--regression);
      stroke-width: 6;
      stroke-dasharray: 20 14;
      stroke-linecap: round;
    }

    .endpoint {
      stroke: #ffffff;
      stroke-width: 4;
    }

    .endpoint.first {
      fill: #2b6cb0;
    }

    .endpoint.last {
      fill: #c4382b;
    }

    .angle-guide line {
      stroke: var(--guide);
      stroke-width: 5;
      stroke-linecap: round;
    }

    .angle-guide text,
    .chart-labels text {
      fill: #263445;
      font-size: 30px;
      font-weight: 700;
    }

    .card-footer {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 18px;
      padding: 12px 20px 16px;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 13px;
    }

    @media (max-width: 820px) {
      main {
        width: min(100vw - 20px, 1760px);
        padding-top: 16px;
      }

      .page-header,
      .card-header {
        display: block;
      }

      .legend {
        margin-top: 12px;
        flex-wrap: wrap;
      }

      .metrics {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        min-width: 0;
        margin-top: 14px;
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
        <span><i style="background: var(--price)"></i>selectedPrice</span>
        <span><i style="background: var(--regression)"></i>linear regression</span>
        <span><i style="background: var(--guide)"></i>min angle guide</span>
      </div>
    </header>
    <section class="chart-list">
      ${cards || "<p>No chart results.</p>"}
    </section>
  </main>
</body>
</html>`;
};

export const saveChartHtml = (html, filePath = DEFAULT_CHART_FILE_PATH) => {
  writeFileSync(filePath, html, "utf8");
};

const run = () => {
  const generatedStocks = generateSampleStocks({
    stockCount: 100,
    candleCount: 60,
    seed: 20260512,
  });
  const strictOptions = { ...DEFAULT_OPTIONS, minAngleDegree: 45 };
  const demoOptions = {
    ...DEFAULT_OPTIONS,
    chartType: DEFAULT_CHART_TYPE,
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
  console.log(`Created ${DEFAULT_CHART_FILE_PATH}`);
};

const isDirectRun = process.argv[1] === new URL(import.meta.url).pathname;

if (isDirectRun) {
  run();
}
