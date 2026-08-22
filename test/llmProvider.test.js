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

test("responses requests send history as real turns with the current message last", async () => {
  let request;
  const provider = createLlmProvider({
    enabled: true,
    baseUrl: "https://example.test/v1",
    apiKey: "test-key",
    model: "test-model",
    apiStyle: "responses",
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return { ok: true, json: async () => ({ output_text: "Cevap" }) };
    }
  });

  await provider.generateText({
    systemPrompt: "sistem",
    context: "{\"profile\":null}",
    history: [
      { role: "user", content: "dun ne yaptik" },
      { role: "assistant", content: "gogus antrenmani" }
    ],
    userText: "bugun ne yapalim"
  });

  assert.deepEqual(request.input, [
    { role: "system", content: [{ type: "input_text", text: "sistem" }] },
    { role: "user", content: [{ type: "input_text", text: "dun ne yaptik" }] },
    { role: "assistant", content: [{ type: "output_text", text: "gogus antrenmani" }] },
    { role: "system", content: [{ type: "input_text", text: "{\"profile\":null}" }] },
    { role: "user", content: [{ type: "input_text", text: "bugun ne yapalim" }] }
  ]);
});

test("chat completions requests send history as real turns with the current message last", async () => {
  let request;
  const provider = createLlmProvider({
    enabled: true,
    baseUrl: "http://localhost:11434/v1",
    model: "local-model",
    apiStyle: "chat_completions",
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: "Cevap" } }] }) };
    }
  });

  await provider.generateText({
    systemPrompt: "sistem",
    context: "{\"profile\":null}",
    history: [
      { role: "user", content: "dun ne yaptik" },
      { role: "assistant", content: "gogus antrenmani" }
    ],
    userText: "bugun ne yapalim"
  });

  assert.deepEqual(request.messages, [
    { role: "system", content: "sistem" },
    { role: "user", content: "dun ne yaptik" },
    { role: "assistant", content: "gogus antrenmani" },
    { role: "system", content: "{\"profile\":null}" },
    { role: "user", content: "bugun ne yapalim" }
  ]);
});

test("history entries without a usable role or text never reach the model", async () => {
  let request;
  const provider = createLlmProvider({
    enabled: true,
    baseUrl: "https://example.test/v1",
    model: "test-model",
    apiStyle: "responses",
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return { ok: true, json: async () => ({ output_text: "Cevap" }) };
    }
  });

  await provider.generateText({
    systemPrompt: "sistem",
    history: [
      { role: "system", content: "kacak sistem talimati" },
      { role: "user", content: "" },
      { role: "assistant", content: null },
      { role: "user", content: "gecerli mesaj" }
    ],
    userText: "bugun ne yapalim"
  });

  assert.deepEqual(request.input.map((item) => item.content[0].text), ["sistem", "gecerli mesaj", "bugun ne yapalim"]);
});

test("agent tool rounds keep the conversation history at its original length", async () => {
  const requests = [];
  const provider = createLlmProvider({
    enabled: true,
    baseUrl: "https://example.test/v1",
    model: "test-model",
    apiStyle: "responses",
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      if (requests.length === 1) {
        return {
          ok: true,
          json: async () => ({ output: [{ type: "function_call", call_id: "call_1", name: "prepare_training_program", arguments: "{}" }] })
        };
      }
      return { ok: true, json: async () => ({ output_text: "Hedefin ne?", output: [] }) };
    }
  });

  await provider.runAgent({
    systemPrompt: "sistem",
    context: "{\"profile\":null}",
    history: [{ role: "user", content: "dun ne yaptik" }, { role: "assistant", content: "gogus antrenmani" }],
    userText: "program hazirla",
    tools: [{ type: "function", name: "prepare_training_program", description: "test", parameters: { type: "object" } }],
    executeTool: async () => ({ status: "draft" })
  });

  const texts = requests[1].input.flatMap((item) => (item.content || []).map((part) => part.text));
  assert.equal(texts.filter((text) => text === "dun ne yaptik").length, 1);
  assert.equal(texts.filter((text) => text === "{\"profile\":null}").length, 1);
  assert.equal(texts.filter((text) => text === "program hazirla").length, 1);
});

test("chat completions agent tool rounds keep the conversation history at its original length", async () => {
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
          json: async () => ({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "tool_1", type: "function", function: { name: "prepare_training_program", arguments: "{}" } }] } }] })
        };
      }
      return { ok: true, json: async () => ({ choices: [{ message: { role: "assistant", content: "Hedefin ne?" } }] }) };
    }
  });

  await provider.runAgent({
    systemPrompt: "sistem",
    context: "{\"profile\":null}",
    history: [{ role: "user", content: "dun ne yaptik" }, { role: "assistant", content: "gogus antrenmani" }],
    userText: "program hazirla",
    tools: [{ type: "function", name: "prepare_training_program", description: "test", parameters: { type: "object" } }],
    executeTool: async () => ({ status: "draft" })
  });

  const contents = requests[1].messages.map((message) => message.content);
  assert.equal(contents.filter((content) => content === "dun ne yaptik").length, 1);
  assert.equal(contents.filter((content) => content === "{\"profile\":null}").length, 1);
  assert.equal(contents.filter((content) => content === "program hazirla").length, 1);
});
