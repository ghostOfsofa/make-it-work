import { clamp, round } from "./utils.js";

export const DEFAULT_OPTIONS = Object.freeze({
  renderPeriod: 80,
  scanMinPeriod: 10,
  scanMaxPeriod: 60,
  chartWidth: 1600,
  chartHeight: 900,
  margin: {
    top: 40,
    right: 90,
    bottom: 60,
    left: 30,
  },
  minAngleDegree: 29,
  minReturnRate: -5,
  minRSquared: 0.5,
  showSelectedPriceLine: true,
  showRegressionLine: true,
  showMatchedArea: true,
  showCandleWick: true,
});

export const getSelectedPrice = (candle) =>
  candle.close >= candle.open ? candle.close : candle.open;

export const isValidNumber = (value) =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export const normalizeCandle = (candle) => {
  if (
    candle == null ||
    !isValidNumber(candle.open) ||
    !isValidNumber(candle.high) ||
    !isValidNumber(candle.low) ||
    !isValidNumber(candle.close)
  ) {
    return null;
  }

  const high = Math.max(candle.high, candle.open, candle.close);
  const low = Math.min(candle.low, candle.open, candle.close);

  if (!isValidNumber(high) || !isValidNumber(low)) {
    return null;
  }

  return {
    date: String(candle.date ?? ""),
    open: candle.open,
    high,
    low,
    close: candle.close,
    volume: Number.isFinite(candle.volume) && candle.volume >= 0 ? candle.volume : 0,
  };
};

export const getValidCandlesSortedByDate = (prices) => {
  if (!Array.isArray(prices)) return [];
  return prices
    .map(normalizeCandle)
    .filter(Boolean)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
};

export const getRecentCandles = (prices, renderPeriod) => {
  const candles = getValidCandlesSortedByDate(prices);
  const safeRenderPeriod = Math.max(2, Math.floor(renderPeriod));
  return candles.slice(-safeRenderPeriod);
};

export const getPlotSize = (options = {}) => {
  const merged = mergeOptions(options);
  const { chartWidth, chartHeight, margin } = merged;
  return {
    chartWidth,
    chartHeight,
    margin,
    plotWidth: chartWidth - margin.left - margin.right,
    plotHeight: chartHeight - margin.top - margin.bottom,
  };
};

export const calculatePriceRange = (candles, selectedPrices = []) => {
  const values = [
    ...candles.flatMap((candle) => [
      candle.open,
      candle.high,
      candle.low,
      candle.close,
    ]),
    ...selectedPrices,
  ].filter(Number.isFinite);

  if (values.length === 0) {
    return { minPrice: Number.NaN, maxPrice: Number.NaN };
  }

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  if (rawMax === rawMin) {
    return { minPrice: Number.NaN, maxPrice: Number.NaN };
  }

  const padding = Math.max((rawMax - rawMin) * 0.05, rawMax * 0.005, 1);
  return {
    minPrice: Math.max(1, rawMin - padding),
    maxPrice: rawMax + padding,
  };
};

export const priceToY = (price, minPrice, maxPrice, plotHeight, marginTop = 0) => {
  if (
    !Number.isFinite(price) ||
    !Number.isFinite(minPrice) ||
    !Number.isFinite(maxPrice) ||
    !Number.isFinite(plotHeight) ||
    maxPrice === minPrice
  ) {
    return Number.NaN;
  }

  return marginTop + ((maxPrice - price) / (maxPrice - minPrice)) * plotHeight;
};

export const createRenderPoints = (candles, options = {}) => {
  const merged = mergeOptions(options);
  const { margin, plotWidth, plotHeight } = getPlotSize(merged);
  const selectedPrices = candles.map(getSelectedPrice);
  const { minPrice, maxPrice } = calculatePriceRange(candles, selectedPrices);

  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || candles.length < 2) {
    return [];
  }

  return candles.map((candle, index) => {
    const xPixel =
      margin.left + (index / Math.max(candles.length - 1, 1)) * plotWidth;
    const selectedPrice = getSelectedPrice(candle);

    return {
      index,
      date: candle.date,
      selectedPrice,
      xPixel,
      yPixel: priceToY(
        selectedPrice,
        minPrice,
        maxPrice,
        plotHeight,
        margin.top,
      ),
    };
  });
};

export const analyzeDowntrendPeriod = (scanCandles, scanPoints) => {
  const selectedPrices = scanCandles.map(getSelectedPrice);
  const { slopePixel, intercept } = calculateLinearRegressionByPoints(scanPoints);
  const rSquared = calculateRSquaredByPoints(scanPoints, slopePixel, intercept);
  const angleDegree = calculateAngleDegree(slopePixel);
  const returnRate = calculateReturnRate(selectedPrices);

  return {
    matchedPeriod: scanCandles.length,
    scanStartDate: scanCandles[0]?.date,
    scanEndDate: scanCandles.at(-1)?.date,
    slopePixel,
    intercept,
    angleDegree,
    rSquared,
    returnRate,
    firstPrice: selectedPrices[0],
    lastPrice: selectedPrices.at(-1),
  };
};

export const scanDowntrendPeriods = (candles, renderPoints, options = {}) => {
  const merged = mergeOptions(options);
  const maxPeriod = Math.min(merged.scanMaxPeriod, candles.length, renderPoints.length);
  const minPeriod = Math.min(merged.scanMinPeriod, maxPeriod);
  const matches = [];

  if (minPeriod < 2 || candles.length < merged.scanMinPeriod) {
    return matches;
  }

  for (let period = minPeriod; period <= maxPeriod; period += 1) {
    const scanCandles = candles.slice(-period);
    const scanPoints = renderPoints.slice(-period);
    const analysis = analyzeDowntrendPeriod(scanCandles, scanPoints, merged);

    const valid =
      Number.isFinite(analysis.slopePixel) &&
      Number.isFinite(analysis.angleDegree) &&
      Number.isFinite(analysis.rSquared) &&
      analysis.slopePixel > 0 &&
      analysis.angleDegree >= merged.minAngleDegree &&
      analysis.rSquared >= merged.minRSquared &&
      analysis.returnRate <= merged.minReturnRate;

    if (valid) matches.push(analysis);
  }

  return matches;
};

export const calculateLinearRegressionByPoints = (points) => {
  if (!Array.isArray(points) || points.length < 2) {
    return { slopePixel: Number.NaN, intercept: Number.NaN };
  }

  const n = points.length;
  const sumX = points.reduce((sum, point) => sum + point.xPixel, 0);
  const sumY = points.reduce((sum, point) => sum + point.yPixel, 0);
  const sumXY = points.reduce(
    (sum, point) => sum + point.xPixel * point.yPixel,
    0,
  );
  const sumXX = points.reduce(
    (sum, point) => sum + point.xPixel * point.xPixel,
    0,
  );

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) {
    return { slopePixel: Number.NaN, intercept: Number.NaN };
  }

  const slopePixel = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slopePixel * sumX) / n;
  return { slopePixel, intercept };
};

export const calculateRSquaredByPoints = (points, slope, intercept) => {
  if (!Array.isArray(points) || points.length < 2) return Number.NaN;
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return Number.NaN;

  const meanY =
    points.reduce((sum, point) => sum + point.yPixel, 0) / points.length;
  const totalSumSquares = points.reduce(
    (sum, point) => sum + (point.yPixel - meanY) ** 2,
    0,
  );
  const residualSumSquares = points.reduce((sum, point) => {
    const predictedY = slope * point.xPixel + intercept;
    return sum + (point.yPixel - predictedY) ** 2;
  }, 0);

  if (totalSumSquares === 0) return Number.NaN;
  return 1 - residualSumSquares / totalSumSquares;
};

export const calculateAngleDegree = (slopePixel) =>
  Math.atan(slopePixel) * (180 / Math.PI);

export const calculateReturnRate = (selectedPrices) => {
  if (!Array.isArray(selectedPrices) || selectedPrices.length < 2) {
    return Number.NaN;
  }

  const firstPrice = selectedPrices[0];
  const lastPrice = selectedPrices.at(-1);
  if (!Number.isFinite(firstPrice) || firstPrice <= 0 || !Number.isFinite(lastPrice)) {
    return Number.NaN;
  }

  return ((lastPrice - firstPrice) / firstPrice) * 100;
};

export const pickBestDowntrendMatch = (matches) => {
  if (!Array.isArray(matches) || matches.length === 0) return null;
  return [...matches].sort((a, b) => {
    if (b.angleDegree !== a.angleDegree) return b.angleDegree - a.angleDegree;
    if (b.rSquared !== a.rSquared) return b.rSquared - a.rSquared;
    if (a.returnRate !== b.returnRate) return a.returnRate - b.returnRate;
    return b.matchedPeriod - a.matchedPeriod;
  })[0];
};

export const filterStrongDowntrendStocks = (stocks, options = {}) => {
  const merged = mergeOptions(options);

  return stocks
    .map((stock) => {
      const candles = getRecentCandles(stock.prices, merged.renderPeriod);
      if (candles.length < merged.scanMinPeriod) return null;

      const selectedPrices = candles.map(getSelectedPrice);
      const range = calculatePriceRange(candles, selectedPrices);
      if (!Number.isFinite(range.minPrice) || !Number.isFinite(range.maxPrice)) {
        return null;
      }

      const renderPoints = createRenderPoints(candles, merged);
      const matches = scanDowntrendPeriods(candles, renderPoints, merged);
      const bestMatch = pickBestDowntrendMatch(matches);
      if (!bestMatch) return null;

      const lastCandle = candles.at(-1);
      const prevCandle = candles.at(-2);
      const dailyChangeRate =
        prevCandle?.close > 0
          ? ((lastCandle.close - prevCandle.close) / prevCandle.close) * 100
          : Number.NaN;

      return {
        code: stock.code,
        name: stock.name,
        market: stock.market ?? "UNKNOWN",
        type: stock.patternType ?? stock.type,
        patternType: stock.patternType ?? stock.type,
        renderPeriod: candles.length,
        lastClose: lastCandle.close,
        dailyChangeRate,
        ...bestMatch,
        prices: stock.prices,
        renderCandles: candles,
        scanCandles: candles.slice(-bestMatch.matchedPeriod),
        regressionLine: {
          slopePixel: bestMatch.slopePixel,
          intercept: bestMatch.intercept,
        },
        slopePixel: round(bestMatch.slopePixel, 4),
        angleDegree: round(bestMatch.angleDegree, 2),
        rSquared: round(bestMatch.rSquared, 4),
        returnRate: round(bestMatch.returnRate, 2),
        firstPrice: round(bestMatch.firstPrice, 2),
        lastPrice: round(bestMatch.lastPrice, 2),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.angleDegree - a.angleDegree);
};

export const sortResults = (results, sortKey = "angle") => {
  const sorted = [...results];
  const sorters = {
    angle: (a, b) => b.angleDegree - a.angleDegree,
    returnRate: (a, b) => a.returnRate - b.returnRate,
    rSquared: (a, b) => b.rSquared - a.rSquared,
    matchedPeriod: (a, b) => b.matchedPeriod - a.matchedPeriod,
  };
  return sorted.sort(sorters[sortKey] ?? sorters.angle);
};

export const exportResultsToCsv = (results) => {
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
  const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [
    columns.join(","),
    ...results.map((result) => columns.map((column) => escapeCsv(result[column])).join(",")),
  ].join("\n");
};

export const mergeOptions = (options = {}) => {
  const margin = { ...DEFAULT_OPTIONS.margin, ...(options.margin ?? {}) };
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    margin,
    renderPeriod: clamp(
      Math.floor(options.renderPeriod ?? DEFAULT_OPTIONS.renderPeriod),
      2,
      500,
    ),
    scanMinPeriod: Math.max(
      2,
      Math.floor(options.scanMinPeriod ?? DEFAULT_OPTIONS.scanMinPeriod),
    ),
    scanMaxPeriod: Math.max(
      2,
      Math.floor(options.scanMaxPeriod ?? DEFAULT_OPTIONS.scanMaxPeriod),
    ),
  };
};
