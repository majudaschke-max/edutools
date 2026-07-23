import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const publishedPath = `${projectRoot}outputs/edubrief/content-packages/retrieval-practice-week/retrieval-practice-week.content.json`;
const publishedManifestPath = `${projectRoot}outputs/edubrief/content-packages/retrieval-practice-week/manifest.json`;
const candidatePath = `${projectRoot}outputs/edubrief/content-candidates/retrieval-practice-week-v1.1/retrieval-practice-week.content.json`;
const reviewDirectory = `${projectRoot}outputs/edubrief/content-candidates/retrieval-practice-week-v1.1`;
const reviewManifest = JSON.parse(await readFile(`${reviewDirectory}/review-manifest.json`, "utf8"));

const publishedBytes = await readFile(publishedPath);
const publishedManifestBytes = await readFile(publishedManifestPath);
const candidateBytes = await readFile(candidatePath);
const published = JSON.parse(publishedBytes);
const candidate = JSON.parse(candidateBytes);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("published 1.0.0 files retain their immutable hashes", () => {
  assert.equal(sha256(publishedBytes), "d796fb45f16c90e002d4c99ad196e301d34374316474b4e971d5521932130c51");
  assert.equal(sha256(publishedManifestBytes), "1309cefe589de53f6961c2bb6a2e7be0603194a7ec71a589708df0dae226e400");
});

test("candidate is explicitly non-runtime review-candidate 1.1", () => {
  assert.deepEqual(candidate.candidateMetadata, {
    candidateVersion: "1.1.0-candidate",
    status: "review-candidate",
    basedOnContentVersion: "1.0.0",
    notForRuntime: true,
  });
});

test("candidate contains five unique general additional ideas with required fields", () => {
  const ideas = candidate.cards.flatMap((card) =>
    (card.additionalPracticeIdeas ?? []).map((idea) => ({ card, idea })),
  );
  assert.equal(ideas.length, 5);
  assert.equal(new Set(ideas.map(({ idea }) => idea.practiceIdeaId)).size, 5);
  for (const { card, idea } of ideas) {
    for (const field of ["practiceIdeaId", "context", "reviewStatus", "transferStatus", "title", "learningAction", "observationFocus", "fundusStatementId"]) {
      assert.equal(typeof idea[field], "string", `${idea.practiceIdeaId}: ${field}`);
      assert.ok(idea[field].length > 0, `${idea.practiceIdeaId}: ${field}`);
    }
    assert.equal(idea.context, "general");
    assert.equal(idea.reviewStatus, "review-candidate");
    assert.equal(idea.transferStatus, "didactic-transfer");
    assert.equal(idea.fundusStatementId, card.researchStatement.primaryFundusStatementId);
    assert.ok(idea.preparationMinutesMin >= 0 && idea.preparationMinutesMax >= idea.preparationMinutesMin);
    assert.ok(idea.classroomMinutesMin > 0 && idea.classroomMinutesMax >= idea.classroomMinutesMin);
  }
});

test("candidate adds no teacher-education idea and no app query formats", () => {
  const serialized = JSON.stringify(candidate);
  assert.doesNotMatch(serialized, /practice-idea[^}]*teacher-education/i);
  assert.doesNotMatch(serialized, /multipleChoiceQuestions|answerField|modelAnswer|selfAssessment|score|points/);
});

test("all published content fields remain structurally identical in candidate", () => {
  const comparable = structuredClone(candidate);
  delete comparable.candidateMetadata;
  for (const card of comparable.cards) delete card.additionalPracticeIdeas;
  assert.deepEqual(comparable, published);
});

test("candidate content hash is stable for the review manifest", () => {
  assert.equal(sha256(candidateBytes), "a3c145f6b11dd0a31675beeb6dc88db61fe69d6a55a1b374abbbfea61a03073c");
});

test("review manifest is candidate-only and all declared hashes and byte counts match", async () => {
  assert.equal(reviewManifest.status, "review-candidate");
  assert.equal(reviewManifest.candidateVersion, "1.1.0-candidate");
  assert.equal(reviewManifest.distributionEligible, false);
  for (const file of reviewManifest.files) {
    const bytes = await readFile(`${reviewDirectory}/${file.path}`);
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(sha256(bytes), file.sha256, file.path);
  }
});
