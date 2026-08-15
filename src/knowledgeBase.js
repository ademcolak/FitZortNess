import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { classifyTopic } from "./intentRouter.js";

const DEFAULT_KNOWLEDGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../knowledge");
const SOURCE_SCOPES = new Set(["evidence", "consensus", "brand_definition", "governing_body_definition", "competition_rules", "safety_authority", "anti_doping_authority"]);
const EXPLICIT_ITEM_SOURCE_SCOPES = new Set(["brand_definition", "governing_body_definition", "competition_rules", "anti_doping_authority"]);
let cachedKnowledge;

export function loadKnowledgeBase(knowledgeDir = DEFAULT_KNOWLEDGE_DIR) {
  if (knowledgeDir === DEFAULT_KNOWLEDGE_DIR && cachedKnowledge) return cachedKnowledge;
  const validateDocument = createDocumentValidator(knowledgeDir);
  const sourcesDocument = readDocument(knowledgeDir, "sources.json", "sources", validateDocument);
  const claimsDocument = readDocument(knowledgeDir, "claims.json", "claims", validateDocument);
  const splitsDocument = readDocument(knowledgeDir, "splits.json", "splits", validateDocument);
  const sportsDocument = readDocument(knowledgeDir, "sports.json", "sports", validateDocument);
  const schemaVersions = new Set([sourcesDocument.schema_version, claimsDocument.schema_version, splitsDocument.schema_version, sportsDocument.schema_version]);
  if (schemaVersions.size !== 1) throw new Error("Knowledge documents must use the same schema version.");

  const knowledge = validateKnowledgeBase({
    schemaVersion: sourcesDocument.schema_version,
    sources: sourcesDocument.items,
    claims: claimsDocument.items,
    splits: splitsDocument.items,
    sports: sportsDocument.items
  });
  if (knowledgeDir === DEFAULT_KNOWLEDGE_DIR) cachedKnowledge = knowledge;
  return knowledge;
}

export function validateKnowledgeBase({ schemaVersion = "1.0.0", sources, claims, splits, sports = [] }) {
  if (!Array.isArray(sources) || !Array.isArray(claims) || !Array.isArray(splits) || !Array.isArray(sports)) {
    throw new Error("Knowledge sources, claims, splits, and sports must be arrays.");
  }

  assertUniqueIds(sources, "source");
  assertUniqueIds(claims, "claim");
  const items = [...splits, ...sports];
  assertUniqueIds(items, "knowledge item");
  const sourceIds = new Set(sources.map((item) => item.id));
  const claimIds = new Set(claims.map((item) => item.id));

  for (const source of sources) {
    if (!source.title || !source.organization_or_journal || !Number.isInteger(source.year) || !source.evidence_type || !source.source_scope || !source.license || !source.reviewed_at) {
      throw new Error(`Knowledge source ${source.id} is incomplete.`);
    }
    if (!SOURCE_SCOPES.has(source.source_scope)) throw new Error(`Knowledge source ${source.id} has an unknown source scope.`);
    if (!/^https:\/\//.test(source.url || "")) throw new Error(`Knowledge source ${source.id} must have an HTTPS URL.`);
    if (source.evidence_type.startsWith("living_") && (!source.version || !source.effective_from || !source.jurisdiction || !source.checked_at || !source.refresh_after)) {
      throw new Error(`Living knowledge source ${source.id} is missing version metadata.`);
    }
  }
  for (const claim of claims) {
    if (!Array.isArray(claim.topics) || !claim.statement_tr || !claim.limitations_tr || !claim.evidence_level) {
      throw new Error(`Knowledge claim ${claim.id} is incomplete.`);
    }
    if (!Array.isArray(claim.source_ids) || !claim.source_ids.length) {
      throw new Error(`Knowledge claim ${claim.id} must cite at least one source.`);
    }
    for (const sourceId of claim.source_ids) {
      if (!sourceIds.has(sourceId)) throw new Error(`Knowledge claim ${claim.id} references unknown source ${sourceId}.`);
    }
  }
  for (const item of items) {
    if (!item.kind || !item.canonical_name || !item.classification || !item.definition_tr || typeof item.inference_policy?.name_alone_is_sufficient !== "boolean" || !Array.isArray(item.inference_policy?.required_user_fields) || !Array.isArray(item.claim_ids)) {
      throw new Error(`Knowledge item ${item.id} is incomplete.`);
    }
    if (!Array.isArray(item.aliases) || !item.aliases.length) throw new Error(`Knowledge item ${item.id} must define aliases.`);
    for (const claimId of item.claim_ids || []) {
      if (!claimIds.has(claimId)) throw new Error(`Knowledge item ${item.id} references unknown claim ${claimId}.`);
    }
    for (const sourceId of item.authority_source_ids || []) {
      if (!sourceIds.has(sourceId)) throw new Error(`Knowledge item ${item.id} references unknown source ${sourceId}.`);
    }
    for (const binding of item.authority_bindings || []) {
      if (!Array.isArray(binding.aliases) || !binding.aliases.length || !Array.isArray(binding.source_ids) || !binding.source_ids.length) {
        throw new Error(`Knowledge item ${item.id} has an incomplete authority binding.`);
      }
      for (const alias of binding.aliases) {
        if (!item.aliases.includes(alias)) throw new Error(`Knowledge item ${item.id} binds an unknown alias ${alias}.`);
      }
      for (const sourceId of binding.source_ids) {
        if (!sourceIds.has(sourceId)) throw new Error(`Knowledge item ${item.id} references unknown source ${sourceId}.`);
      }
    }
  }

  return { schemaVersion, sources, claims, splits, sports, items };
}

export function classifyProgramKnowledge(text, knowledge = loadKnowledgeBase()) {
  const normalized = normalize(text);
  const paddedText = ` ${normalized} `;
  const matches = [];

  for (const item of knowledge.items || knowledge.splits) {
    const aliases = item.aliases
      .map((alias) => ({ original: alias, normalized: normalize(alias) }))
      .filter((alias) => alias.normalized && paddedText.includes(` ${alias.normalized} `));
    if (!aliases.length) continue;
    const matchedAlias = aliases.sort((a, b) => b.normalized.length - a.normalized.length)[0];
    matches.push({
      id: item.id,
      kind: item.kind,
      canonicalName: item.canonical_name,
      classification: item.classification,
      definitionTr: item.definition_tr,
      matchedAlias: matchedAlias.original,
      requiresSchedule: item.inference_policy?.name_alone_is_sufficient === false,
      requiredUserFields: item.inference_policy?.required_user_fields || [],
      claimIds: item.claim_ids || [],
      authoritySourceIds: resolveAuthoritySourceIds(item, matchedAlias.normalized),
      position: paddedText.indexOf(` ${matchedAlias.normalized} `),
      matchedLength: matchedAlias.normalized.length
    });
  }

  return matches
    .filter((match, _index, allMatches) => !allMatches.some((other) => other.position === match.position && other.matchedLength > match.matchedLength))
    .sort((a, b) => a.position - b.position)
    .map(({ position, matchedLength, ...item }) => item);
}

export function classifyKnowledgeTopic(text, knowledge = loadKnowledgeBase()) {
  const baseTopic = classifyTopic(text);
  if (baseTopic !== "general_fitness") return baseTopic;
  return classifyProgramKnowledge(text, knowledge).find((item) => item.kind === "sport_profile")?.id || baseTopic;
}

export function requiresSportSpecificPlanning(text, knowledge = loadKnowledgeBase()) {
  return classifyProgramKnowledge(text, knowledge).some((item) => item.kind === "sport_profile" || ["method.calisthenics", "method.crossfit"].includes(item.id));
}

export function getKnowledgeClarification(text) {
  return /^set\s+(?:nedir|ne demek)\s*[?!.]*$/i.test(normalize(text))
    ? "Hangi spordaki seti soruyorsun: agirlik antrenmani, tenis, voleybol veya baska bir dal mi?"
    : null;
}

export function retrieveKnowledge(text, { limit = 6, knowledge = loadKnowledgeBase(), asOf = new Date() } = {}) {
  if (classifyTopic(text) === "injury") return { items: [], claims: [] };
  if (getKnowledgeClarification(text)) return { items: [], claims: [] };
  const safeLimit = Math.max(1, Math.min(10, Number(limit) || 6));
  const items = classifyProgramKnowledge(text, knowledge).map((item) => ({
    ...item,
    authoritySources: item.authoritySourceIds.map((sourceId) => {
      const source = knowledge.sources.find((candidate) => candidate.id === sourceId);
      return source ? {
        id: source.id,
        title: source.title,
        url: source.url,
        sourceScope: source.source_scope,
        reviewedAt: source.reviewed_at,
        version: source.version,
        effectiveFrom: source.effective_from,
        jurisdiction: source.jurisdiction,
        checkedAt: source.checked_at,
        refreshAfter: source.refresh_after,
        stale: isSourceStale(source, asOf)
      } : null;
    }).filter(Boolean)
  }));
  const hasMatchedSportProfile = items.some((item) => item.kind === "sport_profile");
  const matchedSportAuthoritySourceIds = new Set(items.filter((item) => item.kind === "sport_profile").flatMap((item) => item.authoritySourceIds));
  const requestedClaimIds = new Set(items.flatMap((item) => item.claimIds));
  const queryTokens = meaningfulTokens(text);
  const scoredClaims = knowledge.claims.map((claim, index) => {
    const sources = (claim.source_ids || [])
      .map((sourceId) => knowledge.sources.find((item) => item.id === sourceId))
      .filter((source) => source && (!hasMatchedSportProfile || !EXPLICIT_ITEM_SOURCE_SCOPES.has(source.source_scope) || matchedSportAuthoritySourceIds.has(source.id)));
    return {
      claim,
      sources,
      index,
      score: sources.length === 0
        ? 0
        : requestedClaimIds.size > 0
          ? requestedClaimIds.has(claim.id) ? 100 : 0
          : hasExplicitItemSourceScope(claim, knowledge)
            ? 0
            : tokenScore(queryTokens, claim)
    };
  }).filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, safeLimit)
    .map(({ claim, sources }) => ({
      id: claim.id,
      statementTr: claim.statement_tr,
      limitationsTr: claim.limitations_tr,
      evidenceLevel: claim.evidence_level,
      requiresFreshVerification: sources.some((source) => isSourceStale(source, asOf)),
      sources: sources.map((source) => ({
        id: source.id,
        title: source.title,
        url: source.url,
        evidenceType: source.evidence_type,
        sourceScope: source.source_scope,
        version: source.version,
        effectiveFrom: source.effective_from,
        jurisdiction: source.jurisdiction,
        checkedAt: source.checked_at,
        refreshAfter: source.refresh_after,
        stale: isSourceStale(source, asOf)
      }))
    }));

  return { items, claims: scoredClaims };
}

function createDocumentValidator(knowledgeDir) {
  const schema = JSON.parse(fs.readFileSync(path.join(knowledgeDir, "schema.json"), "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  return (document, filename) => {
    if (!validate(document)) {
      throw new Error(`Knowledge schema validation failed for ${filename}: ${ajv.errorsText(validate.errors)}`);
    }
  };
}

function readDocument(knowledgeDir, filename, expectedKind, validateDocument) {
  const document = JSON.parse(fs.readFileSync(path.join(knowledgeDir, filename), "utf8"));
  validateDocument(document, filename);
  if (document.schema_version !== "1.0.0" || document.kind !== expectedKind || !Array.isArray(document.items)) {
    throw new Error(`Invalid ${expectedKind} knowledge document.`);
  }
  return document;
}

function assertUniqueIds(items, label) {
  const ids = new Set();
  for (const item of items) {
    if (!item?.id) throw new Error(`Knowledge ${label} is missing an id.`);
    if (ids.has(item.id)) throw new Error(`Duplicate knowledge id ${item.id}.`);
    ids.add(item.id);
  }
}

function normalize(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulTokens(value) {
  const ignored = new Set(["program", "programi", "antrenman", "split", "daha", "icin", "nasil", "nedir", "sence", "hangisi", "bugun"]);
  return normalize(value).split(" ").filter((token) => token.length >= 3 && !ignored.has(token));
}

function tokenScore(tokens, claim) {
  const haystack = ` ${normalize([...(claim.topics || []), claim.statement_tr, claim.limitations_tr].join(" "))} `;
  return tokens.reduce((score, token) => score + (haystack.includes(` ${token} `) ? 1 : 0), 0);
}

function hasExplicitItemSourceScope(claim, knowledge) {
  return (claim.source_ids || []).some((sourceId) => knowledge.sources.some((source) => source.id === sourceId && EXPLICIT_ITEM_SOURCE_SCOPES.has(source.source_scope)));
}

function resolveAuthoritySourceIds(item, matchedAlias) {
  const binding = (item.authority_bindings || []).find((candidate) => candidate.aliases.some((alias) => normalize(alias) === matchedAlias));
  return binding?.source_ids || item.authority_source_ids || [];
}

function isSourceStale(source, asOf) {
  if (!source.refresh_after) return false;
  const date = asOf instanceof Date ? asOf.toISOString().slice(0, 10) : String(asOf).slice(0, 10);
  return date > source.refresh_after;
}
