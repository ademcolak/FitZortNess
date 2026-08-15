import fs from "node:fs";
import { config } from "./config.js";
import { getDb } from "./db.js";

const REQUIRED_TEXT_FIELDS = ["exercise_id", "remote_url", "media_type", "source", "source_url", "license", "license_url", "attribution", "sha256"];

export function importExerciseMedia({ database = getDb(), manifestPath = config.exerciseMediaManifestPath } = {}) {
  if (!fs.existsSync(manifestPath)) {
    database.prepare("DELETE FROM exercise_media").run();
    return 0;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest?.version !== 1 || !Array.isArray(manifest.media)) throw new Error("Exercise media manifest must use version 1 and contain a media array.");

  const entries = manifest.media.map((entry) => validateEntry(entry, database));
  assertUniqueExerciseIds(entries);
  const insert = database.prepare(`
    INSERT INTO exercise_media (
      exercise_id, remote_url, media_type, source, source_url, license, license_url, attribution, sha256, enabled, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(exercise_id) DO UPDATE SET
      remote_url = excluded.remote_url,
      media_type = excluded.media_type,
      source = excluded.source,
      source_url = excluded.source_url,
      license = excluded.license,
      license_url = excluded.license_url,
      attribution = excluded.attribution,
      telegram_bot_id = CASE
        WHEN exercise_media.remote_url = excluded.remote_url AND exercise_media.sha256 = excluded.sha256
        THEN exercise_media.telegram_bot_id ELSE NULL END,
      telegram_file_id = CASE
        WHEN exercise_media.remote_url = excluded.remote_url AND exercise_media.sha256 = excluded.sha256
        THEN exercise_media.telegram_file_id ELSE NULL END,
      sha256 = excluded.sha256,
      enabled = excluded.enabled,
      updated_at = CURRENT_TIMESTAMP
  `);

  database.exec("BEGIN");
  try {
    for (const entry of entries) {
      insert.run(
        entry.exercise_id,
        entry.remote_url,
        entry.media_type,
        entry.source,
        entry.source_url,
        entry.license,
        entry.license_url,
        entry.attribution,
        entry.sha256,
        entry.enabled ? 1 : 0
      );
    }
    const importedIds = new Set(entries.map((entry) => entry.exercise_id));
    for (const row of database.prepare("SELECT exercise_id FROM exercise_media").all()) {
      if (!importedIds.has(row.exercise_id)) database.prepare("DELETE FROM exercise_media WHERE exercise_id = ?").run(row.exercise_id);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return entries.length;
}

export function findApprovedExerciseAnimation(exerciseId, { database = getDb() } = {}) {
  const row = database.prepare(`
    SELECT exercise_id, remote_url, media_type, source, source_url, license, license_url, attribution, sha256,
           telegram_bot_id, telegram_file_id
    FROM exercise_media
    WHERE exercise_id = ? AND enabled = 1
  `).get(exerciseId);
  if (!row) return null;

  return {
    exerciseId: row.exercise_id,
    remoteUrl: row.remote_url,
    mediaType: row.media_type,
    source: row.source,
    sourceUrl: row.source_url,
    license: row.license,
    licenseUrl: row.license_url,
    attribution: row.attribution,
    sha256: row.sha256,
    telegramBotId: row.telegram_bot_id,
    telegramFileId: row.telegram_file_id
  };
}

export function cacheExerciseAnimationFileId(exerciseId, botId, fileId, { database = getDb() } = {}) {
  database.prepare(`
    UPDATE exercise_media
    SET telegram_bot_id = ?, telegram_file_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE exercise_id = ? AND enabled = 1
  `).run(botId, fileId, exerciseId);
}

export function clearExerciseAnimationFileId(exerciseId, { database = getDb() } = {}) {
  database.prepare(`
    UPDATE exercise_media
    SET telegram_bot_id = NULL, telegram_file_id = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE exercise_id = ?
  `).run(exerciseId);
}

function validateEntry(entry, database) {
  if (!entry || REQUIRED_TEXT_FIELDS.some((field) => typeof entry[field] !== "string" || !entry[field].trim())) {
    throw new Error("Exercise media entries require exercise, remote URL, source, license, attribution, and sha256 fields.");
  }
  if (typeof entry.enabled !== "boolean") throw new Error(`Exercise media enabled must be a boolean: ${entry.exercise_id}`);
  if (entry.media_type !== "image/gif") throw new Error(`Unsupported exercise media type for ${entry.exercise_id}: ${entry.media_type}`);
  if (!/^[a-f0-9]{64}$/i.test(entry.sha256)) throw new Error(`Invalid sha256 for exercise media: ${entry.exercise_id}`);
  if (!isHttpsUrl(entry.remote_url)) throw new Error(`Exercise media remote_url must use HTTPS: ${entry.exercise_id}`);
  if (!isHttpsUrl(entry.source_url) || !isHttpsUrl(entry.license_url)) throw new Error(`Exercise media source and license URLs must use HTTPS: ${entry.exercise_id}`);
  if (!database.prepare("SELECT 1 FROM exercises WHERE id = ?").get(entry.exercise_id)) throw new Error(`Exercise media references unknown exercise: ${entry.exercise_id}`);
  return { ...entry, sha256: entry.sha256.toLowerCase(), enabled: entry.enabled };
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function assertUniqueExerciseIds(entries) {
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.exercise_id)) throw new Error(`Duplicate exercise media ID: ${entry.exercise_id}`);
    seen.add(entry.exercise_id);
  }
}
