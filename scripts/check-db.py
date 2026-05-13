#!/usr/bin/env python3
import argparse
import sqlite3
from pathlib import Path


def scalar(conn, sql, params=()):
    return conn.execute(sql, params).fetchone()[0]


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
