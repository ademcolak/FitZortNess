import { getDb } from "./db.js";

const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_RAW_RETENTION_DAYS = 90;

export function createConversationTracker({
  database = getDb(),
  now = () => new Date(),
  sessionTimeoutMs = DEFAULT_SESSION_TIMEOUT_MS,
  rawRetentionDays = DEFAULT_RAW_RETENTION_DAYS
} = {}) {
  function recordTurn({ userId, messageType, intent, topic, feature, textLength = 0 }) {
    const currentTime = now();
    const currentIso = currentTime.toISOString();
    finalizeStaleSessions(currentTime);
    pruneExpiredMessages(false, currentTime);

    database.exec("BEGIN");
    try {
      let session = database.prepare(`
        SELECT id, last_activity_at
        FROM conversation_sessions
        WHERE user_id = ? AND ended_at IS NULL
        ORDER BY id DESC
        LIMIT 1
      `).get(userId);

      let sessionId;
      if (session) {
        sessionId = Number(session.id);
        database.prepare(`
          UPDATE conversation_sessions
          SET last_activity_at = ?, turn_count = turn_count + 1
          WHERE id = ?
        `).run(currentIso, sessionId);
      } else {
        sessionId = Number(database.prepare(`
          INSERT INTO conversation_sessions (user_id, started_at, last_activity_at, turn_count)
          VALUES (?, ?, ?, 1)
        `).run(userId, currentIso, currentIso).lastInsertRowid);
      }

      const turnId = Number(database.prepare(`
        INSERT INTO conversation_turns (
          session_id, user_id, message_type, intent, topic, feature, text_length, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sessionId,
        userId,
        messageType,
        intent,
        topic,
        feature,
        Math.max(0, Number(textLength) || 0),
        currentIso
      ).lastInsertRowid);

      database.exec("COMMIT");
      return { sessionId, turnId };
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  function recordMessage({ sessionId, userId, role, content, includeInContext = true }) {
    database.exec("BEGIN");
    try {
      const result = database.prepare(`
        INSERT INTO messages (session_id, user_id, role, content, include_in_context, created_at)
        SELECT id, user_id, ?, ?, ?, ?
        FROM conversation_sessions
        WHERE id = ? AND user_id = ?
      `).run(role, String(content || "").slice(0, 8000), includeInContext ? 1 : 0, now().toISOString(), sessionId, userId);
      if (!result.changes) {
        const error = new Error("Conversation session does not belong to user.");
        error.code = "CONVERSATION_SESSION_MISSING";
        throw error;
      }
      database.prepare(`
        INSERT INTO interaction_logs (user_id, event_type, model_action)
        VALUES (?, ?, 'message_saved')
      `).run(userId, `${role}_message`);
      database.exec("COMMIT");
      return Number(result.lastInsertRowid);
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  function getUserMetrics(userId) {
    const sessionCount = database.prepare("SELECT count(*) AS count FROM conversation_sessions WHERE user_id = ?").get(userId).count;
    const turnCount = database.prepare("SELECT count(*) AS count FROM conversation_turns WHERE user_id = ?").get(userId).count;
    const topics = groupedCounts("topic", userId);
    const features = groupedCounts("feature", userId);
    return { sessionCount, turnCount, topics, features };
  }

  function getSessionTranscript(sessionId) {
    return database.prepare(`
      SELECT id, role, content, include_in_context, created_at
      FROM messages
      WHERE session_id = ?
      ORDER BY id
    `).all(sessionId).map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      includeInContext: Boolean(row.include_in_context),
      createdAt: row.created_at
    }));
  }

  function getSessionMetrics(sessionId) {
    const session = database.prepare("SELECT turn_count FROM conversation_sessions WHERE id = ?").get(sessionId);
    if (!session) return null;
    return {
      turnCount: session.turn_count,
      topics: groupedSessionCounts("topic", sessionId),
      features: groupedSessionCounts("feature", sessionId)
    };
  }

  function getSessionsReadyForEvaluation(limit = 50) {
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    return database.prepare(`
      SELECT s.id, s.user_id, s.turn_count
      FROM conversation_sessions s
      LEFT JOIN session_evaluations e ON e.session_id = s.id
      WHERE s.ended_at IS NOT NULL
        AND e.session_id IS NULL
        AND EXISTS (
          SELECT 1 FROM conversation_turns t
          WHERE t.session_id = s.id AND t.topic <> 'administration'
        )
      ORDER BY s.ended_at, s.id
      LIMIT ?
    `).all(safeLimit).map((row) => ({
      sessionId: row.id,
      userId: row.user_id,
      turnCount: row.turn_count
    }));
  }

  function claimPlayfulReply(sessionId) {
    return database.prepare(`
      UPDATE conversation_sessions
      SET playful_reply_used = 1
      WHERE id = ? AND playful_reply_used = 0
    `).run(sessionId).changes > 0;
  }

  function groupedCounts(column, userId) {
    return Object.fromEntries(database.prepare(`
      SELECT ${column} AS key, count(*) AS count
      FROM conversation_turns
      WHERE user_id = ?
      GROUP BY ${column}
      ORDER BY count DESC, ${column}
    `).all(userId).map((row) => [row.key, row.count]));
  }

  function groupedSessionCounts(column, sessionId) {
    return Object.fromEntries(database.prepare(`
      SELECT ${column} AS key, count(*) AS count
      FROM conversation_turns
      WHERE session_id = ?
      GROUP BY ${column}
      ORDER BY count DESC, ${column}
    `).all(sessionId).map((row) => [row.key, row.count]));
  }

  let lastPruneDay = "";

  function finalizeStaleSessions(currentTime = now()) {
    const staleBefore = new Date(currentTime.getTime() - sessionTimeoutMs).toISOString();
    return database.prepare(`
      UPDATE conversation_sessions
      SET ended_at = last_activity_at
      WHERE ended_at IS NULL AND last_activity_at <= ?
    `).run(staleBefore).changes;
  }

  function pruneExpiredMessages(force = true, currentTime = now()) {
    const currentDay = currentTime.toISOString().slice(0, 10);
    if (!force && currentDay === lastPruneDay) return 0;
    const cutoff = new Date(currentTime.getTime() - rawRetentionDays * 24 * 60 * 60 * 1000).toISOString();
    const changes = database.prepare("DELETE FROM messages WHERE created_at < ?").run(cutoff).changes;
    lastPruneDay = currentDay;
    return changes;
  }

  function runMaintenance() {
    return {
      finalizedSessions: finalizeStaleSessions(),
      prunedMessages: pruneExpiredMessages()
    };
  }

  return { recordTurn, recordMessage, getUserMetrics, getSessionTranscript, getSessionMetrics, getSessionsReadyForEvaluation, claimPlayfulReply, finalizeStaleSessions, pruneExpiredMessages, runMaintenance };
}

let defaultTracker;

function getDefaultTracker() {
  defaultTracker ||= createConversationTracker();
  return defaultTracker;
}

export const conversationTracker = {
  recordTurn: (input) => getDefaultTracker().recordTurn(input),
  recordMessage: (input) => getDefaultTracker().recordMessage(input),
  getUserMetrics: (userId) => getDefaultTracker().getUserMetrics(userId),
  getSessionTranscript: (sessionId) => getDefaultTracker().getSessionTranscript(sessionId),
  getSessionMetrics: (sessionId) => getDefaultTracker().getSessionMetrics(sessionId),
  getSessionsReadyForEvaluation: (limit) => getDefaultTracker().getSessionsReadyForEvaluation(limit),
  claimPlayfulReply: (sessionId) => getDefaultTracker().claimPlayfulReply(sessionId),
  finalizeStaleSessions: () => getDefaultTracker().finalizeStaleSessions(),
  pruneExpiredMessages: () => getDefaultTracker().pruneExpiredMessages(),
  runMaintenance: () => getDefaultTracker().runMaintenance()
};
