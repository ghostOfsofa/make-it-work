import { run } from "./src/index.js";

const isDirectRun = process.argv[1] === new URL(import.meta.url).pathname;

if (isDirectRun) {
  run();
}
