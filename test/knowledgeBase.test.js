import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { classifyKnowledgeTopic, classifyProgramKnowledge, getKnowledgeClarification, loadKnowledgeBase, requiresSportSpecificPlanning, retrieveKnowledge, validateKnowledgeBase } from "../src/knowledgeBase.js";

test("the bundled knowledge base loads with valid claim and source references", () => {
  const knowledge = loadKnowledgeBase();

  assert.equal(knowledge.schemaVersion, "1.0.0");
  assert.ok(knowledge.sources.length >= 5);
  assert.ok(knowledge.claims.length >= 4);
  assert.ok(knowledge.splits.length >= 8);
  assert.ok(knowledge.sports.length >= 12);
  assert.ok(knowledge.items.length > knowledge.splits.length);
  assert.ok(knowledge.sources.every((source) => source.source_scope));
});

test("knowledge validation rejects claims that cite a missing source", () => {
  assert.throws(() => validateKnowledgeBase({
    sources: [],
    claims: [{ id: "claim.test", topics: ["test"], statement_tr: "Test", limitations_tr: "Test", evidence_level: "test", source_ids: ["source.missing"] }],
    splits: []
  }), /unknown source source\.missing/i);
});

test("knowledge validation rejects claims without a source", () => {
  assert.throws(() => validateKnowledgeBase({
    sources: [],
    claims: [{ id: "claim.test", topics: ["test"], statement_tr: "Test", limitations_tr: "Test", evidence_level: "test", source_ids: [] }],
    splits: []
  }), /at least one source/i);
});

test("knowledge validation rejects incomplete sources and split items", () => {
  assert.throws(() => validateKnowledgeBase({
    sources: [{ id: "source.test", url: "https://example.com" }],
    claims: [],
    splits: []
  }), /source source\.test is incomplete/i);

  assert.throws(() => validateKnowledgeBase({
    sources: [],
    claims: [],
    splits: [{ id: "split.test", aliases: ["test"] }]
  }), /item split\.test is incomplete/i);
});

test("knowledge validation rejects an unknown source scope", () => {
  assert.throws(() => validateKnowledgeBase({
    sources: [{
      id: "source.test",
      title: "Test",
      organization_or_journal: "Test",
      year: 2026,
      url: "https://example.com",
      evidence_type: "test",
      source_scope: "marketing_claim",
      license: "test",
      reviewed_at: "2026-07-20"
    }],
    claims: [],
    splits: []
  }), /unknown source scope/i);
});

test("knowledge documents are validated against the JSON Schema", () => {
  const knowledgeDir = fs.mkdtempSync(path.join(os.tmpdir(), "fitzortness-knowledge-"));
  try {
    fs.copyFileSync("knowledge/schema.json", path.join(knowledgeDir, "schema.json"));
    fs.writeFileSync(path.join(knowledgeDir, "sources.json"), JSON.stringify({
      schema_version: "1.0.0",
      kind: "sources",
      items: [{ id: "source.test", url: "https://example.com" }]
    }));
    fs.writeFileSync(path.join(knowledgeDir, "claims.json"), JSON.stringify({
      schema_version: "1.0.0",
      kind: "claims",
      items: [{ id: "claim.test", topics: ["test"], statement_tr: "Test", source_ids: ["source.test"] }]
    }));
    fs.writeFileSync(path.join(knowledgeDir, "splits.json"), JSON.stringify({ schema_version: "1.0.0", kind: "splits", items: [] }));
    fs.writeFileSync(path.join(knowledgeDir, "sports.json"), JSON.stringify({ schema_version: "1.0.0", kind: "sports", items: [] }));

    assert.throws(() => loadKnowledgeBase(knowledgeDir), /schema validation/i);
  } finally {
    fs.rmSync(knowledgeDir, { recursive: true, force: true });
  }
});

test("split aliases and named programs are classified without inventing a prescription", () => {
  const matches = classifyProgramKnowledge("PPL ile PHAT arasinda ne fark var?");

  assert.deepEqual(matches.map((item) => item.id), ["split.push_pull_legs", "program.phat"]);
  assert.equal(matches[0].kind, "split_pattern");
  assert.equal(matches[1].classification, "creator_named_program");
  assert.equal(matches[1].requiresSchedule, true);
});

test("ambiguous popular labels explicitly require the real weekly schedule", () => {
  const [match] = classifyProgramKnowledge("Arnold split yapiyorum");
  const context = retrieveKnowledge("Arnold split yapiyorum");

  assert.equal(match.id, "program.arnold_split");
  assert.equal(match.classification, "ambiguous_template_alias");
  assert.deepEqual(match.requiredUserFields, ["weekly_schedule"]);
  assert.deepEqual(context.claims, []);
});

test("movement-pattern splits are classified without overlapping PPL", () => {
  assert.deepEqual(classifyProgramKnowledge("movement pattern split yapiyorum").map((item) => item.id), ["split.movement_pattern"]);
  assert.deepEqual(classifyProgramKnowledge("push pull programi yapiyorum").map((item) => item.id), ["split.movement_pattern"]);
  assert.deepEqual(classifyProgramKnowledge("push pull legs yapiyorum").map((item) => item.id), ["split.push_pull_legs"]);
});

test("a bare lifting number is not classified as the 5/3/1 program", () => {
  assert.deepEqual(classifyProgramKnowledge("531 kilo deadlift yaptim"), []);
  assert.equal(classifyProgramKnowledge("5/3/1 yapiyorum")[0].id, "program.five_three_one");
});

test("calisthenics, CrossFit, and workout formats are classified without inventing a prescription", () => {
  const calisthenics = classifyProgramKnowledge("Kalistenik ile barfiksimi gelistirmek istiyorum")[0];
  const turkishCalisthenics = classifyProgramKnowledge("Vücut ağırlığı antrenmanı yapıyorum")[0];
  const crossfit = classifyProgramKnowledge("CrossFit WOD icinde 12 dakikalik AMRAP var");

  assert.equal(calisthenics.id, "method.calisthenics");
  assert.equal(calisthenics.kind, "training_method");
  assert.equal(turkishCalisthenics.id, "method.calisthenics");
  assert.deepEqual(calisthenics.requiredUserFields, ["goal", "experience", "current_skill_level", "equipment", "weekly_schedule"]);
  assert.deepEqual(crossfit.map((item) => item.id), ["method.crossfit", "format.wod", "format.amrap"]);
  assert.equal(crossfit[0].requiresSchedule, true);
  assert.equal(crossfit[2].kind, "workout_format");
});

test("calisthenics and CrossFit retrieval keeps evidence separate from brand definitions", () => {
  const calisthenics = retrieveKnowledge("Kalistenik varyasyonlarla nasil ilerlerim?");
  const crossfit = retrieveKnowledge("CrossFit WOD nasil scale edilir?");

  assert.ok(calisthenics.claims.some((claim) => claim.id === "claim.calisthenics.progress_variation"));
  assert.ok(calisthenics.claims.some((claim) => claim.sources.some((source) => source.sourceScope === "evidence")));
  assert.ok(crossfit.claims.some((claim) => claim.id === "claim.crossfit.scaling_stimulus"));
  assert.ok(crossfit.claims.flatMap((claim) => claim.sources).every((source) => source.sourceScope === "brand_definition"));
});

test("generic fitness language never injects CrossFit brand claims", () => {
  for (const message of ["Fitness hakkinda konusalim", "Fit olmak istiyorum", "Fonksiyonel hareketler iyi mi?"]) {
    const context = retrieveKnowledge(message);
    assert.equal(context.claims.some((claim) => claim.sources.some((source) => source.sourceScope === "brand_definition")), false);
  }
});

test("generic Turkish workout phrases do not activate CrossFit formats", () => {
  for (const message of ["Gunun antrenmani ne olsun?", "Sureye karsi 5 km kostum"]) {
    const context = retrieveKnowledge(message);
    assert.equal(context.items.some((item) => item.kind === "workout_format"), false);
    assert.equal(context.claims.some((claim) => claim.sources.some((source) => source.sourceScope === "brand_definition")), false);
  }
});

test("scaled is recognized as an explicit CrossFit workout variant", () => {
  const context = retrieveKnowledge("Scaled ne demek?");

  assert.deepEqual(context.items.map((item) => item.id), ["variant.scaled"]);
  assert.ok(context.claims.some((claim) => claim.id === "claim.crossfit.scaling_stimulus"));
  assert.ok(context.claims.some((claim) => claim.id === "claim.crossfit.rxd_not_required"));
});

test("major sport families are recognized through the shared knowledge interface", () => {
  const examples = new Map([
    ["5 km kosuya hazirlaniyorum", "sport.running"],
    ["Futbolda kondisyonumu gelistirmek istiyorum", "sport.football"],
    ["Tenis icin daha hizli yon degistirmek istiyorum", "sport.tennis"],
    ["Kickboks antrenmanina yeni basladim", "sport.striking_combat"],
    ["Olimpik halter yapiyorum", "sport.weightlifting"],
    ["Boulder tirmanisa baslamak istiyorum", "sport.climbing"],
    ["Acik su yuzme hedefim var", "sport.swimming"],
    ["Kayak sezonuna hazirlaniyorum", "sport.winter"],
    ["Okculuk icin denge calismak istiyorum", "sport.precision"],
    ["Para atletizm hakkinda bilgi istiyorum", "sport.para"],
    ["Binicilik kondisyonu nasil olmali", "sport.equestrian"],
    ["Motokros icin kondisyon calisiyorum", "sport.motorsport"]
  ]);

  for (const [message, expectedId] of examples) {
    assert.ok(classifyProgramKnowledge(message).some((item) => item.id === expectedId), message);
  }

});

test("sport profiles return bounded context claims and official authority links", () => {
  const context = retrieveKnowledge("Futbol kondisyonu icin ne bilmen lazim?");
  const football = context.items.find((item) => item.id === "sport.football");

  assert.ok(football);
  assert.ok(football.authoritySources.some((source) => source.sourceScope === "competition_rules"));
  assert.ok(context.claims.some((claim) => claim.id === "claim.multisport.context_required"));
  assert.ok(context.claims.some((claim) => claim.id === "claim.multisport.load_is_total_stress"));

  assert.ok(retrieveKnowledge("Bisiklet kurallari").items.flatMap((item) => item.authoritySources).some((source) => source.id === "source.uci_regulations_2026"));
  assert.ok(retrieveKnowledge("Basketbol kurallari").items.flatMap((item) => item.authoritySources).some((source) => source.id === "source.fiba_rules_2024"));
  assert.ok(retrieveKnowledge("Masa tenisi kurallari").items.flatMap((item) => item.authoritySources).some((source) => source.id === "source.ittf_statutes_2026"));
  assert.ok(retrieveKnowledge("Judo kurallari").items.flatMap((item) => item.authoritySources).some((source) => source.id === "source.ijf_rules_2026"));

  const teamClaim = retrieveKnowledge("Futbolda diz yaralanmalarini nasil azaltirim?").claims.find((claim) => claim.id === "claim.team.neuromuscular_training_context");
  assert.ok(teamClaim);
  assert.ok(teamClaim.sources.some((source) => source.id === "source.team_nmt_knee_2025"));

  for (const message of ["Hentbol kurallari", "Badminton kurallari", "BJJ kurallari", "Yelken kurallari", "Strongman kurallari", "Motokros kurallari"]) {
    const context = retrieveKnowledge(message);
    assert.deepEqual(context.items.flatMap((item) => item.authoritySources), [], message);
    assert.deepEqual(context.claims.flatMap((claim) => claim.sources).filter((source) => ["competition_rules", "governing_body_definition"].includes(source.sourceScope)), [], message);
  }

  const tennisRules = retrieveKnowledge("Teniste tie-break nasil?").claims.flatMap((claim) => claim.sources)
    .filter((source) => ["competition_rules", "governing_body_definition"].includes(source.sourceScope));
  assert.deepEqual([...new Set(tennisRules.map((source) => source.id))], ["source.itf_rules_2026"]);
});

test("natural Turkish acceptance examples resolve the intended sport context", () => {
  const examples = new Map([
    ["Gurese baslamak istiyorum", "sport.grappling_combat"],
    ["Greko ile serbest ayni mi?", "sport.grappling_combat"],
    ["Teniste tie-break nasil?", "sport.tennis"],
    ["Acik suda ilk kez tek basima yuzeyim mi?", "sport.swimming"]
  ]);

  for (const [message, expectedId] of examples) {
    assert.ok(classifyProgramKnowledge(message).some((item) => item.id === expectedId), message);
  }

  for (const message of ["Greko ile serbest ayni mi?", "Acik suda ilk kez tek basima yuzeyim mi?"]) {
    const context = retrieveKnowledge(message);
    const requestedClaimIds = new Set(context.items.flatMap((item) => item.claimIds));
    assert.ok(context.claims.every((claim) => requestedClaimIds.has(claim.id)), message);
  }
});

test("recognized sports use distinct analytics topics without overriding safety", () => {
  assert.equal(classifyKnowledgeTopic("Futbol kondisyonumu gelistirmek istiyorum"), "sport.football");
  assert.equal(classifyKnowledgeTopic("Maratona hazirlaniyorum"), "sport.running");
  assert.equal(classifyKnowledgeTopic("Boulder tirmanista ilerlemek istiyorum"), "sport.climbing");
  assert.equal(classifyKnowledgeTopic("Futbol oynarken gogsumde agri var"), "injury");
});

test("sport-specific program requests are kept out of the classic gym generator", () => {
  assert.equal(requiresSportSpecificPlanning("Bana futbol programi yaz"), true);
  assert.equal(requiresSportSpecificPlanning("Bana calisthenics programi yaz"), true);
  assert.equal(requiresSportSpecificPlanning("Bana CrossFit programi yaz"), true);
  assert.equal(requiresSportSpecificPlanning("Bana PPL programi yaz"), false);
});

test("anti-doping questions use the living authority instead of a static guarantee", () => {
  const context = retrieveKnowledge("WADA yasakli madde listesi guncel mi?");
  const claim = context.claims.find((item) => item.id === "claim.antidoping.current_list_required");

  assert.ok(claim);
  assert.ok(claim.sources.some((source) => source.sourceScope === "anti_doping_authority"));
});

test("living authority metadata is complete and stale sources require fresh verification", () => {
  const knowledge = loadKnowledgeBase();
  const livingScopes = new Set(["governing_body_definition", "competition_rules", "anti_doping_authority"]);
  for (const source of knowledge.sources.filter((item) => livingScopes.has(item.source_scope))) {
    assert.ok(source.version, source.id);
    assert.ok(source.effective_from, source.id);
    assert.ok(source.jurisdiction, source.id);
    assert.ok(source.checked_at, source.id);
    assert.ok(source.refresh_after, source.id);
  }

  const expired = retrieveKnowledge("WADA yasakli madde listesi guncel mi?", { asOf: new Date("2028-01-01T00:00:00Z") });
  const expiredClaim = expired.claims.find((claim) => claim.id === "claim.antidoping.current_list_required");
  assert.ok(expiredClaim);
  assert.equal(expiredClaim.requiresFreshVerification, true);
  assert.equal(expiredClaim.sources[0].stale, true);
  assert.match(expiredClaim.sources[0].url, /^https:\/\//);
});

test("ambiguous shared sport terms request context instead of retrieving random claims", () => {
  assert.match(getKnowledgeClarification("Set nedir?"), /hangi spor/i);
  assert.deepEqual(retrieveKnowledge("Set nedir?"), { items: [], claims: [] });
});

test("retrieval returns only relevant claims with their source metadata", () => {
  const result = retrieveKnowledge("PPL mi full body mi daha iyi?");
  const equivalence = result.claims.find((claim) => claim.id === "claim.split.volume_equated_equivalence");

  assert.deepEqual(result.items.map((item) => item.id), ["split.push_pull_legs", "split.full_body"]);
  assert.ok(equivalence);
  assert.equal(equivalence.sources[0].id, "source.split_meta_2024");
  assert.match(equivalence.sources[0].url, /pubmed\.ncbi\.nlm\.nih\.gov/);
});

test("unrelated conversation does not inject fitness knowledge context", () => {
  assert.deepEqual(retrieveKnowledge("Bugun hava nasil?").claims, []);
});

test("injury messages do not retrieve training claims", () => {
  assert.deepEqual(retrieveKnowledge("Kas yirtigi olabilir mi?"), { items: [], claims: [] });
  assert.deepEqual(retrieveKnowledge("Omzum aciyor"), { items: [], claims: [] });
  assert.deepEqual(retrieveKnowledge("Kasimi cektim"), { items: [], claims: [] });
  assert.deepEqual(retrieveKnowledge("PPL programim:\nBench 3x8\nRow 3x8\nOmzum aciyor"), { items: [], claims: [] });
  assert.deepEqual(retrieveKnowledge("WOD sonrasi idrarim kola renginde ve cok gucsuzum"), { items: [], claims: [] });
});
