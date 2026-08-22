import test from "node:test";
import assert from "node:assert/strict";
import { buildCoachSystemPrompt } from "../src/persona.js";

test("text program analysis is concise and never exposes OCR terminology", () => {
  const prompt = buildCoachSystemPrompt("", "program_analysis");

  assert.match(prompt, /en fazla 4 kisa madde/i);
  assert.doesNotMatch(prompt, /OCR/i);
});

test("image analysis describes uncertainty in user-facing language", () => {
  const prompt = buildCoachSystemPrompt("", "image_analysis");

  assert.match(prompt, /net okuyamadigin satir/i);
  assert.doesNotMatch(prompt, /OCR/i);
});

test("humor adapts to the user and stays out of sensitive replies", () => {
  const prompt = buildCoachSystemPrompt();

  assert.match(prompt, /hafif mizah/i);
  assert.match(prompt, /sakatlik/i);
});

test("sourced knowledge is bounded by its claims and limitations", () => {
  const prompt = buildCoachSystemPrompt();

  assert.match(prompt, /knowledge_context/i);
  assert.match(prompt, /kaynak veya sayi uydurma/i);
  assert.match(prompt, /requiresFreshVerification/);
  assert.match(prompt, /surumunu veya haftalik planini sor/i);
});

test("calisthenics and CrossFit knowledge keeps brand claims in their proper scope", () => {
  const prompt = buildCoachSystemPrompt();

  assert.match(prompt, /calisthenics/i);
  assert.match(prompt, /CrossFit/i);
  assert.match(prompt, /brand_definition/i);
  assert.match(prompt, /bagimsiz bilimsel kanit/i);
});

test("multisport answers respect rules, anti-doping, and high-risk technique boundaries", () => {
  const prompt = buildCoachSystemPrompt();

  assert.match(prompt, /takim, dayaniklilik, raket, mucadele/i);
  assert.match(prompt, /competition_rules/i);
  assert.match(prompt, /anti_doping_authority/i);
  assert.match(prompt, /hizli kilo kesme/i);
  assert.match(prompt, /klasik gym programina sessizce donme/i);
});

test("the agent prompt no longer compensates for turns the transport now carries", () => {
  const prompt = buildCoachSystemPrompt("", "agent");

  assert.doesNotMatch(prompt, /user_message/);
  assert.doesNotMatch(prompt, /guncel istek gibi yorumlama/i);
  assert.match(prompt, /taslagi koru/i);
});
