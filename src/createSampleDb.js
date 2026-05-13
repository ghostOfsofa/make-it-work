import { existsSync, unlinkSync } from "node:fs";
import { generateSampleStocks } from "./sampleData.js";
import { openDatabase, upsertPriceRows, upsertStock } from "./db.js";

const dbPath = process.env.DB_PATH ?? "data/stocks.db";
const stockCount = Number(process.env.SAMPLE_STOCK_COUNT ?? 300);
const candleCount = Number(process.env.SAMPLE_CANDLE_COUNT ?? 120);
const reset = process.argv.includes("--reset") || process.env.RESET_SAMPLE_DB === "1";

if (reset && existsSync(dbPath)) {
  unlinkSync(dbPath);
}

const db = openDatabase(dbPath);
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
