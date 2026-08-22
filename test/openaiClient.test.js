import test from "node:test";
import assert from "node:assert/strict";
import { buildCoachContext, coachAgentReplyWithMetadata, coachReply, coachReplyWithMetadata } from "../src/openaiClient.js";

test("coach requests include only knowledge relevant to the user's message", () => {
  const context = buildCoachContext({
    userMessage: "5/3/1 ile PPL ayni sey mi?",
    profile: null,
    memorySummary: ""
  });

  assert.deepEqual(context.knowledge_context.items.map((item) => item.id), ["program.five_three_one", "split.push_pull_legs"]);
  assert.ok(context.knowledge_context.claims.some((claim) => claim.id === "claim.five_three_one.require_schedule"));
});

test("coach requests leave the knowledge context empty for unrelated messages", () => {
  const context = buildCoachContext({ userMessage: "Selam", profile: null, memorySummary: "" });

  assert.deepEqual(context.knowledge_context, { items: [], claims: [] });
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

test("the coach sends the conversation as turns and the rest as one-shot context", async () => {
  let request;
  await coachReplyWithMetadata({
    userMessage: "peki bunu 4 gune cikaralim mi",
    profile: { goal: "hypertrophy" },
    memorySummary: "Uc gundur calisiyor.",
    conversationHistory: [
      { role: "user", content: "Bu programi 3 gundur uyguluyorum" },
      { role: "assistant", content: "Programini okudum." }
    ],
    fallbackText: "Fallback"
  }, {
    generateText: async (input) => {
      request = input;
      return "Model cevabi";
    }
  });

  assert.equal(request.userText, "peki bunu 4 gune cikaralim mi");
  assert.deepEqual(request.history, [
    { role: "user", content: "Bu programi 3 gundur uyguluyorum" },
    { role: "assistant", content: "Programini okudum." }
  ]);

  const context = JSON.parse(request.context);
  assert.deepEqual(context.profile, { goal: "hypertrophy" });
  assert.equal(context.memory_summary, "Uc gundur calisiyor.");
  assert.ok(context.knowledge_context);
  assert.equal(Object.hasOwn(context, "conversation_history"), false);
  assert.equal(Object.hasOwn(context, "user_message"), false);
});

test("the agent sends the conversation as turns and drafts as one-shot context", async () => {
  let request;
  await coachAgentReplyWithMetadata({
    userMessage: "bana program hazirla",
    profile: null,
    memorySummary: "",
    conversationHistory: [{ role: "assistant", content: "Ne var aklinda?" }],
    activeDrafts: [{ kind: "training_program", missing_fields: ["goal"] }],
    fallbackText: "Fallback",
    tools: [],
    executeTool: async () => ({})
  }, {
    runAgent: async (input) => {
      request = input;
      return { text: "Hedefin ne?", toolCalls: [] };
    }
  });

  assert.equal(request.userText, "bana program hazirla");
  assert.deepEqual(request.history, [{ role: "assistant", content: "Ne var aklinda?" }]);

  const context = JSON.parse(request.context);
  assert.deepEqual(context.active_drafts, [{ kind: "training_program", missing_fields: ["goal"] }]);
  assert.equal(Object.hasOwn(context, "conversation_history"), false);
});
