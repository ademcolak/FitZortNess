import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

async function withFreshDatabase(run) {
  const directory = mkdtempSync(path.join(tmpdir(), "fitzortness-agent-tools-"));
  process.env.DB_PATH = path.join(directory, "test.db");
  let database;
  try {
    const { getDb, getOrCreateUser } = await import(`../src/db.js?test=${Date.now()}-${Math.random()}`);
    const { createCoachToolExecutor, getActiveCoachDrafts } = await import(`../src/coachTools.js?test=${Date.now()}-${Math.random()}`);
    const user = getOrCreateUser({ id: Math.floor(Math.random() * 1_000_000), first_name: "Test" });
    database = getDb();
    await run({ database, user, execute: createCoachToolExecutor(user.id, database), getDrafts: () => getActiveCoachDrafts(user.id, database) });
  } finally {
    database?.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

test("program preparation stays as a non-blocking draft until required context is known", async () => {
  await withFreshDatabase(async ({ execute, getDrafts }) => {
    const first = await execute("prepare_training_program", { days_per_week: 3, generate: false });
    assert.equal(first.status, "draft");
    assert.ok(first.missing_fields.includes("goal"));
    assert.equal(getDrafts()[0].payload.days_per_week, 3);

    const unrelatedTurnDoesNotTouchDraft = getDrafts();
    assert.equal(unrelatedTurnDoesNotTouchDraft.length, 1);
    assert.equal(unrelatedTurnDoesNotTouchDraft[0].kind, "program_creation");
  });
});

test("a completed program draft invokes the deterministic generator", async () => {
  await withFreshDatabase(async ({ database, user, execute, getDrafts }) => {
    const result = await execute("prepare_training_program", {
      goal: "muscle_gain",
      level: "beginner",
      days_per_week: 3,
      equipment: ["gym"],
      injuries: [],
      generate: true
    });

    assert.equal(result.status, "created");
    assert.match(result.program_text, /Gun|Program|Full Body/i);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM workout_programs WHERE user_id = ? AND active = 1").get(user.id).count, 1);
    assert.deepEqual(getDrafts(), []);
  });
});

test("program analysis draft can pause for weekly frequency and resume later", async () => {
  await withFreshDatabase(async ({ execute, getDrafts }) => {
    const programText = "Bench Press 4x10\nLat Pulldown 4x10";
    const first = await execute("analyze_training_program", { program_text: programText });
    assert.equal(first.status, "draft");
    assert.deepEqual(first.missing_fields, ["days_per_week"]);
    assert.equal(getDrafts()[0].payload.program_text, programText);

    const resumed = await execute("analyze_training_program", { days_per_week: 3 });
    assert.equal(resumed.status, "analyzed");
    assert.match(resumed.analysis_text, /Analiz|set|frekans/i);
    assert.deepEqual(getDrafts(), []);
  });
});

test("a draft is discarded only through an explicit agent tool call", async () => {
  await withFreshDatabase(async ({ execute, getDrafts }) => {
    await execute("prepare_training_program", { days_per_week: 3, generate: false });
    assert.equal(getDrafts().length, 1);

    const result = await execute("discard_training_draft", { kind: "program_creation" });
    assert.equal(result.status, "discarded");
    assert.deepEqual(getDrafts(), []);
  });
});

test("impossible program frequency is rejected by the deterministic validator", async () => {
  await withFreshDatabase(async ({ execute, getDrafts }) => {
    const result = await execute("prepare_training_program", { days_per_week: 0, generate: false });
    assert.equal(result.status, "invalid");
    assert.equal(result.field, "days_per_week");
    assert.match(result.message, /0 gunse|0 günse/i);
    assert.deepEqual(getDrafts(), []);
  });
});

test("malformed model tool arguments are rejected before draft persistence", async () => {
  await withFreshDatabase(async ({ execute, getDrafts }) => {
    const result = await execute("prepare_training_program", { equipment: "gym", generate: false });

    assert.deepEqual(result, { status: "error", error: "Gecersiz arac argumanlari." });
    assert.deepEqual(getDrafts(), []);
  });
});
