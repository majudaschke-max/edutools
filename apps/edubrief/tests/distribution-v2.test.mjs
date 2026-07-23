import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  DISTRIBUTION_SCHEMA_V1,
  DISTRIBUTION_SCHEMA_V2,
  loadPreviewPackage,
  loadPublishedPackage,
  normalizeContentForRuntime,
  RELEASE_STATUS_READY,
  validateManifestShape,
  validatePackage,
} from "../content-loader.mjs";
import { normalizeImplementations, selectImplementations } from "../domain.mjs";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const v1Directory = `${projectRoot}outputs/edubrief/content-packages/retrieval-practice-week`;
const candidateDirectory = `${projectRoot}outputs/edubrief/content-candidates/retrieval-practice-week-v1.1-candidate.3`;
const stagingDirectory = `${projectRoot}outputs/edubrief/content-packages-staging/retrieval-practice-distribution-1.1.0-rc.1`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));

const v1ManifestBytes = await readFile(`${v1Directory}/manifest.json`);
const v1ContentBytes = await readFile(`${v1Directory}/retrieval-practice-week.content.json`);
const v1Manifest = JSON.parse(v1ManifestBytes);
const v1Content = JSON.parse(v1ContentBytes);
const candidateBytes = await readFile(`${candidateDirectory}/retrieval-practice-week.content.json`);
const candidate = JSON.parse(candidateBytes);
const stagingManifestBytes = await readFile(`${stagingDirectory}/manifest.json`);
const stagingContentBytes = await readFile(`${stagingDirectory}/retrieval-practice-week.content.json`);
const stagingManifest = JSON.parse(stagingManifestBytes);
const stagingContent = JSON.parse(stagingContentBytes);
const schemaV2 = await json(`${projectRoot}outputs/edubrief/content-distribution-schema-v2.json`);

function responseFor(bytes, asJson = false) {
  return {
    ok: true,
    json: async () => asJson ? JSON.parse(bytes.toString("utf8")) : null,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

function stagingFetch(url) {
  if (url.endsWith("/manifest.json")) return Promise.resolve(responseFor(stagingManifestBytes, true));
  if (url.endsWith("/retrieval-practice-week.content.json")) return Promise.resolve(responseFor(stagingContentBytes));
  return Promise.resolve({ ok: false });
}

test("v1 schema and published package remain byte-exact", () => {
  assert.equal(DISTRIBUTION_SCHEMA_V1, "2.0.0-distribution");
  assert.equal(sha256(v1ManifestBytes), "1309cefe589de53f6961c2bb6a2e7be0603194a7ec71a589708df0dae226e400");
  assert.equal(sha256(v1ContentBytes), "d796fb45f16c90e002d4c99ad196e301d34374316474b4e971d5521932130c51");
});

test("published v1 package still validates and normalizes through the legacy path", async () => {
  const validated = await validatePackage(v1Manifest, v1Content, v1ContentBytes);
  assert.equal(validated.manifest.releaseStatus, "published");
  assert.equal(validated.runtimeContent.cards.length, 5);
  for (let index = 0; index < v1Content.cards.length; index += 1) {
    assert.deepEqual(validated.runtimeContent.cards[index].implementations, normalizeImplementations(v1Content.cards[index]));
  }
});

test("v2 schema is explicitly versioned and uses a closed implementations contract", () => {
  assert.equal(DISTRIBUTION_SCHEMA_V2, "3.0.0-distribution");
  assert.equal(schemaV2.properties.manifest.properties.schemaVersion.const, DISTRIBUTION_SCHEMA_V2);
  assert.ok(schemaV2.$defs.card.required.includes("implementations"));
  assert.ok(!schemaV2.$defs.card.required.includes("practiceImpulses"));
  assert.equal(schemaV2.$defs.possibleImplementation.additionalProperties, false);
  assert.match(schemaV2.$defs.implementationId.pattern, /practice-idea/);
  for (const field of ["preparationMinutes", "preparationMinutesMin", "classroomMinutes", "durationMinutes", "timingNote"]) {
    assert.equal(Object.hasOwn(schemaV2.$defs.possibleImplementation.properties, field), false);
  }
});

test("staging input remains the externally approved candidate", () => {
  assert.equal(sha256(candidateBytes), "0616ad474a60dc19583ba778c2ec27b9bdb0d30d6fc728809005c8323d0641ec");
  assert.equal(candidate.candidateMetadata.candidateVersion, "1.1.0-candidate.3");
});

test("staging manifest is ready for approval without a release approver or releasedAt", () => {
  assert.equal(stagingManifest.schemaVersion, DISTRIBUTION_SCHEMA_V2);
  assert.equal(stagingManifest.contentVersion, "1.1.0-rc.1");
  assert.equal(stagingManifest.releaseStatus, RELEASE_STATUS_READY);
  assert.equal(Object.hasOwn(stagingManifest, "releaseApproverId"), false);
  assert.equal(Object.hasOwn(stagingManifest, "releasedAt"), false);
  assert.equal(stagingManifest.sourceContentSha256, sha256(candidateBytes));
  assert.equal(stagingManifest.counts.implementations, 15);
});

test("v2 staging manifest and raw content hashes validate in preview context", async () => {
  const validated = await validatePackage(stagingManifest, stagingContent, stagingContentBytes, { context: "preview" });
  assert.equal(validated.runtimeContent.cards.length, 5);
  assert.equal(validated.runtimeContent.cards.flatMap((card) => card.implementations).length, 15);
  assert.equal(stagingManifest.files[0].bytes, stagingContentBytes.byteLength);
  assert.equal(stagingManifest.files[0].sha256, sha256(stagingContentBytes));
  const withoutHash = { ...stagingManifest };
  delete withoutHash.manifestHash;
  assert.equal(stagingManifest.manifestHash, sha256(Buffer.from(canonicalJson(withoutHash))));
});

test("ready staging requires the explicit preview context", async () => {
  await assert.rejects(() => validatePackage(stagingManifest, stagingContent, stagingContentBytes), /QA-\/Preview-Kontext/);
  await assert.rejects(() => loadPublishedPackage({ baseUrl: "/staging", fetchImpl: stagingFetch }), /QA-\/Preview-Kontext/);
});

test("the isolated preview loader accepts the ready staging package", async () => {
  const validated = await loadPreviewPackage({ baseUrl: "/staging", fetchImpl: stagingFetch });
  assert.equal(validated.manifest.releaseStatus, RELEASE_STATUS_READY);
  assert.equal(validated.runtimeContent.cards.flatMap((card) => card.implementations).length, 15);
});

test("published v2 requires both approver identity and releasedAt", () => {
  const withoutBoth = { ...stagingManifest, releaseStatus: "published" };
  assert.throws(() => validateManifestShape(withoutBoth, { context: "preview" }), /Release-Approver-ID/);
  const withoutDate = { ...withoutBoth, releaseApproverId: "existing-approver" };
  assert.throws(() => validateManifestShape(withoutDate, { context: "preview" }), /Veröffentlichungszeitpunkt/);
  const complete = { ...withoutDate, releasedAt: "2026-07-22T00:00:00Z" };
  assert.equal(validateManifestShape(complete, { context: "preview" }), DISTRIBUTION_SCHEMA_V2);
});

test("unknown lifecycle and schema versions are rejected clearly", () => {
  assert.throws(() => validateManifestShape({ ...stagingManifest, releaseStatus: "released" }, { context: "preview" }), /Unbekannter Release-Status/);
  assert.throws(() => validateManifestShape({ ...stagingManifest, schemaVersion: "99.0.0-distribution" }, { context: "preview" }), /Nicht unterstützte Content-Schema-Version/);
});

test("all 15 implementation IDs, ordering, applicability, and text remain exact", () => {
  const source = candidate.cards.flatMap((card) => card.implementations).toSorted((a, b) => a.implementationId.localeCompare(b.implementationId));
  const staged = stagingContent.cards.flatMap((card) => card.implementations).toSorted((a, b) => a.implementationId.localeCompare(b.implementationId));
  assert.equal(source.length, 15);
  assert.equal(staged.length, 15);
  for (let index = 0; index < source.length; index += 1) {
    const { reviewStatus: sourceReviewStatus, ...sourceComparable } = source[index];
    const { reviewStatus: stagedReviewStatus, ...stagedComparable } = staged[index];
    assert.equal(sourceReviewStatus, "review-candidate");
    assert.equal(stagedReviewStatus, "approved");
    assert.deepEqual(stagedComparable, sourceComparable);
  }
});

test("scientific fields, sources, topics, and theme week remain field-exact", () => {
  assert.deepEqual(stagingContent.sources, candidate.sources);
  assert.deepEqual(stagingContent.topics, candidate.topics);
  assert.deepEqual(stagingContent.themeWeeks, candidate.themeWeeks);
  assert.deepEqual(stagingContent.tombstones, []);
  for (let index = 0; index < candidate.cards.length; index += 1) {
    const source = { ...candidate.cards[index] };
    const staged = { ...stagingContent.cards[index] };
    delete source.implementations;
    delete staged.implementations;
    assert.deepEqual(staged, source);
  }
});

test("v2 implementations have no legacy time fields and retain unique stable IDs", () => {
  const implementations = stagingContent.cards.flatMap((card) => card.implementations);
  assert.equal(new Set(implementations.map((item) => item.implementationId)).size, 15);
  assert.equal(implementations.filter((item) => item.applicability.type === "general").length, 5);
  assert.equal(implementations.filter((item) => item.applicability.subjectIds?.includes("english")).length, 5);
  assert.equal(implementations.filter((item) => item.applicability.subjectIds?.includes("bwr")).length, 5);
  for (const item of implementations) {
    for (const field of ["preparationMinutes", "preparationMinutesMin", "preparationMinutesMax", "classroomMinutes", "classroomMinutesMin", "classroomMinutesMax", "durationMinutes", "durationCategory", "timingNote"]) {
      assert.equal(Object.hasOwn(item, field), false, `${item.implementationId}: ${field}`);
    }
  }
});

test("multi-subject and fallback selection produce at most three deterministic implementations", () => {
  for (const card of stagingContent.cards) {
    assert.equal(selectImplementations(card, { mode: "general", subjectIds: [] }).length, 1);
    assert.equal(selectImplementations(card, { mode: "subjects", subjectIds: ["english", "bwr"] }).length, 3);
    const noVariant = selectImplementations(card, { mode: "subjects", subjectIds: ["geography"] });
    assert.equal(noVariant.length, 1);
    assert.equal(noVariant[0].applicability.type, "general");
  }
});

test("normalization removes external version-specific practice structures", () => {
  const normalizedV1 = normalizeContentForRuntime(v1Content, DISTRIBUTION_SCHEMA_V1);
  const normalizedV2 = normalizeContentForRuntime(stagingContent, DISTRIBUTION_SCHEMA_V2);
  for (const card of [...normalizedV1.cards, ...normalizedV2.cards]) {
    assert.equal(Object.hasOwn(card, "practiceImpulses"), false);
    assert.ok(Array.isArray(card.implementations));
  }
});

test("staging runtime files contain no private path or review-bundle payload", () => {
  const payload = `${stagingManifestBytes.toString("utf8")}\n${stagingContentBytes.toString("utf8")}`;
  assert.doesNotMatch(payload, /\/Users\/|node_modules|content-candidates|review-manifest|implementation-quality-review/);
  assert.doesNotMatch(payload, /multipleChoiceQuestions|answerOptions|selfAssessment|score|points/);
});
