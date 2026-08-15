import { hasUrgentTrainingSafetySignal } from "./safetyPolicy.js";

export function routeMessage(text) {
  const normalized = normalize(text);
  const hasProgramSubject = /(program|antrenman|split)/.test(normalized);

  if (/\b(hack|crack|sifre kir|kredi karti|malware|virus|bomba)\b/.test(normalized)) {
    return "out_of_scope";
  }

  if (isWorkoutProgramText(text)) {
    return "analyze_program";
  }

  if (hasProgramSubject && /(analiz|incele|yorumla|degerlendir|kontrol et)/.test(normalized)) {
    return "analyze_program";
  }

  if (hasProgramSubject && /(hazirla|olustur|yaz|kur|yap|cikar|uret)/.test(normalized)) {
    return "create_program";
  }

  return "conversation";
}

export function extractStandaloneDaysPerWeek(text) {
  const normalized = normalize(text).trim();
  const standaloneMatch = normalized.match(/^([1-7])$/);
  if (standaloneMatch) return Number(standaloneMatch[1]);

  const explicitMatch = normalized.match(/^(?:haftada\s*)?([1-7])\s*gun(?:luk)?$/);
  return explicitMatch ? Number(explicitMatch[1]) : null;
}

export function isWorkoutProgramText(text) {
  const workoutLines = String(text || "").split(/\r?\n/).filter((line) => /\d+\s*(?:set(?:\s*x?\s*\d+)?|[xX×*]\s*\d+)/u.test(line));
  return workoutLines.length >= 2;
}

export function classifyTopic(text) {
  const normalized = normalize(text);
  const injuryLanguage = /(agri|sakatlik|sakatlig|incinme|yaralanma|yirti|yirtik|aciyor|burkul|sislik|gogus rahatsizligi|nefes darligi|bas donmesi|bayil|senkop|carpinti|koyu idrar|idrar\w*\s+(?:kola|cay) reng)/.test(normalized) || /\bkas\w*\s+cektim\b/.test(normalized);
  if (hasUrgentTrainingSafetySignal(text) || (injuryLanguage && !isGeneralInjuryPreventionQuestion(normalized))) return "injury";
  if (/(crossfit|cross fit|\bwod\b|\bamrap\b|\bemom\b|\bfor[- ]time\b|\bchipper\b|\b(?:rx|rxd|scaled)\b|rx'd)/.test(normalized)) return "crossfit";
  if (/(kalistenik|calisthenic|calisthenics|street workout|bodyweight|vucut agirligi|front lever|planche|l[- ]sit|handstand|muscle[- ]up)/.test(normalized)) return "calisthenics";
  if (isWorkoutProgramText(text)) return "program_analysis";
  if (/(beslenme|protein|kalori|diyet|karbonhidrat|yag)/.test(normalized)) return "nutrition";
  if (/(motivasyon|disiplin|isteksiz|heves)/.test(normalized)) return "motivation";
  if (/(uyku|toparlan|dinlen|yorgun)/.test(normalized)) return "recovery";
  if (/(form|teknik|teknig|pozisyon|nasil yap|yapilis|hareket\w*\s+goster|gif)/.test(normalized)) return "exercise_form";
  if (/(program|antrenman|split)/.test(normalized) && /(hazirla|olustur|yaz|kur|uret)/.test(normalized)) return "program_creation";
  if (/(program|antrenman|split)/.test(normalized) && /(analiz|incele|yorumla|yorumlar|degerlendir|kontrol)/.test(normalized)) return "program_analysis";
  if (/\b(selam|merhaba|nasilsin|napıyorsun|napiyorsun|sa)\b/.test(normalized)) return "smalltalk";
  return "general_fitness";
}

function isGeneralInjuryPreventionQuestion(normalized) {
  const injuryMention = /\b(?:sakatlik|yaralanma)\w*/.test(normalized);
  const preventionIntent = /\b(?:risk\w*|onle\w*|korun\w*|azalt\w*)/.test(normalized);
  const activePersonalReport = /\b(?:sakatlandim|yaralandim|incindim|yirttim|burktum|sakatligim(?:in)?|yaralanmam(?:in)?|agrim\s+var|aciyor|sislik\s+var)\b/.test(normalized);
  return injuryMention && preventionIntent && !activePersonalReport;
}

export function isExerciseFormRequest(text) {
  return /(form|teknik|teknig|pozisyon|nasil yap|yapilis|hareket\w*\s+goster|gif)/.test(normalize(text));
}

function normalize(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ı", "i");
}
