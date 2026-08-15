import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { acquireBotInstanceLock } from "../src/botInstanceLock.js";

test("only one process can own a bot token lock at a time", () => {
  const lockDirectory = mkdtempSync(path.join(tmpdir(), "fitzortness-bot-lock-"));
  let releaseFirst;
  let releaseSecond;

  try {
    releaseFirst = acquireBotInstanceLock({ botToken: "test-token", lockDirectory });

    assert.throws(
      () => acquireBotInstanceLock({ botToken: "test-token", lockDirectory }),
      /already running/i
    );

    releaseFirst();
    releaseFirst = null;
    releaseSecond = acquireBotInstanceLock({ botToken: "test-token", lockDirectory });
  } finally {
    releaseSecond?.();
    releaseFirst?.();
    rmSync(lockDirectory, { recursive: true, force: true });
  }
});

test("a dead process lock is reclaimed after a crash", () => {
  const lockDirectory = mkdtempSync(path.join(tmpdir(), "fitzortness-stale-lock-"));
  let releaseRecovered;

  try {
    const crash = spawnSync(process.execPath, ["--input-type=module", "-e", `
      const { acquireBotInstanceLock } = await import("./src/botInstanceLock.js");
      acquireBotInstanceLock({ botToken: process.env.FITZORTNESS_TEST_TOKEN, lockDirectory: process.env.FITZORTNESS_TEST_LOCK_DIR });
      process.kill(process.pid, "SIGKILL");
    `], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FITZORTNESS_TEST_TOKEN: "stale-test-token",
        FITZORTNESS_TEST_LOCK_DIR: lockDirectory
      },
      encoding: "utf8"
    });
    assert.notEqual(crash.status, 0, crash.stderr);

    releaseRecovered = acquireBotInstanceLock({ botToken: "stale-test-token", lockDirectory });
  } finally {
    releaseRecovered?.();
    rmSync(lockDirectory, { recursive: true, force: true });
  }
});
