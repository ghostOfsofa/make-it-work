import { createSeededRandom, randomBetween } from "./utils.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PATTERNS = ["downtrend", "uptrend", "sideways", "spikeThenDown", "dropThenRebound"];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toDateString = (date) => date.toISOString().slice(0, 10);

const addTradingDays = (startDate, count) => {
  const dates = [];
  let current = new Date(startDate);

  while (dates.length < count) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(toDateString(current));
    current = new Date(current.getTime() + MS_PER_DAY);
  }

  return dates;
};

const patternRate = ({ patternType, index, candleCount, random, profile }) => {
  const progress = candleCount <= 1 ? 1 : index / (candleCount - 1);
  const noise = randomBetween(random, -profile.noiseLimit, profile.noiseLimit);
  const wave = Math.sin(index / profile.cyclePeriod) * profile.cycleAmplitude;
  const recentStart = Math.max(0, candleCount - profile.downtrendLength);
  const inRecentDowntrend = index >= recentStart;
  const recentProgress = inRecentDowntrend
    ? (index - recentStart) / Math.max(profile.downtrendLength - 1, 1)
    : 0;

  switch (patternType) {
    case "downtrend":
      if (!inRecentDowntrend) {
        return clamp(profile.drift + wave + noise, -0.055, 0.055);
      }
      return clamp(
        profile.downtrendDailyRate +
          noise * 0.55 +
          wave * 0.25 +
          (recentProgress > 0.75 ? randomBetween(random, -0.004, 0.002) : 0),
        -0.085,
        0.035,
      );
    case "uptrend":
      return clamp(profile.uptrendDailyRate + wave + noise, -0.045, 0.075);
    case "sideways":
      return clamp(wave + noise + randomBetween(random, -0.012, 0.012), -0.06, 0.06);
    case "spikeThenDown":
      if (progress < 0.3) return clamp(randomBetween(random, 0.015, 0.07) + noise, -0.03, 0.09);
      if (progress < 0.48) return clamp(randomBetween(random, -0.018, 0.022) + noise + wave, -0.05, 0.05);
      return clamp(profile.spikeDropDailyRate + noise + wave * 0.35, -0.075, 0.035);
    case "dropThenRebound":
      if (progress < 0.34) return clamp(randomBetween(random, -0.07, -0.018) + noise, -0.09, 0.03);
      if (progress < 0.56) return clamp(randomBetween(random, -0.014, 0.02) + noise + wave, -0.045, 0.055);
      return clamp(profile.reboundDailyRate + noise + wave * 0.4, -0.04, 0.075);
    default:
      return clamp(noise + wave, -0.06, 0.06);
  }
};

const createPatternProfile = (patternType, random) => {
  const downtrendLength = Math.round(randomBetween(random, 28, 42));
  const downtrendTotalDrop = randomBetween(random, 0.32, 0.55);
  return {
    basePrice: randomBetween(random, 5_000, 180_000),
    gapLimit: randomBetween(random, 0.01, 0.08),
    wickLimit: randomBetween(random, 0.008, 0.08),
    noiseLimit: randomBetween(random, 0.004, 0.018),
    cycleAmplitude: randomBetween(random, 0.003, 0.018),
    cyclePeriod: randomBetween(random, 12, 38),
    drift: randomBetween(random, -0.002, 0.002),
    downtrendLength,
    downtrendDailyRate: Math.log(1 - downtrendTotalDrop) / downtrendLength,
    uptrendDailyRate: Math.log(1 + randomBetween(random, 0.22, 0.7)) / 120,
    spikeDropDailyRate: Math.log(1 - randomBetween(random, 0.22, 0.45)) / 60,
    reboundDailyRate: Math.log(1 + randomBetween(random, 0.2, 0.55)) / 54,
  };
};

export const generatePatternedStock = ({
  code,
  name,
  market = "SAMPLE",
  patternType,
  candleCount,
  random,
  startDate = "2025-11-27",
}) => {
  const dates = addTradingDays(startDate, candleCount);
  const profile = createPatternProfile(patternType, random);
  const prices = [];
  let prevClose = Math.round(profile.basePrice);

  for (let index = 0; index < candleCount; index += 1) {
    const dailyLowerLimit = Math.max(1, prevClose * 0.71);
    const dailyUpperLimit = Math.max(1, prevClose * 1.29);
    const openGapRate = randomBetween(random, -profile.gapLimit, profile.gapLimit);
    const closeChangeRate = clamp(
      patternRate({ patternType, index, candleCount, random, profile }),
      -0.29,
      0.29,
    );

    const open = clamp(prevClose * (1 + openGapRate), dailyLowerLimit, dailyUpperLimit);
    const close = clamp(prevClose * (1 + closeChangeRate), dailyLowerLimit, dailyUpperLimit);
    const high = clamp(
      Math.max(open, close) * (1 + randomBetween(random, 0, profile.wickLimit)),
      dailyLowerLimit,
      dailyUpperLimit,
    );
    const low = clamp(
      Math.min(open, close) * (1 - randomBetween(random, 0, profile.wickLimit)),
      dailyLowerLimit,
      dailyUpperLimit,
    );
    const volume = randomBetween(random, 80_000, 15_000_000) * (1 + Math.abs(closeChangeRate) * 8);

    const candle = {
      date: dates[index],
      open: Math.round(open),
      high: Math.round(Math.max(high, open, close)),
      low: Math.round(Math.min(low, open, close)),
      close: Math.round(close),
      volume: Math.round(volume),
    };

    prices.push(candle);
    prevClose = candle.close;
  }

  return { code, name, market, patternType, prices };
};

export const generateSampleStocks = ({
  stockCount = 300,
  candleCount = 120,
  seed = Date.now(),
} = {}) => {
  const random = createSeededRandom(seed);
  const downtrendCount = Math.min(stockCount, Math.max(30, Math.ceil(stockCount * 0.2)));

  return Array.from({ length: stockCount }, (_, index) => {
    const patternType =
      index < downtrendCount
        ? "downtrend"
        : PATTERNS[(index - downtrendCount) % PATTERNS.length];

    return generatePatternedStock({
      code: `STK${String(index + 1).padStart(4, "0")}`,
      name: `샘플종목${index + 1}`,
      market: "SAMPLE",
      patternType,
      candleCount,
      random,
    });
  });
};

export { createSeededRandom, randomBetween };
