import {
  createFlashcardDirectionFieldset,
  createFlashcardSizeFieldset,
  renderSessionView,
} from "./session-view.js?v=4.0.5";
import {
  appendViewError,
  createDashboardLink,
  createElement,
  createSummaryList,
} from "./view-elements.js";

/** Renders the due-word pre-start, empty state or active shared session. */
export function renderReviewView(options) {
  const {
    container,
    reviewWords,
    sessionSnapshot,
    getUnitTitle,
    summaryElement,
  } = options;

  if (sessionSnapshot?.session) {
    summaryElement.textContent = sessionSnapshot.session.sourceType === "retry"
      ? "Übe deine unsicheren Wörter noch einmal."
      : "Wiederhole ausschließlich Wörter, die aktuell fällig sind.";
    renderSessionView(container, sessionSnapshot, {
      getUnitTitle,
      idPrefix: "review-session",
      modeLabel: sessionSnapshot.session.sourceType === "retry"
        ? "Unsichere Wörter"
        : "Wiederholen",
      pronunciation: options.pronunciation,
      languageCodes: options.languageCodes,
    });
    return;
  }

  const documentRoot = container.ownerDocument;
  container.replaceChildren();
  appendViewError(container, sessionSnapshot?.error);

  if (reviewWords.length === 0) {
    summaryElement.textContent = "Aktuell ist keine Wiederholung fällig.";
    const emptyCard = createElement(documentRoot, "section", {
      className: "card shell-card empty-state",
      attributes: { "aria-labelledby": "review-empty-title" },
    });
    emptyCard.append(
      createElement(documentRoot, "h2", {
        className: "card__title",
        text: "Alles im Rhythmus",
        attributes: { id: "review-empty-title" },
      }),
      createElement(documentRoot, "p", {
        className: "card__description",
        text: "Aktuell ist keine Wiederholung fällig.",
      }),
      createDashboardLink(documentRoot),
    );
    container.append(emptyCard);
    return;
  }

  summaryElement.textContent = reviewWords.length === 1
    ? "1 Wort ist jetzt zur Wiederholung fällig."
    : `${reviewWords.length} Wörter sind jetzt zur Wiederholung fällig.`;
  const card = createElement(documentRoot, "section", {
    className: "card shell-card session-start-card",
    attributes: { "aria-labelledby": "review-selection-title" },
  });
  const startButton = createElement(documentRoot, "button", {
    className: "button button--primary",
    text: "Lernen starten",
    dataset: { viewAction: "start-review" },
  });
  startButton.type = "button";
  card.append(
    createElement(documentRoot, "h2", {
      className: "card__title",
      text: "Heute fällig",
      attributes: { id: "review-selection-title" },
    }),
    createSummaryList(documentRoot, [
      { label: "Lernpaket", value: "Fällige Wiederholungen" },
      { label: "Fällige Wörter", value: reviewWords.length, total: true },
      { label: "Neue Wörter", value: 0 },
    ]),
    createFlashcardDirectionFieldset(documentRoot, "review-flashcards"),
    createFlashcardSizeFieldset(documentRoot, "review-flashcards", reviewWords.length),
    startButton,
  );
  container.append(card);
}
