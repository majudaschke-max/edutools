import { getAvailableWords } from "../core/vocabulary.js";
import { getMarkedWords } from "../core/scheduler.js";
import { selectSessionWords } from "../core/session-size.js?v=4.0.5";
import {
  createLearningScopeOptions,
  formatLearningScope,
  isValidLearningScopeSelection,
  loadLearningScope,
  resolveLearningScopeWords,
  saveLearningScope,
} from "../core/learning-scope.js";
import { createSessionController } from "./session-controller.js?v=4.0.5";
import { renderLearnView } from "../views/learn-view.js?v=4.0.5";
import { renderMarkedView } from "../views/marked-view.js?v=4.0.5";
import { renderReviewView } from "../views/review-view.js?v=4.0.5";
import {
  announceSession,
  focusSessionTarget,
  getSessionShortcut,
  updateFlashcardSizeFieldset,
  updateFlashcardSizeSummary,
} from "../views/session-view.js?v=4.0.5";
import {
  readLearningScopeSelection,
  syncLearningScopePackageControls,
} from "../views/learning-scope-view.js";
import { notifyLearningSessionCompleted } from "../delivery/learning-session-events.js";

const LEARNING_ROUTES = new Set(["/learn", "/review", "/marked"]);

/**
 * Connects the shared session controller and views to the three learning
 * routes. The app shell only needs to enter or leave a route.
 */
export function createSessionRuntime(options) {
  const {
    appRoot,
    courseConfig,
    vocabularyData,
    learningState,
    motivation,
    onLearningStateChange,
    pronunciation,
  } = options;
  const documentRoot = appRoot.ownerDocument;
  const availableWords = getAvailableWords(vocabularyData, courseConfig);
  const languageCodes = {
    source: courseConfig.languages?.source?.code,
    target: courseConfig.languages?.target?.code,
  };
  const controller = createSessionController({
    learningState,
    words: availableWords,
    random: options.random,
  });

  let activeSessionRoute = null;
  let currentLearningRoute = null;
  let latestMetrics = null;
  let pendingPracticeWords = null;
  let activeLearningScopeLabel = null;
  const learningScopeOptions = createLearningScopeOptions(vocabularyData, availableWords);

  function getUnitTitle(unitId) {
    const unit = vocabularyData.units.find((candidate) => candidate.id === unitId);
    const unitNumber = unitId?.match?.(/^unit-(\d+)$/)?.[1];
    return unit?.title ?? (unitNumber ? `Lernpaket ${unitNumber}` : String(unitId));
  }

  function requireElement(selector) {
    const element = appRoot.querySelector(selector);
    if (!element) {
      throw new Error(`App-Ziel fehlt: ${selector}`);
    }
    return element;
  }

  function getRouteContainer(route = activeSessionRoute ?? currentLearningRoute) {
    const selectors = {
      "/learn": "[data-learn-view-content]",
      "/review": "[data-review-view-content]",
      "/marked": "[data-marked-view-content]",
    };
    const selector = selectors[route];
    return selector ? requireElement(selector) : appRoot;
  }

  function getLiveRegion(route = activeSessionRoute ?? currentLearningRoute) {
    const selectors = {
      "/learn": "[data-learn-live]",
      "/review": "[data-review-live]",
      "/marked": "[data-marked-live]",
    };
    const selector = selectors[route];
    return selector ? appRoot.querySelector(selector) : null;
  }

  function renderLearnRoute() {
    pronunciation?.beforeViewRender();
    const selectedScope = loadLearningScope(courseConfig.courseId);
    renderLearnView({
      container: requireElement("[data-learn-view-content]"),
      getUnitTitle,
      metrics: latestMetrics,
      sessionSnapshot: controller.getSnapshot(),
      summaryElement: requireElement("[data-learn-summary]"),
      pronunciation,
      languageCodes,
      practiceWords: pendingPracticeWords,
      learningScopeOptions,
      selectedScope,
      selectedScopeWordCount: selectedScope
        ? resolveLearningScopeWords(learningScopeOptions, selectedScope.value, selectedScope.packageIds).length
        : availableWords.length,
      learningScopeLabel: activeLearningScopeLabel,
    });
  }

  function renderReviewRoute() {
    pronunciation?.beforeViewRender();
    renderReviewView({
      container: requireElement("[data-review-view-content]"),
      getUnitTitle,
      reviewWords: latestMetrics.learningSet.reviewWords,
      sessionSnapshot: controller.getSnapshot(),
      summaryElement: requireElement("[data-review-summary]"),
      pronunciation,
      languageCodes,
    });
  }

  function renderMarkedRoute() {
    pronunciation?.beforeViewRender();
    renderMarkedView({
      container: requireElement("[data-marked-view-content]"),
      getUnitTitle,
      markedWords: getMarkedWords(availableWords, controller.getLearningState()),
      sessionSnapshot: controller.getSnapshot(),
      summaryElement: requireElement("[data-marked-summary]"),
      pronunciation,
      languageCodes,
    });
  }

  function renderRoute(route, metrics = latestMetrics) {
    if (!LEARNING_ROUTES.has(route)) {
      return;
    }

    currentLearningRoute = route;
    latestMetrics = metrics;

    if (route === "/learn") {
      renderLearnRoute();
    } else if (route === "/review") {
      renderReviewRoute();
    } else {
      renderMarkedRoute();
    }
  }

  function leaveRoute(nextRoute) {
    if (currentLearningRoute === "/learn" && nextRoute !== "/learn" && !activeSessionRoute) {
      pendingPracticeWords = null;
    }
    if (currentLearningRoute && currentLearningRoute !== nextRoute) {
      const previousLiveRegion = getLiveRegion(currentLearningRoute);
      if (previousLiveRegion) {
        previousLiveRegion.textContent = "";
      }
    }

    if (activeSessionRoute && activeSessionRoute !== nextRoute) {
      controller.discardSession();
      activeSessionRoute = null;
      activeLearningScopeLabel = null;
    }

    if (!LEARNING_ROUTES.has(nextRoute)) {
      currentLearningRoute = null;
    }
  }

  function syncPersistedState() {
    const updatedMetrics = onLearningStateChange?.(controller.getLearningState());
    if (updatedMetrics) {
      latestMetrics = updatedMetrics;
    }
  }

  function reportError(result) {
    if (result.technicalError) {
      console.error("Lernstand konnte nicht gespeichert werden.", result.technicalError);
    }

    const snapshot = controller.getSnapshot();
    announceSession(
      getLiveRegion(),
      snapshot.error ?? "Die Aktion konnte nicht ausgeführt werden.",
    );
    focusSessionTarget(getRouteContainer(), "error");
  }

  function startLearningSession(action) {
    const configByAction = {
      "start-daily": {
        mode: "daily",
        route: "/learn",
        words: availableWords,
      },
      "start-review": {
        mode: "review",
        route: "/review",
        words: latestMetrics.learningSet.reviewWords,
      },
      "start-marked": {
        mode: "marked",
        route: "/marked",
        words: getMarkedWords(availableWords, controller.getLearningState()),
      },
      "start-practice": {
        mode: "retry",
        route: "/learn",
        words: pendingPracticeWords ?? [],
      },
    };
    const config = configByAction[action];

    if (!config) {
      return;
    }

    if (config.words.length === 0) {
      renderRoute(config.route);
      return;
    }

    activeSessionRoute = config.route;
    activeLearningScopeLabel = `${config.mode === "review" ? "Fällige Wiederholungen" : config.mode === "marked" ? "Gemerkte Wörter" : config.mode === "retry" ? "Unsichere Wörter" : "Alle Lernpakete"} · ${config.words.length} ${config.words.length === 1 ? "Wort" : "Wörter"}`;
    if (action === "start-daily") {
      const form = getRouteContainer(config.route).querySelector("[data-flashcard-config]");
      if (form) {
        const selection = readLearningScopeSelection(form, "flashcards");
        if (!isValidLearningScopeSelection(selection)) {
          activeSessionRoute = null;
          activeLearningScopeLabel = null;
          announceSession(getLiveRegion(config.route), "Wähle für mehrere Lernpakete mindestens zwei Pakete aus.");
          form.querySelector("input[name='flashcards-package']:not(:disabled)")?.focus();
          return;
        }
        config.words = resolveLearningScopeWords(learningScopeOptions, selection.value, selection.packageIds);
        activeLearningScopeLabel = formatLearningScope(
          learningScopeOptions,
          selection.value,
          selection.packageIds,
        );
        saveLearningScope(courseConfig.courseId, selection);
      }
    }
    const directionControl = getRouteContainer(config.route).querySelector(
      "[data-flashcard-direction]:checked",
    );
    const direction = directionControl?.value ?? directionControl?.dataset?.flashcardDirection;
    const amountControl = getRouteContainer(config.route).querySelector(
      "[data-flashcard-amount]:checked",
    );
    const selectedWords = selectSessionWords(
      config.words,
      amountControl?.value ?? amountControl?.dataset?.flashcardAmount ?? "all",
    );
    const result = controller.startSession({
      sessionId: motivation?.createSessionId(),
      sourceType: config.mode,
      direction,
      wordIds: selectedWords.map((word) => word.id),
    });
    if (result.ok) pendingPracticeWords = null;
    renderRoute(config.route);

    if (!result.ok) {
      reportError(result);
      return;
    }

    announceSession(
      getLiveRegion(),
      `Lerneinheit gestartet. Karte 1 von ${result.session.wordIds.length}.`,
    );
    focusSessionTarget(getRouteContainer(), "card");
  }

  function handleSessionAction(action) {
    if (!activeSessionRoute) {
      return;
    }

    if (action === "change-scope") {
      controller.discardSession();
      activeSessionRoute = null;
      activeLearningScopeLabel = null;
      pendingPracticeWords = null;
      renderLearnRoute();
      announceSession(getLiveRegion("/learn"), "Wähle deinen Lernbereich neu aus.");
      return;
    }

    if (action === "reveal") {
      const result = controller.showSolution();
      renderRoute(activeSessionRoute);

      if (result.ok) {
        announceSession(
          getLiveRegion(),
          "Lösung angezeigt. Wähle Noch nicht, Kann ich oder Markieren.",
        );
        focusSessionTarget(getRouteContainer(), "solution");
      } else {
        reportError(result);
      }
      return;
    }

    if (action === "retry") {
      const snapshot = controller.getSnapshot();
      const wordIds = [...new Set(snapshot.session?.results.wrong ?? [])];
      pendingPracticeWords = wordIds.flatMap((wordId) => {
        const word = availableWords.find((candidate) => candidate.id === wordId);
        return word ? [word] : [];
      });
      controller.discardSession();
      activeSessionRoute = null;
      currentLearningRoute = "/learn";
      renderLearnRoute();
      announceSession(
        getLiveRegion("/learn"),
        "Unsichere Wörter sind vorbereitet. Wähle vor dem Start die Lernrichtung.",
      );
      return;
    }

    let result;
    if (action === "correct") {
      result = controller.answerCorrect();
    } else if (action === "wrong") {
      result = controller.answerWrong();
    } else if (action === "mark") {
      result = controller.toggleCurrentMarked();
    } else {
      return;
    }

    if (!result.ok) {
      renderRoute(activeSessionRoute);
      reportError(result);
      return;
    }

    syncPersistedState();
    if (action === "correct" || action === "wrong") {
      motivation?.recordWordPractice({
        sessionId: result.session.sessionId,
        mode: "flashcards",
        sequence: result.session.currentIndex,
        wordId: result.wordId,
        outcome: action,
      });
      if (result.session.completed) {
        const practicedWordIds = [...new Set([
          ...result.session.results.correct,
          ...result.session.results.wrong,
        ])];
        motivation?.recordSessionCompletion({
          sessionId: result.session.sessionId,
          mode: "flashcards",
          status: "completed",
          practicedWordIds,
          totalCount: result.session.results.correct.length
            + result.session.results.wrong.length,
          correctCount: result.session.results.correct.length,
        });
        notifyLearningSessionCompleted({
          mode: "flashcards",
          sessionId: result.session.sessionId,
        });
      }
    }
    renderRoute(activeSessionRoute);
    const snapshot = controller.getSnapshot();

    if (action === "mark") {
      announceSession(
        getLiveRegion(),
        result.marked ? "Wort als gemerkt markiert." : "Markierung entfernt.",
      );
      focusSessionTarget(getRouteContainer(), "mark");
      return;
    }

    const completed = snapshot.session.completed;
    const ratingText = action === "correct"
      ? "Als Kann ich bewertet."
      : "Als Noch nicht bewertet.";
    announceSession(
      getLiveRegion(),
      completed ? `${ratingText} Lerneinheit abgeschlossen.` : `${ratingText} Nächste Karte.`,
    );
    focusSessionTarget(
      getRouteContainer(),
      completed ? "completion" : "card",
    );
  }

  function handleMarkedRemoval(wordId) {
    const result = controller.toggleMarkedById(wordId);

    if (!result.ok) {
      renderMarkedRoute();
      reportError(result);
      return;
    }

    syncPersistedState();
    renderMarkedRoute();
    announceSession(getLiveRegion("/marked"), "Markierung entfernt.");
    appRoot.focus();
  }

  function handleClick(event) {
    const control = event.target?.closest?.(
      "[data-view-action], [data-session-action], [data-marked-remove]",
    );

    if (!control || !appRoot.contains(control) || control.disabled) {
      return;
    }

    if (control.dataset.markedRemove) {
      handleMarkedRemoval(control.dataset.markedRemove);
    } else if (control.dataset.viewAction) {
      startLearningSession(control.dataset.viewAction);
    } else if (control.dataset.sessionAction) {
      handleSessionAction(control.dataset.sessionAction);
    }
  }

  function handleChange(event) {
    const control = event.target?.closest?.("[data-flashcard-amount], input[name='flashcards-source'], input[name='flashcards-package']");
    if (!control || !appRoot.contains(control)) return;
    const routeContainer = getRouteContainer();
    if (["flashcards-source", "flashcards-package"].includes(control.name)) {
      const form = routeContainer.querySelector("[data-flashcard-config]");
      if (!form) return;
      const selection = syncLearningScopePackageControls(form, "flashcards");
      const words = resolveLearningScopeWords(learningScopeOptions, selection.value, selection.packageIds);
      saveLearningScope(courseConfig.courseId, selection);
      const scopeSummary = routeContainer.querySelector("[data-learning-scope-summary]");
      if (scopeSummary) {
        scopeSummary.textContent = formatLearningScope(
          learningScopeOptions,
          selection.value,
          selection.packageIds,
        );
      }
      requireElement("[data-learn-summary]").textContent = words.length === 1
        ? "1 Wort steht zum Lernen bereit."
        : `${words.length} Wörter stehen zum Lernen bereit.`;
      updateFlashcardSizeFieldset(routeContainer, "learn-flashcards", words.length);
      return;
    }
    const summary = routeContainer.querySelector("[data-flashcard-amount-summary]");
    const availableCount = Number(summary?.dataset?.flashcardAmountSummary ?? 0);
    updateFlashcardSizeSummary(routeContainer, availableCount, control.value);
  }

  function handleKeydown(event) {
    if (!activeSessionRoute) {
      return;
    }

    const hasOpenDialog = Boolean(documentRoot.querySelector(
      "dialog[open], [role='dialog'][aria-modal='true']",
    ));
    const action = getSessionShortcut(
      event,
      controller.getSnapshot(),
      hasOpenDialog,
    );

    if (action) {
      event.preventDefault();
      handleSessionAction(action);
    }
  }

  function discardSession() {
    controller.discardSession();
    activeSessionRoute = null;
    activeLearningScopeLabel = null;
    pendingPracticeWords = null;
  }

  /** Starts the existing Flashcard flow with an externally supplied word set. */
  function startPracticeSession(wordIds, route = "/learn") {
    if (!LEARNING_ROUTES.has(route)) {
      return { ok: false, reason: "invalid-route" };
    }

    if (!Array.isArray(wordIds)) {
      return { ok: false, reason: "invalid-word-ids" };
    }

    const requestedIds = [...new Set(wordIds)];
    const wordMap = new Map(availableWords.map((word) => [word.id, word]));
    const words = requestedIds.map((wordId) => wordMap.get(wordId));
    if (words.length === 0 || words.some((word) => !word)) {
      return { ok: false, reason: words.length === 0 ? "empty" : "missing-word" };
    }
    controller.discardSession();
    pendingPracticeWords = words;
    activeSessionRoute = null;
    activeLearningScopeLabel = null;
    currentLearningRoute = route;
    return { ok: true, pending: true, wordIds: requestedIds };
  }

  function destroy() {
    appRoot.removeEventListener("click", handleClick);
    appRoot.removeEventListener("change", handleChange);
    documentRoot.removeEventListener("keydown", handleKeydown);
  }

  appRoot.addEventListener("click", handleClick);
  appRoot.addEventListener("change", handleChange);
  documentRoot.addEventListener("keydown", handleKeydown);

  return Object.freeze({
    destroy,
    discardSession,
    getLearningState: controller.getLearningState,
    leaveRoute,
    renderRoute,
    replaceLearningState: controller.replaceLearningState,
    startPracticeSession,
  });
}
