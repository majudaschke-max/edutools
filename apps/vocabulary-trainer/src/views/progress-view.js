import { getAvailableWords, getWordsByUnit } from "../core/vocabulary.js";
import { isMastered } from "../core/learning-state.js";
import {
  getDifficultWords,
  getDueWords,
  getMarkedWords,
} from "../core/scheduler.js";
import { createElement, createSummaryList } from "./view-elements.js";

function hasBeenPracticed(state) {
  return Boolean(state && (
    state.lastSeenAt
    || Number(state.correctCount) > 0
    || Number(state.wrongCount) > 0
  ));
}

function getUnitTitle(vocabularyData, unitId) {
  const contentTitle = vocabularyData.units.find((unit) => unit.id === unitId)?.title;
  const unitNumber = unitId?.match?.(/^unit-(\d+)$/)?.[1];
  return contentTitle ?? (unitNumber ? `Lernpaket ${unitNumber}` : unitId);
}

/** Derives academic progress exclusively from the existing Learning Core. */
export function calculateAcademicProgress({
  courseConfig,
  vocabularyData,
  learningState,
  now = new Date(),
}) {
  const availableWords = getAvailableWords(vocabularyData, courseConfig);
  const practicedWords = availableWords.filter((word) => (
    hasBeenPracticed(learningState.words[word.id])
  ));
  const masteredWords = availableWords.filter((word) => (
    isMastered(learningState.words[word.id])
  ));

  return {
    availableWordCount: availableWords.length,
    practicedWordCount: practicedWords.length,
    masteredWordCount: masteredWords.length,
    difficultWordCount: getDifficultWords(availableWords, learningState).length,
    dueWordCount: getDueWords(availableWords, learningState, now).length,
    markedWordCount: getMarkedWords(availableWords, learningState).length,
    units: courseConfig.availableUnits.map((unitId) => {
      const words = getWordsByUnit(vocabularyData, unitId);
      const practicedCount = words.filter((word) => (
        hasBeenPracticed(learningState.words[word.id])
      )).length;
      const masteredCount = words.filter((word) => (
        isMastered(learningState.words[word.id])
      )).length;
      return {
        id: unitId,
        title: getUnitTitle(vocabularyData, unitId),
        wordCount: words.length,
        practicedCount,
        masteredCount,
        percentage: words.length === 0
          ? 0
          : Math.round((masteredCount / words.length) * 100),
      };
    }),
  };
}

function createUnitProgress(documentRoot, unit) {
  const empty = unit.wordCount === 0;
  const item = createElement(documentRoot, "li", {
    className: empty ? "progress-unit progress-unit--empty" : "progress-unit",
  });
  const heading = createElement(documentRoot, "div", {
    className: "progress-unit__heading",
  });
  heading.append(createElement(documentRoot, "h3", { text: unit.title }));

  if (empty) {
    heading.append(createElement(documentRoot, "span", { text: "Keine aktiven Wörter" }));
    item.append(
      heading,
      createElement(documentRoot, "p", {
        className: "card__description",
        text: "Dieses Lernpaket enthält derzeit keine aktiven Wörter.",
      }),
    );
    return item;
  }

  heading.append(createElement(documentRoot, "span", { text: `${unit.percentage} %` }));
  const progress = createElement(documentRoot, "progress", {
    className: "unit-progress",
    attributes: {
      max: "100",
      value: String(unit.percentage),
      "aria-label": `${unit.title}: ${unit.percentage} Prozent sicher gelernt`,
    },
    text: `${unit.percentage} %`,
  });
  item.append(
    heading,
    progress,
    createElement(documentRoot, "p", {
      className: "card__description",
      text: `${unit.practicedCount} von ${unit.wordCount} Wörtern geübt, ${unit.masteredCount} sicher gelernt.`,
    }),
  );
  return item;
}

function createPreference(documentRoot, enabled) {
  const wrapper = createElement(documentRoot, "div", {
    className: "motivation-preference",
  });
  const label = createElement(documentRoot, "label", {
    className: "motivation-preference__label",
  });
  const input = createElement(documentRoot, "input", {
    attributes: { type: "checkbox" },
    dataset: { motivationEnabled: "" },
  });
  input.checked = enabled;
  label.append(
    input,
    createElement(documentRoot, "span", { text: "Motivationselemente anzeigen" }),
  );
  wrapper.append(
    label,
    createElement(documentRoot, "p", {
      className: "card__description",
      text: "Motivationselemente dienen ausschließlich der freiwilligen Lernunterstützung. Sie verändern weder den fachlichen Lernstand noch die Wiederholungsplanung.",
    }),
  );
  return wrapper;
}

function createMotivationSection(documentRoot, summary) {
  const section = createElement(documentRoot, "section", {
    className: "card progress-section",
    attributes: { "aria-labelledby": "motivation-progress-title" },
  });
  const heading = createElement(documentRoot, "div", {
    className: "progress-card__heading",
  });
  const headingText = createElement(documentRoot, "div");
  headingText.append(
    createElement(documentRoot, "p", {
      className: "section-kicker",
      text: "Freiwillige Lernunterstützung",
    }),
    createElement(documentRoot, "h2", {
      text: "Motivation",
      attributes: { id: "motivation-progress-title" },
    }),
  );
  heading.append(headingText);
  section.append(heading, createPreference(documentRoot, summary.enabled));

  if (summary.enabled) {
    const level = createElement(documentRoot, "div", {
      className: "motivation-level",
    });
    level.append(
      createElement(documentRoot, "p", {
        className: "motivation-level__value",
        text: `Level ${summary.level}`,
      }),
      createElement(documentRoot, "p", {
        className: "card__description",
        text: `${summary.totalXp} XP insgesamt · noch ${summary.remainingXp} XP bis Level ${summary.level + 1}`,
      }),
    );
    const progress = createElement(documentRoot, "progress", {
      className: "unit-progress",
      attributes: {
        max: String(summary.requiredInLevel),
        value: String(summary.earnedInLevel),
        "aria-label": `Level ${summary.level}: ${summary.earnedInLevel} von ${summary.requiredInLevel} XP`,
      },
      text: `${summary.percentage} %`,
    });
    const milestoneHeading = createElement(documentRoot, "h3", {
      className: "progress-subtitle",
      text: "Meilensteine",
    });
    const milestones = createElement(documentRoot, "ul", {
      className: "milestone-list",
    });
    if (summary.milestones.length === 0) {
      milestones.append(createElement(documentRoot, "li", {
        className: "milestone-list__empty",
        text: "Der erste Meilenstein entsteht nach einer abgeschlossenen Lerneinheit.",
      }));
    } else {
      summary.milestones.forEach((milestone) => {
        const item = createElement(documentRoot, "li", {
          className: "milestone-list__item",
        });
        item.append(
          createElement(documentRoot, "strong", { text: milestone.title }),
          createElement(documentRoot, "span", { text: milestone.description }),
        );
        milestones.append(item);
      });
    }

    section.append(
      level,
      progress,
      createSummaryList(documentRoot, [
        { label: "Aktuelle Lernserie", value: `${summary.currentStreak} ${summary.currentStreak === 1 ? "Tag" : "Tage"}` },
        { label: "Längste Lernserie", value: `${summary.longestStreak} ${summary.longestStreak === 1 ? "Tag" : "Tage"}` },
        { label: "Heute abgeschlossen", value: summary.todayCompleted ? "Ja" : "Nein" },
        { label: "Abgeschlossene Einheiten", value: summary.completedSessions },
        { label: "Verschiedene Wörter geübt", value: summary.practicedWordCount },
      ]),
      milestoneHeading,
      milestones,
    );
  } else {
    section.append(createElement(documentRoot, "p", {
      className: "motivation-disabled-note",
      text: "XP, Level und Lernserien sind ausgeschaltet. Dein fachlicher Lernfortschritt bleibt vollständig sichtbar und wird unverändert gespeichert.",
    }));
  }

  const reset = createElement(documentRoot, "button", {
    className: "button button--text motivation-reset",
    text: "Motivationsfortschritt zurücksetzen",
    attributes: { type: "button" },
    dataset: { motivationAction: "open-reset" },
  });
  section.append(reset);
  return section;
}

/** Renders the deliberately separated academic and optional motivation areas. */
export function renderProgressView(container, academic, motivation, options = {}) {
  const documentRoot = container.ownerDocument;
  const academicSection = createElement(documentRoot, "section", {
    className: "card progress-section",
    attributes: { "aria-labelledby": "academic-progress-title" },
  });
  academicSection.append(
    createElement(documentRoot, "p", {
      className: "section-kicker",
      text: "Aus deinem Lernstand",
    }),
    createElement(documentRoot, "h2", {
      text: "Fachlicher Lernfortschritt",
      attributes: { id: "academic-progress-title" },
    }),
    createSummaryList(documentRoot, [
      { label: "Verfügbare Wörter", value: academic.availableWordCount },
      { label: "Bereits geübt", value: academic.practicedWordCount },
      { label: "Sicher gelernt", value: academic.masteredWordCount },
      { label: "Schwierige Wörter", value: academic.difficultWordCount },
      { label: "Fällige Wiederholungen", value: academic.dueWordCount },
      { label: "Gemerkte Wörter", value: academic.markedWordCount },
    ]),
    createElement(documentRoot, "p", {
      className: "card__description",
      text: "Sicher gelernt: mindestens dreimal richtig, davon einmal aktiv geschrieben, an mindestens zwei Tagen und zuletzt zweimal hintereinander korrekt.",
    }),
    createElement(documentRoot, "h3", {
      className: "progress-subtitle",
      text: "Fortschritt nach Lernpaket",
    }),
  );
  const units = createElement(documentRoot, "ul", { className: "progress-unit-list" });
  academic.units.forEach((unit) => units.append(createUnitProgress(documentRoot, unit)));
  academicSection.append(units);

  const sections = [academicSection];
  if (options.showMotivation !== false && motivation) {
    sections.push(createMotivationSection(documentRoot, motivation));
  }
  container.replaceChildren(...sections);
}
