import { existsSync, unlinkSync } from "node:fs";
import { generateSampleStocks } from "./sampleData.js";
import { openDatabase, upsertPriceRows, upsertStock } from "./db.js";
import { DEFAULT_DB_PATH } from "./config.js";

const dbPath = process.env.DB_PATH ?? DEFAULT_DB_PATH;
const stockCount = Number(process.env.SAMPLE_STOCK_COUNT ?? 300);
const candleCount = Number(process.env.SAMPLE_CANDLE_COUNT ?? 700);
const reset = process.argv.includes("--reset") || process.env.RESET_SAMPLE_DB === "1";
const force = process.argv.includes("--force") || process.env.FORCE_SAMPLE_DB === "1";

if (reset && existsSync(dbPath)) {
  unlinkSync(dbPath);
}

const db = openDatabase(dbPath);
const existingPriceCount =
  db.prepare("SELECT COUNT(*) AS count FROM stock_prices").get()?.count ?? 0;

if (!force && existingPriceCount > 0) {
  console.log(`sample DB creation skipped: ${dbPath}`);
  console.log(`existing stock_prices rows: ${existingPriceCount}`);
  console.log("Use --force or RESET_SAMPLE_DB=1 only when you intentionally want sample data.");
  db.close();
  process.exit(0);
}

const stocks = generateSampleStocks({
  stockCount,
  candleCount,
  seed: Date.now(),
});

const saveMany = db.transaction((rows) => {
  for (const stock of rows) {
    upsertStock(db, stock);
    upsertPriceRows(db, stock.code, stock.prices);
  }
});

saveMany(stocks);

console.log(`sample DB created: ${dbPath}`);
console.log(`stocks: ${stocks.length}`);
console.log(`candles per stock: ${candleCount}`);

db.close();
