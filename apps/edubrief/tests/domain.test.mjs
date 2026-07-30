import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  createAssignments,
  createMissingAssignments,
  dateOnlyInTimeZone,
  deriveSavedState,
  isoWeekday,
  nextActiveDates,
  normalizeContextCode,
  normalizeImplementations,
  implementationFilterOptions,
  qaDateFromLocation,
  resolveTodaySchedule,
  selectImplementations,
  selectPracticeVariant,
  subjectSelectionFromProfile,
  SUBJECTS,
  updatePersonalMark,
} from "../domain.mjs";

const cards = Array.from({ length: 5 }, (_, index) => ({
  id: `card.${index + 1}`,
  contentRevision: 2,
  themeWeekId: "week.1",
  sequence: index + 1,
}));
const themeWeeks = [{ weekId: "week.1", dayIds: cards.map((card) => card.id) }];

test("date-only arithmetic crosses month boundaries deterministically", () => {
  assert.equal(addDays("2026-07-31", 1), "2026-08-01");
  assert.equal(isoWeekday("2026-07-20"), 1);
  assert.equal(isoWeekday("2026-07-26"), 7);
});

test("browser date is derived in the configured IANA time zone", () => {
  assert.equal(dateOnlyInTimeZone(new Date("2026-07-21T23:30:00Z"), "Europe/Berlin"), "2026-07-22");
  assert.equal(dateOnlyInTimeZone(new Date("2026-07-21T23:30:00Z"), "America/New_York"), "2026-07-21");
});

test("active Monday-to-Friday dates skip a weekend without penalty", () => {
  assert.deepEqual(nextActiveDates("2026-07-24", [1, 2, 3, 4, 5], 5), [
    "2026-07-24",
    "2026-07-27",
    "2026-07-28",
    "2026-07-29",
    "2026-07-30",
  ]);
});

test("inactive start date begins on the next active date", () => {
  assert.deepEqual(nextActiveDates("2026-07-25", [1, 3, 5], 3), ["2026-07-27", "2026-07-29", "2026-07-31"]);
});

test("a single weekly active day can schedule the complete 80-card collection", () => {
  const dates = nextActiveDates("2026-07-20", [1], 80);
  assert.equal(dates.length, 80);
  assert.equal(dates[0], "2026-07-20");
  assert.equal(dates.at(-1), "2028-01-24");
  assert.equal(new Set(dates).size, 80);
  assert.ok(dates.every((date) => isoWeekday(date) === 1));
});

test("at least one active weekday is required", () => {
  assert.throws(() => nextActiveDates("2026-07-20", [], 5), /Mindestens ein/);
});

test("five cards receive deterministic date assignments", () => {
  const input = {
    profileId: "p-1",
    themeWeeks,
    cards,
    startDate: "2026-07-20",
    activeWeekdays: [1, 2, 3, 4, 5],
    assignedAt: "2026-07-20T06:00:00.000Z",
  };
  assert.deepEqual(createAssignments(input), createAssignments(input));
  assert.deepEqual(createAssignments(input).map((item) => item.scheduledActiveDate), [
    "2026-07-20",
    "2026-07-21",
    "2026-07-22",
    "2026-07-23",
    "2026-07-24",
  ]);
});

test("assignment has assignedAt but no opening timestamp", () => {
  const [assignment] = createAssignments({
    profileId: "p-1",
    themeWeeks,
    cards,
    startDate: "2026-07-20",
    activeWeekdays: [1, 2, 3, 4, 5],
    assignedAt: "2026-07-20T06:00:00.000Z",
  });
  assert.equal(assignment.assignedAt, "2026-07-20T06:00:00.000Z");
  assert.equal(assignment.firstOpenedAt, undefined);
  assert.equal(assignment.lastOpenedAt, undefined);
});

test("two theme weeks keep week order despite repeated sequences and skip inactive days", () => {
  const feedbackCards = Array.from({ length: 5 }, (_, index) => ({
    id: `feedback.${index + 1}`,
    contentRevision: 1,
    themeWeekId: "week.feedback",
    sequence: index + 1,
  }));
  const retrievalCards = Array.from({ length: 5 }, (_, index) => ({
    id: `retrieval.${index + 1}`,
    contentRevision: 1,
    themeWeekId: "week.retrieval",
    sequence: index + 1,
  }));
  const weeks = [
    { weekId: "week.feedback", dayIds: feedbackCards.map((card) => card.id) },
    { weekId: "week.retrieval", dayIds: retrievalCards.map((card) => card.id) },
  ];
  const assignments = createAssignments({
    profileId: "p-2",
    themeWeeks: weeks,
    cards: [...retrievalCards].reverse().concat([...feedbackCards].reverse()),
    startDate: "2026-07-24",
    activeWeekdays: [1, 2, 3, 4, 5],
    assignedAt: "2026-07-24T06:00:00.000Z",
  });
  assert.deepEqual(assignments.map((item) => item.contentId), [...feedbackCards, ...retrievalCards].map((card) => card.id));
  assert.deepEqual(assignments.map((item) => item.sequence), [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]);
  assert.deepEqual(assignments.map((item) => item.scheduledActiveDate), [
    "2026-07-24",
    "2026-07-27",
    "2026-07-28",
    "2026-07-29",
    "2026-07-30",
    "2026-07-31",
    "2026-08-03",
    "2026-08-04",
    "2026-08-05",
    "2026-08-06",
  ]);
});

test("existing assignments remain unchanged while missing earlier week content is appended idempotently", () => {
  const feedbackCards = cards.map((card, index) => ({ ...card, id: `feedback.${index + 1}`, themeWeekId: "week.feedback" }));
  const retrievalCards = cards.map((card, index) => ({ ...card, id: `retrieval.${index + 1}`, themeWeekId: "week.retrieval" }));
  const weeks = [
    { weekId: "week.feedback", dayIds: feedbackCards.map((card) => card.id) },
    { weekId: "week.retrieval", dayIds: retrievalCards.map((card) => card.id) },
  ];
  const existing = createAssignments({
    profileId: "p-existing",
    themeWeeks: [weeks[1]],
    cards: retrievalCards,
    startDate: "2026-07-20",
    activeWeekdays: [1, 2, 3, 4, 5],
    assignedAt: "2026-07-20T06:00:00.000Z",
  });
  existing[0].firstOpenedAt = "2026-07-20T07:00:00.000Z";
  const before = structuredClone(existing);
  const additions = createMissingAssignments({
    profileId: "p-existing",
    themeWeeks: weeks,
    cards: [...feedbackCards, ...retrievalCards],
    existingAssignments: existing,
    startDate: "2026-07-20",
    activeWeekdays: [1, 2, 3, 4, 5],
    assignedAt: "2026-07-25T06:00:00.000Z",
  });
  assert.deepEqual(existing, before);
  assert.deepEqual(additions.map((item) => item.contentId), feedbackCards.map((card) => card.id));
  assert.deepEqual(additions.map((item) => item.scheduledActiveDate), [
    "2026-07-27",
    "2026-07-28",
    "2026-07-29",
    "2026-07-30",
    "2026-07-31",
  ]);
  assert.deepEqual(createMissingAssignments({
    profileId: "p-existing",
    themeWeeks: weeks,
    cards: [...feedbackCards, ...retrievalCards],
    existingAssignments: [...existing, ...additions],
    startDate: "2026-07-20",
    activeWeekdays: [1, 2, 3, 4, 5],
    assignedAt: "2026-07-26T06:00:00.000Z",
  }), []);
});

test("invalid or incomplete theme weeks fail with a clear error", () => {
  assert.throws(() => createAssignments({
    profileId: "p-invalid",
    themeWeeks: [{ weekId: "week.1", dayIds: cards.slice(0, 4).map((card) => card.id) }],
    cards,
    startDate: "2026-07-20",
    activeWeekdays: [1],
    assignedAt: "2026-07-20T06:00:00.000Z",
  }), /genau fünf eindeutige Karten/);
});

test("rest-day schedule resolution exposes the next assignment without changing its date", () => {
  const progress = createAssignments({
    profileId: "p-rest",
    themeWeeks,
    cards,
    startDate: "2026-07-20",
    activeWeekdays: [1, 3, 5],
    assignedAt: "2026-07-20T06:00:00.000Z",
  });
  const before = structuredClone(progress);
  const schedule = resolveTodaySchedule(progress, "2026-07-21");
  assert.equal(schedule.exact, null);
  assert.equal(schedule.next.contentId, "card.2");
  assert.equal(schedule.next.scheduledActiveDate, "2026-07-22");
  assert.deepEqual(progress, before);
});

test("a matching subject variant is preferred", () => {
  const card = {
    practiceImpulses: [
      { impulseId: "impulse.general", variantType: "general" },
      { impulseId: "impulse.english", variantType: "subject", audienceCriteria: { subjects: ["Englisch"] } },
    ],
  };
  const selected = selectPracticeVariant(card, "english");
  assert.equal(selected.impulse.impulseId, "impulse.english");
  assert.equal(selected.usedFallback, false);
});

test("a missing context variant falls back to the general variant", () => {
  const card = {
    id: "card.1",
    practiceImpulses: [
      { impulseId: "impulse.general", variantType: "general" },
      { impulseId: "impulse.english", variantType: "subject", audienceCriteria: { subjects: ["Englisch"] } },
    ],
  };
  const selected = selectPracticeVariant(card, "bwr");
  assert.equal(selected.impulse.impulseId, "impulse.general");
  assert.equal(selected.usedFallback, true);
});

test("legacy contexts migrate to the direct subject selection", () => {
  assert.equal(normalizeContextCode("general"), "general");
  assert.equal(normalizeContextCode("english"), "english");
  assert.equal(normalizeContextCode("bwr"), "bwr");
  assert.equal(normalizeContextCode("teacher-education"), "general");
  assert.equal(normalizeContextCode("teacherEducation"), "general");
  assert.equal(normalizeContextCode("unbekannter-altwert"), "general");
});

test("English and BwR keep specific variants while other subjects use general", async () => {
  const { CONTEXTS } = await import("../domain.mjs");
  assert.equal(Object.keys(CONTEXTS).length, 28);
  for (const code of ["german", "mathematics", "geography", "english", "bwr", "economics-law", "career-orientation"]) {
    assert.ok(CONTEXTS[code]);
  }
  assert.equal(CONTEXTS["teacher-education"], undefined);
  const card = {
    id: "card.1",
    practiceImpulses: [
      { impulseId: "impulse.general", variantType: "general" },
      { impulseId: "impulse.english", variantType: "subject", audienceCriteria: { subjects: ["Englisch"] } },
      { impulseId: "impulse.bwr", variantType: "subject", audienceCriteria: { subjects: ["BwR"] } },
    ],
  };
  assert.equal(selectPracticeVariant(card, "english").impulse.impulseId, "impulse.english");
  assert.equal(selectPracticeVariant(card, "bwr").impulse.impulseId, "impulse.bwr");
  for (const code of ["german", "mathematics", "geography", "economics-law", "career-orientation"]) {
    assert.equal(selectPracticeVariant(card, code).impulse.impulseId, "impulse.general");
    assert.equal(selectPracticeVariant(card, code).usedFallback, true);
  }
});

test("legacy and candidate implementations normalize to one non-hierarchical model", () => {
  const card = {
    practiceImpulses: [
      { impulseId: "impulse.general", variantType: "general", title: "A", learningAction: "A tun" },
      { impulseId: "impulse.english", variantType: "subject", audienceCriteria: { subjects: ["Englisch"] }, title: "B", learningAction: "B tun" },
    ],
    additionalPracticeIdeas: [
      { practiceIdeaId: "idea.general-a", context: "general", title: "C", learningAction: "C tun" },
    ],
  };
  const normalized = normalizeImplementations(card);
  assert.deepEqual(normalized.map((item) => item.implementationId), ["impulse.general", "impulse.english", "idea.general-a"]);
  assert.equal(normalized.some((item) => Object.hasOwn(item, "preparationMinutesMin")), false);
});

test("multi-subject selection combines general and matching implementations with a cap of three", () => {
  const card = { implementations: [
    { implementationId: "general.1", editorialOrder: 10, applicability: { type: "general" }, title: "A", learningAction: "A" },
    { implementationId: "english.1", editorialOrder: 20, applicability: { type: "subjects", subjectIds: ["english"] }, title: "B", learningAction: "B" },
    { implementationId: "bwr.1", editorialOrder: 30, applicability: { type: "subjects", subjectIds: ["bwr"] }, title: "C", learningAction: "C" },
    { implementationId: "general.2", editorialOrder: 40, applicability: { type: "general" }, title: "D", learningAction: "D" },
  ] };
  const selection = { mode: "subjects", subjectIds: ["english", "bwr"] };
  assert.deepEqual(selectImplementations(card, selection).map((item) => item.implementationId), ["general.1", "english.1", "bwr.1"]);
  assert.deepEqual(selectImplementations(card, selection, "english").map((item) => item.implementationId), ["general.1", "english.1", "general.2"]);
  assert.deepEqual(implementationFilterOptions(card, selection), ["all", "english", "bwr"]);
});

test("a filter is omitted when all subjects produce the same general implementations", () => {
  const card = { implementations: [
    { implementationId: "general.1", editorialOrder: 10, applicability: { type: "general" }, title: "A", learningAction: "A" },
  ] };
  assert.deepEqual(implementationFilterOptions(card, { mode: "subjects", subjectIds: ["german", "mathematics"] }), []);
});

test("subject profiles distinguish completed general mode from missing onboarding", () => {
  assert.deepEqual(subjectSelectionFromProfile({ subjectSelectionMode: "general", onboardingCompletedAt: "x" }), { mode: "general", subjectIds: [], otherSubjectLabel: "" });
  assert.deepEqual(subjectSelectionFromProfile({ preferredContext: "english" }).subjectIds, ["english"]);
  assert.equal(subjectSelectionFromProfile({ preferredContext: "teacher-education" }).mode, "general");
  assert.equal(Object.keys(SUBJECTS).length, 27);
});

test("personal marker timestamps remain independent", () => {
  let record = { profileId: "p-1", contentId: "card.1", createdAt: "2026-07-20T06:00:00Z" };
  record = updatePersonalMark(record, "rememberedAt", true, "2026-07-20T07:00:00Z");
  record = updatePersonalMark(record, "deepenAt", true, "2026-07-20T08:00:00Z");
  assert.equal(record.rememberedAt, "2026-07-20T07:00:00Z");
  assert.equal(record.deepenAt, "2026-07-20T08:00:00Z");
  assert.equal(record.wantToTryAt, undefined);
  assert.equal(deriveSavedState(record), "deepen");
});

test("removing one marker preserves other marker timestamps", () => {
  const record = updatePersonalMark(
    {
      rememberedAt: "2026-07-20T07:00:00Z",
      deepenAt: "2026-07-20T08:00:00Z",
    },
    "deepenAt",
    false,
    "2026-07-20T10:00:00Z",
  );
  assert.equal(record.deepenAt, undefined);
  assert.equal(record.rememberedAt, "2026-07-20T07:00:00Z");
  assert.equal(record.wantToTryAt, undefined);
});

test("QA date override is accepted only on a local host", () => {
  assert.equal(qaDateFromLocation({ hostname: "127.0.0.1", search: "?qaDate=2026-07-20" }), "2026-07-20");
  assert.equal(qaDateFromLocation({ hostname: "example.org", search: "?qaDate=2026-07-20" }), null);
  assert.equal(qaDateFromLocation({ hostname: "localhost", search: "?qaDate=invalid" }), null);
});
