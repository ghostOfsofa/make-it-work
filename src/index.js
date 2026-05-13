import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename } from "node:path";
import { generateChartHtml, saveChartHtml } from "./chart.js";
import {
  DEFAULT_OPTIONS,
  filterStrongDowntrendStocks,
  mergeOptions,
} from "./analysis.js";
import { loadStocksData } from "./dataLoader.js";

const ROOT_CHART_FILE_PATH = "chart.html";
const DIST_CHART_FILE_PATH = "dist/chart.html";
const DIST_DATA_DIR = "dist/data";

const toConsoleRow = (result) => ({
  code: result.code,
  name: result.name,
  market: result.market,
  matchedPeriod: result.matchedPeriod,
  scanStartDate: result.scanStartDate,
  scanEndDate: result.scanEndDate,
  angleDegree: result.angleDegree,
  slopePixel: result.slopePixel,
  rSquared: result.rSquared,
  returnRate: result.returnRate,
});

export const run = () => {
  const { dataSource, dataPath, dataDate, stocks } = loadStocksData({
    dataPath: "data/stocks.json",
    dataDir: "data",
    dataDate: process.env.STOCK_DATA_DATE || null,
    fallbackToSample: true,
    sampleStockCount: 300,
    sampleCandleCount: 120,
    minCandles: DEFAULT_OPTIONS.scanMinPeriod,
  });

  const baseOptions = mergeOptions({
    ...DEFAULT_OPTIONS,
    renderPeriod: 80,
    scanMinPeriod: 10,
    scanMaxPeriod: 60,
    minAngleDegree: 29,
    minReturnRate: -5,
    minRSquared: 0.5,
  });

  const strictResults = filterStrongDowntrendStocks(stocks, {
    ...baseOptions,
    minAngleDegree: 45,
    minReturnRate: -10,
    minRSquared: 0.6,
  });

  const demoResults = filterStrongDowntrendStocks(stocks, {
    ...baseOptions,
    minAngleDegree: 29,
  });

  console.log("dataSource:", dataSource);
  console.log("dataPath:", dataPath);
  console.log("dataDate:", dataDate);
  console.log("stock count:", stocks.length);
  console.log("stocks preview:", stocks.slice(0, 3));

  console.log("\nstrictResults: minAngleDegree = 45");
  console.table(strictResults.map(toConsoleRow));

  console.log("\ndemoResults: minAngleDegree = 29");
  console.table(demoResults.map(toConsoleRow));

  const html = generateChartHtml(
    {
      stocks,
      dataSource,
      dataPath,
      dataDate,
      strictResults,
      demoResults,
    },
    {
      ...baseOptions,
      minAngleDegree: 29,
    },
  );

  saveChartHtml(html, ROOT_CHART_FILE_PATH);
  saveChartHtml(html, DIST_CHART_FILE_PATH);

  if (dataPath && existsSync(dataPath)) {
    mkdirSync(DIST_DATA_DIR, { recursive: true });
    copyFileSync(dataPath, `${DIST_DATA_DIR}/${basename(dataPath)}`);
    if (existsSync("data/latest.json")) {
      copyFileSync("data/latest.json", `${DIST_DATA_DIR}/latest.json`);
    }
  }

  console.log(`\nCreated ${ROOT_CHART_FILE_PATH}`);
  console.log(`Created ${DIST_CHART_FILE_PATH}`);
};

const isDirectRun = process.argv[1] === new URL(import.meta.url).pathname;

if (isDirectRun) {
  run();
}
