import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fitzortness-form-test-"));
const datasetRoot = path.join(tempDir, "dataset");
process.env.DB_PATH = path.join(tempDir, "test.db");
process.env.DATASET_PATH = path.join(datasetRoot, "data", "exercises.json");

const { getDb } = await import("../src/db.js");
const { sendExerciseFormGuide } = await import("../src/exerciseForm.js");

function approveAnimation(exerciseId, remoteUrl) {
  getDb().prepare(`
    INSERT INTO exercise_media (
      exercise_id, remote_url, media_type, source, source_url, license, license_url, attribution, sha256, enabled
    ) VALUES (?, ?, 'image/gif', 'Test Source', 'https://example.test/source', 'Test License', 'https://example.test/license', 'Test Source', ?, 1)
  `).run(exerciseId, remoteUrl, "3b34c6906f7eece822ea010af5ad778c45f86cfbed167b84e33b9f3f293f98b8");
}

test.after(() => {
  getDb().close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("an exercise-form question returns dataset instructions and its animation", async () => {
  const db = getDb();
  db.prepare(`
    INSERT INTO exercises (id, name, equipment, target, instructions_tr, gif_url, secondary_muscles_json, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, '[]', '{}')
  `).run("bench", "Barbell Bench Press", "barbell", "pectorals", "Kurek kemiklerini geriye al ve bari kontrollu indir.", "videos/bench.gif");
  db.prepare(`
    INSERT INTO exercise_metadata (exercise_id, movement_pattern, exercise_type, difficulty, metadata_status)
    VALUES (?, 'horizontal_push', 'compound', 'intermediate', 'reviewed')
  `).run("bench");
  approveAnimation("bench", "https://upload.wikimedia.org/example/bench.gif");

  const sentTexts = [];
  const sentAnimations = [];
  const handled = await sendExerciseFormGuide({
    chatId: 42,
    userMessage: "Bench press pozisyonu nasil olmali?",
    sendText: async (chatId, text) => sentTexts.push({ chatId, text }),
    sendAnimation: async (chatId, media) => sentAnimations.push({ chatId, media })
  });

  assert.equal(handled, true);
  assert.deepEqual(sentTexts, [{
    chatId: 42,
    text: "Barbell Bench Press\nHedef: pectorals | Ekipman: barbell\n\nKurek kemiklerini geriye al ve bari kontrollu indir.\n\nNot: Animasyon genel gorsel referanstir; kisiye ozel teknik degerlendirme degildir.\nMedya: Test Source\nKaynak: https://example.test/source\nLisans: Test License - https://example.test/license"
  }]);
  assert.deepEqual(sentAnimations, [{
    chatId: 42,
    media: {
      exerciseId: "bench",
      remoteUrl: "https://upload.wikimedia.org/example/bench.gif",
      mediaType: "image/gif",
      source: "Test Source",
      sourceUrl: "https://example.test/source",
      license: "Test License",
      licenseUrl: "https://example.test/license",
      attribution: "Test Source",
      sha256: "3b34c6906f7eece822ea010af5ad778c45f86cfbed167b84e33b9f3f293f98b8",
      telegramBotId: null,
      telegramFileId: null
    }
  }]);
});

test("a natural-language question resolves a single-word exercise without an alias", async () => {
  const db = getDb();
  db.prepare(`
    INSERT INTO exercises (id, name, equipment, target, instructions_tr, gif_url, secondary_muscles_json, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, '[]', '{}')
  `).run("burpee", "Burpee", "body weight", "cardiovascular system", "Comel, ellerini yere koy ve kontrollu sicra.", "videos/burpee.gif");
  db.prepare(`
    INSERT INTO exercise_metadata (exercise_id, movement_pattern, exercise_type, difficulty, metadata_status)
    VALUES (?, 'conditioning', 'compound', 'intermediate', 'reviewed')
  `).run("burpee");
  approveAnimation("burpee", "https://upload.wikimedia.org/example/burpee.gif");

  const sentAnimations = [];
  const handled = await sendExerciseFormGuide({
    chatId: 42,
    userMessage: "Burpee nasil yapiliyor?",
    sendText: async () => {},
    sendAnimation: async (chatId, media) => sentAnimations.push({ chatId, remoteUrl: media.remoteUrl })
  });

  assert.equal(handled, true);
  assert.deepEqual(sentAnimations, [{ chatId: 42, remoteUrl: "https://upload.wikimedia.org/example/burpee.gif" }]);
});

test("a generic exercise name resolves to its seeded canonical match", async () => {
  const db = getDb();
  const insertExercise = db.prepare(`
    INSERT INTO exercises (id, name, equipment, target, instructions_tr, gif_url, secondary_muscles_json, raw_json)
    VALUES (?, ?, 'barbell', 'glutes', 'Bari kontrollu kaldir.', ?, '[]', '{}')
  `);
  const insertMetadata = db.prepare(`
    INSERT INTO exercise_metadata (exercise_id, movement_pattern, exercise_type, difficulty, metadata_status)
    VALUES (?, 'hinge', 'compound', 'advanced', ?)
  `);
  insertExercise.run("deadlift-1", "Barbell Romanian Deadlift", "videos/bench.gif");
  insertMetadata.run("deadlift-1", "reviewed");
  insertExercise.run("deadlift-cable", "Cable Deadlift", "videos/bench.gif");
  insertMetadata.run("deadlift-cable", "auto_tagged");
  insertExercise.run("deadlift-2", "Barbell Deadlift", "videos/deadlift.gif");
  insertMetadata.run("deadlift-2", "auto_tagged");
  approveAnimation("deadlift-2", "https://upload.wikimedia.org/example/deadlift.gif");

  const sentTexts = [];
  const sentAnimations = [];
  const handled = await sendExerciseFormGuide({
    chatId: 42,
    userMessage: "Deadlift nasil yapilir?",
    sendText: async (_chatId, text) => sentTexts.push(text),
    sendAnimation: async (_chatId, media) => sentAnimations.push(media.remoteUrl)
  });

  assert.equal(handled, true);
  assert.equal(sentTexts[0].split("\n", 1)[0], "Barbell Deadlift");
  assert.deepEqual(sentAnimations, ["https://upload.wikimedia.org/example/deadlift.gif"]);
});

test("a form question without a matching exercise stays in the conversation flow", async () => {
  const sentTexts = [];
  const sentAnimations = [];
  const handled = await sendExerciseFormGuide({
    chatId: 42,
    userMessage: "Uyku pozisyonu nasil olmali?",
    sendText: async (...args) => sentTexts.push(args),
    sendAnimation: async (...args) => sentAnimations.push(args)
  });

  assert.equal(handled, false);
  assert.deepEqual(sentTexts, []);
  assert.deepEqual(sentAnimations, []);
});

test("a form request without an exercise name does not choose a random animation", async () => {
  const sentAnimations = [];
  const handled = await sendExerciseFormGuide({
    chatId: 42,
    userMessage: "Hareketi goster",
    sendText: async () => {},
    sendAnimation: async (...args) => sentAnimations.push(args)
  });

  assert.equal(handled, false);
  assert.deepEqual(sentAnimations, []);
});

test("an exercise whose animation is unavailable stays in the conversation flow", async () => {
  const db = getDb();
  db.prepare(`
    INSERT INTO exercises (id, name, equipment, target, instructions_tr, gif_url, secondary_muscles_json, raw_json)
    VALUES (?, ?, 'dumbbell', 'biceps', 'Dirseklerini sabit tut.', 'videos/missing.gif', '[]', '{}')
  `).run("missing-gif", "No Gif Curl");
  db.prepare(`
    INSERT INTO exercise_metadata (exercise_id, movement_pattern, exercise_type, difficulty, metadata_status)
    VALUES (?, 'elbow_flexion', 'isolation', 'beginner', 'reviewed')
  `).run("missing-gif");
  const sentTexts = [];

  const handled = await sendExerciseFormGuide({
    chatId: 42,
    userMessage: "No Gif Curl nasil yapilir?",
    sendText: async (...args) => sentTexts.push(args),
    sendAnimation: async () => {}
  });

  assert.equal(handled, false);
  assert.deepEqual(sentTexts, []);
});

test("a legacy dataset GIF is not sent without an approved media record", async () => {
  const db = getDb();
  db.prepare(`
    INSERT INTO exercises (id, name, equipment, target, instructions_tr, gif_url, secondary_muscles_json, raw_json)
    VALUES ('legacy-only', 'Legacy Curl', 'dumbbell', 'biceps', 'Dirseklerini sabit tut.', 'videos/legacy.gif', '[]', '{}')
  `).run();
  db.prepare(`
    INSERT INTO exercise_metadata (exercise_id, movement_pattern, exercise_type, difficulty, metadata_status)
    VALUES ('legacy-only', 'elbow_flexion', 'isolation', 'beginner', 'reviewed')
  `).run();
  const sentAnimations = [];

  const handled = await sendExerciseFormGuide({
    chatId: 42,
    userMessage: "Legacy Curl nasil yapilir?",
    sendText: async () => {},
    sendAnimation: async (...args) => sentAnimations.push(args)
  });

  assert.equal(handled, false);
  assert.deepEqual(sentAnimations, []);
});
