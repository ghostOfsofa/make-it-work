import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
};

export const normalizeCandle = (candle) => {
  if (!candle) return null;
  const open = toNumber(candle.open);
  const high = toNumber(candle.high);
  const low = toNumber(candle.low);
  const close = toNumber(candle.close);
  const volume = toNumber(candle.volume);

  if (![open, high, low, close].every((value) => value > 0)) return null;

  return {
    date: String(candle.date ?? "").slice(0, 10),
    open: Math.round(open),
    high: Math.round(Math.max(high, open, close)),
    low: Math.round(Math.min(low, open, close)),
    close: Math.round(close),
    volume: Number.isFinite(volume) && volume >= 0 ? Math.round(volume) : 0,
  };
};

export const openDatabase = (dbPath = "data/stocks.db") => {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initDatabase(db);
  return db;
};

export const initDatabase = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stocks (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      market TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stock_prices (
      code TEXT NOT NULL,
      date TEXT NOT NULL,
      open INTEGER NOT NULL,
      high INTEGER NOT NULL,
      low INTEGER NOT NULL,
      close INTEGER NOT NULL,
      volume INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (code, date),
      FOREIGN KEY (code) REFERENCES stocks(code)
    );

    CREATE INDEX IF NOT EXISTS idx_stock_prices_code_date
    ON stock_prices(code, date);

    CREATE INDEX IF NOT EXISTS idx_stock_prices_date
    ON stock_prices(date);

    CREATE TABLE IF NOT EXISTS screening_runs (
      run_id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_at TEXT DEFAULT CURRENT_TIMESTAMP,
      base_date TEXT NOT NULL,
      data_source TEXT DEFAULT 'database',
      total_stock_count INTEGER DEFAULT 0,
      matched_stock_count INTEGER DEFAULT 0,
      render_period INTEGER NOT NULL,
      scan_min_period INTEGER NOT NULL,
      scan_max_period INTEGER NOT NULL,
      min_angle_degree REAL NOT NULL,
      min_return_rate REAL NOT NULL,
      min_r_squared REAL NOT NULL,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS filtered_stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      market TEXT,
      base_date TEXT NOT NULL,
      matched_period INTEGER NOT NULL,
      scan_start_date TEXT NOT NULL,
      scan_end_date TEXT NOT NULL,
      slope_pixel REAL NOT NULL,
      angle_degree REAL NOT NULL,
      r_squared REAL NOT NULL,
      return_rate REAL NOT NULL,
      first_price REAL NOT NULL,
      last_price REAL NOT NULL,
      last_close REAL NOT NULL,
      daily_change_rate REAL,
      rank_no INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (run_id) REFERENCES screening_runs(run_id),
      FOREIGN KEY (code) REFERENCES stocks(code)
    );

    CREATE INDEX IF NOT EXISTS idx_filtered_stocks_run_id
    ON filtered_stocks(run_id);

    CREATE INDEX IF NOT EXISTS idx_filtered_stocks_code
    ON filtered_stocks(code);

    CREATE INDEX IF NOT EXISTS idx_filtered_stocks_base_date
    ON filtered_stocks(base_date);

    CREATE TABLE IF NOT EXISTS buy_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      market TEXT,
      signal_time TEXT NOT NULL,
      base_date TEXT NOT NULL,
      current_price REAL NOT NULL,
      ma5_price REAL NOT NULL,
      previous_close REAL,
      previous_price REAL,
      cross_type TEXT NOT NULL,
      signal_reason TEXT,
      filtered_last_price REAL,
      profit_rate_from_filtered REAL,
      matched_period INTEGER,
      angle_degree REAL,
      r_squared REAL,
      return_rate REAL,
      status TEXT DEFAULT 'READY',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (run_id) REFERENCES screening_runs(run_id),
      FOREIGN KEY (code) REFERENCES stocks(code)
    );

    CREATE INDEX IF NOT EXISTS idx_buy_signals_run_id
    ON buy_signals(run_id);

    CREATE INDEX IF NOT EXISTS idx_buy_signals_code
    ON buy_signals(code);

    CREATE INDEX IF NOT EXISTS idx_buy_signals_signal_time
    ON buy_signals(signal_time);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_buy_signals_unique_daily
    ON buy_signals(code, base_date, cross_type);
  `);
};

export const upsertStock = (db, stock) => {
  db.prepare(`
    INSERT INTO stocks (code, name, market, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      market = excluded.market,
      updated_at = CURRENT_TIMESTAMP
  `).run(String(stock.code), String(stock.name), stock.market ?? null);
};

export const upsertPriceRows = (db, code, prices) => {
  const statement = db.prepare(`
    INSERT INTO stock_prices (
      code, date, open, high, low, close, volume, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(code, date) DO UPDATE SET
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      volume = excluded.volume,
      updated_at = CURRENT_TIMESTAMP
  `);

  const insertMany = db.transaction((rows) => {
    for (const candle of rows) {
      const normalized = normalizeCandle(candle);
      if (!normalized?.date) continue;
      statement.run(
        code,
        normalized.date,
        normalized.open,
        normalized.high,
        normalized.low,
        normalized.close,
        normalized.volume,
      );
    }
  });

  insertMany(prices ?? []);
};

const mapPriceRow = (row) => ({
  date: row.date,
  open: row.open,
  high: row.high,
  low: row.low,
  close: row.close,
  volume: row.volume ?? 0,
});

export const loadStocksFromDatabase = ({
  dbPath = "data/stocks.db",
  candleLimit = 180,
  minCandles = 10,
} = {}) => {
  const db = openDatabase(dbPath);
  try {
    const stocks = db
      .prepare("SELECT code, name, market FROM stocks ORDER BY code")
      .all();
    const priceStatement = db.prepare(`
      SELECT date, open, high, low, close, volume
      FROM stock_prices
      WHERE code = ?
      ORDER BY date DESC
      LIMIT ?
    `);

    return stocks
      .map((stock) => {
        const prices = priceStatement
          .all(stock.code, candleLimit)
          .map(mapPriceRow)
          .reverse();
        return { ...stock, prices };
      })
      .filter((stock) => stock.prices.length >= minCandles);
  } finally {
    db.close();
  }
};

export const loadRecentCandlesForCodes = (db, codes, candleLimit = 120) => {
  const statement = db.prepare(`
    SELECT date, open, high, low, close, volume
    FROM stock_prices
    WHERE code = ?
    ORDER BY date DESC
    LIMIT ?
  `);
  const map = new Map();
  for (const code of codes) {
    map.set(
      code,
      statement.all(code, candleLimit).map(mapPriceRow).reverse(),
    );
  }
  return map;
};

export const insertScreeningRun = (db, runSummary, options) => {
  const result = db.prepare(`
    INSERT INTO screening_runs (
      base_date, data_source, total_stock_count, matched_stock_count,
      render_period, scan_min_period, scan_max_period,
      min_angle_degree, min_return_rate, min_r_squared, note
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    runSummary.baseDate,
    runSummary.dataSource ?? "database",
    runSummary.totalStockCount ?? 0,
    runSummary.matchedStockCount ?? 0,
    options.renderPeriod,
    options.scanMinPeriod,
    options.scanMaxPeriod,
    options.minAngleDegree,
    options.minReturnRate,
    options.minRSquared,
    runSummary.note ?? null,
  );
  return Number(result.lastInsertRowid);
};

export const insertFilteredStocks = (db, runId, results) => {
  const statement = db.prepare(`
    INSERT INTO filtered_stocks (
      run_id, code, name, market, base_date, matched_period,
      scan_start_date, scan_end_date, slope_pixel, angle_degree, r_squared,
      return_rate, first_price, last_price, last_close, daily_change_rate,
      rank_no
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((rows) => {
    rows.forEach((result, index) => {
      statement.run(
        runId,
        result.code,
        result.name,
        result.market ?? null,
        result.scanEndDate,
        result.matchedPeriod,
        result.scanStartDate,
        result.scanEndDate,
        result.slopePixel,
        result.angleDegree,
        result.rSquared,
        result.returnRate,
        result.firstPrice,
        result.lastPrice,
        result.lastClose,
        result.dailyChangeRate,
        index + 1,
      );
    });
  });

  insertMany(results ?? []);
};

export const getLatestScreeningRun = (db) =>
  db
    .prepare("SELECT * FROM screening_runs ORDER BY run_id DESC LIMIT 1")
    .get() ?? null;

const mapFilteredRow = (row) => ({
  id: row.id,
  runId: row.run_id,
  code: row.code,
  name: row.name,
  market: row.market,
  baseDate: row.base_date,
  matchedPeriod: row.matched_period,
  scanStartDate: row.scan_start_date,
  scanEndDate: row.scan_end_date,
  slopePixel: row.slope_pixel,
  angleDegree: row.angle_degree,
  rSquared: row.r_squared,
  returnRate: row.return_rate,
  firstPrice: row.first_price,
  lastPrice: row.last_price,
  lastClose: row.last_close,
  dailyChangeRate: row.daily_change_rate,
  rankNo: row.rank_no,
});

export const loadFilteredStocksByRunId = (db, runId) =>
  db
    .prepare("SELECT * FROM filtered_stocks WHERE run_id = ? ORDER BY rank_no, angle_degree DESC")
    .all(runId)
    .map(mapFilteredRow);

export const loadLatestFilteredStocks = (db) => {
  const latestRun = getLatestScreeningRun(db);
  return latestRun ? loadFilteredStocksByRunId(db, latestRun.run_id) : [];
};

export const insertBuySignal = (db, signal) => {
  const result = db.prepare(`
    INSERT OR IGNORE INTO buy_signals (
      run_id, code, name, market, signal_time, base_date,
      current_price, ma5_price, previous_close, previous_price,
      cross_type, signal_reason, filtered_last_price,
      profit_rate_from_filtered, matched_period, angle_degree,
      r_squared, return_rate, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    signal.run_id,
    signal.code,
    signal.name,
    signal.market ?? null,
    signal.signal_time,
    signal.base_date,
    signal.current_price,
    signal.ma5_price,
    signal.previous_close ?? null,
    signal.previous_price ?? null,
    signal.cross_type,
    signal.signal_reason ?? null,
    signal.filtered_last_price ?? null,
    signal.profit_rate_from_filtered ?? null,
    signal.matched_period ?? null,
    signal.angle_degree ?? null,
    signal.r_squared ?? null,
    signal.return_rate ?? null,
    signal.status ?? "READY",
  );
  return result.changes;
};

export const loadBuySignalsByRunId = (db, runId) =>
  db
    .prepare("SELECT * FROM buy_signals WHERE run_id = ? ORDER BY signal_time DESC")
    .all(runId)
    .map((row) => ({
      id: row.id,
      runId: row.run_id,
      code: row.code,
      name: row.name,
      market: row.market,
      signalTime: row.signal_time,
      baseDate: row.base_date,
      currentPrice: row.current_price,
      ma5Price: row.ma5_price,
      previousClose: row.previous_close,
      previousPrice: row.previous_price,
      crossType: row.cross_type,
      signalReason: row.signal_reason,
      filteredLastPrice: row.filtered_last_price,
      profitRateFromFiltered: row.profit_rate_from_filtered,
      matchedPeriod: row.matched_period,
      angleDegree: row.angle_degree,
      rSquared: row.r_squared,
      returnRate: row.return_rate,
      status: row.status,
    }));

export const closeDatabase = (db) => db?.close();
