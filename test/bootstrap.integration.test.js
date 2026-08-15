import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("startup integrates the real dataset, media import, database migration, and smoke test", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fitzortness-bootstrap-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const dbPath = path.join(tempDir, "fitzortness.db");
  const script = [
    "const { bootstrap } = await import('./src/bootstrap.js');",
    "await bootstrap({",
    "  acquireBotInstanceLock: () => () => {},",
    "  setupTelegram: async () => {},",
    "  startBot: async () => {},",
    "  onReady: () => console.log('bootstrap-integration-ok')",
    "});"
  ].join("\n");

  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: projectRoot,
    env: { ...process.env, DB_PATH: dbPath },
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /bootstrap-integration-ok/);
  assert.ok(fs.statSync(dbPath).size > 0);
});
