import {
  copyFileSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { calculateEMAs, DEFAULT_OPTIONS } from "./analysis.js";
import {
  closeDatabase,
  getLatestScreeningRun,
  loadBuySignalsByRunId,
  loadFilteredStocksWithCurrentPrice,
  loadRecentCandlesForCodes,
  loadScreeningRuns,
  openDatabase,
} from "./db.js";
import { calculateMA5 } from "./buySignal.js";
import { hasReadableDb, resolveDbPath } from "./config.js";
import { calculateBollingerYellowArrowSignals } from "./screeners/jjapSubakScreener.js";

const dbPath = resolveDbPath();
const distDir = process.env.DIST_DIR ?? "dist";
const assetsDir = `${distDir}/assets`;
const runsDir = `${assetsDir}/runs`;
const chartPath = `${distDir}/chart.html`;
const indexPath = `${distDir}/index.html`;
const dataPath = `${assetsDir}/screening-data.json`;
const runsListPath = `${assetsDir}/screening-runs.json`;
const stylePath = `${assetsDir}/styles.css`;
const rendererPath = `${assetsDir}/chartRenderer.js`;
const assetVersion = (process.env.ASSET_VERSION ?? new Date().toISOString()).replace(/[^0-9A-Za-z]/g, "");
const generateOptions = {
  recentRunLimit: Number(process.env.RECENT_RUN_LIMIT ?? 20),
  maxEmbeddedCandlesPerStock: Number(process.env.MAX_EMBEDDED_CANDLES_PER_STOCK ?? DEFAULT_OPTIONS.renderPeriod),
};

const highestHigh = (candles) =>
  Math.max(...candles.map((candle) => Number(candle.high)).filter(Number.isFinite));

const lowestLow = (candles) =>
  Math.min(...candles.map((candle) => Number(candle.low)).filter(Number.isFinite));

const calculateIchimokuSeries = (candles, { displacement = 26 } = {}) => {
  const series = Array.from({ length: candles.length + displacement }, (_, index) => ({
    date: candles[index]?.date ?? null,
    tenkanSen: null,
    kijunSen: null,
    senkouSpanA: null,
    senkouSpanB: null,
  }));

  candles.forEach((candle, index) => {
    const upToCurrent = candles.slice(0, index + 1);
    if (upToCurrent.length < 52) return;

    const last9 = upToCurrent.slice(-9);
    const last26 = upToCurrent.slice(-26);
    const last52 = upToCurrent.slice(-52);
    const tenkanSen = (highestHigh(last9) + lowestLow(last9)) / 2;
    const kijunSen = (highestHigh(last26) + lowestLow(last26)) / 2;
    const senkouSpanA = (tenkanSen + kijunSen) / 2;
    const senkouSpanB = (highestHigh(last52) + lowestLow(last52)) / 2;
    series[index].tenkanSen = Number.isFinite(tenkanSen) ? Number(tenkanSen.toFixed(2)) : null;
    series[index].kijunSen = Number.isFinite(kijunSen) ? Number(kijunSen.toFixed(2)) : null;

    const displayIndex = index + displacement;
    if (displayIndex < series.length) {
      series[displayIndex].senkouSpanA = Number.isFinite(senkouSpanA)
        ? Number(senkouSpanA.toFixed(2))
        : null;
      series[displayIndex].senkouSpanB = Number.isFinite(senkouSpanB)
        ? Number(senkouSpanB.toFixed(2))
        : null;
    }
  });

  return series;
};

const ensureOutputDirs = () => {
  mkdirSync(distDir, { recursive: true });
  mkdirSync(assetsDir, { recursive: true });
  mkdirSync(runsDir, { recursive: true });
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
    screenType: "DOWNTREND",
    screenName: "우하향 필터",
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
    useEmaBearishFilter: DEFAULT_OPTIONS.useEmaBearishFilter,
    useLastPriceBelowEma5Filter: DEFAULT_OPTIONS.useLastPriceBelowEma5Filter,
    useEma5To112GapFilter: DEFAULT_OPTIONS.useEma5To112GapFilter,
    minEma5To112GapRate: DEFAULT_OPTIONS.minEma5To112GapRate,
    useEma5ToNearestLongEmaGapFilter: DEFAULT_OPTIONS.useEma5ToNearestLongEmaGapFilter,
    minEma5ToNearestLongEmaGapRate: DEFAULT_OPTIONS.minEma5ToNearestLongEmaGapRate,
    emaPeriods: DEFAULT_OPTIONS.emaPeriods,
    bearishEmaPeriods: DEFAULT_OPTIONS.bearishEmaPeriods,
  },
  summary: {
    filteredCount: 0,
    buySignalCount: 0,
    generatedAt: new Date().toISOString(),
  },
  results: [],
  chartData: {},
  emaData: {},
  ichimokuData: {},
  bollingerData: {},
});

const writeShellOutputs = () => {
  ensureOutputDirs();
  const html = createShellHtml();
  writeFileSync(chartPath, html, "utf8");
  writeFileSync(indexPath, html, "utf8");
  copyFileSync("src/styles.css", stylePath);
  copyFileSync("src/chartRenderer.js", rendererPath);
};

const writeEmptyOutputs = () => {
  const data = createEmptyData();
  writeShellOutputs();
  writeFileSync(dataPath, `${JSON.stringify(data)}\n`, "utf8");
  writeFileSync(runsListPath, `${JSON.stringify({ screeningRuns: [], selectedRunId: null, generatedAt: data.summary.generatedAt })}\n`, "utf8");
};

if (!hasReadableDb(dbPath)) {
  writeEmptyOutputs();
  console.log(`DB not found: ${dbPath}`);
  console.log("Split static files generated with empty data.");
  process.exit(0);
}

const db = openDatabase(dbPath);

try {
  const latestRun = getLatestScreeningRun(db);
  if (!latestRun) {
    writeEmptyOutputs();
    console.log("no screening run found. Split static files generated with empty data.");
    process.exit(0);
  }

  const buildRunData = (run) => {
  const options = {
    ...DEFAULT_OPTIONS,
    renderPeriod: run.renderPeriod,
    scanMinPeriod: run.scanMinPeriod,
    scanMaxPeriod: run.scanMaxPeriod,
    minAngleDegree: run.minAngleDegree,
    minReturnRate: run.minReturnRate,
    minRSquared: run.minRSquared,
  };
  const filteredStocks = loadFilteredStocksWithCurrentPrice(db, run.runId);
  const buySignals = loadBuySignalsByRunId(db, run.runId);
  const signalByCode = new Map(buySignals.map((signal) => [signal.code, signal]));
  const maxEmaPeriod = Math.max(...DEFAULT_OPTIONS.emaPeriods);
  const renderPeriod = Math.min(options.renderPeriod, generateOptions.maxEmbeddedCandlesPerStock);
  const indicatorCandleLimit = maxEmaPeriod + renderPeriod - 1;
  const candlesMap = loadRecentCandlesForCodes(
    db,
    filteredStocks.map((stock) => stock.code),
    indicatorCandleLimit,
  );

  const chartData = {};
  const emaData = {};
  const ichimokuData = {};
  const bollingerData = {};
  const results = filteredStocks.map((stock) => {
    const indicatorCandles = candlesMap.get(stock.code) ?? [];
    const renderCandles = indicatorCandles.slice(-renderPeriod);
    chartData[stock.code] = renderCandles.map((candle) => [
      candle.date,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
    ]);
    const allEmaValues = calculateEMAs(indicatorCandles, DEFAULT_OPTIONS.emaPeriods);
    const ichimokuDisplacement = 26;
    const renderStartIndex = Math.max(0, indicatorCandles.length - renderPeriod);
    ichimokuData[stock.code] = calculateIchimokuSeries(indicatorCandles, {
      displacement: ichimokuDisplacement,
    }).slice(renderStartIndex, renderStartIndex + renderPeriod + ichimokuDisplacement);
    bollingerData[stock.code] =
      stock.screenType === "JJAP_SUBAK"
        ? calculateBollingerYellowArrowSignals(indicatorCandles, {
            bollingerPeriod: stock.bollingerPeriod ?? 33,
            bollingerStdDevMultiplier: stock.bollingerStdDevMultiplier ?? 0.1,
            bollingerShiftBars: stock.bollingerShiftBars ?? 25,
          }).slice(-renderPeriod)
        : [];
    emaData[stock.code] = Object.fromEntries(
      DEFAULT_OPTIONS.emaPeriods.map((period) => [
        `ema${period}`,
        (allEmaValues[`ema${period}`] ?? [])
          .slice(-renderPeriod)
          .map((value) => (value == null ? null : Number(value.toFixed(2)))),
      ]),
    );
    const buySignal = signalByCode.get(stock.code);

    return {
      code: stock.code,
      name: stock.name,
      market: stock.market,
      screenType: stock.screenType,
      screenName: stock.screenName,
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
      filteredLastPrice: stock.filteredLastPrice,
      filteredLastClose: stock.filteredLastClose,
      lastClose: stock.lastClose,
      currentDate: stock.currentDate,
      currentPrice: stock.currentPrice,
      currentReturnRate: stock.currentReturnRate == null ? null : Number(stock.currentReturnRate.toFixed(2)),
      dailyChangeRate: stock.dailyChangeRate,
      ema5: stock.ema5,
      ema20: stock.ema20,
      ema60: stock.ema60,
      ema112: stock.ema112,
      ema224: stock.ema224,
      ema448: stock.ema448,
      isLongEmaBearish: stock.isLongEmaBearish,
      isLastPriceBelowEma5: stock.isLastPriceBelowEma5,
      ema5To112GapRate: stock.ema5To112GapRate,
      isEma5FarBelowEma112: stock.isEma5FarBelowEma112,
      nearestLongEmaAboveEma5Period: stock.nearestLongEmaAboveEma5Period,
      nearestLongEmaAboveEma5Value: stock.nearestLongEmaAboveEma5Value,
      ema5ToNearestLongEmaGapRate: stock.ema5ToNearestLongEmaGapRate,
      ema5ToNearestLongEmaGapReason: stock.ema5ToNearestLongEmaGapReason,
      regressionIntercept: stock.regressionIntercept,
      trendLineStartPrice: stock.trendLineStartPrice,
      trendLineEndPrice: stock.trendLineEndPrice,
      trendNextX: stock.trendNextX,
      trendNextY: stock.trendNextY,
      trendNextPrice: stock.trendNextPrice,
      tenkanSen: stock.tenkanSen,
      kijunSen: stock.kijunSen,
      senkouSpanA: stock.senkouSpanA,
      senkouSpanB: stock.senkouSpanB,
      cloudTop: stock.cloudTop,
      cloudBottom: stock.cloudBottom,
      ichimokuDisplacement: stock.ichimokuDisplacement,
      shiftedSenkouSpanA: stock.shiftedSenkouSpanA,
      shiftedSenkouSpanB: stock.shiftedSenkouSpanB,
      shiftedCloudTop: stock.shiftedCloudTop,
      shiftedCloudBottom: stock.shiftedCloudBottom,
      ichimokuCloudGapRate: stock.ichimokuCloudGapRate,
      isTooFarAboveIchimokuCloud: stock.isTooFarAboveIchimokuCloud,
      isAboveIchimokuCloud: stock.isAboveIchimokuCloud,
      isLongEmaConverged: stock.isLongEmaConverged,
      isMissingLongEma: stock.isMissingLongEma,
      longEmaConvergenceRate: stock.longEmaConvergenceRate,
      longEmaConditionReason: stock.longEmaConditionReason,
      isBullishLongEmaAlignment: stock.isBullishLongEmaAlignment,
      ema112To224GapRate: stock.ema112To224GapRate,
      ema224To448GapRate: stock.ema224To448GapRate,
      maxBullishLongEmaPairGapRate: stock.maxBullishLongEmaPairGapRate,
      isWideBullishLongEmaGap: stock.isWideBullishLongEmaGap,
      isCloudTopAboveEma112: stock.isCloudTopAboveEma112,
      isExcludedByCloudTopAboveEma112: stock.isExcludedByCloudTopAboveEma112,
      highestLongEmaPeriod: stock.highestLongEmaPeriod,
      highestLongEmaValue: stock.highestLongEmaValue,
      priceToHighestLongEmaGapRate: stock.priceToHighestLongEmaGapRate,
      isOverHighestLongEmaGap: stock.isOverHighestLongEmaGap,
      bollingerPeriod: stock.bollingerPeriod,
      bollingerStdDevMultiplier: stock.bollingerStdDevMultiplier,
      bollingerShiftBars: stock.bollingerShiftBars,
      bollingerYellowArrowLookbackDays: stock.bollingerYellowArrowLookbackDays,
      hasBollingerYellowArrowWithinRecentDays: stock.hasBollingerYellowArrowWithinRecentDays,
      bollingerYellowArrowCount: stock.bollingerYellowArrowCount,
      latestShiftedUpperBand: stock.latestShiftedUpperBand,
      latestCloseAboveShiftedUpperBand: stock.latestCloseAboveShiftedUpperBand,
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
      ...run,
      renderPeriod: options.renderPeriod,
      scanMinPeriod: options.scanMinPeriod,
      scanMaxPeriod: options.scanMaxPeriod,
      minAngleDegree: options.minAngleDegree,
      minReturnRate: options.minReturnRate,
      minRSquared: options.minRSquared,
      useEmaBearishFilter: run.useEmaBearishFilter == null
        ? DEFAULT_OPTIONS.useEmaBearishFilter
        : run.useEmaBearishFilter,
      useLastPriceBelowEma5Filter: run.useLastPriceBelowEma5Filter == null
        ? DEFAULT_OPTIONS.useLastPriceBelowEma5Filter
        : run.useLastPriceBelowEma5Filter,
      useEma5To112GapFilter: run.useEma5To112GapFilter == null
        ? DEFAULT_OPTIONS.useEma5To112GapFilter
        : run.useEma5To112GapFilter,
      minEma5To112GapRate: run.minEma5To112GapRate ?? DEFAULT_OPTIONS.minEma5To112GapRate,
      useEma5ToNearestLongEmaGapFilter: run.useEma5To112GapFilter == null
        ? DEFAULT_OPTIONS.useEma5ToNearestLongEmaGapFilter
        : run.useEma5To112GapFilter,
      minEma5ToNearestLongEmaGapRate: run.minEma5To112GapRate ?? DEFAULT_OPTIONS.minEma5ToNearestLongEmaGapRate,
      emaPeriods: DEFAULT_OPTIONS.emaPeriods,
      bearishEmaPeriods: DEFAULT_OPTIONS.bearishEmaPeriods,
    },
    summary: {
      filteredCount: results.length,
      buySignalCount: buySignals.length,
      generatedAt: new Date().toISOString(),
    },
    results,
    chartData,
    emaData,
    ichimokuData,
    bollingerData,
  };
  return data;
  };

  const runs = loadScreeningRuns(db, { limit: generateOptions.recentRunLimit });
  const runFiles = [];
  let latestData = null;
  writeShellOutputs();
  for (const run of runs) {
    const runData = buildRunData(run);
    if (run.runId === latestRun.run_id) latestData = runData;
    const runPath = `${runsDir}/run-${run.runId}.json`;
    writeFileSync(runPath, `${JSON.stringify(runData)}\n`, "utf8");
    runFiles.push({ ...run, file: `./assets/runs/run-${run.runId}.json` });
  }
  const selectedRunId = latestRun.run_id;
  writeFileSync(
    runsListPath,
    `${JSON.stringify({ screeningRuns: runFiles, selectedRunId, generatedAt: new Date().toISOString() })}\n`,
    "utf8",
  );
  if (latestData) {
    writeFileSync(dataPath, `${JSON.stringify(latestData)}\n`, "utf8");
  }
  console.log(`chart generated: ${chartPath}`);
  console.log(`index generated: ${indexPath}`);
  console.log(`styles generated: ${stylePath}`);
  console.log(`renderer generated: ${rendererPath}`);
  console.log(`runs list generated: ${runsListPath}`);
  console.log(`run json files: ${runFiles.length}`);
  console.log(`filtered stocks: ${latestData?.results.length ?? 0}`);
  console.log(`buy signals: ${latestData?.summary.buySignalCount ?? 0}`);
} finally {
  closeDatabase(db);
}
