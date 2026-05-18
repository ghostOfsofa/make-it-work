import express from "express";
import {
  closeDatabase,
  getLatestScreeningRun,
  getScreenTypeName,
  loadBuySignalsByRunId,
  loadFilteredStocksByRunId,
  loadFilteredStocksWithCurrentPrice,
  loadLatestBuySignalsForApi,
  loadLatestFilteredStocksForApi,
  loadLatestScreeningRunForApi,
  loadScreeningRuns,
  loadStockDetailForApi,
  openDatabase,
  SCREEN_TYPES,
} from "./db.js";
import { hasReadableDb, resolveDbPath } from "./config.js";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const API_KEY = process.env.API_KEY;
const dbPath = process.env.DB_PATH ?? resolveDbPath();

const app = express();

const jsonError = (res, status, message) =>
  res.status(status).json({ ok: false, error: message });

const normalizeScreenType = (value) => {
  if (value == null || value === "") return null;
  const screenType = String(value).toUpperCase();
  return Object.values(SCREEN_TYPES).includes(screenType) ? screenType : undefined;
};

const getValidScreenTypeOrRespond = (req, res) => {
  const screenType = normalizeScreenType(req.query.screen_type ?? req.query.screenType);
  if (screenType === undefined) {
    jsonError(res, 400, "Invalid screen_type");
    return undefined;
  }
  return screenType;
};

const requireApiKey = (req, res, next) => {
  if (!API_KEY) {
    next();
    return;
  }
  if (req.get("x-api-key") !== API_KEY) {
    jsonError(res, 401, "invalid api key");
    return;
  }
  next();
};

const withDatabase = (res, handler) => {
  if (!hasReadableDb(dbPath)) {
    jsonError(res, 404, `database not found: ${dbPath}`);
    return;
  }

  let db;
  try {
    db = openDatabase(dbPath);
    handler(db);
  } catch (error) {
    jsonError(res, 500, error.message);
  } finally {
    closeDatabase(db);
  }
};

app.use(requireApiKey);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "stock-screener-api" });
});

app.get("/api/latest-run", (req, res) => {
  const screenType = getValidScreenTypeOrRespond(req, res);
  if (screenType === undefined) return;
  withDatabase(res, (db) => {
    const run = loadLatestScreeningRunForApi(db, screenType);
    if (!run) {
      jsonError(res, 404, "latest screening run not found");
      return;
    }
    res.json({ ok: true, run });
  });
});

app.get("/api/filtered-stocks/latest", (req, res) => {
  const screenType = getValidScreenTypeOrRespond(req, res);
  if (screenType === undefined) return;
  withDatabase(res, (db) => {
    const { run, count, results } = loadLatestFilteredStocksForApi(db, {
      ...req.query,
      screen_type: screenType,
    });
    if (!run) {
      jsonError(res, 404, "latest screening run not found");
      return;
    }
    res.json({
      ok: true,
      runId: run.runId,
      baseDate: run.baseDate,
      screenType: run.screenType,
      screenName: run.screenName,
      count,
      results,
    });
  });
});

app.get("/api/screening-runs", (req, res) => {
  withDatabase(res, (db) => {
    res.json({ ok: true, runs: loadScreeningRuns(db, req.query) });
  });
});

app.get("/api/filtered-stocks", (req, res) => {
  const screenType = getValidScreenTypeOrRespond(req, res);
  if (screenType === undefined) return;
  withDatabase(res, (db) => {
    const latestRun = getLatestScreeningRun(db, screenType);
    const runId = Number(req.query.run_id ?? latestRun?.run_id);
    if (!Number.isFinite(runId)) {
      jsonError(res, 404, "screening run not found");
      return;
    }
    const includeCurrent = String(req.query.include_current ?? "false") === "true";
    const results = includeCurrent
      ? loadFilteredStocksWithCurrentPrice(db, runId, screenType)
      : loadFilteredStocksByRunId(db, runId, screenType);
    const signals = loadBuySignalsByRunId(db, runId);
    res.json({
      ok: true,
      runId,
      screenType: latestRun?.screen_type ?? screenType,
      screenName: getScreenTypeName(latestRun?.screen_type ?? screenType),
      count: results.length,
      results,
      buySignalCount: signals.length,
    });
  });
});

app.get("/api/buy-signals/latest", (req, res) => {
  withDatabase(res, (db) => {
    const { run, count, signals } = loadLatestBuySignalsForApi(db, req.query);
    if (!run) {
      jsonError(res, 404, "latest screening run not found");
      return;
    }
    res.json({
      ok: true,
      runId: run.runId,
      count,
      signals,
    });
  });
});

app.get("/api/stocks/:code", (req, res) => {
  withDatabase(res, (db) => {
    const detail = loadStockDetailForApi(db, req.params.code);
    if (!detail) {
      jsonError(res, 404, "stock result not found");
      return;
    }
    res.json({ ok: true, ...detail });
  });
});

app.use((_req, res) => {
  jsonError(res, 404, "not found");
});

app.listen(PORT, HOST, () => {
  console.log(`stock-screener-api listening on http://${HOST}:${PORT}`);
  console.log(`db: ${dbPath}`);
});
