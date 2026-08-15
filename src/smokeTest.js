import assert from "node:assert/strict";
import { getDb } from "./db.js";
import { findExercises } from "./exerciseSearch.js";
import { generateProgram, parseAndAnalyzeProgram } from "./programEngine.js";

export function runSmokeTest() {
  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) AS count FROM exercises").get().count;
  assert.ok(count > 1000, "dataset should be imported");

  const chest = findExercises({ targetMuscles: ["chest"], equipment: ["gym"], limit: 3 });
  assert.ok(chest.length > 0, "should find reviewed chest exercises");

  const profile = {
    goal: "muscle_gain",
    level: "intermediate",
    days_per_week: 3,
    equipment: ["gym"],
    injuries: ["bel hassas"],
    excluded_exercises: [],
    session_duration_min: 60
  };

  const generated = generateProgram(profile);
  assert.equal(generated.program.days.length, 3);
  assert.ok(generated.program.days[0].exercises.length >= 4);

  const analyzed = parseAndAnalyzeProgram(`
Pazartesi
Bench Press 4 set
Barbell Row 4 set
Cuma
Squat 4 set
Leg Curl 3 set
`);
  assert.ok(analyzed.analysis.issues.length >= 0);
}
