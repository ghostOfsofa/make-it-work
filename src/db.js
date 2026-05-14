import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
};

const toFlag = (value) => (Number(value) === 1 || value === true ? 1 : 0);

export const DEFAULT_STOCK_EXCLUSION_OPTIONS = Object.freeze({
  excludeEtf: true,
  excludeEtn: true,
  excludeSpac: true,
  excludeReit: true,
  excludePreferred: true,
  excludeTradingHalt: true,
  excludeAdministrative: true,
  excludeAttention: true,
  excludeInvestmentWarning: false,
  excludeOther: true,
});

const STOCK_META_COLUMNS = [
  ["is_etf", "INTEGER DEFAULT 0"],
  ["is_etn", "INTEGER DEFAULT 0"],
  ["is_spac", "INTEGER DEFAULT 0"],
  ["is_reit", "INTEGER DEFAULT 0"],
  ["is_preferred", "INTEGER DEFAULT 0"],
  ["is_trading_halt", "INTEGER DEFAULT 0"],
  ["is_administrative", "INTEGER DEFAULT 0"],
  ["is_investment_warning", "INTEGER DEFAULT 0"],
  ["is_attention", "INTEGER DEFAULT 0"],
  ["stock_type", "TEXT DEFAULT 'COMMON'"],
  ["exclude_reason", "TEXT"],
];

const SCREENING_RUN_EXTRA_COLUMNS = [
  ["excluded_stock_count", "INTEGER DEFAULT 0"],
  ["screening_target_count", "INTEGER DEFAULT 0"],
  ["exclude_etf", "INTEGER DEFAULT 1"],
  ["exclude_etn", "INTEGER DEFAULT 1"],
  ["exclude_spac", "INTEGER DEFAULT 1"],
  ["exclude_reit", "INTEGER DEFAULT 1"],
  ["exclude_preferred", "INTEGER DEFAULT 1"],
  ["exclude_trading_halt", "INTEGER DEFAULT 1"],
  ["exclude_administrative", "INTEGER DEFAULT 1"],
  ["exclude_attention", "INTEGER DEFAULT 1"],
  ["exclude_investment_warning", "INTEGER DEFAULT 0"],
];

const ensureColumns = (db, tableName, columns) => {
  const existing = new Set(
    db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name),
  );
  for (const [name, definition] of columns) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${name} ${definition}`);
    }
  }
};

const ETF_NAME_KEYWORDS = [
  "ETF",
  "KODEX",
  "TIGER",
  "ACE",
  "SOL",
  "KBSTAR",
  "HANARO",
  "ARIRANG",
  "KOSEF",
  "TIMEFOLIO",
  "TREX",
  "PLUS",
];

const hasKeyword = (text, keywords) => {
  const upper = String(text ?? "").toUpperCase();
  return keywords.some((keyword) => upper.includes(keyword.toUpperCase()));
};

const isPreferredName = (name) =>
  /(우|우B|우C|[1-9]우|[1-9]우B|전환우|종류주)$/.test(String(name ?? "").replace(/\s+/g, ""));

const inferStockMeta = (stock) => {
  const name = String(stock.name ?? "");
  const market = String(stock.market ?? "");
  const combined = `${name} ${market}`;
  const isEtf = market.toUpperCase() === "ETF" || hasKeyword(name, ETF_NAME_KEYWORDS);
  const isEtn = market.toUpperCase() === "ETN" || hasKeyword(combined, ["ETN"]);
  const isSpac = hasKeyword(combined, ["스팩", "SPAC", "기업인수목적"]);
  const isReit = hasKeyword(combined, ["리츠", "REIT"]);
  const isPreferred = isPreferredName(name);
  const stockType = isEtf
    ? "ETF"
    : isEtn
      ? "ETN"
      : isSpac
        ? "SPAC"
        : isReit
          ? "REIT"
          : isPreferred
            ? "PREFERRED"
            : market && !["KOSPI", "KOSDAQ", "KONEX", "SAMPLE"].includes(market.toUpperCase())
              ? "OTHER"
              : "COMMON";
  const reasons = [
    isEtf && "ETF",
    isEtn && "ETN",
    isSpac && "SPAC",
    isReit && "REIT",
    isPreferred && "PREFERRED",
    stockType === "OTHER" && "OTHER",
  ].filter(Boolean);

  return {
    is_etf: isEtf ? 1 : 0,
    is_etn: isEtn ? 1 : 0,
    is_spac: isSpac ? 1 : 0,
    is_reit: isReit ? 1 : 0,
    is_preferred: isPreferred ? 1 : 0,
    stock_type: stockType,
    exclude_reason: reasons.length ? reasons.join(",") : null,
  };
};

const backfillStockMetaFromNames = (db) => {
  const rows = db
    .prepare(`
      SELECT code, name, market
      FROM stocks
      WHERE COALESCE(is_etf, 0) = 0
        AND COALESCE(is_etn, 0) = 0
        AND COALESCE(is_spac, 0) = 0
        AND COALESCE(is_reit, 0) = 0
        AND COALESCE(is_preferred, 0) = 0
        AND COALESCE(is_trading_halt, 0) = 0
        AND COALESCE(is_administrative, 0) = 0
        AND COALESCE(is_investment_warning, 0) = 0
        AND COALESCE(is_attention, 0) = 0
        AND (exclude_reason IS NULL OR exclude_reason = '')
    `)
    .all();
  if (!rows.length) return;

  const update = db.prepare(`
    UPDATE stocks
    SET is_etf = ?,
        is_etn = ?,
        is_spac = ?,
        is_reit = ?,
        is_preferred = ?,
        stock_type = ?,
        exclude_reason = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE code = ?
  `);
  const updateMany = db.transaction((items) => {
    for (const row of items) {
      const meta = inferStockMeta(row);
      if (meta.exclude_reason || meta.stock_type === "OTHER") {
        update.run(
          meta.is_etf,
          meta.is_etn,
          meta.is_spac,
          meta.is_reit,
          meta.is_preferred,
          meta.stock_type,
          meta.exclude_reason,
          row.code,
        );
      }
    }
  });
  updateMany(rows);
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
      is_etf INTEGER DEFAULT 0,
      is_etn INTEGER DEFAULT 0,
      is_spac INTEGER DEFAULT 0,
      is_reit INTEGER DEFAULT 0,
      is_preferred INTEGER DEFAULT 0,
      is_trading_halt INTEGER DEFAULT 0,
      is_administrative INTEGER DEFAULT 0,
      is_investment_warning INTEGER DEFAULT 0,
      is_attention INTEGER DEFAULT 0,
      stock_type TEXT DEFAULT 'COMMON',
      exclude_reason TEXT,
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
      excluded_stock_count INTEGER DEFAULT 0,
      screening_target_count INTEGER DEFAULT 0,
      exclude_etf INTEGER DEFAULT 1,
      exclude_etn INTEGER DEFAULT 1,
      exclude_spac INTEGER DEFAULT 1,
      exclude_reit INTEGER DEFAULT 1,
      exclude_preferred INTEGER DEFAULT 1,
      exclude_trading_halt INTEGER DEFAULT 1,
      exclude_administrative INTEGER DEFAULT 1,
      exclude_attention INTEGER DEFAULT 1,
      exclude_investment_warning INTEGER DEFAULT 0,
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
  ensureColumns(db, "stocks", STOCK_META_COLUMNS);
  ensureColumns(db, "screening_runs", SCREENING_RUN_EXTRA_COLUMNS);
  backfillStockMetaFromNames(db);
};

export const upsertStock = (db, stock) => {
  const inferred = inferStockMeta(stock);
  db.prepare(`
    INSERT INTO stocks (
      code, name, market,
      is_etf, is_etn, is_spac, is_reit, is_preferred,
      is_trading_halt, is_administrative, is_investment_warning, is_attention,
      stock_type, exclude_reason, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      market = excluded.market,
      is_etf = excluded.is_etf,
      is_etn = excluded.is_etn,
      is_spac = excluded.is_spac,
      is_reit = excluded.is_reit,
      is_preferred = excluded.is_preferred,
      is_trading_halt = excluded.is_trading_halt,
      is_administrative = excluded.is_administrative,
      is_investment_warning = excluded.is_investment_warning,
      is_attention = excluded.is_attention,
      stock_type = excluded.stock_type,
      exclude_reason = excluded.exclude_reason,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    String(stock.code),
    String(stock.name),
    stock.market ?? null,
    toFlag(stock.is_etf ?? stock.isEtf ?? inferred.is_etf),
    toFlag(stock.is_etn ?? stock.isEtn ?? inferred.is_etn),
    toFlag(stock.is_spac ?? stock.isSpac ?? inferred.is_spac),
    toFlag(stock.is_reit ?? stock.isReit ?? inferred.is_reit),
    toFlag(stock.is_preferred ?? stock.isPreferred ?? inferred.is_preferred),
    toFlag(stock.is_trading_halt ?? stock.isTradingHalt),
    toFlag(stock.is_administrative ?? stock.isAdministrative),
    toFlag(stock.is_investment_warning ?? stock.isInvestmentWarning),
    toFlag(stock.is_attention ?? stock.isAttention),
    stock.stock_type ?? stock.stockType ?? inferred.stock_type,
    stock.exclude_reason ?? stock.excludeReason ?? inferred.exclude_reason,
  );
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
  exclusionOptions = DEFAULT_STOCK_EXCLUSION_OPTIONS,
} = {}) => {
  const db = openDatabase(dbPath);
  try {
    const whereClause = buildStockExclusionWhere(exclusionOptions);
    const stocks = db
      .prepare(`SELECT code, name, market FROM stocks ${whereClause} ORDER BY code`)
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

const STOCK_EXCLUSION_FILTERS = [
  ["excludeEtf", "is_etf"],
  ["excludeEtn", "is_etn"],
  ["excludeSpac", "is_spac"],
  ["excludeReit", "is_reit"],
  ["excludePreferred", "is_preferred"],
  ["excludeTradingHalt", "is_trading_halt"],
  ["excludeAdministrative", "is_administrative"],
  ["excludeAttention", "is_attention"],
  ["excludeInvestmentWarning", "is_investment_warning"],
];

const buildStockExclusionWhere = (options = DEFAULT_STOCK_EXCLUSION_OPTIONS) => {
  const clauses = STOCK_EXCLUSION_FILTERS
    .filter(([optionName]) => options[optionName] !== false)
    .map(([, column]) => `COALESCE(${column}, 0) = 0`);
  if (options.excludeOther !== false) {
    clauses.push("COALESCE(stock_type, 'COMMON') != 'OTHER'");
  }
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
};

const buildStockExcludedWhere = (options = DEFAULT_STOCK_EXCLUSION_OPTIONS) => {
  const clauses = STOCK_EXCLUSION_FILTERS
    .filter(([optionName]) => options[optionName] !== false)
    .map(([, column]) => `COALESCE(${column}, 0) = 1`);
  if (options.excludeOther !== false) {
    clauses.push("COALESCE(stock_type, 'COMMON') = 'OTHER'");
  }
  return clauses.length ? clauses.join(" OR ") : "0";
};

export const getStockUniverseStats = (
  db,
  options = DEFAULT_STOCK_EXCLUSION_OPTIONS,
) => {
  const scalar = (sql) => db.prepare(sql).get()?.count ?? 0;
  const excludedWhere = buildStockExcludedWhere(options);
  const totalStockCount = scalar("SELECT COUNT(*) AS count FROM stocks");
  const excludedStockCount = scalar(`SELECT COUNT(*) AS count FROM stocks WHERE ${excludedWhere}`);
  return {
    totalStockCount,
    excludedStockCount,
    screeningTargetCount: Math.max(0, totalStockCount - excludedStockCount),
    etfCount: scalar("SELECT COUNT(*) AS count FROM stocks WHERE COALESCE(is_etf, 0) = 1"),
    etnCount: scalar("SELECT COUNT(*) AS count FROM stocks WHERE COALESCE(is_etn, 0) = 1"),
    spacCount: scalar("SELECT COUNT(*) AS count FROM stocks WHERE COALESCE(is_spac, 0) = 1"),
    reitCount: scalar("SELECT COUNT(*) AS count FROM stocks WHERE COALESCE(is_reit, 0) = 1"),
    preferredCount: scalar("SELECT COUNT(*) AS count FROM stocks WHERE COALESCE(is_preferred, 0) = 1"),
    tradingHaltCount: scalar("SELECT COUNT(*) AS count FROM stocks WHERE COALESCE(is_trading_halt, 0) = 1"),
    administrativeCount: scalar("SELECT COUNT(*) AS count FROM stocks WHERE COALESCE(is_administrative, 0) = 1"),
    attentionCount: scalar("SELECT COUNT(*) AS count FROM stocks WHERE COALESCE(is_attention, 0) = 1"),
    investmentWarningCount: scalar("SELECT COUNT(*) AS count FROM stocks WHERE COALESCE(is_investment_warning, 0) = 1"),
    otherCount: scalar("SELECT COUNT(*) AS count FROM stocks WHERE COALESCE(stock_type, 'COMMON') = 'OTHER'"),
  };
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
      min_angle_degree, min_return_rate, min_r_squared,
      excluded_stock_count, screening_target_count,
      exclude_etf, exclude_etn, exclude_spac, exclude_reit, exclude_preferred,
      exclude_trading_halt, exclude_administrative, exclude_attention,
      exclude_investment_warning, note
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    runSummary.excludedStockCount ?? 0,
    runSummary.screeningTargetCount ?? 0,
    toFlag(options.excludeEtf),
    toFlag(options.excludeEtn),
    toFlag(options.excludeSpac),
    toFlag(options.excludeReit),
    toFlag(options.excludePreferred),
    toFlag(options.excludeTradingHalt),
    toFlag(options.excludeAdministrative),
    toFlag(options.excludeAttention),
    toFlag(options.excludeInvestmentWarning),
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
