import test from "node:test";
import assert from "node:assert/strict";
import { classifyTopic, extractDaysPerWeek, extractStandaloneDaysPerWeek, isExerciseFormRequest, routeMessage } from "../src/intentRouter.js";

test("ordinary fitness conversation stays conversational", () => {
  assert.equal(routeMessage("Bugünkü antrenmanım hakkında ne düşünüyorsun?"), "conversation");
});

test("explicit program request is routed to program creation", () => {
  assert.equal(routeMessage("Bana haftada dört günlük bir program hazırla"), "create_program");
  assert.equal(routeMessage("Bana yeni bir program yazar mısın?"), "create_program");
  assert.equal(routeMessage("Program oluşturabilir misin?"), "create_program");
});

test("program review request is routed to analysis", () => {
  assert.equal(routeMessage("Mevcut programımı analiz eder misin?"), "analyze_program");
  assert.equal(routeMessage("Programımı yorumlar mısın?"), "analyze_program");
});

test("clearly dangerous unrelated request stays out of scope", () => {
  assert.equal(routeMessage("Bir kredi kartı şifresi nasıl kırılır?"), "out_of_scope");
});

test("muscle tear language is classified as injury", () => {
  assert.equal(classifyTopic("Kas yirtigi olabilir mi?"), "injury");
  assert.equal(classifyTopic("Omzum aciyor"), "injury");
  assert.equal(classifyTopic("Kasimi cektim"), "injury");
  assert.equal(classifyTopic("PPL programim:\nBench 3x8\nRow 3x8\nOmzum aciyor"), "injury");
});

test("general injury-prevention questions stay in the sport knowledge flow", () => {
  assert.equal(classifyTopic("Futbolda diz yaralanmalarini nasil azaltirim?"), "general_fitness");
  assert.equal(classifyTopic("Futbolda sakatlik riskini nasil azaltirim?"), "general_fitness");
  assert.equal(classifyTopic("Dizim sakatlandi, agrim var; tekrarini nasil onlerim?"), "injury");
  assert.equal(classifyTopic("Omuz sakatligimin tekrarini nasil onlerim?"), "injury");
  assert.equal(classifyTopic("Diz yaralanmam tekrar etmesin diye riski nasil azaltirim?"), "injury");
});

test("weekly training days are understood from digits and Turkish number words", () => {
  assert.equal(extractDaysPerWeek("Haftada 5 gün program istiyorum"), 5);
  assert.equal(extractDaysPerWeek("Haftada dört günlük program hazırla"), 4);
  assert.equal(extractDaysPerWeek("Programımı değiştirme"), null);
});

test("a pasted workout list is classified as program analysis", () => {
  assert.equal(classifyTopic("Bench Press 4x10\nLat Pulldown 4x12\nLeg Press 3x10"), "program_analysis");
  assert.equal(routeMessage("Bench Press 4x10\nLat Pulldown 4x12\nLeg Press 3x10"), "analyze_program");
  assert.equal(routeMessage("Bench Press 4 set\nRow 3 set"), "analyze_program");
});

test("a standalone training-day answer is understood only in the waiting flow", () => {
  assert.equal(extractStandaloneDaysPerWeek("3"), 3);
  assert.equal(extractStandaloneDaysPerWeek("haftada 4 gun"), 4);
  assert.equal(extractStandaloneDaysPerWeek("8"), null);
});

test("fitness conversations use a stable topic taxonomy", () => {
  assert.equal(classifyTopic("Dizimde agri var, squat yapmali miyim?"), "injury");
  assert.equal(classifyTopic("Gunluk protein ve kalori hedefim ne olmali?"), "nutrition");
  assert.equal(classifyTopic("Motivasyonum dustu, spora gitmek istemiyorum"), "motivation");
  assert.equal(classifyTopic("Uykum kotu, toparlanmam neden uzuyor?"), "recovery");
  assert.equal(classifyTopic("Bench press teknigimi nasil duzeltirim?"), "exercise_form");
  assert.equal(classifyTopic("Squat pozisyonu nasil olmali?"), "exercise_form");
  assert.equal(classifyTopic("Burpee nasil yapiliyor?"), "exercise_form");
  assert.equal(classifyTopic("Pull-up hareketini goster"), "exercise_form");
  assert.equal(classifyTopic("Yeni bir program hazirla"), "program_creation");
  assert.equal(classifyTopic("Programimi yorumlar misin?"), "program_analysis");
  assert.equal(classifyTopic("Selam, nasilsin?"), "smalltalk");
});

test("calisthenics and CrossFit conversations have distinct analytics topics", () => {
  assert.equal(classifyTopic("Kalistenik ile muscle-up'a nasil ilerlerim?"), "calisthenics");
  assert.equal(classifyTopic("Vücut ağırlığıyla çalışıyorum"), "calisthenics");
  assert.equal(classifyTopic("Front lever ve planche progresyonu nasil olmali?"), "calisthenics");
  assert.equal(classifyTopic("Handstand ve muscle-up gelistirmek istiyorum"), "calisthenics");
  assert.equal(classifyTopic("L-sit progresyonu nasil olmali?"), "calisthenics");
  assert.equal(classifyTopic("CrossFit WOD'unda AMRAP ne demek?"), "crossfit");
  assert.equal(classifyTopic("CrossFit muscle-up teknigimi gelistirmek istiyorum"), "crossfit");
  assert.equal(classifyTopic("For time ile chipper arasindaki fark ne?"), "crossfit");
  assert.equal(classifyTopic("For-time nedir?"), "crossfit");
  assert.equal(classifyTopic("Rx yerine scaled yapmali miyim?"), "crossfit");
  assert.equal(classifyTopic("CrossFit yaparken omzum aciyor"), "injury");
});

test("discipline terms do not hide an exercise-form request", () => {
  assert.equal(isExerciseFormRequest("Kalistenik sinav hareketini goster"), true);
  assert.equal(isExerciseFormRequest("CrossFit burpee hareketini goster"), true);
  assert.equal(isExerciseFormRequest("Planche formu nasil olmali?"), true);
  assert.equal(isExerciseFormRequest("AMRAP ne demek?"), false);
});

test("high-intensity training red flags override the CrossFit topic", () => {
  assert.equal(classifyTopic("WOD sonrasi idrarim kola renginde ve cok gucsuzum"), "injury");
  assert.equal(classifyTopic("EMOM sirasinda bayildim"), "injury");
  assert.equal(classifyTopic("WOD sirasinda basim donuyor"), "injury");
});
