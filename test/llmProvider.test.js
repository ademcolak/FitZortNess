import test from "node:test";
import assert from "node:assert/strict";
import { createLlmProvider } from "../src/llmProvider.js";

test("disabled provider returns no model response without making a request", async () => {
  let called = false;
  const provider = createLlmProvider({
    enabled: false,
    fetchImpl: async () => {
      called = true;
    }
  });

  assert.equal(await provider.generateText({ systemPrompt: "sistem", userText: "mesaj" }), null);
  assert.equal(called, false);
});

test("responses adapter extracts response text", async () => {
  let request;
  const provider = createLlmProvider({
    enabled: true,
    baseUrl: "https://example.test/v1/",
    apiKey: "test-key",
    model: "test-model",
    apiStyle: "responses",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ output_text: "Hazır cevap" }) };
    }
  });

  assert.equal(await provider.generateText({ systemPrompt: "sistem", userText: "mesaj" }), "Hazır cevap");
  assert.equal(request.url, "https://example.test/v1/responses");
});

test("chat completions adapter supports an OpenAI-compatible local endpoint", async () => {
  let requestUrl;
  const provider = createLlmProvider({
    enabled: true,
    baseUrl: "http://localhost:11434/v1",
    model: "local-model",
    apiStyle: "chat_completions",
    fetchImpl: async (url) => {
      requestUrl = url;
      return { ok: true, json: async () => ({ choices: [{ message: { content: "Yerel cevap" } }] }) };
    }
  });

  assert.equal(await provider.generateText({ systemPrompt: "sistem", userText: "mesaj" }), "Yerel cevap");
  assert.equal(requestUrl, "http://localhost:11434/v1/chat/completions");
});

test("responses agent executes a tool and returns the model's final reply", async () => {
  const requests = [];
  const provider = createLlmProvider({
    enabled: true,
    baseUrl: "https://example.test/v1",
    apiKey: "test-key",
    model: "test-model",
    apiStyle: "responses",
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      if (requests.length === 1) {
        return {
          ok: true,
          json: async () => ({
            output: [{ type: "function_call", call_id: "call_1", name: "prepare_training_program", arguments: "{\"days_per_week\":3}" }]
          })
        };
      }
      return { ok: true, json: async () => ({ output_text: "Haftada uc gunu not ettim. Hedefin ne?", output: [] }) };
    }
  });

  const executed = [];
  const result = await provider.runAgent({
    systemPrompt: "sistem",
    userText: "3",
    tools: [{ type: "function", name: "prepare_training_program", description: "test", parameters: { type: "object" } }],
    executeTool: async (name, args) => {
      executed.push({ name, args });
      return { status: "draft", missing_fields: ["goal"] };
    }
  });

  assert.equal(result.text, "Haftada uc gunu not ettim. Hedefin ne?");
  assert.deepEqual(executed, [{ name: "prepare_training_program", args: { days_per_week: 3 } }]);
  assert.ok(requests[1].input.some((item) => item.type === "function_call_output" && item.call_id === "call_1"));
});

test("chat completions agent translates tools and keeps the tool call in context", async () => {
  const requests = [];
  const provider = createLlmProvider({
    enabled: true,
    baseUrl: "http://localhost:11434/v1",
    model: "local-model",
    apiStyle: "chat_completions",
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      if (requests.length === 1) {
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "tool_1", type: "function", function: { name: "analyze_training_program", arguments: "{}" } }] } }] })
        };
      }
      return { ok: true, json: async () => ({ choices: [{ message: { role: "assistant", content: "Programini gonder, bakalim." } }] }) };
    }
  });

  const result = await provider.runAgent({
    systemPrompt: "sistem",
    userText: "programimi incele",
    tools: [{ type: "function", name: "analyze_training_program", description: "test", parameters: { type: "object" } }],
    executeTool: async () => ({ status: "draft", missing_fields: ["program_text"] })
  });

  assert.equal(result.text, "Programini gonder, bakalim.");
  assert.equal(requests[0].tools[0].function.name, "analyze_training_program");
  assert.ok(requests[1].messages.some((message) => message.role === "tool" && message.tool_call_id === "tool_1"));
});
