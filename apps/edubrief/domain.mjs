export const APP_VERSION = "1.2.0";
export const PACKAGE_ID = "edutools.edubrief.retrieval-practice-week";
export const FOUNDATION_PACKAGE_ID = "edutools.edubrief.foundation-weeks";
export const CONTENT_VERSION = "1.0.0";
export const PACKAGE_BASE = "../../outputs/edubrief/content-packages/foundation-weeks";
export const MANIFEST_HASH = "e67292e0af2ae4be0a1036d0387b3ff819c0aebe8035134fc475ec650f88f8f6";
export const CONTENT_HASH = "d796fb45f16c90e002d4c99ad196e301d34374316474b4e971d5521932130c51";

export const DAY_ROLES = [
  "research-and-orientation",
  "observe-and-diagnose",
  "small-experiment",
  "vary-and-connect",
  "retrieve-evaluate-and-consolidate",
];

export const DAY_ROLE_LABELS = {
  "research-and-orientation": "Forschungsimpuls und Orientierung",
  "observe-and-diagnose": "Wahrnehmen und diagnostizieren",
  "small-experiment": "Kleine Erprobung",
  "vary-and-connect": "Variieren und vernetzen",
  "retrieve-evaluate-and-consolidate": "Abrufen, auswerten und sichern",
};

export const SUBJECTS = {
  german: { label: "Deutsch" },
  english: { label: "Englisch", subject: "Englisch" },
  french: { label: "Französisch" },
  latin: { label: "Latein" },
  spanish: { label: "Spanisch" },
  "other-foreign-language": { label: "Weitere Fremdsprache" },
  mathematics: { label: "Mathematik" },
  biology: { label: "Biologie" },
  chemistry: { label: "Chemie" },
  physics: { label: "Physik" },
  "nature-technology": { label: "Natur und Technik" },
  "computer-science": { label: "Informatik" },
  geography: { label: "Geografie" },
  history: { label: "Geschichte" },
  "politics-social-studies": { label: "Politik / Sozialkunde" },
  "economics-law": { label: "Wirtschaft und Recht" },
  bwr: { label: "BwR", subject: "BwR" },
  "career-orientation": { label: "Berufsorientierung" },
  religion: { label: "Religion" },
  ethics: { label: "Ethik" },
  art: { label: "Kunst" },
  music: { label: "Musik" },
  sport: { label: "Sport" },
  "crafts-technology": { label: "Werken / Technik" },
  "nutrition-health": { label: "Ernährung und Gesundheit" },
  "remedial-education": { label: "Förderunterricht" },
  "other-subject": { label: "Anderes Fach" },
};

export const SUBJECT_GROUPS = [
  { legend: "Sprachen", ids: ["german", "english", "french", "latin", "spanish", "other-foreign-language"] },
  { legend: "Mathematik, Naturwissenschaften und Informatik", ids: ["mathematics", "biology", "chemistry", "physics", "nature-technology", "computer-science"] },
  { legend: "Gesellschaft, Wirtschaft und Orientierung", ids: ["geography", "history", "politics-social-studies", "economics-law", "bwr", "career-orientation"] },
  { legend: "Religion, Kultur, Sport und Praxis", ids: ["religion", "ethics", "art", "music", "sport", "crafts-technology", "nutrition-health", "remedial-education", "other-subject"] },
];

// Only used by the 1.0.0 compatibility adapter. "general" is deliberately
// not a selectable subject in the current profile model.
export const CONTEXTS = { general: { label: "Fachübergreifend / keine Schwerpunktsetzung" }, ...SUBJECTS };

const LEGACY_CONTEXT_ALIASES = {
  Allgemein: "general",
  "Allgemeiner Fachunterricht": "general",
  Deutsch: "german",
  Englisch: "english",
  Französisch: "french",
  Latein: "latin",
  Spanisch: "spanish",
  "Weitere Fremdsprache": "other-foreign-language",
  Mathematik: "mathematics",
  Biologie: "biology",
  Chemie: "chemistry",
  Physik: "physics",
  "Natur und Technik": "nature-technology",
  Informatik: "computer-science",
  Geografie: "geography",
  Geschichte: "history",
  "Politik / Sozialkunde": "politics-social-studies",
  "Wirtschaft und Recht": "economics-law",
  BwR: "bwr",
  Berufsorientierung: "career-orientation",
  Religion: "religion",
  Ethik: "ethics",
  Kunst: "art",
  Musik: "music",
  Sport: "sport",
  "Werken / Technik": "crafts-technology",
  "Ernährung und Gesundheit": "nutrition-health",
  Förderunterricht: "remedial-education",
  "Anderes Fach": "other-subject",
};

export function normalizeContextCode(value) {
  if (value == null || value === "") return "general";
  if (Object.hasOwn(CONTEXTS, value)) return value;
  if (["teacher-education", "teacherEducation", "Fortbildung / Lehrerbildung"].includes(value)) return "general";
  return LEGACY_CONTEXT_ALIASES[value] ?? "general";
}

export function subjectSelectionFromProfile(profile = {}) {
  profile = profile ?? {};
  if (profile.subjectSelectionMode === "subjects") {
    const subjectIds = [...new Set((profile.subjectProfiles ?? []).map((item) => item.subjectId).filter((id) => Object.hasOwn(SUBJECTS, id)))];
    if (subjectIds.length) return { mode: "subjects", subjectIds, otherSubjectLabel: profile.otherSubjectLabel ?? "" };
  }
  if (profile.subjectSelectionMode === "general") return { mode: "general", subjectIds: [], otherSubjectLabel: "" };

  const fromProfiles = [...new Set((profile.subjectProfiles ?? []).map((item) => {
    if (item.subjectId && Object.hasOwn(SUBJECTS, item.subjectId)) return item.subjectId;
    return normalizeContextCode(item.subject);
  }).filter((id) => id !== "general" && Object.hasOwn(SUBJECTS, id)))];
  if (fromProfiles.length) return { mode: "subjects", subjectIds: fromProfiles, otherSubjectLabel: profile.otherSubjectLabel ?? "" };

  const legacy = normalizeContextCode(profile.preferredContext);
  return legacy === "general"
    ? { mode: "general", subjectIds: [], otherSubjectLabel: "" }
    : { mode: "subjects", subjectIds: [legacy], otherSubjectLabel: profile.otherSubjectLabel ?? "" };
}

export function buildSubjectProfiles(subjectIds, existing = [], createId = (id) => `subject-profile.${id}`) {
  const bySubject = new Map(existing.map((item) => [item.subjectId ?? normalizeContextCode(item.subject), item]));
  return [...new Set(subjectIds)]
    .filter((id) => Object.hasOwn(SUBJECTS, id))
    .map((subjectId) => ({
      ...(bySubject.get(subjectId) ?? {}),
      subjectProfileId: bySubject.get(subjectId)?.subjectProfileId ?? createId(subjectId),
      subjectId,
      subject: SUBJECTS[subjectId].label,
      gradeLevels: bySubject.get(subjectId)?.gradeLevels ?? [],
    }));
}

export const WEEKDAYS = [
  { value: 1, short: "Mo", label: "Montag" },
  { value: 2, short: "Di", label: "Dienstag" },
  { value: 3, short: "Mi", label: "Mittwoch" },
  { value: 4, short: "Do", label: "Donnerstag" },
  { value: 5, short: "Fr", label: "Freitag" },
  { value: 6, short: "Sa", label: "Samstag" },
  { value: 7, short: "So", label: "Sonntag" },
];

export const PERSONAL_MARK_FIELDS = ["rememberedAt", "deepenAt"];
export const IMPLEMENTATION_MARK_FIELDS = ["wantToTryAt", "triedAt"];

export function isDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function dateOnlyInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addDays(dateOnly, amount) {
  const date = new Date(`${dateOnly}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function isoWeekday(dateOnly) {
  const day = new Date(`${dateOnly}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function nextActiveDates(startDate, activeWeekdays, count = 5) {
  if (!isDateOnly(startDate)) throw new TypeError("Ungültiges Startdatum.");
  const normalized = [...new Set(activeWeekdays.map(Number))].sort((a, b) => a - b);
  if (!normalized.length || normalized.some((day) => day < 1 || day > 7)) {
    throw new TypeError("Mindestens ein gültiger aktiver Wochentag ist erforderlich.");
  }

  const dates = [];
  let candidate = startDate;
  const maximumCalendarDays = Math.max(370, count * 8);
  for (let offset = 0; dates.length < count && offset < maximumCalendarDays; offset += 1) {
    if (normalized.includes(isoWeekday(candidate))) dates.push(candidate);
    candidate = addDays(candidate, 1);
  }
  if (dates.length !== count) throw new Error("Aktive Tage konnten nicht vollständig ermittelt werden.");
  return dates;
}

export function orderCardsByThemeWeeks(themeWeeks, cards) {
  if (!Array.isArray(themeWeeks) || themeWeeks.length < 1) {
    throw new Error("Mindestens eine Themenwoche ist erforderlich.");
  }
  if (!Array.isArray(cards)) throw new Error("Die EduCoffee-Karten fehlen.");

  const weekIds = new Set();
  const cardIds = new Set();
  for (const card of cards) {
    if (!card?.id || cardIds.has(card.id)) throw new Error(`Doppelte oder fehlende Content-ID: ${card?.id ?? "(fehlt)"}.`);
    cardIds.add(card.id);
  }

  const orderedCards = [];
  themeWeeks.forEach((week, weekIndex) => {
    if (!week?.weekId || weekIds.has(week.weekId)) {
      throw new Error(`Doppelte oder fehlende Themenwochen-ID an Position ${weekIndex + 1}.`);
    }
    weekIds.add(week.weekId);
    if (!Array.isArray(week.dayIds) || week.dayIds.length !== 5 || new Set(week.dayIds).size !== 5) {
      throw new Error(`Die Themenwoche ${week.weekId} muss genau fünf eindeutige Karten enthalten.`);
    }

    const weekCards = cards.filter((card) => card.themeWeekId === week.weekId);
    if (weekCards.length !== 5) {
      throw new Error(`Die Themenwoche ${week.weekId} muss genau fünf Karten enthalten.`);
    }
    const orderedWeekCards = [...weekCards].sort((a, b) => a.sequence - b.sequence);
    orderedWeekCards.forEach((card, cardIndex) => {
      const expectedSequence = cardIndex + 1;
      if (card.sequence !== expectedSequence) {
        throw new Error(`Die Themenwoche ${week.weekId} benötigt die Sequenzen 1 bis 5 genau einmal.`);
      }
      if (week.dayIds[cardIndex] !== card.id) {
        throw new Error(`Die Kartenreihenfolge der Themenwoche ${week.weekId} ist bei Schritt ${expectedSequence} inkonsistent.`);
      }
    });
    orderedCards.push(...orderedWeekCards);
  });

  if (orderedCards.length !== cards.length) {
    const unknown = cards.find((card) => !weekIds.has(card.themeWeekId));
    throw new Error(`Karte verweist auf eine unbekannte Themenwoche: ${unknown?.id ?? "(unbekannt)"}.`);
  }
  return orderedCards;
}

function assignmentFromCard({ profileId, card, scheduledActiveDate, assignedAt, contentOrder, themeWeekOrder }) {
  return {
    profileId,
    eduCoffeeDayId: card.id,
    contentId: card.id,
    contentRevision: card.contentRevision,
    weekId: card.themeWeekId,
    sequence: card.sequence,
    contentOrder,
    themeWeekOrder,
    scheduledActiveDate,
    assignedAt,
    updatedAt: assignedAt,
  };
}

export function createAssignments({ profileId, themeWeeks, cards, startDate, activeWeekdays, assignedAt }) {
  const orderedCards = orderCardsByThemeWeeks(themeWeeks, cards);
  const dates = nextActiveDates(startDate, activeWeekdays, orderedCards.length);
  const weekOrder = new Map(themeWeeks.map((week, index) => [week.weekId, index + 1]));
  return orderedCards.map((card, index) => assignmentFromCard({
    profileId,
    card,
    scheduledActiveDate: dates[index],
    assignedAt,
    contentOrder: index + 1,
    themeWeekOrder: weekOrder.get(card.themeWeekId),
  }));
}

export function createMissingAssignments({
  profileId,
  themeWeeks,
  cards,
  existingAssignments = [],
  startDate,
  activeWeekdays,
  assignedAt,
}) {
  const orderedCards = orderCardsByThemeWeeks(themeWeeks, cards);
  const existingIds = new Set();
  for (const assignment of existingAssignments) {
    if (!assignment?.contentId || existingIds.has(assignment.contentId)) {
      throw new Error(`Doppelte oder fehlende bestehende Content-ID: ${assignment?.contentId ?? "(fehlt)"}.`);
    }
    existingIds.add(assignment.contentId);
  }

  const missingCards = orderedCards.filter((card) => !existingIds.has(card.id));
  if (!missingCards.length) return [];

  let firstCandidate = startDate;
  if (existingAssignments.length) {
    const scheduledDates = existingAssignments.map((assignment) => assignment.scheduledActiveDate);
    if (scheduledDates.some((date) => !isDateOnly(date))) {
      throw new Error("Eine bestehende Tageszuweisung besitzt kein gültiges Datum.");
    }
    firstCandidate = addDays(scheduledDates.toSorted().at(-1), 1);
  }

  const dates = nextActiveDates(firstCandidate, activeWeekdays, missingCards.length);
  const contentOrder = new Map(orderedCards.map((card, index) => [card.id, index + 1]));
  const weekOrder = new Map(themeWeeks.map((week, index) => [week.weekId, index + 1]));
  return missingCards.map((card, index) => assignmentFromCard({
    profileId,
    card,
    scheduledActiveDate: dates[index],
    assignedAt,
    contentOrder: contentOrder.get(card.id),
    themeWeekOrder: weekOrder.get(card.themeWeekId),
  }));
}

export function resolveTodaySchedule(progress, today) {
  if (!isDateOnly(today)) throw new TypeError("Ungültiges Tagesdatum.");
  const ordered = [...progress].sort(
    (a, b) => String(a.scheduledActiveDate).localeCompare(String(b.scheduledActiveDate))
      || String(a.contentId).localeCompare(String(b.contentId)),
  );
  return {
    exact: ordered.find((record) => record.scheduledActiveDate === today) ?? null,
    next: ordered.find((record) => record.scheduledActiveDate > today) ?? null,
  };
}

export function selectPracticeVariant(card, contextCode) {
  const general = card.practiceImpulses.find((item) => item.variantType === "general");
  if (!general) throw new Error(`Allgemeine Praxisvariante fehlt: ${card.id}`);
  const normalizedContext = normalizeContextCode(contextCode);
  const context = CONTEXTS[normalizedContext];
  if (normalizedContext === "general") return { impulse: general, usedFallback: false };

  const match = card.practiceImpulses
    .filter((item) => item.variantType !== "general")
    .sort((a, b) => a.impulseId.localeCompare(b.impulseId))
    .find((item) => {
      const criteria = item.audienceCriteria ?? {};
      if (context.subject) return criteria.subjects?.includes(context.subject);
      if (context.role) return criteria.role === context.role;
      return false;
    });
  return { impulse: match ?? general, usedFallback: !match };
}

function applicabilityFromLegacy(item) {
  if (item.variantType === "general" || item.context === "general") return { type: "general" };
  const subjectIds = Object.entries(SUBJECTS)
    .filter(([, value]) => (item.audienceCriteria?.subjects ?? []).includes(value.subject))
    .map(([id]) => id);
  if (item.context && Object.hasOwn(SUBJECTS, item.context)) subjectIds.push(item.context);
  return subjectIds.length ? { type: "subjects", subjectIds: [...new Set(subjectIds)] } : null;
}

function normalizeLegacyLearningAction(text) {
  return text?.replace("Alle formulieren etwa 60 Sekunden lang", "Alle formulieren zunächst") ?? text;
}

export function normalizeImplementations(card) {
  if (Array.isArray(card.implementations)) {
    return card.implementations
      .filter((item) => item?.implementationId && item?.title && item?.learningAction)
      .map((item, index) => ({ ...item, editorialOrder: Number(item.editorialOrder ?? (index + 1) * 10) }));
  }

  const legacy = [
    ...(card.practiceImpulses ?? []).map((item, index) => ({
      implementationId: item.impulseId,
      editorialOrder: (index + 1) * 10,
      applicability: applicabilityFromLegacy(item),
      title: item.title,
      learningAction: normalizeLegacyLearningAction(item.learningAction),
      observationPrompt: item.observationFocus || undefined,
      variation: item.variantType === "general" ? item.fallbackAction || undefined : undefined,
    })),
    ...(card.additionalPracticeIdeas ?? []).map((item, index) => ({
      implementationId: item.practiceIdeaId,
      editorialOrder: 100 + (index + 1) * 10,
      applicability: applicabilityFromLegacy(item),
      title: item.title,
      learningAction: item.learningAction,
      observationPrompt: item.observationFocus || undefined,
      variation: item.variation || undefined,
    })),
  ];
  return legacy.filter((item) => item.applicability && item.implementationId && item.title && item.learningAction);
}

function isEligibleImplementation(item, selection, filterSubjectId = null) {
  if (item.applicability?.type === "general") return true;
  if (item.applicability?.type !== "subjects") return false;
  const selected = filterSubjectId ? [filterSubjectId] : selection.subjectIds;
  return item.applicability.subjectIds.some((id) => selected.includes(id));
}

export function selectImplementations(card, selection, filterSubjectId = null, limit = 3) {
  const normalized = subjectSelectionFromProfile({
    subjectSelectionMode: selection?.mode,
    subjectProfiles: (selection?.subjectIds ?? []).map((subjectId) => ({ subjectId })),
  });
  return normalizeImplementations(card)
    .filter((item) => isEligibleImplementation(item, normalized, filterSubjectId))
    .sort((a, b) => a.editorialOrder - b.editorialOrder || a.implementationId.localeCompare(b.implementationId))
    .slice(0, Math.max(0, Math.min(3, limit)));
}

export function implementationFilterOptions(card, selection) {
  if (selection?.mode !== "subjects" || selection.subjectIds.length < 1) return [];
  const allIds = selectImplementations(card, selection).map((item) => item.implementationId).join("|");
  const usefulSubjects = selection.subjectIds.filter((subjectId) => {
    const filteredIds = selectImplementations(card, selection, subjectId).map((item) => item.implementationId).join("|");
    return filteredIds !== allIds;
  });
  return usefulSubjects.length ? ["all", ...usefulSubjects] : [];
}

export function implementationSubjectLabel(item) {
  if (item.applicability?.type !== "subjects") return "";
  return item.applicability.subjectIds.map((id) => SUBJECTS[id]?.label).filter(Boolean).join(", ");
}

export function deriveSavedState(record) {
  if (record.deepenAt) return "deepen";
  if (record.rememberedAt) return "saved";
  return "none";
}

export function updatePersonalMark(record, field, enabled, now) {
  if (!PERSONAL_MARK_FIELDS.includes(field)) throw new TypeError("Unbekannte persönliche Markierung.");
  const next = { ...record };
  if (enabled) next[field] = now;
  else delete next[field];
  next.savedState = deriveSavedState(next);
  next.updatedAt = now;
  return next;
}

export function updateReadState(record, enabled, now) {
  const next = { ...record, updatedAt: now };
  if (enabled) {
    next.completedAt = now;
    next.readAt = now;
    next.completionMode = "read";
  } else {
    delete next.completedAt;
    delete next.readAt;
    delete next.completionMode;
  }
  return next;
}

export function formatLocalDate(dateOnly, locale = "de-DE") {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateOnly}T12:00:00Z`));
}

export function qaDateFromLocation(locationLike) {
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(locationLike.hostname);
  if (!isLocal) return null;
  const candidate = new URLSearchParams(locationLike.search).get("qaDate");
  return isDateOnly(candidate) ? candidate : null;
}

export function qaFlag(locationLike, name) {
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(locationLike.hostname);
  return isLocal && new URLSearchParams(locationLike.search).get(name) === "1";
}
