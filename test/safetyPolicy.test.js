import test from "node:test";
import assert from "node:assert/strict";
import { getPreventiveTrainingSafetyResponse, getUrgentTrainingSafetyResponse } from "../src/safetyPolicy.js";

test("urgent training red flags receive a deterministic stop-and-refer response", () => {
  const darkUrine = getUrgentTrainingSafetyResponse("WOD sonrasi idrarim kola renginde");
  assert.match(darkUrine, /antrenmani hemen birak/i);
  assert.match(darkUrine, /acil/i);
  assert.match(getUrgentTrainingSafetyResponse("Koyu idrar gordum"), /acil/i);
  assert.match(getUrgentTrainingSafetyResponse("Koyu idrarim var"), /acil/i);

  const fainting = getUrgentTrainingSafetyResponse("EMOM sirasinda bayildim");
  assert.match(fainting, /112/);
  assert.match(fainting, /egzersizi durdur/i);
});

test("ordinary soreness remains in the normal coaching flow", () => {
  assert.equal(getUrgentTrainingSafetyResponse("Squat sonrasi bacaklarim agriyor"), null);
});

test("negated symptoms and general-information questions do not trigger the emergency gate", () => {
  assert.equal(getUrgentTrainingSafetyResponse("Nefes darligim yok"), null);
  assert.equal(getUrgentTrainingSafetyResponse("Carpinti hakkinda genel bilgi verir misin?"), null);
  assert.equal(getUrgentTrainingSafetyResponse("Bayilma nedir?"), null);
  assert.equal(getUrgentTrainingSafetyResponse("Idrarim koyu degil"), null);
  assert.equal(getUrgentTrainingSafetyResponse("Koyu renkli idrarim yok"), null);
  assert.equal(getUrgentTrainingSafetyResponse("Koyu renkli idrar nedir?"), null);
});

test("explicit first-person symptom reports still trigger the emergency gate", () => {
  assert.match(getUrgentTrainingSafetyResponse("WOD sirasinda nefes darligi yasiyorum"), /112/);
  assert.match(getUrgentTrainingSafetyResponse("Antrenmanda gogus agrim oldu"), /112/);
  assert.match(getUrgentTrainingSafetyResponse("EMOM sonrasi carpintim var"), /112/);
  assert.match(getUrgentTrainingSafetyResponse("WOD sirasinda basim donuyor"), /egzersizi durdur/i);
  assert.match(getUrgentTrainingSafetyResponse("Antrenmanda gogsumde agri var"), /112/);
  assert.match(getUrgentTrainingSafetyResponse("Nefes almakta zorlaniyorum"), /112/);
  assert.match(getUrgentTrainingSafetyResponse("Cok siddetli kas agrim ve gucsuzlugum var"), /acil/i);
});

test("head-impact and exertional-heat danger signs stop sport participation", () => {
  assert.match(getUrgentTrainingSafetyResponse("Macta kafama darbe aldim ve dengemi kaybediyorum"), /oyuna donme/i);
  assert.match(getUrgentTrainingSafetyResponse("Kafama darbe aldim, sonra kustum"), /saglik degerlendirmesi/i);
  assert.match(getUrgentTrainingSafetyResponse("Sicakta kosarken bilincim bulandi ve yere coktüm"), /112/);
});

test("preventive sport safety gates do not depend on the language model", () => {
  assert.match(getPreventiveTrainingSafetyResponse("Dun kafama darbe aldim, bugun sparring yapayim mi?"), /temasa donme/i);
  assert.match(getPreventiveTrainingSafetyResponse("3 gunde 5 kilo kesmem lazim"), /protokol/i);
  assert.match(getPreventiveTrainingSafetyResponse("Acik suda ilk kez tek basima yuzeyim mi?"), /yalniz yuzme/i);
  assert.match(getPreventiveTrainingSafetyResponse("Kizim 13 yasinda elit program yapsin"), /yetiskin program/i);
  assert.equal(getPreventiveTrainingSafetyResponse("Haftada 3 gun yuzuyorum"), null);
});
