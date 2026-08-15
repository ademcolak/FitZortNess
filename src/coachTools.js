import Ajv2020 from "ajv/dist/2020.js";
import { getDb, json, logInteraction, parseJson } from "./db.js";
import { formatAnalysis, formatProgram } from "./formatters.js";
import { validateTrainingDaysAnswer } from "./inputValidation.js";
import { requiresSportSpecificPlanning } from "./knowledgeBase.js";
import { normalizeMuscleGroupList } from "./exerciseSearch.js";
import { generateProgram, parseAndAnalyzeProgram } from "./programEngine.js";

const PROGRAM_FIELDS = [
  "goal",
  "level",
  "days_per_week",
  "equipment",
  "injuries",
  "priority_muscles",
  "deemphasized_muscles",
  "excluded_exercises",
  "preferred_split",
  "session_duration_min"
];

const REQUIRED_PROGRAM_FIELDS = ["goal", "level", "days_per_week", "equipment", "injuries"];
const MUSCLE_LIST_FIELDS = ["priority_muscles", "deemphasized_muscles"];

export const COACH_TOOLS = [
  {
    type: "function",
    name: "prepare_training_program",
    description: "Kullanici kendisi icin klasik direnc/gym programi olusturmak, yarim kalan program hazirligini surdurmek veya program tercihlerini guncellemek istediginde kullan. Genel program sorularinda veya bransa ozgu calisthenics, CrossFit, takim sporu, dayaniklilik ya da teknik beceri programlarinda kullanma. Yalnizca kullanicinin acikca verdigi alanlari doldur; tahmin etme. Eksik alanlar varsa arac bunlari doner. Kullanici program istediyse ve gerekli alanlar tamamsa generate=true gonder.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        goal: { type: ["string", "null"], enum: ["muscle_gain", "fat_loss", "strength", "general_fitness", null] },
        level: { type: ["string", "null"], enum: ["beginner", "intermediate", "advanced", null] },
        days_per_week: { type: ["integer", "null"], minimum: 0, maximum: 7 },
        equipment: { type: ["array", "null"], items: { type: "string" } },
        injuries: { type: ["array", "null"], items: { type: "string" } },
        priority_muscles: { type: ["array", "null"], items: { type: "string" } },
        deemphasized_muscles: { type: ["array", "null"], items: { type: "string" } },
        excluded_exercises: { type: ["array", "null"], items: { type: "string" } },
        preferred_split: { type: ["string", "null"] },
        session_duration_min: { type: ["integer", "null"], minimum: 20, maximum: 180 },
        generate: { type: "boolean" }
      }
    }
  },
  {
    type: "function",
    name: "analyze_training_program",
    description: "Kullanici mevcut antrenman programini analiz ettirmek istediginde kullan. Program metni onceki turda verildiyse yarim kalan taslaktan devam edebilir. Program hakkinda genel bir soru icin kullanma.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        program_text: { type: ["string", "null"] },
        days_per_week: { type: ["integer", "null"], minimum: 1, maximum: 7 }
      }
    }
  },
  {
    type: "function",
    name: "discard_training_draft",
    description: "Kullanici yarim kalan program olusturma veya program analizi isini acikca iptal etmek, silmek ya da bos vermek istediginde kullan. Konu degistirmeyi iptal sayma; taslak konu degisince zaten beklemede kalir.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: ["program_creation", "program_analysis"] }
      },
      required: ["kind"]
    }
  }
];

const toolArgumentValidators = compileToolArgumentValidators(COACH_TOOLS);

export function getActiveCoachDrafts(userId, database = getDb()) {
  return database.prepare(`
    SELECT kind, payload_json, updated_at
    FROM agent_drafts
    WHERE user_id = ? AND status = 'draft'
    ORDER BY updated_at DESC
  `).all(userId).map((row) => ({
    kind: row.kind,
    payload: parseJson(row.payload_json, {}),
    updated_at: row.updated_at
  }));
}

export function migrateLegacyConversationState(userId, database = getDb()) {
  const row = database.prepare("SELECT state, payload_json FROM user_state WHERE user_id = ?").get(userId);
  if (!row || row.state === "awaiting_image_program_days") return;
  const isLegacyProgramState = row.state.startsWith("onboarding_") || ["awaiting_program_analysis", "awaiting_program_days", "awaiting_feedback"].includes(row.state);
  if (!isLegacyProgramState) return;

  const payload = parseJson(row.payload_json, {});
  if (row.state.startsWith("onboarding_")) saveDraft(userId, "program_creation", payload, database);
  if (row.state === "awaiting_program_analysis") saveDraft(userId, "program_analysis", {}, database);
  if (row.state === "awaiting_program_days") {
    saveDraft(userId, "program_analysis", { program_text: payload.programText || "" }, database);
  }
  database.prepare("DELETE FROM user_state WHERE user_id = ?").run(userId);
}

export function createCoachToolExecutor(userId, { userMessage = "", database = getDb() } = {}) {
  return async (name, args = {}) => {
    const validateArguments = toolArgumentValidators.get(name);
    if (!validateArguments) return { status: "error", error: `Bilinmeyen arac: ${name}` };
    if (!args || typeof args !== "object" || Array.isArray(args) || !validateArguments(args)) {
      return { status: "error", error: "Gecersiz arac argumanlari." };
    }
    if (name === "prepare_training_program") return prepareTrainingProgram(userId, args, database, userMessage);
    if (name === "analyze_training_program") return analyzeTrainingProgram(userId, args, database);
    if (name === "discard_training_draft") return discardTrainingDraft(userId, args, database);
  };
}

function compileToolArgumentValidators(tools) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  return new Map(tools.map((tool) => [tool.name, ajv.compile(tool.parameters)]));
}

function discardTrainingDraft(userId, args, database) {
  if (!["program_creation", "program_analysis"].includes(args.kind)) {
    return { status: "error", error: "Gecersiz taslak turu." };
  }
  const result = database.prepare(`
    UPDATE agent_drafts SET status = 'abandoned', updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND kind = ? AND status = 'draft'
  `).run(userId, args.kind);
  return { status: result.changes ? "discarded" : "not_found", kind: args.kind };
}

function prepareTrainingProgram(userId, args, database, userMessage = "") {
  if (requiresSportSpecificPlanning(userMessage)) {
    return {
      status: "out_of_scope",
      reason: "sport_specific",
      instruction: "Bu istek bransa ozgu; klasik gym program aracini kullanma. Dal, hedef, deneyim, mevcut yuk ve saglik baglamini konusarak devam et."
    };
  }

  const currentDraft = getDraft(userId, "program_creation", database);
  const nextDraft = { ...currentDraft };
  let invalidDays = null;
  if (Object.hasOwn(args, "days_per_week") && args.days_per_week !== null) {
    const validation = validateTrainingDaysAnswer(String(args.days_per_week), { context: "generator_training_days" });
    if (validation.value === null) invalidDays = validation.reply;
  }
  for (const field of PROGRAM_FIELDS) {
    if (field === "days_per_week" && invalidDays) continue;
    if (!Object.hasOwn(args, field) || args[field] === null) continue;
    nextDraft[field] = MUSCLE_LIST_FIELDS.includes(field) ? normalizeMuscleGroupList(args[field]) : args[field];
  }
  if (invalidDays) {
    if (Object.keys(nextDraft).length) saveDraft(userId, "program_creation", nextDraft, database);
    return { status: "invalid", field: "days_per_week", message: invalidDays, collected: compactProgramContext(nextDraft) };
  }
  saveDraft(userId, "program_creation", nextDraft, database);

  const effective = mergeProgramContext(getProfileFromDatabase(userId, database), nextDraft);
  const missingFields = REQUIRED_PROGRAM_FIELDS.filter((field) => isMissing(effective[field]));
  if (!args.generate || missingFields.length) {
    return {
      status: missingFields.length ? "draft" : "ready",
      collected: compactProgramContext(effective),
      missing_fields: missingFields,
      instruction: missingFields.length
        ? "Kullanicinin son mesajina cevap verdikten sonra eksiklerden karari en cok etkileyen yalnizca birini dogal bicimde sor. Taslak sohbeti kilitlemez."
        : "Kullanici programi olusturmak istiyorsa araci generate=true ile yeniden cagir."
    };
  }

  saveProfile(userId, effective, database);
  const result = generateProgram(getProfileFromDatabase(userId, database));
  database.prepare("UPDATE workout_programs SET active = 0 WHERE user_id = ?").run(userId);
  database.prepare("INSERT INTO workout_programs (user_id, program_json, active) VALUES (?, ?, 1)").run(userId, JSON.stringify(result.program));
  completeDraft(userId, "program_creation", nextDraft, database);
  updateMemory(userId, `Kullanici icin ${result.program.days_per_week} gunluk ${effective.goal} odakli program olusturuldu. Kisitlar: ${(effective.injuries || []).join(", ") || "yok"}.`, database);
  logInteraction({ userId, eventType: "rule_engine", modelAction: "generate_program" }, database);

  return {
    status: "created",
    program_text: formatProgram(result.program, result.analysis),
    instruction: "Program metnini eksiksiz koru. Kisa ve dogal bir giris disinda yeni hareket veya kural ekleme."
  };
}

function analyzeTrainingProgram(userId, args, database) {
  const currentDraft = getDraft(userId, "program_analysis", database);
  const nextDraft = {
    ...currentDraft,
    ...(args.program_text ? { program_text: args.program_text } : {}),
    ...(args.days_per_week ? { days_per_week: args.days_per_week } : {})
  };
  saveDraft(userId, "program_analysis", nextDraft, database);

  if (!nextDraft.program_text) {
    return { status: "draft", missing_fields: ["program_text"], instruction: "Programi gunleri ve setleriyle dogal bicimde iste." };
  }

  const profile = { ...(getProfileFromDatabase(userId, database) || {}), analysis_days_per_week: nextDraft.days_per_week || null };
  const result = parseAndAnalyzeProgram(nextDraft.program_text, profile);
  if (result.program.days.length === 1 && !nextDraft.days_per_week) {
    return {
      status: "draft",
      missing_fields: ["days_per_week"],
      instruction: "Bu sablonun haftada kac kez uygulandigini tek bir dogal soruyla sor. Baska konuya gecilirse taslak korunur."
    };
  }

  completeDraft(userId, "program_analysis", nextDraft, database);
  logInteraction({ userId, eventType: "rule_engine", modelAction: "analyze_program" }, database);
  return {
    status: "analyzed",
    analysis_text: formatAnalysis(result),
    instruction: "Analizin net sonucunu once soyle; sonucu etkileyen en fazla dort kisa noktayi aktar."
  };
}

function getDraft(userId, kind, database) {
  const row = database.prepare("SELECT payload_json FROM agent_drafts WHERE user_id = ? AND kind = ? AND status = 'draft'").get(userId, kind);
  return parseJson(row?.payload_json, {});
}

function saveDraft(userId, kind, payload, database) {
  database.prepare(`
    INSERT INTO agent_drafts (user_id, kind, payload_json, status, updated_at)
    VALUES (?, ?, ?, 'draft', CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, kind) DO UPDATE SET payload_json = excluded.payload_json, status = 'draft', updated_at = CURRENT_TIMESTAMP
  `).run(userId, kind, JSON.stringify(payload));
}

function completeDraft(userId, kind, payload, database) {
  database.prepare(`
    UPDATE agent_drafts SET payload_json = ?, status = 'completed', updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND kind = ?
  `).run(JSON.stringify(payload), userId, kind);
}

function mergeProgramContext(profile, draft) {
  const context = {};
  for (const field of PROGRAM_FIELDS) {
    if (Object.hasOwn(draft, field)) context[field] = draft[field];
    else if (profile && Object.hasOwn(profile, field)) context[field] = profile[field];
    else context[field] = null;
  }
  return context;
}

function compactProgramContext(context) {
  return Object.fromEntries(Object.entries(context).filter(([, value]) => !isMissing(value)));
}

function isMissing(value) {
  return value === null || value === undefined || value === "";
}

function saveProfile(userId, payload, database) {
  const existing = getProfileFromDatabase(userId, database) || {};
  const merged = { ...existing, ...payload };
  database.prepare(`
    INSERT OR REPLACE INTO user_profiles (
      user_id, age, height_cm, weight_kg, goal, level, days_per_week,
      equipment_json, injuries_json, excluded_exercises_json, priority_muscles_json,
      deemphasized_muscles_json, preferred_split, session_duration_min, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    userId,
    merged.age || null,
    merged.height_cm || null,
    merged.weight_kg || null,
    merged.goal,
    merged.level,
    merged.days_per_week,
    json(merged.equipment || []),
    json(merged.injuries || []),
    json(merged.excluded_exercises || []),
    json(merged.priority_muscles || []),
    json(merged.deemphasized_muscles || []),
    merged.preferred_split || "",
    merged.session_duration_min || 60
  );
}

function updateMemory(userId, summary, database) {
  database.prepare("INSERT OR REPLACE INTO user_memory (user_id, summary, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)").run(userId, summary);
}

function getProfileFromDatabase(userId, database) {
  const row = database.prepare("SELECT * FROM user_profiles WHERE user_id = ?").get(userId);
  if (!row) return null;
  return {
    ...row,
    equipment: parseJson(row.equipment_json),
    injuries: parseJson(row.injuries_json),
    excluded_exercises: parseJson(row.excluded_exercises_json),
    priority_muscles: parseJson(row.priority_muscles_json),
    deemphasized_muscles: parseJson(row.deemphasized_muscles_json)
  };
}
