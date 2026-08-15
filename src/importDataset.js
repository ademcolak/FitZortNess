import fs from "node:fs";
import { getDb, json } from "./db.js";
import { config } from "./config.js";
import { EXERCISE_ALIASES } from "./aliasSeed.js";
import { inferMetadata } from "./metadata.js";

export function importDataset() {
  if (!fs.existsSync(config.datasetPath)) throw new Error(`Dataset not found: ${config.datasetPath}`);

  const raw = fs.readFileSync(config.datasetPath, "utf8");
  const exercises = JSON.parse(raw);
  const db = getDb();

  const insertExercise = db.prepare(`
    INSERT INTO exercises (
      id, name, category, body_part, equipment, muscle_group, target,
      secondary_muscles_json, instructions_tr, instructions_en, image, gif_url, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      body_part = excluded.body_part,
      equipment = excluded.equipment,
      muscle_group = excluded.muscle_group,
      target = excluded.target,
      secondary_muscles_json = excluded.secondary_muscles_json,
      instructions_tr = excluded.instructions_tr,
      instructions_en = excluded.instructions_en,
      image = excluded.image,
      gif_url = excluded.gif_url,
      raw_json = excluded.raw_json
  `);

  const insertMetadata = db.prepare(`
    INSERT OR REPLACE INTO exercise_metadata (
      exercise_id, movement_pattern, exercise_type, difficulty, risk_tags_json,
      avoid_if_json, good_for_json, metadata_status, reviewed_note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAlias = db.prepare(`
    INSERT OR REPLACE INTO exercise_aliases (alias, exercise_id, canonical_name, confidence, source)
    VALUES (?, ?, ?, 1.0, 'seed')
  `);

  db.exec("BEGIN");
  try {
    for (const exercise of exercises) {
      insertExercise.run(
        exercise.id,
        exercise.name,
        exercise.category,
        exercise.body_part,
        exercise.equipment,
        exercise.muscle_group,
        exercise.target,
        json(exercise.secondary_muscles || []),
        exercise.instructions?.tr || "",
        exercise.instructions?.en || "",
        exercise.image,
        exercise.gif_url,
        JSON.stringify(exercise)
      );

      const metadata = inferMetadata(exercise);
      insertMetadata.run(
        exercise.id,
        metadata.movement_pattern,
        metadata.exercise_type,
        metadata.difficulty,
        json(metadata.risk_tags),
        json(metadata.avoid_if),
        json(metadata.good_for),
        metadata.metadata_status,
        metadata.reviewed_note
      );
    }
    for (const [alias, canonicalName] of EXERCISE_ALIASES) {
      const canonical = db.prepare("SELECT id, name FROM exercises WHERE lower(name) = lower(?) LIMIT 1").get(canonicalName)
        || db.prepare("SELECT id, name FROM exercises WHERE lower(name) LIKE lower(?) ORDER BY length(name) LIMIT 1").get(`%${canonicalName}%`);
      insertAlias.run(alias, canonical?.id || null, canonical?.name || canonicalName);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
