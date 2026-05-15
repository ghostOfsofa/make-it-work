import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  calculatePriceRange,
  createRenderPoints,
  getTrendPrice,
  mergeOptions,
  priceToY,
} from "./analysis.js";
import {
  escapeHtml,
  formatDateLabel,
  formatNumber,
  formatPercent,
  formatPrice,
} from "./utils.js";

export const COLORS = Object.freeze({
  background: "#0b1220",
  panel: "#111827",
  grid: "#243044",
  text: "#cbd5e1",
  muted: "#94a3b8",
  bullish: "#ef4444",
  bearish: "#3b82f6",
  regression: "#f87171",
  trendNextPrice: "#facc15",
  selectedLine: "#d946ef",
  axis: "#475569",
  matchedArea: "rgba(148, 163, 184, 0.18)",
  ma5: "#d946ef",
  ma20: "#eab308",
  ma60: "#64748b",
  ma120: "#16a34a",
  signal: "#22c55e",
});

export const calculateNicePriceTicks = (minPrice, maxPrice, tickCount = 6) => {
  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || maxPrice <= minPrice) {
    return [];
  }
  const range = maxPrice - minPrice;
  const rawStep = range / Math.max(1, tickCount - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  const niceStep =
    residual >= 5 ? 5 * magnitude : residual >= 2 ? 2 * magnitude : magnitude;
  const start = Math.ceil(minPrice / niceStep) * niceStep;
  const ticks = [];
  for (let value = start; value <= maxPrice + niceStep * 0.5; value += niceStep) {
    ticks.push(value);
  }
  return ticks;
};

const createPolyline = (points, stroke, attrs = "") => {
  const valid = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (valid.length < 2) return "";
  return `<polyline points="${valid.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}" fill="none" stroke="${stroke}" ${attrs}/>`;
};

const calculateChangeRate = (value, prevClose) => {
  const price = Number(value);
  const base = Number(prevClose);
  if (!Number.isFinite(price) || !Number.isFinite(base) || base <= 0) return null;
  return ((price - base) / base) * 100;
};

export const createMovingAverageLine = (candles, period, scale, color) => {
  const points = candles.map((_, index) => {
    if (index + 1 < period) return { x: Number.NaN, y: Number.NaN };
    const slice = candles.slice(index + 1 - period, index + 1);
    const ma = slice.reduce((sum, candle) => sum + candle.close, 0) / period;
    return { x: scale.x(index), y: scale.y(ma) };
  });
  return createPolyline(points, color, `stroke-width="2" opacity="0.9"`);
};

const calculateLatestEMA = (candles, period) => {
  if (!Array.isArray(candles) || candles.length < period) return null;
  const values = candles.map((candle) => Number(candle.close));
  if (!values.every(Number.isFinite)) return null;
  const firstEma = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  const multiplier = 2 / (period + 1);
  return values.slice(period).reduce(
    (previousEma, value) => value * multiplier + previousEma * (1 - multiplier),
    firstEma,
  );
};

export const createGridLines = ({ chartWidth, chartHeight, margin, plotWidth, plotHeight, ticks, scale }) => {
  const horizontal = ticks
    .map((tick) => {
      const y = scale.y(tick);
      return `
        <line x1="${margin.left}" y1="${y}" x2="${margin.left + plotWidth}" y2="${y}" stroke="${COLORS.grid}" stroke-width="1"/>
        <text x="${chartWidth - margin.right + 12}" y="${y + 5}" fill="${COLORS.muted}" font-size="22">${formatPrice(tick)}</text>
      `;
    })
    .join("");
  const vertical = Array.from({ length: 6 }, (_, index) => {
    const x = margin.left + (plotWidth / 5) * index;
    return `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${chartHeight - margin.bottom}" stroke="${COLORS.grid}" stroke-width="1" opacity="0.65"/>`;
  }).join("");
  return `${horizontal}${vertical}`;
};

export const createAxisLabels = ({ candles, margin, chartHeight, plotWidth, scale }) => {
  const step = Math.max(1, Math.floor(candles.length / 5));
  return candles
    .map((candle, index) =>
      index % step === 0 || index === candles.length - 1
        ? `<text x="${scale.x(index)}" y="${chartHeight - margin.bottom + 34}" fill="${COLORS.muted}" font-size="22" text-anchor="middle">${formatDateLabel(candle.date)}</text>`
        : "",
    )
    .join("");
};

export const createCandleWickElement = ({ candle, x, scale, color }) =>
  `<line x1="${x}" y1="${scale.y(candle.high)}" x2="${x}" y2="${scale.y(candle.low)}" stroke="${color}" stroke-width="2"/>`;

export const createCandleBodyElement = ({ candle, x, scale, candleWidth, color }) => {
  const openY = scale.y(candle.open);
  const closeY = scale.y(candle.close);
  const bodyY = Math.min(openY, closeY);
  const bodyHeight = Math.max(1, Math.abs(closeY - openY));
  return `<rect x="${x - candleWidth / 2}" y="${bodyY}" width="${candleWidth}" height="${bodyHeight}" fill="${color}" stroke="${color}" stroke-width="0"/>`;
};

export const createHoverAreas = ({ candles, margin, plotHeight, candleSlotWidth, scale }) =>
  candles
    .map((candle, index) => {
      const prevClose = candles[index - 1]?.close;
      const openChangeRate = calculateChangeRate(candle.open, prevClose);
      const highChangeRate = calculateChangeRate(candle.high, prevClose);
      const lowChangeRate = calculateChangeRate(candle.low, prevClose);
      const closeChangeRate = calculateChangeRate(candle.close, prevClose);
      return `<rect class="candle-hover-area" x="${scale.x(index) - candleSlotWidth / 2}" y="${margin.top}" width="${candleSlotWidth}" height="${plotHeight}" fill="transparent"
        data-date="${escapeHtml(candle.date)}" data-open="${candle.open}" data-high="${candle.high}" data-low="${candle.low}" data-close="${candle.close}" data-prev-close="${prevClose ?? ""}"
        data-open-change-rate="${openChangeRate ?? ""}" data-high-change-rate="${highChangeRate ?? ""}" data-low-change-rate="${lowChangeRate ?? ""}" data-close-change-rate="${closeChangeRate ?? ""}"/>`;
    })
    .join("");

export const createBuySignalMarker = (signal, scale, chartWidth, margin) => {
  if (!signal || !Number.isFinite(signal.currentPrice)) return "";
  const y = scale.y(signal.currentPrice);
  if (!Number.isFinite(y)) return "";
  const x = chartWidth - margin.right - 24;
  return `
    <line x1="${margin.left}" y1="${y}" x2="${chartWidth - margin.right}" y2="${y}" stroke="${COLORS.signal}" stroke-width="2" stroke-dasharray="8 8"/>
    <circle cx="${x}" cy="${y}" r="9" fill="${COLORS.signal}"/>
    <text x="${x - 14}" y="${y - 14}" text-anchor="end" fill="${COLORS.signal}" font-size="22">MA5 돌파 ${formatPrice(signal.currentPrice)}</text>
  `;
};

const createMa5PriceGuide = ({ ma5Price, scale, chartWidth, margin }) => {
  if (!Number.isFinite(Number(ma5Price))) return "";
  const y = scale.y(Number(ma5Price));
  if (!Number.isFinite(y)) return "";
  return `
    <line x1="${margin.left}" y1="${y}" x2="${chartWidth - margin.right}" y2="${y}" stroke="${COLORS.ma5}" stroke-width="1.5" opacity="0.42"/>
    <text x="${chartWidth - margin.right - 10}" y="${y - 8}" fill="${COLORS.ma5}" font-size="18" text-anchor="end" opacity="0.78">EMA5 ${formatPrice(ma5Price)}</text>
  `;
};

const createTrendNextPriceGuide = ({ trendNextPrice, scale, chartWidth, margin }) => {
  if (!Number.isFinite(Number(trendNextPrice))) return "";
  const y = scale.y(Number(trendNextPrice));
  if (!Number.isFinite(y)) return "";
  return `
    <line x1="${margin.left}" y1="${y}" x2="${chartWidth - margin.right}" y2="${y}" stroke="${COLORS.trendNextPrice}" stroke-width="1.5" opacity="0.46"/>
    <text x="${chartWidth - margin.right - 10}" y="${y + 18}" fill="${COLORS.trendNextPrice}" font-size="18" text-anchor="end" opacity="0.82">다음추세 ${formatPrice(trendNextPrice)}</text>
  `;
};

const createStoredTrendLine = ({ stockResult, scale, candles, xStep }) => {
  const startIndex = candles.findIndex((candle) => candle.date === stockResult.scanStartDate);
  const endIndex = candles.findIndex((candle) => candle.date === stockResult.scanEndDate);
  const resolvedStartIndex = startIndex >= 0
    ? startIndex
    : Math.max(0, candles.length - Number(stockResult.matchedPeriod || 0));
  const resolvedEndIndex = endIndex >= 0 ? endIndex : candles.length - 1;
  const startPrice = Number(stockResult.trendLineStartPrice);
  const endPrice = Number(stockResult.trendLineEndPrice);
  const nextPrice = Number(stockResult.trendNextPrice);

  if (
    !Number.isFinite(startPrice) ||
    !Number.isFinite(endPrice) ||
    !Number.isFinite(nextPrice)
  ) {
    return "";
  }

  const points = [
    [scale.x(resolvedStartIndex), scale.y(startPrice)],
    [scale.x(resolvedEndIndex), scale.y(endPrice)],
    [scale.x(resolvedEndIndex) + xStep, scale.y(nextPrice)],
  ];

  if (points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) {
    return "";
  }

  return `<polyline points="${points.map(([x, y]) => `${x},${y}`).join(" ")}" fill="none" stroke="${COLORS.regression}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
};

export const createCandlestickSvgChart = (stockResult, options = {}) => {
  const merged = mergeOptions({ ...options, showSelectedPriceLine: false });
  const candles = (stockResult.renderCandles ?? stockResult.prices ?? []).slice(-merged.renderPeriod);
  if (candles.length < 2) return `<div class="empty-chart">차트 데이터 부족</div>`;

  const { chartWidth, chartHeight, margin } = merged;
  const plotWidth = chartWidth - margin.left - margin.right;
  const plotHeight = chartHeight - margin.top - margin.bottom;
  const rightPaddingBars = Math.max(0, Math.floor(Number(merged.rightPaddingBars) || 0));
  const virtualPeriod = candles.length + rightPaddingBars;
  const xStep = plotWidth / Math.max(1, virtualPeriod - 1);
  const trendPrices = candles.map(getTrendPrice);
  const { minPrice, maxPrice } = calculatePriceRange(candles, trendPrices);
  const scale = {
    x: (index) => margin.left + (index / Math.max(1, virtualPeriod - 1)) * plotWidth,
    y: (price) => priceToY(price, minPrice, maxPrice, plotHeight, margin.top),
  };
  const candleSlotWidth = plotWidth / virtualPeriod;
  const candleWidth = Math.max(2, Math.min(18, candleSlotWidth * 0.8));
  const ticks = calculateNicePriceTicks(minPrice, maxPrice, 7);
  const renderPoints = createRenderPoints(candles, merged);
  const scanPoints = renderPoints.slice(-stockResult.matchedPeriod);
  const firstScanX = scanPoints[0]?.xPixel;
  const lastScanX = scanPoints.at(-1)?.xPixel;
  const regressionLine =
    merged.showRegressionLine
      ? createStoredTrendLine({ stockResult, scale, candles, xStep })
      : "";
  const selectedLine =
    merged.showSelectedPriceLine
      ? createPolyline(
          renderPoints.map((point) => ({ x: point.xPixel, y: point.yPixel })),
          COLORS.selectedLine,
          `stroke-width="2" stroke-dasharray="7 7" opacity="0.85"`,
        )
      : "";
  const matchedX =
    merged.showMatchedArea && Number.isFinite(firstScanX) && Number.isFinite(lastScanX)
      ? `<rect x="${firstScanX}" y="${margin.top}" width="${Math.max(0, lastScanX - firstScanX)}" height="${plotHeight}" fill="${COLORS.matchedArea}"/>`
      : "";
  const candlesSvg = candles
    .map((candle, index) => {
      const color = candle.close >= candle.open ? COLORS.bullish : COLORS.bearish;
      const x = scale.x(index);
      return `
        ${merged.showCandleWick ? createCandleWickElement({ candle, x, scale, color }) : ""}
        ${createCandleBodyElement({ candle, x, scale, candleWidth, color })}
      `;
    })
    .join("");
  const lastCandle = candles.at(-1);
  const lastColor = lastCandle.close >= candles.at(-2)?.close ? COLORS.bullish : COLORS.bearish;
  const lastY = scale.y(lastCandle.close);
  const signal = stockResult.buySignal;
  const ma5Price = Number.isFinite(Number(stockResult.ma5Price))
    ? Number(stockResult.ma5Price)
    : Number.isFinite(Number(signal?.ma5Price))
      ? Number(signal.ma5Price)
      : calculateLatestEMA(candles, 5);

  return `
    <svg class="stock-chart" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="${escapeHtml(stockResult.name)} 봉차트">
      <rect width="${chartWidth}" height="${chartHeight}" fill="${COLORS.background}"/>
      ${matchedX}
      ${createGridLines({ chartWidth, chartHeight, margin, plotWidth, plotHeight, ticks, scale })}
      ${createMa5PriceGuide({ ma5Price, scale, chartWidth, margin })}
      ${createTrendNextPriceGuide({ trendNextPrice: stockResult.trendNextPrice, scale, chartWidth, margin })}
      ${createAxisLabels({ candles, margin, chartHeight, plotWidth, scale })}
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${chartHeight - margin.bottom}" stroke="${COLORS.axis}" stroke-width="1"/>
      <line x1="${chartWidth - margin.right}" y1="${margin.top}" x2="${chartWidth - margin.right}" y2="${chartHeight - margin.bottom}" stroke="${COLORS.axis}" stroke-width="1"/>
      ${createMovingAverageLine(candles, 5, scale, COLORS.ma5)}
      ${createMovingAverageLine(candles, 20, scale, COLORS.ma20)}
      ${createMovingAverageLine(candles, 60, scale, COLORS.ma60)}
      ${createMovingAverageLine(candles, 120, scale, COLORS.ma120)}
      ${selectedLine}
      ${candlesSvg}
      ${regressionLine}
      ${createBuySignalMarker(signal, scale, chartWidth, margin)}
      <rect x="${chartWidth - margin.right + 4}" y="${lastY - 18}" width="82" height="34" rx="4" fill="${lastColor}"/>
      <text x="${chartWidth - margin.right + 45}" y="${lastY + 6}" fill="white" font-size="20" text-anchor="middle">${formatPrice(lastCandle.close)}</text>
      <text x="${margin.left + 4}" y="30" fill="${COLORS.text}" font-size="22">${escapeHtml(stockResult.name)} ${escapeHtml(stockResult.code)} | 각도 ${formatNumber(stockResult.angleDegree)}° | R² ${formatNumber(stockResult.rSquared, 3)} | 수익률 ${formatPercent(stockResult.returnRate)}</text>
      <text x="${chartWidth - margin.right - 8}" y="30" fill="${COLORS.muted}" font-size="20" text-anchor="end">회귀 R² ${formatNumber(stockResult.rSquared, 3)}</text>
      ${createHoverAreas({ candles, margin, plotHeight, candleSlotWidth, scale })}
    </svg>
  `;
};

const metric = (label, value, className = "") =>
  `<span class="metric ${className}"><b>${escapeHtml(label)}</b>${value}</span>`;

const createResultCard = (result, index, options) => {
  const signal = result.buySignal;
  const signalClass = signal ? "has-signal" : "";
  return `
    <article class="result-card ${signalClass}" data-angle="${result.angleDegree}" data-return-rate="${result.returnRate}" data-r-squared="${result.rSquared}" data-matched-period="${result.matchedPeriod}">
      <header class="card-header">
        <div>
          <span class="rank">#${index + 1}</span>
          <h2>${escapeHtml(result.name)}</h2>
          <p>${escapeHtml(result.code)} · ${escapeHtml(result.market ?? "-")}</p>
        </div>
        <div class="price-box">
          <strong>${formatPrice(result.lastClose)}</strong>
          <span class="${result.dailyChangeRate >= 0 ? "up" : "down"}">${formatPercent(result.dailyChangeRate)}</span>
        </div>
      </header>
      <div class="chart-shell">${createCandlestickSvgChart(result, options)}</div>
      <div class="metrics">
        ${metric("구간", `${result.matchedPeriod}일`)}
        ${metric("검색 기간", `${escapeHtml(result.scanStartDate)} ~ ${escapeHtml(result.scanEndDate)}`)}
        ${metric("각도", `${formatNumber(result.angleDegree)}°`)}
        ${metric("slope", formatNumber(result.slopePixel, 4))}
        ${metric("R²", formatNumber(result.rSquared, 4))}
        ${metric("수익률", formatPercent(result.returnRate), result.returnRate <= 0 ? "down" : "up")}
        ${metric("MA5", signal ? formatPrice(signal.ma5Price) : "-")}
        ${metric("매수 신호", signal ? `발생 ${escapeHtml(signal.signalTime)}` : "없음", signal ? "signal" : "")}
        ${signal ? metric("신호가", formatPrice(signal.currentPrice), "signal") : ""}
        ${signal ? metric("필터가 대비", formatPercent(signal.profitRateFromFiltered), "signal") : ""}
      </div>
    </article>
  `;
};

const createClientScript = (payload) => `
  <script>
    window.__SCREENING_DATA__ = ${JSON.stringify(payload).replaceAll("</script", "<\\/script")};
    const tooltip = document.getElementById("chart-tooltip");
    const formatPrice = (value) => Number.isFinite(Number(value)) ? Math.round(Number(value)).toLocaleString("ko-KR") : "-";
    const calculateChangeRate = (value, prevClose) => {
      const price = Number(value);
      const base = Number(prevClose);
      if (!Number.isFinite(price) || !Number.isFinite(base) || base <= 0) return null;
      return ((price - base) / base) * 100;
    };
    const formatChangeRate = (value) => {
      const number = Number(value);
      if (!Number.isFinite(number)) return "N/A";
      return (number > 0 ? "+" : "") + number.toFixed(2) + "%";
    };
    const getChangeRateClass = (value) => {
      const number = Number(value);
      return !Number.isFinite(number) || number === 0 ? "neutral" : number > 0 ? "up" : "down";
    };
    const tooltipPriceLine = (label, price, rate) => {
      const safeRate = Number.isFinite(Number(rate)) ? Number(rate) : null;
      return "<span>" + label + ": " + formatPrice(price) + " <em class='tooltip-rate " + getChangeRateClass(safeRate) + "'>(" + formatChangeRate(safeRate) + ")</em></span>";
    };
    document.addEventListener("mousemove", (event) => {
      const target = event.target.closest(".candle-hover-area");
      if (!target) return;
      const prevClose = Number(target.dataset.prevClose);
      const openRate = calculateChangeRate(target.dataset.open, prevClose);
      const highRate = calculateChangeRate(target.dataset.high, prevClose);
      const lowRate = calculateChangeRate(target.dataset.low, prevClose);
      const closeRate = calculateChangeRate(target.dataset.close, prevClose);
      tooltip.innerHTML = [
        "<strong>" + target.dataset.date + "</strong>",
        tooltipPriceLine("시가", target.dataset.open, openRate),
        tooltipPriceLine("고가", target.dataset.high, highRate),
        tooltipPriceLine("저가", target.dataset.low, lowRate),
        tooltipPriceLine("종가", target.dataset.close, closeRate),
        "<span class='tooltip-base'>기준: 전일 종가 " + (Number.isFinite(prevClose) ? formatPrice(prevClose) : "N/A") + "</span>"
      ].join("");
      tooltip.style.left = event.clientX + 12 + "px";
      tooltip.style.top = event.clientY + 12 + "px";
      tooltip.style.display = "grid";
    });
    document.addEventListener("mouseleave", () => { tooltip.style.display = "none"; }, true);
    document.addEventListener("mouseover", (event) => {
      if (!event.target.closest(".candle-hover-area")) tooltip.style.display = "none";
    });

    const list = document.getElementById("results-list");
    document.getElementById("sort-select")?.addEventListener("change", (event) => {
      const key = event.target.value;
      const cards = Array.from(list.querySelectorAll(".result-card"));
      const sorters = {
        angle: (a, b) => Number(b.dataset.angle) - Number(a.dataset.angle),
        returnRate: (a, b) => Number(a.dataset.returnRate) - Number(b.dataset.returnRate),
        rSquared: (a, b) => Number(b.dataset.rSquared) - Number(a.dataset.rSquared),
        matchedPeriod: (a, b) => Number(b.dataset.matchedPeriod) - Number(a.dataset.matchedPeriod)
      };
      cards.sort(sorters[key] || sorters.angle).forEach((card, index) => {
        card.querySelector(".rank").textContent = "#" + (index + 1);
        list.appendChild(card);
      });
    });
    document.getElementById("download-csv")?.addEventListener("click", () => {
      const rows = window.__SCREENING_DATA__.results.map((row) => {
        const signal = row.buySignal || {};
        return [
          row.code, row.name, row.market, row.matchedPeriod, row.scanStartDate, row.scanEndDate,
          row.angleDegree, row.slopePixel, row.rSquared, row.returnRate, row.firstPrice,
          row.lastPrice, row.lastClose, row.dailyChangeRate, signal.status || "",
          signal.signalTime || "", signal.currentPrice || "", signal.ma5Price || "",
          signal.profitRateFromFiltered || ""
        ];
      });
      const header = "code,name,market,matchedPeriod,scanStartDate,scanEndDate,angleDegree,slopePixel,rSquared,returnRate,firstPrice,lastPrice,lastClose,dailyChangeRate,buySignalStatus,signalTime,signalCurrentPrice,ma5Price,profitRateFromFiltered";
      const csv = [header, ...rows.map((row) => row.map((value) => '"' + String(value ?? "").replaceAll('"', '""') + '"').join(","))].join("\\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "filtered-stocks-" + (window.__SCREENING_DATA__.summary.baseDate || "latest") + ".csv";
      anchor.click();
      URL.revokeObjectURL(url);
    });
    document.getElementById("go-top")?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    document.getElementById("go-bottom")?.addEventListener("click", () => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
  </script>
`;

export const generateChartHtml = (results, options, summary) => {
  const css = readFileSync("src/styles.css", "utf8");
  const safeResults = results ?? [];
  const payload = { summary, options, results: safeResults };
  const cards = safeResults
    .map((result, index) => createResultCard(result, index, options))
    .join("");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>우하향 추세 종목 스크리너</title>
  <style>${css}</style>
</head>
<body>
  <aside class="sidebar">
    <h1>우하향 스크리너</h1>
    <p class="subtitle">SQLite DB 기반 필터링 결과와 MA5 돌파 신호</p>
    <section class="summary-panel">
      ${metric("latest run", summary?.runId ?? "-")}
      ${metric("기준일", summary?.baseDate ?? "-")}
      ${metric("검색 대상", `${summary?.totalStockCount ?? 0}종목`)}
      ${metric("필터링", `${summary?.matchedStockCount ?? 0}종목`)}
      ${metric("매수 신호", `${summary?.buySignalCount ?? 0}건`)}
      ${metric("renderPeriod", options.renderPeriod)}
      ${metric("scan", `${options.scanMinPeriod}~${options.scanMaxPeriod}`)}
      ${metric("minAngle", `${options.minAngleDegree}°`)}
      ${metric("minReturn", `${options.minReturnRate}%`)}
      ${metric("minR²", options.minRSquared)}
    </section>
    <p class="note">필터링을 다시 하려면 <code>npm run screen</code>, HTML 갱신은 <code>npm run generate</code>를 실행합니다.</p>
  </aside>
  <main class="content">
    <header class="toolbar">
      <div>
        <h1>필터링 결과 ${safeResults.length}개 종목</h1>
        <p>현재가는 저장하지 않고, MA5 돌파 신호만 DB에 기록합니다.</p>
      </div>
      <div class="actions">
        <select id="sort-select">
          <option value="angle">각도 내림차순</option>
          <option value="returnRate">수익률 오름차순</option>
          <option value="rSquared">R² 내림차순</option>
          <option value="matchedPeriod">검색 구간 길이</option>
        </select>
        <button id="download-csv" type="button">CSV 다운로드</button>
      </div>
    </header>
    <section id="results-list" class="results-list">
      ${cards || `<div class="empty-state">필터링 결과가 없습니다. DB 생성 후 <code>npm run screen</code>을 실행하세요.</div>`}
    </section>
  </main>
  <div class="floating-actions">
    <button id="go-top" type="button">맨위</button>
    <button id="go-bottom" type="button">맨끝</button>
  </div>
  <div id="chart-tooltip"></div>
  ${createClientScript(payload)}
</body>
</html>`;
};

export const saveChartHtml = (html, filePath = "dist/chart.html") => {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, html, "utf8");
};
