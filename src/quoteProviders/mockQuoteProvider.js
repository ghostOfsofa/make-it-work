import { QuoteProvider } from "./quoteProvider.js";
import { calculateMA5 } from "../buySignal.js";
import { createSeededRandom, randomBetween } from "../utils.js";

export class MockQuoteProvider extends QuoteProvider {
  constructor({ seed = Date.now(), breakoutRatio = 0.25 } = {}) {
    super();
    this.random = createSeededRandom(seed);
    this.breakoutRatio = breakoutRatio;
  }

  async fetchQuotes(codes, context = {}) {
    const now = new Date().toISOString();
    return codes.map((code, index) => {
      const candles = context.candlesMap?.get(code) ?? [];
      const lastCandle = candles.at(-1);
      const ma5 = context.ma5ByCode?.get(code) ?? calculateMA5(candles);
      const previousClose = lastCandle?.close;
      const forceBreakout =
        Number.isFinite(ma5) &&
        Number.isFinite(previousClose) &&
        previousClose <= ma5 &&
        (index % Math.max(2, Math.round(1 / this.breakoutRatio)) === 0 ||
          this.random() < this.breakoutRatio);

      const currentPrice = forceBreakout
        ? ma5 * randomBetween(this.random, 1.003, 1.018)
        : (previousClose ?? ma5 ?? 10_000) * randomBetween(this.random, 0.985, 1.018);
      const open = (previousClose ?? currentPrice) * randomBetween(this.random, 0.99, 1.01);
      const high = Math.max(open, currentPrice) * randomBetween(this.random, 1, 1.015);
      const low = Math.min(open, currentPrice) * randomBetween(this.random, 0.985, 1);
      const changePrice = currentPrice - (previousClose ?? currentPrice);
      const changeRate =
        previousClose > 0 ? (changePrice / previousClose) * 100 : Number.NaN;

      return {
        code,
        quoteTime: now,
        currentPrice: Math.round(Math.max(1, currentPrice)),
        changePrice: Math.round(changePrice),
        changeRate,
        open: Math.round(Math.max(1, open)),
        high: Math.round(Math.max(1, high)),
        low: Math.round(Math.max(1, low)),
        volume: Math.round(randomBetween(this.random, 10_000, 2_000_000)),
        source: "mock",
      };
    });
  }
}
