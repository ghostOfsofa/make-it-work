const COLORS = {
  background: "#0b1220",
  grid: "#243044",
  text: "#cbd5e1",
  muted: "#94a3b8",
  bullish: "#ef4444",
  bearish: "#3b82f6",
  regression: "#f87171",
  selectedLine: "#d946ef",
  axis: "#475569",
  matchedArea: "rgba(148, 163, 184, 0.18)",
  ma5: "#d946ef",
  ma20: "#eab308",
  ma60: "#64748b",
  ma120: "#16a34a",
  signal: "#22c55e",
};

const DEFAULT_MARGIN = { top: 40, right: 90, bottom: 60, left: 30 };
const PAGE_SIZE = 20;
const DEFAULT_CHART_MODE = "detail";

const MINI_CHART_OPTIONS = {
  chartWidth: 480,
  chartHeight: 270,
  renderPeriod: 40,
  margin: { top: 18, right: 28, bottom: 20, left: 12 },
  showGrid: false,
  showAxisLabels: false,
  showTooltip: false,
  showMA5: true,
  showMA20: false,
  showMA60: false,
  showMA120: false,
  showRegressionLine: true,
  showSelectedPriceLine: true,
  showMatchedArea: true,
  showCandleWick: true,
};

const DETAIL_CHART_OPTIONS = {
  chartWidth: 1600,
  chartHeight: 900,
  renderPeriod: 80,
  margin: DEFAULT_MARGIN,
  showGrid: true,
  showAxisLabels: true,
  showTooltip: true,
  showMA5: true,
  showMA20: true,
  showMA60: true,
  showMA120: true,
  showRegressionLine: true,
  showSelectedPriceLine: true,
  showMatchedArea: true,
  showCandleWick: true,
};

let appData = null;
let sortKey = "angle";
let currentPage = 1;
const chartModes = new Map();

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const round = (value, digits = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return Number.NaN;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
};

const isFiniteValue = (value) =>
  value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

const formatPrice = (value) =>
  isFiniteValue(value) ? Math.round(Number(value)).toLocaleString("ko-KR") : "-";

const formatNumber = (value, digits = 2) =>
  isFiniteValue(value) ? round(Number(value), digits).toLocaleString("ko-KR") : "-";

const formatPercent = (value, digits = 2) => {
  if (!isFiniteValue(value)) return "-";
  const number = Number(value);
  return `${number > 0 ? "+" : ""}${number.toFixed(digits)}%`;
};

const formatDateLabel = (date) => {
  const parts = String(date ?? "").split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : String(date ?? "");
};

const metric = (label, value, className = "") =>
  `<span class="metric ${className}"><b>${escapeHtml(label)}</b>${value}</span>`;

const selectedPrice = (candle) => (candle.close >= candle.open ? candle.close : candle.open);

const unpackCandles = (rows = []) =>
  rows.map(([date, open, high, low, close]) => ({ date, open, high, low, close }));

const calculatePriceRange = (candles) => {
  const values = candles.flatMap((candle) => [
    candle.open,
    candle.high,
    candle.low,
    candle.close,
    selectedPrice(candle),
  ]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return { minPrice: Number.NaN, maxPrice: Number.NaN };
  }
  const padding = Math.max((max - min) * 0.05, max * 0.005, 1);
  return { minPrice: Math.max(1, min - padding), maxPrice: max + padding };
};

const priceToY = (price, minPrice, maxPrice, plotHeight, marginTop) =>
  marginTop + ((maxPrice - price) / (maxPrice - minPrice)) * plotHeight;

const calculateNicePriceTicks = (minPrice, maxPrice, tickCount = 6) => {
  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || maxPrice <= minPrice) return [];
  const range = maxPrice - minPrice;
  const rawStep = range / Math.max(1, tickCount - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  const niceStep = residual >= 5 ? 5 * magnitude : residual >= 2 ? 2 * magnitude : magnitude;
  const start = Math.ceil(minPrice / niceStep) * niceStep;
  const ticks = [];
  for (let value = start; value <= maxPrice + niceStep * 0.5; value += niceStep) ticks.push(value);
  return ticks;
};

const linearRegression = (points) => {
  if (points.length < 2) return { slope: Number.NaN, intercept: Number.NaN };
  const n = points.length;
  const sumX = points.reduce((sum, point) => sum + point.x, 0);
  const sumY = points.reduce((sum, point) => sum + point.y, 0);
  const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0);
  const sumXX = points.reduce((sum, point) => sum + point.x * point.x, 0);
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return { slope: Number.NaN, intercept: Number.NaN };
  const slope = (n * sumXY - sumX * sumY) / denominator;
  return { slope, intercept: (sumY - slope * sumX) / n };
};

const createPolyline = (points, stroke, attrs = "") => {
  const valid = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (valid.length < 2) return "";
  return `<polyline points="${valid.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}" fill="none" stroke="${stroke}" ${attrs}/>`;
};

const createMovingAverageLine = (candles, period, scale, color) => {
  const points = candles.map((_, index) => {
    if (index + 1 < period) return { x: Number.NaN, y: Number.NaN };
    const slice = candles.slice(index + 1 - period, index + 1);
    const ma = slice.reduce((sum, candle) => sum + candle.close, 0) / period;
    return { x: scale.x(index), y: scale.y(ma) };
  });
  return createPolyline(points, color, `stroke-width="2" opacity="0.9"`);
};

const createGridLines = ({ chartWidth, chartHeight, margin, plotWidth, ticks, scale }) =>
  ticks
    .map((tick) => {
      const y = scale.y(tick);
      return `
        <line x1="${margin.left}" y1="${y}" x2="${chartWidth - margin.right}" y2="${y}" stroke="${COLORS.grid}" stroke-width="1"/>
        <text x="${chartWidth - margin.right + 12}" y="${y + 5}" fill="${COLORS.muted}" font-size="22">${formatPrice(tick)}</text>
      `;
    })
    .join("") +
  Array.from({ length: 6 }, (_, index) => {
    const x = margin.left + (plotWidth / 5) * index;
    return `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${chartHeight - margin.bottom}" stroke="${COLORS.grid}" stroke-width="1" opacity="0.65"/>`;
  }).join("");

const createAxisLabels = ({ candles, margin, chartHeight, scale }) => {
  const step = Math.max(1, Math.floor(candles.length / 5));
  return candles
    .map((candle, index) =>
      index % step === 0 || index === candles.length - 1
        ? `<text x="${scale.x(index)}" y="${chartHeight - margin.bottom + 34}" fill="${COLORS.muted}" font-size="22" text-anchor="middle">${formatDateLabel(candle.date)}</text>`
        : "",
    )
    .join("");
};

const createHoverAreas = ({ candles, margin, plotHeight, candleSlotWidth, scale, showTooltip }) =>
  !showTooltip
    ? ""
    : candles
        .map((candle, index) => {
          const prevClose = candles[index - 1]?.close;
          const changeRate = prevClose > 0 ? ((candle.close - prevClose) / prevClose) * 100 : "";
          return `<rect class="candle-hover-area" x="${scale.x(index) - candleSlotWidth / 2}" y="${margin.top}" width="${candleSlotWidth}" height="${plotHeight}" fill="transparent"
        data-date="${escapeHtml(candle.date)}" data-open="${candle.open}" data-high="${candle.high}" data-low="${candle.low}" data-close="${candle.close}" data-change-rate="${changeRate}"/>`;
        })
        .join("");

const createBuySignalMarker = (signal, scale, chartWidth, margin, showLabel) => {
  if (!signal || !Number.isFinite(Number(signal.currentPrice))) return "";
  const y = scale.y(Number(signal.currentPrice));
  if (!Number.isFinite(y)) return "";
  const x = chartWidth - margin.right - 24;
  return `
    <line x1="${margin.left}" y1="${y}" x2="${chartWidth - margin.right}" y2="${y}" stroke="${COLORS.signal}" stroke-width="2" stroke-dasharray="8 8"/>
    <circle cx="${x}" cy="${y}" r="${showLabel ? 9 : 5}" fill="${COLORS.signal}"/>
    ${showLabel ? `<text x="${x - 14}" y="${y - 14}" text-anchor="end" fill="${COLORS.signal}" font-size="22">MA5 돌파 ${formatPrice(signal.currentPrice)}</text>` : ""}
  `;
};

const createCandlestickSvgChart = (result, rawCandles, optionOverrides) => {
  const options = { ...DETAIL_CHART_OPTIONS, ...optionOverrides, margin: { ...DEFAULT_MARGIN, ...(optionOverrides.margin ?? {}) } };
  const candles = rawCandles.slice(-options.renderPeriod);
  if (candles.length < 2) return `<div class="empty-chart">차트 데이터 부족</div>`;

  const { chartWidth, chartHeight, margin } = options;
  const plotWidth = chartWidth - margin.left - margin.right;
  const plotHeight = chartHeight - margin.top - margin.bottom;
  const { minPrice, maxPrice } = calculatePriceRange(candles);
  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) return `<div class="empty-chart">차트 범위 계산 실패</div>`;

  const scale = {
    x: (index) => margin.left + (index / Math.max(1, candles.length - 1)) * plotWidth,
    y: (price) => priceToY(price, minPrice, maxPrice, plotHeight, margin.top),
  };
  const candleSlotWidth = plotWidth / candles.length;
  const candleWidth = Math.max(2, Math.min(18, candleSlotWidth * 0.8));
  const renderPoints = candles.map((candle, index) => ({
    x: scale.x(index),
    y: scale.y(selectedPrice(candle)),
  }));
  const scanPoints = renderPoints.slice(-result.matchedPeriod);
  const regression = linearRegression(scanPoints);
  const firstScanX = scanPoints[0]?.x;
  const lastScanX = scanPoints.at(-1)?.x;
  const matchedArea =
    options.showMatchedArea && Number.isFinite(firstScanX)
      ? `<rect x="${firstScanX}" y="${margin.top}" width="${chartWidth - margin.right - firstScanX}" height="${plotHeight}" fill="${COLORS.matchedArea}"/>`
      : "";
  const regressionLine =
    options.showRegressionLine && Number.isFinite(regression.slope)
      ? `<line x1="${firstScanX}" y1="${regression.slope * firstScanX + regression.intercept}" x2="${lastScanX}" y2="${regression.slope * lastScanX + regression.intercept}" stroke="${COLORS.regression}" stroke-width="${options.chartWidth > 500 ? 3 : 2}"/>`
      : "";
  const selectedLine =
    options.showSelectedPriceLine
      ? createPolyline(renderPoints, COLORS.selectedLine, `stroke-width="2" stroke-dasharray="7 7" opacity="0.85"`)
      : "";
  const candleElements = candles
    .map((candle, index) => {
      const color = candle.close >= candle.open ? COLORS.bullish : COLORS.bearish;
      const x = scale.x(index);
      const openY = scale.y(candle.open);
      const closeY = scale.y(candle.close);
      const bodyY = Math.min(openY, closeY);
      const bodyHeight = Math.max(1, Math.abs(closeY - openY));
      return `
        ${options.showCandleWick ? `<line x1="${x}" y1="${scale.y(candle.high)}" x2="${x}" y2="${scale.y(candle.low)}" stroke="${color}" stroke-width="2"/>` : ""}
        <rect x="${x - candleWidth / 2}" y="${bodyY}" width="${candleWidth}" height="${bodyHeight}" fill="${color}" stroke="${color}" stroke-width="0"/>
      `;
    })
    .join("");
  const lastCandle = candles.at(-1);
  const lastY = scale.y(lastCandle.close);
  const lastColor = lastCandle.close >= candles.at(-2)?.close ? COLORS.bullish : COLORS.bearish;
  const ticks = calculateNicePriceTicks(minPrice, maxPrice, 7);
  const grid = options.showGrid ? createGridLines({ chartWidth, chartHeight, margin, plotWidth, ticks, scale }) : "";
  const axisLabels = options.showAxisLabels ? createAxisLabels({ candles, margin, chartHeight, scale }) : "";

  return `
    <svg class="stock-chart" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="${escapeHtml(result.name)} 봉차트">
      <rect width="${chartWidth}" height="${chartHeight}" fill="${COLORS.background}"/>
      ${matchedArea}
      ${grid}
      ${axisLabels}
      ${options.showAxisLabels ? `<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${chartHeight - margin.bottom}" stroke="${COLORS.axis}" stroke-width="1"/>
      <line x1="${chartWidth - margin.right}" y1="${margin.top}" x2="${chartWidth - margin.right}" y2="${chartHeight - margin.bottom}" stroke="${COLORS.axis}" stroke-width="1"/>` : ""}
      ${options.showMA5 ? createMovingAverageLine(candles, 5, scale, COLORS.ma5) : ""}
      ${options.showMA20 ? createMovingAverageLine(candles, 20, scale, COLORS.ma20) : ""}
      ${options.showMA60 ? createMovingAverageLine(candles, 60, scale, COLORS.ma60) : ""}
      ${options.showMA120 ? createMovingAverageLine(candles, 120, scale, COLORS.ma120) : ""}
      ${selectedLine}
      ${candleElements}
      ${regressionLine}
      ${createBuySignalMarker(result.buySignal, scale, chartWidth, margin, options.showAxisLabels)}
      ${options.showAxisLabels ? `<rect x="${chartWidth - margin.right + 4}" y="${lastY - 18}" width="82" height="34" rx="4" fill="${lastColor}"/>
      <text x="${chartWidth - margin.right + 45}" y="${lastY + 6}" fill="white" font-size="20" text-anchor="middle">${formatPrice(lastCandle.close)}</text>
      <text x="${margin.left + 4}" y="30" fill="${COLORS.text}" font-size="22">${escapeHtml(result.name)} ${escapeHtml(result.code)} | 각도 ${formatNumber(result.angleDegree)}° | R² ${formatNumber(result.rSquared, 3)} | 수익률 ${formatPercent(result.returnRate)}</text>` : ""}
      ${createHoverAreas({ candles, margin, plotHeight, candleSlotWidth, scale, showTooltip: options.showTooltip })}
    </svg>
  `;
};

const getSortedResults = () => {
  const sorted = [...(appData?.results ?? [])];
  const sorters = {
    angle: (a, b) => b.angleDegree - a.angleDegree,
    returnRate: (a, b) => a.returnRate - b.returnRate,
    rSquared: (a, b) => b.rSquared - a.rSquared,
    matchedPeriod: (a, b) => b.matchedPeriod - a.matchedPeriod,
  };
  return sorted.sort(sorters[sortKey] ?? sorters.angle);
};

const renderSummaryPanel = () => {
  const panel = document.getElementById("summary-panel");
  const { run, summary } = appData;
  panel.innerHTML = `
    <h1>우하향 스크리너</h1>
    <p class="subtitle">정적 JSON 기반 키움 HTS 스타일 차트</p>
    <section class="summary-panel">
      ${metric("latest run", run.runId ?? "-")}
      ${metric("기준일", run.baseDate ?? "-")}
      ${metric("DB 전체", `${run.totalStockCount ?? 0}종목`)}
      ${metric("제외 종목", `${run.excludedStockCount ?? 0}종목`)}
      ${metric("검색 대상", `${run.screeningTargetCount ?? run.totalStockCount ?? 0}종목`)}
      ${metric("필터링", `${summary.filteredCount ?? 0}종목`)}
      ${metric("매수 신호", `${summary.buySignalCount ?? 0}건`)}
      ${metric("ETF/ETN 제외", run.excludeEtf || run.excludeEtn ? "ON" : "OFF")}
      ${metric("거래정지 제외", run.excludeTradingHalt ? "ON" : "OFF")}
      ${metric("환기 제외", run.excludeAttention ? "ON" : "OFF")}
      ${metric("renderPeriod", run.renderPeriod)}
      ${metric("scan", `${run.scanMinPeriod}~${run.scanMaxPeriod}`)}
      ${metric("minAngle", `${run.minAngleDegree}°`)}
      ${metric("minReturn", `${run.minReturnRate}%`)}
      ${metric("minR²", run.minRSquared)}
    </section>
    <p class="note">생성 시각: ${escapeHtml(summary.generatedAt ?? "-")}</p>
  `;
};

const renderResultCard = (result, visibleIndex, absoluteIndex) => {
  const signal = result.buySignal;
  const signalClass = signal ? "has-signal" : "";
  const candles = unpackCandles(appData.chartData[result.code] ?? []);
  const mode = chartModes.get(result.code) ?? DEFAULT_CHART_MODE;
  const chart =
    mode === "mini"
      ? createCandlestickSvgChart(result, candles, MINI_CHART_OPTIONS)
      : mode === "detail"
        ? createCandlestickSvgChart(result, candles, DETAIL_CHART_OPTIONS)
        : `<div class="empty-chart compact">차트 보기 버튼으로 렌더링</div>`;

  return `
    <article class="result-card ${signalClass}" data-code="${escapeHtml(result.code)}">
      <header class="card-header">
        <div>
          <span class="rank">#${absoluteIndex + 1}</span>
          <h2>${escapeHtml(result.name)}</h2>
          <p>${escapeHtml(result.code)} · ${escapeHtml(result.market ?? "-")}</p>
        </div>
        <div class="price-box">
          <strong>${formatPrice(result.lastClose)}</strong>
          <span class="${result.dailyChangeRate >= 0 ? "up" : "down"}">${formatPercent(result.dailyChangeRate)}</span>
        </div>
      </header>
      <div class="chart-controls">
        <button type="button" data-action="mini" data-code="${escapeHtml(result.code)}">미니 차트 보기</button>
        <button type="button" data-action="detail" data-code="${escapeHtml(result.code)}">상세 차트 보기</button>
        <button type="button" data-action="collapse" data-code="${escapeHtml(result.code)}">차트 접기</button>
      </div>
      <div class="chart-shell" id="chart-${escapeHtml(result.code)}">${chart}</div>
      <div class="metrics">
        ${metric("구간", `${result.matchedPeriod}일`)}
        ${metric("검색 기간", `${escapeHtml(result.scanStartDate)} ~ ${escapeHtml(result.scanEndDate)}`)}
        ${metric("각도", `${formatNumber(result.angleDegree)}°`)}
        ${metric("slope", formatNumber(result.slopePixel, 4))}
        ${metric("R²", formatNumber(result.rSquared, 4))}
        ${metric("수익률", formatPercent(result.returnRate), result.returnRate <= 0 ? "down" : "up")}
        ${metric("MA5", formatPrice(result.ma5Price))}
        ${metric("매수 신호", signal ? `발생 ${escapeHtml(signal.signalTime)}` : "없음", signal ? "signal" : "")}
        ${signal ? metric("신호가", formatPrice(signal.currentPrice), "signal") : ""}
        ${signal ? metric("필터가 대비", formatPercent(signal.profitRateFromFiltered), "signal") : ""}
      </div>
    </article>
  `;
};

const renderResultPanel = () => {
  const panel = document.getElementById("result-panel");
  const sorted = getSortedResults();
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = sorted.slice(start, start + PAGE_SIZE);
  panel.innerHTML = `
    <header class="toolbar">
      <div>
        <h1>필터링 결과 ${sorted.length}개 종목</h1>
        <p>현재 페이지의 모든 종목을 상세차트로 렌더링합니다.</p>
      </div>
      <div class="actions">
        <select id="sort-select">
          <option value="angle" ${sortKey === "angle" ? "selected" : ""}>각도 내림차순</option>
          <option value="returnRate" ${sortKey === "returnRate" ? "selected" : ""}>수익률 오름차순</option>
          <option value="rSquared" ${sortKey === "rSquared" ? "selected" : ""}>R² 내림차순</option>
          <option value="matchedPeriod" ${sortKey === "matchedPeriod" ? "selected" : ""}>검색 구간 길이</option>
        </select>
        <button id="download-csv" type="button">CSV 다운로드</button>
      </div>
    </header>
    <section class="results-list">
      ${pageItems.length ? pageItems.map((result, index) => renderResultCard(result, index, start + index)).join("") : `<div class="empty-state">필터링 결과가 없습니다.</div>`}
    </section>
    <nav class="pagination">
      <button type="button" id="prev-page" ${currentPage <= 1 ? "disabled" : ""}>이전</button>
      <span>${currentPage} / ${totalPages}</span>
      <button type="button" id="next-page" ${currentPage >= totalPages ? "disabled" : ""}>다음</button>
    </nav>
  `;
};

const downloadCsv = () => {
  const columns = [
    "code",
    "name",
    "market",
    "matchedPeriod",
    "scanStartDate",
    "scanEndDate",
    "angleDegree",
    "slopePixel",
    "rSquared",
    "returnRate",
    "firstPrice",
    "lastPrice",
    "lastClose",
    "dailyChangeRate",
    "buySignalStatus",
    "signalTime",
    "signalCurrentPrice",
    "ma5Price",
    "profitRateFromFiltered",
  ];
  const rows = getSortedResults().map((row) => {
    const signal = row.buySignal ?? {};
    return [
      row.code,
      row.name,
      row.market,
      row.matchedPeriod,
      row.scanStartDate,
      row.scanEndDate,
      row.angleDegree,
      row.slopePixel,
      row.rSquared,
      row.returnRate,
      row.firstPrice,
      row.lastPrice,
      row.lastClose,
      row.dailyChangeRate,
      signal.status ?? "",
      signal.signalTime ?? "",
      signal.currentPrice ?? "",
      row.ma5Price ?? "",
      signal.profitRateFromFiltered ?? "",
    ];
  });
  const csv = [columns.join(","), ...rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `filtered-stocks-${appData.run.baseDate ?? "latest"}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
};

const renderChartForCode = (code, mode) => {
  chartModes.set(code, mode);
  const result = appData.results.find((item) => item.code === code);
  const container = document.getElementById(`chart-${code}`);
  if (!result || !container) return;
  if (mode === "none") {
    container.innerHTML = `<div class="empty-chart compact">차트 보기 버튼으로 렌더링</div>`;
    return;
  }
  const candles = unpackCandles(appData.chartData[code] ?? []);
  container.innerHTML = createCandlestickSvgChart(
    result,
    candles,
    mode === "detail" ? DETAIL_CHART_OPTIONS : MINI_CHART_OPTIONS,
  );
};

const attachEvents = () => {
  document.addEventListener("change", (event) => {
    if (event.target?.id === "sort-select") {
      sortKey = event.target.value;
      currentPage = 1;
      renderResultPanel();
    }
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.id === "download-csv") downloadCsv();
    if (button.id === "prev-page") {
      currentPage = Math.max(1, currentPage - 1);
      renderResultPanel();
    }
    if (button.id === "next-page") {
      currentPage += 1;
      renderResultPanel();
    }
    const action = button.dataset.action;
    const code = button.dataset.code;
    if (action && code) {
      renderChartForCode(code, action === "collapse" ? "none" : action);
    }
  });

  const tooltip = document.getElementById("chart-tooltip");
  document.addEventListener("mousemove", (event) => {
    const target = event.target.closest(".candle-hover-area");
    if (!target) {
      tooltip.style.display = "none";
      return;
    }
    const rate = Number(target.dataset.changeRate);
    const rateClass = !Number.isFinite(rate) || rate === 0 ? "flat" : rate > 0 ? "up" : "down";
    tooltip.innerHTML = `
      <strong>${escapeHtml(target.dataset.date)}</strong>
      <span>시가: ${formatPrice(target.dataset.open)}</span>
      <span>고가: ${formatPrice(target.dataset.high)}</span>
      <span>저가: ${formatPrice(target.dataset.low)}</span>
      <span>종가: ${formatPrice(target.dataset.close)}</span>
      <span>전일 종가 대비: <em class="${rateClass}">${Number.isFinite(rate) ? formatPercent(rate) : "N/A"}</em></span>
    `;
    tooltip.style.left = `${event.clientX + 12}px`;
    tooltip.style.top = `${event.clientY + 12}px`;
    tooltip.style.display = "grid";
  });
};

const loadScreeningData = async () => {
  const version = document.documentElement.dataset.assetVersion;
  const dataUrl = `./assets/screening-data.json${version ? `?v=${encodeURIComponent(version)}` : ""}`;
  const response = await fetch(dataUrl, { cache: "no-cache" });
  if (!response.ok) throw new Error(`failed to load screening-data.json: ${response.status}`);
  return response.json();
};

const boot = async () => {
  try {
    appData = await loadScreeningData();
    renderSummaryPanel();
    renderResultPanel();
    attachEvents();
  } catch (error) {
    document.body.innerHTML = `<main class="content"><div class="empty-state">데이터 로드 실패: ${escapeHtml(error.message)}</div></main>`;
  }
};

boot();
