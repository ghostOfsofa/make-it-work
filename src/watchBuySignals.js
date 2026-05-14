import {
  closeDatabase,
  getLatestScreeningRun,
  insertBuySignal,
  loadFilteredStocksByRunId,
  loadRecentCandlesForCodes,
  openDatabase,
} from "./db.js";
import { MockQuoteProvider } from "./quoteProviders/mockQuoteProvider.js";
import { buildBuySignal, calculateMA5, isCrossAboveMA } from "./buySignal.js";
import { round } from "./utils.js";
import { resolveDbPath } from "./config.js";

const options = {
  dbPath: resolveDbPath(),
  intervalSeconds: Number(process.env.INTERVAL_SECONDS ?? 10),
  maxAboveMa5Rate: Number(process.env.MAX_ABOVE_MA5_RATE ?? 3),
  useMockQuoteProvider: process.env.USE_MOCK_QUOTE_PROVIDER !== "0",
  marketTimeOnly: process.env.MARKET_TIME_ONLY === "1",
};

const once = process.argv.includes("--once");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const previousPriceMap = new Map();

const db = openDatabase(options.dbPath);
const quoteProvider = new MockQuoteProvider();

const runOnce = async () => {
  const latestRun = getLatestScreeningRun(db);
  if (!latestRun) {
    console.log("no screening run found. Run `npm run screen` first.");
    return [];
  }

  const filteredStocks = loadFilteredStocksByRunId(db, latestRun.run_id);
  if (filteredStocks.length === 0) {
    console.log("no filtered stocks found for latest run.");
    return [];
  }

  const codes = filteredStocks.map((stock) => stock.code);
  const candlesMap = loadRecentCandlesForCodes(db, codes, 20);
  const ma5ByCode = new Map(
    codes.map((code) => [code, calculateMA5(candlesMap.get(code) ?? [])]),
  );
  const quotes = await quoteProvider.fetchQuotes(codes, {
    filteredStocks,
    candlesMap,
    ma5ByCode,
    previousPriceMap,
  });
  const quoteMap = new Map(quotes.map((quote) => [quote.code, quote]));
  const savedSignals = [];

  for (const filteredStock of filteredStocks) {
    const quote = quoteMap.get(filteredStock.code);
    const candles = candlesMap.get(filteredStock.code) ?? [];
    const previousClose = candles.at(-1)?.close;
    const ma5Price = ma5ByCode.get(filteredStock.code);
    const previousPrice = previousPriceMap.get(filteredStock.code);

    if (!quote) continue;

    const cross = isCrossAboveMA({
      currentPrice: quote.currentPrice,
      previousPrice,
      previousClose,
      maPrice: ma5Price,
      maxAboveRate: options.maxAboveMa5Rate,
    });

    if (cross.shouldBuy) {
      const signal = buildBuySignal({
        filteredStock,
        quote,
        ma5Price: round(ma5Price, 2),
        previousPrice,
        previousClose,
        latestRun,
        reason: cross.reason,
      });
      const inserted = insertBuySignal(db, signal);
      if (inserted > 0) savedSignals.push(signal);
    }

    previousPriceMap.set(filteredStock.code, quote.currentPrice);
  }

  console.log(`checked ${filteredStocks.length} filtered stocks`);
  console.log(`new buy signals: ${savedSignals.length}`);
  console.table(
    savedSignals.map((signal) => ({
      code: signal.code,
      name: signal.name,
      currentPrice: signal.current_price,
      ma5Price: signal.ma5_price,
      profitRateFromFiltered: signal.profit_rate_from_filtered,
      signalTime: signal.signal_time,
    })),
  );
  return savedSignals;
};

try {
  do {
    await runOnce();
    if (once) break;
    await sleep(options.intervalSeconds * 1000);
  } while (true);
} finally {
  closeDatabase(db);
}
