import { getDb, parseJson } from "./db.js";
import { EXERCISE_ALIASES } from "./aliasSeed.js";

const SEEDED_EXERCISE_ALIASES = new Map(EXERCISE_ALIASES.map(([alias, canonicalName]) => [normalizeExerciseName(alias), canonicalName]));

const MUSCLE_GROUPS = {
  chest: ["pectorals", "chest"],
  back: ["lats", "upper back", "traps", "back"],
  quads: ["quads", "quadriceps"],
  hamstrings: ["hamstrings"],
  glutes: ["glutes"],
  shoulders: ["delts", "shoulders"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  abs: ["abs", "waist"]
};

const MUSCLE_GROUP_SYNONYMS = {
  chest: ["chest", "gogus", "pectoral", "pektoral"],
  back: ["back", "sirt", "kanat", "lat", "lats"],
  quads: ["quads", "quadriceps", "bacak", "on bacak", "uyluk", "quad"],
  hamstrings: ["hamstrings", "hamstring", "arka bacak", "arka uyluk"],
  glutes: ["glutes", "glute", "kalca", "popo"],
  shoulders: ["shoulders", "shoulder", "omuz", "delt", "delts"],
  biceps: ["biceps", "bicep", "pazi", "on kol"],
  triceps: ["triceps", "tricep", "arka kol"],
  abs: ["abs", "karin", "gobek", "core", "waist"]
};

const MUSCLE_GROUP_SYNONYM_LOOKUP = new Map(
  Object.entries(MUSCLE_GROUP_SYNONYMS).flatMap(([canonical, synonyms]) => synonyms.map((synonym) => [normalizeTurkishText(synonym), canonical]))
);

export function normalizeMuscleGroupList(values) {
  const normalized = (values || []).map((value) => MUSCLE_GROUP_SYNONYM_LOOKUP.get(normalizeTurkishText(value)) || normalizeTurkishText(value));
  return [...new Set(normalized.filter(Boolean))];
}

export function findExercises({ targetMuscles = [], equipment = [], patterns = [], excludeRiskTags = [], excludeIds = [], excludeNames = [], limit = 8 }) {
  const rows = getDb().prepare(`
    SELECT e.*, m.*
    FROM exercises e
    JOIN exercise_metadata m ON m.exercise_id = e.id
    WHERE m.metadata_status = 'reviewed'
    ORDER BY
      CASE WHEN m.exercise_type = 'compound' THEN 0 ELSE 1 END,
      e.name
  `).all();

  const normalizedEquipment = equipment.map(normalizeEquipmentToken);
  const normalizedPatterns = patterns.map(normalize);
  const normalizedExcludeNames = excludeNames.map(normalizeExerciseName).filter(Boolean);
  const wantedTargets = targetMuscles.flatMap((muscle) => MUSCLE_GROUPS[muscle] || [muscle]).map(normalize);

  return rows
    .filter((row) => {
      const rowEquipment = normalize(row.equipment);
      const rowName = normalizeExerciseName(row.name);
      const rowTarget = normalize(row.target);
      const rowCategory = normalize(row.category);
      const secondary = parseJson(row.secondary_muscles_json).map(normalize);
      const risks = parseJson(row.risk_tags_json).map(normalize);
      const equipmentOk = normalizedEquipment.length === 0 || normalizedEquipment.includes("gym") || normalizedEquipment.some((item) => rowEquipment.includes(item) || item.includes(rowEquipment));
      const patternOk = normalizedPatterns.length === 0 || normalizedPatterns.includes(normalize(row.movement_pattern));
      const targetOk = wantedTargets.length === 0 || wantedTargets.some((target) => rowTarget.includes(target) || rowCategory.includes(target) || secondary.includes(target));
      const riskOk = excludeRiskTags.every((risk) => !risks.includes(normalize(risk)));
      const duplicateOk = !excludeIds.includes(row.id);
      const nameOk = normalizedExcludeNames.every((name) => !rowName.includes(name) && !name.includes(rowName));
      return equipmentOk && patternOk && targetOk && riskOk && duplicateOk && nameOk;
    })
    .sort((a, b) => scoreExercise(b, normalizedEquipment, wantedTargets, normalizedPatterns) - scoreExercise(a, normalizedEquipment, wantedTargets, normalizedPatterns) || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(toExercise);
}

export function findExerciseByName(name) {
  const rawName = normalize(name).trim();
  const normalizedInput = normalizeExerciseName(name).trim();
  if (!rawName || !normalizedInput) return null;

  const rawAliasMatch = findAliasMatch(rawName, false);
  if (rawAliasMatch) return rawAliasMatch;
  const normalizedAliasMatch = findAliasMatch(normalizedInput, false);
  if (normalizedAliasMatch) return normalizedAliasMatch;

  const seededCanonicalName = SEEDED_EXERCISE_ALIASES.get(normalizedInput);
  if (seededCanonicalName) {
    const seededRow = findExerciseRow(normalizeExerciseName(seededCanonicalName));
    if (seededRow) return toExercise(seededRow);
  }

  let row = findExerciseRow(normalizedInput);
  if (row) return toExercise(row);

  const fuzzyAliasMatch = findAliasMatch(rawName) || findAliasMatch(normalizedInput);
  if (fuzzyAliasMatch) return fuzzyAliasMatch;

  row = findBestTokenMatch(normalizedInput);
  return row ? toExercise(row) : null;
}

function findExerciseRow(normalizedName) {
  const query = `%${normalizedName.replaceAll(" ", "%")}%`;
  return getDb().prepare(`
    SELECT e.*, m.*
    FROM exercises e
    JOIN exercise_metadata m ON m.exercise_id = e.id
    WHERE lower(e.name) LIKE ?
    ORDER BY
      CASE WHEN lower(e.name) = ? THEN 0 ELSE 1 END,
      CASE WHEN m.metadata_status = 'reviewed' THEN 0 ELSE 1 END,
      length(e.name)
    LIMIT 1
  `).get(query, normalizedName);
}

function findAliasMatch(name, includeFuzzy = true) {
  const row = getDb().prepare(`
    SELECT e.*, m.*
    FROM exercise_aliases a
    LEFT JOIN exercises e ON e.id = a.exercise_id
    LEFT JOIN exercise_metadata m ON m.exercise_id = e.id
    WHERE lower(a.alias) = lower(?)
    LIMIT 1
  `).get(name);

  if (row?.id) return toExercise(row);
  if (!includeFuzzy) return null;

  const fuzzy = getDb().prepare(`
    SELECT e.*, m.*
    FROM exercise_aliases a
    LEFT JOIN exercises e ON e.id = a.exercise_id
    LEFT JOIN exercise_metadata m ON m.exercise_id = e.id
    WHERE lower(?) LIKE '%' || lower(a.alias) || '%'
    ORDER BY length(a.alias) DESC
    LIMIT 1
  `).get(name);

  return fuzzy?.id ? toExercise(fuzzy) : null;
}

function findBestTokenMatch(name) {
  const tokens = name.split(/\s+/).filter((token) => token.length > 2);
  if (!tokens.length) return null;

  const rows = getDb().prepare(`
    SELECT e.*, m.*
    FROM exercises e
    JOIN exercise_metadata m ON m.exercise_id = e.id
    WHERE m.metadata_status = 'reviewed'
  `).all();

  let best = null;
  let bestScore = 0;
  for (const row of rows) {
    const rowName = normalize(row.name);
    const score = tokens.reduce((sum, token) => sum + (rowName.includes(token) ? 1 : 0), 0);
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }

  return bestScore >= Math.min(2, tokens.length) ? best : null;
}

function toExercise(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    equipment: row.equipment,
    target: row.target,
    secondary_muscles: parseJson(row.secondary_muscles_json),
    movement_pattern: row.movement_pattern,
    exercise_type: row.exercise_type,
    difficulty: row.difficulty,
    risk_tags: parseJson(row.risk_tags_json),
    avoid_if: parseJson(row.avoid_if_json),
    instructions_tr: row.instructions_tr,
    instructions_en: row.instructions_en,
    image: row.image,
    gif_url: row.gif_url
  };
}

function normalize(value) {
  return String(value || "").toLowerCase();
}

function normalizeTurkishText(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replaceAll("ı", "i")
    .trim();
}

const GYM_ACCESS_PHRASES = new Set([
  "gym", "full gym", "complete gym", "commercial gym", "home gym",
  "gym equipment", "gym access", "gym membership", "full equipment",
  "all equipment", "any equipment", "everything", "spor salonu",
  "salon", "gym uyeligim var", "salona gidiyorum"
]);

function normalizeEquipmentToken(value) {
  const normalized = normalize(value).trim();
  return GYM_ACCESS_PHRASES.has(normalized) ? "gym" : normalized;
}

function normalizeExerciseName(value) {
  return normalize(value)
    .replace(/\bbb\b/g, "barbell")
    .replace(/\bdb\b/g, "dumbbell")
    .replace(/\bohp\b/g, "overhead press")
    .replace(/\blpd\b/g, "lat pulldown")
    .replace(/\brdl\b/g, "romanian deadlift")
    .replace(/\btri\b/g, "triceps")
    .replace(/\bbi\b/g, "biceps")
    .replace(/\bscott curl\b/g, "preacher curl")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreExercise(row, equipment, wantedTargets, wantedPatterns) {
  const name = normalize(row.name);
  const rowEquipment = normalize(row.equipment);
  const rowTarget = normalize(row.target);
  const secondary = parseJson(row.secondary_muscles_json).map(normalize);
  let score = 0;

  if (equipment.includes("gym")) {
    if (["barbell", "dumbbell", "cable", "leverage machine", "smith machine"].some((item) => rowEquipment.includes(item))) score += 8;
    if (rowEquipment.includes("band")) score -= 5;
    if (name.includes("assisted")) score -= 2;
  }

  if (["bench press", "squat", "leg press", "row", "pulldown", "shoulder press", "leg curl", "leg extension", "curl", "pushdown", "plank"].some((item) => name.includes(item))) score += 4;
  if (wantedTargets.some((target) => rowTarget.includes(target))) score += 6;
  if (wantedTargets.some((target) => secondary.includes(target))) score += 2;
  if (wantedPatterns.includes(normalize(row.movement_pattern))) score += 3;
  if (row.exercise_type === "compound") score += 2;
  if (row.difficulty === "beginner") score += 1;
  return score;
}
