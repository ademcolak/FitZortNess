import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const EXTRACTED_PROGRAM = {
  days: [
    { name: "Gun 1", items: [{ name: "Bench Press", sets: 4, reps: "8" }, { name: "Lat Pulldown", sets: 4, reps: "10" }] },
    { name: "Gun 2", items: [{ name: "Leg Press", sets: 4, reps: "12" }, { name: "Leg Curl", sets: 3, reps: "12" }] }
  ],
  items: [],
  cardio: [],
  uncertain: []
};
const ANALYSIS_REPLY = "Programini okudum: gogus hacmi dusuk, sirt dengeli.";
const FOLLOW_UP_REPLY = "Dorde cikarabiliriz, hacmi boyle boleriz.";

function runPhotoThenQuestion({ caption, question, userId = 321, extractionFails = false }) {
  const directory = mkdtempSync(path.join(tmpdir(), "fitzortness-image-chat-"));
  const dbPath = path.join(directory, "test.db");
  const script = `
    const sent = [];
    const coachPayloads = [];
    const json = (value) => new Response(JSON.stringify(value), { status: 200 });

    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.includes("api.telegram.org")) {
        if (target.includes("/sendMessage")) {
          sent.push(JSON.parse(options.body || "{}").text);
          return json({ ok: true, result: {} });
        }
        if (target.includes("/getFile")) return json({ ok: true, result: { file_path: "photos/test.jpg", file_size: 64 } });
        if (target.includes("/file/bot")) return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
        return json({ ok: true, result: {} });
      }
      if (target.includes("api.openai.com")) {
        if (${extractionFails}) return new Response("upstream detail leaked here", { status: 500 });
        return json({ output_text: ${JSON.stringify(JSON.stringify(EXTRACTED_PROGRAM))} });
      }

      const body = JSON.parse(options.body || "{}");
      const userText = body.input?.find((item) => item.role === "user")?.content?.find((item) => item.type === "input_text")?.text || "{}";
      coachPayloads.push({ isAgent: Array.isArray(body.tools), payload: JSON.parse(userText) });
      return json({ output_text: body.tools ? ${JSON.stringify(FOLLOW_UP_REPLY)} : ${JSON.stringify(ANALYSIS_REPLY)} });
    };

    const { handleMessage } = await import("./src/bot.js");
    const base = { chat: { id: 1, type: "private" }, from: { id: ${userId}, first_name: "Test" } };
    await handleMessage({ ...base, photo: [{ file_id: "photo-1" }], caption: ${JSON.stringify(caption)} });
    await handleMessage({ ...base, text: ${JSON.stringify(question)} });

    console.log(JSON.stringify({ sent, coachPayloads }));
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
        TELEGRAM_ADMIN_USER_IDS: "999",
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

test("a question after an image analysis can refer back to the analysis", () => {
  const caption = "Bu programi 3 gundur uyguluyorum";
  const result = runPhotoThenQuestion({ caption, question: "peki bunu 4 gune cikaralim mi" });

  assert.ok(result.sent.includes(ANALYSIS_REPLY), `analysis reply was not sent: ${JSON.stringify(result.sent)}`);

  const followUp = result.coachPayloads.at(-1);
  assert.equal(followUp.isAgent, true);
  assert.equal(followUp.payload.user_message, "peki bunu 4 gune cikaralim mi");

  const history = followUp.payload.conversation_history;
  assert.ok(
    history.some((item) => item.role === "user" && item.content === caption),
    `caption missing from history: ${JSON.stringify(history)}`
  );
  assert.ok(
    history.some((item) => item.role === "assistant" && item.content.includes("gogus hacmi dusuk")),
    `image analysis reply missing from history: ${JSON.stringify(history)}`
  );
});

test("the transient reading notice never becomes part of the coach context", () => {
  const result = runPhotoThenQuestion({ caption: "Bu programi 3 gundur uyguluyorum", question: "peki bunu 4 gune cikaralim mi" });

  assert.ok(result.sent.some((text) => text.includes("Gorseli okuyorum")), "the reading notice should still reach the user");

  const history = result.coachPayloads.at(-1).payload.conversation_history;
  assert.ok(
    history.every((item) => !item.content.includes("Gorseli okuyorum")),
    `stale progress notice leaked into history: ${JSON.stringify(history)}`
  );
});

test("a failed image read keeps upstream error detail out of the coach context", () => {
  const result = runPhotoThenQuestion({
    caption: "Bu programi 3 gundur uyguluyorum",
    question: "peki bunu 4 gune cikaralim mi",
    extractionFails: true
  });

  assert.ok(result.sent.some((text) => text.startsWith("Gorseli okuyamadim:")), "the failure should still reach the user");

  const history = result.coachPayloads.at(-1).payload.conversation_history;
  assert.ok(
    history.every((item) => !item.content.includes("upstream detail leaked here")),
    `upstream error detail leaked into history: ${JSON.stringify(history)}`
  );
});
