import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

function runMessages(messages, { userId = 123, adminUserIds = "999", initialState = null } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "fitzortness-chat-start-"));
  const dbPath = path.join(directory, "test.db");
  const script = `
    const sent = [];
    globalThis.fetch = async (url, options = {}) => {
      if (String(url).includes("api.telegram.org")) {
        const body = JSON.parse(options.body || "{}");
        if (String(url).includes("/sendMessage")) sent.push(body.text);
        return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
      }
      const body = JSON.parse(options.body || "{}");
      const userTurns = (body.input || []).filter((item) => item.role === "user");
      const currentMessage = userTurns.at(-1)?.content?.find((part) => part.type === "input_text")?.text || "";
      const hasToolOutput = body.input?.some((item) => item.type === "function_call_output");
      if (!hasToolOutput && /program hazirla/i.test(currentMessage)) {
        return new Response(JSON.stringify({
          output: [{ type: "function_call", call_id: "call_program", name: "prepare_training_program", arguments: JSON.stringify({ generate: false }) }]
        }), { status: 200 });
      }
      if (hasToolOutput) {
        return new Response(JSON.stringify({ output_text: "Olur. Program icin once hedefini merak ettim; neye odaklanalim?" }), { status: 200 });
      }
      return new Response(JSON.stringify({ output_text: "Tabii, sohbet edelim. Ne var aklinda?" }), { status: 200 });
    };

    const { handleMessage } = await import("./src/bot.js");
    const message = { chat: { id: 1, type: "private" }, from: { id: ${userId}, first_name: "Test" } };
    if (${JSON.stringify(initialState)}) {
      const { getDb, getOrCreateUser } = await import("./src/db.js");
      const user = getOrCreateUser(message.from);
      getDb().prepare("INSERT INTO user_state (user_id, state, payload_json) VALUES (?, ?, '{}')").run(user.id, ${JSON.stringify(initialState)});
    }
    for (const text of ${JSON.stringify(messages)}) await handleMessage({ ...message, text });

    const { getDb } = await import("./src/db.js");
    const stateCount = getDb().prepare("SELECT COUNT(*) AS count FROM user_state").get().count;
    const state = getDb().prepare("SELECT state FROM user_state LIMIT 1").get()?.state || null;
    const draftCount = getDb().prepare("SELECT COUNT(*) AS count FROM agent_drafts WHERE status = 'draft'").get().count;
    const userCount = getDb().prepare("SELECT COUNT(*) AS count FROM users").get().count;
    const interactionCount = getDb().prepare("SELECT COUNT(*) AS count FROM interaction_logs").get().count;
    const usageCount = getDb().prepare("SELECT COALESCE(SUM(count), 0) AS count FROM usage_daily").get().count;
    console.log(JSON.stringify({ sent, stateCount, state, draftCount, userCount, interactionCount, usageCount }));
  `;

  try {
    const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        DB_PATH: dbPath,
        TELEGRAM_BOT_TOKEN: "test-token",
        TELEGRAM_ALLOWED_USER_IDS: String(userId),
        TELEGRAM_ADMIN_USER_IDS: adminUserIds,
        TELEGRAM_ALLOW_ALL: "false",
        LLM_BASE_URL: "https://llm.test/v1",
        LLM_API_KEY: "test-key",
        LLM_MODEL: "test-model",
        LLM_API_STYLE: "responses",
        OPENAI_API_KEY: "test-key"
      }
    });
    return JSON.parse(output.trim().split(/\r?\n/).at(-1));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("ordinary conversation reaches the coach without forcing onboarding", () => {
  const result = runMessages(["sohbet etmek"]);

  assert.equal(result.stateCount, 0);
  assert.doesNotMatch(result.sent.join("\n"), /Ana hedefin|Oncelik vermek istedigin bolge/);
  assert.match(result.sent.at(-1), /sohbet edelim/i);
});

test("program preparation can be interrupted without hijacking the conversation", () => {
  const result = runMessages(["bana program hazirla", "ne diyon olm"]);

  assert.equal(result.stateCount, 0);
  assert.equal(result.draftCount, 1);
  assert.match(result.sent.join("\n"), /hedefini/i);
  assert.match(result.sent.at(-1), /sohbet edelim/i);
  assert.doesNotMatch(result.sent.join("\n"), /Oncelik vermek istedigin bolge|Yas, boy, kilo/);
});

test("a stale onboarding state becomes a resumable draft instead of consuming casual speech", () => {
  const result = runMessages(["sa"], { initialState: "onboarding_days" });

  assert.equal(result.stateCount, 0);
  assert.equal(result.draftCount, 1);
  assert.match(result.sent.at(-1), /sohbet edelim/i);
  assert.doesNotMatch(result.sent.join("\n"), /3, 4 veya 5/);
});

test("low-information speech is handled by the agent while the draft remains available", () => {
  const result = runMessages(["bana program hazirla", "a"]);

  assert.equal(result.stateCount, 0);
  assert.equal(result.draftCount, 1);
  assert.match(result.sent.at(-1), /sohbet edelim/i);
});

test("/start sends a one-time welcome and creates the user", () => {
  const result = runMessages(["/start"]);

  assert.equal(result.userCount, 1);
  assert.equal(result.sent.length, 1);
  assert.match(result.sent[0], /FitZortNess/);
  assert.equal(result.stateCount, 0);
  assert.equal(result.draftCount, 0);
});

for (const command of ["/profile", "/new_program", "/analyze_program", "/feedback", "/limits", "/reset", "/skip", "/help"]) {
  test(`${command} has no effect for a normal user`, () => {
    const result = runMessages([command]);

    assert.equal(result.stateCount, 0);
    assert.equal(result.userCount, 0);
    assert.equal(result.interactionCount, 0);
    assert.equal(result.usageCount, 0);
    assert.deepEqual(result.sent, []);
  });
}

test("admin help lists only admin commands", () => {
  const result = runMessages(["/help"], { userId: 123, adminUserIds: "123" });

  assert.match(result.sent.at(-1), /Admin komutlari/i);
  assert.match(result.sent.at(-1), /admin_users/i);
  assert.doesNotMatch(result.sent.at(-1), /new_program|analyze_program|\/profile|\/limits/i);
});

test("removed admin help alias has no effect", () => {
  const result = runMessages(["/admin_help"], { userId: 123, adminUserIds: "123" });

  assert.equal(result.userCount, 0);
  assert.equal(result.interactionCount, 0);
  assert.equal(result.stateCount, 0);
  assert.deepEqual(result.sent, []);
});

test("an older wait message never displaces the current request", () => {
  const result = runMessages(["simdilik bekleyelim, sonra bakariz", "bana program hazirla"]);

  assert.equal(result.stateCount, 0);
  assert.equal(result.draftCount, 1);
  assert.match(result.sent.at(-1), /hedefini/i);
});
