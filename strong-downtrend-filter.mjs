/**
 * 16:9 chart-coordinate based strong downtrend stock filter.
 *
 * Run:
 *   node strong-downtrend-filter.mjs
 *
 * The code is intentionally written in a TypeScript-friendly shape:
 * - pure functions
 * - plain object inputs/outputs
 * - explicit validation boundaries
 */

export const DEFAULT_OPTIONS = Object.freeze({
  period: 20,
  renderPeriod: 60,
  scanMinPeriod: 10,
  scanMaxPeriod: 60,
  chartWidth: 1600,
  chartHeight: 900,
  minAngleDegree: 45,
  minReturnRate: -10,
  minRSquared: 0.6,
});

const isFinitePositiveNumber = (value) =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const isValidCandle = (candle) =>
  candle != null &&
  isFinitePositiveNumber(candle.open) &&
  isFinitePositiveNumber(candle.close);

/**
 * Selects the trend price by candle direction.
 * - Bullish or flat candle: close
 * - Bearish candle: open
 */
export const getSelectedPrice = (candle) =>
  candle.close >= candle.open ? candle.close : candle.open;

/**
 * Sorts candles by date ascending, removes invalid candles, and returns the
 * selected prices for the latest period.
 */
export const getRecentValidPrices = (prices, period) => {
  if (!Array.isArray(prices) || !Number.isInteger(period) || period < 2) {
    return [];
  }

  const validCandles = [...prices]
    .filter(isValidCandle)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  if (validCandles.length < period) {
    return [];
  }

  return validCandles.slice(-period).map(getSelectedPrice);
};

export const getValidCandlesSortedByDate = (prices) => {
  if (!Array.isArray(prices)) {
    return [];
  }

  return [...prices]
    .filter(isValidCandle)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
};

/**
 * Converts selected prices into screen coordinates for a virtual chart.
 *
 * yPixel follows screen coordinates:
 * - smaller y is visually higher
 * - larger y is visually lower
 *
 * Therefore, a visually down-right trend has positive slope in this coordinate
 * system.
 */
export const convertToChartPoints = (
  selectedPrices,
  chartWidth,
  chartHeight,
) => {
  if (
    !Array.isArray(selectedPrices) ||
    selectedPrices.length < 2 ||
    !isFinitePositiveNumber(chartWidth) ||
    !isFinitePositiveNumber(chartHeight)
  ) {
    return [];
  }

  const minPrice = Math.min(...selectedPrices);
  const maxPrice = Math.max(...selectedPrices);

  if (maxPrice === minPrice) {
    return [];
  }

  const denominator = selectedPrices.length - 1;
  const priceRange = maxPrice - minPrice;

  return selectedPrices.map((selectedPrice, index) => {
    const xPixel = (index / denominator) * chartWidth;
    const yPixel =
      chartHeight -
      ((selectedPrice - minPrice) / priceRange) * chartHeight;

    return { xPixel, yPixel, selectedPrice, index };
  });
};

/**
 * Calculates simple linear regression for chart points:
 * y = slopePixel * x + intercept
 */
export const calculateLinearRegressionByPoints = (points) => {
  if (!Array.isArray(points) || points.length < 2) {
    return { slopePixel: Number.NaN, intercept: Number.NaN };
  }

  const n = points.length;
  const sums = points.reduce(
    (acc, point) => ({
      x: acc.x + point.xPixel,
      y: acc.y + point.yPixel,
      xy: acc.xy + point.xPixel * point.yPixel,
      x2: acc.x2 + point.xPixel * point.xPixel,
    }),
    { x: 0, y: 0, xy: 0, x2: 0 },
  );

  const denominator = n * sums.x2 - sums.x * sums.x;

  if (denominator === 0) {
    return { slopePixel: Number.NaN, intercept: Number.NaN };
  }

  const slopePixel = (n * sums.xy - sums.x * sums.y) / denominator;
  const intercept = (sums.y - slopePixel * sums.x) / n;

  return { slopePixel, intercept };
};

/**
 * Calculates R-squared for chart-coordinate points and a regression line.
 */
export const calculateRSquaredByPoints = (points, slopePixel, intercept) => {
  if (
    !Array.isArray(points) ||
    points.length < 2 ||
    !Number.isFinite(slopePixel) ||
    !Number.isFinite(intercept)
  ) {
    return Number.NaN;
  }

  const meanY =
    points.reduce((sum, point) => sum + point.yPixel, 0) / points.length;

  const { ssTotal, ssResidual } = points.reduce(
    (acc, point) => {
      const predictedY = slopePixel * point.xPixel + intercept;
      const totalDiff = point.yPixel - meanY;
      const residualDiff = point.yPixel - predictedY;

      return {
        ssTotal: acc.ssTotal + totalDiff * totalDiff,
        ssResidual: acc.ssResidual + residualDiff * residualDiff,
      };
    },
    { ssTotal: 0, ssResidual: 0 },
  );

  if (ssTotal === 0) {
    return Number.NaN;
  }

  return 1 - ssResidual / ssTotal;
};

export const calculateAngleDegree = (slopePixel) =>
  Math.atan(slopePixel) * (180 / Math.PI);

export const calculateReturnRate = (selectedPrices) => {
  if (!Array.isArray(selectedPrices) || selectedPrices.length < 2) {
    return Number.NaN;
  }

  const firstPrice = selectedPrices[0];
  const lastPrice = selectedPrices[selectedPrices.length - 1];

  if (!isFinitePositiveNumber(firstPrice) || !isFinitePositiveNumber(lastPrice)) {
    return Number.NaN;
  }

  return ((lastPrice - firstPrice) / firstPrice) * 100;
};

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const randomInRange = (random, min, max) => min + (max - min) * random();

const normalizePrice = (price) => Math.max(round(price, 2), 1);

const isBetterScanMatch = (candidate, currentBest) => {
  if (currentBest == null) {
    return true;
  }

  if (candidate.angleDegree !== currentBest.angleDegree) {
    return candidate.angleDegree > currentBest.angleDegree;
  }

  if (candidate.rSquared !== currentBest.rSquared) {
    return candidate.rSquared > currentBest.rSquared;
  }

  if (candidate.returnRate !== currentBest.returnRate) {
    return candidate.returnRate < currentBest.returnRate;
  }

  return candidate.matchedPeriod > currentBest.matchedPeriod;
};

const analyzeScanCandles = (candles, config) => {
  const selectedPrices = candles.map(getSelectedPrice);
  const points = convertToChartPoints(
    selectedPrices,
    config.chartWidth,
    config.chartHeight,
  );

  if (points.length === 0) {
    return null;
  }

  const { slopePixel, intercept } = calculateLinearRegressionByPoints(points);
  const rSquared = calculateRSquaredByPoints(points, slopePixel, intercept);
  const angleDegree = calculateAngleDegree(slopePixel);
  const returnRate = calculateReturnRate(selectedPrices);
  const hasValidMetrics = [slopePixel, angleDegree, rSquared, returnRate].every(
    Number.isFinite,
  );

  if (!hasValidMetrics) {
    return null;
  }

  const isStrongDowntrend =
    slopePixel > 0 &&
    angleDegree >= config.minAngleDegree &&
    rSquared >= config.minRSquared &&
    returnRate <= config.minReturnRate;

  if (!isStrongDowntrend) {
    return null;
  }

  return {
    matchedPeriod: candles.length,
    scanStartDate: candles[0]?.date,
    scanEndDate: candles.at(-1)?.date,
    slopePixel,
    angleDegree,
    rSquared,
    returnRate,
    firstPrice: selectedPrices[0],
    lastPrice: selectedPrices.at(-1),
  };
};

/**
 * Small deterministic pseudo-random generator.
 *
 * Same seed => same sample stock data.
 * Omit seed to use Math.random.
 */
export const createSeededRandom = (seed) => {
  if (!Number.isInteger(seed)) {
    return Math.random;
  }

  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

/**
 * Filters stocks that satisfy all strong downtrend conditions:
 * - positive chart-coordinate slope
 * - angle >= minAngleDegree
 * - R-squared >= minRSquared
 * - returnRate <= minReturnRate
 */
export const filterStrongDowntrendStocks = (stocks, options = {}) => {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const scanMinPeriod = Math.max(2, config.scanMinPeriod);
  const scanMaxPeriod = Math.max(scanMinPeriod, config.scanMaxPeriod);

  if (!Array.isArray(stocks)) {
    return [];
  }

  return stocks.flatMap((stock) => {
    const validCandles = getValidCandlesSortedByDate(stock.prices);
    const maxPeriod = Math.min(scanMaxPeriod, validCandles.length);

    if (maxPeriod < scanMinPeriod) {
      return [];
    }

    const bestMatch = Array.from(
      { length: maxPeriod - scanMinPeriod + 1 },
      (_, index) => scanMinPeriod + index,
    ).reduce((best, matchedPeriod) => {
      const scanCandles = validCandles.slice(-matchedPeriod);
      const candidate = analyzeScanCandles(scanCandles, config);

      return candidate != null && isBetterScanMatch(candidate, best)
        ? candidate
        : best;
    }, null);

    if (bestMatch == null) {
      return [];
    }

    return [
      {
        code: stock.code,
        name: stock.name,
        matchedPeriod: bestMatch.matchedPeriod,
        scanStartDate: bestMatch.scanStartDate,
        scanEndDate: bestMatch.scanEndDate,
        slopePixel: round(bestMatch.slopePixel, 4),
        angleDegree: round(bestMatch.angleDegree, 2),
        rSquared: round(bestMatch.rSquared, 4),
        returnRate: round(bestMatch.returnRate, 2),
        firstPrice: bestMatch.firstPrice,
        lastPrice: bestMatch.lastPrice,
      },
    ];
  });
};

export const SAMPLE_STOCK_TYPES = Object.freeze({
  STRONG_DOWNTREND: "strongDowntrend",
  STRONG_UPTREND: "strongUptrend",
  SIDEWAYS: "sideways",
  SURGE_THEN_DROP: "surgeThenDrop",
  DROP_THEN_REBOUND: "dropThenRebound",
});

const sampleStockTypeCycle = Object.freeze([
  SAMPLE_STOCK_TYPES.STRONG_DOWNTREND,
  SAMPLE_STOCK_TYPES.STRONG_UPTREND,
  SAMPLE_STOCK_TYPES.SIDEWAYS,
  SAMPLE_STOCK_TYPES.SURGE_THEN_DROP,
  SAMPLE_STOCK_TYPES.DROP_THEN_REBOUND,
]);

const getPatternDailyRateRange = (type, index, candleCount) => {
  const progress = candleCount <= 1 ? 0 : index / (candleCount - 1);

  switch (type) {
    case SAMPLE_STOCK_TYPES.STRONG_DOWNTREND:
      return [-0.095, -0.025];
    case SAMPLE_STOCK_TYPES.STRONG_UPTREND:
      return [0.025, 0.095];
    case SAMPLE_STOCK_TYPES.SIDEWAYS:
      return [-0.018, 0.018];
    case SAMPLE_STOCK_TYPES.SURGE_THEN_DROP:
      return progress < 0.35 ? [0.035, 0.12] : [-0.11, -0.025];
    case SAMPLE_STOCK_TYPES.DROP_THEN_REBOUND:
      return progress < 0.35 ? [-0.12, -0.035] : [0.025, 0.09];
    default:
      return [-0.03, 0.03];
  }
};

const createDateByOffset = (startDate, offset) => {
  const date = new Date(`${startDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

const createSampleCandlesFromSelectedPrices = (startDate, selectedPrices) =>
  selectedPrices.map((selectedPrice, index) => {
    const date = new Date(`${startDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);

    const isBearish = index % 3 === 0;
    const open = isBearish ? selectedPrice : selectedPrice - 20;
    const close = isBearish ? selectedPrice - 30 : selectedPrice;
    const high = Math.max(open, close) + 80;
    const low = Math.max(Math.min(open, close) - 80, 1);

    return {
      date: date.toISOString().slice(0, 10),
      // This keeps selectedPrice equal to selectedPrice under the requested rule.
      open,
      high,
      low,
      close,
    };
  });

const generateCandlesByType = ({
  type,
  candleCount,
  startDate,
  startPrice,
  random,
}) => {
  if (!Number.isInteger(candleCount) || candleCount < 1) {
    return [];
  }

  const firstClose = normalizePrice(startPrice);

  return Array.from({ length: candleCount }).reduce((candles, _, index) => {
    const prevClose = index === 0 ? firstClose : candles[index - 1].close;
    const [minDailyRate, maxDailyRate] = getPatternDailyRateRange(
      type,
      index,
      candleCount,
    );

    const dailyChangeRate = clamp(
      randomInRange(random, minDailyRate, maxDailyRate),
      -0.29,
      0.29,
    );
    const openGapRate = randomInRange(random, -0.1, 0.1);

    const open = normalizePrice(prevClose * (1 + openGapRate));
    const close = normalizePrice(prevClose * (1 + dailyChangeRate));
    const upperShadowRate = randomInRange(random, 0.002, 0.035);
    const lowerShadowRate = randomInRange(random, 0.002, 0.035);
    const high = normalizePrice(Math.max(open, close) * (1 + upperShadowRate));
    const low = normalizePrice(Math.min(open, close) * (1 - lowerShadowRate));

    return [
      ...candles,
      {
        date: createDateByOffset(startDate, index),
        open,
        high,
        low,
        close,
      },
    ];
  }, []);
};

/**
 * Generates realistic-ish Korean daily stock samples.
 *
 * Constraints:
 * - close changes from previous close by -29% to +29%
 * - open can gap from previous close by -10% to +10%
 * - open, high, low, and close are always at least 1
 * - generated stocks cycle through multiple market behavior patterns
 */
export const generateSampleStocks = ({
  stockCount,
  candleCount,
  seed,
  startDate = "2026-01-01",
} = {}) => {
  const safeStockCount =
    Number.isInteger(stockCount) && stockCount > 0 ? stockCount : 100;
  const safeCandleCount =
    Number.isInteger(candleCount) && candleCount > 0 ? candleCount : 60;
  const random = createSeededRandom(seed);

  return Array.from({ length: safeStockCount }, (_, index) => {
    const type = sampleStockTypeCycle[index % sampleStockTypeCycle.length];
    const stockNumber = index + 1;
    const startPrice = randomInRange(random, 3_000, 150_000);

    return {
      code: `STK${String(stockNumber).padStart(4, "0")}`,
      name: `SampleStock${stockNumber}`,
      type,
      prices: generateCandlesByType({
        type,
        candleCount: safeCandleCount,
        startDate,
        startPrice,
        random,
      }),
    };
  });
};

export const sampleStocks = [
  {
    code: "123456",
    name: "ABC강한우하향",
    prices: createSampleCandlesFromSelectedPrices("2026-04-01", [
      10000, 9800, 9600, 9400, 9200, 9000, 8800, 8600, 8400, 8200,
      8000, 7800, 7600, 7400, 7200, 7000, 6800, 6600, 6400, 6200,
    ]),
  },
  {
    code: "654321",
    name: "DEF완만하락",
    prices: createSampleCandlesFromSelectedPrices("2026-04-01", [
      10000, 9980, 9950, 9920, 9900, 9880, 9850, 9830, 9800, 9780,
      9750, 9730, 9700, 9680, 9650, 9630, 9600, 9580, 9550, 9530,
    ]),
  },
  {
    code: "005930",
    name: "삼성전자샘플",
    prices: createSampleCandlesFromSelectedPrices("2026-04-01", [
      72000, 71800, 72100, 71900, 71600, 71300, 71500, 71000, 70800, 71100,
      70600, 70400, 70500, 70200, 69900, 70100, 69800, 69500, 69700, 69400,
    ]),
  },
  {
    code: "000000",
    name: "무효데이터포함",
    prices: [
      { date: "2026-04-01", open: 10000, close: 9900 },
      { date: "2026-04-02", open: null, close: 9800 },
      { date: "2026-04-03", open: 9700, close: Number.NaN },
      { date: "2026-04-04", open: 0, close: 9600 },
    ],
  },
];

const isDirectRun = process.argv[1] === new URL(import.meta.url).pathname;

if (isDirectRun) {
  const generatedStocks = generateSampleStocks({
    stockCount: 100,
    candleCount: 60,
    seed: 20260512,
  });
  const defaultResult = filterStrongDowntrendStocks(generatedStocks);
  const demoResult = filterStrongDowntrendStocks(generatedStocks, {
    minAngleDegree: 29,
  });

  console.log("Generated sample stock preview");
  console.table(
    generatedStocks.slice(0, 10).map((stock) => ({
      code: stock.code,
      name: stock.name,
      type: stock.type,
      candleCount: stock.prices.length,
      firstOpen: stock.prices[0]?.open,
      firstHigh: stock.prices[0]?.high,
      firstLow: stock.prices[0]?.low,
      firstClose: stock.prices[0]?.close,
      lastOpen: stock.prices.at(-1)?.open,
      lastHigh: stock.prices.at(-1)?.high,
      lastLow: stock.prices.at(-1)?.low,
      lastClose: stock.prices.at(-1)?.close,
    })),
  );

  console.log("Strong downtrend stocks with default options");
  console.table(defaultResult);

  console.log("Strong downtrend stocks with demo options: minAngleDegree = 29");
  console.table(demoResult);
}
