import { AsyncLocalStorage } from "node:async_hooks";
import { conversationTracker } from "./conversationTracker.js";
import { logError } from "./db.js";

const storage = new AsyncLocalStorage();

const TURN_POLICIES = {
  coaching: { retainRawMessages: true, includeInContext: true },
  administration: { retainRawMessages: false, includeInContext: false }
};

const REQUIRED_FIELDS = ["kind", "sessionId", "userId", "userMessage"];

export const CONVERSATION_TURN_KINDS = Object.keys(TURN_POLICIES);

export function runInConversationTurn(turn, callback) {
  const missing = REQUIRED_FIELDS.filter((field) => (turn || {})[field] === undefined || turn[field] === null);
  if (missing.length) throw new Error(`Conversation turn is missing required fields: ${missing.join(", ")}.`);

  if (!Object.hasOwn(TURN_POLICIES, turn.kind)) {
    throw new Error(`Unknown conversation turn kind: ${turn.kind}. Expected one of ${CONVERSATION_TURN_KINDS.join(", ")}.`);
  }
  const policy = TURN_POLICIES[turn.kind];

  const context = Object.freeze({
    kind: turn.kind,
    sessionId: turn.sessionId,
    userId: turn.userId,
    ...policy
  });

  return storage.run(context, () => {
    recordMessage("user", turn.userMessage);
    return callback();
  });
}

export function getConversationTurn() {
  return storage.getStore();
}

export function recordAssistantMessage(content) {
  recordMessage("assistant", content);
}

function recordMessage(role, content) {
  const context = storage.getStore();
  if (!context?.retainRawMessages) return;
  const text = String(content || "");
  if (!text) return;

  try {
    conversationTracker.recordMessage({
      sessionId: context.sessionId,
      userId: context.userId,
      role,
      content: text,
      includeInContext: context.includeInContext
    });
  } catch (error) {
    if (error.code !== "CONVERSATION_SESSION_MISSING") {
      logError({ scope: `conversation_${role}_record`, error });
    }
  }
}
