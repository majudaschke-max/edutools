import {
  appendProgressAssignments,
  completeOnboarding,
  getSavedImplementations,
  getImplementationStates,
  getActiveProfile,
  getProgressForProfile,
  installContentPackage,
  loadInstalledPackage,
  migrateCardPracticeMarks,
  migrateImplementationAliases,
  migrateSubjectProfile,
  migrateUnifiedImplementationMarks,
  openDatabase,
  openEduCoffee,
  setImplementationSaved,
  verifyStorage,
} from "./db.mjs";
import { ContentPackageError, loadPublishedPackage } from "./content-loader.mjs";
import {
  buildSubjectProfiles,
  createMissingAssignments,
  dateOnlyInTimeZone,
  DAY_ROLE_LABELS,
  formatLocalDate,
  implementationSubjectLabel,
  normalizeImplementations,
  qaDateFromLocation,
  qaFlag,
  resolveTodaySchedule,
  selectImplementations,
  subjectSelectionFromProfile,
  SUBJECT_GROUPS,
  SUBJECTS,
  WEEKDAYS,
} from "./domain.mjs";

const app = document.querySelector("#app");
const state = {
  database: null,
  package: null,
  profile: null,
  calendar: null,
  progress: [],
  implementationStates: {},
  savedImplementations: [],
  collectionTarget: null,
  weekTarget: null,
  restDayTarget: null,
  route: "today",
  onboarding: false,
  onboardingStep: 1,
  onboardingError: "",
  onboardingDraft: null,
  notice: "",
  contentFromLocalStore: false,
};

const routes = new Set(["today", "week", "collection", "settings", "data", "help", "legal"]);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function uuid() {
  if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin";
}

function currentDateOnly() {
  return qaDateFromLocation(location) ?? dateOnlyInTimeZone(new Date(), state.calendar?.timeZone ?? browserTimeZone());
}

function routeFromHash() {
  const candidate = location.hash.replace(/^#\/?/, "") || "today";
  return routes.has(candidate) ? candidate : "today";
}

function routeTitle(route) {
  return {
    today: "Heute – EduCoffee",
    week: "Themenwoche",
    collection: "Meine Sammlung",
    settings: "Einstellungen",
    data: "Daten",
    help: "Hilfe",
    legal: "Rechtliche Informationen",
  }[route];
}

function activeAttribute(route) {
  return state.route === route ? ' aria-current="page"' : "";
}

function makeOnboardingDraft() {
  const selection = subjectSelectionFromProfile(state.profile);
  return {
    activeWeekdays: state.calendar?.activeWeekdays ? [...state.calendar.activeWeekdays] : [1, 2, 3, 4, 5],
    timeZone: state.calendar?.timeZone ?? browserTimeZone(),
    subjectSelectionMode: selection.mode,
    subjectIds: [...selection.subjectIds],
    otherSubjectLabel: selection.otherSubjectLabel,
  };
}

function renderError({ title, message, details, retry = true }) {
  document.title = `${title} – EduBrief`;
  app.innerHTML = `
    <main id="main-content" class="error-screen" tabindex="-1">
      <p class="eyebrow">EduTools · EduBrief</p>
      <h1 tabindex="-1">${escapeHtml(title)}</h1>
      <div class="feedback feedback--error" role="alert">
        <p>${escapeHtml(message)}</p>
        <p>Es wurden keine persönlichen Daten als gespeichert ausgegeben.</p>
        ${details ? `<details><summary>Technische Details</summary><p><code>${escapeHtml(details)}</code></p></details>` : ""}
      </div>
      ${retry ? '<button class="button button--primary" type="button" data-action="retry-start">Erneut prüfen</button>' : ""}
    </main>`;
  document.querySelector("h1")?.focus?.();
}

function renderOnboarding() {
  const stepNames = ["Willkommen", "Aktive Tage", "Fächer", "Bestätigung"];
  document.title = `${stepNames[state.onboardingStep - 1]} – EduBrief`;
  const progress = stepNames
    .map(
      (name, index) => `<li${index + 1 === state.onboardingStep ? ' aria-current="step"' : ""}><strong>${index + 1}</strong> <span>${escapeHtml(name)}</span></li>`,
    )
    .join("");
  app.innerHTML = `
    <main id="main-content" class="onboarding" tabindex="-1">
      <p class="eyebrow">EduTools · EduBrief</p>
      <ol class="onboarding__progress" aria-label="Onboarding-Fortschritt">${progress}</ol>
      ${onboardingStepMarkup()}
    </main>`;
  document.querySelector("h1")?.focus?.();
}

function onboardingStepMarkup() {
  if (state.onboardingStep === 1) {
    return `
      <section class="onboarding__form">
        <div>
          <p class="section-kicker">Schritt 1 von 4</p>
          <h1 tabindex="-1">Willkommen bei EduBrief</h1>
          <p class="intro">Ein EduCoffee verbindet einen kurzen, geprüften Forschungsimpuls mit wenigen möglichen Umsetzungen für die Unterrichtspraxis.</p>
        </div>
        <div class="card card--accent">
          <h2 class="card__title">Lokal in diesem Browser</h2>
          <p class="card__description">Deine Auswahl und persönlichen Markierungen werden lokal in diesem Browser gespeichert.</p>
        </div>
        <div class="button-row">
          <button class="button button--primary" type="button" data-action="onboarding-next">Weiter</button>
          ${state.profile ? '<button class="button button--text" type="button" data-action="onboarding-cancel">Abbrechen</button>' : ""}
        </div>
      </section>`;
  }

  if (state.onboardingStep === 2) {
    const choices = WEEKDAYS.map(
      (day) => `
        <label class="choice">
          <input type="checkbox" name="active-day" value="${day.value}"${state.onboardingDraft.activeWeekdays.includes(day.value) ? " checked" : ""}>
          <span><strong>${day.short}</strong><span class="visually-hidden"> – ${day.label}</span></span>
        </label>`,
    ).join("");
    return `
      <form class="onboarding__form" data-onboarding-form="days" novalidate>
        <div>
          <p class="section-kicker">Schritt 2 von 4</p>
          <h1 tabindex="-1">Wann passt ein EduCoffee?</h1>
          <p>Wähle mindestens einen aktiven Arbeits- oder Schultag. Inaktive Tage bleiben neutral.</p>
        </div>
        ${state.onboardingError ? `<div class="feedback feedback--error" id="onboarding-error" role="alert" tabindex="-1"><p>${escapeHtml(state.onboardingError)}</p></div>` : ""}
        <fieldset aria-describedby="day-help${state.onboardingError ? " onboarding-error" : ""}">
          <legend>Aktive Tage</legend>
          <p id="day-help">Voreinstellung: Montag bis Freitag.</p>
          <div class="choice-grid">${choices}</div>
        </fieldset>
        <div class="button-row">
          <button class="button button--primary" type="submit">Weiter</button>
          <button class="button button--secondary" type="button" data-action="onboarding-back">Zurück</button>
        </div>
      </form>`;
  }

  if (state.onboardingStep === 3) {
    const groups = SUBJECT_GROUPS.map(({ legend, ids }) => `
      <fieldset class="subject-group">
        <legend>${escapeHtml(legend)}</legend>
        <div class="subject-choice-list">
          ${ids.map((id) => `<label class="subject-choice">
            <input type="checkbox" name="subject" value="${escapeHtml(id)}"${state.onboardingDraft.subjectIds.includes(id) ? " checked" : ""}>
            <span>${escapeHtml(SUBJECTS[id].label)}</span>
          </label>`).join("")}
        </div>
      </fieldset>`).join("");
    return `
      <form class="onboarding__form" data-onboarding-form="subjects">
        <div>
          <p class="section-kicker">Schritt 3 von 4</p>
          <h1 tabindex="-1">Welche Fächer unterrichtest du?</h1>
          <p>Wähle alle passenden Fächer aus. Fachübergreifende Umsetzungen berücksichtigt EduBrief automatisch.</p>
        </div>
        ${state.onboardingError ? `<div class="feedback feedback--error" id="onboarding-error" role="alert" tabindex="-1"><p>${escapeHtml(state.onboardingError)}</p></div>` : ""}
        <fieldset class="subject-mode" aria-describedby="subject-help${state.onboardingError ? " onboarding-error" : ""}">
          <legend>Schwerpunktsetzung</legend>
          <p id="subject-help">Wähle mindestens ein Fach oder die fachübergreifende Einstellung. Beides ist nicht gleichzeitig aktiv.</p>
          <label class="subject-choice subject-choice--general">
            <input type="checkbox" name="general-subject-mode"${state.onboardingDraft.subjectSelectionMode === "general" ? " checked" : ""}>
            <span>Fachübergreifend / keine Schwerpunktsetzung</span>
          </label>
        </fieldset>
        <div class="subject-groups">${groups}</div>
        <div class="text-field${state.onboardingDraft.subjectIds.includes("other-subject") ? "" : " text-field--hidden"}" data-other-subject-field>
          <label for="other-subject-label">Anderes Fach näher beschreiben <span class="optional">(optional)</span></label>
          <input id="other-subject-label" name="other-subject-label" type="text" maxlength="80" value="${escapeHtml(state.onboardingDraft.otherSubjectLabel)}">
          <p>Diese Angabe beschreibt nur dein Profil und erzeugt keine neue Contentzuordnung.</p>
        </div>
        <div class="button-row">
          <button class="button button--primary" type="submit">Weiter</button>
          <button class="button button--secondary" type="button" data-action="onboarding-back">Zurück</button>
        </div>
      </form>`;
  }

  const dayLabels = WEEKDAYS.filter((day) => state.onboardingDraft.activeWeekdays.includes(day.value)).map((day) => day.label).join(", ");
  const subjectLabels = state.onboardingDraft.subjectSelectionMode === "general"
    ? "Fachübergreifend / keine Schwerpunktsetzung"
    : state.onboardingDraft.subjectIds.map((id) => SUBJECTS[id].label).join(", ");
  const themeWeekCount = state.package?.content.themeWeeks.length ?? 0;
  const cardCount = state.package?.content.cards.length ?? 0;
  const themeWeekLabel = themeWeekCount === 1 ? "die veröffentlichte Themenwoche" : `die ${themeWeekCount} veröffentlichten Themenwochen`;
  const assignmentCopy = themeWeekCount === 1
    ? `Mit dem Start wird ${themeWeekLabel} auf deine nächsten ${cardCount} aktiven Tage verteilt.`
    : `Mit dem Start werden ${themeWeekLabel} auf deine nächsten ${cardCount} aktiven Tage verteilt.`;
  return `
    <form class="onboarding__form" data-onboarding-form="confirm">
      <div>
        <p class="section-kicker">Schritt 4 von 4</p>
        <h1 tabindex="-1">Prüfen und starten</h1>
        <p>${assignmentCopy}</p>
      </div>
      ${state.onboardingError ? `<div class="feedback feedback--error" id="onboarding-error" role="alert" tabindex="-1"><p>${escapeHtml(state.onboardingError)}</p></div>` : ""}
      <div class="card">
        <dl class="summary-list">
          <div><dt>Aktive Tage</dt><dd>${escapeHtml(dayLabels)}</dd></div>
          <div><dt>Fächer</dt><dd>${escapeHtml(subjectLabels)}</dd></div>
          <div><dt>Speicherung</dt><dd>Lokal in diesem Browser</dd></div>
        </dl>
      </div>
      <div class="button-row">
        <button class="button button--primary" type="submit">${themeWeekCount === 1 ? "Themenwoche" : "Themenwochen"} starten</button>
        <button class="button button--secondary" type="button" data-action="onboarding-back">Zurück</button>
      </div>
    </form>`;
}

function renderShell({ focusHeading = false } = {}) {
  document.title = `${routeTitle(state.route)} – EduBrief`;
  app.innerHTML = `
    <header class="app-header">
      <div class="app-header__inner">
        <a class="brand" href="#today" aria-label="EduBrief – Heute">
          <span class="brand__family">EduTools</span>
          <span>EduBrief</span>
        </a>
        <nav class="desktop-nav" aria-label="Hauptnavigation">
          <a class="desktop-nav__link" href="#today"${activeAttribute("today")}>Heute – EduCoffee</a>
          <a class="desktop-nav__link" href="#week" data-action="show-week-overview"${activeAttribute("week")}>Themenwoche</a>
          <a class="desktop-nav__link" href="#collection"${activeAttribute("collection")}>Meine Sammlung</a>
          <a class="desktop-nav__link" href="#settings"${activeAttribute("settings")}>Einstellungen</a>
        </nav>
      </div>
    </header>
    <main id="main-content" class="app-main route-view" tabindex="-1">${routeMarkup()}</main>
    <nav class="mobile-nav" aria-label="Hauptnavigation">
      <a class="mobile-nav__link" href="#today" aria-label="Heute – EduCoffee"${activeAttribute("today")}>Heute</a>
      <a class="mobile-nav__link" href="#week" aria-label="Themenwoche" data-action="show-week-overview"${activeAttribute("week")}>Themenwoche</a>
      <a class="mobile-nav__link" href="#collection" aria-label="Meine Sammlung"${activeAttribute("collection")}>Sammlung</a>
      <a class="mobile-nav__link" href="#settings" aria-label="Einstellungen"${activeAttribute("settings")}>Einstellungen</a>
    </nav>`;
  if (focusHeading) document.querySelector("#main-content h1")?.focus?.();
}

function routeMarkup() {
  if (state.route === "today") return todayMarkup();
  if (state.route === "week") return weekMarkup();
  if (state.route === "collection") return collectionMarkup();
  if (state.route === "settings") return settingsMarkup();
  const copy = {
    data: ["Daten", "Persönliche Daten und wissenschaftliche Contentdaten bleiben getrennt."],
    help: ["Hilfe", "EduBrief verbindet den heutigen EduCoffee mit lokaler Wiederaufnahme."],
    legal: ["Rechtliche Informationen", "EduBrief verarbeitet persönliche Einstellungen in diesem Browser und überträgt sie nicht an einen Server."],
  }[state.route];
  if (!copy) return "";
  return `
    <section class="empty-state card">
      <h1 tabindex="-1">${escapeHtml(copy[0])}</h1>
      <p class="card__description">${escapeHtml(copy[1])}</p>
      <a class="button button--primary" href="#today">Zu Heute</a>
    </section>`;
}

function weekMarkup() {
  if (state.weekTarget) {
    const card = state.package.content.cards.find((item) => item.id === state.weekTarget);
    const week = card ? state.package.content.themeWeeks.find((item) => item.weekId === card.themeWeekId) : null;
    const topic = card ? state.package.content.topics.find((item) => item.topicId === card.topicId) : null;
    if (card && week && topic) {
      return `<div class="week-origin-bar"><button class="button button--text" type="button" data-action="close-week-coffee">Zurück zur Themenwoche</button></div>${eduCoffeeMarkup(card, week, topic)}`;
    }
    state.weekTarget = null;
  }

  const today = currentDateOnly();
  const progressByContent = new Map(state.progress.map((record) => [record.contentId, record]));
  const weekGroups = state.package.content.themeWeeks.map((week, weekIndex) => {
    const topic = state.package.content.topics.find((item) => item.topicId === week.topicId);
    const cards = state.package.content.cards
      .filter((card) => card.themeWeekId === week.weekId)
      .sort((a, b) => a.sequence - b.sequence);
    const items = cards.map((card, cardIndex) => {
      const record = progressByContent.get(card.id);
      const isToday = record?.scheduledActiveDate === today;
      const status = isToday ? "Heute" : record?.firstOpenedAt ? "Bereits angesehen" : "Noch nicht angesehen";
      const scheduledDate = record?.scheduledActiveDate ? formatLocalDate(record.scheduledActiveDate) : "Noch nicht zugewiesen";
      const headingId = `week-${weekIndex + 1}-card-${cardIndex + 1}-title`;
      return `<article class="card week-card" aria-labelledby="${headingId}">
        <div class="week-card__meta">
          <span class="status-badge${isToday ? " status-badge--success" : ""}">Schritt ${card.sequence} von 5</span>
          <span>${escapeHtml(DAY_ROLE_LABELS[card.dayRole])}</span>
        </div>
        <h3 class="card__title" id="${headingId}">${escapeHtml(card.title)}</h3>
        <p class="card__description">${escapeHtml(card.guidingQuestion)}</p>
        <p class="week-card__status"><strong>${escapeHtml(status)}</strong><span aria-hidden="true"> · </span><span>${escapeHtml(scheduledDate)}</span></p>
        <div class="week-card__actions">
          <button class="button button--secondary" type="button" data-action="open-week-coffee" data-content-id="${escapeHtml(card.id)}">${record?.firstOpenedAt ? "Erneut ansehen" : "EduCoffee ansehen"}</button>
        </div>
      </article>`;
    }).join("");
    return `<section class="week-group" aria-labelledby="week-${weekIndex + 1}-heading">
      <p class="section-kicker">${escapeHtml(topic?.title ?? "EduBrief")}</p>
      <h2 class="section-heading" id="week-${weekIndex + 1}-heading">${escapeHtml(week.title)}</h2>
      <p class="week-focus">${escapeHtml(topic?.summary ?? week.weekQuestion)}</p>
      <div class="week-list">${items}</div>
    </section>`;
  }).join("");

  return `<section class="week-view" aria-labelledby="week-heading">
    <p class="section-kicker">Dein Lernpfad</p>
    <h1 id="week-heading" tabindex="-1">Themenwochen</h1>
    <p class="intro">Du kannst deinem Tagesrhythmus folgen oder einzelne EduCoffees direkt betrachten. Die geplanten Tage bleiben dabei erhalten.</p>
    <div class="week-groups">${weekGroups}</div>
  </section>`;
}

function collectionMarkup() {
  const items = state.savedImplementations.map((record) => {
    const card = state.package.content.cards.find((item) => item.id === record.contentId);
    const implementation = card ? normalizeImplementations(card).find((item) => item.implementationId === record.implementationId) : null;
    if (!card || !implementation) return "";
    const topic = state.package.content.topics.find((item) => item.topicId === card.topicId);
    const subjectLabel = implementationSubjectLabel(implementation);
    return `<article class="card collection-item" data-implementation-id="${escapeHtml(implementation.implementationId)}" aria-labelledby="collection-${escapeHtml(implementation.implementationId)}-title">
      ${subjectLabel ? `<p class="status-badge">${escapeHtml(subjectLabel)}</p>` : ""}
      <h2 class="card__title" id="collection-${escapeHtml(implementation.implementationId)}-title">${escapeHtml(implementation.title)}</h2>
      <p class="collection-item__origin">${escapeHtml(topic?.title ?? "EduBrief")} · ${escapeHtml(card.title)}</p>
      <p class="card__description">${escapeHtml(implementation.learningAction)}</p>
      <div class="button-row">
        <button class="button button--secondary" type="button" data-action="open-collection-origin" data-content-id="${escapeHtml(card.id)}" data-implementation-id="${escapeHtml(implementation.implementationId)}">Ursprung öffnen</button>
        <button class="button button--text" type="button" data-action="remove-saved-implementation" data-content-id="${escapeHtml(card.id)}" data-implementation-id="${escapeHtml(implementation.implementationId)}">Aus Sammlung entfernen</button>
      </div>
    </article>`;
  }).filter(Boolean);

  return `<section class="collection-view" aria-labelledby="collection-heading">
    <p class="section-kicker">Persönlich und lokal</p>
    <h1 id="collection-heading" tabindex="-1">Meine Sammlung</h1>
    ${state.notice ? `<div class="feedback feedback--success" role="status"><p>${escapeHtml(state.notice)}</p></div>` : ""}
    ${items.length
      ? `<div class="collection-list">${items.join("")}</div>`
      : `<div class="card empty-state"><p class="card__description">Du hast noch keine Umsetzung vorgemerkt.</p><a class="button button--primary" href="#today">Zu Heute</a></div>`}
  </section>`;
}

function settingsMarkup() {
  const selection = subjectSelectionFromProfile(state.profile);
  const subjectLabels = selection.mode === "general"
    ? "Fachübergreifend / keine Schwerpunktsetzung"
    : selection.subjectIds.map((id) => SUBJECTS[id].label).join(", ");
  return `
    <section>
      <p class="section-kicker">Lokale Konfiguration</p>
      <h1 tabindex="-1">Einstellungen</h1>
      <p class="intro">Passe deine aktiven Tage und Fächer über das Onboarding an.</p>
    </section>
    <section class="card">
      <h2 class="card__title">Aktuelle Auswahl</h2>
      <dl class="summary-list">
        <div><dt>Aktive Tage</dt><dd>${escapeHtml(WEEKDAYS.filter((day) => state.calendar.activeWeekdays.includes(day.value)).map((day) => day.label).join(", "))}</dd></div>
        <div><dt>Fächer</dt><dd>${escapeHtml(subjectLabels)}</dd></div>
      </dl>
      <button class="button button--primary" type="button" data-action="restart-onboarding">Onboarding erneut öffnen</button>
    </section>`;
}

function todayMarkup() {
  if (state.collectionTarget) {
    const card = state.package.content.cards.find((item) => item.id === state.collectionTarget.contentId);
    const week = card ? state.package.content.themeWeeks.find((item) => item.weekId === card.themeWeekId) : null;
    const topic = card ? state.package.content.topics.find((item) => item.topicId === card.topicId) : null;
    if (card && week && topic) {
      return `<div class="collection-origin-bar"><button class="button button--text" type="button" data-action="close-collection-origin">Zurück zu Meine Sammlung</button></div>${eduCoffeeMarkup(card, week, topic, { focusImplementationId: state.collectionTarget.implementationId })}`;
    }
    state.collectionTarget = null;
  }
  const today = currentDateOnly();
  const { exact, next } = resolveTodaySchedule(state.progress, today);
  const assignment = exact ?? next;
  if (!assignment) {
    return `
      <section class="card">
        <p class="section-kicker">Themenwochen</p>
        <h1 tabindex="-1">Heute</h1>
        <p>Für heute und die kommenden aktiven Tage ist kein weiterer EduCoffee eingeplant. Frühere EduCoffees findest du unter Themenwoche.</p>
      </section>`;
  }

  const card = state.package.content.cards.find((item) => item.id === assignment.contentId);
  const week = state.package.content.themeWeeks.find((item) => item.weekId === card.themeWeekId);
  const topic = state.package.content.topics.find((item) => item.topicId === card.topicId);
  if (!exact && state.restDayTarget === assignment.contentId) {
    return `
      <div class="feedback rest-day-context" role="status">
        <p><strong>Ein ruhiger Tag.</strong> Du hast den nächsten EduCoffee freiwillig geöffnet. Sein geplanter Termin bleibt ${escapeHtml(formatLocalDate(assignment.scheduledActiveDate))}.</p>
      </div>
      ${eduCoffeeMarkup(card, week, topic)}`;
  }

  if (!exact) {
    return `
      <section>
        <p class="section-kicker">Heute · ${escapeHtml(formatLocalDate(today))}</p>
        <h1 tabindex="-1">Ein ruhiger Tag</h1>
        <p class="intro">Heute ist in deinem Rhythmus kein EduCoffee eingeplant. Das hat keine negative Folge.</p>
      </section>
      <section class="card card--accent">
        <p class="week-context"><span class="status-badge">Nächster aktiver Tag</span><time datetime="${escapeHtml(assignment.scheduledActiveDate)}">${escapeHtml(formatLocalDate(assignment.scheduledActiveDate))}</time></p>
        <h2 class="card__title">${escapeHtml(card.title)}</h2>
        <p class="card__description">${escapeHtml(week.title)} · Schritt ${card.sequence} von 5</p>
        <button class="button button--primary" type="button" data-action="open-next-coffee" data-content-id="${escapeHtml(card.id)}">Nächsten EduCoffee öffnen</button>
      </section>`;
  }

  if (!assignment.firstOpenedAt) {
    return `
      <section>
        <p class="section-kicker">Heute · ${escapeHtml(formatLocalDate(today))}</p>
        <h1 tabindex="-1">Dein EduCoffee ist bereit</h1>
        <p class="intro">Ein kurzer Forschungs- und Praxisimpuls für deinen aktiven Tag.</p>
      </section>
      <section class="card card--accent">
        <p class="week-context"><span class="status-badge">Schritt ${card.sequence} von 5</span><span>${escapeHtml(DAY_ROLE_LABELS[card.dayRole])}</span></p>
        <p class="section-kicker">${escapeHtml(topic.title)} · ${escapeHtml(week.title)}</p>
        <h2 class="card__title">${escapeHtml(card.title)}</h2>
        <p class="card__description">${escapeHtml(card.guidingQuestion)}</p>
        <button class="button button--primary" type="button" data-action="open-coffee" data-content-id="${escapeHtml(card.id)}">EduCoffee öffnen</button>
      </section>`;
  }

  return eduCoffeeMarkup(card, week, topic);
}

function eduCoffeeMarkup(card, week, topic, { focusImplementationId = null } = {}) {
  const selection = subjectSelectionFromProfile(state.profile);
  let implementations = selectImplementations(card, selection);
  if (focusImplementationId && !implementations.some((item) => item.implementationId === focusImplementationId)) {
    const target = normalizeImplementations(card).find((item) => item.implementationId === focusImplementationId);
    if (target) implementations = [target, ...implementations.filter((item) => item.implementationId !== focusImplementationId)].slice(0, 3);
  }
  const sourceMap = new Map(state.package.content.sources.map((source) => [source.sourceId, source]));
  const sources = card.researchStatement.sourceRefs.map((id) => sourceMap.get(id)).filter(Boolean);
  const limits = card.researchStatement.conditionsAndLimits.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const doesNotFollow = card.researchStatement.doesNotFollow.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const sourceItems = sources
    .map((source) => {
      if (source.url) {
        return `<li>${escapeHtml(source.citation)} <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">Externe Quelle öffnen<span class="visually-hidden"> (öffnet in neuem Tab)</span></a></li>`;
      }
      return `<li>${escapeHtml(source.citation)}</li>`;
    })
    .join("");
  const implementationsMarkup = implementations.length
    ? `<section class="card implementations" aria-labelledby="implementations-heading">
        <div class="implementations__header">
          <p class="section-kicker">Praxisbezug</p>
          <h2 class="section-heading" id="implementations-heading">Mögliche Umsetzungen</h2>
          <p>Wähle, was zu deinem Fach, deiner Lerngruppe und deinem Lernziel passt.</p>
        </div>
        <div class="implementation-list">${implementations.map((item) => implementationMarkup(item, card.id, item.implementationId === focusImplementationId)).join("")}</div>
      </section>`
    : "";

  return `
    <article class="educoffee" aria-labelledby="coffee-title">
      <header>
        <p class="week-context"><span class="status-badge">Schritt ${card.sequence} von 5</span><span>${escapeHtml(DAY_ROLE_LABELS[card.dayRole])}</span></p>
        <p class="section-kicker">${escapeHtml(topic.title)} · ${escapeHtml(week.title)}</p>
        <h1 id="coffee-title" tabindex="-1">${escapeHtml(card.title)}</h1>
      </header>
      ${state.notice ? `<div class="feedback feedback--success" role="status"><p>${escapeHtml(state.notice)}</p></div>` : ""}
      <section class="card" aria-labelledby="guiding-heading">
        <h2 class="card__title" id="guiding-heading">Leitfrage</h2>
        <p class="guiding-question">${escapeHtml(card.guidingQuestion)}</p>
        <div class="content-block">
          <h3>Antwort in Kürze</h3>
          <p class="short-answer">${escapeHtml(card.shortAnswer)}</p>
        </div>
        ${card.explanation ? `<div class="content-block explanation-block"><h3>Etwas genauer</h3><p>${escapeHtml(card.explanation)}</p></div>` : ""}
        <p class="takeaway"><span class="visually-hidden">Merksatz: </span>${escapeHtml(card.takeaway)}</p>
      </section>
      ${implementationsMarkup}
      <section class="card science-card" aria-labelledby="science-heading">
        <h2 class="section-heading" id="science-heading">Wissenschaftliche Fundierung</h2>
        <div class="science-content">
          <div class="science-core">
            <h3 class="science-subheading">Wissenschaftlicher Kern</h3>
            <p>${escapeHtml(card.researchStatement.robustCore)}</p>
            <p><span class="status-badge">Evidenz ${escapeHtml(card.researchStatement.evidenceLevel)}</span></p>
            ${card.researchStatement.evidenceSummary ? `<p class="evidence-summary">${escapeHtml(card.researchStatement.evidenceSummary)}</p>` : ""}
          </div>
          <div class="science-section">
            <h3 class="science-subheading">Bedingungen und Grenzen</h3>
            <ul class="science-list">${limits}</ul>
          </div>
          <div class="science-section">
            <h3 class="science-subheading">Was daraus nicht folgt</h3>
            <ul class="science-list">${doesNotFollow}</ul>
          </div>
          <div class="science-section">
            <h3 class="science-subheading">Geprüfte Quellen</h3>
            <ol class="source-list">${sourceItems}</ol>
          </div>
        </div>
      </section>
      <section class="reflection-closing" aria-labelledby="reflection-heading">
        <p class="section-kicker reflection-closing__kicker">Reflexion der eigenen Praxis</p>
        <h2 class="reflection-closing__title" id="reflection-heading">Ein Gedanke zum Mitnehmen</h2>
        <p class="reflection-closing__prompt">${escapeHtml(card.reflectionPrompts[0].prompt)}</p>
      </section>
    </article>`;
}

function implementationMarkup(item, contentId, focused = false) {
  const personal = state.implementationStates[item.implementationId] ?? {};
  const saved = Boolean(personal.savedAt);
  const subjectLabel = implementationSubjectLabel(item);
  return `
    <article class="implementation-card" data-implementation-id="${escapeHtml(item.implementationId)}" aria-labelledby="${escapeHtml(item.implementationId)}-title">
      ${subjectLabel ? `<p class="status-badge">${escapeHtml(subjectLabel)}</p>` : ""}
      <h3 class="card__title" id="${escapeHtml(item.implementationId)}-title"${focused ? ' tabindex="-1"' : ""}>${escapeHtml(item.title)}</h3>
      <p class="card__description">${escapeHtml(item.learningAction)}</p>
      ${item.observationPrompt ? `<div class="content-block"><h4>Worauf du achten kannst</h4><p>${escapeHtml(item.observationPrompt)}</p></div>` : ""}
      ${item.variation ? `<div class="implementation-variation"><p><strong>Mögliche Abwandlung:</strong> ${escapeHtml(item.variation)}</p></div>` : ""}
      <div class="implementation-actions">
        <button class="button action-toggle" type="button" aria-pressed="${saved}" aria-label="Zum Ausprobieren merken${saved ? ", in Meine Sammlung gespeichert" : ""}" data-action="toggle-implementation-saved" data-content-id="${escapeHtml(contentId)}" data-implementation-id="${escapeHtml(item.implementationId)}">${saved ? '<span aria-hidden="true">✓ </span>' : ""}Zum Ausprobieren merken</button>
      </div>
    </article>`;
}

async function refreshPersonalState(contentId) {
  state.progress = await getProgressForProfile(state.database, state.profile.profileId);
  state.implementationStates = contentId ? await getImplementationStates(state.database, state.profile.profileId, contentId) : {};
  state.savedImplementations = await getSavedImplementations(state.database, state.profile.profileId);
}

async function finishOnboarding() {
  const now = new Date().toISOString();
  const profileId = state.profile?.profileId ?? uuid();
  const subjectProfiles = state.onboardingDraft.subjectSelectionMode === "subjects"
    ? buildSubjectProfiles(state.onboardingDraft.subjectIds, state.profile?.subjectProfiles, () => uuid())
    : [];
  const profile = {
    ...(state.profile ?? {}),
    profileId,
    subjectSelectionMode: state.onboardingDraft.subjectSelectionMode,
    subjectProfiles,
    otherSubjectLabel: subjectProfiles.some((item) => item.subjectId === "other-subject") ? state.onboardingDraft.otherSubjectLabel.trim() : "",
    schoolType: state.profile?.schoolType ?? "not-specified",
    roles: state.profile?.roles ?? [],
    interests: state.profile?.interests ?? [],
    preferredDurationMinutes: state.profile?.preferredDurationMinutes ?? 7,
    createdAt: state.profile?.createdAt ?? now,
    updatedAt: now,
    onboardingCompletedAt: now,
  };
  const calendar = {
    profileId,
    calendarMode: "custom-rhythm",
    activeWeekdays: [...state.onboardingDraft.activeWeekdays].sort((a, b) => a - b),
    state: null,
    vacationMode: "manual",
    timeZone: state.onboardingDraft.timeZone,
    manualExceptions: [],
    updatedAt: now,
  };
  const existingProgress = state.profile ? await getProgressForProfile(state.database, profileId) : [];
  const startDate = qaDateFromLocation(location) ?? dateOnlyInTimeZone(new Date(), calendar.timeZone);
  const assignments = createMissingAssignments({
    profileId,
    themeWeeks: state.package.content.themeWeeks,
    cards: state.package.content.cards,
    existingAssignments: existingProgress,
    startDate,
    activeWeekdays: calendar.activeWeekdays,
    assignedAt: now,
  });
  await completeOnboarding(state.database, profile, calendar, assignments);
  state.profile = profile;
  state.calendar = calendar;
  state.progress = await getProgressForProfile(state.database, profileId);
  state.onboarding = false;
  state.onboardingError = "";
  state.route = "today";
  location.hash = "today";
  renderShell({ focusHeading: true });
}

async function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "show-week-overview") {
    event.preventDefault();
    state.weekTarget = null;
    state.collectionTarget = null;
    state.restDayTarget = null;
    state.notice = "";
    state.route = "week";
    if (routeFromHash() === "week") renderShell({ focusHeading: true });
    else location.hash = "week";
    return;
  }
  if (action === "retry-start") {
    location.reload();
    return;
  }
  if (action === "onboarding-next") {
    state.onboardingStep += 1;
    state.onboardingError = "";
    renderOnboarding();
    return;
  }
  if (action === "onboarding-back") {
    state.onboardingStep -= 1;
    state.onboardingError = "";
    renderOnboarding();
    return;
  }
  if (action === "onboarding-cancel") {
    state.onboarding = false;
    renderShell({ focusHeading: true });
    return;
  }
  if (action === "restart-onboarding") {
    state.onboarding = true;
    state.onboardingStep = 1;
    state.onboardingDraft = makeOnboardingDraft();
    renderOnboarding();
    return;
  }
  if (action === "open-week-coffee") {
    const contentId = target.dataset.contentId;
    try {
      await openEduCoffee(state.database, state.profile.profileId, contentId, new Date().toISOString());
      await refreshPersonalState(contentId);
      state.weekTarget = contentId;
      state.notice = "";
      renderShell();
      document.querySelector("#coffee-title")?.focus();
    } catch (error) {
      state.notice = "Der EduCoffee konnte nicht geöffnet werden. Bitte erneut versuchen.";
      renderShell();
      console.error(error);
    }
    return;
  }
  if (action === "close-week-coffee") {
    state.weekTarget = null;
    state.notice = "";
    renderShell({ focusHeading: true });
    return;
  }
  if (action === "open-coffee") {
    try {
      await openEduCoffee(state.database, state.profile.profileId, target.dataset.contentId, new Date().toISOString());
      await refreshPersonalState(target.dataset.contentId);
      state.notice = "EduCoffee geöffnet. Dein Startpunkt wurde lokal gespeichert.";
      renderShell({ focusHeading: true });
    } catch (error) {
      state.notice = "Der EduCoffee konnte nicht als geöffnet gespeichert werden. Bitte erneut versuchen.";
      renderShell();
      console.error(error);
    }
    return;
  }
  if (action === "open-next-coffee") {
    try {
      const contentId = target.dataset.contentId;
      await openEduCoffee(state.database, state.profile.profileId, contentId, new Date().toISOString());
      await refreshPersonalState(contentId);
      state.restDayTarget = contentId;
      state.notice = "";
      renderShell({ focusHeading: true });
    } catch (error) {
      state.notice = "Der nächste EduCoffee konnte nicht geöffnet werden. Sein geplanter Termin bleibt unverändert.";
      renderShell();
      console.error(error);
    }
    return;
  }
  if (action === "toggle-implementation-saved") {
    const implementationId = target.dataset.implementationId;
    try {
      const current = Boolean(state.implementationStates[implementationId]?.savedAt);
      state.savedImplementations = await setImplementationSaved(state.database, {
        profileId: state.profile.profileId,
        contentId: target.dataset.contentId,
        implementationId,
        enabled: !current,
        now: new Date().toISOString(),
      });
      await refreshPersonalState(target.dataset.contentId);
      state.notice = current ? "Aus Meine Sammlung entfernt." : "In Meine Sammlung gespeichert.";
      renderShell();
      document.querySelector(`[data-implementation-id="${CSS.escape(implementationId)}"] [data-action="toggle-implementation-saved"]`)?.focus();
    } catch (error) {
      state.notice = "Die Umsetzung wurde nicht gespeichert. Der vorherige Zustand bleibt bestehen.";
      renderShell();
      console.error(error);
    }
    return;
  }
  if (action === "remove-saved-implementation") {
    const implementationId = target.dataset.implementationId;
    try {
      state.savedImplementations = await setImplementationSaved(state.database, {
        profileId: state.profile.profileId,
        contentId: target.dataset.contentId,
        implementationId,
        enabled: false,
        now: new Date().toISOString(),
      });
      await refreshPersonalState(target.dataset.contentId);
      state.notice = "Aus Meine Sammlung entfernt.";
      renderShell();
      document.querySelector("#collection-heading")?.focus();
    } catch (error) {
      state.notice = "Die Umsetzung konnte nicht entfernt werden. Der vorherige Zustand bleibt bestehen.";
      renderShell();
      console.error(error);
    }
    return;
  }
  if (action === "open-collection-origin") {
    state.collectionTarget = { contentId: target.dataset.contentId, implementationId: target.dataset.implementationId };
    state.weekTarget = null;
    await refreshPersonalState(target.dataset.contentId);
    state.route = "today";
    location.hash = "today";
    renderShell();
    document.querySelector(`[data-implementation-id="${CSS.escape(target.dataset.implementationId)}"] h3`)?.focus();
    return;
  }
  if (action === "close-collection-origin") {
    state.collectionTarget = null;
    state.route = "collection";
    location.hash = "collection";
    renderShell({ focusHeading: true });
  }
}

async function handleSubmit(event) {
  const form = event.target.closest("[data-onboarding-form]");
  if (!form) return;
  event.preventDefault();
  const type = form.dataset.onboardingForm;
  if (type === "days") {
    state.onboardingDraft.activeWeekdays = [...form.querySelectorAll("[name='active-day']:checked")].map((input) => Number(input.value));
    if (!state.onboardingDraft.activeWeekdays.length) {
      state.onboardingError = "Wähle mindestens einen aktiven Tag.";
      renderOnboarding();
      document.querySelector("#onboarding-error")?.focus();
      return;
    }
    state.onboardingError = "";
    state.onboardingStep = 3;
    renderOnboarding();
    return;
  }
  if (type === "subjects") {
    state.onboardingDraft.otherSubjectLabel = String(new FormData(form).get("other-subject-label") ?? "").slice(0, 80);
    if (state.onboardingDraft.subjectSelectionMode !== "general" && !state.onboardingDraft.subjectIds.length) {
      state.onboardingError = "Wähle mindestens ein Fach oder die fachübergreifende Einstellung.";
      renderOnboarding();
      document.querySelector("#onboarding-error")?.focus();
      return;
    }
    state.onboardingError = "";
    state.onboardingStep = 4;
    renderOnboarding();
    return;
  }
  if (type === "confirm") {
    const submit = form.querySelector("[type='submit']");
    submit.disabled = true;
    submit.textContent = "Wird lokal gespeichert …";
    try {
      await finishOnboarding();
    } catch (error) {
      state.onboardingError = "Das Onboarding konnte nicht dauerhaft gespeichert werden. Deine Auswahl bleibt sichtbar; versuche es erneut.";
      renderOnboarding();
      document.querySelector("#onboarding-error")?.focus();
      console.error(error);
    }
  }
}

function handleChange(event) {
  if (event.target.name === "active-day") {
    state.onboardingDraft.activeWeekdays = [...document.querySelectorAll("[name='active-day']:checked")].map((input) => Number(input.value));
  }

  if (event.target.name === "general-subject-mode") {
    state.onboardingDraft.subjectSelectionMode = event.target.checked ? "general" : "subjects";

    if (event.target.checked) {
      state.onboardingDraft.subjectIds = [];
      document.querySelectorAll("[name='subject']").forEach((input) => {
        input.checked = false;
      });
      document.querySelector("[data-other-subject-field]")?.classList.add("text-field--hidden");
    }
  }

  if (event.target.name === "subject") {
    state.onboardingDraft.subjectIds = [...document.querySelectorAll("[name='subject']:checked")].map((input) => input.value);

    if (state.onboardingDraft.subjectIds.length) {
      state.onboardingDraft.subjectSelectionMode = "subjects";
      const generalMode = document.querySelector("[name='general-subject-mode']");
      if (generalMode) generalMode.checked = false;
    }

    document
      .querySelector("[data-other-subject-field]")
      ?.classList.toggle("text-field--hidden", !state.onboardingDraft.subjectIds.includes("other-subject"));
  }
}

function handleInput(event) {
  if (event.target.name === "other-subject-label") state.onboardingDraft.otherSubjectLabel = event.target.value.slice(0, 80);
}

function handleKeydown() {
  // Reserviert für zukünftige tastaturbedienbare Interaktionen.
}

async function start() {
  try {
    if (qaFlag(location, "qaStorageError")) throw new Error("QA_STORAGE_ERROR");
    state.database = await openDatabase();
    await verifyStorage(state.database);
  } catch (error) {
    renderError({
      title: "Lokale Speicherung nicht verfügbar",
      message: "EduBrief kann in diesem Browsermodus keine persönlichen Daten zuverlässig speichern. Der produktive Weg wird deshalb nicht flüchtig fortgesetzt.",
      details: error.message,
    });
    return;
  }

  try {
    if (qaFlag(location, "qaContentError")) throw new ContentPackageError("Absichtlich simulierter Contentfehler.", "QA_CONTENT_ERROR");
    const publishedPackage = await loadPublishedPackage();
    await installContentPackage(state.database, publishedPackage.manifest, publishedPackage.content, publishedPackage.validatedAt);
    state.package = publishedPackage;
  } catch (error) {
    const forcedQaError = error.code === "QA_CONTENT_ERROR";
    const installed = forcedQaError ? null : await loadInstalledPackage(state.database).catch(() => null);
    if (installed) {
      state.package = installed;
      state.contentFromLocalStore = true;
    } else {
      renderError({
        title: "EduCoffee-Inhalte nicht verfügbar",
        message: "Das veröffentlichte P3-Contentpaket fehlt oder hat die Integritätsprüfung nicht bestanden. Vorhandene persönliche Daten wurden nicht verändert.",
        details: `${error.code ?? "CONTENT_ERROR"}: ${error.message}`,
      });
      return;
    }
  }

  const active = await getActiveProfile(state.database).catch((error) => {
    renderError({
      title: "Persönlicher Zustand nicht lesbar",
      message: "Das lokale Profil konnte nicht sicher gelesen werden. Es wurden keine Daten überschrieben.",
      details: error.message,
    });
    return null;
  });
  if (document.querySelector(".error-screen")) return;

  if (active) {
    const profileMigration = await migrateSubjectProfile(state.database, active.profile);
    state.profile = profileMigration.profile;
    await migrateCardPracticeMarks(state.database, state.profile, state.package.content.cards, profileMigration.legacyContext);
    await migrateUnifiedImplementationMarks(state.database, state.profile.profileId);
    await migrateImplementationAliases(state.database, state.profile.profileId, state.package.content.cards);
    state.calendar = active.calendar;
    state.progress = await getProgressForProfile(state.database, state.profile.profileId);
    const assignmentSyncTime = new Date().toISOString();
    const missingAssignments = createMissingAssignments({
      profileId: state.profile.profileId,
      themeWeeks: state.package.content.themeWeeks,
      cards: state.package.content.cards,
      existingAssignments: state.progress,
      startDate: currentDateOnly(),
      activeWeekdays: state.calendar.activeWeekdays,
      assignedAt: assignmentSyncTime,
    });
    if (missingAssignments.length) {
      await appendProgressAssignments(state.database, missingAssignments);
      state.progress = await getProgressForProfile(state.database, state.profile.profileId);
    }
    state.savedImplementations = await getSavedImplementations(state.database, state.profile.profileId);
    state.route = routeFromHash();
    const todayAssignment = state.progress.find((record) => record.scheduledActiveDate === currentDateOnly());
    if (todayAssignment) await refreshPersonalState(todayAssignment.contentId);
    renderShell();
  } else {
    state.onboarding = true;
    state.onboardingDraft = makeOnboardingDraft();
    renderOnboarding();
  }

  if ("serviceWorker" in navigator && !qaFlag(location, "qaContentError") && !qaFlag(location, "qaStorageError")) {
    navigator.serviceWorker.register("./service-worker.js", { scope: "./" }).catch((error) => {
      console.warn("Offline-Cache konnte nicht registriert werden.", error);
    });
  }
}

app.addEventListener("click", handleClick);
app.addEventListener("submit", handleSubmit);
app.addEventListener("change", handleChange);
app.addEventListener("input", handleInput);
document.addEventListener("keydown", handleKeydown);
window.addEventListener("hashchange", () => {
  if (state.onboarding || !state.profile) return;
  state.route = routeFromHash();
  if (state.route !== "today") state.collectionTarget = null;
  if (state.route !== "week") state.weekTarget = null;
  if (state.route !== "today") state.restDayTarget = null;
  state.notice = "";
  renderShell({ focusHeading: true });
});

start().catch((error) => {
  renderError({
    title: "EduBrief konnte nicht gestartet werden",
    message: "Ein unerwarteter lokaler Startfehler ist aufgetreten. Es wurden keine persönlichen Daten als gespeichert ausgegeben.",
    details: error.message,
  });
  console.error(error);
});

export { state };
