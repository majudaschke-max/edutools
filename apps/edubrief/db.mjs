import {
  buildSubjectProfiles,
  deriveSavedState,
  IMPLEMENTATION_MARK_FIELDS,
  normalizeContextCode,
  normalizeImplementations,
  PERSONAL_MARK_FIELDS,
  selectPracticeVariant,
  subjectSelectionFromProfile,
  updatePersonalMark,
  updateReadState,
} from "./domain.mjs";

export const DB_NAME = "edubrief";
export const DB_VERSION = 1;
export const PERSONAL_SCHEMA_VERSION = "1.2.0-foundation-collection";
export const CONTENT_SCHEMA_VERSION = "3.0.0-distribution";

export const CONTENT_STORES = ["contentPackages", "contentItems", "contentTombstones", "contentMeta"];
export const PERSONAL_STORES = [
  "userProfiles",
  "calendarConfigurations",
  "eduCoffeeProgress",
  "savedItems",
  "collections",
  "collectionItems",
  "personalNotes",
  "practicePlans",
  "practiceExperiences",
  "personalMeta",
];

export class StorageUnavailableError extends Error {
  constructor(message = "Die lokale Speicherung ist nicht verfügbar.") {
    super(message);
    this.name = "StorageUnavailableError";
    this.code = "STORAGE_UNAVAILABLE";
  }
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function transactionToPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB-Transaktion abgebrochen.")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB-Transaktion fehlgeschlagen.")), { once: true });
  });
}

function createIndex(store, name, keyPath, options = {}) {
  if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, options);
}

function createStores(database) {
  if (!database.objectStoreNames.contains("contentPackages")) {
    const store = database.createObjectStore("contentPackages", { keyPath: ["packageId", "contentVersion"] });
    createIndex(store, "packageId", "packageId");
    createIndex(store, "contentVersion", "contentVersion");
    createIndex(store, "publisherId", "publisherId");
    createIndex(store, "installationStatus", "installationStatus");
  }
  if (!database.objectStoreNames.contains("contentItems")) {
    const store = database.createObjectStore("contentItems", { keyPath: "contentId" });
    createIndex(store, "packageId", "packageId");
    createIndex(store, "topicId", "topicId");
    createIndex(store, "weekId", "weekId");
    createIndex(store, "publicationStatus", "publicationStatus");
    createIndex(store, "contentType", "contentType");
    createIndex(store, "contentRevision", "contentRevision");
  }
  if (!database.objectStoreNames.contains("contentTombstones")) {
    const store = database.createObjectStore("contentTombstones", { keyPath: "contentId" });
    createIndex(store, "withdrawnAt", "withdrawnAt");
    createIndex(store, "sourcePackageVersion", "sourcePackageVersion");
    createIndex(store, "replacementContentId", "replacementContentId");
  }
  if (!database.objectStoreNames.contains("contentMeta")) database.createObjectStore("contentMeta", { keyPath: "key" });

  if (!database.objectStoreNames.contains("userProfiles")) {
    const store = database.createObjectStore("userProfiles", { keyPath: "profileId" });
    createIndex(store, "updatedAt", "updatedAt");
  }
  if (!database.objectStoreNames.contains("calendarConfigurations")) {
    const store = database.createObjectStore("calendarConfigurations", { keyPath: "profileId" });
    createIndex(store, "calendarMode", "calendarMode");
    createIndex(store, "updatedAt", "updatedAt");
  }
  if (!database.objectStoreNames.contains("eduCoffeeProgress")) {
    const store = database.createObjectStore("eduCoffeeProgress", { keyPath: ["profileId", "eduCoffeeDayId"] });
    createIndex(store, "profileId", "profileId");
    createIndex(store, "weekId", "weekId");
    createIndex(store, "scheduledActiveDate", "scheduledActiveDate");
    createIndex(store, "completedAt", "completedAt");
  }
  if (!database.objectStoreNames.contains("savedItems")) {
    const store = database.createObjectStore("savedItems", { keyPath: ["profileId", "contentId"] });
    createIndex(store, "profileId", "profileId");
    createIndex(store, "savedState", "savedState");
    createIndex(store, "updatedAt", "updatedAt");
  }
  if (!database.objectStoreNames.contains("collections")) {
    const store = database.createObjectStore("collections", { keyPath: "collectionId" });
    createIndex(store, "profileId", "profileId");
    createIndex(store, "updatedAt", "updatedAt");
  }
  if (!database.objectStoreNames.contains("collectionItems")) {
    const store = database.createObjectStore("collectionItems", { keyPath: ["collectionId", "contentId"] });
    createIndex(store, "profileId", "profileId");
    createIndex(store, "contentId", "contentId");
    createIndex(store, "addedAt", "addedAt");
  }
  if (!database.objectStoreNames.contains("personalNotes")) {
    const store = database.createObjectStore("personalNotes", { keyPath: "noteId" });
    createIndex(store, "profileId", "profileId");
    createIndex(store, "profileContent", ["profileId", "contentId"]);
    createIndex(store, "noteStatus", "noteStatus");
    createIndex(store, "updatedAt", "updatedAt");
  }
  if (!database.objectStoreNames.contains("practicePlans")) {
    const store = database.createObjectStore("practicePlans", { keyPath: "planId" });
    createIndex(store, "profileId", "profileId");
    createIndex(store, "contentId", "contentId");
    createIndex(store, "status", "status");
    createIndex(store, "plannedStartDate", "plannedFor.startDate");
    createIndex(store, "updatedAt", "updatedAt");
  }
  if (!database.objectStoreNames.contains("practiceExperiences")) {
    const store = database.createObjectStore("practiceExperiences", { keyPath: "experienceId" });
    createIndex(store, "profileId", "profileId");
    createIndex(store, "contentId", "contentId");
    createIndex(store, "planId", "planId");
    createIndex(store, "updatedAt", "updatedAt");
  }
  if (!database.objectStoreNames.contains("personalMeta")) database.createObjectStore("personalMeta", { keyPath: "key" });
}

export async function openDatabase() {
  if (!("indexedDB" in globalThis)) throw new StorageUnavailableError();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.addEventListener("upgradeneeded", () => createStores(request.result));
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("blocked", () => reject(new StorageUnavailableError("Die lokale Datenbank wird von einer anderen App-Version blockiert.")), { once: true });
    request.addEventListener("error", () => reject(new StorageUnavailableError(request.error?.message)), { once: true });
  });
}

export async function verifyStorage(database) {
  const transaction = database.transaction("personalMeta", "readwrite");
  const store = transaction.objectStore("personalMeta");
  const testRecord = { key: "__startup-write-test__", checkedAt: new Date().toISOString() };
  store.put(testRecord);
  store.delete(testRecord.key);
  await transactionToPromise(transaction);
  return true;
}

export async function installContentPackage(database, manifest, content, validatedAt) {
  const transaction = database.transaction(CONTENT_STORES, "readwrite");
  const completion = transactionToPromise(transaction);
  const packages = transaction.objectStore("contentPackages");
  const items = transaction.objectStore("contentItems");
  const tombstones = transaction.objectStore("contentTombstones");
  const meta = transaction.objectStore("contentMeta");

  packages.put({
    packageId: manifest.packageId,
    contentVersion: manifest.contentVersion,
    publisherId: manifest.publisherId,
    installationStatus: "active",
    manifest,
    content,
    manifestHash: manifest.manifestHash,
    validatedAt,
  });
  items.clear();
  for (const source of content.sources) {
    items.put({ ...source, contentId: source.sourceId, packageId: manifest.packageId, contentType: "source", publicationStatus: "P3", contentRevision: 1 });
  }
  for (const topic of content.topics) {
    items.put({ ...topic, contentId: topic.topicId, packageId: manifest.packageId, contentType: "topic", publicationStatus: "P3", contentRevision: 1 });
  }
  for (const week of content.themeWeeks) {
    items.put({ ...week, contentId: week.weekId, packageId: manifest.packageId, weekId: week.weekId, contentType: "themeWeek", publicationStatus: "P3", contentRevision: 1 });
  }
  for (const card of content.cards) {
    items.put({
      ...card,
      contentId: card.id,
      packageId: manifest.packageId,
      weekId: card.themeWeekId,
      publicationStatus: card.reviewState.publicationStatus,
      contentType: "eduCoffeeDay",
    });
  }
  for (const tombstone of content.tombstones) tombstones.put(tombstone);
  meta.put({
    key: "active-package",
    activePackageId: manifest.packageId,
    activeContentVersion: manifest.contentVersion,
    lastKnownGoodPackageId: manifest.packageId,
    lastKnownGoodContentVersion: manifest.contentVersion,
    highestInstalledPackageId: manifest.packageId,
    highestInstalledContentVersion: manifest.contentVersion,
    activePublisherId: manifest.publisherId,
    schemaVersion: manifest.schemaVersion ?? CONTENT_SCHEMA_VERSION,
    lastSuccessfulValidationAt: validatedAt,
  });
  await completion;
}

export async function loadInstalledPackage(database) {
  const transaction = database.transaction(["contentMeta", "contentPackages"], "readonly");
  const meta = await requestToPromise(transaction.objectStore("contentMeta").get("active-package"));
  if (!meta) return null;
  const record = await requestToPromise(
    transaction.objectStore("contentPackages").get([meta.activePackageId, meta.activeContentVersion]),
  );
  await transactionToPromise(transaction);
  return record ? { manifest: record.manifest, content: record.content, validatedAt: record.validatedAt } : null;
}

export async function getActiveProfile(database) {
  const transaction = database.transaction(["personalMeta", "userProfiles", "calendarConfigurations"], "readonly");
  const active = await requestToPromise(transaction.objectStore("personalMeta").get("active-profile"));
  if (!active?.profileId) return null;
  const profile = await requestToPromise(transaction.objectStore("userProfiles").get(active.profileId));
  const calendar = await requestToPromise(transaction.objectStore("calendarConfigurations").get(active.profileId));
  await transactionToPromise(transaction);
  return profile && calendar ? { profile, calendar } : null;
}

export async function migrateSubjectProfile(database, profile, now = new Date().toISOString()) {
  const legacyContext = normalizeContextCode(profile.preferredContext);
  const selection = subjectSelectionFromProfile(profile);
  const canonicalProfiles = selection.mode === "subjects"
    ? buildSubjectProfiles(selection.subjectIds, profile.subjectProfiles, (id) => `${profile.profileId}.${id}`)
    : [];
  const alreadyCanonical = profile.subjectSelectionMode === selection.mode
    && !Object.hasOwn(profile, "preferredContext")
    && JSON.stringify(profile.subjectProfiles ?? []) === JSON.stringify(canonicalProfiles);
  if (alreadyCanonical) return { profile, migrated: false, legacyContext };
  const { preferredContext: _removed, ...rest } = profile;
  const migratedProfile = {
    ...rest,
    subjectSelectionMode: selection.mode,
    subjectProfiles: canonicalProfiles,
    otherSubjectLabel: selection.mode === "subjects" && selection.subjectIds.includes("other-subject") ? selection.otherSubjectLabel : "",
    updatedAt: now,
  };
  const transaction = database.transaction("userProfiles", "readwrite");
  transaction.objectStore("userProfiles").put(migratedProfile);
  await transactionToPromise(transaction);
  return { profile: migratedProfile, migrated: true, legacyContext };
}

export async function completeOnboarding(database, profile, calendar, assignments) {
  const transaction = database.transaction(
    ["userProfiles", "calendarConfigurations", "eduCoffeeProgress", "personalMeta"],
    "readwrite",
  );
  const completion = transactionToPromise(transaction);
  transaction.objectStore("userProfiles").put(profile);
  transaction.objectStore("calendarConfigurations").put(calendar);
  const progress = transaction.objectStore("eduCoffeeProgress");
  for (const assignment of assignments) progress.put(assignment);
  transaction.objectStore("personalMeta").put({ key: "active-profile", profileId: profile.profileId, updatedAt: profile.updatedAt });
  transaction.objectStore("personalMeta").put({ key: "personal-schema", schemaVersion: PERSONAL_SCHEMA_VERSION, updatedAt: profile.updatedAt });
  await completion;
}

export async function getProgressForProfile(database, profileId) {
  const transaction = database.transaction("eduCoffeeProgress", "readonly");
  const records = await requestToPromise(transaction.objectStore("eduCoffeeProgress").index("profileId").getAll(profileId));
  await transactionToPromise(transaction);
  return records.sort(
    (a, b) => String(a.scheduledActiveDate).localeCompare(String(b.scheduledActiveDate))
      || String(a.contentId).localeCompare(String(b.contentId)),
  );
}

export async function appendProgressAssignments(database, assignments) {
  if (!assignments.length) return 0;
  const transaction = database.transaction("eduCoffeeProgress", "readwrite");
  const completion = transactionToPromise(transaction);
  const store = transaction.objectStore("eduCoffeeProgress");
  let added = 0;
  for (const assignment of assignments) {
    const key = [assignment.profileId, assignment.eduCoffeeDayId];
    const existing = await requestToPromise(store.get(key));
    if (!existing) {
      store.put(assignment);
      added += 1;
    }
  }
  await completion;
  return added;
}

export async function openEduCoffee(database, profileId, contentId, now) {
  const transaction = database.transaction("eduCoffeeProgress", "readwrite");
  const store = transaction.objectStore("eduCoffeeProgress");
  const record = await requestToPromise(store.get([profileId, contentId]));
  if (!record) throw new Error("Die Tageszuweisung wurde nicht gefunden.");
  const next = {
    ...record,
    firstOpenedAt: record.firstOpenedAt ?? now,
    lastOpenedAt: now,
    lastReadBlockId: record.lastReadBlockId ?? "guiding-question",
    updatedAt: now,
  };
  store.put(next);
  await transactionToPromise(transaction);
  return next;
}

export async function setEduCoffeeRead(database, profileId, contentId, enabled, now) {
  const transaction = database.transaction("eduCoffeeProgress", "readwrite");
  const store = transaction.objectStore("eduCoffeeProgress");
  const record = await requestToPromise(store.get([profileId, contentId]));
  if (!record) throw new Error("Die Tageszuweisung wurde nicht gefunden.");
  const next = updateReadState(record, enabled, now);
  store.put(next);
  await transactionToPromise(transaction);
  return next;
}

export async function getSavedItem(database, profileId, contentId) {
  const transaction = database.transaction("savedItems", "readonly");
  const record = await requestToPromise(transaction.objectStore("savedItems").get([profileId, contentId]));
  await transactionToPromise(transaction);
  return record ?? null;
}

export async function setPersonalMark(database, { profileId, contentId, contentRevision, field, enabled, now }) {
  if (!PERSONAL_MARK_FIELDS.includes(field)) throw new TypeError("Unbekannte persönliche Markierung.");
  const transaction = database.transaction("savedItems", "readwrite");
  const store = transaction.objectStore("savedItems");
  const existing = (await requestToPromise(store.get([profileId, contentId]))) ?? {
    profileId,
    contentId,
    contentRevision,
    referenceStatus: "current",
    createdAt: now,
  };
  const next = updatePersonalMark(existing, field, enabled, now);
  if (deriveSavedState(next) === "none") store.delete([profileId, contentId]);
  else store.put(next);
  await transactionToPromise(transaction);
  return deriveSavedState(next) === "none" ? null : next;
}

export async function getImplementationStates(database, profileId, contentId) {
  const transaction = database.transaction("practicePlans", "readonly");
  const plans = await requestToPromise(transaction.objectStore("practicePlans").index("contentId").getAll(contentId));
  await transactionToPromise(transaction);
  const states = {};
  for (const plan of plans.filter((item) => item.profileId === profileId && item.implementationId)) {
    states[plan.implementationId] = { savedAt: plan.wantToTryAt ?? plan.savedAt ?? plan.createdAt };
  }
  return states;
}

export async function getSavedImplementations(database, profileId) {
  const transaction = database.transaction("practicePlans", "readonly");
  const records = await requestToPromise(transaction.objectStore("practicePlans").index("profileId").getAll(profileId));
  await transactionToPromise(transaction);
  return records
    .filter((item) => item.implementationId && item.contentId)
    .map((item) => ({ ...item, savedAt: item.wantToTryAt ?? item.savedAt ?? item.createdAt }))
    .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)) || a.implementationId.localeCompare(b.implementationId));
}

export async function setImplementationSaved(database, { profileId, contentId, implementationId, enabled, now }) {
  const planId = `${profileId}::${implementationId}`;
  const transaction = database.transaction("practicePlans", "readwrite");
  const store = transaction.objectStore("practicePlans");
  if (enabled) {
    const existing = await requestToPromise(store.get(planId));
    store.put({
      ...(existing ?? {}),
      planId,
      profileId,
      contentId,
      implementationId,
      wantToTryAt: existing?.wantToTryAt ?? existing?.savedAt ?? now,
      status: "planned",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  } else {
    store.delete(planId);
  }
  await transactionToPromise(transaction);
  return getSavedImplementations(database, profileId);
}

export function planUnifiedImplementationMarks(plans, experiences, profileId, now = new Date().toISOString()) {
  const relevantPlans = plans.filter((item) => item.profileId === profileId && item.implementationId && item.contentId);
  const relevantExperiences = experiences.filter((item) => item.profileId === profileId && item.implementationId && item.contentId);
  const implementationIds = new Set(relevantPlans.map((item) => item.implementationId));
  const additions = [];
  let deduplicated = 0;

  for (const experience of relevantExperiences) {
    if (implementationIds.has(experience.implementationId)) {
      deduplicated += 1;
      continue;
    }
    const savedAt = experience.triedAt ?? experience.createdAt ?? now;
    additions.push({
      planId: `${profileId}::${experience.implementationId}`,
      profileId,
      contentId: experience.contentId,
      implementationId: experience.implementationId,
      wantToTryAt: savedAt,
      status: "planned",
      createdAt: experience.createdAt ?? savedAt,
      updatedAt: now,
      migratedFrom: "practiceExperiences.triedAt",
    });
    implementationIds.add(experience.implementationId);
  }

  return {
    additions,
    migratedFromTried: additions.length,
    deduplicated,
    retainedLegacyExperienceRecords: relevantExperiences.length,
  };
}

export async function migrateUnifiedImplementationMarks(database, profileId, now = new Date().toISOString()) {
  const markerKey = `migration::unified-practice-save::1.0.3.1::${profileId}`;
  const transaction = database.transaction(["practicePlans", "practiceExperiences", "personalMeta"], "readwrite");
  const completion = transactionToPromise(transaction);
  const meta = transaction.objectStore("personalMeta");
  if (await requestToPromise(meta.get(markerKey))) {
    transaction.abort();
    try { await completion; } catch { /* erwarteter Abbruch ohne Schreibzugriff */ }
    return { migrated: false, migratedFromTried: 0, deduplicated: 0 };
  }

  const plansStore = transaction.objectStore("practicePlans");
  const experiencesStore = transaction.objectStore("practiceExperiences");
  const plans = await requestToPromise(plansStore.index("profileId").getAll(profileId));
  const experiences = await requestToPromise(experiencesStore.index("profileId").getAll(profileId));
  const migration = planUnifiedImplementationMarks(plans, experiences, profileId, now);
  for (const addition of migration.additions) plansStore.put(addition);

  meta.put({
    key: markerKey,
    completedAt: now,
    migratedFromTried: migration.migratedFromTried,
    deduplicated: migration.deduplicated,
    retainedLegacyExperienceRecords: migration.retainedLegacyExperienceRecords,
  });
  await completion;
  return { migrated: true, migratedFromTried: migration.migratedFromTried, deduplicated: migration.deduplicated };
}

export function planImplementationAliasMigration(plans, cards, profileId, now = new Date().toISOString()) {
  const aliasTargets = new Map();
  for (const card of cards) {
    for (const implementation of normalizeImplementations(card)) {
      for (const legacyId of implementation.legacyImplementationIds ?? []) {
        if (aliasTargets.has(legacyId)) throw new Error(`Doppelte Legacy-Umsetzungs-ID: ${legacyId}.`);
        aliasTargets.set(legacyId, {
          contentId: card.id,
          implementationId: implementation.implementationId,
        });
      }
    }
  }

  const relevant = plans.filter((plan) => plan.profileId === profileId && plan.implementationId);
  const byPlanId = new Map(relevant.map((plan) => [plan.planId, plan]));
  const puts = new Map();
  const deletePlanIds = new Set();
  let migratedRecords = 0;
  let deduplicatedRecords = 0;

  for (const plan of relevant) {
    const target = aliasTargets.get(plan.implementationId);
    if (!target) continue;
    const targetPlanId = `${profileId}::${target.implementationId}`;
    const existing = puts.get(targetPlanId) ?? byPlanId.get(targetPlanId);
    const savedCandidates = [
      existing?.wantToTryAt,
      existing?.savedAt,
      existing?.createdAt,
      plan.wantToTryAt,
      plan.savedAt,
      plan.createdAt,
    ].filter(Boolean).sort();
    const createdCandidates = [existing?.createdAt, plan.createdAt, savedCandidates[0]].filter(Boolean).sort();
    puts.set(targetPlanId, {
      ...(plan ?? {}),
      ...(existing ?? {}),
      planId: targetPlanId,
      profileId,
      contentId: target.contentId,
      implementationId: target.implementationId,
      wantToTryAt: savedCandidates[0] ?? now,
      status: "planned",
      createdAt: createdCandidates[0] ?? now,
      updatedAt: now,
      migratedFrom: "legacyImplementationIds",
    });
    deletePlanIds.add(plan.planId);
    migratedRecords += 1;
    if (existing) deduplicatedRecords += 1;
  }

  for (const planId of puts.keys()) deletePlanIds.delete(planId);
  return {
    puts: [...puts.values()],
    deletePlanIds: [...deletePlanIds],
    migratedRecords,
    deduplicatedRecords,
  };
}

export async function migrateImplementationAliases(database, profileId, cards, now = new Date().toISOString()) {
  const markerKey = `migration::implementation-aliases::1.2.0::${profileId}`;
  const transaction = database.transaction(["practicePlans", "personalMeta"], "readwrite");
  const completion = transactionToPromise(transaction);
  const meta = transaction.objectStore("personalMeta");
  if (await requestToPromise(meta.get(markerKey))) {
    transaction.abort();
    try { await completion; } catch { /* erwarteter Abbruch ohne Schreibzugriff */ }
    return { migrated: false, migratedRecords: 0, deduplicatedRecords: 0 };
  }

  const plansStore = transaction.objectStore("practicePlans");
  const plans = await requestToPromise(plansStore.index("profileId").getAll(profileId));
  const migration = planImplementationAliasMigration(plans, cards, profileId, now);
  for (const planId of migration.deletePlanIds) plansStore.delete(planId);
  for (const plan of migration.puts) plansStore.put(plan);
  meta.put({
    key: markerKey,
    completedAt: now,
    migratedRecords: migration.migratedRecords,
    deduplicatedRecords: migration.deduplicatedRecords,
  });
  meta.put({ key: "personal-schema", schemaVersion: PERSONAL_SCHEMA_VERSION, updatedAt: now });
  await completion;
  return {
    migrated: true,
    migratedRecords: migration.migratedRecords,
    deduplicatedRecords: migration.deduplicatedRecords,
  };
}

export async function setImplementationMark(database, { profileId, contentId, implementationId, field, enabled, now }) {
  if (!IMPLEMENTATION_MARK_FIELDS.includes(field)) throw new TypeError("Unbekannte Umsetzungsmarkierung.");
  const isPlan = field === "wantToTryAt";
  const storeName = isPlan ? "practicePlans" : "practiceExperiences";
  const keyName = isPlan ? "planId" : "experienceId";
  const key = `${profileId}::${implementationId}`;
  const transaction = database.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  if (enabled) {
    store.put({
      [keyName]: key,
      profileId,
      contentId,
      implementationId,
      [field]: now,
      status: isPlan ? "planned" : "documented",
      createdAt: now,
      updatedAt: now,
    });
  } else {
    store.delete(key);
  }
  await transactionToPromise(transaction);
  return getImplementationStates(database, profileId, contentId);
}

export async function migrateCardPracticeMarks(database, profile, cards, legacyContext, now = new Date().toISOString()) {
  const markerKey = `migration::practice-marks::1.0.2::${profile.profileId}`;
  const stores = ["savedItems", "practicePlans", "practiceExperiences", "personalMeta"];
  const transaction = database.transaction(stores, "readwrite");
  const completion = transactionToPromise(transaction);
  const meta = transaction.objectStore("personalMeta");
  if (await requestToPromise(meta.get(markerKey))) {
    transaction.abort();
    try { await completion; } catch { /* expected abort for read-only early exit */ }
    return { migrated: false, migratedRecords: 0 };
  }
  const savedStore = transaction.objectStore("savedItems");
  const plans = transaction.objectStore("practicePlans");
  const experiences = transaction.objectStore("practiceExperiences");
  const records = await requestToPromise(savedStore.index("profileId").getAll(profile.profileId));
  let migratedRecords = 0;
  for (const record of records) {
    if (!record.wantToTryAt && !record.triedAt) continue;
    const card = cards.find((item) => item.id === record.contentId);
    if (!card) continue;
    const implementationId = selectPracticeVariant(card, legacyContext).impulse.impulseId;
    if (record.wantToTryAt) {
      plans.put({
        planId: `${profile.profileId}::${implementationId}`,
        profileId: profile.profileId,
        contentId: record.contentId,
        implementationId,
        wantToTryAt: record.wantToTryAt,
        status: "planned",
        createdAt: record.createdAt ?? record.wantToTryAt,
        updatedAt: record.updatedAt ?? now,
        migratedFrom: "savedItems.wantToTryAt",
      });
    }
    if (record.triedAt) {
      experiences.put({
        experienceId: `${profile.profileId}::${implementationId}`,
        profileId: profile.profileId,
        contentId: record.contentId,
        implementationId,
        triedAt: record.triedAt,
        status: "documented",
        createdAt: record.createdAt ?? record.triedAt,
        updatedAt: record.updatedAt ?? now,
        migratedFrom: "savedItems.triedAt",
      });
    }
    const next = { ...record };
    delete next.wantToTryAt;
    delete next.triedAt;
    next.savedState = deriveSavedState(next);
    next.updatedAt = now;
    if (next.savedState === "none") savedStore.delete([profile.profileId, record.contentId]);
    else savedStore.put(next);
    migratedRecords += 1;
  }
  meta.put({ key: markerKey, completedAt: now, migratedRecords });
  meta.put({ key: "personal-schema", schemaVersion: PERSONAL_SCHEMA_VERSION, updatedAt: now });
  await completion;
  return { migrated: true, migratedRecords };
}

export async function inspectDatabase(database) {
  const profile = await getActiveProfile(database);
  const progress = profile ? await getProgressForProfile(database, profile.profileId) : [];
  const transaction = database.transaction(["contentMeta", "savedItems", "practicePlans", "practiceExperiences"], "readonly");
  const contentMeta = await requestToPromise(transaction.objectStore("contentMeta").get("active-package"));
  const savedItems = await requestToPromise(transaction.objectStore("savedItems").getAll());
  const practicePlans = await requestToPromise(transaction.objectStore("practicePlans").getAll());
  const practiceExperiences = await requestToPromise(transaction.objectStore("practiceExperiences").getAll());
  await transactionToPromise(transaction);
  return {
    name: database.name,
    version: database.version,
    stores: [...database.objectStoreNames],
    profile,
    progress,
    contentMeta,
    savedItems,
    practicePlans,
    practiceExperiences,
  };
}
