import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const setupScript = path.join(projectRoot, "src", "checkSetup.js");

test("setup check fails when Telegram startup configuration is missing", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fitzortness-setup-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const datasetPath = path.join(tempDir, "exercises.json");
  const manifestPath = path.join(tempDir, "exercise-media.json");
  fs.writeFileSync(datasetPath, "[]");
  fs.writeFileSync(manifestPath, "[]");

  const result = spawnSync(process.execPath, [setupScript], {
    cwd: tempDir,
    env: {
      ...process.env,
      TELEGRAM_BOT_TOKEN: "",
      TELEGRAM_ALLOWED_USER_IDS: "",
      TELEGRAM_ALLOWED_USER_IDS_FILE: path.join(tempDir, "missing-allowlist.txt"),
      TELEGRAM_ALLOW_ALL: "false",
      DATASET_PATH: datasetPath,
      EXERCISE_MEDIA_MANIFEST: manifestPath
    },
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /TELEGRAM_BOT_TOKEN/);
  assert.match(result.stderr, /allowlist/i);
});

test("the example environment does not enable an unauthenticated LLM", () => {
  const example = fs.readFileSync(path.join(projectRoot, ".env.example"), "utf8");
  assert.match(example, /^LLM_BASE_URL=$/m);
});

test("setup check rejects an unpinned dataset snapshot", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fitzortness-dataset-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const datasetPath = path.join(tempDir, "exercises.json");
  const manifestPath = path.join(tempDir, "exercise-media.json");
  fs.writeFileSync(path.join(tempDir, ".env"), "");
  fs.writeFileSync(datasetPath, "[]");
  fs.writeFileSync(manifestPath, "[]");

  const result = spawnSync(process.execPath, [setupScript], {
    cwd: tempDir,
    env: {
      ...process.env,
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_ALLOWED_USER_IDS: "123",
      TELEGRAM_ALLOWED_USER_IDS_FILE: path.join(tempDir, "missing-allowlist.txt"),
      TELEGRAM_ALLOW_ALL: "false",
      DATASET_PATH: datasetPath,
      EXERCISE_MEDIA_MANIFEST: manifestPath
    },
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /checksum/i);
});
