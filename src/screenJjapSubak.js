import {
  DEFAULT_JJAP_SUBAK_OPTIONS,
  filterJjapSubakStocks,
} from "./screeners/jjapSubakScreener.js";
import {
  closeDatabase,
  DEFAULT_STOCK_EXCLUSION_OPTIONS,
  getScreenTypeName,
  getStockUniverseStats,
  insertFilteredStocks,
  insertScreeningRun,
  loadStocksFromDatabase,
  openDatabase,
  SCREEN_TYPES,
} from "./db.js";
import { hasReadableDb, resolveDbPath } from "./config.js";

const SCREEN_OPTIONS = Object.freeze({
  ...DEFAULT_JJAP_SUBAK_OPTIONS,
  allowedMarkets: (process.env.ALLOWED_MARKETS ?? "KOSPI,KOSDAQ")
    .split(",")
    .map((market) => market.trim().toUpperCase())
    .filter(Boolean),
  excludeEtf: process.env.EXCLUDE_ETF !== "0" && DEFAULT_STOCK_EXCLUSION_OPTIONS.excludeEtf,
  excludeEtn: process.env.EXCLUDE_ETN !== "0" && DEFAULT_STOCK_EXCLUSION_OPTIONS.excludeEtn,
  excludeSpac: process.env.EXCLUDE_SPAC !== "0" && DEFAULT_STOCK_EXCLUSION_OPTIONS.excludeSpac,
  excludeReit: process.env.EXCLUDE_REIT !== "0" && DEFAULT_STOCK_EXCLUSION_OPTIONS.excludeReit,
  excludePreferred: process.env.EXCLUDE_PREFERRED !== "0" && DEFAULT_STOCK_EXCLUSION_OPTIONS.excludePreferred,
  excludeTradingHalt: process.env.EXCLUDE_TRADING_HALT !== "0" && DEFAULT_STOCK_EXCLUSION_OPTIONS.excludeTradingHalt,
  excludeAdministrative: process.env.EXCLUDE_ADMINISTRATIVE !== "0" && DEFAULT_STOCK_EXCLUSION_OPTIONS.excludeAdministrative,
  excludeAttention: process.env.EXCLUDE_ATTENTION !== "0" && DEFAULT_STOCK_EXCLUSION_OPTIONS.excludeAttention,
  excludeInvestmentWarning: process.env.EXCLUDE_INVESTMENT_WARNING === "1",
  excludeOther: process.env.EXCLUDE_OTHER !== "0" && DEFAULT_STOCK_EXCLUSION_OPTIONS.excludeOther,
  requireLatestPriceDate: process.env.REQUIRE_LATEST_PRICE_DATE !== "0",
  screenType: SCREEN_TYPES.JJAP_SUBAK,
});

const dbPath = resolveDbPath();
if (!hasReadableDb(dbPath)) {
  console.log(`DB not found: ${dbPath}`);
  console.log("jjap-subak screen skipped. Run fetch locally or upload a prepared DB first.");
  process.exit(0);
}

const statsDb = openDatabase(dbPath);
const universeStats = getStockUniverseStats(statsDb, SCREEN_OPTIONS);
closeDatabase(statsDb);

const candleLimit = Math.max(
  Number(process.env.CANDLE_LIMIT ?? 120),
  SCREEN_OPTIONS.minCandles,
);
const stocks = loadStocksFromDatabase({
  dbPath,
  candleLimit,
  minCandles: SCREEN_OPTIONS.minCandles,
  exclusionOptions: SCREEN_OPTIONS,
  allowedMarkets: SCREEN_OPTIONS.allowedMarkets,
  requireLatestPriceDate: SCREEN_OPTIONS.requireLatestPriceDate,
});
const results = filterJjapSubakStocks(stocks, SCREEN_OPTIONS);
const baseDate =
  stocks
    .map((stock) => stock.prices.at(-1)?.date)
    .filter(Boolean)
    .sort()
    .at(-1) ?? new Date().toISOString().slice(0, 10);

const db = openDatabase(dbPath);
try {
  const runId = insertScreeningRun(
    db,
    {
      screenType: SCREEN_TYPES.JJAP_SUBAK,
      baseDate,
      dataSource: "database",
      totalStockCount: universeStats.totalStockCount,
      matchedStockCount: results.length,
      excludedStockCount: universeStats.excludedStockCount,
      screeningTargetCount: universeStats.screeningTargetCount,
      note: "Jjap Subak custom screening from SQLite OHLCV data",
    },
    SCREEN_OPTIONS,
  );
  insertFilteredStocks(db, runId, results, { screenType: SCREEN_TYPES.JJAP_SUBAK });

  console.log(`screening type: ${SCREEN_TYPES.JJAP_SUBAK}`);
  console.log(`screening name: ${getScreenTypeName(SCREEN_TYPES.JJAP_SUBAK)}`);
  console.log(`screening run created: ${runId}`);
  console.log(`baseDate: ${baseDate}`);
  console.log(`total stocks: ${universeStats.totalStockCount}`);
  console.log(`matched stocks: ${results.length}`);
  console.table(
    results.slice(0, 50).map((result) => ({
      code: result.code,
      name: result.name,
      market: result.market,
      lastClose: result.lastClose,
      ema5: result.ema5,
      volumeRatio: Number(result.jjapSubakVolumeRatio.toFixed(3)),
    })),
  );
} finally {
  closeDatabase(db);
}
