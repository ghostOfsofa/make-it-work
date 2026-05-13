import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  DEFAULT_OPTIONS,
  calculatePriceRange,
  createRenderPoints,
  exportResultsToCsv,
  filterStrongDowntrendStocks,
  getPlotSize,
  getRecentCandles,
  getSelectedPrice,
  mergeOptions,
  priceToY,
  sortResults,
} from "./analysis.js";
import {
  escapeHtml,
  formatDateLabel,
  formatDateRangeLabel,
  formatNumber,
  formatPercent,
  formatPrice,
} from "./utils.js";

export const COLORS = Object.freeze({
  background: "#0b1220",
  grid: "#243044",
  text: "#cbd5e1",
  bullish: "#ef4444",
  bearish: "#3b82f6",
  regression: "#f87171",
  selectedLine: "#d946ef",
  axis: "#475569",
  priceLabelBgUp: "#dc2626",
  priceLabelBgDown: "#2563eb",
  matchedArea: "rgba(148, 163, 184, 0.18)",
  ma5: "#d946ef",
  ma20: "#eab308",
  ma60: "#000000",
  ma120: "#16a34a",
  cloud: "rgba(96, 165, 250, 0.45)",
});

export const calculateNicePriceTicks = (minPrice, maxPrice, tickCount = 6) => {
  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || maxPrice <= minPrice) {
    return [];
  }

  const roughStep = (maxPrice - minPrice) / Math.max(tickCount - 1, 1);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const residual = roughStep / magnitude;
  const niceStep =
    residual >= 5 ? 5 * magnitude : residual >= 2 ? 2 * magnitude : magnitude;
  const start = Math.ceil(minPrice / niceStep) * niceStep;
  const ticks = [];

  for (let value = start; value <= maxPrice + niceStep * 0.5; value += niceStep) {
    ticks.push(value);
  }

  return ticks.slice(0, 8);
};

export const createGridLines = ({ ticks, minPrice, maxPrice, plotHeight, margin, chartWidth }) =>
  ticks
    .map((tick) => {
      const y = priceToY(tick, minPrice, maxPrice, plotHeight, margin.top);
      return `<line x1="${margin.left}" y1="${y}" x2="${
        chartWidth - margin.right
      }" y2="${y}" stroke="${COLORS.grid}" stroke-width="1" />`;
    })
    .join("");

export const createAxisLabels = ({ ticks, minPrice, maxPrice, plotHeight, margin, chartWidth }) =>
  ticks
    .map((tick) => {
      const y = priceToY(tick, minPrice, maxPrice, plotHeight, margin.top);
      return `<text x="${chartWidth - margin.right + 12}" y="${
        y + 4
      }" fill="${COLORS.text}" font-size="18">${formatPrice(tick)}</text>`;
    })
    .join("");

export const createCandleWickElement = ({ candle, x, minPrice, maxPrice, plotHeight, margin }) => {
  const color = candle.close >= candle.open ? COLORS.bullish : COLORS.bearish;
  const highY = priceToY(candle.high, minPrice, maxPrice, plotHeight, margin.top);
  const lowY = priceToY(candle.low, minPrice, maxPrice, plotHeight, margin.top);
  return `<line x1="${x}" y1="${highY}" x2="${x}" y2="${lowY}" stroke="${color}" stroke-width="1.4" />`;
};

export const createCandleBodyElement = ({
  candle,
  x,
  candleWidth,
  minPrice,
  maxPrice,
  plotHeight,
  margin,
}) => {
  const color = candle.close >= candle.open ? COLORS.bullish : COLORS.bearish;
  const openY = priceToY(candle.open, minPrice, maxPrice, plotHeight, margin.top);
  const closeY = priceToY(candle.close, minPrice, maxPrice, plotHeight, margin.top);
  const bodyY = Math.min(openY, closeY);
  const bodyHeight = Math.max(1, Math.abs(closeY - openY));
  return `<rect x="${x - candleWidth / 2}" y="${bodyY}" width="${candleWidth}" height="${bodyHeight}" fill="${color}" stroke="${color}" />`;
};

const movingAverage = (candles, period) =>
  candles.map((_, index) => {
    if (index + 1 < period) return null;
    const slice = candles.slice(index + 1 - period, index + 1);
    return slice.reduce((sum, candle) => sum + candle.close, 0) / period;
  });

const createLinePath = (values, candles, minPrice, maxPrice, plotWidth, plotHeight, margin) =>
  values
    .map((value, index) => {
      if (!Number.isFinite(value)) return null;
      const x = margin.left + (index / Math.max(candles.length - 1, 1)) * plotWidth;
      const y = priceToY(value, minPrice, maxPrice, plotHeight, margin.top);
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(" ");

export const createHoverAreas = ({ candles, plotWidth, plotHeight, margin }) => {
  const slotWidth = plotWidth / Math.max(candles.length, 1);
  return candles
    .map((candle, index) => {
      const x = margin.left + (index / Math.max(candles.length - 1, 1)) * plotWidth;
      const prevClose = candles[index - 1]?.close;
      const changeRate =
        prevClose > 0 ? ((candle.close - prevClose) / prevClose) * 100 : "";
      return `<rect class="candle-hover-area" x="${x - slotWidth / 2}" y="${
        margin.top
      }" width="${slotWidth}" height="${plotHeight}" fill="transparent" data-date="${
        candle.date
      }" data-open="${candle.open}" data-high="${candle.high}" data-low="${
        candle.low
      }" data-close="${candle.close}" data-prev-close="${
        prevClose ?? ""
      }" data-change-rate="${changeRate}" />`;
    })
    .join("");
};

export const createCandlestickSvgChart = (stockResult, stocks, options = {}) => {
  const merged = mergeOptions(options);
  const stock = stocks.find((item) => item.code === stockResult.code);
  const allCandles = getRecentCandles(stock?.prices, 240);
  const candles = allCandles.slice(-merged.renderPeriod);
  const selectedPrices = candles.map(getSelectedPrice);
  const { minPrice, maxPrice } = calculatePriceRange(candles, selectedPrices);
  const renderPoints = createRenderPoints(candles, merged);
  const { chartWidth, chartHeight, margin, plotWidth, plotHeight } = getPlotSize(merged);
  const candleSlotWidth = plotWidth / Math.max(candles.length, 1);
  const candleWidth = Math.max(2, Math.min(18, candleSlotWidth * 0.8));
  const ticks = calculateNicePriceTicks(minPrice, maxPrice, 7);
  const matchStartIndex = Math.max(0, candles.length - stockResult.matchedPeriod);
  const matchStartX =
    margin.left + (matchStartIndex / Math.max(candles.length - 1, 1)) * plotWidth;
  const matchedWidth = chartWidth - margin.right - matchStartX;
  const selectedLine = renderPoints.map((point) => `${point.xPixel},${point.yPixel}`).join(" ");
  const scanPoints = renderPoints.slice(-stockResult.matchedPeriod);
  const x1 = scanPoints[0]?.xPixel ?? margin.left;
  const x2 = scanPoints.at(-1)?.xPixel ?? chartWidth - margin.right;
  const y1 = stockResult.slopePixel * x1 + stockResult.intercept;
  const y2 = stockResult.slopePixel * x2 + stockResult.intercept;
  const lastCandle = candles.at(-1);
  const lastY = priceToY(lastCandle.close, minPrice, maxPrice, plotHeight, margin.top);
  const lastColor = lastCandle.close >= candles.at(-2)?.close ? COLORS.bullish : COLORS.bearish;
  const maElements = [
    [5, COLORS.ma5],
    [20, COLORS.ma20],
    [60, COLORS.ma60],
    [120, COLORS.ma120],
  ]
    .map(([period, color]) => {
      const points = createLinePath(
        movingAverage(candles, period),
        candles,
        minPrice,
        maxPrice,
        plotWidth,
        plotHeight,
        margin,
      );
      return points
        ? `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" opacity="0.95" />`
        : "";
    })
    .join("");

  const candleElements = candles
    .map((candle, index) => {
      const x = margin.left + (index / Math.max(candles.length - 1, 1)) * plotWidth;
      return [
        merged.showCandleWick
          ? createCandleWickElement({ candle, x, minPrice, maxPrice, plotHeight, margin })
          : "",
        createCandleBodyElement({
          candle,
          x,
          candleWidth,
          minPrice,
          maxPrice,
          plotHeight,
          margin,
        }),
      ].join("");
    })
    .join("");

  const xLabelIndexes = Array.from({ length: 5 }, (_, index) =>
    Math.round((index / 4) * Math.max(candles.length - 1, 0)),
  );
  const xLabels = [...new Set(xLabelIndexes)]
    .map((index) => {
      const x = margin.left + (index / Math.max(candles.length - 1, 1)) * plotWidth;
      return `<text x="${x}" y="${
        chartHeight - 24
      }" fill="${COLORS.text}" font-size="18" text-anchor="middle">${formatDateLabel(
        candles[index]?.date,
      )}</text>`;
    })
    .join("");

  return `
    <svg class="kiwoom-chart" viewBox="0 0 ${chartWidth} ${chartHeight}" data-code="${
      stockResult.code
    }">
      <rect width="${chartWidth}" height="${chartHeight}" fill="${COLORS.background}" />
      <rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" fill="#0b1220" />
      ${createGridLines({ ticks, minPrice, maxPrice, plotHeight, margin, chartWidth })}
      ${Array.from({ length: 6 }, (_, index) => {
        const x = margin.left + (index / 5) * plotWidth;
        return `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${
          chartHeight - margin.bottom
        }" stroke="${COLORS.grid}" stroke-width="1" />`;
      }).join("")}
      <rect x="${matchStartX}" y="${margin.top}" width="${matchedWidth}" height="${plotHeight}" fill="${COLORS.matchedArea}" />
      ${maElements}
      ${candleElements}
      ${
        merged.showSelectedPriceLine
          ? `<polyline points="${selectedLine}" fill="none" stroke="${COLORS.selectedLine}" stroke-width="2" stroke-dasharray="8 8" opacity="0.9" />`
          : ""
      }
      ${
        merged.showRegressionLine
          ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${COLORS.regression}" stroke-width="3" />`
          : ""
      }
      <line x1="${margin.left}" y1="${chartHeight - margin.bottom}" x2="${
        chartWidth - margin.right
      }" y2="${chartHeight - margin.bottom}" stroke="${COLORS.axis}" />
      <line x1="${chartWidth - margin.right}" y1="${margin.top}" x2="${
        chartWidth - margin.right
      }" y2="${chartHeight - margin.bottom}" stroke="${COLORS.axis}" />
      ${createAxisLabels({ ticks, minPrice, maxPrice, plotHeight, margin, chartWidth })}
      ${xLabels}
      <rect x="${chartWidth - margin.right + 4}" y="${
        lastY - 14
      }" width="78" height="28" rx="4" fill="${lastColor}" />
      <text x="${chartWidth - margin.right + 43}" y="${
        lastY + 6
      }" fill="#fff" font-size="16" text-anchor="middle">${formatPrice(lastCandle.close)}</text>
      <text x="${margin.left + 12}" y="${margin.top + 28}" fill="${
        COLORS.text
      }" font-size="22" font-weight="700">${escapeHtml(stockResult.name)} ${escapeHtml(
        stockResult.code,
      )}</text>
      <text x="${margin.left + 12}" y="${margin.top + 58}" fill="${
        COLORS.text
      }" font-size="17">각도 ${formatNumber(stockResult.angleDegree)}° · slope ${formatNumber(
        stockResult.slopePixel,
        4,
      )} · R² ${formatNumber(stockResult.rSquared, 4)} · 수익률 ${formatPercent(
        stockResult.returnRate,
      )}</text>
      ${createHoverAreas({ candles, plotWidth, plotHeight, margin })}
    </svg>
  `;
};

const readStyles = () =>
  readFileSync(new URL("./styles.css", import.meta.url), "utf8");

const escapeJsonForHtml = (json) =>
  json
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");

const createClientScript = () =>
  readFileSync(new URL("./client.js", import.meta.url), "utf8")
    .replace("__COLORS__", JSON.stringify(COLORS))
    .replace("__DEFAULT_OPTIONS__", JSON.stringify(DEFAULT_OPTIONS));

const stripResultForPayload = (result) => {
  const { prices, renderCandles, scanCandles, regressionLine, ...payloadResult } = result;
  return payloadResult;
};

export const generateChartHtml = (payload, options = {}) => {
  const merged = mergeOptions(options);
  const data = {
    ...payload,
    strictResults: (payload.strictResults ?? []).map(stripResultForPayload),
    demoResults: (payload.demoResults ?? []).map(stripResultForPayload),
    options: merged,
    baseDate: payload.dataDate ?? payload.stocks[0]?.prices?.at(-1)?.date ?? "-",
  };

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>우하향 추세 종목 스크리너</title>
  <style>${readStyles()}</style>
</head>
<body>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <h1>우하향 추세 스크리너</h1>
        <p>최근일을 끝점으로 고정하고 10~60봉 구간을 확장 검색합니다.</p>
      </div>
      <div class="control-group">
        <div class="field"><label for="renderPeriod">차트 표시 봉 개수</label><input id="renderPeriod" type="number" min="30" max="200" value="${merged.renderPeriod}" /></div>
        <div class="field"><label for="scanMinPeriod">검색 최소 구간</label><input id="scanMinPeriod" type="number" min="2" value="${merged.scanMinPeriod}" /></div>
        <div class="field"><label for="scanMaxPeriod">검색 최대 구간</label><input id="scanMaxPeriod" type="number" min="2" value="${merged.scanMaxPeriod}" /></div>
        <div class="field"><label for="minAngleDegree">최소 각도</label><input id="minAngleDegree" type="number" step="1" value="29" /></div>
        <div class="field"><label for="minRSquared">최소 결정계수</label><input id="minRSquared" type="number" step="0.05" value="${merged.minRSquared}" /></div>
        <div class="field"><label for="minReturnRate">최대 수익률</label><input id="minReturnRate" type="number" step="1" value="${merged.minReturnRate}" /></div>
        <button class="primary-button" id="runSearch" type="button">검색 실행</button>
      </div>
      <div class="summary-box">
        <div class="summary-row"><span>검색 종목 수</span><strong id="summaryTotal">-</strong></div>
        <div class="summary-row"><span>조건 만족 종목 수</span><strong id="summaryMatched">-</strong></div>
        <div class="summary-row"><span>검색 기준일</span><strong id="summaryDate">-</strong></div>
        <div class="summary-row"><span>데이터 소스</span><strong id="summarySource">-</strong></div>
        <div class="summary-row"><span>strict 45도 결과</span><strong id="summaryStrict">-</strong></div>
      </div>
    </aside>
    <main class="content">
      <div class="topbar">
        <h2 id="resultTitle">검색 결과</h2>
        <div class="toolbar">
          <select id="viewMode" aria-label="보기 모드">
            <option value="matches">검색 결과만</option>
            <option value="all">전체 종목</option>
          </select>
          <select id="sortKey" aria-label="정렬 기준">
            <option value="angle">각도 내림차순</option>
            <option value="returnRate">수익률 오름차순</option>
            <option value="rSquared">R² 내림차순</option>
            <option value="matchedPeriod">검색 구간 길이 내림차순</option>
          </select>
          <button class="ghost-button" id="downloadCsv" type="button">CSV 다운로드</button>
        </div>
      </div>
      <section class="result-list" id="resultList"></section>
    </main>
  </div>
  <div class="page-jump-controls" aria-label="페이지 이동">
    <button class="ghost-button" id="jumpTop" type="button">맨 위로</button>
    <button class="ghost-button" id="jumpBottom" type="button">맨 끝으로</button>
  </div>
  <div id="chart-tooltip"></div>
  <script type="application/json" id="payload">${escapeJsonForHtml(JSON.stringify(data))}</script>
  <script>${createClientScript()}</script>
</body>
</html>`;
};

export const saveChartHtml = (html, filePath) => {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, html, "utf8");
};

export { exportResultsToCsv, filterStrongDowntrendStocks, sortResults };
