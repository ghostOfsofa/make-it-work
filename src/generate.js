import { DEFAULT_OPTIONS } from "./analysis.js";
import {
  closeDatabase,
  getLatestScreeningRun,
  loadBuySignalsByRunId,
  loadFilteredStocksByRunId,
  loadRecentCandlesForCodes,
  openDatabase,
} from "./db.js";
import { generateChartHtml, saveChartHtml } from "./chart.js";
import { calculateMA5 } from "./buySignal.js";

const dbPath = process.env.DB_PATH ?? "data/stocks.db";
const outputPath = process.env.OUTPUT_PATH ?? "dist/chart.html";
const indexPath = process.env.INDEX_OUTPUT_PATH ?? "dist/index.html";

const createEmptyHtml = () =>
  generateChartHtml([], DEFAULT_OPTIONS, {
    runId: "-",
    baseDate: "-",
    totalStockCount: 0,
    matchedStockCount: 0,
    buySignalCount: 0,
  });

const db = openDatabase(dbPath);

const saveHtmlOutputs = (html) => {
  saveChartHtml(html, outputPath);
  saveChartHtml(html, indexPath);
};

try {
  const latestRun = getLatestScreeningRun(db);
  if (!latestRun) {
    saveHtmlOutputs(createEmptyHtml());
    console.log("no screening run found. Empty chart generated.");
    process.exit(0);
  }

  const options = {
    ...DEFAULT_OPTIONS,
    renderPeriod: latestRun.render_period,
    scanMinPeriod: latestRun.scan_min_period,
    scanMaxPeriod: latestRun.scan_max_period,
    minAngleDegree: latestRun.min_angle_degree,
    minReturnRate: latestRun.min_return_rate,
    minRSquared: latestRun.min_r_squared,
  };
  const filteredStocks = loadFilteredStocksByRunId(db, latestRun.run_id);
  const buySignals = loadBuySignalsByRunId(db, latestRun.run_id);
  const signalByCode = new Map(buySignals.map((signal) => [signal.code, signal]));
  const candlesMap = loadRecentCandlesForCodes(
    db,
    filteredStocks.map((stock) => stock.code),
    options.renderPeriod,
  );
  const results = filteredStocks.map((stock) => {
    const renderCandles = candlesMap.get(stock.code) ?? [];
    return {
      ...stock,
      prices: renderCandles,
      renderCandles,
      ma5Price: calculateMA5(renderCandles),
      buySignal: signalByCode.get(stock.code) ?? null,
    };
  });
  const summary = {
    runId: latestRun.run_id,
    baseDate: latestRun.base_date,
    totalStockCount: latestRun.total_stock_count,
    matchedStockCount: latestRun.matched_stock_count,
    buySignalCount: buySignals.length,
    runAt: latestRun.run_at,
  };
  const html = generateChartHtml(results, options, summary);
  saveHtmlOutputs(html);
  console.log(`chart generated: ${outputPath}`);
  console.log(`index generated: ${indexPath}`);
  console.log(`run id: ${latestRun.run_id}`);
  console.log(`filtered stocks: ${results.length}`);
  console.log(`buy signals: ${buySignals.length}`);
} finally {
  closeDatabase(db);
}
