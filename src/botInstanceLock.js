import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function acquireBotInstanceLock({ botToken, lockDirectory = tmpdir() }) {
  if (!String(botToken || "").trim()) throw new Error("Bot instance lock requires a Telegram bot token.");

  fs.mkdirSync(lockDirectory, { recursive: true });
  const lockPath = path.join(lockDirectory, `fitzortness-${tokenFingerprint(botToken)}.lock.sqlite`);
  const owner = { ownerId: randomUUID(), pid: process.pid };
  const database = openLockDatabase(lockPath);
  let transactionOpen = false;

  try {
    database.exec("BEGIN IMMEDIATE");
    transactionOpen = true;
    const existing = database.prepare("SELECT owner_id, pid FROM bot_instance_lock WHERE name = 'poller'").get();
    const existingPid = Number(existing?.pid);
    if (existing && Number.isInteger(existingPid) && existingPid > 0 && isProcessAlive(existingPid)) {
      const lockError = new Error(`FitZortNess bot is already running (PID ${existingPid}).`);
      lockError.code = "BOT_INSTANCE_LOCKED";
      throw lockError;
    }

    database.prepare(`
      INSERT INTO bot_instance_lock (name, owner_id, pid, acquired_at)
      VALUES ('poller', ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(name) DO UPDATE SET
        owner_id = excluded.owner_id,
        pid = excluded.pid,
        acquired_at = CURRENT_TIMESTAMP
    `).run(owner.ownerId, owner.pid);
    database.exec("COMMIT");
    transactionOpen = false;
    return createRelease(database, owner.ownerId);
  } catch (error) {
    if (transactionOpen) database.exec("ROLLBACK");
    database.close();
    throw error;
  }
}

function tokenFingerprint(botToken) {
  return createHash("sha256").update(String(botToken)).digest("hex").slice(0, 24);
}

function openLockDatabase(lockPath) {
  if (!fs.existsSync(lockPath)) {
    const handle = fs.openSync(lockPath, "a", 0o600);
    fs.closeSync(handle);
  }
  const database = new DatabaseSync(lockPath);
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec(`
    CREATE TABLE IF NOT EXISTS bot_instance_lock (
      name TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      pid INTEGER NOT NULL,
      acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  return database;
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function createRelease(database, ownerId) {
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    process.off("exit", release);
    let transactionOpen = false;
    try {
      database.exec("BEGIN IMMEDIATE");
      transactionOpen = true;
      database.prepare("DELETE FROM bot_instance_lock WHERE name = 'poller' AND owner_id = ?").run(ownerId);
      database.exec("COMMIT");
      transactionOpen = false;
    } catch {
      if (transactionOpen) {
        try {
          database.exec("ROLLBACK");
        } catch {
          // Process shutdown may make cleanup impossible; the next owner reclaims a dead PID.
        }
      }
    } finally {
      database.close();
    }
  };
  process.once("exit", release);
  return release;
}
