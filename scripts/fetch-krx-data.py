#!/usr/bin/env python3
import argparse
import math
import sqlite3
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
import re


SCHEMA = """
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
  use_ema_bearish_filter INTEGER DEFAULT 1,
  use_last_price_below_ema5_filter INTEGER DEFAULT 1,
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
  ema5 REAL,
  ema20 REAL,
  ema60 REAL,
  ema112 REAL,
  ema224 REAL,
  ema448 REAL,
  is_long_ema_bearish INTEGER DEFAULT 0,
  is_last_price_below_ema5 INTEGER DEFAULT 0,
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
"""

STOCK_META_COLUMNS = {
    "is_etf": "INTEGER DEFAULT 0",
    "is_etn": "INTEGER DEFAULT 0",
    "is_spac": "INTEGER DEFAULT 0",
    "is_reit": "INTEGER DEFAULT 0",
    "is_preferred": "INTEGER DEFAULT 0",
    "is_trading_halt": "INTEGER DEFAULT 0",
    "is_administrative": "INTEGER DEFAULT 0",
    "is_investment_warning": "INTEGER DEFAULT 0",
    "is_attention": "INTEGER DEFAULT 0",
    "stock_type": "TEXT DEFAULT 'COMMON'",
    "exclude_reason": "TEXT",
}

SCREENING_RUN_EXTRA_COLUMNS = {
    "excluded_stock_count": "INTEGER DEFAULT 0",
    "screening_target_count": "INTEGER DEFAULT 0",
    "exclude_etf": "INTEGER DEFAULT 1",
    "exclude_etn": "INTEGER DEFAULT 1",
    "exclude_spac": "INTEGER DEFAULT 1",
    "exclude_reit": "INTEGER DEFAULT 1",
    "exclude_preferred": "INTEGER DEFAULT 1",
    "exclude_trading_halt": "INTEGER DEFAULT 1",
    "exclude_administrative": "INTEGER DEFAULT 1",
    "exclude_attention": "INTEGER DEFAULT 1",
    "exclude_investment_warning": "INTEGER DEFAULT 0",
    "use_ema_bearish_filter": "INTEGER DEFAULT 1",
    "use_last_price_below_ema5_filter": "INTEGER DEFAULT 1",
}

FILTERED_STOCK_EXTRA_COLUMNS = {
    "ema5": "REAL",
    "ema20": "REAL",
    "ema60": "REAL",
    "ema112": "REAL",
    "ema224": "REAL",
    "ema448": "REAL",
    "is_long_ema_bearish": "INTEGER DEFAULT 0",
    "is_last_price_below_ema5": "INTEGER DEFAULT 0",
}

ETF_KEYWORDS = (
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
)


def ensure_columns(conn, table_name, columns):
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table_name})")}
    for name, definition in columns.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {name} {definition}")


def init_database(db_path):
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    ensure_columns(conn, "stocks", STOCK_META_COLUMNS)
    ensure_columns(conn, "screening_runs", SCREENING_RUN_EXTRA_COLUMNS)
    ensure_columns(conn, "filtered_stocks", FILTERED_STOCK_EXTRA_COLUMNS)
    conn.commit()
    return conn


def upsert_stock(conn, stock):
    conn.execute(
        """
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
        """,
        (
            stock["code"],
            stock["name"],
            stock.get("market"),
            int(stock.get("is_etf", 0)),
            int(stock.get("is_etn", 0)),
            int(stock.get("is_spac", 0)),
            int(stock.get("is_reit", 0)),
            int(stock.get("is_preferred", 0)),
            int(stock.get("is_trading_halt", 0)),
            int(stock.get("is_administrative", 0)),
            int(stock.get("is_investment_warning", 0)),
            int(stock.get("is_attention", 0)),
            stock.get("stock_type", "COMMON"),
            stock.get("exclude_reason"),
        ),
    )


def upsert_price_rows(conn, code, prices):
    conn.executemany(
        """
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
        """,
        [
            (
                code,
                row["date"],
                row["open"],
                row["high"],
                row["low"],
                row["close"],
                row.get("volume", 0),
            )
            for row in prices
        ],
    )


def require_finance_datareader():
    try:
        import FinanceDataReader as fdr

        return fdr
    except ImportError:
        print(
            "FinanceDataReader is not installed. Run: pip install finance-datareader",
            file=sys.stderr,
        )
        raise


def row_text(row, key):
    value = row.get(key, "")
    if value is None:
        return ""
    try:
        if math.isnan(value):
            return ""
    except TypeError:
        pass
    return str(value).strip()


def has_any_keyword(text, keywords):
    upper = text.upper()
    return any(keyword.upper() in upper for keyword in keywords)


def is_preferred_name(name):
    normalized = re.sub(r"\s+", "", name)
    return bool(
        re.search(r"(우|우B|우C|[1-9]우|[1-9]우B|전환우|종류주)$", normalized)
    )


def classify_stock(row, default_market=""):
    name = row_text(row, "Name")
    market = row_text(row, "Market") or default_market
    market_id = row_text(row, "MarketId")
    dept = row_text(row, "Dept")
    combined = " ".join([name, market, market_id, dept])
    upper_combined = combined.upper()

    flags = {
        "is_etf": int(market.upper() == "ETF" or "ETF" in upper_combined or has_any_keyword(name, ETF_KEYWORDS)),
        "is_etn": int(market.upper() == "ETN" or "ETN" in upper_combined),
        "is_spac": int(has_any_keyword(combined, ("스팩", "SPAC", "기업인수목적"))),
        "is_reit": int(has_any_keyword(combined, ("리츠", "REIT"))),
        "is_preferred": int(is_preferred_name(name)),
        "is_trading_halt": int(has_any_keyword(dept, ("거래정지", "매매거래정지", "정지"))),
        "is_administrative": int(has_any_keyword(dept, ("관리종목", "관리"))),
        "is_investment_warning": int(has_any_keyword(dept, ("투자주의", "투자경고", "투자위험"))),
        "is_attention": int(has_any_keyword(dept, ("투자주의환기", "환기"))),
    }

    if flags["is_etf"]:
        stock_type = "ETF"
    elif flags["is_etn"]:
        stock_type = "ETN"
    elif flags["is_spac"]:
        stock_type = "SPAC"
    elif flags["is_reit"]:
        stock_type = "REIT"
    elif flags["is_preferred"]:
        stock_type = "PREFERRED"
    elif market and market.upper() not in ("KOSPI", "KOSDAQ", "KONEX", "SAMPLE"):
        stock_type = "OTHER"
    else:
        stock_type = "COMMON"

    reasons = []
    reason_map = [
        ("is_etf", "ETF"),
        ("is_etn", "ETN"),
        ("is_spac", "SPAC"),
        ("is_reit", "REIT"),
        ("is_preferred", "PREFERRED"),
        ("is_trading_halt", "TRADING_HALT"),
        ("is_administrative", "ADMINISTRATIVE"),
        ("is_attention", "ATTENTION"),
        ("is_investment_warning", "INVESTMENT_WARNING"),
    ]
    for flag_name, reason in reason_map:
        if flags[flag_name]:
            reasons.append(reason)
    if stock_type == "OTHER":
        reasons.append("OTHER")

    return {
        **flags,
        "stock_type": stock_type,
        "exclude_reason": ",".join(reasons) if reasons else None,
    }


def fetch_stock_list():
    fdr = require_finance_datareader()
    try:
        frames = [fdr.StockListing("KRX")]
    except Exception:
        frames = []
        for market in ("KOSPI", "KOSDAQ"):
            frame = fdr.StockListing(market)
            frame["Market"] = market
            frames.append(frame)
    stock_list = []
    for frame in frames:
        for _, row in frame.iterrows():
            code = str(row.get("Code", "")).zfill(6)
            name = row_text(row, "Name")
            market = row_text(row, "Market")
            if len(code) == 6 and name:
                stock_list.append(
                    {
                        "code": code,
                        "name": name,
                        "market": market,
                        **classify_stock(row, market),
                    }
                )
    return stock_list


def normalize_price_row(date, row):
    def number(value):
        if value is None:
            return None
        try:
            if math.isnan(value):
                return None
        except TypeError:
            pass
        return float(value)

    open_price = number(row.get("Open"))
    high = number(row.get("High"))
    low = number(row.get("Low"))
    close = number(row.get("Close"))
    volume = number(row.get("Volume")) or 0
    if not all(value and value > 0 for value in (open_price, high, low, close)):
        return None
    high = max(high, open_price, close)
    low = min(low, open_price, close)
    return {
        "date": date.strftime("%Y-%m-%d"),
        "open": int(round(open_price)),
        "high": int(round(high)),
        "low": int(round(low)),
        "close": int(round(close)),
        "volume": int(round(max(0, volume))),
    }


def fetch_ohlcv(code, start_date, end_date):
    fdr = require_finance_datareader()
    frame = fdr.DataReader(code, str(start_date), str(end_date))
    if frame is None or frame.empty:
        return []
    rows = []
    for date, row in frame.iterrows():
        normalized = normalize_price_row(date, row)
        if normalized:
            rows.append(normalized)
    return rows


def get_price_data_status(conn, code):
    row = conn.execute(
        """
        SELECT COUNT(*) AS price_count,
               MIN(date) AS first_date,
               MAX(date) AS last_date
        FROM stock_prices
        WHERE code = ?
        """,
        (code,),
    ).fetchone()
    return {
        "price_count": int(row[0]) if row else 0,
        "first_date": row[1] if row else None,
        "last_date": row[2] if row else None,
    }


def days_between(date1, date2):
    if isinstance(date1, str):
        date1 = datetime.strptime(date1, "%Y-%m-%d").date()
    if isinstance(date2, str):
        date2 = datetime.strptime(date2, "%Y-%m-%d").date()
    return abs((date2 - date1).days)


def should_fetch_price_data(status, options):
    if options.force:
        return {"should_fetch": True, "reason": "FORCE"}

    if not options.skip_existing:
        return {"should_fetch": True, "reason": "SKIP_EXISTING_DISABLED"}

    price_count = int(status.get("price_count") or 0)
    if price_count == 0:
        return {"should_fetch": True, "reason": "NO_DATA"}

    if price_count < options.min_price_rows:
        return {"should_fetch": True, "reason": "NOT_ENOUGH_ROWS"}

    last_date = status.get("last_date")
    if not last_date:
        return {"should_fetch": True, "reason": "NO_LAST_DATE"}

    try:
        stale_days = days_between(last_date, datetime.now().date())
    except ValueError:
        return {"should_fetch": True, "reason": "INVALID_LAST_DATE"}

    if stale_days > options.stale_days:
        return {"should_fetch": True, "reason": "STALE_DATA"}

    return {"should_fetch": False, "reason": "OK_SKIP"}


def save_stocks_to_database(
    stocks,
    db_path,
    end_date,
    options,
    sleep_seconds,
):
    conn = init_database(db_path)
    fetched = 0
    skipped = 0
    failed = 0
    skip_reasons = {}
    fetch_reasons = {}
    try:
        for index, stock in enumerate(stocks, start=1):
            try:
                upsert_stock(conn, stock)
                status = get_price_data_status(conn, stock["code"])
                decision = should_fetch_price_data(status, options)
                reason = decision["reason"]

                if not decision["should_fetch"]:
                    skipped += 1
                    skip_reasons[reason] = skip_reasons.get(reason, 0) + 1
                    conn.commit()
                    print(
                        f"[{index}/{len(stocks)}] SKIP {stock['code']} {stock['name']} "
                        f"reason={reason} count={status['price_count']} last_date={status['last_date']}"
                    )
                    continue

                fetch_reasons[reason] = fetch_reasons.get(reason, 0) + 1
                start_date = end_date - timedelta(days=options.days)
                print(
                    f"[{index}/{len(stocks)}] FETCH {stock['code']} {stock['name']} "
                    f"reason={reason} count={status['price_count']} last_date={status['last_date']}"
                )
                prices = fetch_ohlcv(stock["code"], start_date, end_date)
                if not prices:
                    print(f"[{index}/{len(stocks)}] skip {stock['code']} {stock['name']} - no OHLCV")
                    continue
                upsert_price_rows(conn, stock["code"], prices)
                conn.commit()
                fetched += 1
                print(
                    f"[{index}/{len(stocks)}] saved {stock['code']} {stock['name']} "
                    f"range={start_date}~{end_date} rows={len(prices)}"
                )
            except Exception as error:
                conn.rollback()
                failed += 1
                print(f"[{index}/{len(stocks)}] failed {stock['code']} {stock['name']}: {error}")
            if sleep_seconds > 0:
                time.sleep(sleep_seconds)
    finally:
        conn.close()
    return fetched, skipped, failed, fetch_reasons, skip_reasons


def parse_args():
    parser = argparse.ArgumentParser(description="Fetch KRX OHLCV data into SQLite")
    parser.add_argument(
        "--days",
        type=int,
        default=700,
        help="Initial collection window. Use 700+ calendar days for EMA448.",
    )
    parser.add_argument(
        "--incremental-days",
        type=int,
        default=10,
        help="Deprecated. Existing data is skipped unless missing, stale, insufficient, or --force is used.",
    )
    parser.add_argument("--max-stocks", type=int, default=None)
    parser.add_argument("--db-path", default="data/stocks.db")
    parser.add_argument("--sleep", type=float, default=0.1)
    parser.add_argument("--end-date", default=None)
    parser.add_argument(
        "--skip-existing",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Skip stocks with enough fresh price rows. Enabled by default.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        default=False,
        help="Fetch all stocks regardless of existing DB price rows.",
    )
    parser.add_argument(
        "--min-price-rows",
        type=int,
        default=448,
        help="Minimum stock_prices rows required before a stock can be skipped.",
    )
    parser.add_argument(
        "--stale-days",
        type=int,
        default=5,
        help="Fetch again if the latest stored price date is older than this many calendar days.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    end_date = (
        datetime.strptime(args.end_date, "%Y-%m-%d").date()
        if args.end_date
        else (datetime.now() - timedelta(days=0)).date()
    )
    try:
        stocks = fetch_stock_list()
    except Exception as error:
        print(f"failed to fetch KRX stock list: {error}", file=sys.stderr)
        print(
            "Check network/DNS access to data.krx.co.kr and retry.",
            file=sys.stderr,
        )
        sys.exit(1)
    if args.max_stocks:
        stocks = stocks[: args.max_stocks]
    print(f"target stocks: {len(stocks)}")
    print(f"end date: {end_date}")
    print(f"days: {args.days}")
    print(f"skip existing: {args.skip_existing}")
    print(f"force: {args.force}")
    print(f"min price rows: {args.min_price_rows}")
    print(f"stale days: {args.stale_days}")
    fetched, skipped, failed, fetch_reasons, skip_reasons = save_stocks_to_database(
        stocks,
        args.db_path,
        end_date,
        args,
        args.sleep,
    )
    print(f"done. total={len(stocks)}, fetched={fetched}, skipped={skipped}, failed={failed}, db={args.db_path}")
    print("fetch reason:")
    for reason, count in sorted(fetch_reasons.items()):
        print(f"  {reason}: {count}")
    print("skip reason:")
    for reason, count in sorted(skip_reasons.items()):
        print(f"  {reason}: {count}")


if __name__ == "__main__":
    main()
