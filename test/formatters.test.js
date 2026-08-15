import test from "node:test";
import assert from "node:assert/strict";
import { formatAnalysis } from "../src/formatters.js";

test("program analysis fallback reports only the four most important issues", () => {
  const text = formatAnalysis({
    analysis: {
      issues: ["chest", "back", "quads", "hamstrings", "shoulders"].map((muscle) => ({
        muscle,
        type: "low_volume",
        current: 3,
        recommended_min: 8
      }))
    },
    program: { days: [{ exercises: [{ exercise: { name: "Bench Press" }, sets: 4 }] }] }
  });

  assert.doesNotMatch(text, /Algilanan hareketler/i);
  assert.equal(text.split("\n").filter((line) => line.startsWith("- ")).length, 4);
});
