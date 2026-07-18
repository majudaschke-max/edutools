import { getCurrentUnitId } from "../core/course.js";
import {
  assertMatchingCourseIds,
  getAvailableWords,
  getWordsByUnit,
} from "../core/vocabulary.js";
import { isMastered } from "../core/learning-state.js";
import {
  buildDailyLearningSet,
  getDifficultWords,
  getMarkedWords,
} from "../core/scheduler.js";

const ESTIMATED_SECONDS_PER_WORD = 25;
const SECONDS_PER_MINUTE = 60;

/** Calculates every dashboard value from course data and learning history. */
export function calculateDashboardMetrics({
  courseConfig,
  vocabularyData,
  learningState,
  now = new Date(),
}) {
  assertMatchingCourseIds(courseConfig, vocabularyData);

  const currentUnitId = getCurrentUnitId(courseConfig);
  const currentUnit = vocabularyData.units.find((unit) => unit.id === currentUnitId);

  if (!currentUnit) {
    throw new Error("Die aktuelles Lernpaket ist nicht verfügbar.");
  }

  const availableWords = getAvailableWords(vocabularyData, courseConfig);
  const currentUnitWords = getWordsByUnit(vocabularyData, currentUnitId);
  const learningSet = buildDailyLearningSet({
    words: availableWords,
    currentUnitId,
    learningState,
    maxNewWords: courseConfig.dailyNewWordLimit,
    maxReviewWords: courseConfig.dailyReviewLimit,
    now,
  });
  const availableLearningSet = buildDailyLearningSet({
    words: availableWords,
    currentUnitId,
    learningState,
    maxNewWords: Number.POSITIVE_INFINITY,
    maxReviewWords: Number.POSITIVE_INFINITY,
    now,
  });
  const masteredWordCount = currentUnitWords.filter((word) =>
    isMastered(learningState.words[word.id]),
  ).length;
  const progress = currentUnitWords.length === 0
    ? 0
    : Math.round((masteredWordCount / currentUnitWords.length) * 100);
  const estimatedMinutes = Math.max(
    1,
    Math.ceil(
      (learningSet.allWords.length * ESTIMATED_SECONDS_PER_WORD)
      / SECONDS_PER_MINUTE,
    ),
  );

  return {
    courseTitle: courseConfig.title,
    currentUnitId,
    currentUnitTitle: currentUnit.title,
    newWordCount: learningSet.newWords.length,
    difficultWordCount: getDifficultWords(availableWords, learningState).length,
    markedWordCount: getMarkedWords(availableWords, learningState).length,
    todayWordCount: learningSet.allWords.length,
    availableWordCount: availableLearningSet.allWords.length,
    masteredWordCount,
    currentUnitWordCount: currentUnitWords.length,
    progress,
    estimatedMinutes,
    learningSet,
    availableLearningSet,
  };
}

function requireElement(root, selector) {
  const element = root.querySelector(selector);

  if (!element) {
    throw new Error(`Dashboard-Ziel fehlt: ${selector}`);
  }

  return element;
}

function setText(root, selector, value) {
  requireElement(root, selector).textContent = String(value);
}

/** Updates the existing Dashboard without changing its visual composition. */
export function renderDashboard(documentRoot, metrics, motivation = null) {
  setText(documentRoot, "[data-dashboard-course-title]", metrics.courseTitle);
  setText(documentRoot, "[data-dashboard-current-unit]", metrics.currentUnitTitle);
  setText(
    documentRoot,
    "[data-dashboard-unit-context]",
    `${metrics.courseTitle} · ${metrics.currentUnitTitle}`,
  );
  setText(
    documentRoot,
    "[data-dashboard-today-count]",
    metrics.availableWordCount === 1
      ? "1 Wort steht zum Lernen bereit."
      : `${metrics.availableWordCount} Wörter stehen zum Lernen bereit.`,
  );
  setText(documentRoot, "[data-dashboard-new-count]", metrics.newWordCount);
  setText(documentRoot, "[data-dashboard-difficult-count]", metrics.difficultWordCount);
  setText(documentRoot, "[data-dashboard-marked-count]", metrics.markedWordCount);
  setText(documentRoot, "[data-dashboard-progress]", `${metrics.progress}\u00a0%`);
  setText(
    documentRoot,
    "[data-dashboard-progress-description]",
    `Du hast bereits ${metrics.progress} % im aktuellen Lernpaket sicher gelernt.`,
  );
  setText(
    documentRoot,
    "[data-dashboard-estimated-time]",
    `ca. ${metrics.estimatedMinutes} ${metrics.estimatedMinutes === 1 ? "Minute" : "Minuten"}`,
  );

  const progressElement = requireElement(documentRoot, "[data-dashboard-progress-bar]");
  progressElement.value = metrics.progress;
  progressElement.textContent = `${metrics.progress} %`;
  progressElement.setAttribute("aria-label", `Fortschritt: ${metrics.progress} Prozent`);

  requireElement(documentRoot, "[data-dashboard-course-label]").setAttribute(
    "aria-label",
    `Aktueller Kurs: ${metrics.courseTitle}, ${metrics.currentUnitTitle}`,
  );

  const motivationCard = documentRoot.querySelector("[data-dashboard-motivation]");
  if (motivationCard) {
    const visible = Boolean(motivation?.enabled);
    motivationCard.hidden = !visible;
    if (visible) {
      motivationCard.querySelector("[data-dashboard-level]").textContent = `Level ${motivation.level}`;
      motivationCard.querySelector("[data-dashboard-level-xp]").textContent =
        `${motivation.earnedInLevel} von ${motivation.requiredInLevel} XP bis Level ${motivation.level + 1}`;
      motivationCard.querySelector("[data-dashboard-streak]").textContent = motivation.currentStreak === 1
        ? "🔥 1 Tag in Folge"
        : `🔥 ${motivation.currentStreak} Tage in Folge`;
      motivationCard.querySelector("[data-dashboard-longest-streak]").textContent = motivation.longestStreak === 1
        ? "Beste Serie: 1 Tag"
        : `Beste Serie: ${motivation.longestStreak} Tage`;
      const levelProgress = motivationCard.querySelector("[data-dashboard-level-progress]");
      levelProgress.max = motivation.requiredInLevel;
      levelProgress.value = motivation.earnedInLevel;
      levelProgress.textContent = `${motivation.percentage} %`;
      levelProgress.setAttribute(
        "aria-label",
        `Level ${motivation.level}: ${motivation.earnedInLevel} von ${motivation.requiredInLevel} XP`,
      );
    }
  }
}
