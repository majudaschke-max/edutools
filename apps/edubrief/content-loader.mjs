import {
  APP_VERSION,
  CONTENT_HASH,
  CONTENT_VERSION,
  DAY_ROLES,
  FOUNDATION_PACKAGE_ID,
  MANIFEST_HASH,
  normalizeImplementations,
  PACKAGE_BASE,
  PACKAGE_ID,
  SUBJECTS,
} from "./domain.mjs";

export const DISTRIBUTION_SCHEMA_V1 = "2.0.0-distribution";
export const DISTRIBUTION_SCHEMA_V2 = "3.0.0-distribution";
export const RELEASE_STATUS_READY = "ready-for-release-approval";
export const RELEASE_STATUS_PUBLISHED = "published";

const SUPPORTED_PACKAGE_IDS = new Set([PACKAGE_ID, FOUNDATION_PACKAGE_ID]);
const CONTENT_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

const COMMON_MANIFEST_FIELDS = [
  "packageId",
  "publisherId",
  "packagePurpose",
  "schemaVersion",
  "contentVersion",
  "createdByAppVersion",
  "minimumAppVersion",
  "createdAt",
  "releaseStatus",
  "publicationStatus",
  "locale",
  "hashAlgorithm",
  "canonicalization",
  "files",
  "counts",
  "contentAuthorId",
  "scientificReviewerId",
  "editorialReviewerId",
  "manifestHash",
];

const V1_REQUIRED_MANIFEST_FIELDS = [...COMMON_MANIFEST_FIELDS, "releasedAt", "releaseApproverId"];
const V2_REQUIRED_MANIFEST_FIELDS = [
  ...COMMON_MANIFEST_FIELDS,
  "contentGateApprovalRef",
  "contentGateApprovalSha256",
];
const V2_OPTIONAL_MANIFEST_FIELDS = ["sourceCandidateVersion", "sourceContentSha256"];

const FORBIDDEN_KEYS = new Set([
  "multipleChoiceQuestions",
  "answerOptions",
  "answerField",
  "modelAnswer",
  "sampleAnswer",
  "selfAssessment",
  "answerAttempt",
  "answerAttempts",
  "score",
  "points",
  "difficulty",
  "cognitiveDemand",
]);

const V2_IMPLEMENTATION_FIELDS = new Set([
  "implementationId",
  "legacyImplementationIds",
  "editorialOrder",
  "applicability",
  "title",
  "learningAction",
  "observationPrompt",
  "variation",
  "subjectExample",
  "transferStatus",
  "reviewStatus",
  "fundusStatementId",
  "subjectLabel",
]);

const LEGACY_TIME_FIELDS = new Set([
  "preparationMinutes",
  "preparationMinutesMin",
  "preparationMinutesMax",
  "classroomMinutes",
  "classroomMinutesMin",
  "classroomMinutesMax",
  "durationMinutes",
  "durationCategory",
  "timingNote",
]);

export class ContentPackageError extends Error {
  constructor(message, code = "CONTENT_PACKAGE_INVALID", options = undefined) {
    super(message, options);
    this.name = "ContentPackageError";
    this.code = code;
  }
}

export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export async function sha256Hex(bytesOrText) {
  const bytes = typeof bytesOrText === "string" ? new TextEncoder().encode(bytesOrText) : bytesOrText;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function assert(condition, message, code) {
  if (!condition) throw new ContentPackageError(message, code);
}

function assertRequiredFields(value, fields) {
  for (const field of fields) {
    assert(Object.hasOwn(value, field), `Manifestfeld fehlt: ${field}`, "MANIFEST_FIELD_MISSING");
  }
}

function assertAllowedFields(value, allowed, label) {
  const unexpected = Object.keys(value).filter((field) => !allowed.has(field));
  assert(unexpected.length === 0, `${label} enthält unbekannte Felder: ${unexpected.join(", ")}`, "SCHEMA_FIELD_UNEXPECTED");
}

function findForbiddenKey(value, path = "$content") {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenKey(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) return `${path}.${key}`;
    const found = findForbiddenKey(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

function supportsMinimumVersion(currentVersion, minimumVersion) {
  const parse = (value) => /^\d+\.\d+\.\d+$/.test(value ?? "") ? value.split(".").map(Number) : null;
  const current = parse(currentVersion);
  const minimum = parse(minimumVersion);
  if (!current || !minimum) return false;
  for (let index = 0; index < 3; index += 1) {
    if (current[index] > minimum[index]) return true;
    if (current[index] < minimum[index]) return false;
  }
  return true;
}

function validateCommonManifest(manifest) {
  assert(manifest && typeof manifest === "object" && !Array.isArray(manifest), "Das Paketmanifest ist kein Objekt.");
  assert(SUPPORTED_PACKAGE_IDS.has(manifest.packageId), "Unerwartete Paketkennung.", "PACKAGE_ID_UNEXPECTED");
  assert(manifest.publisherId === "edutools", "Unerwarteter Publisher.", "PUBLISHER_UNTRUSTED");
  assert(manifest.packagePurpose === "distribution", "Nur Distribution-Pakete sind zulässig.");
  assert(supportsMinimumVersion(APP_VERSION, manifest.minimumAppVersion), "Das Paket benötigt eine neuere App-Version.");
  assert(manifest.publicationStatus === "P3", "Das Paket ist nicht P3-freigegeben.");
  assert(manifest.locale === "de-DE", "Nicht unterstützte Sprache.");
  assert(manifest.hashAlgorithm === "sha-256", "Nicht unterstützter Hashalgorithmus.");
  assert(manifest.canonicalization === "edubrief-canonical-json-v1", "Nicht unterstützte Manifestkanonisierung.");
  assert(Array.isArray(manifest.files) && manifest.files.length === 1, "Das MVP-Paket muss genau eine Contentdatei deklarieren.");
  const contentFile = manifest.files[0];
  assert(CONTENT_FILE_PATTERN.test(contentFile.path ?? ""), "Unerwarteter Contentpfad.");
  assert(contentFile.mediaType === "application/json", "Unerwarteter Content-Medientyp.");
  assert(/^[a-f0-9]{64}$/.test(contentFile.sha256 ?? ""), "Ungültiger deklarierter Contenthash.");
  assert(Number.isInteger(contentFile.bytes) && contentFile.bytes >= 2, "Ungültige deklarierte Contentgröße.");
  assert(/^[a-f0-9]{64}$/.test(manifest.manifestHash ?? ""), "Ungültiger deklarierter Manifesthash.");
  assert(manifest.counts && typeof manifest.counts === "object" && !Array.isArray(manifest.counts), "Manifestzähler fehlen.");
  for (const field of ["sources", "topics", "themeWeeks", "cards", "tombstones"]) {
    assert(Number.isInteger(manifest.counts[field]) && manifest.counts[field] >= 0, `Ungültiger Manifestzähler: ${field}.`);
  }
  assert(manifest.counts.themeWeeks >= 1, "Mindestens eine Themenwoche ist erforderlich.");
  assert(manifest.counts.cards === manifest.counts.themeWeeks * 5, "Jede Themenwoche muss im Manifest genau fünf Karten besitzen.");
  if (manifest.packageId === FOUNDATION_PACKAGE_ID && manifest.schemaVersion === DISTRIBUTION_SCHEMA_V2) {
    assert(manifest.counts.themeWeeks === 16, "Das EduBrief-Grundlagenpaket benötigt exakt 16 Themenwochen.");
    assert(manifest.counts.cards === 80, "Das EduBrief-Grundlagenpaket benötigt exakt 80 Karten.");
  }
}

function validateManifestV1(manifest) {
  assertRequiredFields(manifest, V1_REQUIRED_MANIFEST_FIELDS);
  assertAllowedFields(manifest, new Set(V1_REQUIRED_MANIFEST_FIELDS), "V1-Manifest");
  validateCommonManifest(manifest);
  assert(manifest.schemaVersion === DISTRIBUTION_SCHEMA_V1, "Nicht unterstützte Content-Schema-Version.", "SCHEMA_VERSION_UNSUPPORTED");
  assert(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.contentVersion ?? ""), "Ungültige V1-Contentversion.");
  assert(manifest.releaseStatus === RELEASE_STATUS_PUBLISHED, "Das V1-Paket ist nicht veröffentlicht.");
  assert(Number.isInteger(manifest.counts.practiceVariants) && manifest.counts.practiceVariants >= manifest.counts.cards, "V1-Praxisvariantenzähler stimmt nicht.");
  if (manifest.packageId === PACKAGE_ID) {
    assert(manifest.contentVersion === CONTENT_VERSION, "Nicht unterstützte Content-Version.");
    assert(manifest.files[0].sha256 === CONTENT_HASH, "Unerwarteter deklarierter Contenthash.");
    assert(manifest.manifestHash === MANIFEST_HASH, "Unerwarteter deklarierter Manifesthash.");
    assert(manifest.counts.practiceVariants === 19, "V1-Praxisvariantenzähler stimmt nicht.");
  }
}

function validateManifestV2(manifest, { context }) {
  assertRequiredFields(manifest, V2_REQUIRED_MANIFEST_FIELDS);
  const allowed = new Set([
    ...V2_REQUIRED_MANIFEST_FIELDS,
    ...V2_OPTIONAL_MANIFEST_FIELDS,
    "releasedAt",
    "releaseApproverId",
  ]);
  assertAllowedFields(manifest, allowed, "V2-Manifest");
  validateCommonManifest(manifest);
  assert(manifest.schemaVersion === DISTRIBUTION_SCHEMA_V2, "Nicht unterstützte Content-Schema-Version.", "SCHEMA_VERSION_UNSUPPORTED");
  assert(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.contentVersion ?? ""), "Ungültige V2-Contentversion.");
  const hasCandidateVersion = Object.hasOwn(manifest, "sourceCandidateVersion");
  const hasSourceContentHash = Object.hasOwn(manifest, "sourceContentSha256");
  assert(hasCandidateVersion === hasSourceContentHash, "Quellkandidatenversion und Quell-Contenthash müssen gemeinsam gesetzt sein.");
  if (hasCandidateVersion) {
    assert(/^\d+\.\d+\.\d+-candidate\.\d+$/.test(manifest.sourceCandidateVersion), "Ungültige V2-Quellkandidatenversion.");
    assert(/^[a-f0-9]{64}$/.test(manifest.sourceContentSha256), "Ungültiger Quell-Contenthash.");
  }
  assert(typeof manifest.contentGateApprovalRef === "string" && manifest.contentGateApprovalRef.length > 0, "Content-Gate-Referenz fehlt.");
  assert(/^[a-f0-9]{64}$/.test(manifest.contentGateApprovalSha256 ?? ""), "Ungültiger Content-Gate-Hash.");
  assert(Number.isInteger(manifest.counts.implementations) && manifest.counts.implementations >= manifest.counts.cards, "V2-Umsetzungszähler stimmt nicht.");

  if (manifest.releaseStatus === RELEASE_STATUS_READY) {
    assert(context === "preview", "Ein Staging-Paket darf nur im QA-/Preview-Kontext geladen werden.", "PREVIEW_CONTEXT_REQUIRED");
    assert(!Object.hasOwn(manifest, "releaseApproverId"), "Ready-Paket darf keine Release-Approver-ID enthalten.", "READY_APPROVER_FORBIDDEN");
    assert(!Object.hasOwn(manifest, "releasedAt"), "Ready-Paket darf keinen Veröffentlichungszeitpunkt enthalten.", "READY_RELEASED_AT_FORBIDDEN");
  } else if (manifest.releaseStatus === RELEASE_STATUS_PUBLISHED) {
    assert(typeof manifest.releaseApproverId === "string" && manifest.releaseApproverId.length > 0, "Published-Paket benötigt eine Release-Approver-ID.", "PUBLISHED_APPROVER_REQUIRED");
    assert(typeof manifest.releasedAt === "string" && manifest.releasedAt.length > 0, "Published-Paket benötigt einen Veröffentlichungszeitpunkt.", "PUBLISHED_RELEASED_AT_REQUIRED");
  } else {
    throw new ContentPackageError("Unbekannter Release-Status.", "RELEASE_STATUS_UNSUPPORTED");
  }
}

export function validateManifestShape(manifest, { context = "production" } = {}) {
  assert(manifest && typeof manifest === "object" && !Array.isArray(manifest), "Das Paketmanifest ist kein Objekt.");
  if (manifest.schemaVersion === DISTRIBUTION_SCHEMA_V1) {
    validateManifestV1(manifest);
    return DISTRIBUTION_SCHEMA_V1;
  }
  if (manifest.schemaVersion === DISTRIBUTION_SCHEMA_V2) {
    validateManifestV2(manifest, { context });
    return DISTRIBUTION_SCHEMA_V2;
  }
  throw new ContentPackageError(`Nicht unterstützte Content-Schema-Version: ${manifest.schemaVersion ?? "(fehlt)"}.`, "SCHEMA_VERSION_UNSUPPORTED");
}

function validateCommonContent(manifest, content) {
  assert(content && typeof content === "object" && !Array.isArray(content), "Die Contentdatei ist kein Objekt.");
  assertAllowedFields(content, new Set(["locale", "sources", "topics", "themeWeeks", "cards", "tombstones"]), "Contentwurzel");
  assert(content.locale === "de-DE", "Contentsprache und Manifest stimmen nicht überein.");
  assert(Array.isArray(content.sources) && content.sources.length === manifest.counts.sources, "Quellenzähler stimmt nicht.");
  assert(Array.isArray(content.topics) && content.topics.length === manifest.counts.topics, "Themenzähler stimmt nicht.");
  assert(Array.isArray(content.themeWeeks) && content.themeWeeks.length >= 1, "Mindestens eine Themenwoche wird erwartet.");
  assert(Array.isArray(content.cards), "Die EduCoffee-Karten fehlen.");
  assert(Array.isArray(content.tombstones) && content.tombstones.length === manifest.counts.tombstones, "Tombstone-Zähler stimmt nicht.");
  assert(content.themeWeeks.length === manifest.counts.themeWeeks, "Themenwochenzähler stimmt nicht.");
  assert(content.cards.length === manifest.counts.cards, "Kartenzähler stimmt nicht.");

  const forbiddenPath = findForbiddenKey(content);
  assert(!forbiddenPath, `Nicht zulässige Lernabfragestruktur: ${forbiddenPath}`, "LEARNING_QUERY_FORBIDDEN");

  const sourceIds = new Set(content.sources.map((source) => source.sourceId));
  const topicIds = new Set(content.topics.map((topic) => topic.topicId));
  const weekIds = new Set(content.themeWeeks.map((week) => week.weekId));
  const cardIds = new Set(content.cards.map((card) => card.id));
  assert(sourceIds.size === content.sources.length, "Doppelte Quellen-ID.");
  assert(topicIds.size === content.topics.length, "Doppelte Themen-ID.");
  assert(weekIds.size === content.themeWeeks.length, "Doppelte Themenwochen-ID.");
  assert(cardIds.size === content.cards.length, "Doppelte Content-ID.");

  const ordered = [];
  content.themeWeeks.forEach((week) => {
    assert(week?.weekId, "Themenwochen-ID fehlt.");
    assert(topicIds.has(week.topicId), `Die Themenwoche ${week.weekId} referenziert ein unbekanntes Thema.`);
    assert(Array.isArray(week.dayIds) && week.dayIds.length === 5 && new Set(week.dayIds).size === 5, `Die Themenwoche ${week.weekId} benötigt fünf eindeutige Karten.`);
    assert(week.dayIds.every((cardId) => cardIds.has(cardId)), `Die Themenwoche ${week.weekId} enthält eine unbekannte Kartenreferenz.`);

    const weekCards = content.cards.filter((card) => card.themeWeekId === week.weekId);
    assert(weekCards.length === 5, `Die Themenwoche ${week.weekId} benötigt genau fünf Karten.`);
    const orderedWeekCards = [...weekCards].sort((a, b) => a.sequence - b.sequence);
    orderedWeekCards.forEach((card, index) => {
      assert(card.id === week.dayIds[index], `Kartenreihenfolge ist in ${week.weekId} bei Schritt ${index + 1} inkonsistent.`);
      assert(card.sequence === index + 1, `Ungültige Sequenz bei ${card.id}.`);
      assert(card.dayRole === DAY_ROLES[index], `Ungültige Tagesrolle bei ${card.id}.`);
      assert(topicIds.has(card.topicId), `Gebrochene Themenreferenz bei ${card.id}.`);
      assert(card.reviewState?.publicationStatus === "P3", `Nicht-P3-Karte: ${card.id}`);
      assert(["approved", "corrected"].includes(card.reviewState?.lifecycleStatus), `Nicht freigegebene Karte: ${card.id}`);
      assert(/^E[0-4]$/.test(card.researchStatement?.evidenceLevel ?? ""), `Ungültige Evidenzstufe: ${card.id}`);
      assert(card.researchStatement?.dossierId, `Dossier-Provenienz fehlt: ${card.id}`);
      if (manifest.packageId !== FOUNDATION_PACKAGE_ID) {
        assert(card.researchStatement?.primaryFundusStatementId, `Fundus-Aussage-Provenienz fehlt: ${card.id}`);
      }
      assert(Array.isArray(card.reflectionPrompts) && card.reflectionPrompts.length >= 1, `Reflexionsimpuls fehlt: ${card.id}`);
      assert(Array.isArray(card.researchStatement.sourceRefs) && card.researchStatement.sourceRefs.every((sourceId) => sourceIds.has(sourceId)), `Gebrochene Quellenreferenz: ${card.id}`);
      assert(Array.isArray(card.reviewState.reviewedSourceRefs) && card.reviewState.reviewedSourceRefs.every((sourceId) => sourceIds.has(sourceId)), `Gebrochene Reviewquellenreferenz: ${card.id}`);
      assert(Array.isArray(card.crossReferences) && card.crossReferences.every((reference) => cardIds.has(reference.targetContentId)), `Gebrochener Querverweis: ${card.id}`);
    });
    ordered.push(...orderedWeekCards);
  });
  assert(ordered.length === content.cards.length, "Mindestens eine Karte verweist auf eine unbekannte Themenwoche.");
  return ordered;
}

function validateContentSemanticsV1(manifest, content) {
  const ordered = validateCommonContent(manifest, content);
  let practiceVariantCount = 0;
  ordered.forEach((card) => {
    assert(Array.isArray(card.practiceImpulses) && card.practiceImpulses.some((item) => item.variantType === "general"), `Allgemeine Praxisvariante fehlt: ${card.id}`);
    practiceVariantCount += card.practiceImpulses.length;
  });
  assert(practiceVariantCount === manifest.counts.practiceVariants, "Praxisvariantenzähler stimmt nicht.");
}

function validateV2Implementation(item, card) {
  assert(item && typeof item === "object" && !Array.isArray(item), `Ungültige Umsetzung bei ${card.id}.`);
  assertAllowedFields(item, V2_IMPLEMENTATION_FIELDS, `Umsetzung ${item.implementationId ?? "(ohne ID)"}`);
  const legacyTimeField = Object.keys(item).find((field) => LEGACY_TIME_FIELDS.has(field));
  assert(!legacyTimeField, `Legacy-Zeitfeld ist in V2 unzulässig: ${legacyTimeField}.`, "V2_LEGACY_TIME_FIELD_FORBIDDEN");
  assert(/^(?:impulse|practice-idea)\.[a-z0-9][a-z0-9._-]+$/.test(item.implementationId ?? ""), `Ungültige Umsetzungs-ID: ${item.implementationId ?? "(fehlt)"}.`);
  assert(Number.isInteger(item.editorialOrder) && item.editorialOrder >= 0 && item.editorialOrder <= 10000, `Ungültige redaktionelle Reihenfolge: ${item.implementationId}.`);
  assert(typeof item.title === "string" && item.title.length > 0, `Titel fehlt: ${item.implementationId}.`);
  assert(typeof item.learningAction === "string" && item.learningAction.length > 0, `Lernhandlung fehlt: ${item.implementationId}.`);
  if (Object.hasOwn(item, "legacyImplementationIds")) {
    assert(
      Array.isArray(item.legacyImplementationIds)
        && item.legacyImplementationIds.length > 0
        && new Set(item.legacyImplementationIds).size === item.legacyImplementationIds.length,
      `Legacy-Umsetzungs-IDs fehlen oder sind doppelt: ${item.implementationId}.`,
    );
    assert(
      item.legacyImplementationIds.every((id) => /^(?:impulse|practice-idea)\.[a-z0-9][a-z0-9._-]+$/.test(id)),
      `Ungültige Legacy-Umsetzungs-ID: ${item.implementationId}.`,
    );
  }
  for (const field of ["observationPrompt", "variation", "subjectExample", "subjectLabel"]) {
    if (Object.hasOwn(item, field)) assert(typeof item[field] === "string" && item[field].length > 0, `Leeres optionales Feld ${field}: ${item.implementationId}.`);
  }
  assert(item.applicability && ["general", "subjects"].includes(item.applicability.type), `Ungültige Anwendbarkeit: ${item.implementationId}.`);
  if (item.applicability.type === "general") {
    assert(!Object.hasOwn(item.applicability, "subjectIds"), `Allgemeine Umsetzung darf keine subjectIds enthalten: ${item.implementationId}.`);
  } else {
    const ids = item.applicability.subjectIds;
    assert(Array.isArray(ids) && ids.length > 0 && new Set(ids).size === ids.length, `Fach-IDs fehlen oder sind doppelt: ${item.implementationId}.`);
    assert(ids.every((id) => Object.hasOwn(SUBJECTS, id)), `Unbekannte Fach-ID: ${item.implementationId}.`);
  }
  if (Object.hasOwn(item, "transferStatus")) assert(item.transferStatus === "didactic-transfer", `Ungültiger Transferstatus: ${item.implementationId}.`);
  if (Object.hasOwn(item, "reviewStatus")) assert(item.reviewStatus === "approved", `Nicht freigegebene Umsetzung: ${item.implementationId}.`);
  if (Object.hasOwn(item, "fundusStatementId")) {
    assert(
      card.researchStatement.primaryFundusStatementId
        && item.fundusStatementId === card.researchStatement.primaryFundusStatementId,
      `Fundusbezug stimmt nicht: ${item.implementationId}.`,
    );
  }
}

function validateContentSemanticsV2(manifest, content) {
  const ordered = validateCommonContent(manifest, content);
  const allIds = [];
  const allLegacyIds = [];
  let implementationCount = 0;
  ordered.forEach((card) => {
    assert(!Object.hasOwn(card, "practiceImpulses"), `V2-Karte enthält Legacy-practiceImpulses: ${card.id}.`);
    assert(Array.isArray(card.implementations) && card.implementations.length >= 1 && card.implementations.length <= 3, `V2-Karte benötigt ein bis drei Umsetzungen: ${card.id}.`);
    if (manifest.packageId === FOUNDATION_PACKAGE_ID) {
      assert(card.implementations.length === 3, `Grundlagenkarte benötigt exakt drei Umsetzungen: ${card.id}.`);
    }
    card.implementations.forEach((item) => validateV2Implementation(item, card));
    assert(card.implementations.some((item) => item.applicability.type === "general"), `Allgemeine V2-Umsetzung fehlt: ${card.id}.`);
    implementationCount += card.implementations.length;
    allIds.push(...card.implementations.map((item) => item.implementationId));
    allLegacyIds.push(...card.implementations.flatMap((item) => item.legacyImplementationIds ?? []));
  });
  assert(new Set(allIds).size === allIds.length, "Doppelte Umsetzungs-ID.");
  assert(new Set(allLegacyIds).size === allLegacyIds.length, "Doppelte Legacy-Umsetzungs-ID.");
  assert(allLegacyIds.every((id) => !allIds.includes(id)), "Legacy- und aktuelle Umsetzungs-ID überschneiden sich.");
  assert(implementationCount === manifest.counts.implementations, "Umsetzungszähler stimmt nicht.");
  if (manifest.packageId === FOUNDATION_PACKAGE_ID) {
    assert(implementationCount === 240, "Das EduBrief-Grundlagenpaket benötigt exakt 240 Umsetzungen.");
  }
}

export function validateContentSemantics(manifest, content) {
  if (manifest.schemaVersion === DISTRIBUTION_SCHEMA_V1) return validateContentSemanticsV1(manifest, content);
  if (manifest.schemaVersion === DISTRIBUTION_SCHEMA_V2) return validateContentSemanticsV2(manifest, content);
  throw new ContentPackageError(`Nicht unterstützte Content-Schema-Version: ${manifest.schemaVersion ?? "(fehlt)"}.`, "SCHEMA_VERSION_UNSUPPORTED");
}

export function normalizeContentForRuntime(content, schemaVersion) {
  assert([DISTRIBUTION_SCHEMA_V1, DISTRIBUTION_SCHEMA_V2].includes(schemaVersion), `Nicht unterstützte Content-Schema-Version: ${schemaVersion}.`, "SCHEMA_VERSION_UNSUPPORTED");
  return {
    ...content,
    cards: content.cards.map((card) => {
      const { practiceImpulses: _practiceImpulses, additionalPracticeIdeas: _additionalPracticeIdeas, implementations: _implementations, ...common } = card;
      const implementations = schemaVersion === DISTRIBUTION_SCHEMA_V1
        ? normalizeImplementations(card)
        : card.implementations.map((item) => ({
            ...item,
            applicability: item.applicability.type === "subjects"
              ? { type: "subjects", subjectIds: [...item.applicability.subjectIds] }
              : { type: "general" },
          }));
      return { ...common, implementations };
    }),
  };
}

export async function validatePackage(manifest, content, contentBytes, { context = "production" } = {}) {
  const schemaVersion = validateManifestShape(manifest, { context });
  const manifestWithoutHash = { ...manifest };
  delete manifestWithoutHash.manifestHash;
  const actualManifestHash = await sha256Hex(canonicalJson(manifestWithoutHash));
  assert(actualManifestHash === manifest.manifestHash, "Manifest-Prüfsumme stimmt nicht.", "MANIFEST_HASH_MISMATCH");

  const bytes = contentBytes instanceof Uint8Array ? contentBytes : new Uint8Array(contentBytes);
  assert(bytes.byteLength === manifest.files[0].bytes, "Content-Dateigröße stimmt nicht.", "CONTENT_SIZE_MISMATCH");
  const actualContentHash = await sha256Hex(bytes);
  assert(actualContentHash === manifest.files[0].sha256, "Content-Prüfsumme stimmt nicht.", "CONTENT_HASH_MISMATCH");
  validateContentSemantics(manifest, content);
  return {
    manifest,
    content,
    runtimeContent: normalizeContentForRuntime(content, schemaVersion),
    validatedAt: new Date().toISOString(),
  };
}

async function fetchPackage({ baseUrl, fetchImpl, label, context }) {
  let manifestResponse;
  try {
    manifestResponse = await fetchImpl(`${baseUrl}/manifest.json`, { cache: "no-store" });
  } catch (error) {
    throw new ContentPackageError(`${label} konnte nicht geladen werden.`, "CONTENT_FETCH_FAILED", { cause: error });
  }
  if (!manifestResponse.ok) {
    throw new ContentPackageError(`${label} fehlt oder ist nicht erreichbar.`, "CONTENT_NOT_FOUND");
  }

  let manifest;
  try {
    manifest = await manifestResponse.json();
    validateManifestShape(manifest, { context });
  } catch (error) {
    if (error instanceof ContentPackageError) throw error;
    throw new ContentPackageError(`${label} enthält ein ungültiges Manifest.`, "CONTENT_JSON_INVALID", { cause: error });
  }

  let contentResponse;
  try {
    contentResponse = await fetchImpl(`${baseUrl}/${manifest.files[0].path}`, { cache: "no-store" });
  } catch (error) {
    throw new ContentPackageError(`${label} konnte nicht geladen werden.`, "CONTENT_FETCH_FAILED", { cause: error });
  }
  if (!contentResponse.ok) {
    throw new ContentPackageError(`${label} fehlt oder ist nicht erreichbar.`, "CONTENT_NOT_FOUND");
  }

  let content;
  const contentBytes = new Uint8Array(await contentResponse.arrayBuffer());
  try {
    content = JSON.parse(new TextDecoder().decode(contentBytes));
  } catch {
    throw new ContentPackageError(`${label} enthält ungültiges JSON.`, "CONTENT_JSON_INVALID");
  }
  return validatePackage(manifest, content, contentBytes, { context });
}

export function loadPublishedPackage({ baseUrl = PACKAGE_BASE, fetchImpl = fetch } = {}) {
  return fetchPackage({ baseUrl, fetchImpl, label: "Das veröffentlichte Contentpaket", context: "production" });
}

export function loadPreviewPackage({ baseUrl, fetchImpl = fetch } = {}) {
  assert(typeof baseUrl === "string" && baseUrl.length > 0, "Der QA-/Previewpfad muss explizit angegeben werden.", "PREVIEW_BASE_REQUIRED");
  return fetchPackage({ baseUrl, fetchImpl, label: "Das QA-/Previewpaket", context: "preview" });
}
