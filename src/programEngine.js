import { findExerciseByName, findExercises } from "./exerciseSearch.js";
import { createWeeklySplit } from "./splitPlanner.js";

const TARGETS = {
  beginner: { large: [6, 10], small: [4, 8], frequency: 2 },
  intermediate: { large: [8, 14], small: [6, 10], frequency: 2 },
  advanced: { large: [10, 18], small: [8, 14], frequency: 2 }
};

export function generateProgram(profile) {
  const daysPerWeek = clamp(profile.days_per_week || 3, 3, 5);
  const dayNames = createWeeklySplit(daysPerWeek, profile.preferred_split);
  const equipment = profile.equipment?.length ? profile.equipment : ["gym"];
  const excludeRiskTags = riskTagsFromProfile(profile);
  const priorityMuscles = profile.priority_muscles || [];
  const deemphasizedMuscles = profile.deemphasized_muscles || [];
  const excludedExercises = profile.excluded_exercises || [];
  const sessionDuration = profile.session_duration_min || 60;

  const days = dayNames.map((name, index) => ({
    name,
    exercises: selectDayExercises(name, index, equipment, excludeRiskTags, excludedExercises, profile.level, profile.goal, priorityMuscles, deemphasizedMuscles)
  }));
  for (const day of days) trimDayToDuration(day, sessionDuration, priorityMuscles);
  for (const day of days) day.estimated_duration_min = estimateDayDuration(day);

  const program = {
    goal: profile.goal || "muscle_gain",
    level: profile.level || "intermediate",
    priority_muscles: priorityMuscles,
    deemphasized_muscles: deemphasizedMuscles,
    days_per_week: daysPerWeek,
    session_duration_min: sessionDuration,
    days,
    notes: [
      "Agri veya keskin rahatsizlik olursa hareketi durdur.",
      "Setleri 1-3 tekrar yedek kalacak agirlikla yap.",
      "Isinma setleri calisma setlerine dahil degildir."
    ]
  };

  return {
    program,
    analysis: analyzeProgram(program)
  };
}

export function analyzeProgram(program) {
  const muscleSets = {};
  const muscleDays = {};
  const issues = [];
  const templateMultiplier = program.days?.length === 1 ? clamp(program.days_per_week || 1, 1, 7) : 1;

  for (const day of program.days || []) {
    for (const item of day.exercises || []) {
      const exercise = item.exercise || item;
      const sets = Number(item.sets || 0);
      addVolume(muscleSets, canonicalMuscle(exercise.target), sets * templateMultiplier);
      addRepeatedDays(muscleDays, canonicalMuscle(exercise.target), day.name, templateMultiplier);
      for (const secondary of exercise.secondary_muscles || []) {
        addVolume(muscleSets, canonicalMuscle(secondary), sets * 0.5 * templateMultiplier);
        addRepeatedDays(muscleDays, canonicalMuscle(secondary), day.name, templateMultiplier);
      }
    }
  }

  const target = TARGETS[program.level || "intermediate"] || TARGETS.intermediate;
  for (const muscle of ["chest", "back", "quads", "hamstrings", "glutes", "shoulders"]) {
    const current = Math.round((muscleSets[muscle] || 0) * 10) / 10;
    const frequency = muscleDays[muscle]?.size || 0;
    const minSets = adjustedMinSets(target.large[0], muscle, program);
    if (current < minSets) {
      issues.push({ type: "low_volume", muscle, current, recommended_min: minSets });
    }
    if (frequency > 0 && frequency < target.frequency) {
      issues.push({ type: "low_frequency", muscle, current: frequency, recommended_min: target.frequency });
    }
  }

  for (const muscle of ["biceps", "triceps", "abs"]) {
    const current = Math.round((muscleSets[muscle] || 0) * 10) / 10;
    const minSets = adjustedMinSets(target.small[0], muscle, program);
    if (current > 0 && current < minSets) {
      issues.push({ type: "low_volume", muscle, current, recommended_min: minSets });
    }
  }

  return {
    muscle_sets: muscleSets,
    muscle_frequency: Object.fromEntries(Object.entries(muscleDays).map(([key, value]) => [key, value.size])),
    issues
  };
}

export function parseAndAnalyzeProgram(text, profile = {}) {
  profile ||= {};
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const days = [];
  let current = { name: "Program", exercises: [] };
  days.push(current);

  for (const line of lines) {
    if (/^(walking|cycling|bike|treadmill|koşu|kosu|yuruyus|yürüyüş|cardio|warmup|isinma|ısınma)\b/i.test(line)) continue;

    if (/^(pazartesi|sali|çarşamba|carsamba|perşembe|persembe|cuma|cumartesi|pazar|day\s*\d|gün\s*\d|gun\s*\d)/i.test(line)
      || /^(push|pull|legs?|upper|lower|full\s*body|itme|cekis|çekiş|bacak|ust\s*vucut|üst\s*vücut|alt\s*vucut|alt\s*vücut|tam\s*vucut|tam\s*vücut)(?:\s+[ab12])?\s*[:\-]?$/i.test(line)) {
      current = { name: line.replace(/[:\-]+$/, ""), exercises: [] };
      days.push(current);
      continue;
    }

    const setsMatch = line.match(/(\d+)\s*(?:set|[xX×✕*\uFFFD?])/u);
    const sets = setsMatch ? Number(setsMatch[1]) : 3;
    const repsMatch = line.match(/\d+\s*(?:set|[xX×✕*\uFFFD?])\s*(\d+(?:\s*[-–]\s*\d+)?)/iu);
    const reps = repsMatch ? repsMatch[1].replace(/\s+/g, "") : "8-12";
    const name = line.replace(/\d+\s*(?:set|[xX×✕*\uFFFD?]).*/u, "").replace(/[-:]+$/, "").trim();
    const exercise = inferExerciseFromName(name) || findExerciseByName(name);
    if (exercise) current.exercises.push({ exercise, sets, reps });
  }

  const nonEmptyDays = days.filter((day) => day.exercises.length > 0);
  const program = {
    days: nonEmptyDays.length ? nonEmptyDays : days,
    level: profile.level || "intermediate",
    goal: profile.goal || "muscle_gain",
    days_per_week: profile.analysis_days_per_week || null,
    priority_muscles: profile.priority_muscles || [],
    deemphasized_muscles: profile.deemphasized_muscles || []
  };
  for (const day of program.days) day.estimated_duration_min = estimateDayDuration(day);
  return { program, analysis: analyzeProgram(program) };
}

export function parseAndAnalyzeExtractedWorkout(extracted, profile = {}) {
  profile ||= {};
  const dayGroups = extracted.days?.length ? extracted.days : groupExtractedItemsByDay(extracted.items || []);
  if (dayGroups.length) {
    const days = dayGroups.map((day, index) => ({
      name: day.name || `Gun ${index + 1}`,
      exercises: (day.items || []).map(toParsedExercise).filter(Boolean)
    })).filter((day) => day.exercises.length > 0);
    for (const day of days) day.estimated_duration_min = estimateDayDuration(day);

    const program = {
      days,
      level: profile.level || "intermediate",
      goal: profile.goal || "muscle_gain",
      days_per_week: profile.analysis_days_per_week || null,
      priority_muscles: profile.priority_muscles || [],
      deemphasized_muscles: profile.deemphasized_muscles || []
    };
    return { program, analysis: analyzeProgram(program) };
  }

  return parseAndAnalyzeProgram("", profile);
}

function groupExtractedItemsByDay(items) {
  const groups = new Map();
  for (const item of items) {
    const day = item.day || "Program";
    if (!groups.has(day)) groups.set(day, { name: day, items: [] });
    groups.get(day).items.push(item);
  }
  return [...groups.values()];
}

function toParsedExercise(item) {
  if (!item?.name) return null;
  const exercise = inferExerciseFromName(item.name) || findExerciseByName(item.name);
  if (!exercise) return null;
  return {
    exercise,
    sets: Number(item.sets || 3),
    reps: String(item.reps || "8-12")
  };
}

function selectDayExercises(dayName, index, equipment, excludeRiskTags, excludeNames, level, goal, priorityMuscles = [], deemphasizedMuscles = []) {
  const plan = applyMusclePreferences(dayTemplate(dayName, index), dayName, index, priorityMuscles, deemphasizedMuscles);
  const used = [];
  return plan.map((slot) => {
    const exercise = findExercises({
      targetMuscles: slot.muscles,
      patterns: slot.patterns,
      equipment,
      excludeRiskTags,
      excludeNames,
      excludeIds: used,
      limit: 1
    })[0] || findExercises({ targetMuscles: slot.muscles, equipment, excludeRiskTags, excludeNames, excludeIds: used, limit: 1 })[0];
    if (exercise) used.push(exercise.id);

    return {
      exercise,
      sets: slot.sets,
      reps: repsFor(slot, level, goal),
      rest_sec: restFor(slot, goal)
    };
  }).filter((item) => item.exercise);
}

function inferExerciseFromName(name) {
  const text = normalizeExerciseText(name);
  if (!text) return null;

  if (text.includes("lat pulldown") || text.includes("lat pull down")) return syntheticExercise(name, "lats", ["biceps", "upper back"], "vertical_pull");
  if (text.includes("pulldown") || text.includes("pull down") || text.includes("pullup") || text.includes("pull up")) return syntheticExercise(name, "lats", ["biceps", "upper back"], "vertical_pull");
  if (text.includes("chest supported row") || text.includes("machine row") || text.includes("cable row") || text.includes("db row") || text.includes("dumbbell row") || text.includes("barbell row") || text.includes("row")) return syntheticExercise(name, "upper back", ["lats", "biceps"], "horizontal_pull");
  if (text.includes("incline bench") || text.includes("inc bench") || text.includes("incline press") || text.includes("bench press") || text.includes("chest press")) return syntheticExercise(name, "pectorals", ["triceps", "delts"], "horizontal_push");
  if (text.includes("pec deck") || text.includes("fly") || text.includes("cable crossover")) return syntheticExercise(name, "pectorals", [], "horizontal_push");
  if (text.includes("leg press")) return syntheticExercise(name, "quads", ["glutes", "hamstrings"], "squat_lunge");
  if (text.includes("leg extension") || text.includes("leg ext")) return syntheticExercise(name, "quads", [], "squat_lunge");
  if (text.includes("lunge") || text.includes("split squat")) return syntheticExercise(name, "quads", ["glutes", "hamstrings"], "squat_lunge");
  if (text.includes("leg curl")) return syntheticExercise(name, "hamstrings", [], "hinge");
  if (text.includes("rdl") || text.includes("romanian deadlift")) return syntheticExercise(name, "hamstrings", ["glutes", "lower back"], "hinge");
  if (text.includes("hip thrust") || text.includes("glute bridge")) return syntheticExercise(name, "glutes", ["hamstrings"], "hinge");
  if (text.includes("arnold press") || text.includes("shoulder press") || text.includes("overhead press")) return syntheticExercise(name, "delts", ["triceps"], "vertical_push");
  if (text.includes("lateral raise") || text.includes("lat raise") || text.includes("front raise")) return syntheticExercise(name, "delts", [], "accessory");
  if (text.includes("rear delt")) return syntheticExercise(name, "delts", ["upper back"], "horizontal_pull");
  if (text.includes("triceps") || text.includes("pushdown") || text.includes("push down") || text.includes("kickback") || text.includes("skullcrusher")) return syntheticExercise(name, "triceps", [], "elbow_extension");
  if (text.includes("preacher curl") || text.includes("scott curl") || text.includes("hammer curl") || text.includes("curl")) return syntheticExercise(name, "biceps", [], "elbow_flexion");
  if (text.includes("calf")) return syntheticExercise(name, "calves", [], "calf_raise");
  if (text.includes("plank") || text.includes("crunch") || text.includes("leg raise")) return syntheticExercise(name, "abs", [], "core");

  return null;
}

function syntheticExercise(name, target, secondaryMuscles, movementPattern) {
  return {
    id: `manual:${normalizeExerciseText(name).replaceAll(" ", "_")}`,
    name,
    target,
    secondary_muscles: secondaryMuscles,
    movement_pattern: movementPattern,
    exercise_type: secondaryMuscles.length ? "compound" : "isolation",
    risk_tags: [],
    avoid_if: []
  };
}

function dayTemplate(dayName, index) {
  if (dayName.startsWith("Upper")) {
    return [
      slot(["chest"], ["horizontal_push"], 3),
      slot(["back"], ["horizontal_pull"], 3),
      slot(["shoulders"], ["vertical_push"], 3),
      slot(["back"], ["vertical_pull"], 3),
      slot(["biceps"], ["elbow_flexion"], 2),
      slot(["triceps"], ["elbow_extension"], 2)
    ];
  }
  if (dayName.startsWith("Lower") || dayName.startsWith("Legs")) {
    return [
      slot(["quads"], ["squat_lunge"], 3),
      slot(["hamstrings", "glutes"], ["hinge"], 3),
      slot(["quads"], ["squat_lunge"], 2),
      slot(["hamstrings"], ["hinge"], 2),
      slot(["abs"], ["core"], 2)
    ];
  }
  if (dayName.startsWith("Push")) {
    return [slot(["chest"], ["horizontal_push"], 3), slot(["shoulders"], ["vertical_push"], 3), slot(["chest"], ["horizontal_push"], 2), slot(["triceps"], ["elbow_extension"], 3)];
  }
  if (dayName.startsWith("Pull")) {
    return [slot(["back"], ["vertical_pull"], 3), slot(["back"], ["horizontal_pull"], 3), slot(["shoulders"], ["horizontal_pull"], 2), slot(["biceps"], ["elbow_flexion"], 3)];
  }
  const rotated = index % 3;
  return [
    slot(["quads"], ["squat_lunge"], 3),
    slot(["chest"], ["horizontal_push"], 3),
    slot(["back"], rotated === 1 ? ["vertical_pull"] : ["horizontal_pull"], 3),
    slot(["hamstrings", "glutes"], ["hinge"], 2),
    slot(["shoulders"], ["vertical_push"], 2),
    slot(["abs"], ["core"], 2)
  ];
}

function applyMusclePreferences(plan, dayName, dayIndex, priorityMuscles, deemphasizedMuscles) {
  const adjusted = plan.map((item) => {
    const hasDeemphasized = item.muscles.some((muscle) => deemphasizedMuscles.includes(muscle));
    return hasDeemphasized ? { ...item, sets: Math.max(2, item.sets - 1) } : item;
  });

  if (!priorityMuscles.length) return adjusted;

  const muscle = priorityMuscles[dayIndex % priorityMuscles.length];
  if (!isMuscleCompatibleWithDay(muscle, dayName)) return adjusted;
  if (!muscle || adjusted.some((item) => item.muscles.includes(muscle) && item.sets >= 3)) return adjusted;

  adjusted.push(slot([muscle], [], 2));
  return adjusted;
}

function isMuscleCompatibleWithDay(muscle, dayName) {
  const upper = ["chest", "back", "shoulders", "biceps", "triceps"];
  const lower = ["quads", "hamstrings", "glutes", "calves"];
  if (dayName.startsWith("Upper") || dayName.startsWith("Push") || dayName.startsWith("Pull")) return !lower.includes(muscle);
  if (dayName.startsWith("Lower") || dayName.startsWith("Legs")) return !upper.includes(muscle);
  return true;
}

function slot(muscles, patterns, sets) {
  return { muscles, patterns, sets, rest_sec: sets >= 3 ? 120 : 75 };
}

function estimateDayDuration(day) {
  const totalSeconds = (day.exercises || []).reduce((sum, item) => {
    const sets = Number(item.sets || 0);
    const rest = Number(item.rest_sec || (sets >= 3 ? 120 : 75));
    const work = sets * 45;
    const rests = Math.max(0, sets - 1) * rest;
    const transition = 90;
    return sum + work + rests + transition;
  }, 8 * 60);

  return Math.round(totalSeconds / 60);
}

function trimDayToDuration(day, maxMinutes, priorityMuscles) {
  day.estimated_duration_min = estimateDayDuration(day);
  while (day.estimated_duration_min > maxMinutes + 5 && day.exercises.length > 4) {
    const removableIndex = findRemovableExerciseIndex(day, priorityMuscles);
    if (removableIndex === -1) break;
    const item = day.exercises[removableIndex];
    if (item.sets > 2) item.sets -= 1;
    else day.exercises.splice(removableIndex, 1);
    day.estimated_duration_min = estimateDayDuration(day);
  }
}

function findRemovableExerciseIndex(day, priorityMuscles) {
  for (let index = day.exercises.length - 1; index >= 0; index -= 1) {
    const item = day.exercises[index];
    const target = canonicalMuscle(item.exercise?.target);
    if (!priorityMuscles.includes(target) && item.exercise?.exercise_type !== "compound") return index;
  }
  for (let index = day.exercises.length - 1; index >= 0; index -= 1) {
    const item = day.exercises[index];
    const target = canonicalMuscle(item.exercise?.target);
    if (!priorityMuscles.includes(target)) return index;
  }
  return -1;
}

function adjustedMinSets(base, muscle, program) {
  if ((program.priority_muscles || []).includes(muscle)) return base + 2;
  if ((program.deemphasized_muscles || []).includes(muscle)) return Math.max(4, base - 2);
  if (program.goal === "strength" && ["chest", "back", "quads", "hamstrings", "glutes"].includes(muscle)) return Math.max(6, base - 2);
  if (program.goal === "fat_loss") return Math.max(4, base - 2);
  return base;
}

function repsFor(slot, level, goal) {
  if (slot.patterns.includes("core")) return "10-15";
  if (goal === "strength" && slot.sets >= 3) return "3-6";
  if (goal === "fat_loss") return "10-15";
  if (level === "beginner") return "10-12";
  return slot.sets >= 3 ? "6-10" : "10-15";
}

function restFor(slot, goal) {
  if (goal === "strength" && slot.sets >= 3) return 180;
  if (goal === "fat_loss") return 60;
  return slot.rest_sec;
}

function riskTagsFromProfile(profile) {
  const text = normalizeTurkishText([...(profile.injuries || []), ...(profile.excluded_exercises || [])].join(" "));
  const tags = [];
  if (text.includes("bel") || text.includes("back") || text.includes("sirt") || text.includes("lomber")) tags.push("lower_back_load");
  if (text.includes("diz") || text.includes("knee")) tags.push("knee_load");
  if (text.includes("omuz") || text.includes("shoulder")) tags.push("shoulder_stress");
  return tags;
}

function normalizeTurkishText(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replaceAll("ı", "i");
}

function normalizeExerciseText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\bbb\b/g, "barbell")
    .replace(/\bdb\b/g, "dumbbell")
    .replace(/\binc\b/g, "incline")
    .replace(/\s+/g, " ")
    .trim();
}

function addVolume(map, muscle, sets) {
  if (!muscle) return;
  map[muscle] = (map[muscle] || 0) + sets;
}

function addDay(map, muscle, day) {
  if (!muscle) return;
  if (!map[muscle]) map[muscle] = new Set();
  map[muscle].add(day);
}

function addRepeatedDays(map, muscle, day, count) {
  for (let index = 0; index < count; index += 1) {
    addDay(map, muscle, `${day}#${index + 1}`);
  }
}

function canonicalMuscle(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("pector") || text.includes("chest")) return "chest";
  if (text.includes("lat") || text.includes("back") || text.includes("trap")) return "back";
  if (text.includes("quad")) return "quads";
  if (text.includes("hamstring")) return "hamstrings";
  if (text.includes("glute")) return "glutes";
  if (text.includes("delt") || text.includes("shoulder")) return "shoulders";
  if (text.includes("bicep")) return "biceps";
  if (text.includes("tricep")) return "triceps";
  if (text.includes("abs") || text.includes("waist")) return "abs";
  return text || "other";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}
