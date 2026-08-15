import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../src/db.js";
import { createConversationTracker } from "../src/conversationTracker.js";

test("conversation turns are grouped into 30 minute sessions", () => {
  const database = new DatabaseSync(":memory:");
  migrate(database);
  const userId = Number(database.prepare("INSERT INTO users (telegram_user_id, display_name) VALUES (?, ?)").run("42", "Test").lastInsertRowid);
  let now = new Date("2026-07-13T10:00:00.000Z");
  const tracker = createConversationTracker({ database, now: () => now });

  const first = tracker.recordTurn({
    userId,
    messageType: "text",
    intent: "conversation",
    topic: "motivation",
    feature: "conversation",
    textLength: 18
  });

  now = new Date("2026-07-13T10:29:00.000Z");
  const second = tracker.recordTurn({
    userId,
    messageType: "text",
    intent: "conversation",
    topic: "motivation",
    feature: "conversation",
    textLength: 9
  });

  now = new Date("2026-07-13T11:00:00.000Z");
  const third = tracker.recordTurn({
    userId,
    messageType: "text",
    intent: "analyze_program",
    topic: "program_analysis",
    feature: "program_analysis",
    textLength: 120
  });

  assert.equal(second.sessionId, first.sessionId);
  assert.notEqual(third.sessionId, first.sessionId);
  assert.deepEqual(tracker.getUserMetrics(userId), {
    sessionCount: 2,
    turnCount: 3,
    topics: { motivation: 2, program_analysis: 1 },
    features: { conversation: 2, program_analysis: 1 }
  });

  database.close();
});

test("raw messages expire after 90 days while session metrics remain", () => {
  const database = new DatabaseSync(":memory:");
  migrate(database);
  const userId = Number(database.prepare("INSERT INTO users (telegram_user_id, display_name) VALUES (?, ?)").run("84", "Retention").lastInsertRowid);
  let now = new Date("2026-01-01T10:00:00.000Z");
  const tracker = createConversationTracker({ database, now: () => now });
  const oldTurn = tracker.recordTurn({ userId, messageType: "text", intent: "conversation", topic: "smalltalk", feature: "conversation", textLength: 5 });
  tracker.recordMessage({ sessionId: oldTurn.sessionId, userId, role: "user", content: "Selam" });

  now = new Date("2026-04-02T10:00:00.000Z");
  const newTurn = tracker.recordTurn({ userId, messageType: "text", intent: "conversation", topic: "motivation", feature: "conversation", textLength: 12 });
  tracker.recordMessage({ sessionId: newTurn.sessionId, userId, role: "user", content: "Devam edelim" });

  assert.deepEqual(tracker.getSessionTranscript(oldTurn.sessionId), []);
  assert.deepEqual(tracker.getSessionTranscript(newTurn.sessionId).map(({ role, content }) => ({ role, content })), [
    { role: "user", content: "Devam edelim" }
  ]);
  assert.equal(tracker.getUserMetrics(userId).turnCount, 2);

  database.close();
});

test("exactly 30 minutes of inactivity starts a new session", () => {
  const database = new DatabaseSync(":memory:");
  migrate(database);
  const userId = Number(database.prepare("INSERT INTO users (telegram_user_id, display_name) VALUES (?, ?)").run("126", "Boundary").lastInsertRowid);
  let now = new Date("2026-07-13T10:00:00.000Z");
  const tracker = createConversationTracker({ database, now: () => now });
  const first = tracker.recordTurn({ userId, messageType: "text", intent: "conversation", topic: "smalltalk", feature: "conversation" });

  now = new Date("2026-07-13T10:30:00.000Z");
  const second = tracker.recordTurn({ userId, messageType: "text", intent: "conversation", topic: "smalltalk", feature: "conversation" });

  assert.notEqual(second.sessionId, first.sessionId);
  database.close();
});

test("stale sessions can be collected for later evaluation", () => {
  const database = new DatabaseSync(":memory:");
  migrate(database);
  const userId = Number(database.prepare("INSERT INTO users (telegram_user_id, display_name) VALUES (?, ?)").run("168", "Evaluation").lastInsertRowid);
  let now = new Date("2026-07-13T10:00:00.000Z");
  const tracker = createConversationTracker({ database, now: () => now });
  const turn = tracker.recordTurn({ userId, messageType: "text", intent: "conversation", topic: "motivation", feature: "conversation" });

  now = new Date("2026-07-13T10:31:00.000Z");
  assert.equal(tracker.finalizeStaleSessions(), 1);
  assert.deepEqual(tracker.getSessionsReadyForEvaluation(), [
    { sessionId: turn.sessionId, userId, turnCount: 1 }
  ]);
  database.close();
});

test("messages cannot be linked to another user's session", () => {
  const database = new DatabaseSync(":memory:");
  migrate(database);
  const firstUserId = Number(database.prepare("INSERT INTO users (telegram_user_id, display_name) VALUES (?, ?)").run("210", "First").lastInsertRowid);
  const secondUserId = Number(database.prepare("INSERT INTO users (telegram_user_id, display_name) VALUES (?, ?)").run("252", "Second").lastInsertRowid);
  const tracker = createConversationTracker({ database });
  const turn = tracker.recordTurn({ userId: firstUserId, messageType: "text", intent: "conversation", topic: "smalltalk", feature: "conversation" });

  assert.throws(
    () => tracker.recordMessage({ sessionId: turn.sessionId, userId: secondUserId, role: "user", content: "Yanlis kullanici" }),
    /does not belong/
  );
  database.close();
});

test("a conversation session grants only one playful reply slot", () => {
  const database = new DatabaseSync(":memory:");
  migrate(database);
  const userId = Number(database.prepare("INSERT INTO users (telegram_user_id, display_name) VALUES (?, ?)").run("294", "Humor").lastInsertRowid);
  const tracker = createConversationTracker({ database });
  const turn = tracker.recordTurn({ userId, messageType: "text", intent: "conversation", topic: "profile", feature: "onboarding" });

  assert.equal(tracker.claimPlayfulReply(turn.sessionId), true);
  assert.equal(tracker.claimPlayfulReply(turn.sessionId), false);
  database.close();
});
