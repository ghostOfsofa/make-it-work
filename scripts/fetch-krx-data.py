#!/usr/bin/env python3
import argparse
import math
import sqlite3
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path


SCHEMA = """
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
"""


def init_database(db_path):
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    conn.commit()
    return conn


def upsert_stock(conn, stock):
    conn.execute(
        """
        INSERT INTO stocks (code, name, market, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(code) DO UPDATE SET
          name = excluded.name,
          market = excluded.market,
          updated_at = CURRENT_TIMESTAMP
        """,
        (stock["code"], stock["name"], stock.get("market")),
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


def fetch_stock_list():
    fdr = require_finance_datareader()
    frames = []
    for market in ("KOSPI", "KOSDAQ"):
        frame = fdr.StockListing(market)
        frame["Market"] = market
        frames.append(frame)
    stock_list = []
    for frame in frames:
        for _, row in frame.iterrows():
            code = str(row.get("Code", "")).zfill(6)
            name = str(row.get("Name", "")).strip()
            market = str(row.get("Market", "")).strip()
            if len(code) == 6 and name:
                stock_list.append({"code": code, "name": name, "market": market})
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
    frame = fdr.DataReader(code, start_date, end_date)
    if frame is None or frame.empty:
        return []
    rows = []
    for date, row in frame.iterrows():
        normalized = normalize_price_row(date, row)
        if normalized:
            rows.append(normalized)
    return rows


def save_stocks_to_database(stocks, db_path, start_date, end_date, sleep_seconds):
    conn = init_database(db_path)
    saved = 0
    failed = 0
    try:
        for index, stock in enumerate(stocks, start=1):
            try:
                prices = fetch_ohlcv(stock["code"], start_date, end_date)
                if not prices:
                    print(f"[{index}/{len(stocks)}] skip {stock['code']} {stock['name']} - no OHLCV")
                    continue
                upsert_stock(conn, stock)
                upsert_price_rows(conn, stock["code"], prices)
                conn.commit()
                saved += 1
                print(f"[{index}/{len(stocks)}] saved {stock['code']} {stock['name']} rows={len(prices)}")
            except Exception as error:
                conn.rollback()
                failed += 1
                print(f"[{index}/{len(stocks)}] failed {stock['code']} {stock['name']}: {error}")
            if sleep_seconds > 0:
                time.sleep(sleep_seconds)
    finally:
        conn.close()
    return saved, failed


def parse_args():
    parser = argparse.ArgumentParser(description="Fetch KRX OHLCV data into SQLite")
    parser.add_argument("--days", type=int, default=180)
    parser.add_argument("--max-stocks", type=int, default=None)
    parser.add_argument("--db-path", default="data/stocks.db")
    parser.add_argument("--sleep", type=float, default=0.1)
    parser.add_argument("--end-date", default=None)
    return parser.parse_args()


def main():
    args = parse_args()
    end_date = (
        datetime.strptime(args.end_date, "%Y-%m-%d").date()
        if args.end_date
        else (datetime.now() - timedelta(days=1)).date()
    )
    start_date = end_date - timedelta(days=max(args.days * 2, args.days + 30))
    stocks = fetch_stock_list()
    if args.max_stocks:
        stocks = stocks[: args.max_stocks]
    print(f"target stocks: {len(stocks)}")
    print(f"date range: {start_date} ~ {end_date}")
    saved, failed = save_stocks_to_database(
        stocks,
        args.db_path,
        start_date.strftime("%Y-%m-%d"),
        end_date.strftime("%Y-%m-%d"),
        args.sleep,
    )
    print(f"done. saved={saved}, failed={failed}, db={args.db_path}")


if __name__ == "__main__":
    main()
