import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { implementationFilterOptions, selectImplementations, subjectSelectionFromProfile } from "../domain.mjs";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const publishedDirectory = `${projectRoot}outputs/edubrief/content-packages/retrieval-practice-week`;
const candidateDirectory = `${projectRoot}outputs/edubrief/content-candidates/retrieval-practice-week-v1.1-candidate.2`;
const publishedBytes = await readFile(`${publishedDirectory}/retrieval-practice-week.content.json`);
const publishedManifestBytes = await readFile(`${publishedDirectory}/manifest.json`);
const candidateBytes = await readFile(`${candidateDirectory}/retrieval-practice-week.content.json`);
const candidate = JSON.parse(candidateBytes);
const reviewManifest = JSON.parse(await readFile(`${candidateDirectory}/review-manifest.json`, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("published P3 package 1.0.0 remains byte-exact", () => {
  assert.equal(sha256(publishedBytes), "d796fb45f16c90e002d4c99ad196e301d34374316474b4e971d5521932130c51");
  assert.equal(sha256(publishedManifestBytes), "1309cefe589de53f6961c2bb6a2e7be0603194a7ec71a589708df0dae226e400");
});

test("candidate.2 is parseable, unpublished, and contains one to three equal implementations per card", () => {
  assert.equal(candidate.candidateMetadata.candidateVersion, "1.1.0-candidate.2");
  assert.equal(candidate.candidateMetadata.status, "review-candidate");
  assert.equal(candidate.candidateMetadata.notForRuntime, true);
  for (const card of candidate.cards) {
    assert.ok(card.implementations.length >= 1 && card.implementations.length <= 3);
    assert.equal(card.practiceImpulses, undefined);
    assert.equal(card.additionalPracticeIdeas, undefined);
  }
});

test("all candidate implementations have unique stable IDs, order, applicability, and no time metadata", () => {
  const items = candidate.cards.flatMap((card) => card.implementations);
  assert.equal(items.length, 15);
  assert.equal(new Set(items.map((item) => item.implementationId)).size, items.length);
  for (const item of items) {
    assert.equal(typeof item.editorialOrder, "number");
    assert.ok(["general", "subjects"].includes(item.applicability.type));
    if (item.applicability.type === "subjects") assert.ok(item.applicability.subjectIds.every((id) => ["english", "bwr"].includes(id)));
    assert.equal(typeof item.title, "string");
    assert.equal(typeof item.learningAction, "string");
    for (const forbidden of ["preparationMinutesMin", "preparationMinutesMax", "classroomMinutesMin", "classroomMinutesMax", "timingNote", "durationCategory"]) {
      assert.equal(Object.hasOwn(item, forbidden), false, `${item.implementationId}: ${forbidden}`);
    }
  }
});

test("general, English, BwR, and multi-subject profiles select deterministically", () => {
  const card = candidate.cards[0];
  assert.equal(selectImplementations(card, { mode: "general", subjectIds: [] }).length, 1);
  assert.deepEqual(selectImplementations(card, { mode: "subjects", subjectIds: ["english"] }).map((item) => item.applicability.type), ["general", "subjects"]);
  assert.deepEqual(selectImplementations(card, { mode: "subjects", subjectIds: ["bwr"] }).map((item) => item.applicability.type), ["general", "subjects"]);
  assert.equal(selectImplementations(card, { mode: "subjects", subjectIds: ["english", "bwr", "geography"] }).length, 3);
  assert.deepEqual(implementationFilterOptions(card, { mode: "subjects", subjectIds: ["english", "bwr", "geography"] }), ["all", "english", "bwr", "geography"]);
});

test("legacy profile values map without an artificial subject", () => {
  assert.deepEqual(subjectSelectionFromProfile({ preferredContext: "english" }).subjectIds, ["english"]);
  assert.deepEqual(subjectSelectionFromProfile({ preferredContext: "bwr" }).subjectIds, ["bwr"]);
  for (const legacy of ["general", "teacher-education", "teacherEducation", "obsolete-value"]) {
    assert.equal(subjectSelectionFromProfile({ preferredContext: legacy }).mode, "general");
  }
});

test("review bundle hashes and counts are self-consistent", async () => {
  assert.equal(reviewManifest.status, "review-candidate");
  assert.equal(reviewManifest.candidateVersion, "1.1.0-candidate.2");
  assert.equal(reviewManifest.distributionEligible, false);
  assert.equal(reviewManifest.counts.implementations, 15);
  for (const file of reviewManifest.files) {
    const bytes = await readFile(`${candidateDirectory}/${file.path}`);
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(sha256(bytes), file.sha256, file.path);
  }
});
