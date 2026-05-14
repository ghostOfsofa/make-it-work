import { existsSync } from "node:fs";

const DEFAULT_DB_PATH = "data/stocks.db";
const UPLOAD_DB_PATH = "dist/stocks.db";

export const resolveDbPath = () => {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  if (existsSync(DEFAULT_DB_PATH)) return DEFAULT_DB_PATH;
  if (existsSync(UPLOAD_DB_PATH)) return UPLOAD_DB_PATH;
  return DEFAULT_DB_PATH;
};

export const hasReadableDb = (dbPath = resolveDbPath()) => existsSync(dbPath);

export { DEFAULT_DB_PATH, UPLOAD_DB_PATH };
