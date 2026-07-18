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
import {
  focusWritingTarget,
  getWritingShortcut,
  renderWritingView,
  updateWritingLimitHint,
} from "../views/writing-view.js";
import { createWritingController } from "./writing-controller.js?v=4.0.3";
import { notifyLearningSessionCompleted } from "../delivery/learning-session-events.js";
import {
  readLearningScopeSelection,
  syncLearningScopePackageControls,
  updateSessionAmountChoices,
} from "../views/learning-scope-view.js";

const WRITING_ROUTE = "/write";
/** Connects writing state, Core persistence, route view, form and exit guard. */
export function createWritingRuntime(options) {
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
  const controller = createWritingController({ learningState, words: availableWords });

  let currentRoute = null;
  let latestMetrics = null;
  let currentSourceOptions = [];
  let activeScopeLabel = null;
  let pendingRoute = null;
  let allowedRoute = null;

  function requireElement(selector) {
    const element = appRoot.querySelector(selector);
    if (!element) throw new Error(`Schreibtraining-Ziel fehlt: ${selector}`);
    return element;
  }

  function getContainer() {
    return requireElement("[data-writing-view-content]");
  }

  function getLiveRegion() {
    return appRoot.querySelector("[data-writing-live]");
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

  function renderWritingRoute() {
    pronunciation?.beforeViewRender();
    currentSourceOptions = buildSourceOptions();
    const selectedScope = loadLearningScope(courseConfig.courseId);
    renderWritingView({
      container: getContainer(),
      snapshot: controller.getSnapshot(),
      sourceOptions: currentSourceOptions,
      selectedScope,
      selectedScopeWordCount: selectedScope
        ? resolveLearningScopeWords(currentSourceOptions, selectedScope.value, selectedScope.packageIds).length
        : null,
      summaryElement: requireElement("[data-writing-summary]"),
      pronunciation,
      languageCodes,
      activeScopeLabel,
    });
  }

  function renderRoute(route, metrics = latestMetrics) {
    if (route !== WRITING_ROUTE) return;
    currentRoute = route;
    latestMetrics = metrics;
    renderWritingRoute();
  }

  function getSource(value) {
    return currentSourceOptions.find((source) => source.value === value) ?? null;
  }

  function getCheckedValue(form, name) {
    return form.querySelector(`input[name='${name}']:checked`)?.value ?? null;
  }

  function startFromConfiguration() {
    const form = requireElement("[data-writing-config]");
    const selection = readLearningScopeSelection(form, "writing");
    const sourceType = selection.value;
    if (!isValidLearningScopeSelection(selection)) {
      announce("Wähle für mehrere Lernpakete mindestens zwei Pakete aus.");
      form.querySelector("input[name='writing-package']:not(:disabled)")?.focus();
      return;
    }
    const direction = getCheckedValue(form, "writing-direction");
    const amountValue = getCheckedValue(form, "writing-amount");
    const words = resolveLearningScopeWords(currentSourceOptions, sourceType, selection.packageIds);
    activeScopeLabel = formatLearningScope(currentSourceOptions, sourceType, selection.packageIds);
    const limit = amountValue === "all" ? "all" : Number(amountValue);
    const result = controller.startWriting({
      sessionId: motivation?.createSessionId(),
      sourceType,
      direction,
      words,
      limit,
    });
    saveLearningScope(courseConfig.courseId, selection);
    renderWritingRoute();

    if (!result.ok) {
      announce(result.error ?? "Das Schreibtraining konnte nicht gestartet werden.");
      focusWritingTarget(getContainer(), "error");
      return;
    }

    const requestedCount = limit === "all" ? result.usedWordCount : limit;
    const countNotice = result.usedWordCount < requestedCount
      ? ` Es werden alle ${result.usedWordCount} verfügbaren Wörter verwendet.`
      : "";
    announce(`Schreibtraining gestartet. Aufgabe 1 von ${result.usedWordCount}.${countNotice}`);
    focusWritingTarget(getContainer(), "input");
  }

  function syncPersistedState() {
    const updatedMetrics = onLearningStateChange?.(controller.getLearningState());
    if (updatedMetrics) latestMetrics = updatedMetrics;
  }

  function reportError(result) {
    if (result.technicalError) {
      console.error("Schreibtraining-Lernstand konnte nicht gespeichert werden.", result.technicalError);
    }
    renderWritingRoute();
    announce(result.error ?? "Die Schreibaktion konnte nicht ausgeführt werden.");
    focusWritingTarget(
      getContainer(),
      result.reason === "empty-answer" ? "input" : "error",
    );
  }

  function submitAnswer() {
    const result = controller.submitAnswer();
    if (!result.ok) {
      reportError(result);
      return;
    }
    syncPersistedState();
    motivation?.recordWordPractice({
      sessionId: result.writing.sessionId,
      mode: "write",
      sequence: result.writing.results.length,
      wordId: result.result.wordId,
      outcome: result.result.isCorrect ? "correct" : "wrong",
    });
    renderWritingRoute();
    announce(result.result.isCorrect
      ? "Richtig. Die Antwort wurde gespeichert."
      : "Noch nicht ganz. Die richtige Schreibweise wird angezeigt.");
    focusWritingTarget(getContainer(), "feedback");
  }

  function nextPrompt() {
    const result = controller.nextPrompt();
    if (!result.ok) {
      reportError(result);
      return;
    }
    renderWritingRoute();
    if (result.writing.completed) {
      motivation?.recordSessionCompletion({
        sessionId: result.writing.sessionId,
        mode: "write",
        status: "completed",
        practicedWordIds: result.writing.results.map((entry) => entry.wordId),
        totalCount: result.writing.results.length,
        correctCount: result.writing.results.filter((entry) => entry.isCorrect).length,
      });
      notifyLearningSessionCompleted({ mode: "write", sessionId: result.writing.sessionId });
      announce("Schreibtraining abgeschlossen. Die Auswertung ist verfügbar.");
      focusWritingTarget(getContainer(), "completion");
    } else {
      announce(`Nächste Aufgabe. ${result.writing.currentIndex + 1} von ${result.writing.wordIds.length}.`);
      focusWritingTarget(getContainer(), "input");
    }
  }

  function showHint() {
    const result = controller.showHint();
    if (!result.ok) return;
    renderWritingRoute();
    announce("Hinweis angezeigt.");
    focusWritingTarget(getContainer(), "input");
  }

  function restartWriting() {
    const result = controller.restartWriting({ sessionId: motivation?.createSessionId() });
    renderWritingRoute();
    if (!result.ok) {
      reportError(result);
      return;
    }
    announce(`Schreibtraining neu gestartet. Aufgabe 1 von ${result.writing.wordIds.length}.`);
    focusWritingTarget(getContainer(), "input");
  }

  function practiceWrongWords() {
    const wordIds = controller.getWrongWordIds();
    if (wordIds.length === 0) return;
    const result = onPracticeWrong?.(wordIds);
    if (!result?.ok) announce("Die unsicheren Wörter konnten nicht geöffnet werden.");
  }

  function closeExitDialog() {
    const dialog = appRoot.querySelector("[data-writing-exit-dialog]");
    if (dialog?.open && typeof dialog.close === "function") dialog.close();
    else dialog?.removeAttribute("open");
  }

  function openExitDialog(targetRoute = "/dashboard") {
    pendingRoute = targetRoute;
    const dialog = requireElement("[data-writing-exit-dialog]");
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    dialog.querySelector("[data-writing-dialog-action='cancel']")?.focus();
  }

  function cancelExit() {
    pendingRoute = null;
    closeExitDialog();
    focusWritingTarget(
      getContainer(),
      controller.getSnapshot().writing?.answerSubmitted ? "feedback" : "input",
    );
  }

  function confirmExit() {
    const targetRoute = pendingRoute ?? "/dashboard";
    pendingRoute = null;
    allowedRoute = targetRoute;
    closeExitDialog();
    onNavigate?.(targetRoute);
  }

  /** Restores the writing route and asks before a running session is lost. */
  function interceptRouteChange(nextRoute) {
    if (allowedRoute === nextRoute) {
      allowedRoute = null;
      return false;
    }
    const writing = controller.getSnapshot().writing;
    if (nextRoute === WRITING_ROUTE || !writing || writing.completed) return false;

    pendingRoute = nextRoute;
    onNavigate?.(WRITING_ROUTE, { replace: true });
    openExitDialog(nextRoute);
    return true;
  }

  function leaveRoute(nextRoute) {
    if (currentRoute === WRITING_ROUTE && nextRoute !== WRITING_ROUTE) {
      const liveRegion = getLiveRegion();
      if (liveRegion) liveRegion.textContent = "";
    }
    if (nextRoute !== WRITING_ROUTE) {
      controller.discardWriting();
      activeScopeLabel = null;
      currentRoute = null;
    }
  }

  function updateConfigurationHint(event) {
    const form = appRoot.querySelector("[data-writing-config]");
    if (!form) return;
    const selection = syncLearningScopePackageControls(form, "writing");
    const words = resolveLearningScopeWords(currentSourceOptions, selection.value, selection.packageIds);
    if (event?.target?.name !== "writing-amount") {
      updateSessionAmountChoices(getContainer(), "writing", words.length, "write", "Wörter");
    }
    const amountValue = getCheckedValue(form, "writing-amount");
    updateWritingLimitHint(
      getContainer(),
      words.length,
      amountValue === "all" ? "all" : Number(amountValue),
    );
  }

  function handleInput(event) {
    if (event.target?.name !== "writing-answer") return;
    const result = controller.updateAnswer(event.target.value);
    if (!result.ok) return;

    event.target.setAttribute("aria-invalid", "false");
    const errorElement = getContainer().querySelector("#writing-answer-error");
    if (errorElement) {
      errorElement.textContent = "";
      errorElement.hidden = true;
    }
    const liveRegion = getLiveRegion();
    if (liveRegion) liveRegion.textContent = "";
  }

  function handleSubmit(event) {
    if (!event.target?.matches?.("[data-writing-form]")) return;
    event.preventDefault();
    submitAnswer();
  }

  function handleChange(event) {
    if (["writing-source", "writing-package", "writing-amount"].includes(event.target?.name)) {
      updateConfigurationHint(event);
    }
  }

  function handleClick(event) {
    const control = event.target?.closest?.("[data-writing-action], [data-writing-dialog-action]");
    if (!control || !appRoot.contains(control) || control.disabled) return;

    const dialogAction = control.dataset.writingDialogAction;
    if (dialogAction) {
      event.preventDefault();
      if (dialogAction === "confirm") confirmExit();
      else cancelExit();
      return;
    }

    const action = control.dataset.writingAction;
    if (action === "start") startFromConfiguration();
    else if (action === "change-scope") {
      controller.discardWriting();
      activeScopeLabel = null;
      renderWritingRoute();
      announce("Wähle deinen Lernbereich neu aus.");
    }
    else if (action === "hint") showHint();
    else if (action === "next") nextPrompt();
    else if (action === "restart") restartWriting();
    else if (action === "practice-wrong") practiceWrongWords();
  }

  function handleKeydown(event) {
    const hasOpenDialog = Boolean(documentRoot.querySelector("dialog[open]"));
    const action = getWritingShortcut(event, controller.getSnapshot(), hasOpenDialog);
    if (!action) return;

    event.preventDefault();
    if (action === "submit") submitAnswer();
    else if (action === "next") nextPrompt();
    else if (action === "hint") showHint();
    else if (action === "exit") openExitDialog();
  }

  function handleDialogCancel(event) {
    if (!event.target?.matches?.("[data-writing-exit-dialog]")) return;
    event.preventDefault();
    cancelExit();
  }

  function destroy() {
    appRoot.removeEventListener("change", handleChange);
    appRoot.removeEventListener("click", handleClick);
    appRoot.removeEventListener("input", handleInput);
    appRoot.removeEventListener("submit", handleSubmit);
    documentRoot.removeEventListener("keydown", handleKeydown);
    documentRoot.removeEventListener("cancel", handleDialogCancel, true);
  }

  appRoot.addEventListener("change", handleChange);
  appRoot.addEventListener("click", handleClick);
  appRoot.addEventListener("input", handleInput);
  appRoot.addEventListener("submit", handleSubmit);
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
