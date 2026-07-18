import {
  createFlashcardDirectionFieldset,
  createFlashcardSizeFieldset,
  renderSessionView,
} from "./session-view.js?v=4.0.3";
import { createLearningScopeFieldsets } from "./learning-scope-view.js";
import {
  appendViewError,
  createDashboardLink,
  createElement,
  createSummaryList,
} from "./view-elements.js";
import { formatLearningScope } from "../core/learning-scope.js";

function formatMinutes(minutes) {
  return `ca. ${minutes} ${minutes === 1 ? "Minute" : "Minuten"}`;
}

/** Renders the daily pre-start, empty state or active shared session. */
export function renderLearnView(options) {
  const {
    container,
    metrics,
    sessionSnapshot,
    getUnitTitle,
    summaryElement,
    practiceWords = null,
  } = options;

  if (sessionSnapshot?.session) {
    summaryElement.textContent = sessionSnapshot.session.sourceType === "retry"
      ? "Übe deine unsicheren Wörter noch einmal in Ruhe."
      : "Arbeite dein heutiges Lernpaket Karte für Karte durch.";
    renderSessionView(container, sessionSnapshot, {
      getUnitTitle,
      idPrefix: "learn-session",
      modeLabel: sessionSnapshot.session.sourceType === "retry"
        ? "Unsichere Wörter"
        : "Heute lernen",
      pronunciation: options.pronunciation,
      languageCodes: options.languageCodes,
      allowScopeChange: true,
      learningScopeLabel: options.learningScopeLabel,
    });
    return;
  }

  const documentRoot = container.ownerDocument;
  container.replaceChildren();
  appendViewError(container, sessionSnapshot?.error);

  const hasPracticePackage = Array.isArray(practiceWords) && practiceWords.length > 0;
  const availableLearningSet = metrics.availableLearningSet ?? metrics.learningSet;
  const availableWordCount = hasPracticePackage
    ? practiceWords.length
    : options.selectedScopeWordCount ?? availableLearningSet?.allWords?.length ?? metrics.todayWordCount;

  if (availableWordCount === 0 && !hasPracticePackage) {
    summaryElement.textContent = "Dein Tagespaket ist vollständig bearbeitet.";
    const emptyCard = createElement(documentRoot, "section", {
      className: "card shell-card empty-state",
      attributes: { "aria-labelledby": "learn-empty-title" },
    });
    emptyCard.append(
      createElement(documentRoot, "h2", {
        className: "card__title",
        text: "Alles geschafft",
        attributes: { id: "learn-empty-title" },
      }),
      createElement(documentRoot, "p", {
        className: "card__description",
        text: "Für heute ist nichts mehr offen.",
      }),
      createDashboardLink(documentRoot),
    );
    container.append(emptyCard);
    return;
  }

  const packageWordCount = availableWordCount;
  const scopeOptions = options.learningScopeOptions ?? [];
  const selectedScopeLabel = hasPracticePackage
    ? `Unsichere Wörter · ${packageWordCount} ${packageWordCount === 1 ? "Wort" : "Wörter"}`
    : scopeOptions.length > 0
      ? formatLearningScope(
        scopeOptions,
        options.selectedScope?.value ?? "all",
        options.selectedScope?.packageIds,
      )
      : `Alle Lernpakete · ${packageWordCount} ${packageWordCount === 1 ? "Wort" : "Wörter"}`;
  summaryElement.textContent = hasPracticePackage
    ? `${packageWordCount} ${packageWordCount === 1 ? "unsicheres Wort ist" : "unsichere Wörter sind"} für deine Flashcards vorbereitet.`
    : packageWordCount === 1
      ? "1 Wort steht zum Lernen bereit."
      : `${packageWordCount} Wörter stehen zum Lernen bereit.`;

  const card = createElement(documentRoot, "section", {
    className: "card shell-card session-start-card",
    attributes: { "aria-labelledby": "learn-selection-title" },
  });
  const headingGroup = createElement(documentRoot, "div");
  headingGroup.append(
    createElement(documentRoot, "p", {
      className: "section-kicker",
      text: `${metrics.courseTitle} · ${metrics.currentUnitTitle}`,
    }),
    createElement(documentRoot, "h2", {
      className: "card__title",
      text: hasPracticePackage ? "Unsichere Wörter" : "Deine heutige Auswahl",
      attributes: { id: "learn-selection-title" },
    }),
  );
  const startButton = createElement(documentRoot, "button", {
    className: "button button--primary",
    text: "Lernen starten",
    dataset: { viewAction: hasPracticePackage ? "start-practice" : "start-daily" },
  });
  startButton.type = "button";

  if (!hasPracticePackage) card.dataset.flashcardConfig = "";
  card.append(
    headingGroup,
    hasPracticePackage
      ? createSummaryList(documentRoot, [
        { label: "Lernpaket", value: "Unsichere Wörter" },
        { label: "Insgesamt", value: packageWordCount, total: true },
      ])
      : createSummaryList(documentRoot, [
        {
          label: "Gewählter Lernbereich",
          value: selectedScopeLabel,
          total: true,
          valueDataset: { learningScopeSummary: "" },
        },
        { label: "Fällige Wiederholungen", value: availableLearningSet.reviewWords.length },
        { label: "Schwierige Wörter", value: availableLearningSet.difficultWords.length },
        { label: "Neue Wörter", value: availableLearningSet.newWords.length },
        { label: "Geschätzte Lernzeit", value: formatMinutes(metrics.estimatedMinutes) },
      ]),
    ...(!hasPracticePackage
      ? createLearningScopeFieldsets(
        documentRoot,
        "flashcards",
        options.learningScopeOptions ?? [],
        options.selectedScope?.value ?? "all",
        options.selectedScope?.packageIds,
      )
      : []),
    createFlashcardDirectionFieldset(documentRoot, "learn-flashcards"),
    createFlashcardSizeFieldset(documentRoot, "learn-flashcards", packageWordCount),
    startButton,
  );
  container.append(card);
}
