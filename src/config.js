import fs from "node:fs";
import path from "node:path";

export function loadEnv(filePath = ".env") {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

export const config = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  allowedUserIds: loadAllowedUserIds(),
  adminUserIds: loadUserIds(process.env.TELEGRAM_ADMIN_USER_IDS || ""),
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  openAiModel: process.env.OPENAI_MODEL || "gpt-5.4-mini",
  llmEnabled: Boolean(process.env.LLM_BASE_URL || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY),
  llmBaseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
  llmApiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "",
  llmModel: process.env.LLM_MODEL || process.env.OPENAI_MODEL || "gpt-5.4-mini",
  llmApiStyle: process.env.LLM_API_STYLE || "responses",
  botPersona: process.env.BOT_PERSONA || "",
  dailyUserMessageLimit: toInt(process.env.DAILY_USER_MESSAGE_LIMIT, 50),
  dailyTotalMessageLimit: toInt(process.env.DAILY_TOTAL_MESSAGE_LIMIT, 500),
  maxOutputTokens: toInt(process.env.MAX_OUTPUT_TOKENS, 900),
  llmRequestTimeoutMs: toInt(process.env.LLM_REQUEST_TIMEOUT_MS, 60000),
  telegramRequestTimeoutMs: toInt(process.env.TELEGRAM_REQUEST_TIMEOUT_MS, 45000),
  telegramImageMaxBytes: toInt(process.env.TELEGRAM_IMAGE_MAX_BYTES, 8 * 1024 * 1024),
  allowOpenPilot: process.env.TELEGRAM_ALLOW_ALL === "true",
  dbPath: path.resolve(process.env.DB_PATH || "./data/fitzortness.db"),
  datasetPath: path.resolve(process.env.DATASET_PATH || "./vendor/exercises-dataset/data/exercises.json"),
  exerciseMediaManifestPath: path.resolve(process.env.EXERCISE_MEDIA_MANIFEST || "./media/exercise-media.json"),
  exerciseMediaAllowedHosts: parseCsv(process.env.EXERCISE_MEDIA_ALLOWED_HOSTS || "upload.wikimedia.org"),
  exerciseMediaMaxBytes: toInt(process.env.EXERCISE_MEDIA_MAX_BYTES, 10 * 1024 * 1024)
};

function parseCsv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function loadUserIds(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return [];

  const maybePath = path.resolve(trimmed);
  if (trimmed.endsWith(".txt") && fs.existsSync(maybePath)) {
    return fs.readFileSync(maybePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
  }

  return parseCsv(trimmed);
}

function loadAllowedUserIds() {
  const inlineIds = parseCsv(process.env.TELEGRAM_ALLOWED_USER_IDS || "");
  const filePath = path.resolve(process.env.TELEGRAM_ALLOWED_USER_IDS_FILE || "./allowed-users.txt");
  if (!fs.existsSync(filePath)) return inlineIds;

  const fileIds = fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  return [...new Set([...inlineIds, ...fileIds])];
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
