import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fitzortness-test-"));
process.env.DB_PATH = path.join(tempDir, "test.db");

const { getDb } = await import("../src/db.js");
const { findExerciseByName, findExercises, normalizeMuscleGroupList } = await import("../src/exerciseSearch.js");

test.after(() => {
  getDb().close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("excluded exercise names are not returned by exercise search", () => {
  const db = getDb();
  const insertExercise = db.prepare(`
    INSERT INTO exercises (id, name, equipment, target, secondary_muscles_json, raw_json)
    VALUES (?, ?, ?, ?, '[]', '{}')
  `);
  const insertMetadata = db.prepare(`
    INSERT INTO exercise_metadata (exercise_id, movement_pattern, exercise_type, difficulty, metadata_status)
    VALUES (?, 'horizontal_push', 'compound', 'intermediate', 'reviewed')
  `);

  insertExercise.run("bench", "Barbell Bench Press", "barbell", "pectorals");
  insertMetadata.run("bench");
  insertExercise.run("machine", "Machine Chest Press", "leverage machine", "pectorals");
  insertMetadata.run("machine");

  const results = findExercises({
    targetMuscles: ["chest"],
    equipment: ["gym"],
    excludeNames: ["bench press"],
    limit: 10
  });

  assert.deepEqual(results.map((exercise) => exercise.name), ["Machine Chest Press"]);

  insertExercise.run("rdl", "Romanian Deadlift", "barbell", "hamstrings");
  insertMetadata.run("rdl");
  const hingeResults = findExercises({
    targetMuscles: ["hamstrings"],
    equipment: ["gym"],
    excludeNames: ["rdl"],
    limit: 10
  });
  assert.deepEqual(hingeResults, []);
});

test("common paraphrases of full gym access still match gym equipment", () => {
  const db = getDb();
  db.prepare(`
    INSERT INTO exercises (id, name, equipment, target, secondary_muscles_json, raw_json)
    VALUES ('gym-curl', 'Barbell Curl', 'barbell', 'biceps', '[]', '{}')
  `).run();
  db.prepare(`
    INSERT INTO exercise_metadata (exercise_id, movement_pattern, exercise_type, difficulty, metadata_status)
    VALUES ('gym-curl', 'pull', 'isolation', 'intermediate', 'reviewed')
  `).run();

  for (const phrase of ["gym equipment", "full gym", "salon", "spor salonu"]) {
    const results = findExercises({ targetMuscles: ["biceps"], equipment: [phrase], limit: 10 });
    assert.deepEqual(results.map((exercise) => exercise.name), ["Barbell Curl"], `equipment phrase "${phrase}" should match like "gym"`);
  }
});

test("a plural or compound equipment answer still matches its singular dataset value", () => {
  const db = getDb();
  db.prepare(`
    INSERT INTO exercises (id, name, equipment, target, secondary_muscles_json, raw_json)
    VALUES ('kb-swing', 'Kettlebell Swing', 'kettlebell', 'glutes', '[]', '{}')
  `).run();
  db.prepare(`
    INSERT INTO exercise_metadata (exercise_id, movement_pattern, exercise_type, difficulty, metadata_status)
    VALUES ('kb-swing', 'hinge', 'compound', 'intermediate', 'reviewed')
  `).run();

  const results = findExercises({ targetMuscles: ["glutes"], equipment: ["kettlebells"], limit: 10 });
  assert.deepEqual(results.map((exercise) => exercise.name), ["Kettlebell Swing"]);
});

test("Turkish free-text muscle group answers normalize to the canonical vocabulary", () => {
  assert.deepEqual(normalizeMuscleGroupList(["karin"]), ["abs"]);
  assert.deepEqual(normalizeMuscleGroupList(["sirt"]), ["back"]);
  assert.deepEqual(normalizeMuscleGroupList(["sırt"]), ["back"]);
  assert.deepEqual(normalizeMuscleGroupList(["on bacak"]), ["quads"]);
  assert.deepEqual(normalizeMuscleGroupList(["kalca"]), ["glutes"]);
  assert.deepEqual(normalizeMuscleGroupList(["abs"]), ["abs"]);
  assert.deepEqual(normalizeMuscleGroupList(["abs", "karin"]), ["abs"]);
  assert.deepEqual(normalizeMuscleGroupList([]), []);
});

test("a seeded equipment alias resolves before a broader fuzzy alias", () => {
  const db = getDb();
  const insertExercise = db.prepare(`
    INSERT INTO exercises (id, name, equipment, target, secondary_muscles_json, raw_json)
    VALUES (?, ?, ?, 'pectorals', '[]', '{}')
  `);
  const insertMetadata = db.prepare(`
    INSERT INTO exercise_metadata (exercise_id, movement_pattern, exercise_type, difficulty, metadata_status)
    VALUES (?, 'horizontal_push', 'compound', 'intermediate', 'reviewed')
  `);
  insertExercise.run("barbell-press", "Barbell Bench Press", "barbell");
  insertMetadata.run("barbell-press");
  insertExercise.run("dumbbell-press", "Dumbbell Bench Press", "dumbbell");
  insertMetadata.run("dumbbell-press");
  db.prepare(`
    INSERT INTO exercise_aliases (alias, exercise_id, canonical_name, confidence, source)
    VALUES ('bench press', 'barbell-press', 'Barbell Bench Press', 1.0, 'test')
  `).run();

  assert.equal(findExerciseByName("db press")?.name, "Dumbbell Bench Press");
});
