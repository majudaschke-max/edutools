import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  createPromptGenerator,
  createVocabularyImportPromptValues,
} from "../src/prompts/prompt-generator.js";
import { createPromptLoader } from "../src/prompts/prompt-loader.js";
import {
  createPromptRegistry,
  DEFAULT_VOCABULARY_IMPORT_PROMPT_VERSION,
  promptRegistry,
  VOCABULARY_IMPORT_PROMPT_TYPE,
} from "../src/prompts/prompt-registry.js";
import {
  createTemplateEngine,
  findPromptPlaceholders,
  renderPromptTemplate,
  validatePromptTemplate,
} from "../src/prompts/template-engine.js";

const tests = [];
function test(name, callback) { tests.push({ name, callback }); }

function hash(text) {
  return createHash("sha256").update(text).digest("hex");
}

function definition(template, options = {}) {
  return {
    type: options.type ?? "test-import",
    version: options.version ?? "import-v1",
    default: options.default ?? true,
    resource: options.resource ?? new URL("file:///tmp/edutools-test-prompt.md"),
    integrity: `sha256-${hash(template)}`,
    requiredPlaceholders: options.requiredPlaceholders ?? ["COURSE_NAME"],
    optionalPlaceholders: options.optionalPlaceholders ?? [],
  };
}

function loaderFixture(template, options = {}) {
  const promptDefinition = definition(template, options);
  const registry = createPromptRegistry([promptDefinition]);
  let reads = 0;
  const loader = createPromptLoader({
    registry,
    readText: async () => {
      reads += 1;
      return template;
    },
    digest: async (value) => hash(value),
  });
  return { loader, registry, reads: () => reads };
}

test("Template-Engine ersetzt ausschließlich deklarierte Platzhalter unverfälscht", () => {
  const contract = { requiredPlaceholders: ["COURSE_NAME", "SOURCE_LANGUAGE"] };
  const rendered = renderPromptTemplate(
    "Kurs {{COURSE_NAME}} · {{SOURCE_LANGUAGE}}",
    { COURSE_NAME: "A $& {{TARGET_LANGUAGE}}", SOURCE_LANGUAGE: "Englisch" },
    contract,
  );
  assert.equal(rendered, "Kurs A $& {{TARGET_LANGUAGE}} · Englisch");
  assert.deepEqual(findPromptPlaceholders(rendered), ["TARGET_LANGUAGE"]);
});

test("Template-Engine meldet fehlende Werte eindeutig", () => {
  assert.throws(
    () => renderPromptTemplate("{{COURSE_NAME}}", {}, { requiredPlaceholders: ["COURSE_NAME"] }),
    /COURSE_NAME.*fehlt ein Wert/,
  );
});

test("Template-Engine weist unbekannte Platzhalter und Werte zurück", () => {
  assert.throws(
    () => validatePromptTemplate("{{COURSE_NAME}} {{UNKNOWN}}", { requiredPlaceholders: ["COURSE_NAME"] }),
    /unbekannten Platzhalter „UNKNOWN“/,
  );
  assert.throws(
    () => renderPromptTemplate("{{COURSE_NAME}}", { COURSE_NAME: "Kurs", UNKNOWN: "x" }, { requiredPlaceholders: ["COURSE_NAME"] }),
    /unbekannten Platzhalter „UNKNOWN“.*Wert/,
  );
});

test("Template-Engine erkennt fehlende, doppelte und fehlerhafte Platzhalter", () => {
  assert.throws(
    () => validatePromptTemplate("Kein Name", { requiredPlaceholders: ["COURSE_NAME"] }),
    /fehlt.*COURSE_NAME/,
  );
  assert.throws(
    () => validatePromptTemplate("{{COURSE_NAME}} {{COURSE_NAME}}", { requiredPlaceholders: ["COURSE_NAME"] }),
    /COURSE_NAME.*mehrfach/,
  );
  assert.throws(
    () => validatePromptTemplate("{{COURSE_NAME}", { requiredPlaceholders: ["COURSE_NAME"] }),
    /fehlerhaft formatierten Platzhalter/,
  );
});

test("gebundene Template-Engine verwendet einen unveränderlichen Vertrag", () => {
  const contract = { requiredPlaceholders: ["COURSE_NAME"] };
  const engine = createTemplateEngine(contract);
  contract.requiredPlaceholders.push("UNKNOWN");
  assert.equal(engine.render("{{COURSE_NAME}}", { COURSE_NAME: "Kurs" }), "Kurs");
  assert.equal(Object.isFrozen(engine), true);
});

test("Prompt-Registry wählt Standard- und explizite Version", () => {
  const v1 = definition("{{COURSE_NAME}}", { default: true, version: "import-v1" });
  const v2 = definition("v2 {{COURSE_NAME}}", { default: false, version: "import-v2" });
  const registry = createPromptRegistry([v1, v2]);
  assert.equal(registry.get("test-import").version, "import-v1");
  assert.equal(registry.get("test-import", "import-v2").version, "import-v2");
  assert.deepEqual(registry.list("test-import").map((item) => item.version), ["import-v1", "import-v2"]);
});

test("Prompt-Registry meldet ungültige, doppelte und unbekannte Versionen", () => {
  assert.throws(
    () => createPromptRegistry([definition("x", { version: "v1" })]),
    /Promptversion „v1“ ist ungültig/,
  );
  const duplicate = definition("{{COURSE_NAME}}");
  assert.throws(() => createPromptRegistry([duplicate, duplicate]), /doppelt registriert/);
  const registry = createPromptRegistry([duplicate]);
  assert.throws(() => registry.get("test-import", "import-v9"), /nicht registriert/);
  assert.throws(() => registry.get("reading-import"), /keine Standardversion/);
});

test("Prompt-Loader lädt, validiert und cached eine Promptversion", async () => {
  const fixture = loaderFixture("Kurs {{COURSE_NAME}}\n");
  const first = await fixture.loader.load("test-import");
  const second = await fixture.loader.load("test-import", "import-v1");
  assert.equal(first.template, "Kurs {{COURSE_NAME}}");
  assert.deepEqual(first.placeholders, ["COURSE_NAME"]);
  assert.equal(first, second);
  assert.equal(fixture.reads(), 1);
  fixture.loader.clear();
  await fixture.loader.load("test-import");
  assert.equal(fixture.reads(), 2);
});

test("Prompt-Loader weist manipulierte Promptdateien zurück", async () => {
  const expected = "{{COURSE_NAME}}";
  const registry = createPromptRegistry([definition(expected)]);
  const loader = createPromptLoader({
    registry,
    readText: async () => `${expected} manipuliert`,
    digest: async (value) => hash(value),
  });
  await assert.rejects(() => loader.load("test-import"), /Integritätsprüfung.*fehlgeschlagen/);
});

test("Prompt-Loader behandelt fehlende und leere Promptdateien verständlich", async () => {
  const registry = createPromptRegistry([definition("{{COURSE_NAME}}")]);
  const missing = createPromptLoader({
    registry,
    readText: async () => { throw new Error("ENOENT"); },
    digest: async (value) => hash(value),
  });
  await assert.rejects(() => missing.load("test-import"), /konnte nicht geladen werden: ENOENT/);
  const empty = createPromptLoader({
    registry,
    readText: async () => "  \n",
    digest: async (value) => hash(value),
  });
  await assert.rejects(() => empty.load("test-import"), /ist leer/);
});

test("Prompt-Loader validiert den Platzhaltervertrag erst nach bestandener Integrität", async () => {
  const template = "{{UNKNOWN}}";
  const fixture = loaderFixture(template);
  await assert.rejects(() => fixture.loader.load("test-import"), /unbekannten Platzhalter „UNKNOWN“/);
});

test("produktive Promptdatei besteht Integritäts- und Vertragsprüfung", async () => {
  const loader = createPromptLoader({
    registry: promptRegistry,
    readText: (resource) => readFile(resource, "utf8"),
    digest: async (value) => hash(value),
  });
  const loaded = await loader.load(
    VOCABULARY_IMPORT_PROMPT_TYPE,
    DEFAULT_VOCABULARY_IMPORT_PROMPT_VERSION,
  );
  assert.equal(loaded.version, "import-v1");
  assert.deepEqual([...loaded.placeholders].sort(), [
    "APP_TYPE",
    "COURSE_NAME",
    "SCHEMA_EXAMPLE",
    "SCHEMA_VERSION",
    "SOURCE_LANGUAGE",
    "SUPPORTED_LANGUAGES",
    "TARGET_LANGUAGE",
  ]);
});

test("PromptGenerator füllt Kurskontext, Sprachwerte und reales Schema", async () => {
  const loader = createPromptLoader({
    registry: promptRegistry,
    readText: (resource) => readFile(resource, "utf8"),
    digest: async (value) => hash(value),
  });
  const generator = createPromptGenerator({ loader });
  const prompt = await generator.generate({
    courseName: "Französisch 8",
    sourceLanguage: "fr",
    targetLanguage: "de",
    schoolType: "Gymnasium",
    gradeLevel: "8",
  });
  assert.match(prompt, /Kursname: Französisch 8/);
  assert.match(prompt, /Französisch \(Code fr, Locale fr-FR\)/);
  assert.match(prompt, /"schemaVersion": 1/);
  assert.match(prompt, /"schoolType": "Gymnasium"/);
  assert.match(prompt, /"gradeLevel": "8"/);
  assert.doesNotMatch(prompt, /\{\{[A-Z][A-Z0-9_]*\}\}/);
});

test("Import-Prompt verlangt Dateidownloads, Mehrfachdateien und einen exakten getrennten Prüfbericht", async () => {
  const loader = createPromptLoader({
    registry: promptRegistry,
    readText: (resource) => readFile(resource, "utf8"),
    digest: async (value) => hash(value),
  });
  const prompt = await createPromptGenerator({ loader }).generate({
    courseName: "Neutraler Kurs", sourceLanguage: "en", targetLanguage: "de",
  });
  assert.match(prompt, /direkt herunterladbare UTF-8-Dateien/);
  assert.match(prompt, /40 bis 50 Vokabeleinträge pro Datei/);
  assert.match(prompt, /teil-1\.json/);
  assert.match(prompt, /identische gemeinsame Kursmetadaten/);
  assert.match(prompt, /Prüfbericht außerhalb der JSON-Dateien/);
  assert.match(prompt, /aus der Vorlage unverändert übernommen/);
  assert.match(prompt, /OCR-Fehler korrigiert/);
  assert.match(prompt, /neu erzeugt/);
  assert.match(prompt, /wegen Unsicherheit leer gelassen/);
  assert.match(prompt, /Source-Begriffe aller Einträge/);
  assert.doesNotMatch(prompt, /ChatGPT-Antwort kopieren/);
});

test("Vocabulary-Werte bereiten optionale Schul- und Jahrgangsmetadaten vor", () => {
  const values = createVocabularyImportPromptValues({
    courseName: "Kurs",
    sourceLanguage: "en",
    targetLanguage: "de",
    schoolType: "Mittelschule",
    gradeLevel: "7",
  });
  assert.equal(values.SCHOOL_TYPE, "Mittelschule");
  assert.equal(values.GRADE_LEVEL, "7");
  assert.equal(Object.isFrozen(values), true);
});

test("PromptGenerator unterstützt weitere Prompttypen ohne Änderung am Generator", async () => {
  const loader = {
    async load(type, version) {
      assert.equal(type, "reading-import");
      assert.equal(version, "reading-v1");
      return {
        template: "Lesetext für {{COURSE_NAME}}",
        requiredPlaceholders: ["COURSE_NAME"],
        optionalPlaceholders: [],
      };
    },
  };
  const generator = createPromptGenerator({
    loader,
    valueFactories: {
      "reading-import": (request) => ({ COURSE_NAME: request.courseName }),
    },
  });
  assert.equal(
    await generator.generate({ type: "reading-import", version: "reading-v1", courseName: "Lektüre" }),
    "Lesetext für Lektüre",
  );
});

test("PromptGenerator meldet Prompttypen ohne Werterzeugung", async () => {
  const generator = createPromptGenerator({ loader: { load: async () => ({}) } });
  await assert.rejects(
    () => generator.generate({ type: "quiz-import", version: "quiz-v1" }),
    /keine Werterzeugung registriert/,
  );
});

test("Prompttext liegt ausschließlich in der versionierten Klartextressource", async () => {
  const [template, generator, loader, registry, engine, facade] = await Promise.all([
    readFile(new URL("../src/prompts/vocabulary/import-v1.txt", import.meta.url), "utf8"),
    readFile(new URL("../src/prompts/prompt-generator.js", import.meta.url), "utf8"),
    readFile(new URL("../src/prompts/prompt-loader.js", import.meta.url), "utf8"),
    readFile(new URL("../src/prompts/prompt-registry.js", import.meta.url), "utf8"),
    readFile(new URL("../src/prompts/template-engine.js", import.meta.url), "utf8"),
    readFile(new URL("../src/import/import-template.js", import.meta.url), "utf8"),
  ]);
  assert.match(template, /^Du bist Experte für Fremdsprachendidaktik/);
  assert.doesNotMatch(`${generator}\n${loader}\n${registry}\n${engine}\n${facade}`, /Du bist Experte für Fremdsprachendidaktik/);
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
console.log(`\n${tests.length - failures}/${tests.length} Prompt-Engine-Tests bestanden.`);
if (failures > 0) process.exitCode = 1;
