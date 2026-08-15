export function createLlmProvider({
  enabled = false,
  baseUrl = "https://api.openai.com/v1",
  apiKey = "",
  model = "",
  apiStyle = "responses",
  maxOutputTokens = 900,
  timeoutMs = 60000,
  fetchImpl = fetch
} = {}) {
  const normalizedBaseUrl = String(baseUrl).replace(/\/+$/, "");

  return {
    async generateText({ systemPrompt, userText }) {
      if (!enabled) return null;
      if (!model) throw new Error("LLM model is required when the provider is enabled.");

      const isChatCompletions = apiStyle === "chat_completions";
      if (!isChatCompletions && apiStyle !== "responses") {
        throw new Error(`Unsupported LLM_API_STYLE: ${apiStyle}`);
      }

      const response = await fetchImpl(`${normalizedBaseUrl}/${isChatCompletions ? "chat/completions" : "responses"}`, {
        method: "POST",
        headers: {
          ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(isChatCompletions
          ? {
              model,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userText }
              ],
              max_tokens: maxOutputTokens
            }
          : {
              model,
              input: [
                { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
                { role: "user", content: [{ type: "input_text", text: userText }] }
              ],
              max_output_tokens: maxOutputTokens
            }),
        signal: timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined
      });

      if (!response.ok) throw new Error(`LLM request failed with status ${response.status}.`);
      const data = await response.json();
      return isChatCompletions ? extractChatCompletionsText(data) : extractResponsesText(data);
    },

    async runAgent({ systemPrompt, userText, tools = [], executeTool, maxToolRounds = 6 }) {
      if (!enabled) return null;
      if (!model) throw new Error("LLM model is required when the provider is enabled.");
      if (typeof executeTool !== "function") throw new Error("Agent tool executor is required.");
      if (apiStyle === "responses") {
        return runResponsesAgent({
          normalizedBaseUrl,
          apiKey,
          model,
          maxOutputTokens,
          timeoutMs,
          fetchImpl,
          systemPrompt,
          userText,
          tools,
          executeTool,
          maxToolRounds
        });
      }
      if (apiStyle === "chat_completions") {
        return runChatCompletionsAgent({
          normalizedBaseUrl,
          apiKey,
          model,
          maxOutputTokens,
          timeoutMs,
          fetchImpl,
          systemPrompt,
          userText,
          tools,
          executeTool,
          maxToolRounds
        });
      }
      throw new Error(`Unsupported LLM_API_STYLE: ${apiStyle}`);
    }
  };
}

async function runResponsesAgent({ normalizedBaseUrl, apiKey, model, maxOutputTokens, timeoutMs, fetchImpl, systemPrompt, userText, tools, executeTool, maxToolRounds }) {
  const input = [
    { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
    { role: "user", content: [{ type: "input_text", text: userText }] }
  ];
  const toolCalls = [];

  for (let round = 0; round <= maxToolRounds; round += 1) {
    const data = await requestJson({
      url: `${normalizedBaseUrl}/responses`,
      apiKey,
      timeoutMs,
      fetchImpl,
      body: { model, input, tools, tool_choice: "auto", max_output_tokens: maxOutputTokens }
    });
    const calls = (data.output || []).filter((item) => item.type === "function_call");
    if (!calls.length) return { text: extractResponsesText(data), toolCalls };
    if (round === maxToolRounds) throw new Error("Agent exceeded the tool-call round limit.");

    input.push(...(data.output || []));
    for (const call of calls) {
      const args = parseToolArguments(call.arguments);
      const result = await executeTool(call.name, args);
      toolCalls.push({ name: call.name, arguments: args, result });
      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result)
      });
    }
  }

  return { text: null, toolCalls };
}

async function runChatCompletionsAgent({ normalizedBaseUrl, apiKey, model, maxOutputTokens, timeoutMs, fetchImpl, systemPrompt, userText, tools, executeTool, maxToolRounds }) {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userText }
  ];
  const toolCalls = [];

  for (let round = 0; round <= maxToolRounds; round += 1) {
    const data = await requestJson({
      url: `${normalizedBaseUrl}/chat/completions`,
      apiKey,
      timeoutMs,
      fetchImpl,
      body: { model, messages, tools: tools.map(toChatCompletionsTool), tool_choice: "auto", max_tokens: maxOutputTokens }
    });
    const message = data.choices?.[0]?.message || {};
    const calls = (message.tool_calls || []).filter((item) => item.type === "function");
    if (!calls.length) return { text: String(message.content || "").trim() || null, toolCalls };
    if (round === maxToolRounds) throw new Error("Agent exceeded the tool-call round limit.");

    messages.push(message);
    for (const call of calls) {
      const args = parseToolArguments(call.function?.arguments);
      const result = await executeTool(call.function?.name, args);
      toolCalls.push({ name: call.function?.name, arguments: args, result });
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  return { text: null, toolCalls };
}

async function requestJson({ url, apiKey, timeoutMs, fetchImpl, body }) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    signal: timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined
  });
  if (!response.ok) throw new Error(`LLM request failed with status ${response.status}.`);
  return response.json();
}

function parseToolArguments(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toChatCompletionsTool(tool) {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  };
}

function extractResponsesText(data) {
  if (data.output_text) return data.output_text.trim();
  const chunks = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim() || null;
}

function extractChatCompletionsText(data) {
  return String(data.choices?.[0]?.message?.content || "").trim() || null;
}
