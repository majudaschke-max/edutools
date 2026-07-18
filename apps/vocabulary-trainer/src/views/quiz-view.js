import { normalizeQuizAnswer, QUIZ_DIRECTIONS } from "../quiz/quiz-generator.js";
import { getQuizProgress } from "../quiz/quiz-state.js";
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
  [QUIZ_DIRECTIONS.SOURCE_TO_TARGET]: "Ausgangssprache → Zielsprache",
  [QUIZ_DIRECTIONS.TARGET_TO_SOURCE]: "Zielsprache → Ausgangssprache",
  [QUIZ_DIRECTIONS.MIXED]: "Gemischt",
});

function targetBlocksShortcut(target) {
  const tagName = target?.tagName?.toLowerCase?.() ?? "";
  const inputType = target?.type?.toLowerCase?.() ?? "";

  if (
    tagName === "button"
    || tagName === "a"
    || tagName === "select"
    || tagName === "textarea"
    || (tagName === "input" && inputType !== "radio")
    || target?.isContentEditable === true
    || Boolean(target?.closest?.("[contenteditable='true']"))
  ) {
    return true;
  }

  return false;
}

/** Maps a keyboard event to one quiz action without changing UI or state. */
export function getQuizShortcut(event, snapshot, hasOpenDialog = false) {
  const quiz = snapshot?.quiz;

  if (
    !quiz
    || quiz.completed
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

  if (event.key === "Escape") {
    return "exit";
  }

  if (quiz.answerSubmitted) {
    return event.key === "Enter" ? "next" : null;
  }

  if (event.key === "ArrowDown") {
    return "select-next";
  }

  if (event.key === "ArrowUp") {
    return "select-previous";
  }

  if (/^[1-4]$/.test(event.key)) {
    return `select-${Number(event.key) - 1}`;
  }

  return event.key === "Enter" ? "submit" : null;
}

function createRadioOption(documentRoot, options) {
  const label = createElement(documentRoot, "label", {
    className: options.className ?? "quiz-choice",
  });
  const input = createElement(documentRoot, "input", {
    attributes: {
      id: options.id,
      name: options.name,
      value: options.value,
    },
  });
  input.type = "radio";
  input.checked = options.checked === true;
  input.disabled = options.disabled === true;
  label.append(
    input,
    createElement(documentRoot, "span", {
      className: "quiz-choice__label",
      text: options.label,
      attributes: options.lang ? { lang: options.lang } : {},
    }),
  );
  return { input, label };
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
    const { label } = createRadioOption(documentRoot, {
      id: `${options.name}-${index}`,
      name: options.name,
      value: item.value,
      label: item.label,
      checked: item.value === options.selected,
      lang: item.lang,
    });
    choices.append(label);
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
    summaryElement.textContent = "Aktuell ist kein geeignetes Quiz verfügbar.";
    const empty = createElement(documentRoot, "section", {
      className: "card shell-card empty-state",
      attributes: { "aria-labelledby": "quiz-empty-title" },
    });
    empty.append(
      createElement(documentRoot, "h2", {
        className: "card__title",
        text: "Noch keine Quizwörter",
        attributes: { id: "quiz-empty-title" },
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

  summaryElement.textContent = "Wähle Lernquelle, Fragerichtung und Umfang in Ruhe aus.";
  const rememberedValue = options.selectedScope?.value;
  const defaultSource = sourceOptions.find((source) => source.value === rememberedValue)
    ?? sourceOptions[0];
  const form = createElement(documentRoot, "form", {
    className: "card shell-card quiz-config",
    attributes: { "aria-labelledby": "quiz-config-title" },
    dataset: { quizConfig: "" },
  });
  form.append(
    createElement(documentRoot, "h2", {
      className: "card__title",
      text: "Quiz zusammenstellen",
      attributes: { id: "quiz-config-title" },
    }),
    ...createLearningScopeFieldsets(
      documentRoot,
      "quiz",
      sourceOptions,
      defaultSource.value,
      options.selectedScope?.packageIds,
    ),
    createRadioGroup(documentRoot, {
      legend: "Fragerichtung",
      name: "quiz-direction",
      selected: QUIZ_DIRECTIONS.MIXED,
      items: [
        { value: QUIZ_DIRECTIONS.SOURCE_TO_TARGET, label: DIRECTION_LABELS[QUIZ_DIRECTIONS.SOURCE_TO_TARGET] },
        { value: QUIZ_DIRECTIONS.TARGET_TO_SOURCE, label: DIRECTION_LABELS[QUIZ_DIRECTIONS.TARGET_TO_SOURCE] },
        { value: QUIZ_DIRECTIONS.MIXED, label: DIRECTION_LABELS[QUIZ_DIRECTIONS.MIXED] },
      ],
    }),
    createSessionAmountFieldset(
      documentRoot,
      "quiz",
      options.selectedScopeWordCount || defaultSource.words.length,
      "quiz",
      "Fragen",
    ),
  );

  const limitHint = createElement(documentRoot, "p", {
    className: "quiz-config__hint",
    text: getLimitHint(defaultSource.words.length),
    attributes: { "aria-live": "polite" },
    dataset: { quizLimitHint: "" },
  });
  limitHint.hidden = limitHint.textContent.length === 0;
  const startButton = createElement(documentRoot, "button", {
    className: "button button--primary",
    text: "Quiz starten",
    dataset: { quizAction: "start" },
  });
  startButton.type = "button";
  form.append(limitHint, startButton);
  container.append(form);
}

function appendAnswerStatus(documentRoot, label, text, className) {
  label.append(createElement(documentRoot, "span", {
    className: `quiz-answer-status ${className}`,
    text,
  }));
}

function renderExitDialog(documentRoot) {
  const dialog = createElement(documentRoot, "dialog", {
    className: "quiz-exit-dialog",
    attributes: {
      "aria-labelledby": "quiz-exit-title",
      "aria-describedby": "quiz-exit-description",
    },
    dataset: { quizExitDialog: "" },
  });
  const content = createElement(documentRoot, "div", { className: "quiz-exit-dialog__content" });
  content.append(
    createElement(documentRoot, "h2", {
      className: "card__title",
      text: "Quiz verlassen?",
      attributes: { id: "quiz-exit-title" },
    }),
    createElement(documentRoot, "p", {
      className: "card__description",
      text: "Bereits gespeicherte Antworten bleiben erhalten. Die laufende Quiz-Session wird verworfen.",
      attributes: { id: "quiz-exit-description" },
    }),
  );
  const actions = createElement(documentRoot, "div", { className: "quiz-exit-dialog__actions" });
  const cancel = createElement(documentRoot, "button", {
    className: "button button--secondary",
    text: "Quiz fortsetzen",
    dataset: { quizDialogAction: "cancel" },
  });
  cancel.type = "button";
  const confirm = createElement(documentRoot, "button", {
    className: "button button--text",
    text: "Quiz verlassen",
    dataset: { quizDialogAction: "confirm" },
  });
  confirm.type = "button";
  actions.append(cancel, confirm);
  content.append(actions);
  dialog.append(content);
  return dialog;
}

function renderFeedback(documentRoot, snapshot, options) {
  const { quiz, currentWord } = snapshot;
  const result = quiz.results[quiz.results.length - 1];
  const content = createAnswerFeedback({
    isCorrect: result.isCorrect,
    acceptedAnswers: quiz.currentQuestion.correctAnswers,
  });
  const feedback = createElement(documentRoot, "section", {
    className: result.isCorrect
      ? "quiz-feedback quiz-feedback--correct"
      : "quiz-feedback quiz-feedback--wrong",
    attributes: {
      "aria-labelledby": "quiz-feedback-title",
      tabindex: "-1",
    },
    dataset: { quizFocusFeedback: "" },
  });
  feedback.append(createElement(documentRoot, "h3", {
    className: "quiz-feedback__title",
    text: content.title,
    attributes: { id: "quiz-feedback-title" },
  }));
  if (content.solutionText) {
    feedback.append(createElement(documentRoot, "p", {
      className: "quiz-feedback__connection",
      text: content.solutionText,
    }));
  }

  if (currentWord?.hint) {
    const hint = createElement(documentRoot, "p", { className: "quiz-feedback__detail" });
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
      className: "quiz-feedback__example",
      text: currentWord.example,
      attributes: options.languageCodes?.source
        ? { lang: options.languageCodes.source }
        : {},
    }));
  }

  const answerPronunciations = createElement(documentRoot, "div", {
    className: "pronunciation-answer-list",
    attributes: { "aria-label": "Aussprache der richtigen Lösung" },
  });
  const answerRole = quiz.currentQuestion.direction === QUIZ_DIRECTIONS.SOURCE_TO_TARGET
    ? "target"
    : "source";
  (quiz.currentQuestion.correctAnswers ?? []).forEach((answer, index) => {
    const row = createElement(documentRoot, "div", { className: "pronunciation-term" });
    row.append(createElement(documentRoot, "span", {
      text: answer,
      attributes: options.languageCodes?.[answerRole]
        ? { lang: options.languageCodes[answerRole] }
        : {},
    }));
    const audioButton = options.pronunciation?.createButton(documentRoot, {
      id: `quiz-${currentWord.id}-answer-${index}`,
      text: answer,
      role: answerRole,
      compact: true,
    });
    if (audioButton) {
      row.append(audioButton);
      answerPronunciations.append(row);
    }
  });
  if (answerPronunciations.children.length > 0) feedback.append(answerPronunciations);

  const nextButton = createElement(documentRoot, "button", {
    className: "button button--primary",
    text: "Weiter",
    dataset: { quizAction: "next" },
  });
  nextButton.type = "button";
  feedback.append(nextButton);
  return feedback;
}

function renderQuestion(container, options) {
  const documentRoot = container.ownerDocument;
  const { snapshot, summaryElement, sourceOptions } = options;
  const { quiz, currentWord } = snapshot;
  const question = quiz.currentQuestion;
  const progress = getQuizProgress(quiz);
  const sourceLabel = options.activeScopeLabel
    ?? sourceOptions.find((source) => source.value === quiz.sourceType)?.label
    ?? SOURCE_LABELS[quiz.sourceType]
    ?? quiz.sourceType;

  container.replaceChildren();
  summaryElement.textContent = quiz.answerSubmitted
    ? "Sieh dir die Rückmeldung an und gehe dann bewusst weiter."
    : "Wähle genau eine Antwort und prüfe sie anschließend.";

  const status = createElement(documentRoot, "div", { className: "session-status quiz-status" });
  status.append(
    createElement(documentRoot, "p", {
      className: "session-status__text",
      text: `Quiz · ${progress.current} von ${progress.total}`,
      attributes: { "aria-live": "polite" },
    }),
    createElement(documentRoot, "progress", {
      className: "unit-progress session-progress",
      text: `${progress.current} von ${progress.total}`,
      attributes: {
        value: progress.current,
        max: progress.total,
        "aria-label": `Quizfortschritt: ${progress.current} von ${progress.total}`,
      },
    }),
  );
  const changeScope = createElement(documentRoot, "button", {
    className: "button button--text",
    text: "Lernbereich ändern",
    attributes: { type: "button" },
    dataset: { quizAction: "change-scope" },
  });
  status.append(changeScope);
  const requestedAmount = Number(quiz.requestedAmount);
  if (Number.isFinite(requestedAmount) && quiz.wordIds.length < requestedAmount) {
    status.append(createElement(documentRoot, "p", {
      className: "quiz-config__hint",
      text: `Es sind ${quiz.wordIds.length} geeignete ${quiz.wordIds.length === 1 ? "Frage" : "Fragen"} verfügbar; verwendet werden alle.`,
    }));
  }

  const card = createElement(documentRoot, "section", {
    className: "card quiz-card",
    attributes: { "aria-labelledby": "quiz-question-title" },
  });
  const questionContext = createElement(documentRoot, "p", {
      className: "section-kicker",
      text: `${sourceLabel} · ${question.type === "cloze" ? "Lückensatz" : DIRECTION_LABELS[question.direction]}`,
    });
  const questionRow = createElement(documentRoot, "div", { className: "pronunciation-term" });
  const promptRole = question.type === "cloze"
    ? "source"
    : question.direction === QUIZ_DIRECTIONS.SOURCE_TO_TARGET
    ? "source"
    : "target";
  questionRow.append(createElement(documentRoot, "h2", {
      className: "quiz-card__question content-title",
      text: question.prompt,
      attributes: {
        id: "quiz-question-title",
        tabindex: "-1",
        ...(options.languageCodes?.[promptRole]
          ? { lang: options.languageCodes[promptRole] }
          : {}),
      },
      dataset: { quizFocusQuestion: "" },
    }));
  const promptAudio = options.pronunciation?.createButton(documentRoot, {
    id: `quiz-${currentWord.id}-prompt`,
    text: question.prompt,
    role: promptRole,
  });
  if (promptAudio && question.type !== "cloze") questionRow.append(promptAudio);
  card.append(questionContext, questionRow);

  if (question.phonetic) {
    card.append(createElement(documentRoot, "p", {
      className: "flashcard__phonetic",
      text: question.phonetic,
      attributes: { "aria-label": `Lautschrift: ${question.phonetic}` },
    }));
  }

  const form = createElement(documentRoot, "form", { className: "quiz-answer-form" });
  const fieldset = createElement(documentRoot, "fieldset", {
    className: "quiz-answer-group",
    attributes: { "aria-describedby": "quiz-answer-error" },
  });
  fieldset.append(createElement(documentRoot, "legend", {
    className: "quiz-answer-group__legend",
    text: "Wähle die richtige Antwort",
  }));
  const answerOptions = createElement(documentRoot, "div", { className: "quiz-options" });
  const answerRole = question.direction === QUIZ_DIRECTIONS.SOURCE_TO_TARGET
    ? "target"
    : "source";

  question.options.forEach((answer, index) => {
    const isSelected = normalizeQuizAnswer(quiz.selectedAnswer) === normalizeQuizAnswer(answer);
    const isCorrect = normalizeQuizAnswer(question.correctOption) === normalizeQuizAnswer(answer);
    const stateClasses = ["quiz-option"];
    if (quiz.answerSubmitted && isCorrect) stateClasses.push("quiz-option--correct");
    if (quiz.answerSubmitted && isSelected && !isCorrect) stateClasses.push("quiz-option--wrong");

    const { input, label } = createRadioOption(documentRoot, {
      id: `quiz-answer-${index}`,
      name: "quiz-answer",
      value: answer,
      label: `${index + 1}. ${answer}`,
      checked: isSelected,
      disabled: quiz.answerSubmitted,
      className: stateClasses.join(" "),
      lang: options.languageCodes?.[answerRole],
    });
    input.dataset.quizAnswerIndex = String(index);

    if (quiz.answerSubmitted && isCorrect) {
      appendAnswerStatus(documentRoot, label, "Richtige Antwort", "quiz-answer-status--correct");
    } else if (quiz.answerSubmitted && isSelected) {
      appendAnswerStatus(documentRoot, label, "Ausgewählt", "quiz-answer-status--wrong");
    }

    answerOptions.append(label);
  });
  fieldset.append(answerOptions);
  form.append(fieldset);

  const selectionError = createElement(documentRoot, "p", {
    className: "quiz-answer-error",
    text: snapshot.error ?? "",
    attributes: { id: "quiz-answer-error", role: "alert", tabindex: "-1" },
    dataset: { quizFocusError: "" },
  });
  selectionError.hidden = !snapshot.error;
  form.append(selectionError);

  if (!quiz.answerSubmitted) {
    const submitButton = createElement(documentRoot, "button", {
      className: "button button--primary",
      text: "Antwort prüfen",
      dataset: { quizAction: "submit" },
    });
    submitButton.type = "button";
    form.append(submitButton);
  }

  card.append(form);

  if (quiz.answerSubmitted) {
    card.append(renderFeedback(documentRoot, snapshot, options));
  }

  container.append(status, card, renderExitDialog(documentRoot));
}

function renderCompletion(container, options) {
  const documentRoot = container.ownerDocument;
  const { snapshot, summaryElement } = options;
  const { summary, wrongWords } = snapshot;
  container.replaceChildren();
  summaryElement.textContent = "Alle Antworten wurden ausgewertet und lokal gespeichert.";

  const card = createElement(documentRoot, "section", {
    className: "card shell-card quiz-completion",
    attributes: { "aria-labelledby": "quiz-completion-title" },
  });
  card.append(
    createElement(documentRoot, "h2", {
      className: "card__title",
      text: "Quiz abgeschlossen",
      attributes: { id: "quiz-completion-title", tabindex: "-1" },
      dataset: { quizFocusCompletion: "" },
    }),
    createSummaryList(documentRoot, [
      { label: "Fragen", value: summary.questionCount, total: true },
      { label: "Richtig", value: summary.correctCount },
      { label: "Falsch", value: summary.wrongCount },
      { label: "Erfolgsquote", value: `${summary.successRate} %` },
    ]),
  );

  if (summary.wrongCount === 0) {
    card.append(createElement(documentRoot, "p", {
      className: "quiz-completion__message",
      text: "Alle Fragen wurden richtig beantwortet.",
    }));
  } else {
    const wrongSection = createElement(documentRoot, "section", {
      className: "quiz-wrong-answers",
      attributes: { "aria-labelledby": "quiz-wrong-title" },
    });
    wrongSection.append(createElement(documentRoot, "h3", {
      className: "quiz-wrong-answers__title",
      text: "Noch unsichere Wörter",
      attributes: { id: "quiz-wrong-title" },
    }));
    const list = createElement(documentRoot, "ul", { className: "quiz-wrong-list" });
    wrongWords.forEach((word) => {
      list.append(createElement(documentRoot, "li", {
        text: `${word.source} – ${word.targets.join(" / ")}`,
      }));
    });
    wrongSection.append(list);
    card.append(wrongSection);
  }

  const actions = createElement(documentRoot, "div", { className: "quiz-completion__actions" });
  const restart = createElement(documentRoot, "button", {
    className: "button button--secondary",
    text: "Quiz erneut starten",
    dataset: { quizAction: "restart" },
  });
  restart.type = "button";
  actions.append(restart);

  if (summary.wrongCount > 0) {
    const practice = createElement(documentRoot, "button", {
      className: "button button--primary",
      text: "Falsche Wörter üben",
      dataset: { quizAction: "practice-wrong" },
    });
    practice.type = "button";
    actions.append(practice);
  }

  actions.append(createDashboardLink(documentRoot, "Zum Dashboard", "text"));
  card.append(actions);
  container.append(card);
}

/** Renders configuration, active question/feedback, or completion. */
export function renderQuizView(options) {
  if (!options.snapshot?.quiz) {
    renderConfiguration(options.container, options);
  } else if (options.snapshot.quiz.completed) {
    renderCompletion(options.container, options);
  } else {
    renderQuestion(options.container, options);
  }
}

/** Updates the availability hint when source or requested amount changes. */
export function updateQuizLimitHint(container, availableCount, selectedAmount) {
  const hint = container.querySelector("[data-quiz-limit-hint]");
  if (!hint) {
    return;
  }

  hint.textContent = getLimitHint(availableCount, selectedAmount);
  hint.hidden = hint.textContent.length === 0;
}

/** Moves focus to the meaningful target after each quiz state transition. */
export function focusQuizTarget(container, targetName) {
  const selectors = {
    completion: "[data-quiz-focus-completion]",
    error: "[data-quiz-focus-error]",
    feedback: "[data-quiz-focus-feedback]",
    question: "[data-quiz-focus-question]",
    selected: "input[name='quiz-answer']:checked",
  };
  container.querySelector(selectors[targetName])?.focus();
}
