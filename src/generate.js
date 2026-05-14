import {
  copyFileSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { DEFAULT_OPTIONS } from "./analysis.js";
import {
  closeDatabase,
  getLatestScreeningRun,
  loadBuySignalsByRunId,
  loadFilteredStocksByRunId,
  loadRecentCandlesForCodes,
  openDatabase,
} from "./db.js";
import { calculateMA5 } from "./buySignal.js";
import { hasReadableDb, resolveDbPath } from "./config.js";

const dbPath = resolveDbPath();
const distDir = process.env.DIST_DIR ?? "dist";
const assetsDir = `${distDir}/assets`;
const chartPath = `${distDir}/chart.html`;
const indexPath = `${distDir}/index.html`;
const dataPath = `${assetsDir}/screening-data.json`;
const stylePath = `${assetsDir}/styles.css`;
const rendererPath = `${assetsDir}/chartRenderer.js`;
const assetVersion = (process.env.ASSET_VERSION ?? new Date().toISOString()).replace(/[^0-9A-Za-z]/g, "");

const ensureOutputDirs = () => {
  mkdirSync(distDir, { recursive: true });
  mkdirSync(assetsDir, { recursive: true });
};

const createShellHtml = () => `<!doctype html>
<html lang="ko" data-asset-version="${assetVersion}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>우하향 추세 종목 스크리너</title>
  <link rel="stylesheet" href="./assets/styles.css?v=${assetVersion}" />
</head>
<body>
  <aside id="summary-panel" class="sidebar"></aside>
  <main id="result-panel" class="content"></main>
  <div id="chart-tooltip"></div>
  <script type="module" src="./assets/chartRenderer.js?v=${assetVersion}"></script>
</body>
</html>
`;

const createEmptyData = () => ({
  run: {
    runId: "-",
    baseDate: "-",
    runAt: null,
    totalStockCount: 0,
    matchedStockCount: 0,
    excludedStockCount: 0,
    screeningTargetCount: 0,
    excludeEtf: true,
    excludeEtn: true,
    excludeTradingHalt: true,
    excludeAttention: true,
    renderPeriod: DEFAULT_OPTIONS.renderPeriod,
    scanMinPeriod: DEFAULT_OPTIONS.scanMinPeriod,
    scanMaxPeriod: DEFAULT_OPTIONS.scanMaxPeriod,
    minAngleDegree: DEFAULT_OPTIONS.minAngleDegree,
    minReturnRate: DEFAULT_OPTIONS.minReturnRate,
    minRSquared: DEFAULT_OPTIONS.minRSquared,
  },
  summary: {
    filteredCount: 0,
    buySignalCount: 0,
    generatedAt: new Date().toISOString(),
  },
  results: [],
  chartData: {},
});

const writeOutputs = (data) => {
  ensureOutputDirs();
  const html = createShellHtml();
  writeFileSync(chartPath, html, "utf8");
  writeFileSync(indexPath, html, "utf8");
  writeFileSync(dataPath, `${JSON.stringify(data)}\n`, "utf8");
  copyFileSync("src/styles.css", stylePath);
  copyFileSync("src/chartRenderer.js", rendererPath);
};

if (!hasReadableDb(dbPath)) {
  writeOutputs(createEmptyData());
  console.log(`DB not found: ${dbPath}`);
  console.log("Split static files generated with empty data.");
  process.exit(0);
}

const db = openDatabase(dbPath);

try {
  const latestRun = getLatestScreeningRun(db);
  if (!latestRun) {
    writeOutputs(createEmptyData());
    console.log("no screening run found. Split static files generated with empty data.");
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

  const chartData = {};
  const results = filteredStocks.map((stock) => {
    const renderCandles = candlesMap.get(stock.code) ?? [];
    chartData[stock.code] = renderCandles.map((candle) => [
      candle.date,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
    ]);
    const buySignal = signalByCode.get(stock.code);

    return {
      code: stock.code,
      name: stock.name,
      market: stock.market,
      rankNo: stock.rankNo,
      baseDate: stock.baseDate,
      matchedPeriod: stock.matchedPeriod,
      scanStartDate: stock.scanStartDate,
      scanEndDate: stock.scanEndDate,
      angleDegree: stock.angleDegree,
      slopePixel: stock.slopePixel,
      rSquared: stock.rSquared,
      returnRate: stock.returnRate,
      firstPrice: stock.firstPrice,
      lastPrice: stock.lastPrice,
      lastClose: stock.lastClose,
      dailyChangeRate: stock.dailyChangeRate,
      ma5Price: calculateMA5(renderCandles),
      buySignal: buySignal
        ? {
            status: buySignal.status,
            signalTime: buySignal.signalTime,
            currentPrice: buySignal.currentPrice,
            ma5Price: buySignal.ma5Price,
            profitRateFromFiltered: buySignal.profitRateFromFiltered,
          }
        : null,
    };
  });

  const data = {
    run: {
      runId: latestRun.run_id,
      baseDate: latestRun.base_date,
      runAt: latestRun.run_at,
      totalStockCount: latestRun.total_stock_count,
      matchedStockCount: latestRun.matched_stock_count,
      excludedStockCount: latestRun.excluded_stock_count ?? 0,
      screeningTargetCount: latestRun.screening_target_count ?? latestRun.total_stock_count,
      excludeEtf: Boolean(latestRun.exclude_etf),
      excludeEtn: Boolean(latestRun.exclude_etn),
      excludeSpac: Boolean(latestRun.exclude_spac),
      excludeReit: Boolean(latestRun.exclude_reit),
      excludePreferred: Boolean(latestRun.exclude_preferred),
      excludeTradingHalt: Boolean(latestRun.exclude_trading_halt),
      excludeAdministrative: Boolean(latestRun.exclude_administrative),
      excludeAttention: Boolean(latestRun.exclude_attention),
      excludeInvestmentWarning: Boolean(latestRun.exclude_investment_warning),
      renderPeriod: options.renderPeriod,
      scanMinPeriod: options.scanMinPeriod,
      scanMaxPeriod: options.scanMaxPeriod,
      minAngleDegree: options.minAngleDegree,
      minReturnRate: options.minReturnRate,
      minRSquared: options.minRSquared,
    },
    summary: {
      filteredCount: results.length,
      buySignalCount: buySignals.length,
      generatedAt: new Date().toISOString(),
    },
    results,
    chartData,
  };

  writeOutputs(data);
  console.log(`chart generated: ${chartPath}`);
  console.log(`index generated: ${indexPath}`);
  console.log(`styles generated: ${stylePath}`);
  console.log(`renderer generated: ${rendererPath}`);
  console.log(`data generated: ${dataPath}`);
  console.log(`filtered stocks: ${results.length}`);
  console.log(`buy signals: ${buySignals.length}`);
} finally {
  closeDatabase(db);
}
