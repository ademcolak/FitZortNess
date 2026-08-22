import { config } from "./config.js";
import { createLlmProvider } from "./llmProvider.js";
import { retrieveKnowledge } from "./knowledgeBase.js";
import { buildCoachSystemPrompt } from "./persona.js";

const coachProvider = createLlmProvider({
  enabled: config.llmEnabled,
  baseUrl: config.llmBaseUrl,
  apiKey: config.llmApiKey,
  model: config.llmModel,
  apiStyle: config.llmApiStyle,
  maxOutputTokens: config.maxOutputTokens,
  timeoutMs: config.llmRequestTimeoutMs
});

export async function coachReply(input, provider = coachProvider) {
  return (await coachReplyWithMetadata(input, provider)).text;
}

export async function coachAgentReplyWithMetadata({ userMessage, profile, memorySummary, conversationHistory = [], activeDrafts = [], fallbackText, tools, executeTool }, provider = coachProvider) {
  try {
    const context = buildCoachContext({ userMessage, profile, memorySummary, activeDrafts });
    const result = await provider.runAgent({
      systemPrompt: buildCoachSystemPrompt(config.botPersona, "agent"),
      context: JSON.stringify(context),
      history: conversationHistory,
      userText: userMessage,
      tools,
      executeTool
    });
    if (!result?.text) return { text: fallbackText, usedModel: false, toolCalls: result?.toolCalls || [], contextClaimIds: [], contextSourceIds: [] };
    const { contextClaimIds, contextSourceIds } = knowledgeReferences(context);
    return { text: result.text, usedModel: true, toolCalls: result.toolCalls, contextClaimIds, contextSourceIds };
  } catch (error) {
    return { text: fallbackText, usedModel: false, toolCalls: [], contextClaimIds: [], contextSourceIds: [], error };
  }
}

export async function coachReplyWithMetadata({ userMessage, profile, memorySummary, conversationHistory = [], engineResult = null, fallbackText, responseMode = "conversation" }, provider = coachProvider) {
  try {
    const context = buildCoachContext({ userMessage, profile, memorySummary, engineResult });
    const text = await provider.generateText({
      systemPrompt: buildCoachSystemPrompt(config.botPersona, responseMode),
      context: JSON.stringify(context),
      history: conversationHistory,
      userText: userMessage
    });
    if (!text) return { text: fallbackText, usedModel: false, contextClaimIds: [], contextSourceIds: [] };
    const { contextClaimIds, contextSourceIds } = knowledgeReferences(context);
    return { text, usedModel: true, contextClaimIds, contextSourceIds };
  } catch {
    return { text: fallbackText, usedModel: false, contextClaimIds: [], contextSourceIds: [] };
  }
}

export function buildCoachContext({ userMessage, profile, memorySummary, engineResult = null, activeDrafts = [] }) {
  return {
    profile,
    memory_summary: memorySummary,
    active_drafts: activeDrafts,
    engine_result: engineResult,
    knowledge_context: retrieveKnowledge(userMessage)
  };
}

function knowledgeReferences({ knowledge_context: knowledge }) {
  return {
    contextClaimIds: knowledge.claims.map((claim) => claim.id),
    contextSourceIds: [...new Set([
      ...knowledge.claims.flatMap((claim) => claim.sources.map((source) => source.id)),
      ...knowledge.items.flatMap((item) => item.authoritySources.map((source) => source.id))
    ])]
  };
}

export async function evaluateConversationSession({ transcript, metrics, deterministic }) {
  const text = await coachProvider.generateText({
    systemPrompt: [
      "Bir fitness chatbot oturumunu urun kalitesi acisindan degerlendir.",
      "Deterministik metrikleri degistirme veya yeniden puanlama.",
      "Sadece JSON don: {\"summary\":\"\"}.",
      "Kisa, olgusal ve Turkce bir ozet yaz. Markdown kullanma."
    ].join(" "),
    userText: JSON.stringify({ transcript, metrics, deterministic })
  });
  return text ? parseJsonObject(text) : null;
}

export async function extractWorkoutFromImage({ imageBase64, mimeType }) {
  if (!config.openAiApiKey) {
    throw new Error("OPENAI_API_KEY is required for image workout analysis.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.openAiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.openAiModel,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "Goruntudeki antrenman programini oku.",
                "Sadece JSON don. Markdown kullanma.",
                "Tablo gunlere veya kolonlara bolunmusse bu gun/kolon yapisini koru.",
                "Egzersiz satirlarini day, name, sets, reps olarak cikar.",
                "Kardiyo/isinma satirlarini cardio alanina koy.",
                "OFF, dinlenme ve bos tekrar kolonlarini egzersiz sayma.",
                "Okuyamadigin veya emin olmadigin satirlari uncertain alanina koy.",
                "Sadece Turkce veya egzersiz adlarinda gorunen orijinal Ingilizce isimleri kullan."
              ].join(" ")
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Bu gorseldeki antrenman programini su semaya gore JSON'a cevir: {\"days\":[{\"name\":\"\",\"items\":[{\"name\":\"\",\"sets\":0,\"reps\":\"\"}],\"cardio\":[{\"name\":\"\",\"duration_min\":\"\"}]}],\"items\":[{\"day\":\"\",\"name\":\"\",\"sets\":0,\"reps\":\"\"}],\"cardio\":[{\"day\":\"\",\"name\":\"\",\"duration_min\":\"\"}],\"uncertain\":[\"\"]}"
            },
            {
              type: "input_image",
              image_url: `data:${mimeType};base64,${imageBase64}`
            }
          ]
        }
      ],
      max_output_tokens: Math.min(config.maxOutputTokens, 700)
    }),
    signal: AbortSignal.timeout(config.llmRequestTimeoutMs)
  });

  if (!response.ok) {
    throw new Error(`OpenAI image extraction failed: ${response.status} ${(await response.text()).slice(0, 220)}`);
  }

  const text = extractText(await response.json());
  return parseJsonObject(text);
}

function extractText(data) {
  if (data.output_text) return data.output_text.trim();
  const chunks = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

function parseJsonObject(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Vision response did not contain JSON.");
    return JSON.parse(match[0]);
  }
}
