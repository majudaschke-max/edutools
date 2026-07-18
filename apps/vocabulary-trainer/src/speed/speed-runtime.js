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
  readLearningScopeSelection,
  syncLearningScopePackageControls,
} from "../views/learning-scope-view.js";
import {
  focusSpeedTarget,
  getSpeedShortcut,
  moveSpeedFocus,
  renderSpeedView,
  updateSpeedPairOptions,
  updateSpeedTimerDisplay,
} from "../views/speed-view.js";
import { createSpeedController } from "./speed-controller.js?v=4.0.5";
import { getSpeedEligibleWordCount } from "./speed-generator.js";
import { createSpeedTimer } from "./speed-timer.js";
import { notifyLearningSessionCompleted } from "../delivery/learning-session-events.js";

const SPEED_ROUTE = "/speed";
const MINIMUM_WORD_COUNT = 4;
const MILLISECONDS_PER_SECOND = 1000;
const TIME_WARNING_MS = 10 * MILLISECONDS_PER_SECOND;
/** Connects Speed state, reliable timer, native controls, routing and Core. */
export function createSpeedRuntime(options) {
  const {
    appRoot,
    courseConfig,
    vocabularyData,
    learningState,
    motivation,
    onLearningStateChange,
    onNavigate,
    onPracticeNotable,
  } = options;
  const documentRoot = appRoot.ownerDocument;
  const availableWords = getAvailableWords(vocabularyData, courseConfig);
  const controller = createSpeedController({ learningState, words: availableWords });
  let currentRoute = null;
  let latestMetrics = null;
  let currentSourceOptions = [];
  let activeScopeLabel = null;
  let timer = null;
  let warningAnnounced = false;
  let dialogPausedTimer = false;

  function requireElement(selector) {
    const element = appRoot.querySelector(selector);
    if (!element) throw new Error(`Speed-Challenge-Ziel fehlt: ${selector}`);
    return element;
  }

  function getContainer() {
    return requireElement("[data-speed-view-content]");
  }

  function getLiveRegion() {
    return appRoot.querySelector("[data-speed-live]");
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
    ])
      .map((source) => ({ ...source, eligibleCount: getSpeedEligibleWordCount(source.words) }))
      .filter((source) => source.eligibleCount >= MINIMUM_WORD_COUNT);
  }

  function renderSpeedRoute() {
    currentSourceOptions = buildSourceOptions();
    const selectedScope = loadLearningScope(courseConfig.courseId);
    renderSpeedView({
      container: getContainer(),
      snapshot: controller.getSnapshot(),
      sourceOptions: currentSourceOptions,
      selectedScope,
      activeScopeLabel,
      summaryElement: requireElement("[data-speed-summary]"),
    });
  }

  function renderRoute(route, metrics = latestMetrics) {
    if (route !== SPEED_ROUTE) return;
    currentRoute = route;
    latestMetrics = metrics;
    renderSpeedRoute();
  }

  function getCheckedValue(form, name) {
    return form.querySelector(`input[name='${name}']:checked`)?.value ?? null;
  }

  function getSource(value) {
    return currentSourceOptions.find((source) => source.value === value) ?? null;
  }

  function stopTimer() {
    timer?.stop();
    timer = null;
    dialogPausedTimer = false;
  }

  function finishAtTimeLimit() {
    const result = controller.finishSpeed("time");
    stopTimer();
    if (!result.ok) return;
    recordSpeedCompletion(result.speed, true);
    renderSpeedRoute();
    announce("Die Zeit ist abgelaufen. Die Auswertung ist verfügbar.");
    focusSpeedTarget(getContainer(), "completion");
  }

  function handleTimerTick(remainingMs, endsAt) {
    if (!controller.synchronizeTime(remainingMs, endsAt)) return;
    updateSpeedTimerDisplay(getContainer(), remainingMs);
    if (!warningAnnounced && remainingMs > 0 && remainingMs <= TIME_WARNING_MS) {
      warningAnnounced = true;
      announce("Noch zehn Sekunden.");
    }
  }

  function startTimer(durationSeconds) {
    stopTimer();
    warningAnnounced = false;
    timer = createSpeedTimer({
      durationMs: durationSeconds * MILLISECONDS_PER_SECOND,
      onTick: handleTimerTick,
      onExpire: finishAtTimeLimit,
    });
    timer.start();
    controller.synchronizeTime(timer.getRemainingMs(), timer.getEndsAt());
    updateSpeedTimerDisplay(getContainer(), timer.getRemainingMs());
  }

  function startFromConfiguration() {
    const form = requireElement("[data-speed-config]");
    const selection = readLearningScopeSelection(form, "speed");
    const sourceType = selection.value;
    if (!isValidLearningScopeSelection(selection)) {
      announce("Wähle für mehrere Lernpakete mindestens zwei Pakete aus.");
      form.querySelector("input[name='speed-package']:not(:disabled)")?.focus();
      return;
    }
    const words = resolveLearningScopeWords(currentSourceOptions, sourceType, selection.packageIds);
    activeScopeLabel = formatLearningScope(currentSourceOptions, sourceType, selection.packageIds);
    const result = controller.startSpeed({
      sessionId: motivation?.createSessionId(),
      sourceType,
      direction: getCheckedValue(form, "speed-direction"),
      durationSeconds: Number(getCheckedValue(form, "speed-duration")),
      pairsPerRound: Number(getCheckedValue(form, "speed-pairs")),
      words,
    });
    saveLearningScope(courseConfig.courseId, selection);
    renderSpeedRoute();

    if (!result.ok) {
      announce(result.error ?? "Die Speed Challenge konnte nicht gestartet werden.");
      focusSpeedTarget(getContainer(), "error");
      return;
    }

    startTimer(result.speed.durationSeconds);
    const reduction = result.usedPairCount < result.requestedPairCount
      ? ` Die Rundengröße wurde auf ${result.usedPairCount} Paare reduziert.`
      : "";
    announce(`Speed Challenge gestartet. Runde 1 mit ${result.usedPairCount} Paaren.${reduction}`);
    focusSpeedTarget(getContainer(), "firstPair");
  }

  function syncPersistedState() {
    const metrics = onLearningStateChange?.(controller.getLearningState());
    if (metrics) latestMetrics = metrics;
  }

  function reportError(result) {
    if (result.technicalError) {
      console.error("Speed-Challenge-Lernstand konnte nicht gespeichert werden.", result.technicalError);
    }
    renderSpeedRoute();
    announce(result.error ?? "Die Zuordnung konnte nicht verarbeitet werden.");
    focusSpeedTarget(getContainer(), "error");
  }

  function focusItem(itemId) {
    const target = [...getContainer().querySelectorAll("[data-speed-pair-button]")]
      .find((button) => button.dataset.speedItemId === itemId);
    target?.focus();
  }

  function choosePairItem(control) {
    const result = controller.chooseItem(control.dataset.speedSide, control.dataset.speedItemId);
    if (!result.ok) {
      if (result.reason === "storage" || result.error) reportError(result);
      return;
    }
    if (result.persisted) {
      syncPersistedState();
      motivation?.recordWordPractice({
        sessionId: result.speed.sessionId,
        mode: "speed",
        sequence: result.speed.scoredWordIds.length,
        wordId: result.attempt.wordId,
        outcome: "correct",
      });
    }
    renderSpeedRoute();

    if (!result.selection?.ready && !result.attempt) {
      announce(`${control.dataset.speedSide === "left" ? "Linker" : "Rechter"} Begriff ausgewählt.`);
      focusItem(control.dataset.speedItemId);
      return;
    }

    announce(result.feedback);
    focusSpeedTarget(getContainer(), "firstPair");
  }

  function pauseChallenge() {
    if (!timer?.pause()) return;
    controller.synchronizeTime(timer.getRemainingMs(), null);
    const result = controller.pauseSpeed();
    if (!result.ok) return;
    renderSpeedRoute();
    announce("Speed Challenge pausiert. Die Zeit steht.");
    focusSpeedTarget(getContainer(), "pause");
  }

  function resumeChallenge() {
    const result = controller.resumeSpeed();
    if (!result.ok || !timer?.resume()) return;
    controller.synchronizeTime(timer.getRemainingMs(), timer.getEndsAt());
    renderSpeedRoute();
    announce("Speed Challenge wird fortgesetzt.");
    focusSpeedTarget(getContainer(), "firstPair");
  }

  function restartChallenge() {
    const result = controller.restartSpeed({ sessionId: motivation?.createSessionId() });
    renderSpeedRoute();
    if (!result.ok) {
      reportError(result);
      return;
    }
    startTimer(result.speed.durationSeconds);
    announce("Speed Challenge neu gestartet. Runde 1.");
    focusSpeedTarget(getContainer(), "firstPair");
  }

  function practiceNotableWords() {
    const wordIds = controller.getNotableWordIds();
    if (wordIds.length === 0) return;
    const result = onPracticeNotable?.(wordIds);
    if (!result?.ok) announce("Die auffälligen Wörter konnten nicht geöffnet werden.");
  }

  function closeExitDialog() {
    const dialog = appRoot.querySelector("[data-speed-exit-dialog]");
    if (dialog?.open && typeof dialog.close === "function") dialog.close();
    else dialog?.removeAttribute("open");
  }

  function openExitDialog() {
    const speed = controller.getSnapshot().speed;
    if (!speed || speed.completed) return;
    dialogPausedTimer = Boolean(timer?.isRunning() && timer.pause());
    if (dialogPausedTimer) controller.synchronizeTime(timer.getRemainingMs(), null);
    const dialog = requireElement("[data-speed-exit-dialog]");
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    dialog.querySelector("[data-speed-dialog-action='cancel']")?.focus();
  }

  function cancelExit() {
    closeExitDialog();
    if (dialogPausedTimer) {
      timer?.resume();
      controller.synchronizeTime(timer?.getRemainingMs() ?? 0, timer?.getEndsAt() ?? null);
    }
    dialogPausedTimer = false;
    const speed = controller.getSnapshot().speed;
    if (speed?.paused) focusSpeedTarget(getContainer(), "pause");
    else focusSpeedTarget(getContainer(), "firstPair");
  }

  function confirmExit() {
    closeExitDialog();
    const remaining = timer?.getRemainingMs() ?? 0;
    stopTimer();
    controller.synchronizeTime(remaining, null);
    const result = controller.finishSpeed("manual");
    if (!result.ok) return;
    recordSpeedCompletion(result.speed, false);
    renderSpeedRoute();
    announce("Speed Challenge beendet. Die Auswertung ist verfügbar.");
    focusSpeedTarget(getContainer(), "completion");
  }

  function recordSpeedCompletion(speed, notifyDelivery) {
    const practicedWordIds = [...new Set([
      ...speed.scoredWordIds,
      ...speed.incorrectAttempts.flatMap((attempt) => [
        attempt.leftWordId,
        attempt.rightWordId,
      ]),
    ])];
    motivation?.recordSessionCompletion({
      sessionId: speed.sessionId,
      mode: "speed",
      status: "completed",
      practicedWordIds,
      totalCount: speed.totalAttempts,
      correctCount: speed.correctMatches,
    });
    if (notifyDelivery) {
      notifyLearningSessionCompleted({ mode: "speed", sessionId: speed.sessionId });
    }
  }

  /** Restores the active route and turns navigation into a confirmed completion. */
  function interceptRouteChange(nextRoute) {
    const speed = controller.getSnapshot().speed;
    if (nextRoute === SPEED_ROUTE || !speed || speed.completed) return false;
    onNavigate?.(SPEED_ROUTE, { replace: true });
    openExitDialog();
    return true;
  }

  function leaveRoute(nextRoute) {
    if (currentRoute === SPEED_ROUTE && nextRoute !== SPEED_ROUTE) {
      const liveRegion = getLiveRegion();
      if (liveRegion) liveRegion.textContent = "";
    }
    if (nextRoute !== SPEED_ROUTE) {
      stopTimer();
      controller.discardSpeed();
      activeScopeLabel = null;
      currentRoute = null;
    }
  }

  function updatePairConfiguration() {
    const form = appRoot.querySelector("[data-speed-config]");
    if (!form) return;
    const selection = syncLearningScopePackageControls(form, "speed");
    const words = resolveLearningScopeWords(currentSourceOptions, selection.value, selection.packageIds);
    updateSpeedPairOptions(getContainer(), getSpeedEligibleWordCount(words));
  }

  function handleChange(event) {
    if (["speed-source", "speed-package"].includes(event.target?.name)) updatePairConfiguration();
  }

  function handleClick(event) {
    const control = event.target?.closest?.(
      "[data-speed-pair-button], [data-speed-action], [data-speed-dialog-action]",
    );
    if (!control || !appRoot.contains(control) || control.disabled) return;

    if (control.dataset.speedDialogAction) {
      event.preventDefault();
      if (control.dataset.speedDialogAction === "confirm") confirmExit();
      else cancelExit();
      return;
    }
    if (control.dataset.speedPairButton !== undefined) {
      choosePairItem(control);
      return;
    }

    const action = control.dataset.speedAction;
    if (action === "start") startFromConfiguration();
    else if (action === "change-scope") {
      stopTimer();
      controller.discardSpeed();
      activeScopeLabel = null;
      renderSpeedRoute();
      announce("Wähle deinen Lernbereich neu aus.");
    }
    else if (action === "pause") pauseChallenge();
    else if (action === "resume") resumeChallenge();
    else if (action === "end") openExitDialog();
    else if (action === "restart") restartChallenge();
    else if (action === "practice-notable") practiceNotableWords();
  }

  function handleKeydown(event) {
    const hasOpenDialog = Boolean(documentRoot.querySelector("dialog[open]"));
    const action = getSpeedShortcut(event, controller.getSnapshot(), hasOpenDialog);
    if (!action) return;
    event.preventDefault();

    if (action.startsWith("focus-")) {
      moveSpeedFocus(getContainer(), documentRoot.activeElement, action);
    } else if (action === "clear-selection") {
      const result = controller.clearSelection();
      if (result.ok) {
        renderSpeedRoute();
        announce("Auswahl aufgehoben.");
        focusSpeedTarget(getContainer(), "firstPair");
      }
    } else if (action === "pause") pauseChallenge();
    else if (action === "resume") resumeChallenge();
    else if (action === "exit") openExitDialog();
  }

  function handleDialogCancel(event) {
    if (!event.target?.matches?.("[data-speed-exit-dialog]")) return;
    event.preventDefault();
    cancelExit();
  }

  function destroy() {
    stopTimer();
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
