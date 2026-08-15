import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fitzortness-telegram-media-test-"));
process.env.DB_PATH = path.join(tempDir, "test.db");

const { getDb } = await import("../src/db.js");
const { cacheExerciseAnimationFileId, findApprovedExerciseAnimation } = await import("../src/exerciseMedia.js");
const { sendApprovedAnimation } = await import("../src/telegramMedia.js");

const GIF_BYTES = Buffer.from("GIF89a-approved-content");
const SHA256 = "5fcfa169459f6a97a2b76be7e368abb120278302c071c0aac0d39b16c532b8d2";

test.before(() => {
  getDb().prepare(`
    INSERT INTO exercises (id, name, secondary_muscles_json, raw_json)
    VALUES ('bench', 'Barbell Bench Press', '[]', '{}')
  `).run();
  getDb().prepare(`
    INSERT INTO exercise_media (
      exercise_id, remote_url, media_type, source, source_url, license, license_url, attribution, sha256, enabled
    ) VALUES (?, ?, 'image/gif', 'Wikimedia Commons', 'https://commons.wikimedia.org/wiki/File:Bench.gif',
      'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/', 'Example Author', ?, 1)
  `).run("bench", "https://upload.wikimedia.org/example/bench.gif", SHA256);
});

test.after(() => {
  getDb().close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test.beforeEach(() => {
  getDb().prepare(`
    UPDATE exercise_media SET telegram_bot_id = NULL, telegram_file_id = NULL WHERE exercise_id = 'bench'
  `).run();
});

test("an approved remote GIF is verified in memory, uploaded once, and cached by Telegram file_id", async () => {
  const requests = [];
  const result = await sendApprovedAnimation({
    botToken: "123:test-token",
    chatId: 42,
    media: findApprovedExerciseAnimation("bench"),
    requestTimeoutMs: 1000,
    maxBytes: 1024,
    allowedHosts: ["upload.wikimedia.org"],
    database: getDb(),
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      if (url === "https://upload.wikimedia.org/example/bench.gif") {
        return new Response(GIF_BYTES, { status: 200, headers: { "Content-Type": "image/gif" } });
      }
      return new Response(JSON.stringify({ ok: true, result: { animation: { file_id: "telegram-file-id" } } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.redirect, "error");
  assert.ok(requests[1].options.body instanceof FormData);
  assert.equal(requests[1].options.body.get("chat_id"), "42");
  const animation = requests[1].options.body.get("animation");
  assert.equal(animation.type, "image/gif");
  assert.equal(result.result.animation.file_id, "telegram-file-id");
  assert.equal(findApprovedExerciseAnimation("bench").telegramFileId, "telegram-file-id");
});

test("a cached Telegram file_id is reused without fetching the remote GIF", async () => {
  cacheExerciseAnimationFileId("bench", "123", "telegram-file-id");
  const requests = [];

  await sendApprovedAnimation({
    botToken: "123:test-token",
    chatId: 42,
    media: findApprovedExerciseAnimation("bench"),
    requestTimeoutMs: 1000,
    maxBytes: 1024,
    allowedHosts: ["upload.wikimedia.org"],
    database: getDb(),
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ ok: true, result: { animation: { file_id: "telegram-file-id" } } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.telegram.org/bot123:test-token/sendAnimation");
  assert.deepEqual(JSON.parse(requests[0].options.body), { chat_id: 42, animation: "telegram-file-id" });
});

test("an invalid cached file_id is replaced by a verified remote upload", async () => {
  cacheExerciseAnimationFileId("bench", "123", "stale-file-id");
  const requests = [];

  await sendApprovedAnimation({
    botToken: "123:test-token",
    chatId: 42,
    media: findApprovedExerciseAnimation("bench"),
    requestTimeoutMs: 1000,
    maxBytes: 1024,
    allowedHosts: ["upload.wikimedia.org"],
    database: getDb(),
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      if (requests.length === 1) return new Response("stale", { status: 400 });
      if (url === "https://upload.wikimedia.org/example/bench.gif") {
        return new Response(GIF_BYTES, { status: 200, headers: { "Content-Type": "image/gif" } });
      }
      return new Response(JSON.stringify({ ok: true, result: { animation: { file_id: "replacement-file-id" } } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  assert.equal(requests.length, 3);
  assert.equal(findApprovedExerciseAnimation("bench").telegramFileId, "replacement-file-id");
});

test("a changed remote GIF is rejected before Telegram upload", async () => {
  const requests = [];

  await assert.rejects(
    sendApprovedAnimation({
      botToken: "123:test-token",
      chatId: 42,
      media: findApprovedExerciseAnimation("bench"),
      requestTimeoutMs: 1000,
      maxBytes: 1024,
      allowedHosts: ["upload.wikimedia.org"],
      database: getDb(),
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        return new Response(Buffer.from("GIF89a-changed-content"), {
          status: 200,
          headers: { "Content-Type": "image/gif" }
        });
      }
    }),
    /sha256 mismatch/
  );

  assert.equal(requests.length, 1);
});

test("a remote GIF host outside the allowlist is rejected before any request", async () => {
  let fetchCalled = false;
  const media = { ...findApprovedExerciseAnimation("bench"), remoteUrl: "https://example.test/bench.gif" };

  await assert.rejects(
    sendApprovedAnimation({
      botToken: "123:test-token",
      chatId: 42,
      media,
      requestTimeoutMs: 1000,
      maxBytes: 1024,
      allowedHosts: ["upload.wikimedia.org"],
      database: getDb(),
      fetchImpl: async () => {
        fetchCalled = true;
        return new Response();
      }
    }),
    /host is not allowed/
  );

  assert.equal(fetchCalled, false);
});
