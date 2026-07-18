import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  DEFAULT_PRONUNCIATION_VALUES,
  getSpeechLocale,
  resolvePronunciationConfig,
} from "../src/audio/pronunciation-config.js";
import { createPronunciationController } from "../src/audio/pronunciation-controller.js";
import { isPronunciationAllowedForRole } from "../src/audio/pronunciation-policy.js";
import {
  createPronunciationService,
  formatPronunciationVoiceLabel,
  getMatchingPronunciationVoices,
  getPreferredPronunciationVoices,
  selectPronunciationVoice,
} from "../src/audio/pronunciation-service.js";
import {
  PRONUNCIATION_SPEEDS,
  normalizePronunciationPreferences,
} from "../src/audio/pronunciation-preferences.js";
import {
  createPronunciationButton,
  setPronunciationButtonState,
} from "../src/components/pronunciation-button.js";
import { createQuizState } from "../src/quiz/quiz-state.js";
import {
  FLASHCARD_DIRECTIONS,
  revealSessionSolution,
  createSessionState,
} from "../src/session/session-state.js";
import { createWritingState, WRITING_DIRECTIONS } from "../src/writing/writing-state.js";
import { renderMarkedView } from "../src/views/marked-view.js";
import { getQuizShortcut, renderQuizView } from "../src/views/quiz-view.js";
import { getSessionShortcut, renderSessionView } from "../src/views/session-view.js";
import { getWritingShortcut, renderWritingView } from "../src/views/writing-view.js";

const tests = [];

function test(name, callback) {
  tests.push({ name, callback });
}

function createLogger() {
  const messages = [];
  return {
    messages,
    error(...values) {
      messages.push(values);
    },
    warn(...values) {
      messages.push(values);
    },
  };
}

function createCourseConfig(overrides = {}) {
  return {
    languages: {
      source: { code: "en", label: "Englisch", speechLocale: "en-GB" },
      target: { code: "de", label: "Deutsch", speechLocale: "de-DE" },
    },
    pronunciation: {
      enabled: true,
      provider: "speech-synthesis",
      rate: 0.9,
      pitch: 1,
      volume: 1,
    },
    ...overrides,
  };
}

class FakeUtterance {
  constructor(text) {
    this.text = text;
    this.lang = "";
    this.rate = 1;
    this.pitch = 1;
    this.volume = 1;
    this.voice = null;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
  }
}

class FakeSpeechSynthesis {
  constructor(voices = []) {
    this.voices = [...voices];
    this.spoken = [];
    this.cancelCount = 0;
    this.listeners = new Map();
    this.addCount = 0;
    this.removeCount = 0;
  }

  speak(utterance) {
    this.spoken.push(utterance);
  }

  cancel() {
    this.cancelCount += 1;
  }

  getVoices() {
    return [...this.voices];
  }

  addEventListener(type, listener) {
    this.addCount += 1;
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) {
      this.listeners.delete(type);
      this.removeCount += 1;
    }
  }

  emit(type) {
    this.listeners.get(type)?.();
  }
}

function createService(voices = []) {
  const speechSynthesis = new FakeSpeechSynthesis(voices);
  const logger = createLogger();
  const service = createPronunciationService({
    speechSynthesis,
    SpeechSynthesisUtterance: FakeUtterance,
    logger,
  });
  return { logger, service, speechSynthesis };
}

function createRequest(overrides = {}) {
  return {
    id: "word-1-source",
    text: "island",
    locale: "en-GB",
    rate: 0.9,
    pitch: 1,
    volume: 1,
    provider: "speech-synthesis",
    ...overrides,
  };
}

class TestNode {
  constructor(tagName, ownerDocument, text = "") {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.className = "";
    this._text = text;
    this.disabled = false;
    this.type = "";
  }

  get textContent() {
    return this._text + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value) {
    this._text = String(value);
    this.children = [];
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  prepend(...nodes) {
    this.children.unshift(...nodes);
  }

  replaceChildren(...nodes) {
    this._text = "";
    this.children = [...nodes];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  closest(selector) {
    return selector === "[data-pronunciation-action]" && this.dataset.pronunciationAction
      ? this
      : null;
  }
}

class TestDocument {
  createElement(tagName) {
    return new TestNode(tagName, this);
  }

  createElementNS(_namespace, tagName) {
    return new TestNode(tagName, this);
  }

  createTextNode(text) {
    return new TestNode("#text", this, String(text));
  }
}

function createViewTargets() {
  const documentRoot = new TestDocument();
  return {
    container: documentRoot.createElement("div"),
    summaryElement: documentRoot.createElement("p"),
  };
}

function findNode(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children ?? []) {
    const match = findNode(child, predicate);
    if (match) return match;
  }
  return null;
}

function createPronunciationRecorder(allowedRoles = new Set(["source"])) {
  const calls = [];
  return {
    calls,
    createButton(documentRoot, options) {
      if (!options.text?.trim() || !allowedRoles.has(options.role)) return null;
      calls.push({ ...options });
      return createPronunciationButton(documentRoot, options);
    },
  };
}

class TestAppRoot {
  constructor(documentRoot = new TestDocument()) {
    this.ownerDocument = documentRoot;
    this.buttons = [];
    this.listeners = new Map();
    this.liveRegion = documentRoot.createElement("p");
  }

  querySelector(selector) {
    return selector === "[data-pronunciation-live]" ? this.liveRegion : null;
  }

  querySelectorAll(selector) {
    return selector === "[data-pronunciation-action]" ? this.buttons : [];
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  contains(node) {
    return this.buttons.includes(node);
  }

  click(button) {
    this.listeners.get("click")?.({
      target: button,
      preventDefault() {},
    });
  }
}

test("gültige Aussprachekonfiguration verwendet Kurs-Sprachfelder", () => {
  const config = resolvePronunciationConfig(createCourseConfig());
  assert.equal(config.enabled, true);
  assert.equal(getSpeechLocale(config, "source"), "en-GB");
  assert.equal(getSpeechLocale(config, "target"), "de-DE");
  assert.equal(config.rate, 0.9);
});

test("Vocabulary-Policy erlaubt ausschließlich die konfigurierte Source-Rolle", () => {
  const french = { code: "fr", speechLocale: "fr-FR" };
  const german = { code: "de", speechLocale: "de-DE" };
  assert.equal(isPronunciationAllowedForRole("source", french), true);
  assert.equal(isPronunciationAllowedForRole("target", french), false);
  assert.equal(isPronunciationAllowedForRole("source", german), true);
  assert.equal(isPronunciationAllowedForRole("target", german), false);
  assert.equal(isPronunciationAllowedForRole("source", {}), false);
  assert.equal(isPronunciationAllowedForRole("source", { code: "fr", speechLocale: "de-DE" }), false);
  assert.equal(isPronunciationAllowedForRole("unknown", french), false);
  assert.equal(isPronunciationAllowedForRole("source", null), false);
});

test("Aussprache-Policy bleibt zentral und der allgemeine Service sprachneutral", async () => {
  const viewFiles = ["session-view.js", "quiz-view.js", "writing-view.js", "marked-view.js"];
  for (const file of viewFiles) {
    const source = await readFile(new URL(`../src/views/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /pronunciation-policy|speechLocale\s*[!=]==?\s*["']de/i);
  }
  const service = await readFile(new URL("../src/audio/pronunciation-service.js", import.meta.url), "utf8");
  assert.doesNotMatch(service, /pronunciation-policy|\bde-(?:DE|AT|CH)\b/);
  const policy = await readFile(new URL("../src/audio/pronunciation-policy.js", import.meta.url), "utf8");
  assert.doesNotMatch(policy, /["'](?:de|en)(?:-[A-Z]{2})?["']/);
});

test("fehlende Aussprachekonfiguration ist sicher deaktiviert", () => {
  const config = resolvePronunciationConfig({ languages: createCourseConfig().languages });
  assert.equal(config.enabled, false);
  assert.deepEqual(
    [config.rate, config.pitch, config.volume],
    [DEFAULT_PRONUNCIATION_VALUES.rate, DEFAULT_PRONUNCIATION_VALUES.pitch, DEFAULT_PRONUNCIATION_VALUES.volume],
  );
});

test("explizit deaktivierte Aussprache bleibt deaktiviert", () => {
  const course = createCourseConfig();
  course.pronunciation.enabled = false;
  assert.equal(resolvePronunciationConfig(course).enabled, false);
});

test("ungültige Rate, Pitch und Lautstärke fallen protokolliert auf Standards zurück", () => {
  const logger = createLogger();
  const course = createCourseConfig();
  course.pronunciation = { ...course.pronunciation, rate: 2, pitch: 0.2, volume: -1 };
  const config = resolvePronunciationConfig(course, { logger });
  assert.deepEqual(
    [config.rate, config.pitch, config.volume],
    [DEFAULT_PRONUNCIATION_VALUES.rate, DEFAULT_PRONUNCIATION_VALUES.pitch, DEFAULT_PRONUNCIATION_VALUES.volume],
  );
  assert.equal(logger.messages.length, 3);
});

test("fehlende oder ungültige Locale deaktiviert nur die betroffene Sprachrolle", () => {
  const course = createCourseConfig();
  course.languages.target.speechLocale = "not a locale";
  const config = resolvePronunciationConfig(course, { logger: createLogger() });
  assert.equal(getSpeechLocale(config, "source"), "en-GB");
  assert.equal(getSpeechLocale(config, "target"), null);
});

test("Service erkennt vorhandene und fehlende Speech API", () => {
  const { service } = createService();
  assert.equal(service.isSupported(), true);
  assert.equal(createPronunciationService({
    speechSynthesis: null,
    SpeechSynthesisUtterance: FakeUtterance,
  }).isSupported(), false);
  assert.equal(createPronunciationService({
    speechSynthesis: new FakeSpeechSynthesis(),
    SpeechSynthesisUtterance: null,
  }).isSupported(), false);
});

test("gültiger Request setzt Text, Locale, Rate, Pitch, Volume und Stimme", () => {
  const voice = { name: "Daniel", lang: "en-GB", localService: true };
  const { service, speechSynthesis } = createService([voice]);
  const result = service.speak(createRequest());
  const utterance = speechSynthesis.spoken[0];
  assert.deepEqual(result, {
    started: true,
    id: "word-1-source",
    locale: "en-GB",
    voiceName: "Daniel",
  });
  assert.deepEqual(
    [utterance.text, utterance.lang, utterance.rate, utterance.pitch, utterance.volume, utterance.voice],
    ["island", "en-GB", 0.9, 1, 1, voice],
  );
});

test("leerer, zu langer und ungültig konfigurierter Text startet nicht", () => {
  const { service, speechSynthesis } = createService();
  assert.equal(service.speak(createRequest({ text: "  " })).reason, "empty-text");
  assert.equal(service.speak(createRequest({ text: "x".repeat(201) })).reason, "invalid-config");
  assert.equal(service.speak(createRequest({ rate: 4 })).reason, "invalid-config");
  assert.equal(service.speak(createRequest({ locale: "wrong locale" })).reason, "invalid-config");
  assert.equal(speechSynthesis.spoken.length, 0);
});

test("Status wechselt von loading über speaking zu idle", () => {
  const { service, speechSynthesis } = createService();
  service.speak(createRequest());
  assert.equal(service.getState().status, "loading");
  assert.equal(service.isSpeaking(), true);
  speechSynthesis.spoken[0].onstart();
  assert.equal(service.getState().status, "speaking");
  speechSynthesis.spoken[0].onend();
  assert.equal(service.getState().status, "idle");
  assert.equal(service.getState().activeId, null);
});

test("Browserfehler wird kontrolliert als error gespeichert", () => {
  const { service, speechSynthesis } = createService();
  service.speak(createRequest());
  speechSynthesis.spoken[0].onerror({ error: "synthesis-failed" });
  assert.equal(service.getState().status, "error");
  assert.equal(service.getState().lastError, "speech-error");
});

test("zweiter Klick auf denselben Eintrag stoppt die Aussprache", () => {
  const { service, speechSynthesis } = createService();
  service.speak(createRequest());
  const result = service.speak(createRequest());
  assert.equal(result.reason, "cancelled");
  assert.equal(service.getState().status, "stopped");
  assert.equal(speechSynthesis.cancelCount, 1);
});

test("anderer Eintrag ersetzt die laufende Wiedergabe ohne parallele Queue", () => {
  const { service, speechSynthesis } = createService();
  service.speak(createRequest());
  service.speak(createRequest({ id: "word-2-target", text: "Insel", locale: "de-DE" }));
  assert.equal(speechSynthesis.cancelCount, 1);
  assert.equal(speechSynthesis.spoken.length, 2);
  assert.equal(service.getState().activeId, "word-2-target");
});

test("manuelles Stoppen bildet auch einen Routenwechsel sicher ab", () => {
  const { service, speechSynthesis } = createService();
  service.speak(createRequest());
  const result = service.stop("route-change");
  assert.equal(result.stopped, true);
  assert.equal(service.getState().activeId, null);
  assert.equal(service.getState().status, "stopped");
  assert.equal(speechSynthesis.cancelCount, 1);
});

test("exakte Stimme wird vor Präfixstimme gewählt", () => {
  const exact = { name: "Daniel", lang: "en-GB" };
  const prefix = { name: "Prefix", lang: "en-US", localService: true };
  assert.equal(selectPronunciationVoice([prefix, exact], "en-GB"), exact);
});

test("Locale, Sprache, lokale Qualität und stabile Sortierung bestimmen die automatische Stimme", () => {
  const voices = [
    { name: "B Remote", lang: "en-GB", localService: false },
    { name: "A Local Basic", lang: "en-GB", localService: true },
    { name: "C Local Premium", lang: "en-GB", localService: true },
    { name: "D Local", lang: "en-US", localService: true },
    { name: "Deutsch", lang: "de-DE", localService: true },
  ];
  assert.deepEqual(
    getMatchingPronunciationVoices(voices, "en-GB").map((voice) => voice.name),
    ["C Local Premium", "A Local Basic", "B Remote", "D Local"],
  );
  assert.equal(selectPronunciationVoice(voices, "en-GB", "B Remote"), null);
  assert.equal(getMatchingPronunciationVoices(voices, "en-GB").some((voice) => voice.lang === "de-DE"), false);
});

test("ohne geprüfte Stimme bleibt der sichere Browserfallback aktiv", () => {
  const first = { name: "First", lang: "de-AT" };
  const standard = { name: "Default", lang: "de-CH", default: true };
  const local = { name: "Local", lang: "de-DE", localService: true };
  assert.equal(selectPronunciationVoice([first, standard, local], "de-LU"), null);
  assert.equal(selectPronunciationVoice([first, standard], "de-LU"), null);
  assert.equal(selectPronunciationVoice([first], "de-LU"), null);
  assert.equal(selectPronunciationVoice([], "de-DE"), null);
});

test("Stimmenauswahl zeigt Daniel und höchstens eine geprüfte weibliche Alternative", () => {
  const voices = [
    { name: "Daniel (Englisch (Vereinigtes Königreich))", lang: "en-GB", localService: true },
    { name: "Eddy (Englisch (Vereinigtes Königreich))", lang: "en-GB", localService: true },
    { name: "Flo (Englisch (Vereinigtes Königreich))", lang: "en-GB", localService: true },
    { name: "Grandma (Englisch (Vereinigtes Königreich))", lang: "en-GB", localService: true },
    { name: "Serena (Englisch (Vereinigtes Königreich))", lang: "en-GB", localService: true },
    { name: "Samantha", lang: "en-US", localService: true },
  ];
  const preferred = getPreferredPronunciationVoices(voices, "en-GB");
  assert.deepEqual(preferred.map((voice) => voice.name), [
    "Daniel (Englisch (Vereinigtes Königreich))",
    "Serena (Englisch (Vereinigtes Königreich))",
  ]);
  assert.equal(preferred.length <= 2, true);
  assert.equal(preferred.some((voice) => /Eddy|Flo|Grandma/u.test(voice.name)), false);
  assert.equal(formatPronunciationVoiceLabel({ name: "Samantha", lang: "en-US" }, "Englisch"), "Samantha – Englisch (USA)");
  assert.equal(
    formatPronunciationVoiceLabel(
      { name: "Eddy (Englisch (Vereinigtes Königreich))", lang: "en-GB" },
      "Englisch",
    ),
    "Eddy – Englisch (Großbritannien)",
  );
  assert.equal(preferred.every((voice) => voice.lang === "en-GB"), true);
});

test("ohne weibliche Alternative bleibt ausschließlich Daniel sichtbar", () => {
  const daniel = { name: "Daniel", lang: "en-GB", localService: true };
  const voices = [daniel, { name: "Eddy", lang: "en-GB", localService: true }];
  assert.deepEqual(getPreferredPronunciationVoices(voices, "en-GB"), [daniel]);
});

test("ohne Daniel darf eine tatsächlich verfügbare geprüfte Alternative verwendet werden", () => {
  const serena = { name: "Serena", lang: "en-GB", localService: true };
  assert.deepEqual(getPreferredPronunciationVoices([serena], "en-GB"), [serena]);
  assert.equal(selectPronunciationVoice([serena], "en-GB"), serena);
});

test("falsche Locale und ungeprüfte Frauenstimmen werden nicht angeboten", () => {
  const voices = [
    { name: "Daniel", lang: "en-US", localService: true },
    { name: "Serena", lang: "en-US", localService: true },
    { name: "Ungeprüft", lang: "en-GB", localService: true },
  ];
  assert.deepEqual(getPreferredPronunciationVoices(voices, "en-GB"), []);
});

test("verzögertes voiceschanged aktualisiert Stimmen mit genau einem Listener", () => {
  const { service, speechSynthesis } = createService();
  assert.equal(service.getAvailableVoices().length, 0);
  assert.equal(service.getState().voicesLoaded, false);
  assert.equal(speechSynthesis.addCount, 1);
  speechSynthesis.voices = [{ name: "Late", lang: "en-GB" }];
  speechSynthesis.emit("voiceschanged");
  assert.equal(service.getAvailableVoices()[0].name, "Late");
  assert.equal(service.getState().voicesLoaded, true);
  assert.equal(speechSynthesis.addCount, 1);
});

test("Rate-Presets und beschädigte Aussprachepräferenzen fallen sicher zurück", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(PRONUNCIATION_SPEEDS).map(([key, value]) => [key, value.rate])),
    { slow: 0.8, normal: 0.9, fast: 1.05 },
  );
  assert.deepEqual(normalizePronunciationPreferences({ speed: "zu-schnell", voices: [] }), {
    schemaVersion: 1,
    speed: "normal",
    voices: {},
  });
});

test("Destroy stoppt, entfernt Listener und blockiert weitere Starts", () => {
  const { service, speechSynthesis } = createService();
  service.speak(createRequest());
  assert.equal(service.destroy().destroyed, true);
  assert.equal(speechSynthesis.cancelCount, 1);
  assert.equal(speechSynthesis.removeCount, 1);
  assert.equal(service.speak(createRequest()).reason, "destroyed");
  assert.equal(service.destroy().reason, "destroyed");
});

test("Pronunciation Button ist nativ, beschriftet und im Startzustand", () => {
  const documentRoot = new TestDocument();
  const button = createPronunciationButton(documentRoot, {
    id: "word-1-source",
    text: "island",
    role: "source",
  });
  assert.equal(button.tagName, "BUTTON");
  assert.equal(button.type, "button");
  assert.equal(button.getAttribute("aria-label"), "Aussprache von „island“ abspielen");
  assert.equal(button.getAttribute("aria-pressed"), "false");
  assert.equal(button.dataset.pronunciationRole, "source");
});

test("Button zeigt aktiven, Stopp- und deaktivierten Zustand zugänglich", () => {
  const button = createPronunciationButton(new TestDocument(), {
    id: "word-1-source",
    text: "island",
    role: "source",
  });
  setPronunciationButtonState(button, { text: "island", active: true });
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.match(button.getAttribute("aria-label"), /stoppen$/);
  setPronunciationButtonState(button, { text: "island", active: false, disabled: true });
  assert.equal(button.getAttribute("aria-pressed"), "false");
  assert.equal(button.disabled, true);
});

test("Controller zeigt Buttons nur bei aktivierter Funktion, Text und gültiger Rollen-Locale", () => {
  const supported = createService();
  const root = new TestAppRoot();
  const controller = createPronunciationController({
    appRoot: root,
    courseConfig: createCourseConfig(),
    service: supported.service,
    logger: createLogger(),
  });
  assert.equal(controller.createButton(root.ownerDocument, {
    id: "source",
    text: "island",
    role: "source",
  })?.tagName, "BUTTON");
  assert.equal(controller.createButton(root.ownerDocument, {
    id: "target-german",
    text: "Insel",
    role: "target",
  }), null);
  assert.equal(controller.createButton(root.ownerDocument, {
    id: "empty",
    text: " ",
    role: "source",
  }), null);
  controller.destroy();

  const missingLocaleCourse = createCourseConfig();
  delete missingLocaleCourse.languages.target.speechLocale;
  const missingLocaleService = createService();
  const missingLocaleController = createPronunciationController({
    appRoot: new TestAppRoot(),
    courseConfig: missingLocaleCourse,
    service: missingLocaleService.service,
    logger: createLogger(),
  });
  assert.equal(missingLocaleController.createButton(root.ownerDocument, {
    id: "target",
    text: "Insel",
    role: "target",
  }), null);
  missingLocaleController.destroy();

  const disabledCourse = createCourseConfig();
  disabledCourse.pronunciation.enabled = false;
  const disabledService = createService();
  const disabledController = createPronunciationController({
    appRoot: new TestAppRoot(),
    courseConfig: disabledCourse,
    service: disabledService.service,
  });
  assert.equal(disabledController.createButton(root.ownerDocument, {
    id: "disabled",
    text: "island",
    role: "source",
  }), null);
  disabledController.destroy();
});

test("Deutsch als Source erhält Aussprache, Englisch als Target nicht", () => {
  const root = new TestAppRoot();
  const supported = createService();
  const controller = createPronunciationController({
    appRoot: root,
    courseConfig: createCourseConfig({
      languages: {
        source: { code: "de", label: "Deutsch", speechLocale: "de-DE" },
        target: { code: "en", label: "Englisch", speechLocale: "en-GB" },
      },
    }),
    service: supported.service,
    logger: createLogger(),
  });
  assert.equal(controller.createButton(root.ownerDocument, {
    id: "source-german",
    text: "Wolke",
    role: "source",
  })?.tagName, "BUTTON");
  assert.equal(controller.createButton(root.ownerDocument, {
    id: "target-english",
    text: "cloud",
    role: "target",
  }), null);
  controller.destroy();
});

test("Französisches Scaffolding übernimmt den Source-Sprachcode in beiden Kartenrichtungen", () => {
  const { container } = createViewTargets();
  const session = createSessionState({
    wordIds: ["word-fr"],
    direction: FLASHCARD_DIRECTIONS.TARGET_TO_SOURCE,
  });
  const snapshot = {
    session,
    currentWord: {
      id: "word-fr",
      source: "nuageux",
      targets: ["bewölkt"],
      hint: "Quand le ciel est couvert de nuages.",
      example: "Le matin est nuageux.",
      unitId: "unit-fr",
    },
    transitioning: false,
    error: null,
    learningState: { words: {} },
  };
  const options = {
    getUnitTitle: () => "Unité 1",
    idPrefix: "course-neutral",
    modeLabel: "Lernen",
    pronunciation: createPronunciationRecorder(),
    languageCodes: { source: "fr", target: "de" },
  };

  renderSessionView(container, snapshot, options);
  const targetPrompt = findNode(container, (node) => (
    node.tagName === "H2" && node.textContent === "bewölkt"
  ));
  const hint = findNode(container, (node) => node.textContent === snapshot.currentWord.hint);
  assert.equal(targetPrompt?.getAttribute("lang"), "de");
  assert.equal(hint?.getAttribute("lang"), "fr");

  revealSessionSolution(session);
  renderSessionView(container, snapshot, options);
  const sourceSolution = findNode(container, (node) => (
    node.tagName === "P" && node.textContent === "nuageux"
  ));
  const example = findNode(container, (node) => node.textContent === snapshot.currentWord.example);
  assert.equal(sourceSolution?.getAttribute("lang"), "fr");
  assert.equal(example?.getAttribute("lang"), "fr");
});

test("Controller-Klick startet zentral und zweiter Klick stoppt denselben Button", () => {
  const { service, speechSynthesis } = createService();
  const root = new TestAppRoot();
  const controller = createPronunciationController({
    appRoot: root,
    courseConfig: createCourseConfig(),
    service,
  });
  const button = controller.createButton(root.ownerDocument, {
    id: "word-1-source",
    text: "island",
    role: "source",
  });
  root.buttons.push(button);
  root.click(button);
  assert.equal(speechSynthesis.spoken.length, 1);
  assert.equal(button.getAttribute("aria-pressed"), "true");
  root.click(button);
  assert.equal(speechSynthesis.cancelCount, 1);
  assert.equal(button.getAttribute("aria-pressed"), "false");
  controller.destroy();
});

test("Controller speichert Tempo und Source-Stimme und nutzt sie bei der Ausgabe", () => {
  const sourceVoice = { name: "Daniel", lang: "en-GB", localService: true };
  const targetVoice = { name: "Lokale deutsche Stimme", lang: "de-DE", localService: true };
  const { service, speechSynthesis } = createService([targetVoice, sourceVoice]);
  const saved = [];
  const controller = createPronunciationController({
    appRoot: new TestAppRoot(),
    courseConfig: createCourseConfig(),
    service,
    preferences: { speed: "normal", voices: {} },
    savePreferences(value) { saved.push(value); return true; },
  });

  assert.deepEqual(controller.getSettings().voices.map((voice) => voice.name), ["Daniel"]);
  assert.equal(controller.setSpeed("slow"), true);
  assert.equal(controller.setVoiceName("Daniel"), true);
  assert.equal(saved.length, 2);
  controller.speak({ id: "settings-source", text: "thoughtful", role: "source" });
  assert.equal(speechSynthesis.spoken.at(-1).rate, 0.8);
  assert.equal(speechSynthesis.spoken.at(-1).voice, sourceVoice);
  controller.destroy();
});

test("nicht mehr vorhandene gespeicherte Stimme fällt sichtbar und funktional auf Daniel zurück", () => {
  const daniel = { name: "Daniel", lang: "en-GB", localService: true };
  const { service, speechSynthesis } = createService([daniel]);
  const controller = createPronunciationController({
    appRoot: new TestAppRoot(),
    courseConfig: createCourseConfig(),
    service,
    preferences: { speed: "fast", voices: { en: "Missing" } },
  });
  assert.equal(controller.getSettings().voiceName, "Daniel");
  controller.speak({ id: "fallback-source", text: "island", role: "source" });
  assert.equal(speechSynthesis.spoken[0].voice, daniel);
  assert.equal(speechSynthesis.spoken[0].rate, 1.05);
  controller.destroy();
});

test("Einstellungen sind native Controls und Audioquellen bleiben ohne Netzwerkdienst", async () => {
  const [html, serviceSource, preferencesSource] = await Promise.all([
    readFile(new URL("../src/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/audio/pronunciation-service.js", import.meta.url), "utf8"),
    readFile(new URL("../src/audio/pronunciation-preferences.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /<h2[^>]*>Aussprache<\/h2>/);
  assert.match(html, /<legend>Sprechgeschwindigkeit<\/legend>/);
  assert.equal((html.match(/<input[^>]+data-pronunciation-speed/g) ?? []).length, 3);
  assert.match(html, /<select id="pronunciation-voice"[^>]+data-pronunciation-voice/);
  assert.doesNotMatch(`${serviceSource}\n${preferencesSource}`, /https?:\/\/|fetch\(|XMLHttpRequest|WebSocket/);
});

test("Controller kündigt Start, Ende, manuellen Stopp und Fehler ruhig an", async () => {
  const { service, speechSynthesis } = createService();
  const root = new TestAppRoot();
  const controller = createPronunciationController({
    appRoot: root,
    courseConfig: createCourseConfig(),
    service,
  });
  const button = controller.createButton(root.ownerDocument, {
    id: "word-1-source",
    text: "island",
    role: "source",
  });
  root.buttons.push(button);

  root.click(button);
  await Promise.resolve();
  assert.equal(root.liveRegion.textContent, "Aussprache wird abgespielt.");
  speechSynthesis.spoken[0].onend();
  await Promise.resolve();
  assert.equal(root.liveRegion.textContent, "Aussprache beendet.");

  root.click(button);
  controller.stop("manual");
  await Promise.resolve();
  assert.equal(root.liveRegion.textContent, "Aussprache wurde gestoppt.");

  root.click(button);
  speechSynthesis.spoken[2].onerror({ error: "synthesis-failed" });
  await Promise.resolve();
  assert.equal(root.liveRegion.textContent, "Aussprache ist nicht verfügbar.");
  controller.destroy();
});

test("fokussierter Audio-Button löst keine Flashcard-, Quiz- oder Schreibshortcuts aus", () => {
  const buttonTarget = { tagName: "BUTTON", closest: () => null };
  const session = createSessionState({ mode: "daily", wordIds: ["word-1"] });
  const quiz = createQuizState({ questions: [{
    wordId: "word-1",
    direction: "source-to-target",
    prompt: "island",
    correctAnswers: ["Insel"],
    correctOption: "Insel",
    options: ["Insel", "Burg"],
  }] });
  const writing = createWritingState({ prompts: [{
    wordId: "word-1",
    direction: WRITING_DIRECTIONS.SOURCE_TO_TARGET,
    prompt: "island",
    acceptedAnswers: ["Insel"],
  }] });
  const event = { key: "Enter", target: buttonTarget };
  assert.equal(getSessionShortcut(event, { session, transitioning: false }), null);
  assert.equal(getQuizShortcut(event, { quiz, transitioning: false }), null);
  assert.equal(getWritingShortcut(event, { writing, transitioning: false }), null);
});

test("Flashcard bietet vor Aufdecken nur Source-Aussprache", () => {
  const { container } = createViewTargets();
  const pronunciation = createPronunciationRecorder();
  const session = createSessionState({ mode: "daily", wordIds: ["word-1"] });
  renderSessionView(container, {
    session,
    currentWord: { id: "word-1", source: "castle", targets: ["Burg", "Schloss"], unitId: "unit-1" },
    transitioning: false,
    error: null,
  }, {
    getUnitTitle: () => "Unit 1",
    idPrefix: "test",
    modeLabel: "Lernen",
    pronunciation,
  });
  assert.deepEqual(pronunciation.calls.map(({ role, text }) => [role, text]), [["source", "castle"]]);
});

test("englische Hinweise und Beispiele bleiben Text und sind sprachlich ausgezeichnet", () => {
  const { container } = createViewTargets();
  const session = createSessionState({ mode: "daily", wordIds: ["word-1"] });
  revealSessionSolution(session);
  const hintText = '<script>alert("test")</script>';
  const exampleText = "The castle is old.";
  renderSessionView(container, {
    session,
    currentWord: {
      id: "word-1",
      source: "castle",
      targets: ["Burg"],
      hint: hintText,
      example: exampleText,
      unitId: "unit-1",
    },
    transitioning: false,
    error: null,
    learningState: { words: {} },
  }, {
    getUnitTitle: () => "Unit 1",
    idPrefix: "test",
    modeLabel: "Lernen",
    pronunciation: createPronunciationRecorder(),
    languageCodes: { source: "en", target: "de" },
  });
  const hint = findNode(container, (node) => node.textContent === hintText);
  const example = findNode(container, (node) => node.textContent === exampleText);
  assert.equal(hint?.getAttribute("lang"), "en");
  assert.equal(example?.getAttribute("lang"), "en");
  assert.equal(findNode(container, (node) => node.tagName === "SCRIPT"), null);
});

test("Flashcard bietet nach Aufdecken ausschließlich englische Source-Aussprache", () => {
  const { container } = createViewTargets();
  const pronunciation = createPronunciationRecorder();
  const session = createSessionState({ mode: "daily", wordIds: ["word-1"] });
  revealSessionSolution(session);
  renderSessionView(container, {
    session,
    currentWord: { id: "word-1", source: "castle", targets: ["Burg", "Schloss"], unitId: "unit-1" },
    transitioning: false,
    error: null,
    learningState: { words: {} },
  }, {
    getUnitTitle: () => "Unit 1",
    idPrefix: "test",
    modeLabel: "Lernen",
    pronunciation,
  });
  assert.deepEqual(pronunciation.calls.map(({ role, text }) => [role, text]), [["source", "castle"]]);
});

test("Target → Source verrät die englische Lösung nicht per Audio", () => {
  const { container } = createViewTargets();
  const pronunciation = createPronunciationRecorder();
  const session = createSessionState({
    wordIds: ["word-1"],
    direction: FLASHCARD_DIRECTIONS.TARGET_TO_SOURCE,
  });
  const snapshot = {
    session,
    currentWord: {
      id: "word-1",
      source: "cloudy",
      targets: ["bewölkt", "wolkig"],
      unitId: "unit-1",
    },
    transitioning: false,
    error: null,
    learningState: { words: {} },
  };
  const options = {
    getUnitTitle: () => "Unit 1",
    idPrefix: "target-audio",
    modeLabel: "Lernen",
    pronunciation,
    languageCodes: { source: "en", target: "de" },
  };

  renderSessionView(container, snapshot, options);
  assert.deepEqual(pronunciation.calls, []);
  revealSessionSolution(session);
  renderSessionView(container, snapshot, options);
  assert.deepEqual(pronunciation.calls.map(({ role, text }) => [role, text]), [["source", "cloudy"]]);
});

function createQuizSnapshot(answerSubmitted) {
  const question = {
    wordId: "word-1",
    direction: "source-to-target",
    prompt: "castle",
    phonetic: "/ˈkɑːsəl/",
    correctAnswers: ["Burg", "Schloss"],
    correctOption: "Burg / Schloss",
    options: ["Burg / Schloss", "Insel"],
  };
  const quiz = createQuizState({ questions: [question] });
  if (answerSubmitted) {
    quiz.selectedAnswer = "Burg / Schloss";
    quiz.answerSubmitted = true;
    quiz.results.push({ wordId: "word-1", selectedAnswer: "Burg / Schloss", isCorrect: true });
  }
  return {
    quiz,
    currentWord: { id: "word-1", source: "castle", targets: ["Burg", "Schloss"] },
    transitioning: false,
    error: null,
  };
}

test("Quiz verrät vor Auswertung keine Antwortoption akustisch", () => {
  const targets = createViewTargets();
  const pronunciation = createPronunciationRecorder();
  renderQuizView({
    ...targets,
    snapshot: createQuizSnapshot(false),
    sourceOptions: [{ value: "current-unit", label: "Aktuelle Unit", words: [{}] }],
    pronunciation,
  });
  assert.deepEqual(pronunciation.calls.map(({ role, text }) => [role, text]), [["source", "castle"]]);
});

test("Quiz bietet nach Auswertung keine Aussprache für deutsche Lösungen an", () => {
  const targets = createViewTargets();
  const pronunciation = createPronunciationRecorder();
  renderQuizView({
    ...targets,
    snapshot: createQuizSnapshot(true),
    sourceOptions: [{ value: "current-unit", label: "Aktuelle Unit", words: [{}] }],
    pronunciation,
  });
  assert.deepEqual(pronunciation.calls.map(({ role, text }) => [role, text]), [["source", "castle"]]);
});

test("Quiz bietet bei deutscher Vorgabe erst nach Auswertung die englische Lösung an", () => {
  const targets = createViewTargets();
  const pronunciation = createPronunciationRecorder();
  const quiz = createQuizState({ questions: [{
    wordId: "word-1",
    direction: "target-to-source",
    prompt: "Burg",
    correctAnswers: ["castle"],
    correctOption: "castle",
    options: ["castle", "island"],
  }] });
  const snapshot = {
    quiz,
    currentWord: { id: "word-1", source: "castle", targets: ["Burg"] },
    transitioning: false,
    error: null,
  };
  renderQuizView({
    ...targets,
    snapshot,
    sourceOptions: [{ value: "current-unit", label: "Aktuelle Unit", words: [{}] }],
    pronunciation,
  });
  assert.deepEqual(pronunciation.calls, []);

  quiz.selectedAnswer = "castle";
  quiz.answerSubmitted = true;
  quiz.results.push({ wordId: "word-1", selectedAnswer: "castle", isCorrect: true });
  renderQuizView({
    ...targets,
    snapshot,
    sourceOptions: [{ value: "current-unit", label: "Aktuelle Unit", words: [{}] }],
    pronunciation,
  });
  assert.deepEqual(pronunciation.calls.map(({ role, text }) => [role, text]), [["source", "castle"]]);
});

function createWritingSnapshot(answerSubmitted) {
  const writing = createWritingState({ prompts: [{
    wordId: "word-1",
    direction: WRITING_DIRECTIONS.TARGET_TO_SOURCE,
    prompt: "Insel",
    acceptedAnswers: ["island"],
    phonetic: "",
    hasHint: false,
  }] });
  if (answerSubmitted) {
    writing.userAnswer = "island";
    writing.answerSubmitted = true;
    writing.result = {
      wordId: "word-1",
      userAnswer: "island",
      acceptedAnswers: ["island"],
      isCorrect: true,
    };
    writing.results.push(writing.result);
  }
  return {
    writing,
    currentWord: { id: "word-1", source: "island", targets: ["Insel"] },
    transitioning: false,
    error: null,
  };
}

test("Schreibtraining bietet für die deutsche Vorgabe keine Aussprache an", () => {
  const targets = createViewTargets();
  const pronunciation = createPronunciationRecorder();
  renderWritingView({
    ...targets,
    snapshot: createWritingSnapshot(false),
    sourceOptions: [{ value: "current-unit", label: "Aktuelle Unit", words: [{}] }],
    pronunciation,
  });
  assert.deepEqual(pronunciation.calls, []);
});

test("Schreibtraining bietet nach Auswertung ausschließlich die englische Lösung an", () => {
  const targets = createViewTargets();
  const pronunciation = createPronunciationRecorder();
  renderWritingView({
    ...targets,
    snapshot: createWritingSnapshot(true),
    sourceOptions: [{ value: "current-unit", label: "Aktuelle Unit", words: [{}] }],
    pronunciation,
  });
  assert.deepEqual(pronunciation.calls.map(({ role, text }) => [role, text]), [["source", "island"]]);
});

test("gemerkte Wortliste bietet ausschließlich die englische Source-Aussprache an", () => {
  const targets = createViewTargets();
  const pronunciation = createPronunciationRecorder();
  renderMarkedView({
    ...targets,
    getUnitTitle: () => "Unit 1",
    markedWords: [{ id: "word-1", source: "castle", targets: ["Burg", "Schloss"], unitId: "unit-1" }],
    sessionSnapshot: { session: null, error: null },
    pronunciation,
  });
  assert.deepEqual(pronunciation.calls.map(({ id, role, text }) => [id, role, text]), [
    ["marked-word-1-source", "source", "castle"],
  ]);
});

let failures = 0;

for (const { name, callback } of tests) {
  try {
    await callback();
    console.log(`✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`✗ ${name}`);
    console.error(error);
  }
}

console.log(`\n${tests.length - failures}/${tests.length} Aussprache-Tests bestanden.`);
if (failures > 0) process.exitCode = 1;
