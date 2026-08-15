import test from "node:test";
import assert from "node:assert/strict";
import { isDestructiveAdminActionConfirmed, validateTrainingDaysAnswer } from "../src/inputValidation.js";

test("zero training days gets a playful correction without accepting the answer", () => {
  const result = validateTrainingDaysAnswer("0 gun", { context: "generator_training_days" });

  assert.equal(result.value, null);
  assert.match(result.reply, /takvim bize kapiyi/i);
  assert.match(result.reply, /3, 4 veya 5/);
});

test("valid training days accept digits and Turkish number words", () => {
  assert.deepEqual(validateTrainingDaysAnswer("3", { context: "generator_training_days" }), { value: 3, reply: null });
  assert.deepEqual(validateTrainingDaysAnswer("haftada uc gun", { context: "current_training_days" }), { value: 3, reply: null });
});

test("zero is valid when the bot asks about the user's current routine", () => {
  assert.deepEqual(validateTrainingDaysAnswer("0", { context: "current_training_days" }), { value: 0, reply: null });
});

test("plausible values outside the generator range are corrected without mocking", () => {
  const result = validateTrainingDaysAnswer("2", { context: "generator_training_days" });

  assert.equal(result.value, null);
  assert.match(result.reply, /gayet mumkun/i);
  assert.doesNotMatch(result.reply, /sacma|mantiksiz/i);
});

test("impossible week lengths get a small easter egg", () => {
  const result = validateTrainingDaysAnswer("8", { context: "available_training_days_for_plan" });

  assert.equal(result.value, null);
  assert.match(result.reply, /haftaya yeni gun/i);
});

test("repeated invalid answers get a neutral correction instead of repeating the joke", () => {
  const result = validateTrainingDaysAnswer("8", { context: "available_training_days_for_plan", humor: false });

  assert.equal(result.value, null);
  assert.doesNotMatch(result.reply, /😄|paket|dambil/i);
  assert.match(result.reply, /1 ile 7/);
});

test("destructive admin actions require the exact confirmation token", () => {
  assert.equal(isDestructiveAdminActionConfirmed("CONFIRM"), true);
  assert.equal(isDestructiveAdminActionConfirmed("confirm"), false);
  assert.equal(isDestructiveAdminActionConfirmed(""), false);
});
