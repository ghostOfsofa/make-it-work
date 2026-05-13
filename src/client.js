const COLORS = __COLORS__;
const DEFAULT_OPTIONS = __DEFAULT_OPTIONS__;
const DATA = JSON.parse(document.getElementById("payload").textContent);

let currentResults = DATA.demoResults;
let currentOptions = { ...DATA.options, minAngleDegree: 29 };
let viewState = new Map();
let dragState = null;

console.log("stocks preview", DATA.stocks.slice(0, 3));
console.table(currentResults);

const $ = (selector) => document.querySelector(selector);
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const formatPrice = (value) =>
  Number.isFinite(value) ? Math.round(value).toLocaleString("ko-KR") : "-";
const formatNumber = (value, digits = 2) =>
  Number.isFinite(value) ? round(value, digits).toLocaleString("ko-KR") : "-";
const formatPercent = (value, digits = 2) =>
  Number.isFinite(value)
    ? `${value > 0 ? "+" : ""}${round(value, digits).toFixed(digits)}%`
    : "-";
const formatDateLabel = (date) => {
  const parts = String(date ?? "").split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : String(date ?? "");
};
const formatDateRangeLabel = (date) => String(date ?? "").replaceAll("-", "/");
const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function getSelectedPrice(candle) {
  return candle.close >= candle.open ? candle.close : candle.open;
}

function getValidCandlesSortedByDate(prices) {
  return (prices || [])
    .filter((candle) =>
      [candle.open, candle.high, candle.low, candle.close].every(
        (value) => Number.isFinite(value) && value > 0,
      ),
    )
    .map((candle) => ({
      ...candle,
      high: Math.max(candle.high, candle.open, candle.close),
      low: Math.min(candle.low, candle.open, candle.close),
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function getRecentCandles(prices, renderPeriod) {
  return getValidCandlesSortedByDate(prices).slice(-renderPeriod);
}

function getPlotSize(options) {
  const margin = { ...DEFAULT_OPTIONS.margin, ...(options.margin || {}) };
  return {
    chartWidth: options.chartWidth,
    chartHeight: options.chartHeight,
    margin,
    plotWidth: options.chartWidth - margin.left - margin.right,
    plotHeight: options.chartHeight - margin.top - margin.bottom,
  };
}

function calculatePriceRange(candles, selectedPrices = []) {
  const values = [
    ...candles.flatMap((candle) => [
      candle.open,
      candle.high,
      candle.low,
      candle.close,
    ]),
    ...selectedPrices,
  ].filter(Number.isFinite);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax) || rawMin === rawMax) {
    return { minPrice: NaN, maxPrice: NaN };
  }
  const padding = Math.max((rawMax - rawMin) * 0.05, rawMax * 0.005, 1);
  return { minPrice: Math.max(1, rawMin - padding), maxPrice: rawMax + padding };
}

function priceToY(price, minPrice, maxPrice, plotHeight, marginTop = 0) {
  return marginTop + ((maxPrice - price) / (maxPrice - minPrice)) * plotHeight;
}

function createRenderPoints(candles, options) {
  const { margin, plotWidth, plotHeight } = getPlotSize(options);
  const selectedPrices = candles.map(getSelectedPrice);
  const { minPrice, maxPrice } = calculatePriceRange(candles, selectedPrices);
  return candles.map((candle, index) => ({
    index,
    date: candle.date,
    selectedPrice: getSelectedPrice(candle),
    xPixel: margin.left + (index / Math.max(candles.length - 1, 1)) * plotWidth,
    yPixel: priceToY(
      getSelectedPrice(candle),
      minPrice,
      maxPrice,
      plotHeight,
      margin.top,
    ),
  }));
}

function calculateLinearRegressionByPoints(points) {
  const n = points.length;
  const sumX = points.reduce((sum, point) => sum + point.xPixel, 0);
  const sumY = points.reduce((sum, point) => sum + point.yPixel, 0);
  const sumXY = points.reduce((sum, point) => sum + point.xPixel * point.yPixel, 0);
  const sumXX = points.reduce((sum, point) => sum + point.xPixel * point.xPixel, 0);
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return { slopePixel: NaN, intercept: NaN };
  const slopePixel = (n * sumXY - sumX * sumY) / denominator;
  return { slopePixel, intercept: (sumY - slopePixel * sumX) / n };
}

function calculateRSquaredByPoints(points, slope, intercept) {
  const meanY = points.reduce((sum, point) => sum + point.yPixel, 0) / points.length;
  const total = points.reduce((sum, point) => sum + (point.yPixel - meanY) ** 2, 0);
  const residual = points.reduce(
    (sum, point) => sum + (point.yPixel - (slope * point.xPixel + intercept)) ** 2,
    0,
  );
  return total === 0 ? NaN : 1 - residual / total;
}

function analyzePeriod(scanCandles, scanPoints) {
  const selectedPrices = scanCandles.map(getSelectedPrice);
  const { slopePixel, intercept } = calculateLinearRegressionByPoints(scanPoints);
  const rSquared = calculateRSquaredByPoints(scanPoints, slopePixel, intercept);
  return {
    matchedPeriod: scanCandles.length,
    scanStartDate: scanCandles[0].date,
    scanEndDate: scanCandles.at(-1).date,
    slopePixel,
    intercept,
    angleDegree: Math.atan(slopePixel) * (180 / Math.PI),
    rSquared,
    returnRate:
      ((selectedPrices.at(-1) - selectedPrices[0]) / selectedPrices[0]) * 100,
    firstPrice: selectedPrices[0],
    lastPrice: selectedPrices.at(-1),
  };
}

function filterStocks(stocks, options) {
  return stocks
    .map((stock) => {
      const candles = getRecentCandles(stock.prices, options.renderPeriod);
      if (candles.length < options.scanMinPeriod) return null;
      const renderPoints = createRenderPoints(candles, options);
      const maxPeriod = Math.min(options.scanMaxPeriod, candles.length);
      const matches = [];

      for (
        let period = Math.min(options.scanMinPeriod, maxPeriod);
        period <= maxPeriod;
        period += 1
      ) {
        const match = analyzePeriod(candles.slice(-period), renderPoints.slice(-period));
        const valid =
          Number.isFinite(match.slopePixel) &&
          Number.isFinite(match.angleDegree) &&
          Number.isFinite(match.rSquared) &&
          match.slopePixel > 0 &&
          match.angleDegree >= options.minAngleDegree &&
          match.rSquared >= options.minRSquared &&
          match.returnRate <= options.minReturnRate;
        if (valid) matches.push(match);
      }

      if (matches.length === 0) return null;
      const best = matches.sort(
        (a, b) =>
          b.angleDegree - a.angleDegree ||
          b.rSquared - a.rSquared ||
          a.returnRate - b.returnRate ||
          b.matchedPeriod - a.matchedPeriod,
      )[0];
      const last = candles.at(-1);
      const prev = candles.at(-2);

      return {
        code: stock.code,
        name: stock.name,
        market: stock.market ?? "UNKNOWN",
        type: stock.patternType ?? stock.type,
        patternType: stock.patternType ?? stock.type,
        lastClose: last.close,
        dailyChangeRate: prev ? ((last.close - prev.close) / prev.close) * 100 : NaN,
        ...best,
        slopePixel: round(best.slopePixel, 4),
        angleDegree: round(best.angleDegree, 2),
        rSquared: round(best.rSquared, 4),
        returnRate: round(best.returnRate, 2),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.angleDegree - a.angleDegree);
}

function sortResults(results, key) {
  const numeric = (value, fallback = Number.NEGATIVE_INFINITY) =>
    Number.isFinite(value) ? value : fallback;
  const sorters = {
    angle: (a, b) =>
      numeric(b.angleDegree) - numeric(a.angleDegree) ||
      String(a.code).localeCompare(String(b.code)),
    returnRate: (a, b) =>
      numeric(a.returnRate, Number.POSITIVE_INFINITY) -
        numeric(b.returnRate, Number.POSITIVE_INFINITY) ||
      String(a.code).localeCompare(String(b.code)),
    rSquared: (a, b) =>
      numeric(b.rSquared) - numeric(a.rSquared) ||
      String(a.code).localeCompare(String(b.code)),
    matchedPeriod: (a, b) =>
      numeric(b.matchedPeriod) - numeric(a.matchedPeriod) ||
      String(a.code).localeCompare(String(b.code)),
  };
  return [...results].sort(sorters[key] ?? sorters.angle);
}

function toCsv(results) {
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
  ];
  return [
    columns.join(","),
    ...results.map((result) =>
      columns
        .map((column) => `"${String(result[column] ?? "").replaceAll('"', '""')}"`)
        .join(","),
    ),
  ].join("\n");
}

function calculateNicePriceTicks(minPrice, maxPrice, tickCount = 6) {
  const roughStep = (maxPrice - minPrice) / Math.max(tickCount - 1, 1);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const residual = roughStep / magnitude;
  const step = residual >= 5 ? 5 * magnitude : residual >= 2 ? 2 * magnitude : magnitude;
  const ticks = [];
  for (
    let value = Math.ceil(minPrice / step) * step;
    value <= maxPrice + step * 0.5;
    value += step
  ) {
    ticks.push(value);
  }
  return ticks.slice(0, 8);
}

function movingAverage(candles, period) {
  return candles.map((_, index) => {
    if (index + 1 < period) return null;
    return (
      candles
        .slice(index + 1 - period, index + 1)
        .reduce((sum, candle) => sum + candle.close, 0) / period
    );
  });
}

function linePoints(values, candles, minPrice, maxPrice, plotWidth, plotHeight, margin) {
  return values
    .map((value, index) => {
      if (!Number.isFinite(value)) return null;
      const x = margin.left + (index / Math.max(candles.length - 1, 1)) * plotWidth;
      const y = priceToY(value, minPrice, maxPrice, plotHeight, margin.top);
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(" ");
}

function createCloud(candles, minPrice, maxPrice, plotWidth, plotHeight, margin) {
  const ma20 = movingAverage(candles, 20);
  const ma60 = movingAverage(candles, 60);
  const upper = ma20.map((value, index) =>
    Number.isFinite(value) && Number.isFinite(ma60[index])
      ? Math.max(value, ma60[index])
      : null,
  );
  const lower = ma20.map((value, index) =>
    Number.isFinite(value) && Number.isFinite(ma60[index])
      ? Math.min(value, ma60[index])
      : null,
  );
  const upperPoints = linePoints(
    upper,
    candles,
    minPrice,
    maxPrice,
    plotWidth,
    plotHeight,
    margin,
  );
  const lowerPoints = linePoints(
    [...lower].reverse(),
    [...candles].reverse(),
    minPrice,
    maxPrice,
    plotWidth,
    plotHeight,
    margin,
  );
  const points = `${upperPoints} ${lowerPoints}`.trim();
  return points
    ? `<polygon points="${points}" fill="${COLORS.cloud}" opacity="0.18" />`
    : "";
}

function chartSvg(result) {
  const state = viewState.get(result.code) || {
    renderPeriod: currentOptions.renderPeriod,
    offset: 0,
  };
  const stock = DATA.stocks.find((item) => item.code === result.code);
  const allCandles = getValidCandlesSortedByDate(stock.prices);
  const renderPeriod = Math.max(30, Math.min(200, state.renderPeriod));
  const maxOffset = Math.max(0, allCandles.length - renderPeriod);
  const offset = Math.max(0, Math.min(maxOffset, state.offset));
  const end = allCandles.length - offset;
  const candles = allCandles.slice(Math.max(0, end - renderPeriod), end);
  const options = { ...currentOptions, renderPeriod: candles.length };
  const selectedPrices = candles.map(getSelectedPrice);
  const { minPrice, maxPrice } = calculatePriceRange(candles, selectedPrices);
  const renderPoints = createRenderPoints(candles, options);
  const { chartWidth, chartHeight, margin, plotWidth, plotHeight } = getPlotSize(options);
  const slotWidth = plotWidth / Math.max(candles.length, 1);
  const candleWidth = Math.max(2, Math.min(18, slotWidth * 0.8));
  const ticks = calculateNicePriceTicks(minPrice, maxPrice, 7);
  const hasMatch =
    Number.isFinite(result.matchedPeriod) &&
    result.matchedPeriod > 1 &&
    Number.isFinite(result.slopePixel);
  const matched = hasMatch ? Math.min(result.matchedPeriod, candles.length) : 0;
  const scanPoints = hasMatch ? renderPoints.slice(-matched) : [];
  const regression = hasMatch ? analyzePeriod(candles.slice(-matched), scanPoints) : null;
  const x1 = scanPoints[0]?.xPixel ?? margin.left;
  const x2 = scanPoints.at(-1)?.xPixel ?? chartWidth - margin.right;
  const y1 = regression ? regression.slopePixel * x1 + regression.intercept : 0;
  const y2 = regression ? regression.slopePixel * x2 + regression.intercept : 0;
  const matchStartIndex = hasMatch ? Math.max(0, candles.length - matched) : candles.length;
  const matchStartX =
    margin.left + (matchStartIndex / Math.max(candles.length - 1, 1)) * plotWidth;
  const matchedWidth = hasMatch ? chartWidth - margin.right - matchStartX : 0;

  const grid = ticks
    .map((tick) => {
      const y = priceToY(tick, minPrice, maxPrice, plotHeight, margin.top);
      return `<line x1="${margin.left}" y1="${y}" x2="${
        chartWidth - margin.right
      }" y2="${y}" stroke="${COLORS.grid}" /><text x="${
        chartWidth - margin.right + 12
      }" y="${y + 4}" fill="${COLORS.text}" font-size="18">${formatPrice(tick)}</text>`;
    })
    .join("");

  const verticalGrid = Array.from({ length: 6 }, (_, index) => {
    const x = margin.left + (index / 5) * plotWidth;
    return `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${
      chartHeight - margin.bottom
    }" stroke="${COLORS.grid}" />`;
  }).join("");

  const movingAverageLines = [
    [5, COLORS.ma5],
    [20, COLORS.ma20],
    [60, COLORS.ma60],
    [120, COLORS.ma120],
  ]
    .map(([period, color]) => {
      const points = linePoints(
        movingAverage(candles, period),
        candles,
        minPrice,
        maxPrice,
        plotWidth,
        plotHeight,
        margin,
      );
      return points
        ? `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" opacity="0.9" />`
        : "";
    })
    .join("");

  const candleElements = candles
    .map((candle, index) => {
      const x = margin.left + (index / Math.max(candles.length - 1, 1)) * plotWidth;
      const color = candle.close >= candle.open ? COLORS.bullish : COLORS.bearish;
      const highY = priceToY(candle.high, minPrice, maxPrice, plotHeight, margin.top);
      const lowY = priceToY(candle.low, minPrice, maxPrice, plotHeight, margin.top);
      const openY = priceToY(candle.open, minPrice, maxPrice, plotHeight, margin.top);
      const closeY = priceToY(candle.close, minPrice, maxPrice, plotHeight, margin.top);
      const bodyY = Math.min(openY, closeY);
      const bodyHeight = Math.max(1, Math.abs(closeY - openY));
      const prevClose = candles[index - 1]?.close;
      const changeRate = prevClose
        ? ((candle.close - prevClose) / prevClose) * 100
        : "";

      return `<line x1="${x}" y1="${highY}" x2="${x}" y2="${lowY}" stroke="${color}" stroke-width="1.4" /><rect x="${
        x - candleWidth / 2
      }" y="${bodyY}" width="${candleWidth}" height="${bodyHeight}" fill="${color}" stroke="${color}" /><rect class="candle-hover-area" x="${
        x - slotWidth / 2
      }" y="${margin.top}" width="${slotWidth}" height="${plotHeight}" fill="transparent" data-date="${
        candle.date
      }" data-open="${candle.open}" data-high="${candle.high}" data-low="${
        candle.low
      }" data-close="${candle.close}" data-prev-close="${
        prevClose ?? ""
      }" data-change-rate="${changeRate}" />`;
    })
    .join("");

  const xLabels = [
    ...new Set(
      Array.from({ length: 5 }, (_, index) =>
        Math.round((index / 4) * Math.max(candles.length - 1, 0)),
      ),
    ),
  ]
    .map((index) => {
      const x = margin.left + (index / Math.max(candles.length - 1, 1)) * plotWidth;
      return `<text x="${x}" y="${
        chartHeight - 24
      }" fill="${COLORS.text}" font-size="18" text-anchor="middle">${formatDateLabel(
        candles[index]?.date,
      )}</text>`;
    })
    .join("");

  const selectedLine = renderPoints.map((point) => `${point.xPixel},${point.yPixel}`).join(" ");
  const last = candles.at(-1);
  const lastY = priceToY(last.close, minPrice, maxPrice, plotHeight, margin.top);
  const lastColor = last.close >= candles.at(-2)?.close ? COLORS.bullish : COLORS.bearish;

  viewState.set(result.code, { renderPeriod, offset });

  return `<svg class="kiwoom-chart" viewBox="0 0 ${chartWidth} ${chartHeight}" data-code="${
    result.code
  }">
    <rect width="${chartWidth}" height="${chartHeight}" fill="${COLORS.background}" />
    <rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" fill="${COLORS.background}" />
    ${grid}${verticalGrid}
    ${
      hasMatch && currentOptions.showMatchedArea
        ? `<rect x="${matchStartX}" y="${margin.top}" width="${matchedWidth}" height="${plotHeight}" fill="${COLORS.matchedArea}" />`
        : ""
    }
    ${createCloud(candles, minPrice, maxPrice, plotWidth, plotHeight, margin)}
    ${movingAverageLines}
    ${candleElements}
    ${
      currentOptions.showSelectedPriceLine
        ? `<polyline points="${selectedLine}" fill="none" stroke="${COLORS.selectedLine}" stroke-width="2" stroke-dasharray="8 8" />`
        : ""
    }
    ${
      hasMatch && currentOptions.showRegressionLine
        ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${COLORS.regression}" stroke-width="3" />`
        : ""
    }
    <line x1="${margin.left}" y1="${chartHeight - margin.bottom}" x2="${
      chartWidth - margin.right
    }" y2="${chartHeight - margin.bottom}" stroke="${COLORS.axis}" />
    <line x1="${chartWidth - margin.right}" y1="${margin.top}" x2="${
      chartWidth - margin.right
    }" y2="${chartHeight - margin.bottom}" stroke="${COLORS.axis}" />
    ${xLabels}
    <rect x="${chartWidth - margin.right + 4}" y="${
      lastY - 14
    }" width="78" height="28" rx="4" fill="${lastColor}" />
    <text x="${chartWidth - margin.right + 43}" y="${
      lastY + 6
    }" fill="#fff" font-size="16" text-anchor="middle">${formatPrice(last.close)}</text>
    <text x="${margin.left + 12}" y="${margin.top + 28}" fill="${
      COLORS.text
    }" font-size="22" font-weight="700">${escapeHtml(result.name)} ${escapeHtml(
      result.code,
    )}</text>
    <text x="${margin.left + 12}" y="${margin.top + 58}" fill="${
      COLORS.text
    }" font-size="17">${
      hasMatch
        ? `검색 구간 ${result.matchedPeriod}일 (${formatDateRangeLabel(
            result.scanStartDate,
          )} ~ ${formatDateRangeLabel(result.scanEndDate)})`
        : "검색 조건 미충족"
    } · 표시 ${candles.length}봉</text>
  </svg>`;
}

function createStockResult(stock) {
  const candles = getRecentCandles(stock.prices, currentOptions.renderPeriod);
  const last = candles.at(-1);
  const prev = candles.at(-2);
  return {
    code: stock.code,
    name: stock.name,
    market: stock.market ?? "UNKNOWN",
    type: stock.patternType,
    patternType: stock.patternType,
    lastClose: last?.close,
    dailyChangeRate: prev ? ((last.close - prev.close) / prev.close) * 100 : NaN,
    matchedPeriod: NaN,
    scanStartDate: "",
    scanEndDate: "",
    angleDegree: NaN,
    slopePixel: NaN,
    rSquared: NaN,
    returnRate: NaN,
  };
}

function getDisplayedResults() {
  if ($("#viewMode").value !== "all") return currentResults;
  const matchedByCode = new Map(currentResults.map((result) => [result.code, result]));
  return DATA.stocks.map((stock) => matchedByCode.get(stock.code) ?? createStockResult(stock));
}

function createCard(result, index) {
  const rateClass =
    result.dailyChangeRate > 0 ? "up" : result.dailyChangeRate < 0 ? "down" : "flat";
  return `<article class="stock-card" data-code="${result.code}">
    <header class="card-header">
      <div class="identity"><span class="rank">${index + 1}</span><div><div class="name">${escapeHtml(
        result.name,
      )}</div><div class="code">${escapeHtml(result.code)} · ${escapeHtml(
        result.market ?? "UNKNOWN",
      )} · ${escapeHtml(
        result.patternType ?? result.type ?? "",
      )}</div></div></div>
      <div class="metric"><span>마지막 가격</span><strong>${formatPrice(
        result.lastClose,
      )}</strong></div>
      <div class="metric"><span>당일 등락률</span><strong class="${rateClass}">${formatPercent(
        result.dailyChangeRate,
      )}</strong></div>
      <div class="metric"><span>검색 구간</span><strong>${
        Number.isFinite(result.matchedPeriod) ? `${result.matchedPeriod}일` : "-"
      }</strong></div>
      <div class="metric"><span>수익률</span><strong class="down">${formatPercent(
        result.returnRate,
      )}</strong></div>
    </header>
    <div class="chart-wrap">${chartSvg(result)}</div>
  </article>`;
}

function render() {
  const displayedResults = getDisplayedResults();
  const sorted = sortResults(displayedResults, $("#sortKey").value);
  const isAllMode = $("#viewMode").value === "all";
  $("#resultTitle").textContent = isAllMode
    ? `전체 종목: ${DATA.stocks.length}개 종목`
    : `검색 결과: ${currentResults.length}개 종목`;
  $("#summaryTotal").textContent = DATA.stocks.length.toLocaleString("ko-KR");
  $("#summaryMatched").textContent = currentResults.length.toLocaleString("ko-KR");
  $("#summaryDate").textContent = DATA.baseDate;
  $("#summarySource").textContent = DATA.dataSource;
  $("#summaryStrict").textContent = DATA.strictResults.length.toLocaleString("ko-KR");
  $("#resultList").innerHTML = sorted.length
    ? sorted.map(createCard).join("")
    : `<div class="empty-state">조건을 만족하는 종목이 없습니다.</div>`;
}

function readOptions() {
  return {
    ...DEFAULT_OPTIONS,
    renderPeriod: Number($("#renderPeriod").value),
    scanMinPeriod: Number($("#scanMinPeriod").value),
    scanMaxPeriod: Number($("#scanMaxPeriod").value),
    minAngleDegree: Number($("#minAngleDegree").value),
    minRSquared: Number($("#minRSquared").value),
    minReturnRate: Number($("#minReturnRate").value),
    showSelectedPriceLine: true,
    showRegressionLine: true,
    showMatchedArea: true,
    showCandleWick: true,
  };
}

function buildTooltipHtml(dataset) {
  const prevClose = Number(dataset.prevClose);
  const getRate = (value) =>
    Number.isFinite(prevClose) && prevClose > 0
      ? ((Number(value) - prevClose) / prevClose) * 100
      : Number.NaN;
  const formatRate = (rate) => {
    const cls = !Number.isFinite(rate)
      ? "flat"
      : rate > 0
        ? "up"
        : rate < 0
          ? "down"
          : "flat";
    return `<em class="${cls}">${Number.isFinite(rate) ? formatPercent(rate) : "N/A"}</em>`;
  };
  const openRate = getRate(dataset.open);
  const highRate = getRate(dataset.high);
  const lowRate = getRate(dataset.low);
  const closeRate = getRate(dataset.close);

  return `<strong>${dataset.date}</strong><span>시가: ${formatPrice(
    Number(dataset.open),
  )} (${formatRate(openRate)})</span><span>고가: ${formatPrice(
    Number(dataset.high),
  )} (${formatRate(highRate)})</span><span>저가: ${formatPrice(
    Number(dataset.low),
  )} (${formatRate(lowRate)})</span><span>종가: ${formatPrice(
    Number(dataset.close),
  )} (${formatRate(closeRate)})</span>`;
}

document.addEventListener("mousemove", (event) => {
  const target = event.target.closest(".candle-hover-area");
  const tooltip = $("#chart-tooltip");
  if (!target) return;
  tooltip.innerHTML = buildTooltipHtml(target.dataset);
  tooltip.style.left = `${event.clientX + 12}px`;
  tooltip.style.top = `${event.clientY + 12}px`;
  tooltip.style.display = "block";
});

document.addEventListener("mouseout", (event) => {
  if (event.target?.classList?.contains("candle-hover-area")) {
    $("#chart-tooltip").style.display = "none";
  }
});

document.addEventListener(
  "wheel",
  (event) => {
    const svg = event.target.closest(".kiwoom-chart");
    if (!svg) return;
    if (!event.ctrlKey && !event.altKey) return;
    event.preventDefault();
    const code = svg.dataset.code;
    const state = viewState.get(code) || {
      renderPeriod: currentOptions.renderPeriod,
      offset: 0,
    };
    const next = Math.max(
      30,
      Math.min(200, state.renderPeriod + (event.deltaY < 0 ? -10 : 10)),
    );
    viewState.set(code, { ...state, renderPeriod: next });
    render();
  },
  { passive: false },
);

document.addEventListener("pointerdown", (event) => {
  const svg = event.target.closest(".kiwoom-chart");
  if (!svg) return;
  if (event.button !== 0) return;
  svg.setPointerCapture(event.pointerId);
  const state = viewState.get(svg.dataset.code) || {
    renderPeriod: currentOptions.renderPeriod,
    offset: 0,
  };
  dragState = {
    code: svg.dataset.code,
    startX: event.clientX,
    startOffset: state.offset,
    renderPeriod: state.renderPeriod,
  };
});

document.addEventListener("pointermove", (event) => {
  if (!dragState) return;
  const stock = DATA.stocks.find((item) => item.code === dragState.code);
  const allCandles = getValidCandlesSortedByDate(stock.prices);
  const pixelPerCandle = Math.max(4, 1480 / dragState.renderPeriod);
  const delta = Math.round((event.clientX - dragState.startX) / pixelPerCandle);
  const maxOffset = Math.max(0, allCandles.length - dragState.renderPeriod);
  viewState.set(dragState.code, {
    renderPeriod: dragState.renderPeriod,
    offset: Math.max(0, Math.min(maxOffset, dragState.startOffset + delta)),
  });
  render();
});

document.addEventListener("pointerup", () => {
  dragState = null;
});

$("#runSearch").addEventListener("click", () => {
  currentOptions = readOptions();
  currentResults = filterStocks(DATA.stocks, currentOptions);
  console.table(currentResults);
  viewState = new Map();
  render();
});

$("#sortKey").addEventListener("change", render);
$("#viewMode").addEventListener("change", render);

$("#downloadCsv").addEventListener("click", () => {
  const blob = new Blob([toCsv(sortResults(currentResults, $("#sortKey").value))], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "downtrend-results.csv";
  anchor.click();
  URL.revokeObjectURL(url);
});

$("#jumpTop").addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

$("#jumpBottom").addEventListener("click", () => {
  window.scrollTo({
    top: document.documentElement.scrollHeight,
    behavior: "smooth",
  });
});

render();
