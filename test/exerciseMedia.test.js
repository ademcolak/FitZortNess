import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fitzortness-media-license-test-"));
const manifestPath = path.join(tempDir, "exercise-media.json");
const validManifest = {
  version: 1,
  media: [{
    exercise_id: "bench",
    remote_url: "https://upload.wikimedia.org/example/bench.gif",
    media_type: "image/gif",
    source: "Example Media Library",
    source_url: "https://example.test/bench",
    license: "Example Commercial License",
    license_url: "https://example.test/license",
    attribution: "Example Media Library",
    sha256: "e0b9534a88454466dda2c3b73e1e6fcf1d3eb364a6b68f0bd6ef55d2d596e660",
    enabled: true
  }]
};
fs.writeFileSync(manifestPath, JSON.stringify(validManifest));
process.env.DB_PATH = path.join(tempDir, "test.db");
process.env.EXERCISE_MEDIA_MANIFEST = manifestPath;

const { getDb } = await import("../src/db.js");
const { cacheExerciseAnimationFileId, findApprovedExerciseAnimation, importExerciseMedia } = await import("../src/exerciseMedia.js");

test.after(() => {
  getDb().close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("approved remote exercise media is imported without a local GIF", () => {
  getDb().prepare(`
    INSERT INTO exercises (id, name, secondary_muscles_json, raw_json)
    VALUES ('bench', 'Barbell Bench Press', '[]', '{}')
  `).run();

  assert.equal(importExerciseMedia(), 1);
  assert.deepEqual(findApprovedExerciseAnimation("bench"), {
    exerciseId: "bench",
    remoteUrl: "https://upload.wikimedia.org/example/bench.gif",
    mediaType: "image/gif",
    source: "Example Media Library",
    sourceUrl: "https://example.test/bench",
    license: "Example Commercial License",
    licenseUrl: "https://example.test/license",
    attribution: "Example Media Library",
    sha256: "e0b9534a88454466dda2c3b73e1e6fcf1d3eb364a6b68f0bd6ef55d2d596e660",
    telegramBotId: null,
    telegramFileId: null
  });
});

test("media approval requires an explicit boolean enabled value", () => {
  fs.writeFileSync(manifestPath, JSON.stringify({
    ...validManifest,
    media: [{ ...validManifest.media[0], enabled: "false" }]
  }));

  assert.throws(() => importExerciseMedia(), /enabled must be a boolean/);
  fs.writeFileSync(manifestPath, JSON.stringify(validManifest));
});

test("duplicate exercise IDs are rejected instead of silently replacing approval metadata", () => {
  fs.writeFileSync(manifestPath, JSON.stringify({
    ...validManifest,
    media: [validManifest.media[0], { ...validManifest.media[0], remote_url: "https://upload.wikimedia.org/example/other.gif" }]
  }));

  assert.throws(() => importExerciseMedia(), /Duplicate exercise media ID: bench/);
  fs.writeFileSync(manifestPath, JSON.stringify(validManifest));
});

test("an unchanged remote media import preserves its Telegram file cache", () => {
  cacheExerciseAnimationFileId("bench", "test-bot", "telegram-file-id");
  assert.equal(importExerciseMedia(), 1);

  const media = findApprovedExerciseAnimation("bench");
  assert.equal(media.telegramBotId, "test-bot");
  assert.equal(media.telegramFileId, "telegram-file-id");
});

test("a changed approved remote file invalidates its Telegram file cache", () => {
  cacheExerciseAnimationFileId("bench", "test-bot", "telegram-file-id");
  fs.writeFileSync(manifestPath, JSON.stringify({
    ...validManifest,
    media: [{ ...validManifest.media[0], sha256: "0".repeat(64) }]
  }));

  assert.equal(importExerciseMedia(), 1);
  assert.equal(findApprovedExerciseAnimation("bench").telegramBotId, null);
  assert.equal(findApprovedExerciseAnimation("bench").telegramFileId, null);
  fs.writeFileSync(manifestPath, JSON.stringify(validManifest));
  importExerciseMedia();
});
