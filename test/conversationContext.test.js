import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fitzortness-context-test-"));
process.env.DB_PATH = path.join(tempDir, "test.db");

const { getDb, getOrCreateUser, getRecentMessages } = await import("../src/db.js");
const { conversationTracker } = await import("../src/conversationTracker.js");
const { getConversationTurn, recordAssistantMessage, runInConversationTurn } = await import("../src/conversationContext.js");

test.after(() => {
  getDb().close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

let nextTelegramId = 500;

function startTurn() {
  const user = getOrCreateUser({ id: nextTelegramId++, first_name: "Test" });
  const { sessionId } = conversationTracker.recordTurn({
    userId: user.id,
    messageType: "text",
    intent: "conversation",
    topic: "general_fitness",
    feature: "conversation",
    textLength: 4
  });
  return { userId: user.id, sessionId };
}

test("a coaching turn keeps both sides of the exchange in model context", () => {
  const { userId, sessionId } = startTurn();

  runInConversationTurn({ kind: "coaching", sessionId, userId, userMessage: "Bugun ne yapayim?" }, () => {
    recordAssistantMessage("Hafif bir gun planlayalim.");
  });

  assert.deepEqual(getRecentMessages(userId, 10), [
    { role: "user", content: "Bugun ne yapayim?" },
    { role: "assistant", content: "Hafif bir gun planlayalim." }
  ]);
});

test("an administration turn records nothing", () => {
  const { userId, sessionId } = startTurn();

  runInConversationTurn({ kind: "administration", sessionId, userId, userMessage: "/admin_logs" }, () => {
    recordAssistantMessage("Admin loglari");
  });

  assert.deepEqual(getRecentMessages(userId, 10), []);
  assert.deepEqual(conversationTracker.getSessionTranscript(sessionId), []);
});

test("an empty user message leaves the transcript to the assistant alone", () => {
  const { userId, sessionId } = startTurn();

  runInConversationTurn({ kind: "coaching", sessionId, userId, userMessage: "" }, () => {
    recordAssistantMessage("Gorseli okuyorum.");
  });

  assert.deepEqual(getRecentMessages(userId, 10), [{ role: "assistant", content: "Gorseli okuyorum." }]);
});

test("the running turn exposes its session to nested calls", () => {
  const { userId, sessionId } = startTurn();

  const seen = runInConversationTurn({ kind: "coaching", sessionId, userId, userMessage: "sa" }, () => getConversationTurn());

  assert.equal(seen.sessionId, sessionId);
  assert.equal(seen.userId, userId);
  assert.equal(seen.kind, "coaching");
});

test("outside a turn nothing is recorded and no context leaks", () => {
  const { userId } = startTurn();

  recordAssistantMessage("Kayit disi");

  assert.equal(getConversationTurn(), undefined);
  assert.deepEqual(getRecentMessages(userId, 10), []);
});

for (const field of ["kind", "sessionId", "userId", "userMessage"]) {
  for (const [label, mutate] of [["missing", (turn) => delete turn[field]], ["undefined", (turn) => { turn[field] = undefined; }], ["null", (turn) => { turn[field] = null; }]]) {
    test(`a turn with ${label} ${field} is rejected instead of silently dropping records`, () => {
      const { userId, sessionId } = startTurn();
      const turn = { kind: "coaching", sessionId, userId, userMessage: "sa" };
      mutate(turn);

      assert.throws(() => runInConversationTurn(turn, () => {}), new RegExp(`missing required fields: ${field}`));
    });
  }
}

for (const kind of ["gossip", "constructor", "toString"]) {
  test(`an unknown turn kind (${kind}) is rejected`, () => {
    const { userId, sessionId } = startTurn();

    assert.throws(
      () => runInConversationTurn({ kind, sessionId, userId, userMessage: "sa" }, () => {}),
      new RegExp(`Unknown conversation turn kind: ${kind}`)
    );
  });
}
