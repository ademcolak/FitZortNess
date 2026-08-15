import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fitzortness-history-test-"));
process.env.DB_PATH = path.join(tempDir, "test.db");

const { getDb, getOrCreateUser, getRecentMessages, saveMessage } = await import("../src/db.js");
const { createConversationTracker } = await import("../src/conversationTracker.js");

test.after(() => {
  getDb().close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("recent message history preserves content and chronological order", () => {
  const user = getOrCreateUser({ id: 42, first_name: "Test" });
  saveMessage(user.id, "user", "Bugün enerjim düşük.");
  saveMessage(user.id, "assistant", "Hafif bir gün planlayalım.");

  assert.deepEqual(getRecentMessages(user.id, 10), [
    { role: "user", content: "Bugün enerjim düşük." },
    { role: "assistant", content: "Hafif bir gün planlayalım." }
  ]);
});

test("admin command messages stay in the raw transcript without entering model context", () => {
  const user = getOrCreateUser({ id: 43, first_name: "Command" });
  const tracker = createConversationTracker({ database: getDb() });
  const turn = tracker.recordTurn({ userId: user.id, messageType: "text", intent: "admin_logs", topic: "administration", feature: "admin", textLength: 11 });
  tracker.recordMessage({ sessionId: turn.sessionId, userId: user.id, role: "user", content: "/admin_logs", includeInContext: false });
  tracker.recordMessage({ sessionId: turn.sessionId, userId: user.id, role: "assistant", content: "Admin loglari", includeInContext: false });

  assert.deepEqual(getRecentMessages(user.id, 10), []);
  assert.deepEqual(tracker.getSessionTranscript(turn.sessionId).map(({ role, content }) => ({ role, content })), [
    { role: "user", content: "/admin_logs" },
    { role: "assistant", content: "Admin loglari" }
  ]);
});
