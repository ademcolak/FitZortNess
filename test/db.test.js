import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { logCoachInteraction, logInteraction, migrate } from "../src/db.js";

test("model interaction logs retain session and unique knowledge references", () => {
  const database = new DatabaseSync(":memory:");
  migrate(database);
  const userId = Number(database.prepare("INSERT INTO users (telegram_user_id, display_name) VALUES (?, ?)").run("336", "Knowledge").lastInsertRowid);
  const sessionId = Number(database.prepare(`
    INSERT INTO conversation_sessions (user_id, started_at, last_activity_at)
    VALUES (?, ?, ?)
  `).run(userId, "2026-07-16T10:00:00.000Z", "2026-07-16T10:00:00.000Z").lastInsertRowid);

  logInteraction({
    userId,
    sessionId,
    eventType: "model_call",
    modelAction: "coach_conversation_reply",
    model: "test-model",
    contextClaimIds: ["claim.split.selection_context", "claim.split.selection_context"],
    contextSourceIds: ["source.acsm_2026", "source.split_meta_2024", "source.acsm_2026"]
  }, database);

  const row = database.prepare(`
    SELECT session_id, context_claim_ids_json, context_source_ids_json
    FROM interaction_logs
    WHERE model_action = 'coach_conversation_reply'
  `).get();
  assert.equal(row.session_id, sessionId);
  assert.deepEqual(JSON.parse(row.context_claim_ids_json), ["claim.split.selection_context"]);
  assert.deepEqual(JSON.parse(row.context_source_ids_json), ["source.acsm_2026", "source.split_meta_2024"]);
  database.close();
});

test("migration upgrades existing interaction logs with knowledge columns", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE interaction_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      model_action TEXT,
      model TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  migrate(database);

  const columns = database.prepare("PRAGMA table_info(interaction_logs)").all().map((row) => row.name);
  assert.ok(columns.includes("session_id"));
  assert.ok(columns.includes("context_claim_ids_json"));
  assert.ok(columns.includes("context_source_ids_json"));
  database.close();
});

test("migration replaces the local exercise media table with remote delivery fields", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE exercise_media (
      exercise_id TEXT PRIMARY KEY,
      animation_path TEXT NOT NULL,
      media_type TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT NOT NULL,
      license TEXT NOT NULL,
      license_url TEXT NOT NULL,
      attribution TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  migrate(database);

  const columns = database.prepare("PRAGMA table_info(exercise_media)").all().map((row) => row.name);
  assert.equal(columns.includes("animation_path"), false);
  assert.ok(columns.includes("remote_url"));
  assert.ok(columns.includes("telegram_bot_id"));
  assert.ok(columns.includes("telegram_file_id"));
  database.close();
});

test("all coach flows persist session-scoped model context and empty fallback context", () => {
  const database = new DatabaseSync(":memory:");
  migrate(database);
  const userId = Number(database.prepare("INSERT INTO users (telegram_user_id, display_name) VALUES (?, ?)").run("672", "Coach").lastInsertRowid);
  const sessionId = Number(database.prepare(`
    INSERT INTO conversation_sessions (user_id, started_at, last_activity_at)
    VALUES (?, ?, ?)
  `).run(userId, "2026-07-16T11:00:00.000Z", "2026-07-16T11:00:00.000Z").lastInsertRowid);
  const modelActions = [
    "coach_conversation_reply",
    "coach_program_analysis_reply",
    "coach_image_analysis_reply",
    "coach_new_program_reply"
  ];

  for (const modelAction of modelActions) {
    logCoachInteraction({
      userId,
      sessionId,
      modelAction,
      model: "test-model",
      coachResult: {
        usedModel: true,
        contextClaimIds: ["claim.split.selection_context"],
        contextSourceIds: ["source.acsm_2026"]
      }
    }, database);
  }
  logCoachInteraction({
    userId,
    sessionId,
    modelAction: "coach_conversation_reply",
    model: "test-model",
    coachResult: { usedModel: false, contextClaimIds: [], contextSourceIds: [] }
  }, database);

  const rows = database.prepare(`
    SELECT session_id, event_type, model_action, model, context_claim_ids_json, context_source_ids_json
    FROM interaction_logs
    ORDER BY id
  `).all();
  assert.deepEqual(rows.slice(0, 4).map((row) => row.model_action), modelActions);
  assert.ok(rows.slice(0, 4).every((row) => row.session_id === sessionId && row.event_type === "model_call" && row.model === "test-model"));
  assert.ok(rows.slice(0, 4).every((row) => row.context_claim_ids_json === '["claim.split.selection_context"]' && row.context_source_ids_json === '["source.acsm_2026"]'));
  assert.deepEqual({ ...rows[4] }, {
    session_id: sessionId,
    event_type: "fallback",
    model_action: "coach_conversation_reply",
    model: "",
    context_claim_ids_json: "[]",
    context_source_ids_json: "[]"
  });
  database.close();
});
