import test from "node:test";
import assert from "node:assert/strict";
import { buildCoachRequestPayload, coachReply, coachReplyWithMetadata } from "../src/openaiClient.js";

test("coach requests include only knowledge relevant to the user's message", () => {
  const payload = buildCoachRequestPayload({
    userMessage: "5/3/1 ile PPL ayni sey mi?",
    profile: null,
    memorySummary: "",
    conversationHistory: []
  });

  assert.deepEqual(payload.knowledge_context.items.map((item) => item.id), ["program.five_three_one", "split.push_pull_legs"]);
  assert.ok(payload.knowledge_context.claims.some((claim) => claim.id === "claim.five_three_one.require_schedule"));
});

test("coach requests leave the knowledge context empty for unrelated messages", () => {
  const payload = buildCoachRequestPayload({ userMessage: "Selam", profile: null, memorySummary: "" });

  assert.deepEqual(payload.knowledge_context, { items: [], claims: [] });
});

test("coach metadata reports knowledge references only when the model answers", async () => {
  const input = {
    userMessage: "PPL mi full body mi?",
    profile: null,
    memorySummary: "",
    fallbackText: "Fallback"
  };
  const modelResult = await coachReplyWithMetadata(input, {
    generateText: async () => "Model cevabi"
  });

  assert.equal(modelResult.text, "Model cevabi");
  assert.equal(modelResult.usedModel, true);
  assert.ok(modelResult.contextClaimIds.includes("claim.split.volume_equated_equivalence"));
  assert.ok(modelResult.contextSourceIds.includes("source.split_meta_2024"));

  const authorityResult = await coachReplyWithMetadata({ ...input, userMessage: "Basketbol kurallari" }, {
    generateText: async () => "Model cevabi"
  });
  assert.ok(authorityResult.contextSourceIds.includes("source.fiba_rules_2024"));

  const fallbackResult = await coachReplyWithMetadata(input, {
    generateText: async () => { throw new Error("provider unavailable"); }
  });
  assert.deepEqual(fallbackResult, {
    text: "Fallback",
    usedModel: false,
    contextClaimIds: [],
    contextSourceIds: []
  });
});

test("coach metadata falls back when knowledge retrieval fails", async () => {
  const result = await coachReplyWithMetadata({
    userMessage: { toString: () => { throw new Error("knowledge unavailable"); } },
    profile: null,
    memorySummary: "",
    fallbackText: "Fallback"
  }, {
    generateText: async () => "Model cevabi"
  });

  assert.deepEqual(result, {
    text: "Fallback",
    usedModel: false,
    contextClaimIds: [],
    contextSourceIds: []
  });
});

test("coachReply keeps its text-only response contract", async () => {
  const text = await coachReply({
    userMessage: "PPL nedir?",
    profile: null,
    memorySummary: "",
    fallbackText: "Fallback"
  }, {
    generateText: async () => "Model cevabi"
  });

  assert.equal(text, "Model cevabi");
});
