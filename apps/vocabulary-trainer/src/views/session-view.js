import {
  FLASHCARD_DIRECTIONS,
  getCurrentSessionCardDirection,
  getSessionProgress,
} from "../session/session-state.js?v=4.0.3";
import {
  formatSessionSizeSelection,
  getDefaultSessionSize,
  getSessionSizeOptions,
} from "../core/session-size.js?v=4.0.3";
import { isSnapshotWordMarked } from "../session/session-controller.js?v=4.0.3";
import {
  appendViewError,
  createActionButton,
  createDashboardLink,
  createElement,
  createSummaryList,
} from "./view-elements.js";

const BLOCKED_SHORTCUT_TARGETS = new Set(["a", "button", "input", "select", "textarea"]);

const DIRECTION_OPTIONS = Object.freeze([
  {
    value: FLASHCARD_DIRECTIONS.SOURCE_TO_TARGET,
    label: "Ausgangssprache → Zielsprache",
  },
  {
    value: FLASHCARD_DIRECTIONS.TARGET_TO_SOURCE,
    label: "Zielsprache → Ausgangssprache",
  },
  { value: FLASHCARD_DIRECTIONS.MIXED, label: "Gemischt" },
]);

export function getFlashcardDirectionLabel(direction) {
  return DIRECTION_OPTIONS.find((option) => option.value === direction)?.label
    ?? DIRECTION_OPTIONS[0].label;
}

/** Creates the same native, semantic direction choice for every source. */
export function createFlashcardDirectionFieldset(documentRoot, idPrefix) {
  const fieldset = createElement(documentRoot, "fieldset", {
    className: "quiz-config__group flashcard-direction",
  });
  fieldset.append(createElement(documentRoot, "legend", {
    className: "quiz-config__legend",
    text: "Lernrichtung",
  }));
  const choices = createElement(documentRoot, "div", {
    className: "quiz-config__choices flashcard-direction__choices",
  });

  DIRECTION_OPTIONS.forEach((option, index) => {
    const id = `${idPrefix}-direction-${option.value}`;
    const choice = createElement(documentRoot, "label", {
      className: "quiz-choice",
      attributes: { for: id },
    });
    const input = createElement(documentRoot, "input", {
      attributes: {
        id,
        name: `${idPrefix}-direction`,
        type: "radio",
        value: option.value,
      },
      dataset: { flashcardDirection: option.value },
    });
    input.type = "radio";
    input.name = `${idPrefix}-direction`;
    input.value = option.value;
    input.checked = index === 0;
    choice.append(
      input,
      createElement(documentRoot, "span", {
        className: "quiz-choice__label",
        text: option.label,
      }),
    );
    choices.append(choice);
  });

  fieldset.append(choices);
  return fieldset;
}

/** Creates a dynamic native amount choice for every Flashcard source. */
export function createFlashcardSizeFieldset(documentRoot, idPrefix, availableCount) {
  const fieldset = createElement(documentRoot, "fieldset", {
    className: "quiz-config__group quiz-config__group--balanced flashcard-size",
  });
  fieldset.append(createElement(documentRoot, "legend", {
    className: "quiz-config__legend",
    text: "Wie viele möchtest du jetzt üben?",
  }));
  const choices = createElement(documentRoot, "div", {
    className: "quiz-config__choices flashcard-size__choices",
  });
  const selectedValue = getDefaultSessionSize(availableCount, "flashcards");

  getSessionSizeOptions(availableCount, "flashcards").forEach((option) => {
    const id = `${idPrefix}-amount-${option.value}`;
    const choice = createElement(documentRoot, "label", {
      className: "quiz-choice",
      attributes: { for: id },
    });
    const input = createElement(documentRoot, "input", {
      attributes: {
        id,
        name: `${idPrefix}-amount`,
        type: "radio",
        value: option.value,
      },
      dataset: { flashcardAmount: option.value },
    });
    input.type = "radio";
    input.name = `${idPrefix}-amount`;
    input.value = option.value;
    input.checked = option.value === selectedValue;
    choice.append(
      input,
      createElement(documentRoot, "span", {
        className: "quiz-choice__label",
        text: option.label,
      }),
    );
    choices.append(choice);
  });

  const summaryId = `${idPrefix}-amount-summary`;
  fieldset.setAttribute("aria-describedby", summaryId);
  fieldset.append(
    choices,
    createElement(documentRoot, "p", {
      className: "form-field__help flashcard-size__summary",
      text: formatSessionSizeSelection(selectedValue, availableCount),
      attributes: { id: summaryId, "aria-live": "polite" },
      dataset: { flashcardAmountSummary: String(availableCount) },
    }),
  );
  return fieldset;
}

export function updateFlashcardSizeSummary(container, availableCount, selection) {
  const summary = container?.querySelector?.("[data-flashcard-amount-summary]");
  if (!summary) return false;
  summary.textContent = formatSessionSizeSelection(selection, availableCount);
  return true;
}

export function updateFlashcardSizeFieldset(container, idPrefix, availableCount) {
  const current = container?.querySelector?.(".flashcard-size");
  if (!current) return false;
  current.replaceWith(createFlashcardSizeFieldset(
    container.ownerDocument,
    idPrefix,
    availableCount,
  ));
  return true;
}

function targetBlocksShortcut(target) {
  const tagName = target?.tagName?.toLowerCase?.() ?? "";
  return BLOCKED_SHORTCUT_TARGETS.has(tagName)
    || target?.isContentEditable === true
    || Boolean(target?.closest?.("[contenteditable='true']"));
}

/** Maps one keyboard event to a session action without touching the DOM. */
export function getSessionShortcut(event, snapshot, hasOpenDialog = false) {
  const session = snapshot?.session;

  if (
    !session
    || session.completed
    || snapshot.transitioning
    || event.repeat
    || event.altKey
    || event.ctrlKey
    || event.metaKey
    || hasOpenDialog
    || targetBlocksShortcut(event.target)
  ) {
    return null;
  }

  if (!session.solutionVisible) {
    return event.key === "Enter"
      || event.key === " "
      || event.key === "Spacebar"
      || event.code === "Space"
      ? "reveal"
      : null;
  }

  if (event.key === "ArrowLeft") {
    return "wrong";
  }

  if (event.key === "ArrowRight") {
    return "correct";
  }

  return event.key?.toLowerCase?.() === "m" ? "mark" : null;
}

function renderSessionErrorState(container, snapshot, idPrefix) {
  const documentRoot = container.ownerDocument;
  const titleId = `${idPrefix}-unavailable-title`;
  appendViewError(container, snapshot.error);
  const card = createElement(documentRoot, "section", {
    className: "card shell-card empty-state",
    attributes: { "aria-labelledby": titleId },
  });
  card.append(
    createElement(documentRoot, "h2", {
      className: "card__title",
      text: "Lerneinheit nicht verfügbar",
      attributes: { id: titleId, tabindex: "-1" },
      dataset: { sessionFocusError: "" },
    }),
    createElement(documentRoot, "p", {
      className: "card__description",
      text: snapshot.error ?? "Die aktuelle Karte konnte nicht geladen werden.",
    }),
    createDashboardLink(documentRoot),
  );
  container.append(card);
}

function renderCompletion(container, snapshot, idPrefix) {
  const documentRoot = container.ownerDocument;
  const { session } = snapshot;
  const handledCount = session.results.correct.length + session.results.wrong.length;
  const distinctWrongCount = new Set(session.results.wrong).size;
  const card = createElement(documentRoot, "section", {
    className: "card shell-card session-completion",
    attributes: { "aria-labelledby": `${idPrefix}-completion-title` },
  });
  const heading = createElement(documentRoot, "h2", {
    className: "card__title",
    text: "Lerneinheit abgeschlossen",
    attributes: { id: `${idPrefix}-completion-title`, tabindex: "-1" },
    dataset: { sessionFocusComplete: "" },
  });

  card.append(
    createElement(documentRoot, "p", {
      className: "card__description",
      text: "Deine Bewertungen wurden lokal gespeichert.",
    }),
    createSummaryList(documentRoot, [
      { label: "Insgesamt bearbeitet", value: handledCount, total: true },
      { label: "Kann ich", value: session.results.correct.length },
      { label: "Noch nicht", value: session.results.wrong.length },
      { label: "Aktuell gemerkt", value: session.results.marked.length },
    ]),
  );
  card.prepend(heading);

  if (session.retriedWordIds.length > 0) {
    card.append(createElement(documentRoot, "p", {
      className: "card__description",
      text: `${session.retriedWordIds.length} ${session.retriedWordIds.length === 1 ? "Wort wurde" : "Wörter wurden"} innerhalb der Einheit erneut gezeigt.`,
    }));
  }

  const actions = createElement(documentRoot, "div", { className: "session-completion__actions" });
  actions.append(createDashboardLink(documentRoot));

  if (distinctWrongCount > 0) {
    actions.append(createActionButton(
      documentRoot,
      "Unsichere Wörter noch einmal üben",
      "retry",
      "secondary",
    ));
  }

  card.append(actions);
  container.append(card);
}

function renderActiveCard(container, snapshot, options) {
  const documentRoot = container.ownerDocument;
  const { session, currentWord, transitioning } = snapshot;
  const progress = getSessionProgress(session);
  const cardDirection = getCurrentSessionCardDirection(session);
  const isTargetToSource = cardDirection === FLASHCARD_DIRECTIONS.TARGET_TO_SOURCE;
  const unitTitle = options.getUnitTitle(currentWord.unitId);
  const cardTitleId = `${options.idPrefix}-card-title`;
  const solutionTitleId = `${options.idPrefix}-solution-title`;

  appendViewError(container, snapshot.error);

  const status = createElement(documentRoot, "div", { className: "session-status" });
  const statusText = createElement(documentRoot, "p", {
    className: "session-status__text",
    text: [
      options.modeLabel,
      options.learningScopeLabel,
      getFlashcardDirectionLabel(cardDirection),
      `${progress.current} von ${progress.total}`,
    ].filter(Boolean).join(" · "),
    attributes: { "aria-live": "polite" },
  });
  const progressElement = createElement(documentRoot, "progress", {
    className: "unit-progress session-progress",
    text: `${progress.current} von ${progress.total}`,
    attributes: {
      value: progress.current,
      max: progress.total,
      "aria-label": `Lernfortschritt: ${progress.current} von ${progress.total}`,
    },
  });
  status.append(statusText, progressElement);
  if (options.allowScopeChange) {
    status.append(createActionButton(documentRoot, "Lernbereich ändern", "change-scope", "text"));
  }

  const card = createElement(documentRoot, "section", {
    className: "card flashcard",
    attributes: { "aria-labelledby": cardTitleId },
  });
  const context = createElement(documentRoot, "p", {
    className: "section-kicker",
    text: unitTitle,
  });
  const promptText = isTargetToSource
    ? currentWord.targets.join(" / ")
    : currentWord.source;
  const promptLanguage = isTargetToSource
    ? options.languageCodes?.target
    : options.languageCodes?.source;
  const prompt = createElement(documentRoot, "h2", {
    className: "flashcard__source content-title",
    text: promptText,
    attributes: {
      id: cardTitleId,
      tabindex: "-1",
      ...(promptLanguage ? { lang: promptLanguage } : {}),
    },
    dataset: { sessionFocusCard: "" },
  });
  const promptRow = createElement(documentRoot, "div", { className: "pronunciation-term" });
  promptRow.append(prompt);
  if (!isTargetToSource) {
    const sourceAudio = options.pronunciation?.createButton(documentRoot, {
      id: `${currentWord.id}-source-front`,
      text: currentWord.source,
      role: "source",
    });
    if (sourceAudio) promptRow.append(sourceAudio);
  }
  card.append(context, promptRow);

  if (!isTargetToSource && currentWord.phonetic) {
    card.append(createElement(documentRoot, "p", {
      className: "flashcard__phonetic",
      text: currentWord.phonetic,
      attributes: { "aria-label": `Lautschrift: ${currentWord.phonetic}` },
    }));
  }

  if (currentWord.hint) {
    const hint = createElement(documentRoot, "p", { className: "flashcard__hint" });
    hint.append(
      createElement(documentRoot, "strong", { text: "Hinweis: " }),
      createElement(documentRoot, "span", {
        text: currentWord.hint,
        attributes: options.languageCodes?.source
          ? { lang: options.languageCodes.source }
          : {},
      }),
    );
    card.append(hint);
  }

  if (!session.solutionVisible) {
    const revealButton = createActionButton(documentRoot, "Lösung anzeigen", "reveal");
    revealButton.disabled = transitioning;
    card.append(revealButton);
  } else {
    const solution = createElement(documentRoot, "section", {
      className: "flashcard__solution",
      attributes: { "aria-labelledby": solutionTitleId },
    });
    solution.append(createElement(documentRoot, "h3", {
      className: "flashcard__solution-title",
      text: "Lösung",
      attributes: { id: solutionTitleId },
    }));

    if (isTargetToSource) {
      const sourceSolution = createElement(documentRoot, "div", {
        className: "flashcard__source-solution pronunciation-term",
      });
      sourceSolution.append(createElement(documentRoot, "p", {
        className: "flashcard__solution-word",
        text: currentWord.source,
        attributes: options.languageCodes?.source
          ? { lang: options.languageCodes.source }
          : {},
      }));
      const sourceAudio = options.pronunciation?.createButton(documentRoot, {
        id: `${currentWord.id}-source-back`,
        text: currentWord.source,
        role: "source",
      });
      if (sourceAudio) sourceSolution.append(sourceAudio);
      solution.append(sourceSolution);
      if (currentWord.phonetic) {
        solution.append(createElement(documentRoot, "p", {
          className: "flashcard__phonetic",
          text: currentWord.phonetic,
          attributes: { "aria-label": `Lautschrift: ${currentWord.phonetic}` },
        }));
      }
    } else {
      const targets = createElement(documentRoot, "ul", { className: "flashcard__targets" });
      currentWord.targets.forEach((target) => {
        const item = createElement(documentRoot, "li", { className: "pronunciation-term" });
        item.append(createElement(documentRoot, "span", {
          text: target,
          attributes: options.languageCodes?.target
            ? { lang: options.languageCodes.target }
            : {},
        }));
        targets.append(item);
      });
      solution.append(targets);
    }

    if (currentWord.example) {
      solution.append(createElement(documentRoot, "p", {
        className: "flashcard__example",
        text: currentWord.example,
        attributes: options.languageCodes?.source
          ? { lang: options.languageCodes.source }
          : {},
      }));
    }

    const ratingActions = createElement(documentRoot, "div", { className: "session-actions" });
    const wrongButton = createActionButton(documentRoot, "Noch nicht", "wrong", "secondary");
    wrongButton.dataset.sessionFocusSolution = "";
    const correctButton = createActionButton(documentRoot, "Kann ich", "correct", "secondary");
    const marked = isSnapshotWordMarked(snapshot, currentWord.id);
    const markButton = createActionButton(
      documentRoot,
      marked ? "Markierung entfernen" : "Markieren",
      "mark",
      "outline",
    );
    markButton.setAttribute("aria-pressed", String(marked));
    markButton.dataset.sessionFocusMark = "";

    [wrongButton, correctButton, markButton].forEach((button) => {
      button.disabled = transitioning;
    });

    ratingActions.append(wrongButton, correctButton, markButton);
    solution.append(ratingActions);
    card.append(solution);
  }

  container.append(status, card);
}

/** Renders the shared Flashcard session for daily, review, marked and retry. */
export function renderSessionView(container, snapshot, options) {
  container.replaceChildren();

  if (!snapshot?.session) {
    return;
  }

  if (snapshot.session.completed) {
    appendViewError(container, snapshot.error);
    renderCompletion(container, snapshot, options.idPrefix);
    return;
  }

  if (!snapshot.currentWord) {
    renderSessionErrorState(container, snapshot, options.idPrefix);
    return;
  }

  renderActiveCard(container, snapshot, options);
}

/** Announces an action through a persistent route-level live region. */
export function announceSession(liveRegion, message) {
  if (!liveRegion) {
    return;
  }

  liveRegion.textContent = "";
  Promise.resolve().then(() => {
    liveRegion.textContent = message;
  });
}

/** Moves focus after reveal, card change, mark toggle or completion. */
export function focusSessionTarget(container, targetName) {
  const selectors = {
    card: "[data-session-focus-card]",
    completion: "[data-session-focus-complete]",
    error: "[data-session-focus-error]",
    mark: "[data-session-focus-mark]",
    solution: "[data-session-focus-solution]",
  };
  const target = container.querySelector(selectors[targetName]);
  target?.focus();
}
