import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../src/db.js";
import { createConversationTracker } from "../src/conversationTracker.js";
import { createSessionEvaluator } from "../src/sessionEvaluator.js";

test("ended sessions are evaluated once and repeated corrections become friction", async () => {
  const database = new DatabaseSync(":memory:");
  migrate(database);
  const userId = Number(database.prepare("INSERT INTO users (telegram_user_id, display_name) VALUES (?, ?)").run("42", "Test").lastInsertRowid);
  let now = new Date("2026-07-13T10:00:00.000Z");
  const tracker = createConversationTracker({ database, now: () => now });
  const turn = tracker.recordTurn({ userId, messageType: "text", intent: "conversation", topic: "program_analysis", feature: "program_analysis" });
  tracker.recordMessage({ sessionId: turn.sessionId, userId, role: "user", content: "3" });
  tracker.recordMessage({ sessionId: turn.sessionId, userId, role: "assistant", content: "Haftada kac gun?" });
  tracker.recordMessage({ sessionId: turn.sessionId, userId, role: "user", content: "3" });
  tracker.recordMessage({ sessionId: turn.sessionId, userId, role: "user", content: "Yanlış anladın, işe yaramadı" });
  now = new Date("2026-07-13T10:31:00.000Z");
  tracker.finalizeStaleSessions();

  const evaluator = createSessionEvaluator({ database, tracker, now: () => now });
  const first = await evaluator.evaluatePending();
  const second = await evaluator.evaluatePending();
  const stored = database.prepare("SELECT * FROM session_evaluations WHERE session_id = ?").get(turn.sessionId);
  const insights = evaluator.getInsights();

  assert.equal(first.evaluated, 1);
  assert.equal(second.evaluated, 0);
  assert.equal(stored.satisfaction_label, "negative");
  assert.deepEqual(JSON.parse(stored.friction_json), ["repeated_user_message", "explicit_correction"]);
  assert.deepEqual(JSON.parse(stored.topics_json), { program_analysis: 1 });
  assert.equal(insights.evaluatedSessions, 1);
  assert.equal(insights.totalTurns, 1);
  assert.deepEqual(insights.features, { program_analysis: 1 });
  database.close();
});

test("an injected model evaluation enriches the summary without overriding deterministic signals", async () => {
  const database = new DatabaseSync(":memory:");
  migrate(database);
  const userId = Number(database.prepare("INSERT INTO users (telegram_user_id, display_name) VALUES (?, ?)").run("84", "Happy").lastInsertRowid);
  let now = new Date("2026-07-13T10:00:00.000Z");
  const tracker = createConversationTracker({ database, now: () => now });
  const turn = tracker.recordTurn({ userId, messageType: "text", intent: "create_program", topic: "program_creation", feature: "program_creation" });
  tracker.recordMessage({ sessionId: turn.sessionId, userId, role: "user", content: "Cok iyi oldu, tesekkurler" });
  now = new Date("2026-07-13T10:31:00.000Z");
  tracker.finalizeStaleSessions();

  const evaluator = createSessionEvaluator({
    database,
    tracker,
    now: () => now,
    evaluateWithModel: async () => ({ summary: "Kullanici programdan memnun kaldi.", satisfaction_label: "positive", satisfaction_score: 0.9 })
  });
  await evaluator.evaluatePending();
  const stored = database.prepare("SELECT summary, satisfaction_label, satisfaction_score FROM session_evaluations").get();

  assert.equal(stored.summary, "Kullanici programdan memnun kaldi.");
  assert.equal(stored.satisfaction_label, "positive");
  assert.equal(stored.satisfaction_score, 1);
  database.close();
});
