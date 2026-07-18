import {
  getSpeechLocale,
  PRONUNCIATION_PROVIDER,
  resolvePronunciationConfig,
} from "./pronunciation-config.js";
import {
  createPronunciationButton,
  setPronunciationButtonState,
} from "../components/pronunciation-button.js";
import { isPronunciationAllowedForRole } from "./pronunciation-policy.js";
import {
  PRONUNCIATION_SPEEDS,
  getPronunciationLanguageKey,
  normalizePronunciationPreferences,
} from "./pronunciation-preferences.js";
import {
  formatPronunciationVoiceLabel,
  getPreferredPronunciationVoices,
} from "./pronunciation-service.js";

const ACTIVE_STATUSES = new Set(["loading", "speaking"]);

/** Connects course-language roles and reusable controls to one audio service. */
export function createPronunciationController(options = {}) {
  const { appRoot, courseConfig, service } = options;
  if (!appRoot || !service) {
    throw new TypeError("App-Root und Aussprache-Service sind erforderlich.");
  }

  const logger = options.logger ?? console;
  const config = resolvePronunciationConfig(courseConfig, { logger });
  let preferences = normalizePronunciationPreferences(options.preferences);
  const settingsSubscribers = new Set();
  const liveRegion = appRoot.querySelector?.("[data-pronunciation-live]") ?? null;
  let destroyed = false;

  function announce(message) {
    if (!liveRegion || destroyed) return;
    liveRegion.textContent = "";
    Promise.resolve().then(() => {
      if (!destroyed) liveRegion.textContent = message;
    });
  }

  function canPronounce(text, role) {
    const normalizedText = typeof text === "string" ? text.trim() : "";
    const language = role === "source" || role === "target"
      ? config.languages[role]
      : null;
    return config.enabled
      && service.isSupported()
      && normalizedText.length > 0
      && normalizedText.length <= config.maxTextLength
      && Boolean(getSpeechLocale(config, role))
      && isPronunciationAllowedForRole(role, language);
  }

  function updateButtons(state = service.getState()) {
    appRoot.querySelectorAll?.("[data-pronunciation-action]").forEach((button) => {
      const active = button.dataset.pronunciationId === state.activeId
        && ACTIVE_STATUSES.has(state.status);
      setPronunciationButtonState(button, {
        text: button.dataset.pronunciationText,
        active,
        disabled: !canPronounce(
          button.dataset.pronunciationText,
          button.dataset.pronunciationRole,
        ),
      });
    });
  }

  function getSourceLocale() {
    return getSpeechLocale(config, "source") ?? "";
  }

  function getPreferredVoiceName() {
    const locale = getSourceLocale();
    const stored = preferences.voices[getPronunciationLanguageKey(locale)] ?? "";
    const available = getPreferredPronunciationVoices(
      service.getAvailableVoices(),
      locale,
    );
    if (available.some((voice) => voice.name === stored)) return stored;
    return available[0]?.name ?? "";
  }

  function getSettings() {
    const locale = getSourceLocale();
    const preferredVoiceName = getPreferredVoiceName();
    const matchingVoices = getPreferredPronunciationVoices(
      service.getAvailableVoices(),
      locale,
    );
    const selectedExists = matchingVoices.some((voice) => voice.name === preferredVoiceName);
    return Object.freeze({
      speed: preferences.speed,
      rate: PRONUNCIATION_SPEEDS[preferences.speed].rate,
      voiceName: selectedExists ? preferredVoiceName : matchingVoices[0]?.name ?? "automatic",
      locale,
      voices: Object.freeze(matchingVoices.map((voice) => Object.freeze({
        name: voice.name,
        lang: voice.lang,
        localService: voice.localService === true,
        displayName: formatPronunciationVoiceLabel(
          voice,
          config.languages.source.label || "Ausgangssprache",
        ),
      }))),
    });
  }

  function notifySettings() {
    const settings = getSettings();
    settingsSubscribers.forEach((subscriber) => subscriber(settings));
  }

  const unsubscribe = service.subscribe((state, event) => {
    updateButtons(state);
    if (event.type === "voices-updated") notifySettings();
    if (event.type === "requested") announce("Aussprache wird abgespielt.");
    else if (event.type === "ended") announce("Aussprache beendet.");
    else if (event.type === "stopped" && event.cause === "manual") {
      announce("Aussprache wurde gestoppt.");
    } else if (event.type === "error") announce("Aussprache ist nicht verfügbar.");
  });

  function createButton(documentRoot, buttonOptions = {}) {
    if (!canPronounce(buttonOptions.text, buttonOptions.role)) return null;
    const state = service.getState();
    return createPronunciationButton(documentRoot, {
      ...buttonOptions,
      active: buttonOptions.id === state.activeId && ACTIVE_STATUSES.has(state.status),
    });
  }

  function speak(request = {}) {
    const text = typeof request.text === "string" ? request.text.trim() : "";
    const locale = getSpeechLocale(config, request.role);
    if (!canPronounce(text, request.role)) {
      if (text.length > config.maxTextLength) {
        logger.error?.("Aussprachetext ist für den Vocabulary-Audio-Service zu lang.");
        announce("Dieser Text ist für die Aussprache zu lang.");
      }
      return { started: false, reason: service.isSupported() ? "invalid-config" : "unsupported" };
    }

    return service.speak({
      id: request.id,
      text,
      locale,
      rate: PRONUNCIATION_SPEEDS[preferences.speed].rate,
      pitch: config.pitch,
      volume: config.volume,
      voiceName: getPreferredVoiceName(),
      provider: PRONUNCIATION_PROVIDER,
    });
  }

  function handleClick(event) {
    const button = event.target?.closest?.("[data-pronunciation-action]");
    if (!button || !appRoot.contains(button) || button.disabled) return;
    event.preventDefault();
    speak({
      id: button.dataset.pronunciationId,
      text: button.dataset.pronunciationText,
      role: button.dataset.pronunciationRole,
    });
  }

  function stop(cause = "manual") {
    const result = service.stop(cause);
    if (cause === "route-change" || cause === "rerender") {
      if (liveRegion) liveRegion.textContent = "";
    }
    updateButtons();
    return result;
  }

  function beforeViewRender() {
    return stop("rerender");
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    appRoot.removeEventListener("click", handleClick);
    unsubscribe();
    settingsSubscribers.clear();
    service.destroy();
    if (liveRegion) liveRegion.textContent = "";
  }

  appRoot.addEventListener("click", handleClick);

  function persistPreferences(next) {
    const normalized = normalizePronunciationPreferences(next);
    const saved = options.savePreferences?.(normalized) ?? true;
    if (!saved) return false;
    preferences = normalized;
    notifySettings();
    return true;
  }

  function setSpeed(speed) {
    if (!Object.hasOwn(PRONUNCIATION_SPEEDS, speed)) return false;
    stop("settings-change");
    return persistPreferences({ ...preferences, speed });
  }

  function setVoiceName(voiceName) {
    const language = getPronunciationLanguageKey(getSourceLocale());
    if (!language) return false;
    const requested = String(voiceName ?? "automatic").trim();
    if (
      requested !== "automatic"
      && !getSettings().voices.some((voice) => voice.name === requested)
    ) return false;
    stop("settings-change");
    const voices = { ...preferences.voices };
    if (requested === "automatic") delete voices[language];
    else voices[language] = requested;
    return persistPreferences({ ...preferences, voices });
  }

  function subscribeSettings(subscriber) {
    if (typeof subscriber !== "function" || destroyed) return () => {};
    settingsSubscribers.add(subscriber);
    subscriber(getSettings());
    return () => settingsSubscribers.delete(subscriber);
  }

  return Object.freeze({
    beforeViewRender,
    canPronounce,
    createButton,
    destroy,
    getConfig: () => config,
    getSettings,
    getState: service.getState,
    setSpeed,
    setVoiceName,
    speak,
    stop,
    subscribeSettings,
  });
}
