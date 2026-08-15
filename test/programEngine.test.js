import test from "node:test";
import assert from "node:assert/strict";
import { generateProgram, parseAndAnalyzeExtractedWorkout, parseAndAnalyzeProgram } from "../src/programEngine.js";

test("program analysis uses the user's training level", () => {
  const result = parseAndAnalyzeProgram("Bench Press 4 set x 8", { level: "beginner" });
  assert.equal(result.program.level, "beginner");
});

test("a single workout template is counted for each weekly repetition", () => {
  const result = parseAndAnalyzeProgram("Bench Press 4x8", { analysis_days_per_week: 3 });

  assert.equal(result.program.days_per_week, 3);
  assert.equal(result.analysis.muscle_sets.chest, 12);
  assert.equal(result.analysis.muscle_frequency.chest, 3);
});

test("explicit workout days are not multiplied by the profile frequency", () => {
  const result = parseAndAnalyzeProgram("Day 1\nBench Press 4x8\nDay 2\nBench Press 4x8", { days_per_week: 5 });

  assert.equal(result.analysis.muscle_sets.chest, 8);
  assert.equal(result.analysis.muscle_frequency.chest, 2);
});

test("common split names are parsed as separate workout days", () => {
  const result = parseAndAnalyzeProgram("Push\nBench Press 4x8\nPull\nLat Pulldown 4x10\nLegs\nLeg Press 4x10", { analysis_days_per_week: 3 });

  assert.equal(result.program.days.length, 3);
  assert.equal(result.analysis.muscle_sets.chest, 4);
  assert.equal(result.analysis.muscle_frequency.chest, 1);
});

test("a Turkish description of back pain excludes lower-back-loading exercises", () => {
  const profile = {
    goal: "muscle_gain",
    level: "intermediate",
    days_per_week: 4,
    equipment: ["gym"],
    injuries: ["sirtim agriyor"],
    excluded_exercises: [],
    session_duration_min: 60
  };

  const { program } = generateProgram(profile);
  const riskyExercise = program.days
    .flatMap((day) => day.exercises)
    .find((item) => (item.exercise?.risk_tags || []).includes("lower_back_load"));

  assert.equal(riskyExercise, undefined);
});

test("a single image workout uses the same weekly repetition input", () => {
  const result = parseAndAnalyzeExtractedWorkout({
    days: [{ name: "Program", items: [{ name: "Bench Press", sets: 4, reps: "8" }] }]
  }, { analysis_days_per_week: 3 });

  assert.equal(result.analysis.muscle_sets.chest, 12);
  assert.equal(result.analysis.muscle_frequency.chest, 3);
});
