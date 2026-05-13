export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const round = (value, digits = 2) => {
  if (!Number.isFinite(value)) return Number.NaN;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export const formatPrice = (value) =>
  Number.isFinite(value) ? Math.round(value).toLocaleString("ko-KR") : "-";

export const formatNumber = (value, digits = 2) =>
  Number.isFinite(value) ? round(value, digits).toLocaleString("ko-KR") : "-";

export const formatPercent = (value, digits = 2) => {
  if (!Number.isFinite(value)) return "-";
  const rounded = round(value, digits).toFixed(digits);
  return `${value > 0 ? "+" : ""}${rounded}%`;
};

export const formatDateLabel = (date) => {
  const parts = String(date ?? "").split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : String(date ?? "");
};

export const formatDateRangeLabel = (date) =>
  String(date ?? "").replaceAll("-", "/");

export const createSeededRandom = (seed = 123456789) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

export const randomBetween = (random, min, max) => min + (max - min) * random();

export const downloadFile = (fileName, content, type = "text/plain") => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const buildTooltipHtml = (dataset) => {
  const rate = Number(dataset.changeRate);
  const rateClass = !Number.isFinite(rate)
    ? "flat"
    : rate > 0
      ? "up"
      : rate < 0
        ? "down"
        : "flat";

  return `
    <strong>${escapeHtml(dataset.date)}</strong>
    <span>시가: ${formatPrice(Number(dataset.open))}</span>
    <span>고가: ${formatPrice(Number(dataset.high))}</span>
    <span>저가: ${formatPrice(Number(dataset.low))}</span>
    <span>종가: ${formatPrice(Number(dataset.close))}</span>
    <span>전일 종가 대비: <em class="${rateClass}">${
      Number.isFinite(rate) ? formatPercent(rate) : "N/A"
    }</em></span>
  `;
};
