import assert from "node:assert/strict";
import test from "node:test";
import { getTelegramCommandSetupOperations } from "../src/telegramCommands.js";

test("Telegram command menu is empty for users and exposes only help to admins", () => {
  assert.deepEqual(getTelegramCommandSetupOperations(["123", "456"]), [
    { method: "deleteMyCommands", body: { scope: { type: "default" } } },
    { method: "setMyCommands", body: { commands: [{ command: "help", description: "Admin komutlarini goster" }], scope: { type: "chat", chat_id: 123 } } },
    { method: "setMyCommands", body: { commands: [{ command: "help", description: "Admin komutlarini goster" }], scope: { type: "chat", chat_id: 456 } } }
  ]);
});
