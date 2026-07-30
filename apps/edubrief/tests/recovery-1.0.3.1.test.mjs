import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { planImplementationAliasMigration, planUnifiedImplementationMarks } from "../db.mjs";
import { SUBJECTS } from "../domain.mjs";

const appDirectory = fileURLToPath(new URL("../", import.meta.url));
const script = await readFile(`${appDirectory}app.mjs`, "utf8");

test("all mandatory onboarding subjects remain available", () => {
  const labels = [
    "Deutsch", "Englisch", "Französisch", "Latein", "Spanisch", "Weitere Fremdsprache",
    "Mathematik", "Biologie", "Chemie", "Physik", "Natur und Technik", "Informatik",
    "Geografie", "Geschichte", "Politik / Sozialkunde", "Wirtschaft und Recht", "BwR",
    "Berufsorientierung", "Religion", "Ethik", "Kunst", "Musik", "Sport", "Werken / Technik",
    "Ernährung und Gesundheit", "Förderunterricht", "Anderes Fach",
  ];
  assert.equal(Object.keys(SUBJECTS).length, labels.length);
  for (const label of labels) assert.ok(Object.values(SUBJECTS).some((subject) => subject.label === label), label);
});

test("tried-only legacy state becomes exactly one saved implementation", () => {
  const migration = planUnifiedImplementationMarks([], [{
    experienceId: "profile::impulse-1",
    profileId: "profile",
    contentId: "card-1",
    implementationId: "impulse-1",
    triedAt: "2026-01-02T10:00:00.000Z",
  }], "profile", "2026-02-01T10:00:00.000Z");
  assert.equal(migration.migratedFromTried, 1);
  assert.equal(migration.deduplicated, 0);
  assert.equal(migration.additions.length, 1);
  assert.equal(migration.additions[0].wantToTryAt, "2026-01-02T10:00:00.000Z");
});

test("want-to-try and tried legacy states deduplicate to one saved implementation", () => {
  const migration = planUnifiedImplementationMarks([{
    planId: "profile::impulse-1",
    profileId: "profile",
    contentId: "card-1",
    implementationId: "impulse-1",
    wantToTryAt: "2026-01-01T10:00:00.000Z",
  }], [{
    experienceId: "profile::impulse-1",
    profileId: "profile",
    contentId: "card-1",
    implementationId: "impulse-1",
    triedAt: "2026-01-02T10:00:00.000Z",
  }], "profile", "2026-02-01T10:00:00.000Z");
  assert.equal(migration.migratedFromTried, 0);
  assert.equal(migration.deduplicated, 1);
  assert.deepEqual(migration.additions, []);
});

test("migration ignores another profile and retains legacy experience records for recovery", () => {
  const migration = planUnifiedImplementationMarks([], [{
    experienceId: "other::impulse-1",
    profileId: "other",
    contentId: "card-1",
    implementationId: "impulse-1",
    triedAt: "2026-01-02T10:00:00.000Z",
  }], "profile", "2026-02-01T10:00:00.000Z");
  assert.equal(migration.migratedFromTried, 0);
  assert.equal(migration.retainedLegacyExperienceRecords, 0);
});

test("legacy implementation IDs migrate losslessly and deduplicate against the new stable ID", () => {
  const cards = [{
    id: "card.retrieval-practice-01",
    implementations: [{
      implementationId: "practice-idea.rp-01",
      legacyImplementationIds: ["impulse.rp-02-general", "impulse.rp-02-english"],
      editorialOrder: 10,
      applicability: { type: "general" },
      title: "Abrufen",
      learningAction: "Abrufen lassen.",
    }],
  }];
  const migration = planImplementationAliasMigration([
    {
      planId: "profile::impulse.rp-02-general",
      profileId: "profile",
      contentId: "card.retrieval-practice-01",
      implementationId: "impulse.rp-02-general",
      wantToTryAt: "2026-01-02T10:00:00.000Z",
      createdAt: "2026-01-02T10:00:00.000Z",
    },
    {
      planId: "profile::practice-idea.rp-01",
      profileId: "profile",
      contentId: "card.retrieval-practice-01",
      implementationId: "practice-idea.rp-01",
      wantToTryAt: "2026-01-03T10:00:00.000Z",
      createdAt: "2026-01-03T10:00:00.000Z",
    },
  ], cards, "profile", "2026-07-30T10:00:00.000Z");

  assert.equal(migration.migratedRecords, 1);
  assert.equal(migration.deduplicatedRecords, 1);
  assert.deepEqual(migration.deletePlanIds, ["profile::impulse.rp-02-general"]);
  assert.equal(migration.puts.length, 1);
  assert.equal(migration.puts[0].planId, "profile::practice-idea.rp-01");
  assert.equal(migration.puts[0].implementationId, "practice-idea.rp-01");
  assert.equal(migration.puts[0].wantToTryAt, "2026-01-02T10:00:00.000Z");
});

test("regular app has no QA profile shortcut and keeps collection updates reactive", () => {
  assert.doesNotMatch(script, /qa-profile|hidden-profile|mock-profile/i);
  assert.match(script, /await refreshPersonalState\(target\.dataset\.contentId\)/);
  assert.match(script, /state\.savedImplementations = await setImplementationSaved/);
  assert.match(script, /if \(action === "remove-saved-implementation"\)[\s\S]*await refreshPersonalState\(target\.dataset\.contentId\)/);
});
