#!/usr/bin/env python3
import argparse
import csv
import sqlite3
import sys
from pathlib import Path


COLUMNS = [
    "code",
    "name",
    "market",
    "date",
    "open",
    "high",
    "low",
    "close",
    "volume",
]


def parse_args():
    parser = argparse.ArgumentParser(
        description="Query per-stock daily OHLCV rows from local SQLite DB"
    )
    parser.add_argument("--db-path", default="data/stocks.db")
    parser.add_argument(
        "--code",
        action="append",
        help="Stock code. Repeatable. Example: --code 005930 --code 000660",
    )
    parser.add_argument(
        "--name",
        help="Partial stock name search. Example: --name 삼성",
    )
    parser.add_argument("--date", help="Exact date YYYY-MM-DD")
    parser.add_argument("--from-date", dest="from_date", help="Start date YYYY-MM-DD")
    parser.add_argument("--to-date", dest="to_date", help="End date YYYY-MM-DD")
    parser.add_argument("--latest", action="store_true", help="Show latest row per stock")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--csv", action="store_true", help="Print CSV instead of table")
    parser.add_argument("--output", help="Write CSV to file path")
    return parser.parse_args()


def build_query(args):
    where = []
    params = []

    if args.code:
        codes = [str(code).zfill(6) for code in args.code]
        placeholders = ",".join("?" for _ in codes)
        where.append(f"s.code IN ({placeholders})")
        params.extend(codes)

    if args.name:
        where.append("s.name LIKE ?")
        params.append(f"%{args.name}%")

    if args.date:
        where.append("p.date = ?")
        params.append(args.date)

    if args.from_date:
        where.append("p.date >= ?")
        params.append(args.from_date)

    if args.to_date:
        where.append("p.date <= ?")
        params.append(args.to_date)

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""

    if args.latest:
        query = f"""
            WITH ranked AS (
              SELECT
                s.code,
                s.name,
                s.market,
                p.date,
                p.open,
                p.high,
                p.low,
                p.close,
                p.volume,
                ROW_NUMBER() OVER (
                  PARTITION BY s.code
                  ORDER BY p.date DESC
                ) AS row_no
              FROM stock_prices p
              JOIN stocks s ON s.code = p.code
              {where_sql}
            )
            SELECT {", ".join(COLUMNS)}
            FROM ranked
            WHERE row_no = 1
            ORDER BY code
            LIMIT ?
        """
    else:
        query = f"""
            SELECT
              s.code,
              s.name,
              s.market,
              p.date,
              p.open,
              p.high,
              p.low,
              p.close,
              p.volume
            FROM stock_prices p
            JOIN stocks s ON s.code = p.code
            {where_sql}
            ORDER BY s.code, p.date DESC
            LIMIT ?
        """

    params.append(max(1, args.limit))
    return query, params


def print_table(rows):
    if not rows:
        print("no price rows found")
        return

    widths = {
        column: max(
            len(column),
            *(len(str(row[column])) for row in rows),
        )
        for column in COLUMNS
    }
    header = "  ".join(column.ljust(widths[column]) for column in COLUMNS)
    divider = "  ".join("-" * widths[column] for column in COLUMNS)
    print(header)
    print(divider)
    for row in rows:
        print("  ".join(str(row[column]).ljust(widths[column]) for column in COLUMNS))


def write_csv(rows, output=None):
    target = open(output, "w", newline="", encoding="utf-8-sig") if output else sys.stdout
    try:
        writer = csv.DictWriter(target, fieldnames=COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow({column: row[column] for column in COLUMNS})
    finally:
        if output:
            target.close()
            print(f"csv written: {output}")


def main():
    args = parse_args()
    db_path = Path(args.db_path)
    if not db_path.exists():
        print(f"DB not found: {db_path}", file=sys.stderr)
        print("Create it with `npm run create:sample-db` or `npm run fetch:krx`.", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        query, params = build_query(args)
        rows = conn.execute(query, params).fetchall()
        if args.csv or args.output:
            write_csv(rows, args.output)
        else:
            print_table(rows)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
