#!/usr/bin/env python3
import argparse
import sqlite3
from pathlib import Path


def scalar(conn, sql, params=()):
    return conn.execute(sql, params).fetchone()[0]


def has_column(conn, table_name, column_name):
    return any(row[1] == column_name for row in conn.execute(f"PRAGMA table_info({table_name})"))


def count_flag(conn, column_name):
    if not has_column(conn, "stocks", column_name):
        return 0
    return scalar(conn, f"SELECT COUNT(*) FROM stocks WHERE COALESCE({column_name}, 0) = 1")


def count_common_targets(conn):
    required = [
        "is_etf",
        "is_etn",
        "is_spac",
        "is_reit",
        "is_preferred",
        "is_trading_halt",
        "is_administrative",
        "is_attention",
        "stock_type",
    ]
    if not all(has_column(conn, "stocks", column) for column in required):
        return 0
    return scalar(
        conn,
        """
        SELECT COUNT(*)
        FROM stocks
        WHERE COALESCE(is_etf, 0) = 0
          AND COALESCE(is_etn, 0) = 0
          AND COALESCE(is_spac, 0) = 0
          AND COALESCE(is_reit, 0) = 0
          AND COALESCE(is_preferred, 0) = 0
          AND COALESCE(is_trading_halt, 0) = 0
          AND COALESCE(is_administrative, 0) = 0
          AND COALESCE(is_attention, 0) = 0
          AND COALESCE(stock_type, 'COMMON') != 'OTHER'
        """,
    )


def count_other(conn):
    if not has_column(conn, "stocks", "stock_type"):
        return 0
    return scalar(conn, "SELECT COUNT(*) FROM stocks WHERE COALESCE(stock_type, 'COMMON') = 'OTHER'")


def print_rows(title, rows):
    print(title)
    if not rows:
        print("  -")
        return
    for row in rows:
        print("  " + " | ".join(f"{key}={row[key]}" for key in row.keys()))


def main():
    parser = argparse.ArgumentParser(description="Inspect stocks SQLite database")
    parser.add_argument("--db-path", default="data/stocks.db")
    parser.add_argument("--code", default=None)
    args = parser.parse_args()

    if not Path(args.db_path).exists():
        print(f"DB not found: {args.db_path}")
        return

    conn = sqlite3.connect(args.db_path)
    conn.row_factory = sqlite3.Row
    try:
        print(f"db: {args.db_path}")
        print(f"stocks count: {scalar(conn, 'SELECT COUNT(*) FROM stocks')}")
        print(f"stock_prices rows: {scalar(conn, 'SELECT COUNT(*) FROM stock_prices')}")
        print(f"screening runs: {scalar(conn, 'SELECT COUNT(*) FROM screening_runs')}")
        print(f"filtered stocks: {scalar(conn, 'SELECT COUNT(*) FROM filtered_stocks')}")
        print(f"buy signals: {scalar(conn, 'SELECT COUNT(*) FROM buy_signals')}")
        print("stock exclusion stats:")
        print(f"  ETF: {count_flag(conn, 'is_etf')}")
        print(f"  ETN: {count_flag(conn, 'is_etn')}")
        print(f"  SPAC: {count_flag(conn, 'is_spac')}")
        print(f"  REIT: {count_flag(conn, 'is_reit')}")
        print(f"  Preferred: {count_flag(conn, 'is_preferred')}")
        print(f"  Trading halt: {count_flag(conn, 'is_trading_halt')}")
        print(f"  Administrative: {count_flag(conn, 'is_administrative')}")
        print(f"  Attention: {count_flag(conn, 'is_attention')}")
        print(f"  Investment warning: {count_flag(conn, 'is_investment_warning')}")
        print(f"  Other: {count_other(conn)}")
        print(f"  Common screening targets: {count_common_targets(conn)}")
        latest = conn.execute(
            "SELECT * FROM screening_runs ORDER BY run_id DESC LIMIT 1"
        ).fetchone()
        if latest:
            print(f"latest run id: {latest['run_id']}")
            print(f"latest base date: {latest['base_date']}")
            print(f"latest matched stocks: {latest['matched_stock_count']}")
        print_rows(
            "recent buy signals:",
            conn.execute(
                """
                SELECT signal_time, code, name, current_price, ma5_price, status
                FROM buy_signals
                ORDER BY signal_time DESC
                LIMIT 10
                """
            ).fetchall(),
        )
        if args.code:
            print_rows(
                f"recent prices for {args.code}:",
                conn.execute(
                    """
                    SELECT date, open, high, low, close, volume
                    FROM stock_prices
                    WHERE code = ?
                    ORDER BY date DESC
                    LIMIT 10
                    """,
                    (args.code,),
                ).fetchall(),
            )
    finally:
        conn.close()


if __name__ == "__main__":
    main()
