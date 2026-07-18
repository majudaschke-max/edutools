import {
  createFlashcardDirectionFieldset,
  createFlashcardSizeFieldset,
  renderSessionView,
} from "./session-view.js?v=4.0.3";
import {
  appendViewError,
  createDashboardLink,
  createElement,
} from "./view-elements.js";

/** Renders marked words, their empty state or the shared marked session. */
export function renderMarkedView(options) {
  const {
    container,
    markedWords,
    sessionSnapshot,
    getUnitTitle,
    summaryElement,
  } = options;

  if (sessionSnapshot?.session) {
    summaryElement.textContent = sessionSnapshot.session.sourceType === "retry"
      ? "Übe deine unsicheren Wörter noch einmal."
      : "Übe deine persönliche Auswahl Karte für Karte.";
    renderSessionView(container, sessionSnapshot, {
      getUnitTitle,
      idPrefix: "marked-session",
      modeLabel: sessionSnapshot.session.sourceType === "retry"
        ? "Unsichere Wörter"
        : "Gemerkte Wörter",
      pronunciation: options.pronunciation,
      languageCodes: options.languageCodes,
    });
    return;
  }

  const documentRoot = container.ownerDocument;
  container.replaceChildren();
  appendViewError(container, sessionSnapshot?.error);

  if (markedWords.length === 0) {
    summaryElement.textContent = "Noch keine Wörter gemerkt.";
    const emptyCard = createElement(documentRoot, "section", {
      className: "card shell-card empty-state",
      attributes: { "aria-labelledby": "marked-empty-title" },
    });
    emptyCard.append(
      createElement(documentRoot, "h2", {
        className: "card__title",
        text: "Noch keine Markierungen",
        attributes: { id: "marked-empty-title" },
      }),
      createElement(documentRoot, "p", {
        className: "card__description",
        text: "Du hast noch keine Wörter gemerkt.",
      }),
      createDashboardLink(documentRoot),
    );
    container.append(emptyCard);
    return;
  }

  summaryElement.textContent = markedWords.length === 1
    ? "1 Wort ist aktuell gemerkt."
    : `${markedWords.length} Wörter sind aktuell gemerkt.`;
  const card = createElement(documentRoot, "section", {
    className: "card shell-card marked-words",
    attributes: { "aria-labelledby": "marked-list-title" },
  });
  card.append(createElement(documentRoot, "h2", {
    className: "card__title",
    text: "Deine Markierungen",
    attributes: { id: "marked-list-title" },
  }));

  const list = createElement(documentRoot, "ul", { className: "marked-list" });
  markedWords.forEach((word) => {
    const item = createElement(documentRoot, "li", { className: "marked-list__item" });
    const content = createElement(documentRoot, "div", { className: "marked-list__content" });
    const source = createElement(documentRoot, "p", {
      className: "marked-list__source pronunciation-term",
      attributes: options.languageCodes?.source
        ? { lang: options.languageCodes.source }
        : {},
    });
    source.append(documentRoot.createTextNode(word.source));
    const sourceAudio = options.pronunciation?.createButton(documentRoot, {
      id: `marked-${word.id}-source`,
      text: word.source,
      role: "source",
      compact: true,
    });
    if (sourceAudio) source.append(sourceAudio);

    const targets = createElement(documentRoot, "p", {
      className: "marked-list__targets pronunciation-list",
    });
    word.targets.forEach((target, index) => {
      if (index > 0) targets.append(documentRoot.createTextNode(", "));
      const targetGroup = createElement(documentRoot, "span", {
        className: "pronunciation-term pronunciation-term--inline",
        attributes: options.languageCodes?.target
          ? { lang: options.languageCodes.target }
          : {},
      });
      targetGroup.append(documentRoot.createTextNode(target));
      const targetAudio = options.pronunciation?.createButton(documentRoot, {
        id: `marked-${word.id}-target-${index}`,
        text: target,
        role: "target",
        compact: true,
      });
      if (targetAudio) targetGroup.append(targetAudio);
      targets.append(targetGroup);
    });

    content.append(
      source,
      targets,
      createElement(documentRoot, "p", {
        className: "marked-list__unit",
        text: getUnitTitle(word.unitId),
      }),
    );
    const removeButton = createElement(documentRoot, "button", {
      className: "button button--text",
      text: "Markierung entfernen",
      dataset: { markedRemove: word.id },
      attributes: { "aria-label": `Markierung für ${word.source} entfernen` },
    });
    removeButton.type = "button";
    item.append(content, removeButton);
    list.append(item);
  });

  const practiceButton = createElement(documentRoot, "button", {
    className: "button button--primary",
    text: "Lernen starten",
    dataset: { viewAction: "start-marked" },
  });
  practiceButton.type = "button";
  card.append(
    createFlashcardDirectionFieldset(documentRoot, "marked-flashcards"),
    createFlashcardSizeFieldset(documentRoot, "marked-flashcards", markedWords.length),
    list,
    practiceButton,
  );
  container.append(card);
}
