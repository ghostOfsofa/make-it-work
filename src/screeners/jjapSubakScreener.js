import {
  DEFAULT_OPTIONS,
  getLatestEMAValues,
  getValidCandlesSortedByDate,
} from "../analysis.js";
import { SCREEN_TYPES, getScreenTypeName } from "../db.js";

const average = (values) => {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return Number.NaN;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
};

const averageVolume = (candles, period) =>
  average(candles.slice(-period).map((candle) => Number(candle.volume)));

const getHighestHigh = (candles) =>
  Math.max(...candles.map((candle) => Number(candle.high)).filter(Number.isFinite));

const getLowestLow = (candles) =>
  Math.min(...candles.map((candle) => Number(candle.low)).filter(Number.isFinite));

export const calculateIchimokuSnapshot = (candles) => {
  if (!Array.isArray(candles) || candles.length < 52) return null;

  const last9 = candles.slice(-9);
  const last26 = candles.slice(-26);
  const last52 = candles.slice(-52);
  const tenkanSen = (getHighestHigh(last9) + getLowestLow(last9)) / 2;
  const kijunSen = (getHighestHigh(last26) + getLowestLow(last26)) / 2;
  const senkouSpanA = (tenkanSen + kijunSen) / 2;
  const senkouSpanB = (getHighestHigh(last52) + getLowestLow(last52)) / 2;

  if (![tenkanSen, kijunSen, senkouSpanA, senkouSpanB].every(Number.isFinite)) {
    return null;
  }

  return {
    tenkanSen,
    kijunSen,
    senkouSpanA,
    senkouSpanB,
    cloudTop: Math.max(senkouSpanA, senkouSpanB),
    cloudBottom: Math.min(senkouSpanA, senkouSpanB),
  };
};

export const calculateIchimokuRawSeries = (candles, options = {}) => {
  const tenkanPeriod = options.tenkanPeriod ?? 9;
  const kijunPeriod = options.kijunPeriod ?? 26;
  const spanBPeriod = options.senkouSpanBPeriod ?? 52;

  return candles.map((candle, index) => {
    if (index < spanBPeriod - 1) {
      return {
        date: candle.date,
        tenkanSen: null,
        kijunSen: null,
        senkouSpanA: null,
        senkouSpanB: null,
      };
    }

    const lastTenkan = candles.slice(index - tenkanPeriod + 1, index + 1);
    const lastKijun = candles.slice(index - kijunPeriod + 1, index + 1);
    const lastSpanB = candles.slice(index - spanBPeriod + 1, index + 1);
    const tenkanSen = (getHighestHigh(lastTenkan) + getLowestLow(lastTenkan)) / 2;
    const kijunSen = (getHighestHigh(lastKijun) + getLowestLow(lastKijun)) / 2;
    const senkouSpanA = (tenkanSen + kijunSen) / 2;
    const senkouSpanB = (getHighestHigh(lastSpanB) + getLowestLow(lastSpanB)) / 2;

    return {
      date: candle.date,
      tenkanSen,
      kijunSen,
      senkouSpanA,
      senkouSpanB,
    };
  });
};

export const isPriceAboveShiftedIchimokuCloud = (candles, options = {}) => {
  const displacement = options.ichimokuDisplacement ?? 26;
  const spanBPeriod = options.senkouSpanBPeriod ?? 52;

  if (!Array.isArray(candles) || candles.length < spanBPeriod + displacement) {
    return { isAboveCloud: false, cloud: null };
  }

  const rawSeries = calculateIchimokuRawSeries(candles, options);
  const lastIndex = candles.length - 1;
  const sourceIndex = lastIndex - displacement;
  const source = rawSeries[sourceIndex];
  const current = rawSeries[lastIndex];
  const lastClose = Number(candles[lastIndex]?.close);

  if (
    !source ||
    !Number.isFinite(source.senkouSpanA) ||
    !Number.isFinite(source.senkouSpanB) ||
    !Number.isFinite(lastClose)
  ) {
    return { isAboveCloud: false, cloud: null };
  }

  const shiftedSenkouSpanA = source.senkouSpanA;
  const shiftedSenkouSpanB = source.senkouSpanB;
  const shiftedCloudTop = Math.max(shiftedSenkouSpanA, shiftedSenkouSpanB);
  const shiftedCloudBottom = Math.min(shiftedSenkouSpanA, shiftedSenkouSpanB);
  return {
    isAboveCloud: lastClose > shiftedCloudTop,
    cloud: {
      tenkanSen: current?.tenkanSen ?? null,
      kijunSen: current?.kijunSen ?? null,
      senkouSpanA: current?.senkouSpanA ?? null,
      senkouSpanB: current?.senkouSpanB ?? null,
      cloudTop: shiftedCloudTop,
      cloudBottom: shiftedCloudBottom,
      shiftedSenkouSpanA,
      shiftedSenkouSpanB,
      shiftedCloudTop,
      shiftedCloudBottom,
      displacement,
      sourceIndex,
      lastIndex,
    },
  };
};

export const evaluateJjapSubakLongEmaCondition = (emaValues, options = {}) => {
  const ema112 = emaValues.ema112;
  const ema224 = emaValues.ema224;
  const ema448 = emaValues.ema448;

  if (ema112 == null || Number.isNaN(ema112)) {
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
    Number.isNaN(ema224) ||
    Number.isNaN(ema448);

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

  const maxLongEma = Math.max(ema112, ema224, ema448);
  const minLongEma = Math.min(ema112, ema224, ema448);
  const longEmaConvergenceRate =
    maxLongEma > 0 ? ((maxLongEma - minLongEma) / maxLongEma) * 100 : null;
  const maxLongEmaConvergenceRate = options.maxLongEmaConvergenceRate ?? 3;
  const isLongEmaConverged =
    longEmaConvergenceRate != null &&
    longEmaConvergenceRate <= maxLongEmaConvergenceRate;
  const isLongEmaBearish = ema112 < ema224 && ema224 < ema448;
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

export const evaluateHighestLongEmaGap = ({ lastClose, emaValues, options = {} }) => {
  const candidates = [
    { period: 112, value: emaValues.ema112 },
    { period: 224, value: emaValues.ema224 },
    { period: 448, value: emaValues.ema448 },
  ].filter((item) => Number.isFinite(item.value) && item.value > 0);

  if (!Number.isFinite(lastClose) || lastClose <= 0 || candidates.length === 0) {
    return {
      shouldExclude: false,
      highestLongEmaPeriod: null,
      highestLongEmaValue: null,
      priceToHighestLongEmaGapRate: null,
    };
  }

  const highest = candidates.reduce(
    (max, item) => (item.value > max.value ? item : max),
    candidates[0],
  );
  const priceToHighestLongEmaGapRate =
    ((lastClose - highest.value) / highest.value) * 100;
  const maxGapRate = options.maxHighestLongEmaGapRate ?? 30;
  const shouldExclude =
    lastClose > highest.value && priceToHighestLongEmaGapRate >= maxGapRate;

  return {
    shouldExclude,
    highestLongEmaPeriod: highest.period,
    highestLongEmaValue: highest.value,
    priceToHighestLongEmaGapRate,
  };
};

export const calculateSMA = (values) => {
  if (!Array.isArray(values) || values.length === 0) return null;
  const validValues = values.map(Number).filter(Number.isFinite);
  if (validValues.length !== values.length) return null;
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
};

export const calculateStandardDeviation = (values) => {
  const mean = calculateSMA(values);
  if (mean == null) return null;
  const variance =
    values.reduce((sum, value) => {
      const diff = Number(value) - mean;
      return sum + diff * diff;
    }, 0) / values.length;
  return Math.sqrt(variance);
};

export const calculateShiftedBollingerBands = (candles, options = {}) => {
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

export const calculateBollingerYellowArrowSignals = (candles, options = {}) => {
  const bands = calculateShiftedBollingerBands(candles, options);
  return candles.map((candle, index) => {
    const close = Number(candle.close);
    const shiftedUpperBand = bands[index]?.shiftedUpperBand;
    const isYellowArrow =
      Number.isFinite(close) &&
      Number.isFinite(shiftedUpperBand) &&
      close > shiftedUpperBand;

    return {
      date: candle.date,
      close,
      shiftedUpperBand,
      shiftedMiddleBand: bands[index]?.shiftedMiddleBand ?? null,
      shiftedLowerBand: bands[index]?.shiftedLowerBand ?? null,
      isYellowArrow,
    };
  });
};

export const hasBollingerYellowArrowWithinRecentDays = (candles, options = {}) => {
  const lookbackDays =
    options.bollingerYellowArrowLookbackDays ??
    options.bollingerYellowArrowDays ??
    5;
  const signals = calculateBollingerYellowArrowSignals(candles, options);
  const recentSignals = signals.slice(-lookbackDays);

  return {
    passed: recentSignals.length > 0 && recentSignals.some((signal) => signal.isYellowArrow),
    signals,
    recentSignals,
    yellowArrowCount: recentSignals.filter((signal) => signal.isYellowArrow).length,
  };
};

export const DEFAULT_JJAP_SUBAK_OPTIONS = Object.freeze({
  ...DEFAULT_OPTIONS,
  screenType: SCREEN_TYPES.JJAP_SUBAK,
  screenName: getScreenTypeName(SCREEN_TYPES.JJAP_SUBAK),
  allowedMarkets: ["KOSPI", "KOSDAQ"],
  minCandles: 112,
  minIchimokuCandles: 52,
  minLastClosePrice: 2000,
  maxLongEmaConvergenceRate: 3,
  excludeOverHighestLongEmaGap: true,
  maxHighestLongEmaGapRate: 30,
  excludeTooFarAboveIchimokuCloud: true,
  maxIchimokuCloudGapRate: 13,
  bollingerPeriod: 33,
  bollingerStdDevMultiplier: 0.1,
  bollingerShiftBars: 25,
  ichimokuDisplacement: 26,
  requireBollingerYellowArrowWithinRecentDays: true,
  bollingerYellowArrowLookbackDays: 5,
  shortVolumePeriod: 20,
  longVolumePeriod: 60,
  emaPeriods: [5, 112, 224, 448],
});

export const analyzeJjapSubakStock = (stock, options = {}) => {
  const merged = { ...DEFAULT_JJAP_SUBAK_OPTIONS, ...options };
  const allowedMarkets = new Set((merged.allowedMarkets ?? []).map((market) => String(market).toUpperCase()));
  if (!allowedMarkets.has(String(stock.market ?? "").toUpperCase())) return null;

  const candles = getValidCandlesSortedByDate(stock.prices);
  if (candles.length < Math.max(merged.minCandles, merged.minIchimokuCandles)) return null;

  const lastCandle = candles.at(-1);
  const lastClose = Number(lastCandle?.close);
  const prevCandle = candles.at(-2);
  const emaValues = getLatestEMAValues(candles, merged.emaPeriods);
  const ema5 = emaValues.ema5;
  const longEmaCheck = evaluateJjapSubakLongEmaCondition(emaValues, merged);
  const highestLongEmaGapCheck = evaluateHighestLongEmaGap({
    lastClose,
    emaValues,
    options: merged,
  });
  const bollingerCheck = hasBollingerYellowArrowWithinRecentDays(candles, merged);
  const avgVolume20 = averageVolume(candles, merged.shortVolumePeriod);
  const avgVolume60 = averageVolume(candles, merged.longVolumePeriod);

  if (
    !Number.isFinite(lastClose) ||
    lastClose <= merged.minLastClosePrice ||
    !Number.isFinite(ema5) ||
    !longEmaCheck.passed ||
    !Number.isFinite(avgVolume20) ||
    !Number.isFinite(avgVolume60) ||
    avgVolume60 <= 0
  ) {
    return null;
  }

  if (merged.excludeOverHighestLongEmaGap && highestLongEmaGapCheck.shouldExclude) {
    return null;
  }

  if (
    merged.requireBollingerYellowArrowWithinRecentDays &&
    !bollingerCheck.passed
  ) {
    return null;
  }

  const { isAboveCloud, cloud } = isPriceAboveShiftedIchimokuCloud(candles, merged);
  if (lastClose <= ema5 || avgVolume20 <= avgVolume60 || !isAboveCloud) {
    return null;
  }
  const shiftedCloudTop = Number(cloud.shiftedCloudTop);
  if (!Number.isFinite(shiftedCloudTop) || shiftedCloudTop <= 0) {
    return null;
  }
  const ichimokuCloudGapRate = ((lastClose - shiftedCloudTop) / shiftedCloudTop) * 100;
  const isTooFarAboveIchimokuCloud =
    ichimokuCloudGapRate >= (merged.maxIchimokuCloudGapRate ?? 13);

  if (
    merged.excludeTooFarAboveIchimokuCloud &&
    isTooFarAboveIchimokuCloud
  ) {
    return null;
  }

  const dailyChangeRate =
    prevCandle?.close > 0
      ? ((lastClose - prevCandle.close) / prevCandle.close) * 100
      : null;
  const volumeRatio = avgVolume20 / avgVolume60;
  const scanCandles = candles.slice(-merged.longVolumePeriod);
  const latestBollingerSignal = bollingerCheck.signals.at(-1);

  return {
    code: stock.code,
    name: stock.name,
    market: stock.market ?? "UNKNOWN",
    screenType: SCREEN_TYPES.JJAP_SUBAK,
    screenName: getScreenTypeName(SCREEN_TYPES.JJAP_SUBAK),
    baseDate: lastCandle.date,
    matchedPeriod: scanCandles.length,
    scanStartDate: scanCandles[0]?.date ?? lastCandle.date,
    scanEndDate: lastCandle.date,
    slopePixel: 0,
    angleDegree: 0,
    rSquared: 0,
    returnRate: Number(((lastClose - scanCandles[0].close) / scanCandles[0].close) * 100),
    firstPrice: scanCandles[0].close,
    lastPrice: lastClose,
    lastClose,
    dailyChangeRate,
    minLastClosePrice: merged.minLastClosePrice,
    isAboveMinPrice: true,
    ema5,
    ema20: null,
    ema60: null,
    ema112: emaValues.ema112 ?? null,
    ema224: emaValues.ema224 ?? null,
    ema448: emaValues.ema448 ?? null,
    isLongEmaBearish: longEmaCheck.isLongEmaBearish,
    isLastPriceBelowEma5: false,
    ema5To112GapRate: null,
    isEma5FarBelowEma112: false,
    tenkanSen: cloud.tenkanSen,
    kijunSen: cloud.kijunSen,
    senkouSpanA: cloud.senkouSpanA,
    senkouSpanB: cloud.senkouSpanB,
    cloudTop: cloud.cloudTop,
    cloudBottom: cloud.cloudBottom,
    ichimokuDisplacement: cloud.displacement,
    shiftedSenkouSpanA: cloud.shiftedSenkouSpanA,
    shiftedSenkouSpanB: cloud.shiftedSenkouSpanB,
    shiftedCloudTop: cloud.shiftedCloudTop,
    shiftedCloudBottom: cloud.shiftedCloudBottom,
    ichimokuCloudGapRate,
    isTooFarAboveIchimokuCloud,
    isAboveIchimokuCloud: isAboveCloud,
    isLongEmaConverged: longEmaCheck.isLongEmaConverged,
    isMissingLongEma: longEmaCheck.isMissingLongEma,
    longEmaConvergenceRate: longEmaCheck.longEmaConvergenceRate,
    longEmaConditionReason: longEmaCheck.reason,
    highestLongEmaPeriod: highestLongEmaGapCheck.highestLongEmaPeriod,
    highestLongEmaValue: highestLongEmaGapCheck.highestLongEmaValue,
    priceToHighestLongEmaGapRate: highestLongEmaGapCheck.priceToHighestLongEmaGapRate,
    isOverHighestLongEmaGap: highestLongEmaGapCheck.shouldExclude,
    bollingerPeriod: merged.bollingerPeriod,
    bollingerStdDevMultiplier: merged.bollingerStdDevMultiplier,
    bollingerShiftBars: merged.bollingerShiftBars,
    bollingerYellowArrowLookbackDays: merged.bollingerYellowArrowLookbackDays,
    hasBollingerYellowArrowWithinRecentDays: bollingerCheck.passed,
    bollingerYellowArrowCount: bollingerCheck.yellowArrowCount,
    latestShiftedUpperBand: latestBollingerSignal?.shiftedUpperBand ?? null,
    latestCloseAboveShiftedUpperBand: latestBollingerSignal?.isYellowArrow ?? false,
    jjapSubakVolumeRatio: volumeRatio,
  };
};

export const filterJjapSubakStocks = (stocks, options = {}) =>
  stocks
    .map((stock) => analyzeJjapSubakStock(stock, options))
    .filter(Boolean)
    .sort((a, b) => b.jjapSubakVolumeRatio - a.jjapSubakVolumeRatio);
