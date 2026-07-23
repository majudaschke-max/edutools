import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { updateReadState } from "../domain.mjs";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const candidate3Directory = `${projectRoot}outputs/edubrief/content-candidates/retrieval-practice-week-v1.1-candidate.3`;
const candidate4Directory = `${projectRoot}outputs/edubrief/content-candidates/retrieval-practice-week-v1.1-candidate.4`;
const read = (path) => readFile(path);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const parse = async (path) => JSON.parse(await readFile(path, "utf8"));

const candidate3 = await parse(`${candidate3Directory}/retrieval-practice-week.content.json`);
const candidate4 = await parse(`${candidate4Directory}/retrieval-practice-week.content.json`);
const manifest = await parse(`${candidate4Directory}/review-manifest.json`);

const protectedHashes = new Map([
  ["outputs/edubrief/content-distribution-schema.json", "96cc4bf8e9358c0bc7d77d4b6be3fadb94a3f370fb15a105dd8e42189e950a87"],
  ["outputs/edubrief/content-distribution-schema-v2.json", "8fb48ae06b4467a44742c1a74d0f1e8514893c67934cf593f077b2094f89607b"],
  ["outputs/edubrief/content-packages/retrieval-practice-week/manifest.json", "1309cefe589de53f6961c2bb6a2e7be0603194a7ec71a589708df0dae226e400"],
  ["outputs/edubrief/content-packages/retrieval-practice-week/retrieval-practice-week.content.json", "d796fb45f16c90e002d4c99ad196e301d34374316474b4e971d5521932130c51"],
  ["outputs/edubrief/content-candidates/retrieval-practice-week-v1.1-candidate.3/review-manifest.json", "ce9dc6dd5e8e0d202c1486a6fdbfb542f050bf9542c30f0c8caad3bcbf7beb48"],
  ["outputs/edubrief/content-candidates/retrieval-practice-week-v1.1-candidate.3/retrieval-practice-week.content.json", "0616ad474a60dc19583ba778c2ec27b9bdb0d30d6fc728809005c8323d0641ec"],
  ["outputs/edubrief/content-packages-staging/retrieval-practice-distribution-1.1.0-rc.1/manifest.json", "ec858901501b6bf8cc274364914aa9608881e6145f395a601b5df8a880c9d381"],
  ["outputs/edubrief/content-packages-staging/retrieval-practice-distribution-1.1.0-rc.1/retrieval-practice-week.content.json", "f7965ed3af8cf97d006791e758bb54495844be660e8d33cd9eee3ba0fb6131ca"],
  ["outputs/edubrief-retrieval-practice-distribution-1.1.0-rc.1.zip", "e2d632d1f9807a86ff5bab6f2daf0b4010578fbefdd177938d4d054cfd72d3d1"],
]);

test("protected schemas, Candidate 3, package 1.0.0, and RC.1 are byte-identical", async () => {
  for (const [path, expected] of protectedHashes) assert.equal(sha256(await read(`${projectRoot}${path}`)), expected, path);
});

test("Candidate 4 is a separate non-runtime review candidate with 5 cards and 15 implementations", () => {
  assert.deepEqual(candidate4.candidateMetadata, {
    ...candidate3.candidateMetadata,
    candidateVersion: "1.1.0-candidate.4",
    supersedesCandidateVersion: "1.1.0-candidate.3",
  });
  assert.equal(candidate4.candidateMetadata.status, "review-candidate");
  assert.equal(candidate4.candidateMetadata.notForRuntime, true);
  assert.equal(candidate4.cards.length, 5);
  const implementations = candidate4.cards.flatMap((card) => card.implementations);
  assert.equal(implementations.length, 15);
  assert.equal(new Set(implementations.map((item) => item.implementationId)).size, 15);
});

test("Candidate 4 changes only approved visible copy fields and candidate version metadata", () => {
  for (let cardIndex = 0; cardIndex < candidate3.cards.length; cardIndex += 1) {
    const before = candidate3.cards[cardIndex];
    const after = candidate4.cards[cardIndex];
    for (const field of ["id", "contentRevision", "topicId", "themeWeekId", "sequence", "dayRole", "estimatedMinutes", "researchStatement", "crossReferences", "reviewState"]) assert.deepEqual(after[field], before[field], `${after.id}.${field}`);
    assert.equal(after.reflectionPrompts[0].reflectionPromptId, before.reflectionPrompts[0].reflectionPromptId);
    for (let implementationIndex = 0; implementationIndex < before.implementations.length; implementationIndex += 1) {
      const oldItem = before.implementations[implementationIndex];
      const newItem = after.implementations[implementationIndex];
      for (const field of ["implementationId", "editorialOrder", "applicability", "transferStatus", "reviewStatus", "fundusStatementId", "subjectLabel", "subjectExample", "variation"]) assert.deepEqual(newItem[field], oldItem[field], `${newItem.implementationId}.${field}`);
    }
  }
  for (const field of ["locale", "sources", "topics", "themeWeeks", "tombstones"]) assert.deepEqual(candidate4[field], candidate3[field], field);
});

test("all Candidate-4 implementations use concrete actions and actionable observations without extra structures", () => {
  const implementations = candidate4.cards.flatMap((card) => card.implementations);
  for (const item of implementations) {
    assert.ok(item.learningAction.length >= 100, `${item.implementationId}: Lernhandlung zu kurz`);
    assert.match(item.learningAction, /antwort|zeichn|formulier|notier|entscheid|wähl|vergleich|verbesser|verwend|buch/i);
    assert.match(item.observationPrompt, /^Achte darauf/);
    assert.match(item.observationPrompt, /anschließend|nächst|danach|vor einer|besprecht|kläre|greife/i);
    assert.equal(Object.hasOwn(item, "variation"), false);
    for (const forbidden of ["preparationMinutes", "lessonMinutes", "duration", "quiz", "answer", "score"]) assert.equal(Object.hasOwn(item, forbidden), false);
  }
});

test("Candidate-4 review manifest covers every accompanying file with correct bytes and SHA-256", async () => {
  const files = (await readdir(candidate4Directory)).sort();
  assert.deepEqual(files, ["applicability-review.md", "content-delta-report.md", "implementation-quality-review.md", "personal-state-migration-report.md", "plain-language-review.md", "release-readiness-report.md", "retrieval-practice-week.content.json", "review-manifest.json", "schema-validation-report.md"]);
  assert.equal(manifest.candidateVersion, "1.1.0-candidate.4");
  assert.equal(manifest.status, "review-candidate");
  assert.equal(manifest.distributionEligible, false);
  for (const entry of manifest.files) {
    const bytes = await read(`${candidate4Directory}/${entry.path}`);
    assert.equal(bytes.byteLength, entry.bytes, `${entry.path} bytes`);
    assert.equal(sha256(bytes), entry.sha256, `${entry.path} hash`);
  }
});

test("read marker domain transition is reversible without affecting unrelated progress", () => {
  const original = { profileId: "profile", eduCoffeeDayId: "card", firstOpenedAt: "earlier", scheduledActiveDate: "2026-07-22" };
  const marked = updateReadState(original, true, "2026-07-22T10:00:00.000Z");
  assert.equal(marked.completedAt, "2026-07-22T10:00:00.000Z");
  assert.equal(marked.readAt, "2026-07-22T10:00:00.000Z");
  assert.equal(marked.completionMode, "read");
  const unmarked = updateReadState(marked, false, "2026-07-22T10:01:00.000Z");
  assert.equal(Object.hasOwn(unmarked, "completedAt"), false);
  assert.equal(Object.hasOwn(unmarked, "readAt"), false);
  assert.equal(Object.hasOwn(unmarked, "completionMode"), false);
  assert.equal(unmarked.firstOpenedAt, original.firstOpenedAt);
  assert.equal(unmarked.scheduledActiveDate, original.scheduledActiveDate);
});
