import {
  isValidSpeechLocale,
  MAX_PRONUNCIATION_TEXT_LENGTH,
  PRONUNCIATION_PROVIDER,
} from "./pronunciation-config.js";
import {
  createPronunciationState,
  getPronunciationStateSnapshot,
  PRONUNCIATION_STATUSES,
  updatePronunciationState,
} from "./pronunciation-state.js";

const REQUEST_RANGES = Object.freeze({
  rate: [0.5, 1.5],
  pitch: [0.5, 1.5],
  volume: [0, 1],
});

function isValidNumber(value, [minimum, maximum]) {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum;
}

function normalizeLocale(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getLanguagePrefix(locale) {
  return normalizeLocale(locale).toLowerCase().split("-")[0];
}

function qualityScore(voice) {
  const label = `${voice?.name ?? ""} ${voice?.voiceURI ?? ""}`.toLowerCase();
  let score = 0;
  if (/\b(enhanced|premium|natural|neural|high quality|hq)\b/u.test(label)) score += 2;
  if (/\b(compact|basic|legacy)\b/u.test(label)) score -= 1;
  return score;
}

function stableVoiceLabel(voice) {
  return `${voice?.name ?? ""}\u0000${voice?.lang ?? ""}\u0000${voice?.voiceURI ?? ""}`;
}

const CURATED_FEMALE_VOICES = Object.freeze({
  "en-gb": Object.freeze(["Serena", "Kate", "Martha"]),
  "en-us": Object.freeze(["Ava", "Samantha", "Allison"]),
  "en-au": Object.freeze(["Karen", "Catherine"]),
  "en-ie": Object.freeze(["Moira"]),
  "en-za": Object.freeze(["Tessa"]),
});

function rankVoices(voices) {
  return [...voices].sort((left, right) => {
    const localDifference = Number(right?.localService === true) - Number(left?.localService === true);
    if (localDifference !== 0) return localDifference;
    const qualityDifference = qualityScore(right) - qualityScore(left);
    if (qualityDifference !== 0) return qualityDifference;
    const defaultDifference = Number(right?.default === true) - Number(left?.default === true);
    if (defaultDifference !== 0) return defaultDifference;
    return stableVoiceLabel(left).localeCompare(stableVoiceLabel(right));
  });
}

/** Returns installed voices matching an exact locale or at least its language. */
export function getMatchingPronunciationVoices(voices, locale) {
  const normalizedLocale = normalizeLocale(locale).toLowerCase();
  if (!normalizedLocale || !Array.isArray(voices)) return [];
  const prefix = getLanguagePrefix(normalizedLocale);
  const exact = voices.filter(
    (voice) => normalizeLocale(voice?.lang).toLowerCase() === normalizedLocale,
  );
  const language = voices.filter(
    (voice) => getLanguagePrefix(voice?.lang) === prefix
      && normalizeLocale(voice?.lang).toLowerCase() !== normalizedLocale,
  );
  return [...rankVoices(exact), ...rankVoices(language)];
}

function comparableVoiceName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase()
    .replace(/\b(?:enhanced|premium|compact|natural|neural|online|offline)\b/gu, "")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function baseVoiceName(value) {
  return String(value ?? "")
    .replace(/^(?:Google|Microsoft|Apple)\s+/iu, "")
    .replace(/\s+\([^)]*(?:\([^)]*\)[^)]*)?\)\s*$/u, "")
    .replace(/\s+(?:Online|Natural|Premium|Enhanced|Compact)$/iu, "")
    .trim();
}

function findNamedVoice(voices, name) {
  const comparable = comparableVoiceName(name);
  return rankVoices(voices).find((voice) => (
    comparableVoiceName(baseVoiceName(voice?.name)) === comparable
  )) ?? null;
}

function languageRegion(locale) {
  const region = normalizeLocale(locale).split("-")[1]?.toUpperCase();
  return ({
    US: "USA",
    GB: "Großbritannien",
    AU: "Australien",
    IE: "Irland",
    IN: "Indien",
    ZA: "Südafrika",
    CA: "Kanada",
    DE: "Deutschland",
    AT: "Österreich",
    CH: "Schweiz",
    FR: "Frankreich",
    ES: "Spanien",
    IT: "Italien",
  })[region] ?? region ?? "";
}

/** Provides a short, stable device-dependent voice choice without duplicates. */
export function getPreferredPronunciationVoices(
  voices,
  locale,
  _options = {},
) {
  const normalizedLocale = normalizeLocale(locale).toLowerCase();
  if (!normalizedLocale || !Array.isArray(voices)) return [];
  const exact = voices.filter((voice) => (
    normalizeLocale(voice?.lang).toLowerCase() === normalizedLocale
  ));
  const result = [];

  if (normalizedLocale === "en-gb") {
    const daniel = findNamedVoice(exact, "Daniel");
    if (daniel) result.push(daniel);
  }

  const femaleNames = CURATED_FEMALE_VOICES[normalizedLocale] ?? [];
  const female = femaleNames
    .map((name) => findNamedVoice(exact, name))
    .find(Boolean);
  if (female && !result.includes(female)) result.push(female);

  // For other languages, expose at most one locally installed voice whose
  // browser metadata explicitly marks a higher-quality variant. If no such
  // signal exists, the safe browser fallback remains available without
  // presenting an unverified list in the UI.
  if (result.length === 0 && !normalizedLocale.startsWith("en-")) {
    const qualityCandidate = rankVoices(exact).find((voice) => (
      voice?.localService === true && qualityScore(voice) >= 2
    ));
    if (qualityCandidate) result.push(qualityCandidate);
  }

  return result.slice(0, 2);
}

/** Formats voice choices for people instead of exposing technical locale labels. */
export function formatPronunciationVoiceLabel(voice, languageLabel = "Sprache") {
  const region = languageRegion(voice?.lang);
  const name = String(voice?.name ?? "Stimme")
    .replace(/^(?:Google|Microsoft|Apple)\s+/iu, "")
    .replace(/\s+(?:Online|Natural|Premium|Enhanced)$/iu, "")
    .replace(/\s+\((?:English|Englisch)(?:\s+\([^)]*\))?\)\s*$/iu, "")
    .trim() || "Stimme";
  return `${name} – ${languageLabel}${region ? ` (${region})` : ""}`;
}

/** Resolves the best installed voice without relying on product-specific names. */
export function selectPronunciationVoice(voices, locale, preferredVoiceName = "") {
  const approved = getPreferredPronunciationVoices(voices, locale);
  const preferred = typeof preferredVoiceName === "string"
    ? preferredVoiceName.trim()
    : "";
  if (preferred) {
    const selected = approved.find((voice) => voice?.name === preferred);
    if (selected) return selected;
  }
  // Leave `utterance.voice` unset when no curated voice is available. The
  // browser can then resolve its own safe default for the requested locale
  // instead of us explicitly forcing an installed but unverified voice.
  return approved[0] ?? null;
}

function validateRequest(request) {
  const text = typeof request?.text === "string" ? request.text.trim() : "";
  if (!text) return { ok: false, reason: "empty-text" };
  if (text.length > MAX_PRONUNCIATION_TEXT_LENGTH) {
    return { ok: false, reason: "invalid-config", detail: "text-too-long" };
  }

  if (
    typeof request?.id !== "string"
    || !request.id.trim()
    || !isValidSpeechLocale(request.locale)
    || (request.provider ?? PRONUNCIATION_PROVIDER) !== PRONUNCIATION_PROVIDER
    || !isValidNumber(request.rate, REQUEST_RANGES.rate)
    || !isValidNumber(request.pitch, REQUEST_RANGES.pitch)
    || !isValidNumber(request.volume, REQUEST_RANGES.volume)
  ) {
    return { ok: false, reason: "invalid-config" };
  }

  return {
    ok: true,
    request: {
      id: request.id.trim(),
      text,
      locale: normalizeLocale(request.locale),
      rate: request.rate,
      pitch: request.pitch,
      volume: request.volume,
      voiceName: typeof request.voiceName === "string" ? request.voiceName.trim() : "",
      provider: PRONUNCIATION_PROVIDER,
    },
  };
}

/** Creates one browser-independent Web Speech adapter for the app lifetime. */
export function createPronunciationService(options = {}) {
  const speechSynthesis = options.speechSynthesis !== undefined
    ? options.speechSynthesis
    : globalThis.speechSynthesis;
  const Utterance = options.SpeechSynthesisUtterance !== undefined
    ? options.SpeechSynthesisUtterance
    : globalThis.SpeechSynthesisUtterance;
  const logger = options.logger ?? console;
  const supported = Boolean(
    speechSynthesis
    && typeof speechSynthesis.speak === "function"
    && typeof speechSynthesis.cancel === "function"
    && typeof speechSynthesis.getVoices === "function"
    && typeof Utterance === "function"
  );
  const state = createPronunciationState(supported);
  const subscribers = new Set();

  let voices = [];
  let activeUtterance = null;
  let destroyed = false;
  let operationId = 0;
  let voicesListenerRegistered = false;

  function notify(type, detail = {}) {
    const snapshot = getPronunciationStateSnapshot(state);
    subscribers.forEach((subscriber) => {
      try {
        subscriber(snapshot, Object.freeze({ type, ...detail }));
      } catch (error) {
        logger.error?.("Aussprache-Subscriber ist fehlgeschlagen.", error);
      }
    });
  }

  function setState(patch, type, detail) {
    updatePronunciationState(state, patch);
    notify(type, detail);
  }

  function refreshVoices() {
    if (!supported || destroyed) return [];
    try {
      const nextVoices = speechSynthesis.getVoices();
      voices = Array.isArray(nextVoices) ? [...nextVoices] : [];
      updatePronunciationState(state, { voicesLoaded: voices.length > 0 });
      notify("voices-updated", { count: voices.length });
    } catch (error) {
      voices = [];
      updatePronunciationState(state, { voicesLoaded: false });
      logger.error?.("Browserstimmen konnten nicht gelesen werden.", error);
    }
    return [...voices];
  }

  function cancelCurrent(cause, notifyStop = true) {
    const stoppedId = state.activeId;
    operationId += 1;
    activeUtterance = null;
    try {
      speechSynthesis?.cancel?.();
    } catch (error) {
      logger.error?.("Laufende Aussprache konnte nicht sauber gestoppt werden.", error);
    }

    if (notifyStop && stoppedId) {
      setState({
        activeId: null,
        status: PRONUNCIATION_STATUSES.STOPPED,
        lastError: null,
      }, "stopped", { cause, id: stoppedId });
    } else if (stoppedId) {
      updatePronunciationState(state, {
        activeId: null,
        status: PRONUNCIATION_STATUSES.STOPPED,
        lastError: null,
      });
    }
    return stoppedId;
  }

  function stop(cause = "manual") {
    if (destroyed) return { stopped: false, reason: "destroyed" };
    if (!supported) return { stopped: false, reason: "unsupported" };
    if (!state.activeId) return { stopped: false, reason: "cancelled" };
    const id = cancelCurrent(cause, true);
    return { stopped: true, id };
  }

  function speak(rawRequest) {
    if (destroyed) return { started: false, reason: "destroyed" };
    if (!supported) return { started: false, reason: "unsupported" };

    const validation = validateRequest(rawRequest);
    if (!validation.ok) {
      if (validation.detail === "text-too-long") {
        logger.error?.("Aussprachetext überschreitet die maximale Länge von 200 Zeichen.");
      }
      return { started: false, reason: validation.reason };
    }

    const request = validation.request;
    if (state.activeId === request.id && isSpeaking()) {
      stop("manual");
      return { started: false, reason: "cancelled" };
    }

    if (state.activeId) cancelCurrent("replaced", false);
    const currentOperation = ++operationId;

    try {
      const utterance = new Utterance(request.text);
      utterance.lang = request.locale;
      utterance.rate = request.rate;
      utterance.pitch = request.pitch;
      utterance.volume = request.volume;

      if (voices.length === 0) refreshVoices();
      const voice = selectPronunciationVoice(voices, request.locale, request.voiceName);
      if (voice) utterance.voice = voice;

      utterance.onstart = () => {
        if (destroyed || currentOperation !== operationId) return;
        setState({
          activeId: request.id,
          status: PRONUNCIATION_STATUSES.SPEAKING,
          lastError: null,
        }, "started", { id: request.id });
      };
      utterance.onend = () => {
        if (destroyed || currentOperation !== operationId) return;
        activeUtterance = null;
        setState({
          activeId: null,
          status: PRONUNCIATION_STATUSES.IDLE,
          lastError: null,
        }, "ended", { id: request.id });
      };
      utterance.onerror = (event) => {
        if (destroyed || currentOperation !== operationId) return;
        activeUtterance = null;
        const errorName = event?.error ?? "speech-error";
        if (errorName === "canceled" || errorName === "interrupted") {
          setState({
            activeId: null,
            status: PRONUNCIATION_STATUSES.STOPPED,
            lastError: null,
          }, "stopped", { cause: "browser-cancelled", id: request.id });
          return;
        }
        logger.error?.("Browser meldet einen Fehler bei der Aussprache.", event);
        setState({
          activeId: null,
          status: PRONUNCIATION_STATUSES.ERROR,
          lastError: "speech-error",
        }, "error", { id: request.id, reason: "speech-error" });
      };

      activeUtterance = utterance;
      setState({
        activeId: request.id,
        status: PRONUNCIATION_STATUSES.LOADING,
        lastError: null,
      }, "requested", { id: request.id });
      speechSynthesis.speak(utterance);
      return {
        started: true,
        id: request.id,
        locale: request.locale,
        voiceName: voice?.name,
      };
    } catch (error) {
      activeUtterance = null;
      logger.error?.("Aussprache konnte nicht gestartet werden.", error);
      setState({
        activeId: null,
        status: PRONUNCIATION_STATUSES.ERROR,
        lastError: "speech-error",
      }, "error", { id: request.id, reason: "speech-error" });
      return { started: false, reason: "speech-error" };
    }
  }

  function isSupported() {
    return supported && !destroyed;
  }

  function isSpeaking() {
    return !destroyed && (
      state.status === PRONUNCIATION_STATUSES.LOADING
      || state.status === PRONUNCIATION_STATUSES.SPEAKING
    );
  }

  function getAvailableVoices() {
    return [...voices];
  }

  function getState() {
    return getPronunciationStateSnapshot(state);
  }

  function subscribe(subscriber) {
    if (typeof subscriber !== "function" || destroyed) return () => {};
    subscribers.add(subscriber);
    subscriber(getState(), Object.freeze({ type: "initialized" }));
    return () => subscribers.delete(subscriber);
  }

  function destroy() {
    if (destroyed) return { destroyed: false, reason: "destroyed" };
    if (state.activeId) cancelCurrent("destroyed", false);
    if (voicesListenerRegistered) {
      speechSynthesis.removeEventListener?.("voiceschanged", refreshVoices);
      voicesListenerRegistered = false;
    }
    destroyed = true;
    subscribers.clear();
    voices = [];
    activeUtterance = null;
    updatePronunciationState(state, {
      activeId: null,
      voicesLoaded: false,
      status: supported
        ? PRONUNCIATION_STATUSES.IDLE
        : PRONUNCIATION_STATUSES.UNSUPPORTED,
      lastError: null,
    });
    return { destroyed: true };
  }

  if (supported) {
    refreshVoices();
    if (typeof speechSynthesis.addEventListener === "function") {
      speechSynthesis.addEventListener("voiceschanged", refreshVoices);
      voicesListenerRegistered = true;
    }
  }

  return Object.freeze({
    destroy,
    getAvailableVoices,
    getState,
    isSpeaking,
    isSupported,
    refreshVoices,
    speak,
    stop,
    subscribe,
  });
}
