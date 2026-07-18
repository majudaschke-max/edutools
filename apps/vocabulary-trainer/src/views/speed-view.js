import { SPEED_DIRECTIONS } from "../speed/speed-generator.js";
import { createDashboardLink, createElement, createSummaryList, appendViewError } from "./view-elements.js";
import { createLearningScopeFieldsets } from "./learning-scope-view.js";

const SOURCE_LABELS = Object.freeze({
  "current-unit": "Aktuelles Lernpaket",
  all: "Alle Lernpakete",
  difficult: "Schwierige Wörter",
  marked: "Gemerkte Wörter",
  due: "Fällige Wiederholungen",
});

const DIRECTION_LABELS = Object.freeze({
  [SPEED_DIRECTIONS.SOURCE_TO_TARGET]: "Ausgangssprache links, Zielsprache rechts",
  [SPEED_DIRECTIONS.TARGET_TO_SOURCE]: "Zielsprache links, Ausgangssprache rechts",
  [SPEED_DIRECTIONS.MIXED]: "Gemischt pro Runde",
});
const MILLISECONDS_PER_SECOND = 1000;

function targetBlocksShortcut(target) {
  const tagName = target?.tagName?.toLowerCase?.() ?? "";
  return tagName === "input"
    || tagName === "select"
    || tagName === "textarea"
    || target?.isContentEditable === true
    || Boolean(target?.closest?.("[contenteditable='true']"));
}

/** Maps global keys while preserving native button activation. */
export function getSpeedShortcut(event, snapshot, hasOpenDialog = false) {
  const speed = snapshot?.speed;
  if (
    !speed
    || speed.completed
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
    return speed.selectedLeftId || speed.selectedRightId ? "clear-selection" : "exit";
  }
  if (event.key?.toLowerCase?.() === "p") return speed.paused ? "resume" : "pause";
  if (speed.paused) return null;

  const arrowActions = {
    ArrowUp: "focus-up",
    ArrowDown: "focus-down",
    ArrowLeft: "focus-left",
    ArrowRight: "focus-right",
  };
  return arrowActions[event.key] ?? null;
}

function createRadioOption(documentRoot, options) {
  const label = createElement(documentRoot, "label", {
    className: "quiz-choice",
    dataset: options.pairCount ? { speedPairOption: options.value } : {},
  });
  const input = createElement(documentRoot, "input", {
    attributes: { id: options.id, name: options.name, value: options.value },
  });
  input.type = "radio";
  input.checked = options.checked === true;
  input.disabled = options.disabled === true;
  label.hidden = options.hidden === true;
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
  const fieldset = createElement(documentRoot, "fieldset", { className: "quiz-config__group" });
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
      disabled: item.disabled,
      hidden: item.hidden,
      pairCount: options.name === "speed-pairs",
    }));
  });
  fieldset.append(choices);
  return fieldset;
}

function getPairCountHint(availableCount, requestedCount) {
  if (availableCount >= requestedCount) return "";
  return `Es sind ${availableCount} eindeutige Wörter verfügbar; die Rundengröße wird auf ${availableCount} Paare reduziert.`;
}

function renderConfiguration(container, options) {
  const documentRoot = container.ownerDocument;
  const { sourceOptions, snapshot, summaryElement } = options;
  container.replaceChildren();
  appendViewError(container, snapshot?.error);

  if (sourceOptions.length === 0) {
    summaryElement.textContent = "Aktuell ist keine Speed Challenge verfügbar.";
    const empty = createElement(documentRoot, "section", {
      className: "card shell-card empty-state",
      attributes: { "aria-labelledby": "speed-empty-title" },
    });
    empty.append(
      createElement(documentRoot, "h2", {
        className: "card__title",
        text: "Noch nicht genügend Wörter",
        attributes: { id: "speed-empty-title" },
      }),
      createElement(documentRoot, "p", {
        className: "card__description",
        text: "Für die Speed Challenge werden mindestens vier Wörter benötigt.",
      }),
      createDashboardLink(documentRoot),
    );
    container.append(empty);
    return;
  }

  summaryElement.textContent = "Wähle Lernquelle, Richtung, Dauer und Rundengröße.";
  const rememberedValue = options.selectedScope?.value;
  const defaultSource = sourceOptions.find((source) => source.value === rememberedValue)
    ?? sourceOptions[0];
  const defaultCount = Math.min(4, defaultSource.eligibleCount);
  const form = createElement(documentRoot, "form", {
    className: "card shell-card speed-config",
    attributes: { "aria-labelledby": "speed-config-title" },
    dataset: { speedConfig: "" },
  });
  form.append(
    createElement(documentRoot, "h2", {
      className: "card__title",
      text: "Speed Challenge zusammenstellen",
      attributes: { id: "speed-config-title" },
    }),
    ...createLearningScopeFieldsets(
      documentRoot,
      "speed",
      sourceOptions,
      defaultSource.value,
      options.selectedScope?.packageIds,
    ),
    createRadioGroup(documentRoot, {
      legend: "Richtung",
      name: "speed-direction",
      selected: SPEED_DIRECTIONS.SOURCE_TO_TARGET,
      items: [
        SPEED_DIRECTIONS.SOURCE_TO_TARGET,
        SPEED_DIRECTIONS.TARGET_TO_SOURCE,
        SPEED_DIRECTIONS.MIXED,
      ].map((value) => ({
        value,
        label: DIRECTION_LABELS[value],
      })),
    }),
    createRadioGroup(documentRoot, {
      legend: "Dauer",
      name: "speed-duration",
      selected: "60",
      items: [30, 60, 90].map((value) => ({ value: String(value), label: `${value} Sekunden` })),
    }),
    createRadioGroup(documentRoot, {
      legend: "Paare pro Runde",
      name: "speed-pairs",
      selected: String(defaultCount),
      items: [4, 6, 8].map((value) => ({
        value: String(value),
        label: `${value} Paare`,
        hidden: value > defaultSource.eligibleCount,
        disabled: value > defaultSource.eligibleCount,
      })),
    }),
  );
  const hint = createElement(documentRoot, "p", {
    className: "quiz-config__hint",
    attributes: { "aria-live": "polite" },
    dataset: { speedPairHint: "" },
  });
  hint.hidden = true;
  const start = createElement(documentRoot, "button", {
    className: "button button--primary",
    text: "Speed Challenge starten",
    dataset: { speedAction: "start" },
  });
  start.type = "button";
  form.append(hint, start);
  container.append(form);
}

function formatTime(remainingMs) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / MILLISECONDS_PER_SECOND));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function renderExitDialog(documentRoot) {
  const dialog = createElement(documentRoot, "dialog", {
    className: "quiz-exit-dialog",
    attributes: {
      "aria-labelledby": "speed-exit-title",
      "aria-describedby": "speed-exit-description",
    },
    dataset: { speedExitDialog: "" },
  });
  const content = createElement(documentRoot, "div", { className: "quiz-exit-dialog__content" });
  content.append(
    createElement(documentRoot, "h2", {
      className: "card__title",
      text: "Speed Challenge beenden?",
      attributes: { id: "speed-exit-title" },
    }),
    createElement(documentRoot, "p", {
      className: "card__description",
      text: "Bisherige korrekte Zuordnungen bleiben gespeichert. Anschließend siehst du deine Auswertung.",
      attributes: { id: "speed-exit-description" },
    }),
  );
  const actions = createElement(documentRoot, "div", { className: "quiz-exit-dialog__actions" });
  const cancel = createElement(documentRoot, "button", {
    className: "button button--secondary",
    text: "Weiter üben",
    dataset: { speedDialogAction: "cancel" },
  });
  cancel.type = "button";
  const confirm = createElement(documentRoot, "button", {
    className: "button button--text",
    text: "Challenge beenden",
    dataset: { speedDialogAction: "confirm" },
  });
  confirm.type = "button";
  actions.append(cancel, confirm);
  content.append(actions);
  dialog.append(content);
  return dialog;
}

function getOrderedPairs(speed, side) {
  const items = side === "left" ? speed.leftItems : speed.rightItems;
  const field = side === "left" ? "leftId" : "rightId";
  return items.map((item) => speed.activePairs.find((pair) => pair[field] === item.id)).filter(Boolean);
}

function renderPairColumn(documentRoot, speed, snapshot, side) {
  const section = createElement(documentRoot, "section", {
    className: "speed-column",
    attributes: { "aria-labelledby": `speed-${side}-title` },
  });
  section.append(createElement(documentRoot, "h3", {
    className: "speed-column__title",
    text: side === "left" ? "Linke Begriffe" : "Rechte Begriffe",
    attributes: { id: `speed-${side}-title` },
  }));
  const list = createElement(documentRoot, "div", {
    className: "speed-pair-list",
    attributes: { role: "group", "aria-label": side === "left" ? "Linke Begriffe" : "Rechte Begriffe" },
  });

  getOrderedPairs(speed, side).forEach((pair) => {
    const id = side === "left" ? pair.leftId : pair.rightId;
    const text = side === "left" ? pair.leftText : pair.rightText;
    const selected = id === (side === "left" ? speed.selectedLeftId : speed.selectedRightId);
    const button = createElement(documentRoot, "button", {
      className: `speed-pair${selected ? " speed-pair--selected" : ""}${pair.matched ? " speed-pair--matched" : ""}`,
      text: pair.matched ? `Zugeordnet: ${text}` : text,
      attributes: { "aria-pressed": String(selected) },
      dataset: {
        speedPairButton: "",
        speedSide: side,
        speedItemId: id,
        speedWordId: pair.wordId,
      },
    });
    button.type = "button";
    button.disabled = pair.matched || speed.paused || snapshot.transitioning;
    list.append(button);
  });
  section.append(list);
  return section;
}

function renderActiveChallenge(container, options) {
  const documentRoot = container.ownerDocument;
  const { snapshot, sourceOptions, summaryElement } = options;
  const { speed } = snapshot;
  const sourceLabel = options.activeScopeLabel
    ?? sourceOptions.find((source) => source.value === speed.sourceType)?.label
    ?? SOURCE_LABELS[speed.sourceType]
    ?? speed.sourceType;
  container.replaceChildren();
  summaryElement.textContent = speed.paused
    ? "Die Zeit steht. Setze die Challenge fort, wenn du bereit bist."
    : "Ordne jeweils einen linken und einen rechten Begriff einander zu.";
  appendViewError(container, snapshot.error);

  const status = createElement(documentRoot, "section", {
    className: "card speed-status",
    attributes: { "aria-label": "Challenge-Status" },
  });
  const timer = createElement(documentRoot, "p", {
    className: "speed-timer",
    text: formatTime(speed.timeRemainingMs),
    attributes: { "aria-hidden": "true" },
    dataset: { speedTimer: "" },
  });
  status.append(
    createElement(documentRoot, "p", { className: "section-kicker", text: "Verbleibende Zeit" }),
    timer,
    createElement(documentRoot, "p", {
      className: "visually-hidden",
      text: `Aktuell verbleiben ${Math.ceil(speed.timeRemainingMs / MILLISECONDS_PER_SECOND)} Sekunden. Eine Warnung folgt bei zehn Sekunden.`,
      dataset: { speedTimerScreenreader: "" },
    }),
    createSummaryList(documentRoot, [
      { label: "Runde", value: speed.currentRound },
      { label: "Richtige Paare", value: speed.correctMatches },
      { label: "Fehlversuche", value: speed.incorrectAttempts.length },
    ]),
  );

  const toolbar = createElement(documentRoot, "div", { className: "speed-toolbar" });
  const pause = createElement(documentRoot, "button", {
    className: "button button--secondary",
    text: speed.paused ? "Fortsetzen" : "Pause",
    dataset: { speedAction: speed.paused ? "resume" : "pause" },
  });
  pause.type = "button";
  pause.setAttribute("aria-pressed", String(speed.paused));
  if (speed.paused) pause.dataset.speedFocusPause = "";
  const end = createElement(documentRoot, "button", {
    className: "button button--text",
    text: "Challenge beenden",
    dataset: { speedAction: "end" },
  });
  end.type = "button";
  toolbar.append(pause, end);
  toolbar.append(createElement(documentRoot, "button", {
    className: "button button--text",
    text: "Lernbereich ändern",
    attributes: { type: "button" },
    dataset: { speedAction: "change-scope" },
  }));

  const board = createElement(documentRoot, "section", {
    className: `card speed-board${speed.paused ? " speed-board--paused" : ""}`,
    attributes: { "aria-labelledby": "speed-board-title" },
  });
  board.append(
    createElement(documentRoot, "p", {
      className: "section-kicker",
      text: `${sourceLabel} · ${DIRECTION_LABELS[speed.currentRoundDirection]}`,
    }),
    createElement(documentRoot, "h2", {
      className: "card__title",
      text: speed.paused ? "Pausiert" : `Runde ${speed.currentRound}`,
      attributes: { id: "speed-board-title" },
    }),
  );
  if (speed.paused) {
    board.append(createElement(documentRoot, "p", {
      className: "speed-paused-message",
      text: "Die Begriffe sind während der Pause nicht bedienbar.",
    }));
  }
  const columns = createElement(documentRoot, "div", { className: "speed-columns" });
  columns.append(
    renderPairColumn(documentRoot, speed, snapshot, "left"),
    renderPairColumn(documentRoot, speed, snapshot, "right"),
  );
  board.append(columns);

  if (snapshot.feedback) {
    board.append(createElement(documentRoot, "p", {
      className: snapshot.feedback.startsWith("Diese")
        ? "speed-feedback speed-feedback--wrong"
        : "speed-feedback",
      text: snapshot.feedback,
    }));
  }
  container.append(status, toolbar, board, renderExitDialog(documentRoot));
}

function renderCompletion(container, options) {
  const documentRoot = container.ownerDocument;
  const { snapshot, summaryElement } = options;
  const { summary, notableWords } = snapshot;
  container.replaceChildren();
  summaryElement.textContent = "Die Speed Challenge ist ausgewertet; korrekte Erstzuordnungen wurden lokal gespeichert.";
  const card = createElement(documentRoot, "section", {
    className: "card shell-card speed-completion",
    attributes: { "aria-labelledby": "speed-completion-title" },
  });
  card.append(
    createElement(documentRoot, "h2", {
      className: "card__title",
      text: "Speed Challenge beendet",
      attributes: { id: "speed-completion-title", tabindex: "-1" },
      dataset: { speedFocusCompletion: "" },
    }),
    createSummaryList(documentRoot, [
      { label: "Gewählte Dauer", value: `${summary.durationSeconds} Sekunden`, total: true },
      { label: "Abgeschlossene Runden", value: summary.completedRounds },
      { label: "Korrekte Zuordnungen", value: summary.correctMatches },
      { label: "Fehlversuche", value: summary.incorrectAttempts },
      { label: "Trefferquote", value: `${summary.hitRate} %` },
      { label: "Unterschiedliche erfolgreiche Wörter", value: summary.uniqueMatchedWords },
    ]),
  );

  if (notableWords.length === 0) {
    card.append(createElement(documentRoot, "p", {
      className: "quiz-completion__message",
      text: "Du hast keine Wörter mehrfach falsch zugeordnet.",
    }));
  } else {
    const section = createElement(documentRoot, "section", {
      className: "speed-notable",
      attributes: { "aria-labelledby": "speed-notable-title" },
    });
    section.append(createElement(documentRoot, "h3", {
      className: "speed-notable__title",
      text: "Auffällige Wörter",
      attributes: { id: "speed-notable-title" },
    }));
    const list = createElement(documentRoot, "ul", { className: "speed-notable-list" });
    notableWords.forEach((word) => {
      const item = createElement(documentRoot, "li", { className: "speed-notable-list__item" });
      item.append(
        createElement(documentRoot, "strong", { text: word.source }),
        createElement(documentRoot, "span", { text: word.targets.join(" / ") }),
      );
      list.append(item);
    });
    section.append(list);
    card.append(section);
  }

  const actions = createElement(documentRoot, "div", { className: "speed-completion__actions" });
  const restart = createElement(documentRoot, "button", {
    className: "button button--secondary",
    text: "Noch einmal starten",
    dataset: { speedAction: "restart" },
  });
  restart.type = "button";
  actions.append(restart);
  if (notableWords.length > 0) {
    const practice = createElement(documentRoot, "button", {
      className: "button button--primary",
      text: "Auffällige Wörter mit Karteikarten üben",
      dataset: { speedAction: "practice-notable" },
    });
    practice.type = "button";
    actions.append(practice);
  }
  actions.append(createDashboardLink(documentRoot, "Zum Dashboard", "text"));
  card.append(actions);
  container.append(card);
}

/** Renders configuration, active two-column challenge, or completion. */
export function renderSpeedView(options) {
  if (!options.snapshot?.speed) renderConfiguration(options.container, options);
  else if (options.snapshot.speed.completed) renderCompletion(options.container, options);
  else renderActiveChallenge(options.container, options);
}

/** Shows only meaningful round sizes after the learning source changes. */
export function updateSpeedPairOptions(container, availableCount) {
  const options = typeof container.querySelectorAll === "function"
    ? [...container.querySelectorAll("[data-speed-pair-option]")]
    : [];
  const previousSelection = Number(
    container.querySelector("input[name='speed-pairs']:checked")?.value ?? 4,
  );
  options.forEach((label) => {
    const count = Number(label.dataset.speedPairOption);
    const input = label.querySelector("input");
    label.hidden = count > availableCount;
    if (input) input.disabled = count > availableCount;
  });
  const checked = container.querySelector("input[name='speed-pairs']:checked");
  if (checked?.disabled) {
    const fallback = [...container.querySelectorAll("input[name='speed-pairs']:not(:disabled)")].at(-1);
    if (fallback) fallback.checked = true;
  }
  const hint = container.querySelector("[data-speed-pair-hint]");
  if (hint) {
    hint.textContent = getPairCountHint(availableCount, previousSelection);
    hint.hidden = hint.textContent.length === 0;
  }
}

/** Updates only the visual timer; screenreader announcements stay event-based. */
export function updateSpeedTimerDisplay(container, remainingMs) {
  const timer = container.querySelector("[data-speed-timer]");
  if (timer) timer.textContent = formatTime(remainingMs);
}

/** Moves focus within or between the two native-button columns. */
export function moveSpeedFocus(container, activeElement, action) {
  const buttons = [...container.querySelectorAll("[data-speed-pair-button]:not(:disabled)")];
  if (buttons.length === 0) return false;
  const current = buttons.includes(activeElement) ? activeElement : buttons[0];
  const side = current.dataset.speedSide;
  const sameSide = buttons.filter((button) => button.dataset.speedSide === side);
  const currentIndex = Math.max(0, sameSide.indexOf(current));
  let target = current;
  if (action === "focus-up" || action === "focus-down") {
    const step = action === "focus-up" ? -1 : 1;
    target = sameSide[(currentIndex + step + sameSide.length) % sameSide.length];
  } else {
    const targetSide = action === "focus-left" ? "left" : "right";
    const otherSide = buttons.filter((button) => button.dataset.speedSide === targetSide);
    target = otherSide[Math.min(currentIndex, otherSide.length - 1)] ?? current;
  }
  target.focus();
  return true;
}

export function focusSpeedTarget(container, targetName) {
  const selectors = {
    completion: "[data-speed-focus-completion]",
    error: "[data-session-focus-error]",
    firstPair: "[data-speed-pair-button]:not(:disabled)",
    pause: "[data-speed-focus-pause]",
  };
  container.querySelector(selectors[targetName])?.focus();
}
