import { getDb } from "./db.js";

const EVALUATOR_VERSION = "session-v1";

export function createSessionEvaluator({
  database = getDb(),
  tracker,
  evaluateWithModel = null,
  now = () => new Date()
} = {}) {
  if (!tracker) throw new Error("A conversation tracker is required.");

  async function evaluatePending({ limit = 20 } = {}) {
    const sessions = tracker.getSessionsReadyForEvaluation(limit);
    const results = [];

    for (const session of sessions) {
      const transcript = tracker.getSessionTranscript(session.sessionId);
      const metrics = tracker.getSessionMetrics(session.sessionId) || { turnCount: session.turnCount, topics: {}, features: {} };
      const deterministic = evaluateDeterministically(transcript, metrics);
      let modelResult = null;
      if (evaluateWithModel && transcript.length) {
        try {
          modelResult = validateModelResult(await evaluateWithModel({ transcript, metrics, deterministic }));
        } catch {
          modelResult = null;
        }
      }

      const evaluation = {
        ...deterministic,
        ...(modelResult?.summary ? { summary: modelResult.summary } : {}),
        topics: metrics.topics,
        features: metrics.features
      };
      storeEvaluation(session.sessionId, evaluation);
      results.push({ sessionId: session.sessionId, userId: session.userId, ...evaluation });
    }

    return { evaluated: results.length, results };
  }

  function storeEvaluation(sessionId, evaluation) {
    database.prepare(`
      INSERT INTO session_evaluations (
        session_id, evaluator_version, summary, satisfaction_label, satisfaction_score,
        topics_json, features_json, friction_json, evidence_message_ids_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      EVALUATOR_VERSION,
      evaluation.summary,
      evaluation.satisfaction_label,
      evaluation.satisfaction_score,
      JSON.stringify(evaluation.topics),
      JSON.stringify(evaluation.features),
      JSON.stringify(evaluation.friction),
      JSON.stringify(evaluation.evidence_message_ids),
      now().toISOString()
    );
  }

  function getInsights() {
    const rows = database.prepare(`
      SELECT e.satisfaction_label, e.topics_json, e.features_json, e.friction_json, s.turn_count
      FROM session_evaluations e
      JOIN conversation_sessions s ON s.id = e.session_id
      ORDER BY e.created_at, e.session_id
    `).all();
    const satisfaction = { positive: 0, neutral: 0, negative: 0 };
    const topics = {};
    const features = {};
    const friction = {};

    for (const row of rows) {
      satisfaction[row.satisfaction_label] = (satisfaction[row.satisfaction_label] || 0) + 1;
      mergeCounts(topics, parseJson(row.topics_json, {}));
      mergeCounts(features, parseJson(row.features_json, {}));
      for (const item of parseJson(row.friction_json, [])) friction[item] = (friction[item] || 0) + 1;
    }

    const totalTurns = rows.reduce((sum, row) => sum + Number(row.turn_count || 0), 0);
    return {
      evaluatedSessions: rows.length,
      totalTurns,
      averageTurns: rows.length ? Math.round((totalTurns / rows.length) * 10) / 10 : 0,
      satisfaction,
      topics,
      features,
      friction
    };
  }

  return { evaluatePending, getInsights };
}

function evaluateDeterministically(transcript, metrics) {
  const userMessages = transcript.filter((message) => message.role === "user" && message.content.trim());
  const positiveEvidence = [];
  const negativeEvidence = [];
  const correctionEvidence = [];
  const occurrences = new Map();

  for (const message of userMessages) {
    const normalized = normalize(message.content);
    if (/(tesekkur|cok iyi|guzel oldu|isine yaradi|tamamdir|super)/.test(normalized)) positiveEvidence.push(message.id);
    if (/(anlamadin|anlamiyor|yanlis|olmadi|ise yaramadi|kotu)/.test(normalized)) negativeEvidence.push(message.id);
    if (/(tekrar|anlamadin|yanlis anladin|ayni seyi)/.test(normalized)) correctionEvidence.push(message.id);
    if (normalized) occurrences.set(normalized, [...(occurrences.get(normalized) || []), message.id]);
  }

  const repeatedEvidence = [...occurrences.values()].filter((ids) => ids.length > 1).flat();
  const friction = [];
  if (repeatedEvidence.length) friction.push("repeated_user_message");
  if (correctionEvidence.length) friction.push("explicit_correction");

  const positive = positiveEvidence.length;
  const negative = negativeEvidence.length + correctionEvidence.length;
  const satisfactionLabel = negative > positive ? "negative" : positive > negative ? "positive" : "neutral";
  const satisfactionScore = clamp((positive - negative) / Math.max(1, userMessages.length), -1, 1);
  const topTopic = firstKey(metrics.topics);
  const summary = `${metrics.turnCount} kullanici turu; ana konu ${topTopic || "belirsiz"}; memnuniyet ${satisfactionLabel}.`;

  return {
    summary,
    satisfaction_label: satisfactionLabel,
    satisfaction_score: satisfactionScore,
    friction,
    evidence_message_ids: [...new Set([...positiveEvidence, ...negativeEvidence, ...correctionEvidence, ...repeatedEvidence])]
  };
}

function validateModelResult(value) {
  if (!value || typeof value !== "object") return null;
  const summary = String(value.summary || "").trim().slice(0, 1000);
  return summary ? { summary } : null;
}

function normalize(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mergeCounts(target, source) {
  for (const [key, count] of Object.entries(source || {})) target[key] = (target[key] || 0) + Number(count || 0);
}

function firstKey(counts) {
  return Object.entries(counts || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}
