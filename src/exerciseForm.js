import { findApprovedExerciseAnimation } from "./exerciseMedia.js";
import { findExerciseByName } from "./exerciseSearch.js";

const FORM_QUERY_WORDS = new Set([
  "bana", "dogru", "form", "formu", "goster", "gosterir", "hali", "halini", "hareket", "hareketi", "hareketin", "hareketini",
  "mi", "misin", "nasil", "olmali", "pozisyon", "pozisyonu", "teknik", "teknigi", "yapilir", "yapiliyor", "yapilis", "yapilisini"
]);

export async function sendExerciseFormGuide({ chatId, userMessage, sendText, sendAnimation }) {
  const exerciseQuery = extractExerciseQuery(userMessage);
  if (!exerciseQuery) return false;
  const exercise = findExerciseByName(exerciseQuery) || findExerciseByName(userMessage);
  if (!exercise) return false;

  const approvedAnimation = findApprovedExerciseAnimation(exercise.id);
  if (!approvedAnimation) return false;
  await sendText(chatId, formatExerciseForm(exercise, approvedAnimation));
  await sendAnimation(chatId, approvedAnimation);
  return true;
}

function formatExerciseForm(exercise, approvedAnimation) {
  const instructions = exercise.instructions_tr || exercise.instructions_en || "Bu hareket icin aciklama bulunamadi.";
  return [
    exercise.name,
    `Hedef: ${exercise.target || "belirtilmemis"} | Ekipman: ${exercise.equipment || "belirtilmemis"}`,
    "",
    instructions,
    "",
    "Not: Animasyon genel gorsel referanstir; kisiye ozel teknik degerlendirme degildir.",
    `Medya: ${approvedAnimation.attribution}`,
    `Kaynak: ${approvedAnimation.sourceUrl}`,
    `Lisans: ${approvedAnimation.license} - ${approvedAnimation.licenseUrl}`
  ].join("\n");
}

function extractExerciseQuery(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ı", "i")
    .replace(/[^\p{L}\p{N}\s/-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word && !FORM_QUERY_WORDS.has(word))
    .join(" ");
}
