import test from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { canonicalJson, validatePackage } from "../content-loader.mjs";
import { DAY_ROLES, FOUNDATION_PACKAGE_ID } from "../domain.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const packageDirectory = `${projectRoot}outputs/edubrief/content-packages/foundation-weeks`;
const masterDirectory = `${projectRoot}outputs/edubrief/editorial-master`;
const manifestBytes = await readFile(`${packageDirectory}/manifest.json`);
const contentBytes = await readFile(`${packageDirectory}/edubrief-foundation-weeks.content.json`);
const manifest = JSON.parse(manifestBytes);
const content = JSON.parse(contentBytes);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const expectedWeeks = [
  ["feedback-und-ueberarbeitung-master.md", "Feedback und Überarbeitung"],
  ["abrufen-retrieval-practice-master.md", "Abrufen / Retrieval Practice"],
  ["kognitive-belastung-cognitive-load-master.md", "Kognitive Belastung / Cognitive Load"],
  ["anleitung-und-selbststaendigkeit-master.md", "Anleitung und Selbstständigkeit"],
  ["tiefe-verarbeitung-und-lernhandlungen-master.md", "Tiefe Verarbeitung und Lernhandlungen"],
  ["motivation-und-selbstbestimmung-master.md", "Motivation und Selbstbestimmung"],
  ["ziele-und-selbstregulation-master.md", "Ziele und Selbstregulation"],
  ["kooperatives-lernen-master.md", "Kooperatives Lernen"],
  ["ueben-festigen-und-automatisieren-master.md", "Üben, Festigen und Automatisieren"],
  ["leistung-beurteilen-und-noten-einordnen-master.md", "Leistung beurteilen und Noten einordnen"],
  ["langeweile-und-passung-master.md", "Langeweile und Passung"],
  ["klassenfuehrung-und-lernzeit-master.md", "Klassenführung und Lernzeit"],
  ["individualisierung-und-adaptivitaet-master.md", "Individualisierung und Adaptivität"],
  ["digitale-werkzeuge-und-multimedia-master.md", "Digitale Werkzeuge und Multimedia"],
  ["klassenwiederholung-master.md", "Klassenwiederholung"],
  ["hausaufgaben-als-lernarchitektur-master.md", "Hausaufgaben als Lernarchitektur"],
];

test("foundation package validates with exact production counts and lifecycle", async () => {
  const validated = await validatePackage(manifest, content, contentBytes);
  assert.equal(validated.manifest.packageId, FOUNDATION_PACKAGE_ID);
  assert.equal(validated.manifest.schemaVersion, "3.0.0-distribution");
  assert.equal(validated.manifest.releaseStatus, "published");
  assert.equal(validated.manifest.publicationStatus, "P3");
  assert.deepEqual(manifest.counts, {
    sources: 528,
    topics: 16,
    themeWeeks: 16,
    cards: 80,
    implementations: 240,
    tombstones: 0,
  });
  assert.equal(validated.runtimeContent.cards.length, 80);
});

test("all 16 master weeks are in the required order with five cards and three implementations", () => {
  assert.deepEqual(content.themeWeeks.map((week) => week.title), expectedWeeks.map(([, title]) => title));
  assert.deepEqual(content.topics.map((topic) => topic.title), expectedWeeks.map((_, index) => `Woche ${index + 1}`));
  for (const week of content.themeWeeks) {
    assert.equal(week.dayIds.length, 5);
    const weekCards = content.cards
      .filter((card) => card.themeWeekId === week.weekId)
      .sort((a, b) => a.sequence - b.sequence);
    assert.deepEqual(weekCards.map((card) => card.id), week.dayIds);
    assert.deepEqual(weekCards.map((card) => card.dayRole), DAY_ROLES);
    assert.deepEqual(weekCards.map((card) => card.sequence), [1, 2, 3, 4, 5]);
    assert.ok(weekCards.every((card) => card.implementations.length === 3));
  }
});

test("every card contains the complete visible editorial hierarchy and traceable science", () => {
  for (const card of content.cards) {
    for (const field of ["title", "guidingQuestion", "shortAnswer", "explanation", "takeaway"]) {
      assert.equal(typeof card[field], "string", `${card.id}: ${field}`);
      assert.ok(card[field].length > 0, `${card.id}: ${field}`);
    }
    assert.equal(card.reflectionPrompts.length, 1, card.id);
    assert.ok(card.reflectionPrompts[0].prompt.length > 0, card.id);
    assert.doesNotMatch(card.reflectionPrompts[0].prompt, /(^|\n)---($|\n)/);
    assert.match(card.researchStatement.evidenceLevel, /^E[0-4]$/);
    assert.ok(card.researchStatement.evidenceSummary.length > 0);
    assert.ok(card.researchStatement.robustCore.length > 0);
    assert.ok(card.researchStatement.conditionsAndLimits.length > 0);
    assert.ok(card.researchStatement.doesNotFollow.length > 0);
    assert.ok(card.researchStatement.sourceRefs.length > 0);
    assert.equal(card.reviewState.publicationStatus, "P3");
  }
});

test("all implementation IDs are stable and unique and all variants are subject-independent", () => {
  const implementations = content.cards.flatMap((card) => card.implementations);
  assert.equal(implementations.length, 240);
  assert.equal(new Set(implementations.map((item) => item.implementationId)).size, 240);
  for (const item of implementations) {
    assert.equal(item.applicability.type, "general", item.implementationId);
    assert.equal(Object.hasOwn(item.applicability, "subjectIds"), false, item.implementationId);
    assert.equal(item.reviewStatus, "approved", item.implementationId);
  }
});

test("master collection fingerprint binds all 16 exact master files and excludes QA supplements", async () => {
  const masterHashes = [];
  for (const [filename] of expectedWeeks) {
    masterHashes.push({
      path: `outputs/edubrief/editorial-master/${filename}`,
      sha256: sha256(await readFile(`${masterDirectory}/${filename}`)),
    });
  }
  assert.equal(manifest.contentGateApprovalSha256, sha256(canonicalJson(masterHashes)));
});

test("runtime payload excludes editorial provenance and forbidden learning mechanics", () => {
  const payload = contentBytes.toString("utf8");
  assert.doesNotMatch(payload, /\/Users\/|Redaktioneller Herkunftsnachweis|Fundus-Abdeckungsmatrix|bibliografische Prüfung|kanonische Klärung/i);
  assert.doesNotMatch(payload, /Professionelles Lernen von Lehrkräften/);
  for (const index of ["05", "06", "07", "08", "09", "10", "11", "12"]) {
    assert.doesNotMatch(payload, new RegExp(`SI-04-A${index}`));
  }
  assert.doesNotMatch(payload, /"(?:multipleChoiceQuestions|answerOptions|answerField|selfAssessment|score|points|difficulty|cognitiveDemand)"\s*:/);
  assert.doesNotMatch(payload, /placeholder|lorem ipsum/i);
});
