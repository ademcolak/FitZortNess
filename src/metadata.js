const REVIEWED_NAME_PATTERNS = [
  "bench press", "incline bench", "chest press", "push-up", "dip",
  "lat pulldown", "pull-up", "chin-up", "barbell row", "dumbbell row", "seated row",
  "squat", "leg press", "lunge", "split squat", "leg extension", "leg curl",
  "romanian deadlift", "hip thrust", "glute bridge", "calf raise",
  "shoulder press", "overhead press", "lateral raise", "rear delt",
  "biceps curl", "hammer curl", "triceps pushdown", "skullcrusher",
  "plank", "crunch", "leg raise", "cable fly", "pec deck"
];

export function inferMetadata(exercise) {
  const name = normalize(exercise.name);
  const target = normalize(exercise.target);
  const category = normalize(exercise.category);
  const equipment = normalize(exercise.equipment);
  const text = `${name} ${target} ${category} ${equipment}`;

  const movementPattern = inferPattern(text);
  const exerciseType = inferType(text, movementPattern);
  const difficulty = inferDifficulty(text, equipment, exerciseType);
  const riskTags = inferRiskTags(text, movementPattern);
  const avoidIf = inferAvoidIf(riskTags);
  const goodFor = inferGoodFor(target, movementPattern);
  const metadataStatus = REVIEWED_NAME_PATTERNS.some((pattern) => name.includes(pattern)) ? "reviewed" : "auto_tagged";

  return {
    movement_pattern: movementPattern,
    exercise_type: exerciseType,
    difficulty,
    risk_tags: riskTags,
    avoid_if: avoidIf,
    good_for: goodFor,
    metadata_status: metadataStatus,
    reviewed_note: metadataStatus === "reviewed" ? "Seed-reviewed by conservative name pattern for MVP pool." : ""
  };
}

function inferPattern(text) {
  if (includesAny(text, ["bench press", "push-up", "chest press", "dip", "fly"])) return "horizontal_push";
  if (includesAny(text, ["shoulder press", "overhead press", "arnold press"])) return "vertical_push";
  if (includesAny(text, ["row", "face pull", "reverse fly"])) return "horizontal_pull";
  if (includesAny(text, ["pulldown", "pull-up", "chin-up"])) return "vertical_pull";
  if (includesAny(text, ["squat", "leg press", "leg extension", "lunge", "split squat", "step-up"])) return "squat_lunge";
  if (includesAny(text, ["deadlift", "romanian", "good morning", "hip thrust", "glute bridge", "leg curl"])) return "hinge";
  if (includesAny(text, ["curl"])) return "elbow_flexion";
  if (includesAny(text, ["triceps", "pushdown", "extension", "skullcrusher"])) return "elbow_extension";
  if (includesAny(text, ["calf"])) return "calf_raise";
  if (includesAny(text, ["plank", "crunch", "sit-up", "leg raise", "twist"])) return "core";
  return "accessory";
}

function inferType(text, pattern) {
  if (["horizontal_push", "vertical_push", "horizontal_pull", "vertical_pull", "squat_lunge", "hinge"].includes(pattern)) {
    if (!includesAny(text, ["fly", "raise", "extension", "curl", "leg curl", "leg extension"])) return "compound";
  }
  return "isolation";
}

function inferDifficulty(text, equipment, type) {
  if (includesAny(text, ["deadlift", "snatch", "clean", "pistol", "muscle up"])) return "advanced";
  if (type === "compound" && includesAny(equipment, ["barbell", "smith machine"])) return "intermediate";
  if (includesAny(equipment, ["machine", "body weight", "band"])) return "beginner";
  return "intermediate";
}

function inferRiskTags(text, pattern) {
  const tags = [];
  if (includesAny(text, ["deadlift", "good morning", "romanian"])) tags.push("lower_back_load");
  if (includesAny(text, ["squat", "lunge", "leg press", "leg extension"])) tags.push("knee_load");
  if (includesAny(text, ["overhead", "shoulder press", "upright row", "dip", "behind neck"])) tags.push("shoulder_stress");
  if (includesAny(text, ["sit-up", "crunch", "twist"])) tags.push("spinal_flexion");
  return tags;
}

function inferAvoidIf(riskTags) {
  const avoid = [];
  if (riskTags.includes("lower_back_load")) avoid.push("acute_lower_back_pain");
  if (riskTags.includes("knee_load")) avoid.push("acute_knee_pain");
  if (riskTags.includes("shoulder_stress")) avoid.push("acute_shoulder_pain");
  if (riskTags.includes("spinal_flexion")) avoid.push("acute_spine_pain");
  return avoid;
}

function inferGoodFor(target, pattern) {
  const tags = [];
  if (target) tags.push(`${target.replaceAll(" ", "_")}_hypertrophy`);
  if (pattern !== "accessory") tags.push(pattern);
  return tags;
}

function includesAny(value, needles) {
  return needles.some((needle) => value.includes(needle));
}

function normalize(value) {
  return String(value || "").toLowerCase();
}
