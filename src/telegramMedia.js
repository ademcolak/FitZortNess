import crypto from "node:crypto";
import { cacheExerciseAnimationFileId, clearExerciseAnimationFileId } from "./exerciseMedia.js";
import { getDb } from "./db.js";

export async function sendApprovedAnimation({
  botToken,
  chatId,
  media,
  requestTimeoutMs,
  maxBytes,
  allowedHosts,
  database = getDb(),
  fetchImpl = fetch
}) {
  const botId = getBotId(botToken);
  const endpoint = `https://api.telegram.org/bot${botToken}/sendAnimation`;

  if (media.telegramBotId === botId && media.telegramFileId) {
    try {
      return await sendTelegramFileId({ endpoint, chatId, fileId: media.telegramFileId, requestTimeoutMs, fetchImpl });
    } catch {
      clearExerciseAnimationFileId(media.exerciseId, { database });
    }
  }

  const remoteUrl = validateRemoteUrl(media.remoteUrl, allowedHosts);
  const fileData = await fetchVerifiedGif({
    remoteUrl,
    expectedSha256: media.sha256,
    requestTimeoutMs,
    maxBytes,
    fetchImpl
  });
  const result = await uploadTelegramGif({ endpoint, chatId, remoteUrl, fileData, requestTimeoutMs, fetchImpl });
  const fileId = result?.result?.animation?.file_id;
  if (!fileId) throw new Error("Telegram sendAnimation response did not include an animation file_id.");
  cacheExerciseAnimationFileId(media.exerciseId, botId, fileId, { database });
  return result;
}

async function sendTelegramFileId({ endpoint, chatId, fileId, requestTimeoutMs, fetchImpl }) {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, animation: fileId }),
    signal: AbortSignal.timeout(requestTimeoutMs)
  });
  return parseTelegramResponse(response);
}

async function fetchVerifiedGif({ remoteUrl, expectedSha256, requestTimeoutMs, maxBytes, fetchImpl }) {
  const response = await fetchImpl(remoteUrl.href, {
    redirect: "error",
    signal: AbortSignal.timeout(requestTimeoutMs)
  });
  if (!response.ok) throw new Error(`Exercise animation download failed: ${response.status}`);

  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "image/gif") throw new Error(`Exercise animation content type is not image/gif: ${contentType || "missing"}`);
  const contentLength = Number.parseInt(response.headers.get("content-length") || "", 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error("Exercise animation exceeds the configured size limit.");

  const fileData = await readLimitedBody(response, maxBytes);
  const signature = fileData.subarray(0, 6).toString("ascii");
  if (signature !== "GIF87a" && signature !== "GIF89a") throw new Error("Exercise animation does not have a valid GIF signature.");
  const actualSha256 = crypto.createHash("sha256").update(fileData).digest("hex");
  if (actualSha256 !== expectedSha256) throw new Error("Exercise animation sha256 mismatch.");
  return fileData;
}

async function readLimitedBody(response, maxBytes) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error("Exercise animation exceeds the configured size limit.");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, totalBytes);
}

async function uploadTelegramGif({ endpoint, chatId, remoteUrl, fileData, requestTimeoutMs, fetchImpl }) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("animation", new Blob([fileData], { type: "image/gif" }), remoteUrl.pathname.split("/").at(-1) || "exercise.gif");

  const response = await fetchImpl(endpoint, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(requestTimeoutMs)
  });
  return parseTelegramResponse(response);
}

async function parseTelegramResponse(response) {
  const text = await response.text();
  if (!response.ok) throw new Error(`Telegram sendAnimation failed: ${response.status} ${text}`);
  const result = JSON.parse(text);
  if (!result.ok) throw new Error(`Telegram sendAnimation failed: ${text}`);
  return result;
}

function validateRemoteUrl(value, allowedHosts) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Exercise animation URL must use HTTPS.");
  const hosts = new Set((allowedHosts || []).map((host) => String(host).trim().toLowerCase()).filter(Boolean));
  if (!hosts.has(url.hostname.toLowerCase())) throw new Error(`Exercise animation host is not allowed: ${url.hostname}`);
  return url;
}

function getBotId(botToken) {
  const botId = String(botToken || "").split(":", 1)[0];
  if (!/^\d+$/.test(botId)) throw new Error("Telegram bot token does not contain a valid bot ID.");
  return botId;
}
