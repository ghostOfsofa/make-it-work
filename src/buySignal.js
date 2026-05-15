import { round } from "./utils.js";

export const calculateMA = (candles, period) => {
  if (!Array.isArray(candles) || candles.length < period) return Number.NaN;
  const closes = candles.slice(-period).map((candle) => Number(candle.close));
  if (closes.some((value) => !Number.isFinite(value) || value <= 0)) {
    return Number.NaN;
  }
  return closes.reduce((sum, close) => sum + close, 0) / period;
};

export const calculateEMA = (candles, period) => {
  if (!Array.isArray(candles) || candles.length < period) return Number.NaN;
  const closes = candles.map((candle) => Number(candle.close));
  if (closes.some((value) => !Number.isFinite(value) || value <= 0)) {
    return Number.NaN;
  }
  const firstEma = closes.slice(0, period).reduce((sum, close) => sum + close, 0) / period;
  const multiplier = 2 / (period + 1);
  return closes.slice(period).reduce(
    (previousEma, close) => close * multiplier + previousEma * (1 - multiplier),
    firstEma,
  );
};

export const calculateMA5 = (candles) => calculateEMA(candles, 5);

export const isCrossAboveMA = ({
  currentPrice,
  previousPrice,
  previousClose,
  maPrice,
  maxAboveRate = 3,
}) => {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return { shouldBuy: false, reason: "invalid current price", aboveMaRate: Number.NaN };
  }
  if (!Number.isFinite(maPrice) || maPrice <= 0) {
    return { shouldBuy: false, reason: "invalid MA price", aboveMaRate: Number.NaN };
  }

  const priorPrice = Number.isFinite(previousPrice) ? previousPrice : previousClose;
  if (!Number.isFinite(priorPrice) || priorPrice <= 0) {
    return { shouldBuy: false, reason: "missing previous price", aboveMaRate: Number.NaN };
  }

  const aboveMaRate = ((currentPrice - maPrice) / maPrice) * 100;
  const crossed = priorPrice <= maPrice && currentPrice > maPrice;
  const notTooFar = aboveMaRate <= maxAboveRate;

  return {
    shouldBuy: crossed && notTooFar,
    reason: crossed
      ? notTooFar
        ? "currentPrice crossed above MA5"
        : "currentPrice is too far above MA5"
      : "currentPrice did not cross above MA5",
    aboveMaRate: round(aboveMaRate, 2),
  };
};

export const buildBuySignal = ({
  filteredStock,
  quote,
  ma5Price,
  previousPrice,
  previousClose,
  latestRun,
  reason,
}) => {
  const profitRateFromFiltered =
    filteredStock.lastPrice > 0
      ? ((quote.currentPrice - filteredStock.lastPrice) / filteredStock.lastPrice) * 100
      : Number.NaN;

  return {
    run_id: latestRun.run_id,
    code: filteredStock.code,
    name: filteredStock.name,
    market: filteredStock.market,
    signal_time: quote.quoteTime ?? new Date().toISOString(),
    base_date: latestRun.base_date,
    current_price: quote.currentPrice,
    ma5_price: ma5Price,
    previous_close: previousClose,
    previous_price: Number.isFinite(previousPrice) ? previousPrice : null,
    cross_type: "CROSS_ABOVE_MA5",
    signal_reason: reason,
    filtered_last_price: filteredStock.lastPrice,
    profit_rate_from_filtered: round(profitRateFromFiltered, 2),
    matched_period: filteredStock.matchedPeriod,
    angle_degree: filteredStock.angleDegree,
    r_squared: filteredStock.rSquared,
    return_rate: filteredStock.returnRate,
    status: "READY",
  };
};
