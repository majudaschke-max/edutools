import {
  getWritingProgress,
  WRITING_DIRECTIONS,
} from "../writing/writing-state.js";
import { createAnswerFeedback } from "../core/answer-feedback.js";
import {
  createLearningScopeFieldsets,
  createSessionAmountFieldset,
} from "./learning-scope-view.js";
import {
  appendViewError,
  createDashboardLink,
  createElement,
  createSummaryList,
} from "./view-elements.js";

const SOURCE_LABELS = Object.freeze({
  "current-unit": "Aktuelles Lernpaket",
  all: "Alle Lernpakete",
  difficult: "Schwierige Wörter",
  marked: "Gemerkte Wörter",
  due: "Fällige Wiederholungen",
});

const DIRECTION_LABELS = Object.freeze({
  [WRITING_DIRECTIONS.SOURCE_TO_TARGET]: "Ausgangssprache → Zielsprache",
  [WRITING_DIRECTIONS.TARGET_TO_SOURCE]: "Zielsprache → Ausgangssprache",
  [WRITING_DIRECTIONS.MIXED]: "Gemischt",
});

function targetBlocksShortcut(target) {
  const tagName = target?.tagName?.toLowerCase?.() ?? "";
  if (
    tagName === "button"
    || tagName === "a"
    || tagName === "input"
    || tagName === "select"
    || tagName === "textarea"
    || target?.isContentEditable === true
    || Boolean(target?.closest?.("[contenteditable='true']"))
  ) {
    return true;
  }
  return false;
}

/** Maps a keyboard event to a writing action without touching state or UI. */
export function getWritingShortcut(event, snapshot, hasOpenDialog = false) {
  const writing = snapshot?.writing;
  if (
    !writing
    || writing.completed
    || snapshot.transitioning
    || event.repeat
    || event.altKey
    || event.ctrlKey
    || event.metaKey
    || hasOpenDialog
  ) {
    return null;
  }

  if (event.key === "Escape") {
    return "exit";
  }
  if (
    !writing.answerSubmitted
    && event.key === "Enter"
    && event.target?.tagName?.toLowerCase?.() === "input"
  ) {
    return "submit";
  }
  if (targetBlocksShortcut(event.target)) {
    return null;
  }
  if (writing.answerSubmitted) {
    return event.key === "Enter" ? "next" : null;
  }
  if (
    event.key?.toLowerCase?.() === "h"
    && writing.currentPrompt?.hasHint
    && !writing.hintUsed
  ) {
    return "hint";
  }
  return null;
}

function createRadioOption(documentRoot, options) {
  const label = createElement(documentRoot, "label", { className: "quiz-choice" });
  const input = createElement(documentRoot, "input", {
    attributes: {
      id: options.id,
      name: options.name,
      value: options.value,
    },
  });
  input.type = "radio";
  input.checked = options.checked === true;
  label.append(
    input,
    createElement(documentRoot, "span", {
      className: "quiz-choice__label",
      text: options.label,
    }),
  );
  return label;
}

function createRadioGroup(documentRoot, options) {
  const fieldset = createElement(documentRoot, "fieldset", {
    className: options.className ?? "quiz-config__group",
  });
  fieldset.append(createElement(documentRoot, "legend", {
    className: "quiz-config__legend",
    text: options.legend,
  }));
  const choices = createElement(documentRoot, "div", { className: "quiz-config__choices" });
  options.items.forEach((item, index) => {
    choices.append(createRadioOption(documentRoot, {
      id: `${options.name}-${index}`,
      name: options.name,
      value: item.value,
      label: item.label,
      checked: item.value === options.selected,
    }));
  });
  fieldset.append(choices);
  return fieldset;
}

function getLimitHint(availableCount, selectedAmount = 5) {
  if (selectedAmount === "all" || availableCount >= selectedAmount) {
    return "";
  }
  return `Es sind nur ${availableCount} ${availableCount === 1 ? "Wort" : "Wörter"} verfügbar; verwendet werden alle verfügbaren Wörter.`;
}

function renderConfiguration(container, options) {
  const documentRoot = container.ownerDocument;
  const { sourceOptions, snapshot, summaryElement } = options;
  container.replaceChildren();
  appendViewError(container, snapshot?.error);

  if (sourceOptions.length === 0) {
    summaryElement.textContent = "Aktuell ist kein geeignetes Schreibtraining verfügbar.";
    const empty = createElement(documentRoot, "section", {
      className: "card shell-card empty-state",
      attributes: { "aria-labelledby": "writing-empty-title" },
    });
    empty.append(
      createElement(documentRoot, "h2", {
        className: "card__title",
        text: "Noch keine Schreibwörter",
        attributes: { id: "writing-empty-title" },
      }),
      createElement(documentRoot, "p", {
        className: "card__description",
        text: "Für die verfügbaren Lernquellen sind aktuell keine Wörter vorhanden.",
      }),
      createDashboardLink(documentRoot),
    );
    container.append(empty);
    return;
  }

  summaryElement.textContent = "Wähle Lernquelle, Schreibrichtung und Umfang in Ruhe aus.";
  const rememberedValue = options.selectedScope?.value;
  const defaultSource = sourceOptions.find((source) => source.value === rememberedValue)
    ?? sourceOptions[0];
  const form = createElement(documentRoot, "form", {
    className: "card shell-card writing-config",
    attributes: { "aria-labelledby": "writing-config-title" },
    dataset: { writingConfig: "" },
  });
  form.append(
    createElement(documentRoot, "h2", {
      className: "card__title",
      text: "Schreibtraining zusammenstellen",
      attributes: { id: "writing-config-title" },
    }),
    ...createLearningScopeFieldsets(
      documentRoot,
      "writing",
      sourceOptions,
      defaultSource.value,
      options.selectedScope?.packageIds,
    ),
    createRadioGroup(documentRoot, {
      legend: "Schreibrichtung",
      name: "writing-direction",
      selected: WRITING_DIRECTIONS.MIXED,
      items: [
        { value: WRITING_DIRECTIONS.SOURCE_TO_TARGET, label: DIRECTION_LABELS[WRITING_DIRECTIONS.SOURCE_TO_TARGET] },
        { value: WRITING_DIRECTIONS.TARGET_TO_SOURCE, label: DIRECTION_LABELS[WRITING_DIRECTIONS.TARGET_TO_SOURCE] },
        { value: WRITING_DIRECTIONS.MIXED, label: DIRECTION_LABELS[WRITING_DIRECTIONS.MIXED] },
      ],
    }),
    createSessionAmountFieldset(
      documentRoot,
      "writing",
      options.selectedScopeWordCount || defaultSource.words.length,
      "write",
      "Wörter",
    ),
  );

  const limitHint = createElement(documentRoot, "p", {
    className: "quiz-config__hint",
    text: getLimitHint(defaultSource.words.length),
    attributes: { "aria-live": "polite" },
    dataset: { writingLimitHint: "" },
  });
  limitHint.hidden = limitHint.textContent.length === 0;
  const startButton = createElement(documentRoot, "button", {
    className: "button button--primary",
    text: "Schreibtraining starten",
    dataset: { writingAction: "start" },
  });
  startButton.type = "button";
  form.append(limitHint, startButton);
  container.append(form);
}

function renderExitDialog(documentRoot) {
  const dialog = createElement(documentRoot, "dialog", {
    className: "quiz-exit-dialog",
    attributes: {
      "aria-labelledby": "writing-exit-title",
      "aria-describedby": "writing-exit-description",
    },
    dataset: { writingExitDialog: "" },
  });
  const content = createElement(documentRoot, "div", { className: "quiz-exit-dialog__content" });
  content.append(
    createElement(documentRoot, "h2", {
      className: "card__title",
      text: "Schreibtraining verlassen?",
      attributes: { id: "writing-exit-title" },
    }),
    createElement(documentRoot, "p", {
      className: "card__description",
      text: "Bereits gespeicherte Antworten bleiben erhalten. Die laufende Schreibsession wird verworfen.",
      attributes: { id: "writing-exit-description" },
    }),
  );
  const actions = createElement(documentRoot, "div", { className: "quiz-exit-dialog__actions" });
  const cancel = createElement(documentRoot, "button", {
    className: "button button--secondary",
    text: "Training fortsetzen",
    dataset: { writingDialogAction: "cancel" },
  });
  cancel.type = "button";
  const confirm = createElement(documentRoot, "button", {
    className: "button button--text",
    text: "Training verlassen",
    dataset: { writingDialogAction: "confirm" },
  });
  confirm.type = "button";
  actions.append(cancel, confirm);
  content.append(actions);
  dialog.append(content);
  return dialog;
}

function renderFeedback(documentRoot, snapshot, options) {
  const { writing, currentWord } = snapshot;
  const result = writing.result;
  const content = createAnswerFeedback({
    isCorrect: result.isCorrect,
    acceptedAnswers: result.acceptedAnswers,
  });
  const feedback = createElement(documentRoot, "section", {
    className: result.isCorrect
      ? "writing-feedback writing-feedback--correct"
      : "writing-feedback writing-feedback--wrong",
    attributes: {
      "aria-labelledby": "writing-feedback-title",
      tabindex: "-1",
    },
    dataset: { writingFocusFeedback: "" },
  });
  feedback.append(createElement(documentRoot, "h3", {
    className: "writing-feedback__title",
    text: content.title,
    attributes: { id: "writing-feedback-title" },
  }));
  if (content.solutionText) {
    feedback.append(createElement(documentRoot, "p", {
      className: "writing-feedback__connection",
      text: content.solutionText,
    }));
  }

  if (currentWord?.hint) {
    const hint = createElement(documentRoot, "p", { className: "writing-feedback__detail" });
    hint.append(
      createElement(documentRoot, "strong", { text: "Hinweis: " }),
      createElement(documentRoot, "span", {
        text: currentWord.hint,
        attributes: options.languageCodes?.source
          ? { lang: options.languageCodes.source }
          : {},
      }),
    );
    feedback.append(hint);
  }
  if (currentWord?.example) {
    feedback.append(createElement(documentRoot, "p", {
      className: "writing-feedback__example",
      text: currentWord.example,
      attributes: options.languageCodes?.source
        ? { lang: options.languageCodes.source }
        : {},
    }));
  }

  const solutionRole = writing.currentPrompt.direction === WRITING_DIRECTIONS.SOURCE_TO_TARGET
    ? "target"
    : "source";
  const solutionPronunciations = createElement(documentRoot, "div", {
    className: "pronunciation-answer-list",
    attributes: { "aria-label": "Aussprache der richtigen Lösung" },
  });
  result.acceptedAnswers.forEach((answer, index) => {
    const row = createElement(documentRoot, "div", { className: "pronunciation-term" });
    row.append(createElement(documentRoot, "span", {
      text: answer,
      attributes: options.languageCodes?.[solutionRole]
        ? { lang: options.languageCodes[solutionRole] }
        : {},
    }));
    const audioButton = options.pronunciation?.createButton(documentRoot, {
      id: `writing-${currentWord.id}-answer-${index}`,
      text: answer,
      role: solutionRole,
      compact: true,
    });
    if (audioButton) {
      row.append(audioButton);
      solutionPronunciations.append(row);
    }
  });
  if (solutionPronunciations.children.length > 0) feedback.append(solutionPronunciations);

  const nextButton = createElement(documentRoot, "button", {
    className: "button button--primary",
    text: "Weiter",
    dataset: { writingAction: "next" },
  });
  nextButton.type = "button";
  feedback.append(nextButton);
  return feedback;
}

function renderPrompt(container, options) {
  const documentRoot = container.ownerDocument;
  const { snapshot, summaryElement, sourceOptions } = options;
  const { writing, currentWord } = snapshot;
  const prompt = writing.currentPrompt;
  const progress = getWritingProgress(writing);
  const sourceLabel = options.activeScopeLabel
    ?? sourceOptions.find((source) => source.value === writing.sourceType)?.label
    ?? SOURCE_LABELS[writing.sourceType]
    ?? writing.sourceType;

  container.replaceChildren();
  summaryElement.textContent = writing.answerSubmitted
    ? "Sieh dir die Rückmeldung an und gehe dann bewusst weiter."
    : "Schreibe die passende Antwort selbst und prüfe sie anschließend.";

  const status = createElement(documentRoot, "div", { className: "session-status writing-status" });
  status.append(
    createElement(documentRoot, "p", {
      className: "session-status__text",
      text: `Schreibtraining · ${progress.current} von ${progress.total}`,
      attributes: { "aria-live": "polite" },
    }),
    createElement(documentRoot, "progress", {
      className: "unit-progress session-progress",
      text: `${progress.current} von ${progress.total}`,
      attributes: {
        value: progress.current,
        max: progress.total,
        "aria-label": `Schreibfortschritt: ${progress.current} von ${progress.total}`,
      },
    }),
  );
  status.append(createElement(documentRoot, "button", {
    className: "button button--text",
    text: "Lernbereich ändern",
    attributes: { type: "button" },
    dataset: { writingAction: "change-scope" },
  }));
  const requestedAmount = Number(writing.requestedAmount);
  if (Number.isFinite(requestedAmount) && writing.wordIds.length < requestedAmount) {
    status.append(createElement(documentRoot, "p", {
      className: "quiz-config__hint",
      text: `Es sind ${writing.wordIds.length} geeignete ${writing.wordIds.length === 1 ? "Aufgabe" : "Aufgaben"} verfügbar; verwendet werden alle.`,
    }));
  }

  const card = createElement(documentRoot, "section", {
    className: "card writing-card",
    attributes: { "aria-labelledby": "writing-prompt-title" },
  });
  const promptContext = createElement(documentRoot, "p", {
      className: "section-kicker",
      text: `${sourceLabel} · ${prompt.type === "cloze" ? "Lückensatz" : DIRECTION_LABELS[prompt.direction]}`,
    });
  const promptRow = createElement(documentRoot, "div", { className: "pronunciation-term" });
  const promptRole = prompt.type === "cloze"
    ? "source"
    : prompt.direction === WRITING_DIRECTIONS.SOURCE_TO_TARGET
    ? "source"
    : "target";
  promptRow.append(createElement(documentRoot, "h2", {
      className: "writing-card__prompt content-title",
      text: prompt.prompt,
      attributes: {
        id: "writing-prompt-title",
        ...(options.languageCodes?.[promptRole]
          ? { lang: options.languageCodes[promptRole] }
          : {}),
      },
    }));
  const promptAudio = options.pronunciation?.createButton(documentRoot, {
    id: `writing-${currentWord.id}-prompt`,
    text: prompt.prompt,
    role: promptRole,
  });
  if (promptAudio && prompt.type !== "cloze") promptRow.append(promptAudio);
  card.append(promptContext, promptRow);
  if (prompt.phonetic) {
    card.append(createElement(documentRoot, "p", {
      className: "flashcard__phonetic",
      text: prompt.phonetic,
      attributes: { "aria-label": `Lautschrift: ${prompt.phonetic}` },
    }));
  }

  const form = createElement(documentRoot, "form", {
    className: "writing-answer-form",
    dataset: { writingForm: "" },
  });
  const label = createElement(documentRoot, "label", {
    className: "writing-answer-label",
    text: prompt.direction === WRITING_DIRECTIONS.SOURCE_TO_TARGET
      ? "Deine Übersetzung"
      : "Dein Ausgangsbegriff",
    attributes: { for: "writing-answer" },
  });
  const describedBy = ["writing-answer-error"];
  if (writing.hintUsed) describedBy.push("writing-hint");
  const input = createElement(documentRoot, "input", {
    className: "writing-answer-input",
    attributes: {
      id: "writing-answer",
      name: "writing-answer",
      autocomplete: "off",
      autocapitalize: "off",
      spellcheck: "false",
      "aria-describedby": describedBy.join(" "),
      "aria-invalid": String(Boolean(snapshot.error)),
    },
    dataset: { writingFocusInput: "" },
  });
  input.type = "text";
  input.value = writing.userAnswer;
  input.disabled = writing.answerSubmitted || snapshot.transitioning;
  form.append(label, input);

  const answerError = createElement(documentRoot, "p", {
    className: "writing-answer-error",
    text: snapshot.error ?? "",
    attributes: { id: "writing-answer-error", role: "alert" },
    dataset: { writingFocusError: "" },
  });
  answerError.hidden = !snapshot.error;
  form.append(answerError);

  if (!writing.answerSubmitted) {
    if (prompt.hasHint && !writing.hintUsed) {
      const hintButton = createElement(documentRoot, "button", {
        className: "button button--text writing-hint-action",
        text: "Hinweis anzeigen",
        dataset: { writingAction: "hint" },
      });
      hintButton.type = "button";
      form.append(hintButton);
    }
    if (writing.hintUsed && currentWord?.hint) {
      const hint = createElement(documentRoot, "p", {
        className: "writing-hint",
        attributes: { id: "writing-hint" },
      });
      hint.append(
        createElement(documentRoot, "strong", { text: "Hinweis: " }),
        createElement(documentRoot, "span", {
          text: currentWord.hint,
          attributes: options.languageCodes?.source
            ? { lang: options.languageCodes.source }
            : {},
        }),
      );
      form.append(hint);
    }
    const submitButton = createElement(documentRoot, "button", {
      className: "button button--primary",
      text: "Antwort prüfen",
    });
    submitButton.type = "submit";
    submitButton.disabled = snapshot.transitioning;
    form.append(submitButton);
  }

  card.append(form);
  if (writing.answerSubmitted) {
    card.append(renderFeedback(documentRoot, snapshot, options));
  }

  container.append(status, card, renderExitDialog(documentRoot));
}

function renderCompletion(container, options) {
  const documentRoot = container.ownerDocument;
  const { snapshot, summaryElement } = options;
  const { summary, wrongEntries } = snapshot;
  container.replaceChildren();
  summaryElement.textContent = "Alle Antworten wurden ausgewertet und lokal gespeichert.";

  const card = createElement(documentRoot, "section", {
    className: "card shell-card writing-completion",
    attributes: { "aria-labelledby": "writing-completion-title" },
  });
  card.append(
    createElement(documentRoot, "h2", {
      className: "card__title",
      text: "Schreibtraining abgeschlossen",
      attributes: { id: "writing-completion-title", tabindex: "-1" },
      dataset: { writingFocusCompletion: "" },
    }),
    createSummaryList(documentRoot, [
      { label: "Aufgaben", value: summary.taskCount, total: true },
      { label: "Richtig", value: summary.correctCount },
      { label: "Falsch", value: summary.wrongCount },
      { label: "Erfolgsquote", value: `${summary.successRate} %` },
      { label: "Verwendete Hinweise", value: summary.hintCount },
    ]),
  );

  if (summary.wrongCount === 0) {
    card.append(createElement(documentRoot, "p", {
      className: "quiz-completion__message",
      text: "Alle Wörter wurden richtig geschrieben.",
    }));
  } else {
    const wrongSection = createElement(documentRoot, "section", {
      className: "writing-wrong-answers",
      attributes: { "aria-labelledby": "writing-wrong-title" },
    });
    wrongSection.append(createElement(documentRoot, "h3", {
      className: "writing-wrong-answers__title",
      text: "Noch unsichere Schreibweisen",
      attributes: { id: "writing-wrong-title" },
    }));
    const list = createElement(documentRoot, "ul", { className: "writing-wrong-list" });
    wrongEntries.forEach(({ word, result }) => {
      const item = createElement(documentRoot, "li", { className: "writing-wrong-list__item" });
      item.append(
        createElement(documentRoot, "strong", { text: word.source }),
        createElement(documentRoot, "span", { text: `Eingabe: ${result.userAnswer}` }),
        createElement(documentRoot, "span", { text: `Richtig: ${result.acceptedAnswers.join(" / ")}` }),
      );
      list.append(item);
    });
    wrongSection.append(list);
    card.append(wrongSection);
  }

  const actions = createElement(documentRoot, "div", { className: "writing-completion__actions" });
  const restart = createElement(documentRoot, "button", {
    className: "button button--secondary",
    text: "Schreibtraining erneut starten",
    dataset: { writingAction: "restart" },
  });
  restart.type = "button";
  actions.append(restart);
  if (summary.wrongCount > 0) {
    const practice = createElement(documentRoot, "button", {
      className: "button button--primary",
      text: "Falsche Wörter mit Karteikarten üben",
      dataset: { writingAction: "practice-wrong" },
    });
    practice.type = "button";
    actions.append(practice);
  }
  actions.append(createDashboardLink(documentRoot, "Zum Dashboard", "text"));
  card.append(actions);
  container.append(card);
}

/** Renders configuration, active writing task/feedback, or completion. */
export function renderWritingView(options) {
  if (!options.snapshot?.writing) {
    renderConfiguration(options.container, options);
  } else if (options.snapshot.writing.completed) {
    renderCompletion(options.container, options);
  } else {
    renderPrompt(options.container, options);
  }
}

/** Updates the amount hint after source or requested amount changes. */
export function updateWritingLimitHint(container, availableCount, selectedAmount) {
  const hint = container.querySelector("[data-writing-limit-hint]");
  if (!hint) return;
  hint.textContent = getLimitHint(availableCount, selectedAmount);
  hint.hidden = hint.textContent.length === 0;
}

/** Moves focus after starting, validation, feedback, advancing or completion. */
export function focusWritingTarget(container, targetName) {
  const selectors = {
    completion: "[data-writing-focus-completion]",
    error: "[data-writing-focus-error]",
    feedback: "[data-writing-focus-feedback]",
    input: "[data-writing-focus-input]",
  };
  container.querySelector(selectors[targetName])?.focus();
}
