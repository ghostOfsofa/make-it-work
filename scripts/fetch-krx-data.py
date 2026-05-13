#!/usr/bin/env python3
"""Fetch Korean OHLCV data with FinanceDataReader and write dated data snapshots."""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch KRX OHLCV data")
    parser.add_argument("--days", type=int, default=180, help="calendar days to request")
    parser.add_argument(
        "--end-date",
        default=None,
        help="last calendar date to request in YYYY-MM-DD. Defaults to yesterday.",
    )
    parser.add_argument("--max-stocks", type=int, default=None, help="limit stock count for tests")
    parser.add_argument("--sleep", type=float, default=0.08, help="sleep seconds between requests")
    parser.add_argument(
        "--output-dir",
        default="data",
        help="directory for stocks-YYYY-MM-DD.json snapshots",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="optional explicit output JSON path. Defaults to data/stocks-YYYY-MM-DD.json",
    )
    parser.add_argument(
        "--no-compat",
        action="store_true",
        help="do not update data/stocks.json compatibility copy",
    )
    return parser.parse_args()


def require_fdr():
    try:
        import FinanceDataReader as fdr  # type: ignore
    except ImportError:
        print(
            "FinanceDataReader is not installed. Install it with:\n"
            "  pip install finance-datareader",
            file=sys.stderr,
        )
        raise SystemExit(1)
    return fdr


def clean_number(value):
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or number <= 0:
        return None
    return int(round(number))


def dataframe_to_prices(df):
    prices = []
    for idx, row in df.iterrows():
        open_ = clean_number(row.get("Open"))
        high = clean_number(row.get("High"))
        low = clean_number(row.get("Low"))
        close = clean_number(row.get("Close"))
        volume = row.get("Volume", 0)

        if None in (open_, high, low, close):
            continue

        prices.append(
            {
                "date": idx.strftime("%Y-%m-%d"),
                "open": open_,
                "high": max(high, open_, close),
                "low": min(low, open_, close),
                "close": close,
                "volume": int(volume) if volume == volume and volume is not None else 0,
            }
        )
    return prices


def resolve_date_range(days: int, end_date: str | None) -> tuple[str, str]:
    if end_date:
        try:
            end = datetime.strptime(end_date, "%Y-%m-%d")
        except ValueError:
            print("--end-date must use YYYY-MM-DD format", file=sys.stderr)
            raise SystemExit(2)
    else:
        # Use yesterday by default so an in-progress current trading day is not mixed in.
        end = datetime.now() - timedelta(days=1)

    start = end - timedelta(days=days)
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


def main() -> int:
    args = parse_args()
    fdr = require_fdr()
    start, end = resolve_date_range(args.days, args.end_date)
    output_dir = Path(args.output_dir)
    output_path = Path(args.output) if args.output else output_dir / f"stocks-{end}.json"
    latest_path = output_dir / "latest.json"
    compat_path = output_dir / "stocks.json"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    stocks = []
    listings = []
    for market in ("KOSPI", "KOSDAQ"):
        try:
            df = fdr.StockListing(market)
        except Exception as exc:
            print(f"[WARN] Failed to load {market} listing: {exc}", file=sys.stderr)
            continue
        for _, row in df.iterrows():
            code = str(row.get("Code", "")).zfill(6)
            name = str(row.get("Name", "")).strip()
            if code and name:
                listings.append({"code": code, "name": name, "market": market})

    if args.max_stocks:
        listings = listings[: args.max_stocks]

    total = len(listings)
    print(f"Fetching {total} stocks from {start} to {end}")

    for index, item in enumerate(listings, start=1):
        code = item["code"]
        try:
            df = fdr.DataReader(code, start, end)
            prices = dataframe_to_prices(df)
            if not prices:
                print(f"[SKIP] {index}/{total} {code} {item['name']} no OHLCV")
                continue
            stocks.append({**item, "prices": prices})
            print(f"[OK] {index}/{total} {code} {item['name']} candles={len(prices)}")
        except Exception as exc:
            print(f"[WARN] {index}/{total} {code} {item['name']} failed: {exc}", file=sys.stderr)
        time.sleep(args.sleep)

    metadata = {
        "date": end,
        "startDate": start,
        "stockCount": len(stocks),
        "file": output_path.name,
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
    }

    output_path.write_text(json.dumps(stocks, ensure_ascii=False, indent=2), encoding="utf-8")
    latest_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    if not args.no_compat:
        compat_path.write_text(json.dumps(stocks, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote {len(stocks)} stocks to {output_path}")
    print(f"Wrote latest metadata to {latest_path}")
    if not args.no_compat:
        print(f"Updated compatibility copy at {compat_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
