import { DEFAULT_OPTIONS, filterStrongDowntrendStocks } from "./analysis.js";
import {
  closeDatabase,
  insertFilteredStocks,
  insertScreeningRun,
  loadStocksFromDatabase,
  openDatabase,
} from "./db.js";

export const SCREEN_OPTIONS = Object.freeze({
  ...DEFAULT_OPTIONS,
  renderPeriod: Number(process.env.RENDER_PERIOD ?? DEFAULT_OPTIONS.renderPeriod),
  scanMinPeriod: Number(process.env.SCAN_MIN_PERIOD ?? DEFAULT_OPTIONS.scanMinPeriod),
  scanMaxPeriod: Number(process.env.SCAN_MAX_PERIOD ?? DEFAULT_OPTIONS.scanMaxPeriod),
  minAngleDegree: Number(process.env.MIN_ANGLE_DEGREE ?? DEFAULT_OPTIONS.minAngleDegree),
  minReturnRate: Number(process.env.MIN_RETURN_RATE ?? DEFAULT_OPTIONS.minReturnRate),
  minRSquared: Number(process.env.MIN_R_SQUARED ?? DEFAULT_OPTIONS.minRSquared),
});

const dbPath = process.env.DB_PATH ?? "data/stocks.db";
const candleLimit = Number(process.env.CANDLE_LIMIT ?? 180);

const stocks = loadStocksFromDatabase({
  dbPath,
  candleLimit,
  minCandles: SCREEN_OPTIONS.scanMinPeriod,
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
      totalStockCount: stocks.length,
      matchedStockCount: results.length,
      note: "Downtrend screening from SQLite OHLCV data",
    },
    SCREEN_OPTIONS,
  );
  insertFilteredStocks(db, runId, results);

  console.log(`screening run created: ${runId}`);
  console.log(`baseDate: ${baseDate}`);
  console.log(`total stocks: ${stocks.length}`);
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
