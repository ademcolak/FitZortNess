import test from "node:test";
import assert from "node:assert/strict";
import { createWeeklySplit } from "../src/splitPlanner.js";

test("every supported split preference returns the requested number of unique days", () => {
  for (const days of [3, 4, 5]) {
    for (const preference of ["", "full body", "upper lower", "push pull legs"]) {
      const split = createWeeklySplit(days, preference);
      assert.equal(split.length, days, `${days} days with ${preference || "default"}`);
      assert.equal(new Set(split).size, days, `${days} days with ${preference || "default"} should be unique`);
    }
  }
});

test("five-day upper/lower preference remains an upper/lower schedule", () => {
  assert.deepEqual(createWeeklySplit(5, "upper lower"), ["Upper A", "Lower A", "Upper B", "Lower B", "Upper C"]);
});
