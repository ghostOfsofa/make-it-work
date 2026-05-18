import { clamp, round } from "./utils.js";

export const DEFAULT_OPTIONS = Object.freeze({
  renderPeriod: 80,
  scanMinPeriod: 10,
  scanMaxPeriod: 60,
  chartWidth: 1600,
  chartHeight: 900,
  rightPaddingBars: 5,
  margin: {
    top: 40,
    right: 90,
    bottom: 60,
    left: 30,
  },
  minAngleDegree: 45,
  minReturnRate: -5,
  minRSquared: 0.5,
  excludeLongTradingGap: true,
  maxTradingGapDays: 40,
  useEmaBearishFilter: true,
  useLongEmaFlexibleCondition: true,
  maxLongEmaConvergenceRate: 3,
  useLastPriceBelowEma5Filter: true,
  useEma5To112GapFilter: true,
  minEma5To112GapRate: 3,
  emaPeriods: [5, 20, 60, 112, 224, 448],
  bearishEmaPeriods: [112, 224, 448],
  showEMA5: true,
  showEMA20: true,
  showEMA60: true,
  showEMA112: true,
  showEMA224: true,
  showEMA448: true,
  showSelectedPriceLine: true,
  showRegressionLine: true,
  showMatchedArea: true,
  showCandleWick: true,
});

export const getSelectedPrice = (candle) =>
  candle.close >= candle.open ? candle.close : candle.open;

export const getTrendPrice = (candle) => candle.high;

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

export const hasLongTradingGap = (candles, maxGapDays = 40) => {
  if (!Array.isArray(candles) || candles.length < 2) return false;

  const sorted = [...candles].sort((a, b) => {
    const prevTime = new Date(a.date).getTime();
    const nextTime = new Date(b.date).getTime();
    return prevTime - nextTime;
  });

  for (let index = 1; index < sorted.length; index += 1) {
    const prevDate = new Date(sorted[index - 1].date);
    const currentDate = new Date(sorted[index].date);
    if (Number.isNaN(prevDate.getTime()) || Number.isNaN(currentDate.getTime())) {
      continue;
    }

    const diffDays =
      (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays >= maxGapDays) return true;
  }

  return false;
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

export const yToPrice = (y, minPrice, maxPrice, plotHeight, marginTop = 0) => {
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(minPrice) ||
    !Number.isFinite(maxPrice) ||
    !Number.isFinite(plotHeight) ||
    plotHeight <= 0 ||
    maxPrice === minPrice
  ) {
    return Number.NaN;
  }

  return maxPrice - ((y - marginTop) / plotHeight) * (maxPrice - minPrice);
};

export const createRenderPoints = (candles, options = {}) => {
  const merged = mergeOptions(options);
  const { margin, plotWidth, plotHeight } = getPlotSize(merged);
  const trendPrices = candles.map(getTrendPrice);
  const { minPrice, maxPrice } = calculatePriceRange(candles, trendPrices);

  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || candles.length < 2) {
    return [];
  }

  return candles.map((candle, index) => {
    const virtualPeriod = candles.length + merged.rightPaddingBars;
    const xPixel =
      margin.left + (index / Math.max(virtualPeriod - 1, 1)) * plotWidth;
    const trendPrice = getTrendPrice(candle);

    return {
      index,
      date: candle.date,
      selectedPrice: trendPrice,
      trendPrice,
      minPrice,
      maxPrice,
      plotHeight,
      marginTop: margin.top,
      xPixel,
      yPixel: priceToY(
        trendPrice,
        minPrice,
        maxPrice,
        plotHeight,
        margin.top,
      ),
    };
  });
};

export const analyzeDowntrendPeriod = (scanCandles, scanPoints, options = {}) => {
  const trendPrices = scanCandles.map(getTrendPrice);
  const { slopePixel, intercept } = calculateLinearRegressionByPoints(scanPoints);
  const rSquared = calculateRSquaredByPoints(scanPoints, slopePixel, intercept);
  const angleDegree = calculateAngleDegree(slopePixel);
  const returnRate = calculateReturnRate(trendPrices);
  const trendNextProjection = calculateTrendNextProjection(
    scanCandles,
    { slopePixel, intercept },
    scanPoints,
    options,
  );

  return {
    matchedPeriod: scanCandles.length,
    scanStartDate: scanCandles[0]?.date,
    scanEndDate: scanCandles.at(-1)?.date,
    slopePixel,
    intercept,
    angleDegree,
    rSquared,
    returnRate,
    firstPrice: trendPrices[0],
    lastPrice: trendPrices.at(-1),
    ...trendNextProjection,
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

export const calculateSMA = (values) => {
  if (!Array.isArray(values) || values.length === 0) return null;
  const numeric = values.map(Number);
  if (!numeric.every(Number.isFinite)) return null;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
};

export const calculateEMA = (candles, period) => {
  const safePeriod = Math.floor(Number(period));
  if (!Array.isArray(candles) || safePeriod < 1) return [];
  const result = Array(candles.length).fill(null);
  if (candles.length < safePeriod) return result;

  const closes = candles.map((candle) => Number(candle.close));
  if (!closes.every((value) => Number.isFinite(value) && value > 0)) return result;

  const firstEma = calculateSMA(closes.slice(0, safePeriod));
  if (firstEma == null) return result;

  const multiplier = 2 / (safePeriod + 1);
  result[safePeriod - 1] = firstEma;
  let previousEma = firstEma;

  for (let index = safePeriod; index < closes.length; index += 1) {
    const ema = closes[index] * multiplier + previousEma * (1 - multiplier);
    result[index] = ema;
    previousEma = ema;
  }

  return result;
};

export const calculateEMAs = (candles, periods = DEFAULT_OPTIONS.emaPeriods) =>
  Object.fromEntries(periods.map((period) => [`ema${period}`, calculateEMA(candles, period)]));

export const getLatestEMAValues = (candles, periods = DEFAULT_OPTIONS.emaPeriods) => {
  const emas = calculateEMAs(candles, periods);
  return Object.fromEntries(
    periods.map((period) => {
      const values = emas[`ema${period}`] ?? [];
      const latest = values.at(-1);
      return [`ema${period}`, latest == null ? null : latest];
    }),
  );
};

export const isLongEmaBearish = (
  emaValues,
  bearishPeriods = DEFAULT_OPTIONS.bearishEmaPeriods,
) => {
  const [shortPeriod, midPeriod, longPeriod] = bearishPeriods;
  const shortEma = emaValues?.[`ema${shortPeriod}`];
  const midEma = emaValues?.[`ema${midPeriod}`];
  const longEma = emaValues?.[`ema${longPeriod}`];
  if ([shortEma, midEma].some((value) => value == null || !Number.isFinite(Number(value)))) {
    return false;
  }
  if (longEma == null || !Number.isFinite(Number(longEma))) {
    return shortEma < midEma;
  }
  return shortEma < midEma && midEma < longEma;
};

export const evaluateFlexibleLongEmaCondition = (emaValues, options = {}) => {
  const ema112 = emaValues?.ema112;
  const ema224 = emaValues?.ema224;
  const ema448 = emaValues?.ema448;

  if (ema112 == null || Number.isNaN(Number(ema112))) {
    return {
      passed: false,
      reason: "EMA112_MISSING",
      isLongEmaConverged: false,
      isLongEmaBearish: false,
      isMissingLongEma: true,
      longEmaConvergenceRate: null,
    };
  }

  const isMissingLongEma =
    ema224 == null ||
    ema448 == null ||
    Number.isNaN(Number(ema224)) ||
    Number.isNaN(Number(ema448));

  if (isMissingLongEma) {
    return {
      passed: true,
      reason: "EMA224_OR_448_MISSING",
      isLongEmaConverged: false,
      isLongEmaBearish: false,
      isMissingLongEma: true,
      longEmaConvergenceRate: null,
    };
  }

  const numericEma112 = Number(ema112);
  const numericEma224 = Number(ema224);
  const numericEma448 = Number(ema448);
  const maxLongEma = Math.max(numericEma112, numericEma224, numericEma448);
  const minLongEma = Math.min(numericEma112, numericEma224, numericEma448);
  const longEmaConvergenceRate =
    maxLongEma > 0 ? ((maxLongEma - minLongEma) / maxLongEma) * 100 : null;
  const maxLongEmaConvergenceRate = options.maxLongEmaConvergenceRate ?? 3;
  const isLongEmaConverged =
    longEmaConvergenceRate != null &&
    longEmaConvergenceRate <= maxLongEmaConvergenceRate;
  const isLongEmaBearish = numericEma112 < numericEma224 && numericEma224 < numericEma448;
  const passed = isLongEmaConverged || isLongEmaBearish || isMissingLongEma;

  return {
    passed,
    reason: passed
      ? isLongEmaConverged
        ? "LONG_EMA_CONVERGED"
        : isLongEmaBearish
          ? "LONG_EMA_BEARISH"
          : "EMA224_OR_448_MISSING"
      : "LONG_EMA_CONDITION_NOT_MATCHED",
    isLongEmaConverged,
    isLongEmaBearish,
    isMissingLongEma,
    longEmaConvergenceRate,
  };
};

export const isLastPriceBelowEma5 = (lastClose, emaValues) => {
  const close = Number(lastClose);
  const ema5 = Number(emaValues?.ema5);
  if (!Number.isFinite(close) || close <= 0 || !Number.isFinite(ema5) || ema5 <= 0) {
    return false;
  }
  return close < ema5;
};

export const calculateEma5To112GapRate = (emaValues) => {
  const ema5 = Number(emaValues?.ema5);
  const ema112 = Number(emaValues?.ema112);
  if (!Number.isFinite(ema5) || !Number.isFinite(ema112) || ema112 <= 0) {
    return Number.NaN;
  }
  return ((ema112 - ema5) / ema112) * 100;
};

export const isEma5FarBelowEma112 = (
  emaValues,
  minGapRate = DEFAULT_OPTIONS.minEma5To112GapRate,
) => {
  const ema5 = Number(emaValues?.ema5);
  const ema112 = Number(emaValues?.ema112);
  const gapRate = calculateEma5To112GapRate(emaValues);
  return (
    Number.isFinite(ema5) &&
    Number.isFinite(ema112) &&
    ema112 > 0 &&
    ema5 < ema112 &&
    Number.isFinite(gapRate) &&
    gapRate >= minGapRate
  );
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

export const calculateTrendNextProjection = (
  candles,
  regression,
  scanPoints,
  options = {},
) => {
  const period = candles.length;
  const slopePixel = Number(regression?.slopePixel);
  const regressionIntercept = Number(regression?.intercept);
  const firstPoint = scanPoints?.[0];
  const lastPoint = scanPoints?.at(-1);
  const prevPoint = scanPoints?.at(-2);
  const minPrice = Number(lastPoint?.minPrice);
  const maxPrice = Number(lastPoint?.maxPrice);
  const plotHeight = Number(lastPoint?.plotHeight);
  const marginTop = Number(lastPoint?.marginTop);

  if (
    period < 2 ||
    !Number.isFinite(slopePixel) ||
    !Number.isFinite(regressionIntercept) ||
    !Number.isFinite(firstPoint?.xPixel) ||
    !Number.isFinite(lastPoint?.xPixel) ||
    !Number.isFinite(prevPoint?.xPixel) ||
    !Number.isFinite(minPrice) ||
    !Number.isFinite(maxPrice) ||
    maxPrice === minPrice ||
    !Number.isFinite(plotHeight) ||
    plotHeight <= 0
  ) {
    console.warn("Invalid trendNextPrice", {
      code: options.code,
      slopePixel,
      regressionIntercept,
      nextX: null,
      trendNextY: null,
      minPrice,
      maxPrice,
      plotHeight,
      marginTop,
    });
    return {
      regressionIntercept: Number.isFinite(regressionIntercept) ? regressionIntercept : null,
      trendLineStartPrice: null,
      trendLineEndPrice: null,
      trendNextX: null,
      trendNextY: null,
      trendNextPrice: null,
      trendNextGapFromLastHighRate: null,
    };
  }

  const xStep = lastPoint.xPixel - prevPoint.xPixel;
  const trendNextX = lastPoint.xPixel + xStep;
  const trendLineStartY = slopePixel * firstPoint.xPixel + regressionIntercept;
  const trendLineEndY = slopePixel * lastPoint.xPixel + regressionIntercept;
  const trendNextY = slopePixel * trendNextX + regressionIntercept;
  const trendLineStartPrice = yToPrice(
    trendLineStartY,
    minPrice,
    maxPrice,
    plotHeight,
    marginTop,
  );
  const trendLineEndPrice = yToPrice(
    trendLineEndY,
    minPrice,
    maxPrice,
    plotHeight,
    marginTop,
  );
  const trendNextPrice = yToPrice(
    trendNextY,
    minPrice,
    maxPrice,
    plotHeight,
    marginTop,
  );
  const lastHigh = getTrendPrice(candles.at(-1));
  const trendNextGapFromLastHighRate =
    Number.isFinite(trendNextPrice) && Number.isFinite(lastHigh) && lastHigh > 0
      ? ((trendNextPrice - lastHigh) / lastHigh) * 100
      : Number.NaN;
  if (!Number.isFinite(trendNextPrice) || trendNextPrice <= 0) {
    console.warn("Invalid trendNextPrice", {
      code: options.code,
      slopePixel,
      regressionIntercept,
      nextX: trendNextX,
      trendNextY,
      minPrice,
      maxPrice,
      plotHeight,
      marginTop,
    });
  } else if (Math.abs(trendNextGapFromLastHighRate) > 50) {
    console.warn("Suspicious trendNextPrice", {
      code: options.code,
      slopePixel,
      regressionIntercept,
      nextX: trendNextX,
      trendNextY,
      trendNextPrice,
      lastHigh,
      gapFromLastHighRate: trendNextGapFromLastHighRate,
      minPrice,
      maxPrice,
      plotHeight,
      marginTop,
    });
  }

  return {
    regressionIntercept,
    trendLineStartPrice:
      Number.isFinite(trendLineStartPrice) && trendLineStartPrice > 0
        ? trendLineStartPrice
        : null,
    trendLineEndPrice:
      Number.isFinite(trendLineEndPrice) && trendLineEndPrice > 0
        ? trendLineEndPrice
        : null,
    trendNextX,
    trendNextY,
    trendNextPrice:
      Number.isFinite(trendNextPrice) && trendNextPrice > 0 ? trendNextPrice : null,
    trendNextGapFromLastHighRate: Number.isFinite(trendNextGapFromLastHighRate)
      ? trendNextGapFromLastHighRate
      : null,
  };
};

export const filterStrongDowntrendStocks = (stocks, options = {}) => {
  const merged = mergeOptions(options);

  return stocks
    .map((stock) => {
      const allCandles = getValidCandlesSortedByDate(stock.prices);
      if (allCandles.length < merged.scanMinPeriod) return null;

      const candles = allCandles.slice(-merged.renderPeriod);
      if (candles.length < merged.scanMinPeriod) return null;
      if (
        merged.excludeLongTradingGap &&
        hasLongTradingGap(candles, merged.maxTradingGapDays)
      ) {
        return null;
      }

      const emaValues = getLatestEMAValues(allCandles, merged.emaPeriods);
      const longEmaCheck = merged.useLongEmaFlexibleCondition
        ? evaluateFlexibleLongEmaCondition(emaValues, merged)
        : {
            passed: isLongEmaBearish(emaValues, merged.bearishEmaPeriods),
            reason: "LONG_EMA_BEARISH",
            isLongEmaConverged: false,
            isLongEmaBearish: isLongEmaBearish(emaValues, merged.bearishEmaPeriods),
            isMissingLongEma: false,
            longEmaConvergenceRate: null,
          };
      if (merged.useEmaBearishFilter && !longEmaCheck.passed) return null;

      const lastCandle = candles.at(-1);
      const lastBelowEma5 = isLastPriceBelowEma5(lastCandle?.close, emaValues);
      if (merged.useLastPriceBelowEma5Filter && !lastBelowEma5) return null;

      const ema5To112GapRate = calculateEma5To112GapRate(emaValues);
      const ema5FarBelowEma112 = isEma5FarBelowEma112(
        emaValues,
        merged.minEma5To112GapRate,
      );
      if (merged.useEma5To112GapFilter && !ema5FarBelowEma112) return null;

      const trendPrices = candles.map(getTrendPrice);
      const range = calculatePriceRange(candles, trendPrices);
      if (!Number.isFinite(range.minPrice) || !Number.isFinite(range.maxPrice)) {
        return null;
      }

      const renderPoints = createRenderPoints(candles, merged);
      const matches = scanDowntrendPeriods(candles, renderPoints, { ...merged, code: stock.code });
      const bestMatch = pickBestDowntrendMatch(matches);
      if (!bestMatch) return null;

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
        ...Object.fromEntries(
          merged.emaPeriods.map((period) => {
            const value = emaValues[`ema${period}`];
            return [`ema${period}`, value == null ? null : round(value, 2)];
          }),
        ),
        isLongEmaBearish: longEmaCheck.isLongEmaBearish,
        isLongEmaConverged: longEmaCheck.isLongEmaConverged,
        isMissingLongEma: longEmaCheck.isMissingLongEma,
        longEmaConvergenceRate: Number.isFinite(longEmaCheck.longEmaConvergenceRate)
          ? round(longEmaCheck.longEmaConvergenceRate, 2)
          : null,
        longEmaConditionReason: longEmaCheck.reason,
        isLastPriceBelowEma5: lastBelowEma5,
        ema5To112GapRate: Number.isFinite(ema5To112GapRate)
          ? round(ema5To112GapRate, 2)
          : null,
        isEma5FarBelowEma112: ema5FarBelowEma112,
        ...bestMatch,
        regressionIntercept: bestMatch.regressionIntercept == null
          ? null
          : round(bestMatch.regressionIntercept, 4),
        trendLineStartPrice: bestMatch.trendLineStartPrice == null
          ? null
          : round(bestMatch.trendLineStartPrice, 2),
        trendLineEndPrice: bestMatch.trendLineEndPrice == null
          ? null
          : round(bestMatch.trendLineEndPrice, 2),
        trendNextX: bestMatch.trendNextX == null
          ? null
          : round(bestMatch.trendNextX, 4),
        trendNextY: bestMatch.trendNextY == null
          ? null
          : round(bestMatch.trendNextY, 4),
        trendNextPrice: bestMatch.trendNextPrice == null
          ? null
          : round(bestMatch.trendNextPrice, 2),
        trendNextGapFromLastHighRate: bestMatch.trendNextGapFromLastHighRate == null
          ? null
          : round(bestMatch.trendNextGapFromLastHighRate, 2),
        prices: allCandles,
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
    "regressionIntercept",
    "trendNextX",
    "trendNextY",
    "trendNextPrice",
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
      1000,
    ),
    scanMinPeriod: Math.max(
      2,
      Math.floor(options.scanMinPeriod ?? DEFAULT_OPTIONS.scanMinPeriod),
    ),
    scanMaxPeriod: Math.max(
      2,
      Math.floor(options.scanMaxPeriod ?? DEFAULT_OPTIONS.scanMaxPeriod),
    ),
    rightPaddingBars: Math.max(
      0,
      Math.floor(options.rightPaddingBars ?? DEFAULT_OPTIONS.rightPaddingBars),
    ),
    emaPeriods: Array.isArray(options.emaPeriods)
      ? options.emaPeriods.map((period) => Math.floor(Number(period))).filter((period) => period > 0)
      : DEFAULT_OPTIONS.emaPeriods,
    bearishEmaPeriods: Array.isArray(options.bearishEmaPeriods)
      ? options.bearishEmaPeriods.map((period) => Math.floor(Number(period))).filter((period) => period > 0)
      : DEFAULT_OPTIONS.bearishEmaPeriods,
  };
};
