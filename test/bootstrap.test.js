import test from "node:test";
import assert from "node:assert/strict";
import { bootstrap } from "../src/bootstrap.js";

test("startup runs imports, Telegram setup, smoke checks, and polling in order", async () => {
  const calls = [];

  await bootstrap({
    acquireBotInstanceLock: () => {
      calls.push("lock");
      return () => calls.push("unlock");
    },
    importDataset: () => calls.push("dataset"),
    importExerciseMedia: () => calls.push("media"),
    setupTelegram: async () => calls.push("telegram"),
    runSmokeTest: () => calls.push("smoke"),
    startBot: async () => calls.push("bot")
  });

  assert.deepEqual(calls, ["lock", "dataset", "media", "telegram", "smoke", "bot", "unlock"]);
});

test("startup stops before polling when a required setup step fails", async () => {
  let botStarted = false;

  await assert.rejects(bootstrap({
    acquireBotInstanceLock: () => () => {},
    importDataset: () => { throw new Error("dataset missing"); },
    importExerciseMedia: () => {},
    setupTelegram: async () => {},
    runSmokeTest: () => {},
    startBot: async () => { botStarted = true; }
  }), /dataset missing/);
  assert.equal(botStarted, false);
});
