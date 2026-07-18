import { getCurrentUnitId, setCurrentUnitId } from "./core/course.js";
import { getAvailableWords } from "./core/vocabulary.js";
import {
  loadLearningState,
  saveLearningState,
} from "./core/learning-state.js";
import { createRouter, navigateTo, startRouter } from "./core/router.js?v=4.0.5";
import { configureStorageNamespace } from "./core/storage.js";
import { createQuizRuntime } from "./quiz/quiz-runtime.js?v=4.0.5";
import { createSessionRuntime } from "./session/session-runtime.js?v=4.0.5";
import { createWritingRuntime } from "./writing/writing-runtime.js?v=4.0.5";
import {
  calculateDashboardMetrics,
  renderDashboard,
} from "./views/dashboard-view.js?v=4.0.5";
import {
  calculateAcademicProgress,
  renderProgressView,
} from "./views/progress-view.js?v=4.0.5";
import { renderUnits } from "./views/units-view.js";
import { createDeploymentCapabilities } from "./runtime/deployment-capabilities.js";
import {
  applyDeploymentMetadata,
  loadDeploymentProfile,
} from "./runtime/deployment-profile.js";
import { createDeliveryRuntime } from "./delivery/delivery-runtime.js";

export { calculateDashboardMetrics } from "./views/dashboard-view.js";

// Bump this query value with every bundled content release. The stable course
// and word IDs keep learning data attached while the URL invalidates stale
// browser HTTP-cache entries from earlier content versions.
const BUNDLED_CONTENT_VERSION = 3;
const COURSE_CONFIG_URL = `./config/course-config.json?content=${BUNDLED_CONTENT_VERSION}`;
const VOCABULARY_DATA_URL = `./data/vocabulary.json?content=${BUNDLED_CONTENT_VERSION}`;
const ROUTE_TITLES = Object.freeze({
  "/dashboard": "Dashboard",
  "/learn": "Heute lernen",
  "/review": "Wiederholen",
  "/marked": "Gemerkte Wörter",
  "/quiz": "Quiz",
  "/write": "Schreibtraining",
  "/speed": "Speed Challenge",
  "/progress": "Mein Fortschritt",
  "/units": "Alle Lernpakete",
  "/settings": "Einstellungen",
  "/course-select": "Browser-Kurs auswählen",
  "/courses": "Kursbibliothek",
  "/course-builder": "Kurs bearbeiten",
  "/unavailable": "Funktion nicht verfügbar",
  "/not-found": "Bereich nicht gefunden",
});

let runtimeState = null;
let hasRenderedRoute = false;

/** Loads data, restores local state and starts the routed application. */
export async function initializeApp(appRoot = document.querySelector("[data-vocabulary-app]")) {
  if (!appRoot) {
    return null;
  }

  runtimeState?.sessionRuntime?.destroy();
  runtimeState?.quizRuntime?.destroy();
  runtimeState?.speedRuntime?.destroy();
  runtimeState?.writingRuntime?.destroy();
  runtimeState?.pronunciation?.destroy();
  runtimeState?.pronunciationSettings?.destroy();
  runtimeState?.unitSelection?.destroy();
  runtimeState?.motivationUi?.destroy();
  runtimeState?.courseRuntime?.destroy();
  runtimeState?.delivery?.destroy();
  runtimeState = null;
  appRoot.setAttribute("aria-busy", "true");
  const courseLiveRegion = appRoot.querySelector("[data-course-live]");
  if (courseLiveRegion) courseLiveRegion.textContent = "";

  try {
    const deploymentProfile = await loadDeploymentProfile();
    const capabilities = createDeploymentCapabilities(deploymentProfile);
    configureStorageNamespace(deploymentProfile.deploymentId);
    applyDeploymentMetadata(appRoot.ownerDocument, deploymentProfile);
    applyCapabilityVisibility(appRoot, capabilities);
    let deploymentContext = null;
    /* build:catalog:start */
    if (capabilities.hasPublishedCourseCatalog()) {
      const catalogResult = await preparePublishedCourseCatalog({
        appRoot,
        deploymentProfile,
      });
      if (!catalogResult.context) {
        appRoot.setAttribute("aria-busy", "false");
        return catalogResult;
      }
      deploymentContext = catalogResult.context;
    }
    /* build:catalog:end */
    if (!deploymentContext) {
      deploymentContext = await loadDeploymentCourseContext(
        deploymentProfile,
        capabilities,
      );
    }
    const delivery = await createDeliveryRuntime({ appRoot, deploymentProfile });
    const {
      courseConfig,
      vocabularyData,
      builtInCourse = null,
      courseLibraryService = null,
      loadedLibrary = {},
    } = deploymentContext;

    const currentUnitId = getCurrentUnitId(courseConfig);
    if (!vocabularyData.units.some((unit) => unit.id === currentUnitId)) {
      throw new Error("Die aktuelles Lernpaket ist nicht verfügbar.");
    }

    const learningState = loadLearningState(courseConfig.courseId, new Date());
    runtimeState = {
      appRoot,
      capabilities,
      courseConfig,
      builtInCourse,
      courseLibraryService,
      courseLibraryRecovered: loadedLibrary.recovered,
      builtInCourseUpdated: loadedLibrary.builtInUpdated === true,
      courseRuntime: null,
      learningState,
      metrics: null,
      motivation: null,
      motivationSummary: null,
      motivationUi: null,
      pronunciation: null,
      pronunciationSettings: null,
      quizRuntime: null,
      sessionRuntime: null,
      speedRuntime: null,
      writingRuntime: null,
      vocabularyData,
      unitSelection: null,
      deploymentProfile,
      delivery,
      publishedCourseCatalog: deploymentContext.publishedCourseCatalog ?? null,
      publication: deploymentContext.publication ?? null,
    };
    if (capabilities.hasMotivation()) {
      runtimeState.motivation = await createDeploymentMotivation(courseConfig);
    }
    if (capabilities.hasPronunciation()) {
      runtimeState.pronunciation = await createDeploymentPronunciation(
        appRoot,
        courseConfig,
      );
      runtimeState.pronunciationSettings = setupPronunciationSettings();
    }
    runtimeState.sessionRuntime = createSessionRuntime({
      appRoot,
      courseConfig,
      vocabularyData,
      learningState,
      motivation: runtimeState.motivation,
      onLearningStateChange(nextLearningState) {
        return synchronizeLearningState("session", nextLearningState);
      },
      pronunciation: runtimeState.pronunciation,
    });
    runtimeState.quizRuntime = createQuizRuntime({
      appRoot,
      courseConfig,
      vocabularyData,
      learningState,
      motivation: runtimeState.motivation,
      onLearningStateChange(nextLearningState) {
        return synchronizeLearningState("quiz", nextLearningState);
      },
      onNavigate: navigateTo,
      onPracticeWrong(wordIds) {
        const result = runtimeState.sessionRuntime.startPracticeSession(wordIds, "/learn");
        if (result.ok) {
          navigateTo("/learn");
        }
        return result;
      },
      pronunciation: runtimeState.pronunciation,
    });
    runtimeState.writingRuntime = createWritingRuntime({
      appRoot,
      courseConfig,
      vocabularyData,
      learningState,
      motivation: runtimeState.motivation,
      onLearningStateChange(nextLearningState) {
        return synchronizeLearningState("writing", nextLearningState);
      },
      onNavigate: navigateTo,
      onPracticeWrong(wordIds) {
        const result = runtimeState.sessionRuntime.startPracticeSession(wordIds, "/learn");
        if (result.ok) {
          navigateTo("/learn");
        }
        return result;
      },
      pronunciation: runtimeState.pronunciation,
    });
    if (capabilities.hasSpeedChallenge()) {
      const { createSpeedRuntime } = await import("./speed/speed-runtime.js?v=4.0.5");
      runtimeState.speedRuntime = createSpeedRuntime({
        appRoot,
        courseConfig,
        vocabularyData,
        learningState,
        motivation: runtimeState.motivation,
        onLearningStateChange(nextLearningState) {
          return synchronizeLearningState("speed", nextLearningState);
        },
        onNavigate: navigateTo,
        onPracticeNotable(wordIds) {
          const result = runtimeState.sessionRuntime.startPracticeSession(wordIds, "/learn");
          if (result.ok) navigateTo("/learn");
          return result;
        },
      });
    }
    if (capabilities.hasMotivation()) {
      runtimeState.motivationUi = setupMotivationUi();
    }
    if (capabilities.canManageCourses()) {
      runtimeState.courseRuntime = deploymentContext.createCourseRuntime({
        appRoot,
        service: courseLibraryService,
        enabled: capabilities.canBuildCourses(),
        recovered: loadedLibrary.recovered,
        onActivateCourse: activateCourse,
        onCourseUpdated: refreshChangedCourse,
        onNavigate: navigateTo,
      });
    }
    hasRenderedRoute = false;

    const metrics = refreshApplicationData();
    runtimeState.unitSelection = setupUnitSelection();
    setupRouting();
    appRoot.setAttribute("aria-busy", "false");
    return metrics;
  } catch (error) {
    runtimeState?.pronunciation?.destroy();
    showFatalError(appRoot, error);
    return null;
  }
}

async function loadDeploymentCourseContext(profile, capabilities) {
  if (capabilities.canManageCourses()) {
    const { initializeAuthoring } = await import("./runtime/authoring-entry.js?v=4.0.5");
    return initializeAuthoring({
      courseConfigUrl: COURSE_CONFIG_URL,
      vocabularyDataUrl: VOCABULARY_DATA_URL,
    });
  }
  const { loadPublishedCourseContext } = await import("./runtime/published-course.js");
  return loadPublishedCourseContext(profile);
}

/* build:catalog:start */
async function preparePublishedCourseCatalog({ appRoot, deploymentProfile }) {
  const [{
    createPublishedCourseSelectionUrl,
    createPublishedCourseUrl,
    getRequestedPublicationId,
    loadLastPublishedCourseId,
    loadPublishedCatalogCourseContext,
    loadPublishedCourseCatalog,
    saveLastPublishedCourseId,
  }, {
    renderPublishedCourseLibrary,
  }] = await Promise.all([
    import("./runtime/published-course-catalog.js"),
    import("./views/published-course-library-view.js"),
  ]);
  const catalog = await loadPublishedCourseCatalog(deploymentProfile);
  const documentRoot = appRoot.ownerDocument;
  const currentUrl = documentRoot.defaultView?.location?.href ?? documentRoot.baseURI;
  const requested = getRequestedPublicationId(documentRoot.defaultView?.location);
  const selected = requested.publicationId
    ? catalog.courses.find((course) => course.publicationId === requested.publicationId)
    : null;
  const errorMessage = requested.explicit && !selected
    ? "Dieser Browser-Kurs ist nicht verfügbar. Wähle einen vorhandenen Kurs aus."
    : "";
  renderPublishedCourseLibrary(
    documentRoot.querySelector("[data-published-course-library]"),
    catalog,
    {
      errorMessage,
      lastPublicationId: loadLastPublishedCourseId(),
      createCourseUrl: (publicationId) => createPublishedCourseUrl(
        currentUrl,
        publicationId,
      ),
    },
  );
  const switchLink = documentRoot.querySelector("[data-published-course-switch]");
  if (switchLink) {
    switchLink.href = createPublishedCourseSelectionUrl(currentUrl);
    switchLink.hidden = false;
  }

  if (!selected) {
    showPublishedCourseSelection(appRoot, deploymentProfile);
    return Object.freeze({ context: null, catalog, errorMessage });
  }

  try {
    const context = await loadPublishedCatalogCourseContext(
      deploymentProfile,
      catalog,
      selected.publicationId,
    );
    saveLastPublishedCourseId(selected.publicationId);
    return Object.freeze({
      context: Object.freeze({
        ...context,
        publishedCourseCatalog: catalog,
      }),
      catalog,
      errorMessage: "",
    });
  } catch (error) {
    console.error(`Browser-Kurs „${selected.publicationId}“ konnte nicht geladen werden.`, error);
    const message = "Dieser Browser-Kurs konnte nicht geladen werden. Wähle einen anderen Kurs aus.";
    renderPublishedCourseLibrary(
      documentRoot.querySelector("[data-published-course-library]"),
      catalog,
      {
        errorMessage: message,
        lastPublicationId: loadLastPublishedCourseId(),
        createCourseUrl: (publicationId) => createPublishedCourseUrl(
          currentUrl,
          publicationId,
        ),
      },
    );
    showPublishedCourseSelection(appRoot, deploymentProfile);
    return Object.freeze({ context: null, catalog, errorMessage: message });
  }
}

function showPublishedCourseSelection(appRoot, deploymentProfile) {
  const documentRoot = appRoot.ownerDocument;
  const view = appRoot.querySelector('[data-route-view="/course-select"]');
  appRoot.querySelectorAll("[data-route-view]").forEach((candidate) => {
    candidate.hidden = candidate !== view;
  });
  const heading = view?.querySelector("h1");
  if (heading?.id) appRoot.setAttribute("aria-labelledby", heading.id);
  const courseTitle = documentRoot.querySelector("[data-dashboard-course-title]");
  const currentUnit = documentRoot.querySelector("[data-dashboard-current-unit]");
  const courseLabel = documentRoot.querySelector("[data-dashboard-course-label]");
  if (courseTitle) courseTitle.textContent = "Browser-Kurse";
  if (currentUnit) currentUnit.textContent = "Kurs auswählen";
  if (courseLabel) courseLabel.setAttribute("aria-label", "Browser-Kurs auswählen");
  documentRoot.querySelector(".app-nav")?.setAttribute("hidden", "");
  documentRoot.querySelector("[data-header-action]")?.setAttribute("hidden", "");
  const location = documentRoot.defaultView?.location;
  if (location?.hash !== "#/course-select") {
    documentRoot.defaultView?.history?.replaceState?.(
      documentRoot.defaultView.history.state ?? null,
      "",
      `${location?.pathname ?? ""}${location?.search ?? ""}#/course-select`,
    );
  }
  documentRoot.title = `Browser-Kurs auswählen – ${deploymentProfile.app.title}`;
  Promise.resolve().then(() => appRoot.focus());
}
/* build:catalog:end */

async function createDeploymentMotivation(courseConfig) {
  const [configModule, controllerModule, serviceModule, storageModule] = await Promise.all([
    import("./motivation/motivation-config.js?v=4.0.5"),
    import("./motivation/motivation-controller.js?v=4.0.5"),
    import("./motivation/motivation-service.js?v=4.0.5"),
    import("./motivation/motivation-storage.js?v=4.0.5"),
  ]);
  const motivationConfig = configModule.resolveMotivationConfig(courseConfig);
  const motivationState = storageModule.loadMotivationState(courseConfig.courseId, {
    enabled: motivationConfig.enabled,
    now: new Date(),
  });
  const service = serviceModule.createMotivationService({
    config: motivationConfig,
    state: motivationState,
    save: storageModule.saveMotivationState,
  });
  return controllerModule.createMotivationController({
    service,
    onChange: handleMotivationChange,
  });
}

async function createDeploymentPronunciation(appRoot, courseConfig) {
  const [controllerModule, preferencesModule, serviceModule] = await Promise.all([
    import("./audio/pronunciation-controller.js"),
    import("./audio/pronunciation-preferences.js"),
    import("./audio/pronunciation-service.js"),
  ]);
  return controllerModule.createPronunciationController({
    appRoot,
    courseConfig,
    service: serviceModule.createPronunciationService(),
    preferences: preferencesModule.loadPronunciationPreferences(),
    savePreferences: preferencesModule.savePronunciationPreferences,
  });
}

function setupPronunciationSettings() {
  const { appRoot, pronunciation } = runtimeState;
  const speedControls = [...appRoot.querySelectorAll("[data-pronunciation-speed]")];
  const voiceControl = appRoot.querySelector("[data-pronunciation-voice]");
  const help = appRoot.querySelector("[data-pronunciation-voice-help]");
  const live = appRoot.querySelector("[data-pronunciation-settings-live]");

  function announce(message) {
    if (!live) return;
    live.textContent = "";
    Promise.resolve().then(() => { live.textContent = message; });
  }

  const unsubscribe = pronunciation.subscribeSettings((settings) => {
    speedControls.forEach((control) => { control.checked = control.value === settings.speed; });
    if (!voiceControl) return;
    voiceControl.replaceChildren();
    if (settings.voices.length === 0) {
      const automatic = voiceControl.ownerDocument.createElement("option");
      automatic.value = "automatic";
      automatic.textContent = "Automatisch";
      voiceControl.append(automatic);
    } else {
      settings.voices.forEach((voice) => {
        const option = voiceControl.ownerDocument.createElement("option");
        option.value = voice.name;
        option.textContent = voice.displayName;
        voiceControl.append(option);
      });
    }
    voiceControl.value = settings.voiceName;
    if (help) {
      if (settings.voices.length === 1) {
        help.textContent = `Stimme: ${settings.voices[0].displayName}.`;
      } else if (settings.voices.length === 2) {
        help.textContent = "Auf diesem Gerät stehen zwei geprüfte Stimmen zur Auswahl.";
      } else {
        help.textContent = "Aktuell ist keine geprüfte Stimme auf diesem Gerät gemeldet. Der Browser verwendet einen sicheren Sprach-Fallback.";
      }
    }
  });

  function handleChange(event) {
    if (event.target?.matches?.("[data-pronunciation-speed]")) {
      const saved = pronunciation.setSpeed(event.target.value);
      announce(saved ? "Sprechgeschwindigkeit gespeichert." : "Die Sprechgeschwindigkeit konnte nicht gespeichert werden.");
    } else if (event.target?.matches?.("[data-pronunciation-voice]")) {
      const saved = pronunciation.setVoiceName(event.target.value);
      announce(saved ? "Stimme gespeichert." : "Die Stimme konnte nicht gespeichert werden.");
    }
  }

  appRoot.addEventListener("change", handleChange);
  return Object.freeze({
    destroy() {
      unsubscribe();
      appRoot.removeEventListener("change", handleChange);
    },
  });
}

function setupUnitSelection() {
  const { appRoot } = runtimeState;

  function announce(message) {
    const live = appRoot.querySelector("[data-units-live]");
    if (!live) return;
    live.textContent = "";
    Promise.resolve().then(() => { live.textContent = message; });
  }

  function handleClick(event) {
    const control = event.target?.closest?.("[data-unit-select]");
    if (!control || !appRoot.contains(control)) return;
    const unitId = control.dataset.unitSelect;
    const unit = runtimeState.vocabularyData.units.find((candidate) => candidate.id === unitId);
    if (
      !unit
      || unit.words.length === 0
      || !runtimeState.courseConfig.availableUnits.includes(unitId)
    ) return;

    if (runtimeState.courseConfig.currentUnit !== unitId) {
      const course = runtimeState.courseLibraryService?.getCourse(runtimeState.courseConfig.courseId);
      if (course?.editable === true) {
        runtimeState.courseLibraryService.updateUnit(course.id, unitId, { current: true });
      }
      setCurrentUnitId(runtimeState.courseConfig, unitId);
      refreshApplicationData();
      announce(`${unit.title} ist jetzt die aktuelles Lernpaket.`);
    }
    navigateTo("/dashboard");
  }

  appRoot.addEventListener("click", handleClick);
  return Object.freeze({ destroy() { appRoot.removeEventListener("click", handleClick); } });
}

function refreshApplicationData(now = new Date()) {
  if (!runtimeState) {
    throw new Error("Der Vocabulary Trainer wurde noch nicht initialisiert.");
  }

  const metrics = calculateDashboardMetrics({
    courseConfig: runtimeState.courseConfig,
    vocabularyData: runtimeState.vocabularyData,
    learningState: runtimeState.learningState,
    now,
  });
  runtimeState.metrics = metrics;

  const documentRoot = runtimeState.appRoot.ownerDocument;
  const motivationSummary = runtimeState.motivation?.getProgressSummary(now) ?? null;
  const academicProgress = calculateAcademicProgress({
    courseConfig: runtimeState.courseConfig,
    vocabularyData: runtimeState.vocabularyData,
    learningState: runtimeState.learningState,
    now,
  });
  runtimeState.motivationSummary = motivationSummary;
  renderDashboard(documentRoot, metrics, motivationSummary);
  renderProgressView(
    requireElement(documentRoot, "[data-progress-view-content]"),
    academicProgress,
    motivationSummary,
    { showMotivation: runtimeState.capabilities.hasMotivation() },
  );
  setText(documentRoot, "[data-units-course-title]", metrics.courseTitle);
  setText(documentRoot, "[data-settings-course-title]", metrics.courseTitle);
  renderUnits(documentRoot, runtimeState.courseConfig, runtimeState.vocabularyData);
  const currentUnit = runtimeState.vocabularyData.units.find((unit) => unit.id === runtimeState.courseConfig.currentUnit);
  const courseLabel = documentRoot.querySelector("[data-dashboard-course-label]");
  if (courseLabel) courseLabel.setAttribute("aria-label", `Aktueller Kurs: ${metrics.courseTitle}, ${currentUnit?.title ?? "keine aktuelles Lernpaket"}`);
  return metrics;
}

async function activateCourse(courseId) {
  if (!runtimeState?.capabilities.canSwitchCourses()) return;
  runtimeState.pronunciation?.stop("course-change");
  runtimeState.sessionRuntime?.discardSession();
  runtimeState.quizRuntime?.leaveRoute("/dashboard");
  runtimeState.writingRuntime?.leaveRoute("/dashboard");
  runtimeState.speedRuntime?.leaveRoute("/dashboard");
  runtimeState.courseLibraryService.setActiveCourse(courseId);
  navigateTo("/dashboard", { replace: true });
  await initializeApp(runtimeState.appRoot);
}

function refreshChangedCourse(courseId) {
  if (!runtimeState?.courseLibraryService) return;
  const activeCourseId = runtimeState.courseLibraryService.getState().activeCourseId;
  if (activeCourseId === courseId || activeCourseId !== runtimeState.courseConfig.courseId) {
    Promise.resolve().then(() => initializeApp(runtimeState?.appRoot));
  }
}

function handleMotivationChange(_result, kind) {
  if (!runtimeState) return;
  refreshApplicationData();
  if (kind === "session-completion") {
    Promise.resolve().then(presentPendingLevelUps);
  }
}

function presentPendingLevelUps() {
  if (!runtimeState?.motivationSummary?.enabled) return;
  const [notification] = runtimeState.motivation.consumePendingNotifications();
  if (notification) {
    import("./components/level-up-notice.js?v=4.0.5")
      .then(({ showLevelUpNotice }) => {
        showLevelUpNotice(runtimeState.appRoot.ownerDocument, notification);
      });
  }
}

function applyCapabilityVisibility(appRoot, capabilities) {
  const visibility = {
    authoring: capabilities.canManageCourses(),
    motivation: capabilities.hasMotivation(),
    pronunciation: capabilities.hasPronunciation(),
    speed: capabilities.hasSpeedChallenge(),
    "course-catalog": capabilities.hasPublishedCourseCatalog(),
  };
  for (const [name, visible] of Object.entries(visibility)) {
    appRoot.ownerDocument.querySelectorAll(`[data-feature-capability="${name}"]`)
      .forEach((element) => {
        element.hidden = !visible;
      });
  }
}

function setupMotivationUi() {
  const { appRoot, motivation } = runtimeState;
  const documentRoot = appRoot.ownerDocument;
  let resetTrigger = null;

  function announce(message) {
    const liveRegion = appRoot.querySelector("[data-motivation-live]");
    if (!liveRegion) return;
    liveRegion.textContent = "";
    Promise.resolve().then(() => {
      liveRegion.textContent = message;
    });
  }

  function getResetDialog() {
    return requireElement(appRoot, "[data-motivation-reset-dialog]");
  }

  function closeResetDialog(restoreFocus = true) {
    const dialog = getResetDialog();
    if (dialog.open && typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    if (restoreFocus) resetTrigger?.focus();
  }

  function openResetDialog(trigger) {
    resetTrigger = trigger;
    const dialog = getResetDialog();
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.querySelector("[data-motivation-reset-action='cancel']")?.focus();
  }

  function handleChange(event) {
    const control = event.target?.closest?.("[data-motivation-enabled]");
    if (!control || !appRoot.contains(control)) return;
    const result = motivation.setEnabled(control.checked);
    if (!result.ok) {
      control.checked = !control.checked;
      announce("Die Motivationseinstellung konnte nicht gespeichert werden.");
      return;
    }
    announce(control.checked
      ? "Motivationselemente sind aktiviert."
      : "Motivationselemente sind deaktiviert. Dein Lernstand bleibt unverändert.");
  }

  function handleClick(event) {
    const resetAction = event.target?.closest?.("[data-motivation-reset-action]");
    if (resetAction) {
      event.preventDefault();
      if (resetAction.dataset.motivationResetAction === "cancel") {
        closeResetDialog();
      } else {
        const result = motivation.resetMotivationProgress();
        if (!result.ok) {
          closeResetDialog(false);
          announce("Der Motivationsfortschritt konnte nicht zurückgesetzt werden.");
          return;
        }
        closeResetDialog(false);
        announce("Der Motivationsfortschritt wurde zurückgesetzt. Dein fachlicher Lernstand bleibt erhalten.");
        appRoot.querySelector("[data-motivation-enabled]")?.focus();
      }
      return;
    }

    const action = event.target?.closest?.("[data-motivation-action]");
    if (action?.dataset.motivationAction === "open-reset") {
      openResetDialog(action);
    }
  }

  function handleCancel(event) {
    if (!event.target?.matches?.("[data-motivation-reset-dialog]")) return;
    event.preventDefault();
    closeResetDialog();
  }

  appRoot.addEventListener("change", handleChange);
  appRoot.addEventListener("click", handleClick);
  appRoot.addEventListener("cancel", handleCancel, true);
  return Object.freeze({
    destroy() {
      appRoot.removeEventListener("change", handleChange);
      appRoot.removeEventListener("click", handleClick);
      appRoot.removeEventListener("cancel", handleCancel, true);
    },
  });
}

function synchronizeLearningState(source, nextLearningState) {
  runtimeState.learningState = nextLearningState;

  if (source !== "session") {
    runtimeState.sessionRuntime.replaceLearningState(nextLearningState);
  }
  if (source !== "quiz") {
    runtimeState.quizRuntime?.replaceLearningState(nextLearningState);
  }
  if (source !== "writing") {
    runtimeState.writingRuntime?.replaceLearningState(nextLearningState);
  }
  if (source !== "speed") {
    runtimeState.speedRuntime?.replaceLearningState(nextLearningState);
  }

  return refreshApplicationData();
}

function setupRouting() {
  const defaultRoute = runtimeState.deploymentProfile.app.defaultRoute.slice(1);
  const routeHandlers = Object.fromEntries(
    Object.keys(ROUTE_TITLES)
      .filter((route) => !new Set(["/not-found", "/unavailable"]).has(route))
      .map((route) => [route, (context) => {
        if (!runtimeState.capabilities.isRouteAvailable(route)) {
          activateUnavailableRoute(route, context);
          return;
        }
        activateRoute(route, context);
      }]),
  );

  createRouter(routeHandlers, {
    defaultRoute,
    onNotFound: (route, context) => activateUnknownRoute(route, context),
  });
  startRouter();
}

function activateRoute(route, context) {
  if (
    runtimeState.courseRuntime?.interceptRouteChange(route)
    || runtimeState.quizRuntime.interceptRouteChange(route)
    || runtimeState.writingRuntime.interceptRouteChange(route)
    || runtimeState.speedRuntime?.interceptRouteChange(route)
  ) {
    return;
  }

  runtimeState.sessionRuntime.leaveRoute(route);
  runtimeState.pronunciation?.stop("route-change");
  runtimeState.quizRuntime.leaveRoute(route);
  runtimeState.writingRuntime.leaveRoute(route);
  runtimeState.speedRuntime?.leaveRoute(route);
  runtimeState.courseRuntime?.leaveRoute(route);
  const metrics = refreshApplicationData();
  runtimeState.sessionRuntime.renderRoute(route, metrics);
  runtimeState.quizRuntime.renderRoute(route, metrics);
  runtimeState.writingRuntime.renderRoute(route, metrics);
  runtimeState.speedRuntime?.renderRoute(route, metrics);
  runtimeState.courseRuntime?.renderRoute(route, metrics, context);
  showRouteView(route, context);
  if (route === "/dashboard") {
    Promise.resolve().then(presentPendingLevelUps);
  }
}

function activateUnknownRoute(route, context) {
  if (
    runtimeState.courseRuntime?.interceptRouteChange(route)
    || runtimeState.quizRuntime.interceptRouteChange(route)
    || runtimeState.writingRuntime.interceptRouteChange(route)
    || runtimeState.speedRuntime?.interceptRouteChange(route)
  ) {
    return;
  }

  runtimeState.sessionRuntime.leaveRoute(route);
  runtimeState.pronunciation?.stop("route-change");
  runtimeState.quizRuntime.leaveRoute(route);
  runtimeState.writingRuntime.leaveRoute(route);
  runtimeState.speedRuntime?.leaveRoute(route);
  runtimeState.courseRuntime?.leaveRoute(route);
  const unknownRoute = runtimeState.appRoot.querySelector("[data-unknown-route]");

  if (unknownRoute) {
    unknownRoute.textContent = `#${route}`;
  }

  showRouteView("/not-found", context, route);
}

function activateUnavailableRoute(route, context) {
  runtimeState.sessionRuntime.leaveRoute(route);
  runtimeState.pronunciation?.stop("route-change");
  runtimeState.quizRuntime.leaveRoute(route);
  runtimeState.writingRuntime.leaveRoute(route);
  runtimeState.speedRuntime?.leaveRoute(route);
  runtimeState.courseRuntime?.leaveRoute(route);
  const description = runtimeState.appRoot.querySelector("[data-unavailable-description]");
  if (description) {
    description.textContent = "Diese Funktion ist in dieser Version nicht verfügbar.";
  }
  showRouteView("/unavailable", context, route);
}

function showRouteView(viewRoute, context = {}, activeRoute = viewRoute) {
  const views = [...runtimeState.appRoot.querySelectorAll("[data-route-view]")];
  const activeView = views.find((view) => view.dataset.routeView === viewRoute);

  if (!activeView) {
    throw new Error(`Ansicht fehlt: ${viewRoute}`);
  }

  views.forEach((view) => {
    view.hidden = view !== activeView;
  });

  const heading = activeView.querySelector("h1:not([hidden])");
  if (heading?.id) {
    runtimeState.appRoot.setAttribute("aria-labelledby", heading.id);
  } else {
    runtimeState.appRoot.removeAttribute("aria-labelledby");
  }

  updateActiveRouteLinks(activeRoute);
  runtimeState.appRoot.ownerDocument.title = `${ROUTE_TITLES[viewRoute]} – ${runtimeState.deploymentProfile.app.title}`;

  if (hasRenderedRoute && context.source !== "start") {
    runtimeState.appRoot.focus();
  }

  hasRenderedRoute = true;
}

function updateActiveRouteLinks(route) {
  const routeGroups = {
    learning: new Set(["/learn", "/review", "/marked", "/quiz", "/write", "/speed"]),
    courses: new Set(["/courses", "/course-builder", "/units"]),
  };

  runtimeState.appRoot.ownerDocument.querySelectorAll("[data-main-nav-link], [data-header-action]")
    .forEach((link) => {
      const group = routeGroups[link.dataset.routeGroup];
      const isCurrent = link.dataset.routeLink === route || group?.has(route);

      if (isCurrent) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
}

function setText(root, selector, value) {
  requireElement(root, selector).textContent = String(value);
}

function requireElement(root, selector) {
  const element = root.querySelector(selector);

  if (!element) {
    throw new Error(`App-Ziel fehlt: ${selector}`);
  }

  return element;
}

function showFatalError(appRoot, error) {
  console.error("Vocabulary Trainer konnte nicht initialisiert werden.", error);

  const status = appRoot.querySelector("[data-app-status]");
  const errorElement = appRoot.querySelector("[data-app-error]");
  if (status) {
    status.textContent = "Die Lerndaten sind gerade nicht verfügbar";
  }
  if (errorElement) {
    errorElement.textContent = getSafeErrorMessage(error);
    errorElement.hidden = false;
  }

  const errorTitle = appRoot.querySelector("[data-app-error-title]");
  if (errorTitle) {
    errorTitle.hidden = false;
    appRoot.setAttribute("aria-labelledby", errorTitle.id);
  }

  appRoot.querySelectorAll("[data-route-view]").forEach((view) => {
    view.hidden = view.dataset.routeView !== "/dashboard";
  });
  appRoot.querySelectorAll("[data-app-ready], [data-dashboard-section]")
    .forEach((element) => {
      element.hidden = true;
    });
  appRoot.ownerDocument.querySelectorAll("[data-route-link]")
    .forEach((link) => {
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      link.setAttribute("tabindex", "-1");
    });

  appRoot.setAttribute("aria-busy", "false");
  appRoot.ownerDocument.title = "Fehler – EduTools Vocabulary Trainer";
  appRoot.focus();
}

function getSafeErrorMessage(error) {
  const message = error instanceof Error ? error.message : "";
  const safePrefixes = [
    "Kurskonfiguration",
    "Vokabeldaten",
    "Kurs und Vokabeldatei",
    "Die aktuelles Lernpaket",
    "Der Kurs",
  ];

  return safePrefixes.some((prefix) => message.startsWith(prefix))
    ? message
    : "Die Lerndaten konnten nicht geladen werden. Bitte lade die Seite erneut.";
}

if (typeof document !== "undefined" && document.querySelector("[data-vocabulary-app]")) {
  initializeApp();
}
