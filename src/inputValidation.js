const NUMBER_WORDS = {
  sifir: 0,
  bir: 1,
  iki: 2,
  uc: 3,
  dort: 4,
  bes: 5,
  alti: 6,
  yedi: 7
};

const CONTEXT_RANGES = {
  current_training_days: { min: 0, max: 7 },
  available_training_days_for_plan: { min: 1, max: 7 },
  generator_training_days: { min: 3, max: 5 }
};

export function isDestructiveAdminActionConfirmed(value) {
  return value === "CONFIRM";
}

export function validateTrainingDaysAnswer(text, { context = "available_training_days_for_plan", humor = true } = {}) {
  const { min, max } = CONTEXT_RANGES[context] || CONTEXT_RANGES.available_training_days_for_plan;
  const value = parseTrainingDays(text);
  const expected = rangeLabel(min, max);

  if (value !== null && value >= min && value <= max) return { value, reply: null };
  if (!humor) return { value: null, reply: `Haftalik gun sayisini ${expected} olarak yazabilir misin?` };
  if (value === 0) {
    return { value: null, reply: `0 gunse takvim bize kapiyi kapatti 😄 Program yazabilmem icin ${expected} ayirabilir misin?` };
  }
  if (value !== null && (value < 0 || value > 7)) {
    return { value: null, reply: `Haftaya yeni gun ekleme paketi daha cikmadi 😄 ${expected} yaz.` };
  }
  if (value !== null) {
    return { value: null, reply: `Haftada ${value} gun calismak gayet mumkun; mevcut program ureticisi su an ${expected} destekliyor.` };
  }
  return { value: null, reply: `Takvimle ufak bir iletisim kazasi yasadik 😄 ${expected} yazabilir misin?` };
}

function parseTrainingDays(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^(?:haftada\s*)?(-?\d+|sifir|bir|iki|uc|dort|bes|alti|yedi)(?:\s*gun(?:luk)?)?(?:\s*(?:calisiyorum|gidiyorum|yapiyorum))?$/);
  if (!match) return null;
  if (/^-?\d+$/.test(match[1])) return Number(match[1]);
  return NUMBER_WORDS[match[1]] ?? null;
}

function rangeLabel(min, max) {
  if (min === 1 && max === 7) return "1 ile 7 arasinda bir sayi";
  const values = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  return values.length === 1 ? String(values[0]) : `${values.slice(0, -1).join(", ")} veya ${values.at(-1)}`;
}

function normalize(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
