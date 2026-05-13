import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { generateSampleStocks } from "./sampleData.js";

const isPositiveNumber = (value) =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export const normalizeCandle = (candle) => {
  if (candle == null) return null;

  const open = Number(candle.open);
  const high = Number(candle.high);
  const low = Number(candle.low);
  const close = Number(candle.close);
  const volume = Number(candle.volume ?? 0);

  if (
    !isPositiveNumber(open) ||
    !isPositiveNumber(high) ||
    !isPositiveNumber(low) ||
    !isPositiveNumber(close)
  ) {
    return null;
  }

  return {
    date: String(candle.date ?? ""),
    open,
    high: Math.max(high, open, close),
    low: Math.min(low, open, close),
    close,
    volume: Number.isFinite(volume) && volume >= 0 ? Math.round(volume) : 0,
  };
};

export const validateAndNormalizeStocks = (stocks, { minCandles = 10 } = {}) => {
  if (!Array.isArray(stocks)) return [];

  return stocks
    .map((stock) => {
      if (stock == null || !stock.code || !stock.name || !Array.isArray(stock.prices)) {
        return null;
      }

      const prices = stock.prices
        .map(normalizeCandle)
        .filter(Boolean)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));

      if (prices.length < minCandles) return null;

      return {
        code: String(stock.code).padStart(6, "0"),
        name: String(stock.name),
        market: String(stock.market ?? "UNKNOWN"),
        patternType: stock.patternType ? String(stock.patternType) : undefined,
        prices,
      };
    })
    .filter(Boolean);
};

const readJsonIfExists = (path) => {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) return null;
  return JSON.parse(raw);
};

const findLatestDatedStocksFile = (dataDir = "data") => {
  if (!existsSync(dataDir)) return null;

  const latestMetadata = readJsonIfExists(join(dataDir, "latest.json"));
  if (latestMetadata?.file) {
    const metadataPath = join(dataDir, latestMetadata.file);
    if (existsSync(metadataPath)) {
      return {
        dataPath: metadataPath,
        dataDate: latestMetadata.date ? String(latestMetadata.date) : null,
      };
    }
  }

  const snapshotFile = readdirSync(dataDir)
    .filter((fileName) => /^stocks-\d{4}-\d{2}-\d{2}\.json$/.test(fileName))
    .sort()
    .at(-1);

  if (!snapshotFile) return null;

  return {
    dataPath: join(dataDir, snapshotFile),
    dataDate: snapshotFile.replace("stocks-", "").replace(".json", ""),
  };
};

const getLastCandleDate = (stocks) =>
  stocks
    .flatMap((stock) => stock.prices.at(-1)?.date ?? [])
    .sort()
    .at(-1) ?? null;

export const loadStocksData = ({
  dataPath = "data/stocks.json",
  dataDir = "data",
  dataDate = null,
  fallbackToSample = true,
  sampleStockCount = 300,
  sampleCandleCount = 120,
  minCandles = 10,
} = {}) => {
  const latestSnapshot = findLatestDatedStocksFile(dataDir);
  const requestedDataPath = dataDate
    ? join(dataDir, `stocks-${dataDate}.json`)
    : latestSnapshot?.dataPath ?? dataPath;

  try {
    const parsed = readJsonIfExists(requestedDataPath);
    const realStocks = validateAndNormalizeStocks(parsed, { minCandles });

    if (realStocks.length > 0) {
      const resolvedDataDate = dataDate ?? latestSnapshot?.dataDate ?? getLastCandleDate(realStocks);
      const currentStocks = resolvedDataDate
        ? realStocks.filter((stock) => stock.prices.at(-1)?.date === resolvedDataDate)
        : realStocks;

      console.log(`Loaded real stock data from ${requestedDataPath}`);
      return {
        dataSource: "real",
        dataPath: requestedDataPath,
        dataDate: resolvedDataDate,
        stocks: currentStocks,
      };
    }

    if (parsed != null) {
      console.warn(
        `${requestedDataPath} exists but contains no valid stock data. Falling back to sample data.`,
      );
    }
  } catch (error) {
    console.warn(`Failed to load ${requestedDataPath}: ${error.message}`);
  }

  if (!fallbackToSample) {
    return { dataSource: "real", stocks: [] };
  }

  const sampleStocks = generateSampleStocks({
    stockCount: sampleStockCount,
    candleCount: sampleCandleCount,
  });

  console.log("Using generated sample stock data");
  const stocks = validateAndNormalizeStocks(sampleStocks, { minCandles });
  return {
    dataSource: "sample",
    dataPath: null,
    dataDate: getLastCandleDate(stocks),
    stocks,
  };
};
