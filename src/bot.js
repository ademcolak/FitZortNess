import { config } from "./config.js";
import { COACH_TOOLS, createCoachToolExecutor, getActiveCoachDrafts, migrateLegacyConversationState } from "./coachTools.js";
import { getConversationTurn, recordAssistantMessage, runInConversationTurn } from "./conversationContext.js";
import { conversationTracker } from "./conversationTracker.js";
import { getDb, getOrCreateUser, getProfile, getRecentMessages, logCoachInteraction, logError, logInteraction, parseJson } from "./db.js";
import { assertByteLengthWithinLimit, readResponseBufferWithLimit } from "./downloadLimits.js";
import { sendExerciseFormGuide } from "./exerciseForm.js";
import { formatAnalysis } from "./formatters.js";
import { isDestructiveAdminActionConfirmed } from "./inputValidation.js";
import { extractStandaloneDaysPerWeek, isExerciseFormRequest, routeMessage } from "./intentRouter.js";
import { classifyKnowledgeTopic, getKnowledgeClarification } from "./knowledgeBase.js";
import { coachAgentReplyWithMetadata, coachReplyWithMetadata, evaluateConversationSession, extractWorkoutFromImage } from "./openaiClient.js";
import { parseAndAnalyzeExtractedWorkout } from "./programEngine.js";
import { getPreventiveTrainingSafetyResponse, getUrgentTrainingSafetyResponse } from "./safetyPolicy.js";
import { createSessionEvaluator } from "./sessionEvaluator.js";
import { getTelegramCommandSetupOperations } from "./telegramCommands.js";
import { sendApprovedAnimation } from "./telegramMedia.js";

const sessionEvaluator = createSessionEvaluator({ tracker: conversationTracker, evaluateWithModel: evaluateConversationSession });
const WELCOME_TEXT = "Merhaba! Ben FitZortNess, antrenman programi olusturma, program analizi ve genel fitness sorularinda yardimci oluyorum. Ne istersen dogal bir cumleyle yazabilirsin, ornegin \"kas kazanimi icin 4 gunluk program hazirla\" gibi.";
const ADMIN_COMMANDS = new Set([
  "/admin_users",
  "/admin_usage",
  "/admin_logs",
  "/admin_errors",
  "/admin_evaluate",
  "/admin_insights",
  "/admin_feedback",
  "/admin_reset_limit",
  "/admin_clear_user",
  "/admin_delete_user",
  "/admin_clear_all"
]);

export async function startBot() {
  if (!config.telegramBotToken) throw new Error("TELEGRAM_BOT_TOKEN is required. Create .env and fill it.");
  if (!config.allowedUserIds.length && !config.allowOpenPilot) {
    throw new Error("Telegram allowlist is empty. Add allowed-users.txt or set TELEGRAM_ALLOW_ALL=true explicitly.");
  }

  let offset = 0;
  conversationTracker.runMaintenance();
  await configureTelegramCommands();

  while (true) {
    try {
      const updates = await telegram("getUpdates", { offset, timeout: 30 });
      for (const update of updates.result || []) {
        try {
          if (update.message) await handleMessage(update.message);
        } catch (error) {
          logError({ scope: "update_handler", error });
          if (update.message?.chat?.id) {
            try {
              await send(update.message.chat.id, "Bu mesaji islerken bir hata oldu. Tekrar dener misin?");
            } catch (sendError) {
              logError({ scope: "update_error_reply", error: sendError });
            }
          }
        } finally {
          offset = update.update_id + 1;
        }
      }
    } catch (error) {
      logError({ scope: "polling", error });
      console.error(error);
      await sleep(3000);
    }
  }
}

export async function handleMessage(message) {
  const chatId = message.chat.id;
  const telegramUserId = String(message.from.id);
  if (config.allowedUserIds.length && !config.allowedUserIds.includes(telegramUserId)) {
    await send(chatId, "Bu bot su an kapali pilotta. Kullanici ID'in allowlist'te yok.");
    return;
  }

  const isAdminUser = isAdmin(telegramUserId);
  const text = message.text?.trim();
  const commandName = text?.split(/\s+/, 1)[0];
  const isAdminCommand = isAdminUser && message.chat.type === "private" && (commandName === "/help" || ADMIN_COMMANDS.has(commandName));
  if (commandName === "/start" && !isAdminCommand) {
    getOrCreateUser(message.from);
    await send(chatId, WELCOME_TEXT);
    return;
  }
  if (text?.startsWith("/") && !isAdminCommand) return;

  const user = getOrCreateUser(message.from);
  await maybeNotifyAdmin(chatId, user.id, isAdminUser);
  logInteraction({ userId: user.id, eventType: message.photo || isImageDocument(message.document) ? "image_message" : "text_message", modelAction: "telegram_receive" });
  if (!isAdminUser && !checkAndIncrementUsage(user.id)) {
    await send(chatId, "Gunluk mesaj limiti doldu. Yarin tekrar deneyelim.");
    return;
  }

  if (message.photo || isImageDocument(message.document)) {
    const caption = message.caption?.trim() || "";
    const { sessionId } = conversationTracker.recordTurn({
      userId: user.id,
      messageType: "image",
      intent: "analyze_program",
      topic: "program_analysis",
      feature: "image_analysis",
      textLength: caption.length
    });
    return runInConversationTurn(
      { kind: "coaching", sessionId, userId: user.id, userMessage: caption },
      () => handleImageMessage(chatId, user.id, message)
    );
  }

  if (!text) return;

  const state = getState(user.id);
  const routedIntent = routeMessage(text);
  const tracked = classifyTurn(text, state, routedIntent);
  const { sessionId } = conversationTracker.recordTurn({
    userId: user.id,
    messageType: "text",
    intent: tracked.intent,
    topic: tracked.topic,
    feature: tracked.feature,
    textLength: text.length
  });

  const turn = {
    kind: isAdminCommand ? "administration" : "coaching",
    sessionId,
    userId: user.id,
    userMessage: text
  };

  return runInConversationTurn(turn, async () => {
    if (text === "/help" && isAdminUser) return send(chatId, adminHelpText());
    if (text.startsWith("/admin")) return handleAdminCommand(chatId, telegramUserId, text);

    const safetyResponse = getUrgentTrainingSafetyResponse(text) || getPreventiveTrainingSafetyResponse(text);
    if (safetyResponse) return send(chatId, safetyResponse);

    const knowledgeClarification = getKnowledgeClarification(text);
    if (knowledgeClarification) return send(chatId, knowledgeClarification);

    if (state?.state === "awaiting_image_program_days") {
      const daysPerWeek = extractStandaloneDaysPerWeek(text);
      if (daysPerWeek) {
        const payload = parseJson(state.payload_json, {});
        const profile = getProfile(user.id);
        return respondToImageAnalysis(chatId, user.id, payload.extracted, { ...(profile || {}), analysis_days_per_week: daysPerWeek });
      }
    }
    migrateLegacyConversationState(user.id);

    const intent = routedIntent;
    if (intent === "out_of_scope") {
      await send(chatId, "Fitness, antrenman, motivasyon ve genel beslenme konularinda yardimci olabilirim. Program olusturmami veya mevcut programini analiz etmemi normal bir cumleyle isteyebilirsin.");
      return;
    }

    if (tracked.feature === "exercise_form") {
      const handled = await sendExerciseFormGuide({
        chatId,
        userMessage: text,
        sendText: send,
        sendAnimation: sendExerciseAnimation
      });
      if (handled) return;
    }
    return chatWithCoach(chatId, user.id, text);
  });
}

function classifyTurn(text, state, routedIntent) {
  if (text === "/help" || text.startsWith("/admin")) {
    return { intent: text.split(/\s+/, 1)[0].slice(1), topic: "administration", feature: "admin" };
  }

  if (["awaiting_program_analysis", "awaiting_program_days"].includes(state?.state)) return { intent: state.state, topic: "program_analysis", feature: "program_analysis" };
  if (state?.state === "awaiting_image_program_days") return { intent: state.state, topic: "program_analysis", feature: "image_analysis" };
  if (state?.state?.startsWith("onboarding_")) return { intent: state.state, topic: "profile", feature: "onboarding" };

  const feature = routedIntent === "create_program"
    ? "program_creation"
    : routedIntent === "analyze_program"
      ? "program_analysis"
      : isExerciseFormRequest(text)
        ? "exercise_form"
        : "conversation";
  const topic = ["conversation", "exercise_form"].includes(feature) ? classifyKnowledgeTopic(text) : feature;
  return { intent: routedIntent, topic, feature };
}

async function handleImageMessage(chatId, userId, message) {
  if (!config.openAiApiKey) {
    await send(chatId, "Gorselden program okumak icin OPENAI_API_KEY gerekli. Simdilik programi metin olarak gonderebilirsin.");
    return;
  }

  await sendTransient(chatId, "Gorseli okuyorum. Program satirlarini cikartip analiz edecegim.");

  try {
    const file = await getTelegramImageFile(message);
    const extracted = await extractWorkoutFromImage(file);
    logInteraction({ userId, eventType: "model_call", modelAction: "image_workout_extraction", model: config.openAiModel });
    if (!isValidExtractedWorkout(extracted)) {
      await send(chatId, "Gorseldeki programi guvenilir sekilde okuyamadim. Daha net bir screenshot/fotograf gonder veya programi metin olarak yaz.");
      return;
    }
    await respondToImageAnalysis(chatId, userId, extracted);
  } catch (error) {
    logError({ userId, scope: "image_analysis", error });
    await sendTransient(chatId, `Gorseli okuyamadim: ${error.message}\nDaha net bir screenshot/fotograf dene veya programi metin olarak gonder.`);
  }
}

function recordCoachInteraction(userId, modelAction, coachResult) {
  logCoachInteraction({
    userId,
    sessionId: getConversationTurn()?.sessionId,
    modelAction,
    model: config.llmModel,
    coachResult
  });
}

async function respondToImageAnalysis(chatId, userId, extracted, profileOverride = null) {
  const profile = profileOverride || getProfile(userId);
  const result = parseAndAnalyzeExtractedWorkout(extracted, profile);
  if (!hasParsedExercises(result)) {
    await send(chatId, "Gorseldeki program satirlarini okudum ama hareketleri guvenilir sekilde eslestiremedim. Programi metin olarak yazarsan daha net analiz ederim.");
    return;
  }
  if (result.program.days.length === 1 && !profile?.analysis_days_per_week) {
    setState(userId, "awaiting_image_program_days", { extracted });
    await send(chatId, "Bu programi haftada kac gun uyguluyorsun? Sadece sayi yazabilirsin.");
    return;
  }

  if (["awaiting_image_program_days", "awaiting_program_analysis"].includes(getState(userId)?.state)) clearState(userId);
  const fallbackText = [
    formatAnalysis(result),
    extracted.uncertain?.length ? `\nEmin olamadigim satirlar:\n- ${extracted.uncertain.join("\n- ")}` : ""
  ].join("");
  const coachResult = await coachReplyWithMetadata({
    userMessage: "Programimi gorsel olarak gonderdim.",
    profile,
    memorySummary: getMemory(userId),
    conversationHistory: getConversationHistory(userId),
    engineResult: { extracted, ...result },
    fallbackText,
    responseMode: "image_analysis"
  });
  recordCoachInteraction(userId, "coach_image_analysis_reply", coachResult);
  await send(chatId, coachResult.text);
}

async function chatWithCoach(chatId, userId, userMessage) {
  const fallbackText = "Su an sohbet modeline ulasamiyorum. Biraz sonra tekrar dener misin?";
  const coachResult = await coachAgentReplyWithMetadata({
    userMessage,
    profile: getProfile(userId),
    memorySummary: getMemory(userId),
    conversationHistory: getConversationHistory(userId, userMessage),
    activeDrafts: getActiveCoachDrafts(userId),
    fallbackText,
    tools: COACH_TOOLS,
    executeTool: createCoachToolExecutor(userId, { userMessage })
  });
  if (coachResult.error) logError({ userId, scope: "coach_agent", error: coachResult.error });
  recordCoachInteraction(userId, "coach_conversation_reply", coachResult);
  await send(chatId, coachResult.text);
}

function checkAndIncrementUsage(userId) {
  const day = new Date().toISOString().slice(0, 10);
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO usage_daily (day, user_id, count) VALUES (?, ?, 0)").run(day, userId);
  const userCount = db.prepare("SELECT count FROM usage_daily WHERE day = ? AND user_id = ?").get(day, userId).count;
  const totalCount = db.prepare("SELECT COALESCE(SUM(count), 0) AS count FROM usage_daily WHERE day = ? AND user_id IS NOT NULL").get(day).count;
  if (userCount >= config.dailyUserMessageLimit || totalCount >= config.dailyTotalMessageLimit) return false;
  db.prepare("UPDATE usage_daily SET count = count + 1 WHERE day = ? AND user_id = ?").run(day, userId);
  return true;
}

async function handleAdminCommand(chatId, telegramUserId, text) {
  if (!isAdmin(telegramUserId)) {
    await send(chatId, "Admin yetkin yok.");
    return;
  }

  const parts = text.split(/\s+/);
  const command = parts[0];
  const arg = parts[1];
  const confirmation = parts[2];

  if (command === "/admin_users") {
    const rows = getDb().prepare(`
      SELECT u.id, u.telegram_user_id, u.display_name, p.goal, p.days_per_week, p.updated_at
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      ORDER BY u.id
    `).all();
    await send(chatId, rows.map((row) => `${row.id} | tg:${row.telegram_user_id} | ${row.display_name || "-"} | ${row.goal || "profil yok"} | ${row.days_per_week || "-"} gun`).join("\n") || "Kullanici yok.");
    return;
  }
  if (command === "/admin_usage") {
    const day = new Date().toISOString().slice(0, 10);
    const rows = getDb().prepare(`
      SELECT u.telegram_user_id, u.display_name, d.count
      FROM usage_daily d
      JOIN users u ON u.id = d.user_id
      WHERE d.day = ?
      ORDER BY d.count DESC
    `).all(day);
    await send(chatId, rows.map((row) => `${row.telegram_user_id} | ${row.display_name || "-"} | ${row.count}`).join("\n") || "Bugun kullanim yok.");
    return;
  }
  if (command === "/admin_logs") {
    const rows = getDb().prepare(`
      SELECT l.created_at, u.telegram_user_id, l.event_type, l.model_action, l.model, l.input_tokens, l.output_tokens
      FROM interaction_logs l
      LEFT JOIN users u ON u.id = l.user_id
      ORDER BY l.id DESC
      LIMIT 30
    `).all();
    await send(chatId, rows.map((row) => `${row.created_at} | ${row.telegram_user_id || "-"} | ${row.event_type} | ${row.model_action || "-"} | ${row.model || "-"} | in:${row.input_tokens ?? "-"} out:${row.output_tokens ?? "-"}`).join("\n") || "Log yok.");
    return;
  }
  if (command === "/admin_errors") {
    const rows = getDb().prepare(`
      SELECT e.created_at, u.telegram_user_id, e.scope, e.message
      FROM error_logs e
      LEFT JOIN users u ON u.id = e.user_id
      ORDER BY e.id DESC
      LIMIT 30
    `).all();
    await send(chatId, rows.map((row) => `${row.created_at} | ${row.telegram_user_id || "-"} | ${row.scope}\n${row.message}`).join("\n\n") || "Error yok.");
    return;
  }
  if (command === "/admin_insights") {
    const rows = getDb().prepare("SELECT key, count, updated_at FROM feedback_insights ORDER BY count DESC").all();
    const insights = sessionEvaluator.getInsights();
    const feedbackText = rows.map((row) => `${row.key}: ${row.count} (${row.updated_at})`).join("\n") || "Kayit yok.";
    await send(chatId, [
      `Degerlendirilen oturum: ${insights.evaluatedSessions}`,
      `Toplam tur: ${insights.totalTurns} | Oturum basina ortalama: ${insights.averageTurns}`,
      `Memnuniyet: positive ${insights.satisfaction.positive || 0} | neutral ${insights.satisfaction.neutral || 0} | negative ${insights.satisfaction.negative || 0}`,
      `Konular: ${formatCounts(insights.topics)}`,
      `Feature kullanimi: ${formatCounts(insights.features)}`,
      `Surunme noktalari: ${formatCounts(insights.friction)}`,
      "",
      "Manuel feedback:",
      feedbackText
    ].join("\n"));
    return;
  }
  if (command === "/admin_evaluate") {
    conversationTracker.finalizeStaleSessions();
    const limit = Math.max(1, Math.min(100, Number.parseInt(arg, 10) || 20));
    const result = await sessionEvaluator.evaluatePending({ limit });
    const labels = result.results.reduce((counts, item) => {
      counts[item.satisfaction_label] = (counts[item.satisfaction_label] || 0) + 1;
      return counts;
    }, {});
    await send(chatId, result.evaluated
      ? `${result.evaluated} oturum degerlendirildi. positive ${labels.positive || 0} | neutral ${labels.neutral || 0} | negative ${labels.negative || 0}`
      : "Degerlendirilmeyi bekleyen tamamlanmis oturum yok.");
    return;
  }
  if (command === "/admin_feedback") {
    const rows = getDb().prepare(`
      SELECT f.created_at, u.telegram_user_id, f.context, f.rating, f.comment
      FROM feedback f
      JOIN users u ON u.id = f.user_id
      ORDER BY f.id DESC
      LIMIT 20
    `).all();
    await send(chatId, rows.map((row) => `${row.created_at} | ${row.telegram_user_id} | ${row.context} | ${row.rating}\n${row.comment}`).join("\n\n") || "Feedback yok.");
    return;
  }
  if (command === "/admin_clear_all") {
    if (!isDestructiveAdminActionConfirmed(arg)) {
      await send(chatId, "Bu islem tum kullanici verilerini kalici olarak siler. Onaylamak icin /admin_clear_all CONFIRM yaz.");
      return;
    }
    const db = getDb();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec("DELETE FROM feedback_insights; DELETE FROM feedback; DELETE FROM interaction_logs; DELETE FROM error_logs; DELETE FROM usage_daily; DELETE FROM messages; DELETE FROM workout_programs; DELETE FROM user_state; DELETE FROM user_memory; DELETE FROM user_profiles; DELETE FROM users;");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    await send(chatId, "Tum kullanici verileri silindi.");
    return;
  }
  if (command === "/admin_clear_user" && arg) {
    if (!isDestructiveAdminActionConfirmed(confirmation)) {
      await send(chatId, `Bu islem ${arg} kullanicisinin tum verilerini temizler. Onaylamak icin /admin_clear_user ${arg} CONFIRM yaz.`);
      return;
    }
    const user = findUserByTelegramId(arg);
    if (!user) return send(chatId, "Kullanici bulunamadi.");
    deleteUserData(user.id, false);
    await send(chatId, `${arg} icin profil, mesaj, program, state ve feedback silindi. Kullanici kaydi duruyor.`);
    return;
  }
  if (command === "/admin_delete_user" && arg) {
    if (!isDestructiveAdminActionConfirmed(confirmation)) {
      await send(chatId, `Bu islem ${arg} kullanicisini kalici olarak siler. Onaylamak icin /admin_delete_user ${arg} CONFIRM yaz.`);
      return;
    }
    const user = findUserByTelegramId(arg);
    if (!user) return send(chatId, "Kullanici bulunamadi.");
    deleteUserData(user.id, true);
    await send(chatId, `${arg} tamamen silindi.`);
    return;
  }
  if (command === "/admin_reset_limit" && arg) {
    const user = findUserByTelegramId(arg);
    if (!user) return send(chatId, "Kullanici bulunamadi.");
    getDb().prepare("DELETE FROM usage_daily WHERE user_id = ?").run(user.id);
    await send(chatId, `${arg} limit kaydi sifirlandi.`);
    return;
  }

  await send(chatId, adminHelpText());
}

function findUserByTelegramId(telegramUserId) {
  return getDb().prepare("SELECT * FROM users WHERE telegram_user_id = ?").get(String(telegramUserId));
}

function deleteUserData(userId, deleteUser) {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM feedback WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM interaction_logs WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM error_logs WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM usage_daily WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM messages WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM conversation_sessions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM workout_programs WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM agent_drafts WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM user_state WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM user_memory WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM user_profiles WHERE user_id = ?").run(userId);
    if (deleteUser) db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function adminHelpText() {
  return [
    "Admin komutlari:",
    "/admin_users",
    "/admin_usage",
    "/admin_logs",
    "/admin_errors",
    "/admin_evaluate [LIMIT]",
    "/admin_insights",
    "/admin_feedback",
    "/admin_reset_limit TELEGRAM_ID",
    "/admin_clear_user TELEGRAM_ID CONFIRM",
    "/admin_delete_user TELEGRAM_ID CONFIRM",
    "/admin_clear_all CONFIRM"
  ].join("\n");
}

function formatCounts(counts) {
  const entries = Object.entries(counts || {}).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries.map(([key, count]) => `${key} ${count}`).join(" | ") : "kayit yok";
}

function isAdmin(telegramUserId) {
  return config.adminUserIds.includes(String(telegramUserId));
}

async function maybeNotifyAdmin(chatId, userId, isAdminUser) {
  if (!isAdminUser) return;
  const key = "admin_notified";
  const memory = getMemory(userId);
  if (memory.includes(key)) return;
  updateMemory(userId, `${memory ? `${memory}\n` : ""}${key}`);
  await send(chatId, "Admin kullanici olarak tanindin. /help ile admin komutlarini gorebilirsin.");
}

function getState(userId) {
  return getDb().prepare("SELECT * FROM user_state WHERE user_id = ?").get(userId);
}

function setState(userId, state, payload) {
  getDb().prepare("INSERT OR REPLACE INTO user_state (user_id, state, payload_json, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)").run(userId, state, JSON.stringify(payload));
}

function clearState(userId) {
  getDb().prepare("DELETE FROM user_state WHERE user_id = ?").run(userId);
}

function getMemory(userId) {
  return getDb().prepare("SELECT summary FROM user_memory WHERE user_id = ?").get(userId)?.summary || "";
}

function updateMemory(userId, summary) {
  getDb().prepare("INSERT OR REPLACE INTO user_memory (user_id, summary, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)").run(userId, summary);
}

function getConversationHistory(userId, currentUserMessage = "") {
  const history = getRecentMessages(userId, 12);
  const last = history.at(-1);
  if (last?.role === "user" && last.content === currentUserMessage) history.pop();
  return history;
}

async function send(chatId, text) {
  await deliver(chatId, text);
  recordAssistantMessage(text);
}

async function sendTransient(chatId, text) {
  await deliver(chatId, text);
}

async function deliver(chatId, text) {
  for (const part of chunk(text, 3900)) {
    await telegram("sendMessage", { chat_id: chatId, text: part });
  }
}

async function sendExerciseAnimation(chatId, media) {
  try {
    await sendApprovedAnimation({
      botToken: config.telegramBotToken,
      chatId,
      media,
      requestTimeoutMs: config.telegramRequestTimeoutMs,
      maxBytes: config.exerciseMediaMaxBytes,
      allowedHosts: config.exerciseMediaAllowedHosts
    });
  } catch (error) {
    logError({ scope: "exercise_animation_send", error });
    await send(chatId, `GIF'i su an gonderemedim. Kaynak sayfasindan bakabilirsin:\n${media.sourceUrl}`);
  }
}

async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.telegramRequestTimeoutMs)
  });
  if (!response.ok) throw new Error(`Telegram ${method} failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function getTelegramImageFile(message) {
  const photo = message.photo?.[message.photo.length - 1];
  const fileId = photo?.file_id || message.document?.file_id;
  const mimeType = message.document?.mime_type || "image/jpeg";
  const fileInfo = await telegram("getFile", { file_id: fileId });
  const filePath = fileInfo.result?.file_path;
  if (!filePath) throw new Error("Telegram file_path bulunamadi.");
  assertByteLengthWithinLimit(fileInfo.result?.file_size, config.telegramImageMaxBytes);

  const response = await fetch(`https://api.telegram.org/file/bot${config.telegramBotToken}/${filePath}`, {
    signal: AbortSignal.timeout(config.telegramRequestTimeoutMs)
  });
  if (!response.ok) throw new Error(`Telegram dosya indirilemedi: ${response.status}`);
  const buffer = await readResponseBufferWithLimit(response, config.telegramImageMaxBytes);
  return {
    imageBase64: buffer.toString("base64"),
    mimeType
  };
}

function isImageDocument(document) {
  return Boolean(document?.mime_type?.startsWith("image/"));
}

async function configureTelegramCommands() {
  for (const operation of getTelegramCommandSetupOperations(config.adminUserIds)) {
    await telegram(operation.method, operation.body);
  }
}

function chunk(text, size) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidExtractedWorkout(extracted) {
  const items = [
    ...(extracted.items || []),
    ...(extracted.days || []).flatMap((day) => day.items || [])
  ];
  const validItems = items.filter((item) => {
    const sets = Number(item.sets || 0);
    const name = String(item.name || "").trim();
    return name.length >= 3 && sets >= 1 && sets <= 10;
  });
  const uncertainCount = (extracted.uncertain || []).length;
  return validItems.length >= 2 && uncertainCount <= Math.max(3, validItems.length);
}

function hasParsedExercises(result) {
  return (result.program?.days || []).some((day) => (day.exercises || []).length >= 2);
}
