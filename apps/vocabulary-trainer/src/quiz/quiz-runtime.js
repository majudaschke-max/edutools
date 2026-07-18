import { getDifficultWords, getDueWords, getMarkedWords } from "../core/scheduler.js";
import { getAvailableWords } from "../core/vocabulary.js";
import {
  createLearningScopeOptions,
  formatLearningScope,
  isValidLearningScopeSelection,
  loadLearningScope,
  resolveLearningScopeWords,
  saveLearningScope,
} from "../core/learning-scope.js";
import { createQuizController } from "./quiz-controller.js?v=4.0.5";
import {
  focusQuizTarget,
  getQuizShortcut,
  renderQuizView,
  updateQuizLimitHint,
} from "../views/quiz-view.js";
import { notifyLearningSessionCompleted } from "../delivery/learning-session-events.js";
import {
  readLearningScopeSelection,
  syncLearningScopePackageControls,
  updateSessionAmountChoices,
} from "../views/learning-scope-view.js";

const QUIZ_ROUTE = "/quiz";
/** Connects the quiz controller, route view, keyboard and exit guard. */
export function createQuizRuntime(options) {
  const {
    appRoot,
    courseConfig,
    vocabularyData,
    learningState,
    motivation,
    onLearningStateChange,
    onNavigate,
    onPracticeWrong,
    pronunciation,
  } = options;
  const documentRoot = appRoot.ownerDocument;
  const availableWords = getAvailableWords(vocabularyData, courseConfig);
  const languageCodes = {
    source: courseConfig.languages?.source?.code,
    target: courseConfig.languages?.target?.code,
  };
  const controller = createQuizController({ learningState, words: availableWords });

  let currentRoute = null;
  let latestMetrics = null;
  let currentSourceOptions = [];
  let activeScopeLabel = null;
  let pendingRoute = null;
  let allowedRoute = null;

  function requireElement(selector) {
    const element = appRoot.querySelector(selector);
    if (!element) throw new Error(`Quiz-Ziel fehlt: ${selector}`);
    return element;
  }

  function getContainer() {
    return requireElement("[data-quiz-view-content]");
  }

  function getLiveRegion() {
    return appRoot.querySelector("[data-quiz-live]");
  }

  function announce(message) {
    const liveRegion = getLiveRegion();
    if (!liveRegion) return;
    liveRegion.textContent = "";
    Promise.resolve().then(() => {
      liveRegion.textContent = message;
    });
  }

  function buildSourceOptions() {
    const state = controller.getLearningState();
    return createLearningScopeOptions(vocabularyData, availableWords, [
      { value: "difficult", label: "Schwierige Wörter", words: getDifficultWords(availableWords, state) },
      { value: "marked", label: "Gemerkte Wörter", words: getMarkedWords(availableWords, state) },
      { value: "due", label: "Fällige Wiederholungen", words: getDueWords(availableWords, state, new Date()) },
    ]);
  }

  function renderQuizRoute() {
    pronunciation?.beforeViewRender();
    currentSourceOptions = buildSourceOptions();
    const selectedScope = loadLearningScope(courseConfig.courseId);
    renderQuizView({
      container: getContainer(),
      snapshot: controller.getSnapshot(),
      sourceOptions: currentSourceOptions,
      selectedScope,
      selectedScopeWordCount: selectedScope
        ? resolveLearningScopeWords(currentSourceOptions, selectedScope.value, selectedScope.packageIds).length
        : null,
      summaryElement: requireElement("[data-quiz-summary]"),
      pronunciation,
      languageCodes,
      activeScopeLabel,
    });
  }

  function renderRoute(route, metrics = latestMetrics) {
    if (route !== QUIZ_ROUTE) return;
    currentRoute = route;
    latestMetrics = metrics;
    renderQuizRoute();
  }

  function getSource(value) {
    return currentSourceOptions.find((source) => source.value === value) ?? null;
  }

  function getCheckedValue(form, name) {
    return form.querySelector(`input[name='${name}']:checked`)?.value ?? null;
  }

  function startQuizFromConfiguration() {
    const form = requireElement("[data-quiz-config]");
    const selection = readLearningScopeSelection(form, "quiz");
    const sourceType = selection.value;
    if (!isValidLearningScopeSelection(selection)) {
      announce("Wähle für mehrere Lernpakete mindestens zwei Pakete aus.");
      form.querySelector("input[name='quiz-package']:not(:disabled)")?.focus();
      return;
    }
    const direction = getCheckedValue(form, "quiz-direction");
    const amountValue = getCheckedValue(form, "quiz-amount");
    const words = resolveLearningScopeWords(currentSourceOptions, sourceType, selection.packageIds);
    activeScopeLabel = formatLearningScope(currentSourceOptions, sourceType, selection.packageIds);
    const limit = amountValue === "all" ? "all" : Number(amountValue);
    const result = controller.startQuiz({
      sessionId: motivation?.createSessionId(),
      sourceType,
      direction,
      words,
      limit,
    });
    saveLearningScope(courseConfig.courseId, selection);
    renderQuizRoute();

    if (!result.ok) {
      announce(result.error ?? "Das Quiz konnte nicht gestartet werden.");
      getContainer().querySelector("[data-session-focus-error]")?.focus();
      return;
    }

    const requestedCount = limit === "all" ? result.usedWordCount : limit;
    const countNotice = result.usedWordCount < requestedCount
      ? ` Es werden alle ${result.usedWordCount} verfügbaren Wörter verwendet.`
      : "";
    announce(`Quiz gestartet. Frage 1 von ${result.usedWordCount}.${countNotice}`);
    focusQuizTarget(getContainer(), "question");
  }

  function syncPersistedState() {
    const updatedMetrics = onLearningStateChange?.(controller.getLearningState());
    if (updatedMetrics) latestMetrics = updatedMetrics;
  }

  function reportError(result) {
    if (result.technicalError) {
      console.error("Quiz-Lernstand konnte nicht gespeichert werden.", result.technicalError);
    }
    renderQuizRoute();
    announce(result.error ?? "Die Quizaktion konnte nicht ausgeführt werden.");
    focusQuizTarget(getContainer(), "error");
  }

  function submitAnswer() {
    const result = controller.submitAnswer();
    if (!result.ok) {
      reportError(result);
      return;
    }

    syncPersistedState();
    motivation?.recordWordPractice({
      sessionId: result.quiz.sessionId,
      mode: "quiz",
      sequence: result.quiz.results.length,
      wordId: result.result.wordId,
      outcome: result.result.isCorrect ? "correct" : "wrong",
    });
    renderQuizRoute();
    announce(result.result.isCorrect
      ? "Richtig. Die Antwort wurde gespeichert."
      : "Noch nicht ganz. Die richtige Antwort wird angezeigt.");
    focusQuizTarget(getContainer(), "feedback");
  }

  function nextQuestion() {
    const result = controller.nextQuestion();
    if (!result.ok) {
      reportError(result);
      return;
    }

    renderQuizRoute();
    if (result.quiz.completed) {
      motivation?.recordSessionCompletion({
        sessionId: result.quiz.sessionId,
        mode: "quiz",
        status: "completed",
        practicedWordIds: result.quiz.results.map((entry) => entry.wordId),
        totalCount: result.quiz.results.length,
        correctCount: result.quiz.results.filter((entry) => entry.isCorrect).length,
      });
      notifyLearningSessionCompleted({ mode: "quiz", sessionId: result.quiz.sessionId });
      announce("Quiz abgeschlossen. Die Auswertung ist verfügbar.");
      focusQuizTarget(getContainer(), "completion");
    } else {
      announce(`Nächste Frage. ${result.quiz.currentIndex + 1} von ${result.quiz.wordIds.length}.`);
      focusQuizTarget(getContainer(), "question");
    }
  }

  function restartQuiz() {
    const result = controller.restartQuiz({ sessionId: motivation?.createSessionId() });
    renderQuizRoute();
    if (!result.ok) {
      reportError(result);
      return;
    }
    announce(`Quiz neu gestartet. Frage 1 von ${result.quiz.wordIds.length}.`);
    focusQuizTarget(getContainer(), "question");
  }

  function practiceWrongWords() {
    const wordIds = controller.getWrongWordIds();
    if (wordIds.length === 0) return;
    const result = onPracticeWrong?.(wordIds);
    if (!result?.ok) announce("Die unsicheren Wörter konnten nicht geöffnet werden.");
  }

  function announceSelection() {
    const selectedAnswer = controller.getSnapshot().quiz?.selectedAnswer;
    const liveRegion = getLiveRegion();
    if (selectedAnswer && liveRegion) {
      liveRegion.textContent = `Antwort ausgewählt: ${selectedAnswer}.`;
    }
  }

  function selectAnswerByShortcut(action) {
    let result;
    if (action === "select-next") result = controller.moveSelection(1);
    else if (action === "select-previous") result = controller.moveSelection(-1);
    else result = controller.selectAnswerByIndex(Number(action.replace("select-", "")));

    if (!result.ok) return;
    renderQuizRoute();
    announceSelection();
    focusQuizTarget(getContainer(), "selected");
  }

  function closeExitDialog() {
    const dialog = appRoot.querySelector("[data-quiz-exit-dialog]");
    if (dialog?.open && typeof dialog.close === "function") dialog.close();
    else dialog?.removeAttribute("open");
  }

  function openExitDialog(targetRoute = "/dashboard") {
    pendingRoute = targetRoute;
    const dialog = requireElement("[data-quiz-exit-dialog]");
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    dialog.querySelector("[data-quiz-dialog-action='cancel']")?.focus();
  }

  function cancelExit() {
    pendingRoute = null;
    closeExitDialog();
    focusQuizTarget(getContainer(), "question");
  }

  function confirmExit() {
    const targetRoute = pendingRoute ?? "/dashboard";
    pendingRoute = null;
    allowedRoute = targetRoute;
    closeExitDialog();
    onNavigate?.(targetRoute);
  }

  /** Restores the quiz route and asks before a running quiz is discarded. */
  function interceptRouteChange(nextRoute) {
    if (allowedRoute === nextRoute) {
      allowedRoute = null;
      return false;
    }

    const quiz = controller.getSnapshot().quiz;
    if (nextRoute === QUIZ_ROUTE || !quiz || quiz.completed) return false;

    pendingRoute = nextRoute;
    onNavigate?.(QUIZ_ROUTE, { replace: true });
    openExitDialog(nextRoute);
    return true;
  }

  function leaveRoute(nextRoute) {
    if (currentRoute === QUIZ_ROUTE && nextRoute !== QUIZ_ROUTE) {
      const liveRegion = getLiveRegion();
      if (liveRegion) liveRegion.textContent = "";
    }
    if (nextRoute !== QUIZ_ROUTE) {
      controller.discardQuiz();
      activeScopeLabel = null;
      currentRoute = null;
    }
  }

  function updateConfigurationHint(event) {
    const form = appRoot.querySelector("[data-quiz-config]");
    if (!form) return;
    const selection = syncLearningScopePackageControls(form, "quiz");
    const words = resolveLearningScopeWords(currentSourceOptions, selection.value, selection.packageIds);
    if (event?.target?.name !== "quiz-amount") {
      updateSessionAmountChoices(getContainer(), "quiz", words.length, "quiz", "Fragen");
    }
    const amountValue = getCheckedValue(form, "quiz-amount");
    updateQuizLimitHint(
      getContainer(),
      words.length,
      amountValue === "all" ? "all" : Number(amountValue),
    );
  }

  function handleChange(event) {
    if (event.target?.name === "quiz-answer") {
      const result = controller.selectAnswer(event.target.value);
      if (result.ok) {
        renderQuizRoute();
        announceSelection();
        focusQuizTarget(getContainer(), "selected");
      }
      return;
    }
    if (["quiz-source", "quiz-package", "quiz-amount"].includes(event.target?.name)) {
      updateConfigurationHint(event);
    }
  }

  function handleClick(event) {
    const control = event.target?.closest?.("[data-quiz-action], [data-quiz-dialog-action]");
    if (!control || !appRoot.contains(control) || control.disabled) return;

    const dialogAction = control.dataset.quizDialogAction;
    if (dialogAction) {
      event.preventDefault();
      if (dialogAction === "confirm") confirmExit();
      else cancelExit();
      return;
    }

    const action = control.dataset.quizAction;
    if (action === "start") startQuizFromConfiguration();
    else if (action === "change-scope") {
      controller.discardQuiz();
      activeScopeLabel = null;
      renderQuizRoute();
      announce("Wähle deinen Lernbereich neu aus.");
    }
    else if (action === "submit") submitAnswer();
    else if (action === "next") nextQuestion();
    else if (action === "restart") restartQuiz();
    else if (action === "practice-wrong") practiceWrongWords();
  }

  function handleKeydown(event) {
    const hasOpenDialog = Boolean(documentRoot.querySelector("dialog[open]"));
    const action = getQuizShortcut(event, controller.getSnapshot(), hasOpenDialog);
    if (!action) return;

    event.preventDefault();
    if (action.startsWith("select-")) selectAnswerByShortcut(action);
    else if (action === "submit") submitAnswer();
    else if (action === "next") nextQuestion();
    else if (action === "exit") openExitDialog();
  }

  function handleDialogCancel(event) {
    if (!event.target?.matches?.("[data-quiz-exit-dialog]")) return;
    event.preventDefault();
    cancelExit();
  }

  function destroy() {
    appRoot.removeEventListener("change", handleChange);
    appRoot.removeEventListener("click", handleClick);
    documentRoot.removeEventListener("keydown", handleKeydown);
    documentRoot.removeEventListener("cancel", handleDialogCancel, true);
  }

  appRoot.addEventListener("change", handleChange);
  appRoot.addEventListener("click", handleClick);
  documentRoot.addEventListener("keydown", handleKeydown);
  documentRoot.addEventListener("cancel", handleDialogCancel, true);

  return Object.freeze({
    destroy,
    getLearningState: controller.getLearningState,
    interceptRouteChange,
    leaveRoute,
    renderRoute,
    replaceLearningState: controller.replaceLearningState,
  });
}
