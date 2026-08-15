import { bootstrap } from "./bootstrap.js";

try {
  await bootstrap({ onReady: () => console.log("FitZortNess bot running.") });
} catch (error) {
  console.error(error);
  process.exit(1);
}
