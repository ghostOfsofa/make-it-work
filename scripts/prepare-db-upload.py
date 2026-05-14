#!/usr/bin/env python3
import argparse
import shutil
import sqlite3
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(
        description="Create a safe SQLite DB copy for uploading to a server"
    )
    parser.add_argument("--db-path", default="data/stocks.db")
    parser.add_argument("--output", default="dist/stocks.db")
    return parser.parse_args()


def table_count(conn, table_name):
    return conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]


def main():
    args = parse_args()
    source = Path(args.db_path)
    output = Path(args.output)

    if not source.exists():
        raise SystemExit(f"DB not found: {source}")

    output.parent.mkdir(parents=True, exist_ok=True)

    source_conn = sqlite3.connect(source)
    try:
        # Flush WAL pages so the backup sees a consistent completed database.
        source_conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")

        if output.exists():
            output.unlink()

        output_conn = sqlite3.connect(output)
        try:
            source_conn.backup(output_conn)
            output_conn.execute("PRAGMA integrity_check")
            output_conn.commit()
        finally:
            output_conn.close()
    finally:
        source_conn.close()

    # Keep permissions predictable after backup.
    shutil.copymode(source, output)

    conn = sqlite3.connect(output)
    try:
        stock_count = table_count(conn, "stocks")
        price_count = table_count(conn, "stock_prices")
        run_count = table_count(conn, "screening_runs")
    finally:
        conn.close()

    print(f"upload DB created: {output}")
    print(f"stocks: {stock_count}")
    print(f"stock_prices: {price_count}")
    print(f"screening_runs: {run_count}")
    print("Upload this file to the server path expected by DB_PATH, usually data/stocks.db.")


if __name__ == "__main__":
    main()
