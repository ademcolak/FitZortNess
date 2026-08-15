import { acquireBotInstanceLock } from "./botInstanceLock.js";
import { startBot } from "./bot.js";
import { config } from "./config.js";
import { importDataset } from "./importDataset.js";
import { importExerciseMedia } from "./exerciseMedia.js";
import { setupTelegram } from "./setupTelegram.js";
import { runSmokeTest } from "./smokeTest.js";

export async function bootstrap(overrides = {}) {
  const dependencies = {
    acquireBotInstanceLock: () => acquireBotInstanceLock({ botToken: config.telegramBotToken }),
    importDataset,
    importExerciseMedia,
    setupTelegram,
    runSmokeTest,
    startBot,
    onReady: () => {},
    ...overrides
  };

  const releaseInstanceLock = dependencies.acquireBotInstanceLock();
  try {
    dependencies.importDataset();
    dependencies.importExerciseMedia();
    await dependencies.setupTelegram();
    dependencies.runSmokeTest();
    dependencies.onReady();
    await dependencies.startBot();
  } finally {
    releaseInstanceLock();
  }
}
