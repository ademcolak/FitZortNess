import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fitzortness-dataset-import-test-"));
const datasetPath = path.join(tempDir, "exercises.json");
fs.writeFileSync(datasetPath, JSON.stringify([{
  id: "bench",
  name: "Barbell Bench Press",
  category: "strength",
  body_part: "chest",
  equipment: "barbell",
  muscle_group: "chest",
  target: "pectorals",
  secondary_muscles: ["triceps"],
  instructions: { tr: "Kontrollu uygula.", en: "Use a controlled motion." },
  image: "",
  gif_url: ""
}]));

process.env.DB_PATH = path.join(tempDir, "test.db");
process.env.DATASET_PATH = datasetPath;

const { getDb } = await import("../src/db.js");
const { importDataset } = await import("../src/importDataset.js");

test.after(() => {
  getDb().close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("reimporting an exercise preserves its approved media and Telegram cache", () => {
  importDataset();
  getDb().prepare(`
    INSERT INTO exercise_media (
      exercise_id, remote_url, media_type, source, source_url, license,
      license_url, attribution, sha256, telegram_bot_id, telegram_file_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "bench",
    "https://upload.wikimedia.org/bench.gif",
    "image/gif",
    "Wikimedia Commons",
    "https://commons.wikimedia.org/wiki/File:Bench.gif",
    "CC BY-SA 4.0",
    "https://creativecommons.org/licenses/by-sa/4.0/",
    "Example Author",
    "a".repeat(64),
    "bot-1",
    "cached-file-id"
  );

  importDataset();

  const cachedMedia = getDb().prepare("SELECT telegram_bot_id, telegram_file_id FROM exercise_media WHERE exercise_id = ?").get("bench");
  assert.equal(cachedMedia.telegram_bot_id, "bot-1");
  assert.equal(cachedMedia.telegram_file_id, "cached-file-id");
});
