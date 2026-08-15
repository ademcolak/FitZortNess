import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

function runAdminCommand(command, { chatType = "private" } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "fitzortness-admin-command-"));
  const dbPath = path.join(directory, "test.db");
  const script = `
    const sent = [];
    globalThis.fetch = async (url, options = {}) => {
      if (String(url).includes("/sendMessage")) sent.push(JSON.parse(options.body || "{}").text);
      return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
    };
    const { getDb, getOrCreateUser } = await import("./src/db.js");
    const target = getOrCreateUser({ id: 456, first_name: "Target" });
    getDb().prepare("INSERT INTO agent_drafts (user_id, kind, payload_json) VALUES (?, 'program_creation', '{}')").run(target.id);
    const { handleMessage } = await import("./src/bot.js");
    await handleMessage({ chat: { id: 1, type: ${JSON.stringify(chatType)} }, from: { id: 123, first_name: "Admin" }, text: ${JSON.stringify(command)} });
    const targetExists = getDb().prepare("SELECT COUNT(*) AS count FROM users WHERE telegram_user_id = '456'").get().count;
    const targetDrafts = getDb().prepare("SELECT COUNT(*) AS count FROM agent_drafts WHERE user_id = ?").get(target.id).count;
    console.log(JSON.stringify({ sent, targetExists, targetDrafts }));
  `;

  try {
    const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        DB_PATH: dbPath,
        TELEGRAM_BOT_TOKEN: "test-token",
        TELEGRAM_ALLOWED_USER_IDS: "123",
        TELEGRAM_ADMIN_USER_IDS: "123",
        TELEGRAM_ALLOW_ALL: "false"
      }
    });
    return JSON.parse(output.trim().split(/\r?\n/).at(-1));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("admin user deletion requires an explicit second confirmation", () => {
  const result = runAdminCommand("/admin_delete_user 456");

  assert.equal(result.targetExists, 1);
  assert.equal(result.targetDrafts, 1);
  assert.match(result.sent.at(-1), /CONFIRM/);
});

test("confirmed admin user deletion removes the user and owned drafts", () => {
  const result = runAdminCommand("/admin_delete_user 456 CONFIRM");

  assert.equal(result.targetExists, 0);
  assert.equal(result.targetDrafts, 0);
  assert.match(result.sent.at(-1), /tamamen silindi/i);
});

test("admin user data clearing requires an explicit second confirmation", () => {
  const result = runAdminCommand("/admin_clear_user 456");

  assert.equal(result.targetExists, 1);
  assert.equal(result.targetDrafts, 1);
  assert.match(result.sent.at(-1), /CONFIRM/);
});

test("confirmed admin user data clearing also removes resumable drafts", () => {
  const result = runAdminCommand("/admin_clear_user 456 CONFIRM");

  assert.equal(result.targetExists, 1);
  assert.equal(result.targetDrafts, 0);
  assert.match(result.sent.at(-1), /silindi/i);
});

test("admin commands never expose user data in a group chat", () => {
  const result = runAdminCommand("/admin_users", { chatType: "group" });

  assert.deepEqual(result.sent, []);
  assert.equal(result.targetExists, 1);
});
