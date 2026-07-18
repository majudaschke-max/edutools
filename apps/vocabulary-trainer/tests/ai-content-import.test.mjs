import assert from "node:assert/strict";

import {
  AI_CONTENT_ADAPTER_ID,
  AI_CONTENT_INPUT_KIND,
  createAiContentAdapter,
} from "../src/import/adapters/ai-content-adapter.js";
import { importOrchestrator } from "../src/import/import-pipeline.js";

const tests = [];
function test(name, callback) { tests.push({ name, callback }); }

function sequence(prefix = "ai") {
  let index = 0;
  return () => `${prefix}-${++index}`;
}

function semanticResponse(overrides = {}) {
  return {
    format: "edutools-vocabulary-content",
    version: 1,
    units: [{
      title: "Unit 6",
      words: [{
        source: "advantage",
        targets: ["Vorteil"],
        phonetic: "/ədˈvɑːntɪdʒ/",
        hint: "Something that helps you.",
        example: "One advantage is the short journey.",
        tags: ["noun"],
      }],
    }],
    ...overrides,
  };
}

function currentPromptResponse() {
  return {
    schemaVersion: 1,
    id: "external-course-id",
    appType: "vocabulary",
    contentVersion: 92,
    sourceType: "bundled",
    editable: false,
    title: "Nicht vertrauenswürdiger KI-Titel",
    createdAt: "2000-01-01T00:00:00.000Z",
    languages: {
      source: { code: "fr", label: "Französisch", speechLocale: "fr-FR" },
      target: { code: "la", label: "Latein", speechLocale: "la" },
    },
    units: [{
      id: "external-unit-id",
      title: "Unit 6",
      description: "technisches Feld",
      order: 7,
      released: false,
      current: false,
      archived: true,
      words: [{
        id: "external-word-id",
        source: "advantage",
        targets: ["Vorteil"],
        phonetic: "/ədˈvɑːntɪdʒ/",
        hint: "Something that helps you.",
        example: "One advantage is the short journey.",
        tags: ["noun"],
        archived: true,
      }],
    }],
  };
}

function prepare(text, context = {}) {
  return importOrchestrator.prepareImport({
    adapterId: AI_CONTENT_ADAPTER_ID,
    input: { kind: AI_CONTENT_INPUT_KIND, text },
    context: {
      courseName: "Neutraler Kurs – Lernpaket 6",
      sourceLanguage: "en",
      targetLanguage: "de",
      ...context,
    },
  });
}

test("KI-Adapter ist über den unveränderten zentralen Orchestrator registriert", () => {
  const registered = importOrchestrator.getRegisteredAdapters();
  assert.ok(registered.some((adapter) => adapter.id === AI_CONTENT_ADAPTER_ID));
  assert.equal(createAiContentAdapter().canHandle({ kind: AI_CONTENT_INPUT_KIND, text: "{}" }), true);
});

test("Aktuelle Prompt-v1-Kursantwort wird auf reine Fachinhalte reduziert", () => {
  const session = prepare(JSON.stringify(currentPromptResponse()));
  assert.equal(session.valid, true);
  assert.equal(session.payload.sourceKind, "ai");
  assert.deepEqual(session.payload.course, {
    title: "Neutraler Kurs – Lernpaket 6",
    description: "",
    sourceLanguage: "en",
    targetLanguage: "de",
  });
  assert.deepEqual(session.payload.units, [{
    title: "Unit 6",
    words: [{
      source: "advantage",
      targets: ["Vorteil"],
      phonetic: "/ədˈvɑːntɪdʒ/",
      hint: "Something that helps you.",
      example: "One advantage is the short journey.",
      tags: ["noun"],
    }],
  }]);
  const serialized = JSON.stringify(session.payload);
  for (const forbidden of ["external-course-id", "external-unit-id", "external-word-id", "contentVersion", "sourceType", "createdAt", "archived"]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden));
  }
});

test("Künftiges fachliches Antwortformat bleibt ohne Adapterwechsel importierbar", () => {
  const response = semanticResponse({ version: 99, promptVersion: "import-v9" });
  const session = prepare(JSON.stringify(response));
  assert.equal(session.valid, true);
  assert.equal(session.payload.units[0].words[0].source, "advantage");
  assert.equal(Object.hasOwn(session.payload, "version"), false);
});

test("Markdown, Leerzeilen, Nummerierung und Aufzählungsbericht werden toleriert", () => {
  const json = JSON.stringify(semanticResponse(), null, 2);
  const variants = [
    `\n\nHier ist die Antwort:\n\n\`\`\`json\n${json}\n\`\`\`\n\nPrüfbericht:\n- 1 Unit\n- 1 Eintrag`,
    `1. Kursdaten\n\n\`\`\`\n${json}\n\`\`\`\n\n2. Bitte prüfen\n* advantage`,
    `Antwort:\n${json}\n\n1) Eine Unit\n2) Keine unklaren Einträge`,
  ];
  variants.forEach((text) => {
    const session = prepare(text);
    assert.equal(session.valid, true);
    assert.equal(session.payload.units[0].words[0].source, "advantage");
  });
});

test("Leere und nicht auswertbare Antworten liefern strukturierte Decode-Issues", () => {
  const empty = prepare(" \n\n ");
  const invalid = prepare("Hier ist leider nur ein Prüfbericht ohne Kursdaten.");
  assert.equal(empty.valid, false);
  assert.equal(invalid.valid, false);
  assert.equal(empty.issues[0].code, "ai.response.empty");
  assert.equal(invalid.issues[0].code, "ai.response.json-missing");
  assert.equal(empty.issues.length, 1);
  assert.equal(invalid.issues.length, 1);
  assert.ok(empty.issues[0].message && empty.issues[0].action);
});

test("Mehrere vollständige JSON-Kursteile werden als ein Kurs zusammengeführt", () => {
  const first = JSON.stringify(semanticResponse());
  const second = JSON.stringify(semanticResponse({ version: 2 }));
  const session = prepare(`\`\`\`json\n${first}\n\`\`\`\n\n\`\`\`json\n${second}\n\`\`\``);
  assert.equal(session.valid, true);
  assert.equal(session.payload.units[0].words.length, 2);
});

test("Fehlende Übersetzung und fehlende Pflichtfelder kommen aus dem bestehenden Draft-Validator", () => {
  const response = semanticResponse({
    units: [{ title: "", words: [{ source: "advantage", targets: [], phonetic: "", hint: "", example: "", tags: [] }] }],
  });
  const session = prepare(JSON.stringify(response));
  assert.equal(session.valid, false);
  assert.ok(session.issues.some((issue) => issue.code === "unit.title.required"));
  assert.ok(session.issues.some((issue) => issue.code === "word.targets.required"));
});

test("Fehlender oder ungültiger Sprachkontext wird zentral validiert", () => {
  const session = prepare(JSON.stringify(semanticResponse()), {
    sourceLanguage: "xx",
    targetLanguage: "",
  });
  assert.equal(session.valid, false);
  assert.ok(session.issues.some((issue) => issue.code === "language.source.invalid"));
  assert.ok(session.issues.some((issue) => issue.code === "language.target.invalid"));
});

test("Doppelte Wörter und offensichtlich unvollständige Beispiele erscheinen als Issues", () => {
  const word = semanticResponse().units[0].words[0];
  const session = prepare(JSON.stringify(semanticResponse({
    units: [{ title: "Unit 6", words: [
      { ...word, example: "One advantage is ..." },
      { ...word, targets: ["Vorzug"] },
    ] }],
  })));
  assert.equal(session.valid, true);
  assert.ok(session.issues.some((issue) => issue.code === "word.example.incomplete"));
  assert.ok(session.issues.some((issue) => issue.code === "word.duplicate.same-unit"));
});

test("Erfolgreicher KI-Import materialisiert und speichert genau einen regulären eigenen Kurs", () => {
  const session = prepare(JSON.stringify(currentPromptResponse()));
  const plan = importOrchestrator.createImportPlan(session, { strategy: "skip", newUnitReleased: true });
  const saved = [];
  const service = {
    addCourse(course) { saved.push(course); return course; },
    updateCourse() { throw new Error("unerwartet"); },
  };
  const result = importOrchestrator.commitImport(plan, {
    service,
    idGenerator: sequence("generated"),
    now: "2026-07-17T10:00:00.000Z",
  });
  assert.equal(saved.length, 1);
  assert.equal(result.course.title, "Neutraler Kurs – Lernpaket 6");
  assert.equal(result.course.languages.source.code, "en");
  assert.equal(result.course.languages.target.code, "de");
  assert.match(result.course.id, /^course-generated-/);
  assert.match(result.course.units[0].id, /^unit-generated-/);
  assert.match(result.course.units[0].words[0].id, /^word-generated-/);
  assert.notEqual(result.course.id, "external-course-id");
  assert.equal(result.course.editable, true);
  assert.equal(result.course.units[0].released, true);
  assert.equal(result.course.units[0].current, true);
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

if (failures > 0) {
  console.error(`\n${failures}/${tests.length} KI-Inhaltsimport-Tests fehlgeschlagen.`);
  process.exitCode = 1;
} else {
  console.log(`\n${tests.length}/${tests.length} KI-Inhaltsimport-Tests bestanden.`);
}
