import { DEFAULT_OPTIONS, filterStrongDowntrendStocks } from "./analysis.js";
import {
  closeDatabase,
  DEFAULT_STOCK_EXCLUSION_OPTIONS,
  getStockUniverseStats,
  insertFilteredStocks,
  insertScreeningRun,
  loadStocksFromDatabase,
  openDatabase,
} from "./db.js";
import { hasReadableDb, resolveDbPath } from "./config.js";

export const SCREEN_OPTIONS = Object.freeze({
  ...DEFAULT_OPTIONS,
  renderPeriod: Number(process.env.RENDER_PERIOD ?? DEFAULT_OPTIONS.renderPeriod),
  scanMinPeriod: Number(process.env.SCAN_MIN_PERIOD ?? DEFAULT_OPTIONS.scanMinPeriod),
  scanMaxPeriod: Number(process.env.SCAN_MAX_PERIOD ?? DEFAULT_OPTIONS.scanMaxPeriod),
  minAngleDegree: Number(process.env.MIN_ANGLE_DEGREE ?? DEFAULT_OPTIONS.minAngleDegree),
  minReturnRate: Number(process.env.MIN_RETURN_RATE ?? DEFAULT_OPTIONS.minReturnRate),
  minRSquared: Number(process.env.MIN_R_SQUARED ?? DEFAULT_OPTIONS.minRSquared),
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
});

const dbPath = resolveDbPath();
const candleLimit = Number(process.env.CANDLE_LIMIT ?? 180);

if (!hasReadableDb(dbPath)) {
  console.log(`DB not found: ${dbPath}`);
  console.log("screen skipped. Run fetch locally or upload a prepared DB first.");
  process.exit(0);
}

const statsDb = openDatabase(dbPath);
const universeStats = getStockUniverseStats(statsDb, SCREEN_OPTIONS);
closeDatabase(statsDb);

const stocks = loadStocksFromDatabase({
  dbPath,
  candleLimit,
  minCandles: SCREEN_OPTIONS.scanMinPeriod,
  exclusionOptions: SCREEN_OPTIONS,
});
const results = filterStrongDowntrendStocks(stocks, SCREEN_OPTIONS);
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
      baseDate,
      dataSource: "database",
      totalStockCount: universeStats.totalStockCount,
      matchedStockCount: results.length,
      excludedStockCount: universeStats.excludedStockCount,
      screeningTargetCount: universeStats.screeningTargetCount,
      note: "Downtrend screening from SQLite OHLCV data",
    },
    SCREEN_OPTIONS,
  );
  insertFilteredStocks(db, runId, results);

  console.log(`screening run created: ${runId}`);
  console.log(`baseDate: ${baseDate}`);
  console.log(`total stocks in DB: ${universeStats.totalStockCount}`);
  console.log(`excluded ETF/ETN: ${universeStats.etfCount + universeStats.etnCount}`);
  console.log(`excluded preferred: ${universeStats.preferredCount}`);
  console.log(`excluded SPAC: ${universeStats.spacCount}`);
  console.log(`excluded REIT: ${universeStats.reitCount}`);
  console.log(`excluded trading halt: ${universeStats.tradingHaltCount}`);
  console.log(`excluded attention: ${universeStats.attentionCount}`);
  console.log(`excluded administrative: ${universeStats.administrativeCount}`);
  console.log(`excluded other non-common: ${universeStats.otherCount}`);
  console.log(`screening target stocks: ${universeStats.screeningTargetCount}`);
  console.log(`screening target stocks with enough candles: ${stocks.length}`);
  console.log(`matched stocks: ${results.length}`);
  console.table(
    results.slice(0, 50).map((result) => ({
      code: result.code,
      name: result.name,
      matchedPeriod: result.matchedPeriod,
      scanStartDate: result.scanStartDate,
      scanEndDate: result.scanEndDate,
      angleDegree: result.angleDegree,
      slopePixel: result.slopePixel,
      rSquared: result.rSquared,
      returnRate: result.returnRate,
    })),
  );
} finally {
  closeDatabase(db);
}
