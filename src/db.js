import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

let db;

export function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  db = new DatabaseSync(config.dbPath);
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

export function migrate(database = getDb()) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      body_part TEXT,
      equipment TEXT,
      muscle_group TEXT,
      target TEXT,
      secondary_muscles_json TEXT NOT NULL DEFAULT '[]',
      instructions_tr TEXT,
      instructions_en TEXT,
      image TEXT,
      gif_url TEXT,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exercise_metadata (
      exercise_id TEXT PRIMARY KEY REFERENCES exercises(id) ON DELETE CASCADE,
      movement_pattern TEXT,
      exercise_type TEXT,
      difficulty TEXT,
      risk_tags_json TEXT NOT NULL DEFAULT '[]',
      avoid_if_json TEXT NOT NULL DEFAULT '[]',
      good_for_json TEXT NOT NULL DEFAULT '[]',
      metadata_status TEXT NOT NULL DEFAULT 'auto_tagged',
      reviewed_note TEXT
    );

    CREATE TABLE IF NOT EXISTS exercise_aliases (
      alias TEXT PRIMARY KEY,
      exercise_id TEXT REFERENCES exercises(id) ON DELETE SET NULL,
      canonical_name TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      source TEXT NOT NULL DEFAULT 'seed'
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_user_id TEXT NOT NULL UNIQUE,
      display_name TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conversation_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL,
      last_activity_at TEXT NOT NULL,
      ended_at TEXT,
      turn_count INTEGER NOT NULL DEFAULT 0,
      playful_reply_used INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS conversation_turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message_type TEXT NOT NULL,
      intent TEXT NOT NULL,
      topic TEXT NOT NULL,
      feature TEXT NOT NULL,
      text_length INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_evaluations (
      session_id INTEGER PRIMARY KEY REFERENCES conversation_sessions(id) ON DELETE CASCADE,
      evaluator_version TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      satisfaction_label TEXT NOT NULL,
      satisfaction_score REAL NOT NULL DEFAULT 0,
      topics_json TEXT NOT NULL DEFAULT '{}',
      features_json TEXT NOT NULL DEFAULT '{}',
      friction_json TEXT NOT NULL DEFAULT '[]',
      evidence_message_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      age INTEGER,
      height_cm INTEGER,
      weight_kg REAL,
      goal TEXT,
      level TEXT,
      days_per_week INTEGER,
      equipment_json TEXT NOT NULL DEFAULT '[]',
      injuries_json TEXT NOT NULL DEFAULT '[]',
      excluded_exercises_json TEXT NOT NULL DEFAULT '[]',
      priority_muscles_json TEXT NOT NULL DEFAULT '[]',
      deemphasized_muscles_json TEXT NOT NULL DEFAULT '[]',
      preferred_split TEXT,
      session_duration_min INTEGER,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_memory (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      summary TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_state (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agent_drafts (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'draft',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, kind)
    );

    CREATE TABLE IF NOT EXISTS workout_programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      program_json TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS usage_daily (
      day TEXT NOT NULL,
      user_id INTEGER,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, user_id)
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      context TEXT NOT NULL,
      rating TEXT,
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS feedback_insights (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS interaction_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      session_id INTEGER REFERENCES conversation_sessions(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      model_action TEXT,
      model TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      context_claim_ids_json TEXT NOT NULL DEFAULT '[]',
      context_source_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      scope TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  migrateExerciseMediaTable(database);
  addColumnIfMissing(database, "user_profiles", "priority_muscles_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(database, "user_profiles", "deemphasized_muscles_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(database, "user_profiles", "preferred_split", "TEXT");
  addColumnIfMissing(database, "messages", "session_id", "INTEGER REFERENCES conversation_sessions(id) ON DELETE SET NULL");
  addColumnIfMissing(database, "messages", "include_in_context", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfMissing(database, "conversation_sessions", "playful_reply_used", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(database, "interaction_logs", "session_id", "INTEGER REFERENCES conversation_sessions(id) ON DELETE SET NULL");
  addColumnIfMissing(database, "interaction_logs", "context_claim_ids_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(database, "interaction_logs", "context_source_ids_json", "TEXT NOT NULL DEFAULT '[]'");
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_conversation_sessions_user_activity
      ON conversation_sessions(user_id, last_activity_at);
    CREATE INDEX IF NOT EXISTS idx_conversation_turns_session
      ON conversation_turns(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_conversation_turns_user_topic
      ON conversation_turns(user_id, topic, feature);
    CREATE INDEX IF NOT EXISTS idx_messages_session
      ON messages(session_id, id);
    CREATE INDEX IF NOT EXISTS idx_agent_drafts_user_status
      ON agent_drafts(user_id, status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_interaction_logs_session
      ON interaction_logs(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_session_evaluations_satisfaction
      ON session_evaluations(satisfaction_label, created_at);
  `);
}

export function logInteraction({ userId = null, sessionId = null, eventType, modelAction = "", model = "", inputTokens = null, outputTokens = null, contextClaimIds = [], contextSourceIds = [] }, database = getDb()) {
  return database.prepare(`
    INSERT INTO interaction_logs (
      user_id, session_id, event_type, model_action, model, input_tokens, output_tokens, context_claim_ids_json, context_source_ids_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    sessionId,
    eventType,
    modelAction,
    model,
    inputTokens,
    outputTokens,
    json([...new Set(contextClaimIds || [])]),
    json([...new Set(contextSourceIds || [])])
  );
}

export function logCoachInteraction({ userId, sessionId = null, modelAction, model, coachResult }, database = getDb()) {
  return logInteraction({
    userId,
    sessionId,
    eventType: coachResult.usedModel ? "model_call" : "fallback",
    modelAction,
    model: coachResult.usedModel ? model : "",
    contextClaimIds: coachResult.contextClaimIds,
    contextSourceIds: coachResult.contextSourceIds
  }, database);
}

export function logError({ userId = null, scope, error }) {
  const message = error instanceof Error ? error.message : String(error);
  getDb().prepare("INSERT INTO error_logs (user_id, scope, message) VALUES (?, ?, ?)").run(userId, scope, message.slice(0, 1000));
}

export function json(value) {
  return JSON.stringify(value ?? []);
}

export function parseJson(value, fallback = []) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

export function getOrCreateUser(telegramUser) {
  const database = getDb();
  const telegramUserId = String(telegramUser.id);
  let user = database.prepare("SELECT * FROM users WHERE telegram_user_id = ?").get(telegramUserId);
  if (user) return user;

  const displayName = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(" ") || telegramUser.username || telegramUserId;
  database.prepare("INSERT INTO users (telegram_user_id, display_name) VALUES (?, ?)").run(telegramUserId, displayName);
  user = database.prepare("SELECT * FROM users WHERE telegram_user_id = ?").get(telegramUserId);
  database.prepare("INSERT OR IGNORE INTO user_memory (user_id, summary) VALUES (?, '')").run(user.id);
  return user;
}

export function getProfile(userId) {
  const row = getDb().prepare("SELECT * FROM user_profiles WHERE user_id = ?").get(userId);
  if (!row) return null;
  return {
    ...row,
    equipment: parseJson(row.equipment_json),
    injuries: parseJson(row.injuries_json),
    excluded_exercises: parseJson(row.excluded_exercises_json),
    priority_muscles: parseJson(row.priority_muscles_json),
    deemphasized_muscles: parseJson(row.deemphasized_muscles_json)
  };
}

export function saveMessage(userId, role, content) {
  getDb().prepare("INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)").run(userId, role, String(content || "").slice(0, 8000));
  logInteraction({ userId, eventType: `${role}_message`, modelAction: "message_saved" });
}

export function getRecentMessages(userId, limit = 12) {
  const safeLimit = Math.max(1, Math.min(30, Number(limit) || 12));
  return getDb().prepare(`
    SELECT role, content
    FROM messages
    WHERE user_id = ? AND content <> '' AND include_in_context = 1
    ORDER BY id DESC
    LIMIT ?
  `).all(userId, safeLimit).map((row) => ({ role: row.role, content: row.content })).reverse();
}

function addColumnIfMissing(database, table, column, definition) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
  if (!columns.includes(column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function migrateExerciseMediaTable(database) {
  const columns = database.prepare("PRAGMA table_info(exercise_media)").all().map((row) => row.name);
  if (columns.includes("animation_path")) database.exec("DROP TABLE exercise_media");
  database.exec(`
    CREATE TABLE IF NOT EXISTS exercise_media (
      exercise_id TEXT PRIMARY KEY REFERENCES exercises(id) ON DELETE CASCADE,
      remote_url TEXT NOT NULL,
      media_type TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT NOT NULL,
      license TEXT NOT NULL,
      license_url TEXT NOT NULL,
      attribution TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      telegram_bot_id TEXT,
      telegram_file_id TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
