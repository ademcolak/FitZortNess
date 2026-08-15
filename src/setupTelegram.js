import { config } from "./config.js";
import { getTelegramCommandSetupOperations } from "./telegramCommands.js";

export async function setupTelegram() {
  if (!config.telegramBotToken) throw new Error("TELEGRAM_BOT_TOKEN is required.");

  for (const operation of getTelegramCommandSetupOperations(config.adminUserIds)) {
    await telegram(operation.method, operation.body);
  }
  await telegram("setMyShortDescription", {
    short_description: process.env.BOT_SHORT_DESCRIPTION || "Kisisel antrenman ve coklu spor bilgi asistani."
  });
  await telegram("setMyDescription", {
    description: process.env.BOT_DESCRIPTION || "FitZortNess; profil, hedef, ekipman ve spor dalina gore bilgi, program ve program analizi sunan lokal pilot asistandir."
  });
}

async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Telegram ${method} failed: ${response.status} ${text}`);
  return JSON.parse(text);
}
