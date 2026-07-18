import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

import { createBuildFilePlan } from "../build/build-file-plan.js";

const tests = [];
function test(name, callback) { tests.push({ name, callback }); }

const root = new URL("../../../", import.meta.url);
const appRoot = new URL("../src/", import.meta.url);
const designRoot = new URL("../../../design-system/", import.meta.url);
const read = (url) => readFile(url, "utf8");

function luminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((value) => Number.parseInt(value, 16) / 255);
  const linear = channels.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(left, right) {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("Sprint 3.9 behält die experimentelle OCR-Quelle ohne produktive Aktivierung", async () => {
  const [packageJson, ocr] = await Promise.all([
    read(new URL("../package.json", appRoot)),
    read(new URL("ocr/ocr-import-runtime.js", appRoot)),
  ]);
  const metadata = JSON.parse(packageJson);
  assert.equal(metadata.version, "4.0.5");
  assert.equal(metadata.dependencies, undefined);
  assert.deepEqual(Object.keys(metadata.devDependencies).sort(), [
    "@tesseract.js-data/deu", "@tesseract.js-data/eng", "@tesseract.js-data/fra",
    "@tesseract.js-data/lat", "heic-to", "tesseract.js", "tesseract.js-core",
  ]);
  assert.match(ocr, /importMode: "quick"/);
});

test("alle produktiven Source-Referenzen verwenden einheitlich Version 4.0.5", async () => {
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      if (entry.isDirectory()) {
        if (!["ocr", "vendor", "image-import"].includes(entry.name)) files.push(...await walk(url));
      } else if (/\.(?:css|html|js)$/.test(entry.name)) files.push(url);
    }
    return files;
  }
  const versions = [];
  for (const file of await walk(appRoot)) {
    const source = await read(file);
    versions.push(...[...source.matchAll(/\?v=(\d+\.\d+\.\d+)/g)].map((match) => match[1]));
  }
  assert.ok(versions.length > 0);
  assert.deepEqual([...new Set(versions)], ["4.0.5"]);
  const appVersion = await read(new URL("runtime/app-version.js", appRoot));
  assert.match(appVersion, /APP_VERSION = "4\.0\.5"/u);
});

test("Footer enthält nur EduTools und das MJ-Signet ohne Werbeclaim", async () => {
  const html = await read(new URL("index.html", appRoot));
  const footer = html.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? "";
  assert.match(footer, /EduTools/);
  assert.match(footer, /edutools-signature__initials">MJ/);
  assert.doesNotMatch(footer, /Didaktisch durchdacht\. Klar gestaltet\.|footer__claim/);
});

test("Brand Core definiert alle verbindlichen semantischen Rollen", async () => {
  const core = await read(new URL("css/brand-core.css", designRoot));
  for (const token of [
    "--brand-page-start", "--brand-page-end", "--brand-hero-start", "--brand-hero-middle", "--brand-hero-end",
    "--brand-accent-primary", "--brand-accent-primary-hover", "--brand-accent-primary-active", "--brand-accent-primary-soft",
    "--brand-accent-secondary", "--brand-accent-secondary-soft", "--brand-accent-warm", "--brand-accent-warm-soft",
    "--brand-surface-default", "--brand-surface-raised", "--brand-surface-tinted", "--brand-surface-glass",
    "--brand-text-primary", "--brand-text-secondary", "--brand-text-muted", "--brand-text-on-accent",
    "--brand-border-soft", "--brand-border-default", "--brand-border-strong",
    "--brand-shadow-soft", "--brand-shadow-card", "--brand-shadow-raised", "--brand-focus", "--brand-focus-shadow",
    "--brand-blob-one", "--brand-blob-two", "--brand-blob-three", "--brand-blob-opacity", "--brand-blob-blur",
    "--brand-signature-background", "--brand-signature-border", "--brand-signature-text",
    "--gradient-page", "--gradient-hero", "--gradient-accent-soft", "--gradient-card-highlight", "--gradient-progress",
  ]) assert.match(core, new RegExp(`${token}:`), `${token} fehlt`);
});

test("Vocabulary-Theme definiert Himmelblau, Mint, Türkis und Apricot zentral", async () => {
  const theme = await read(new URL("css/themes/vocabulary.css", designRoot));
  assert.match(theme, /\[data-edutools-theme="vocabulary"\]/);
  assert.match(theme, /--brand-hero-start: #dcefff/);
  assert.match(theme, /--brand-hero-middle: #dff7ee/);
  assert.match(theme, /--brand-accent-primary: #176b7a/);
  assert.match(theme, /--brand-accent-warm: #ad5c30/);
});

test("Vocabulary-Tokens sind semantisch und nicht kursbezogen", async () => {
  const theme = await read(new URL("css/themes/vocabulary.css", designRoot));
  assert.doesNotMatch(theme, /--(?:vocabulary|textbook|course|unit)-/i);
  assert.doesNotMatch(theme, /#695a96|#5c4e87|#4e4177|#e9e4f4/i);
});

test("Theme wird vor Rendering zentral und ohne Kurslogik aktiviert", async () => {
  const [html, app] = await Promise.all([read(new URL("index.html", appRoot)), read(new URL("app.js", appRoot))]);
  assert.match(html, /<html lang="de" data-edutools-theme="vocabulary">/);
  assert.equal((html.match(/data-edutools-theme=/g) ?? []).length, 1);
  assert.doesNotMatch(app, /data-edutools-theme|setAttribute\([^)]*theme/);
});

test("MJ-Signet erscheint genau einmal und ist kein Link", async () => {
  const html = await read(new URL("index.html", appRoot));
  assert.equal((html.match(/class="edutools-signature"/g) ?? []).length, 1);
  assert.equal((html.match(/edutools-signature__initials">MJ/g) ?? []).length, 1);
  assert.match(html, /class="edutools-signature" aria-label="Erstellt von MJ"/);
  assert.doesNotMatch(html, /<a[^>]+edutools-signature/);
});

test("Gemeinsame Signaturkomponente bildet die Raute per CSS", async () => {
  const core = await read(new URL("css/brand-core.css", designRoot));
  assert.match(core, /\.edutools-signature__mark\s*\{[^}]*transform: rotate\(45deg\)/s);
  assert.match(core, /\.edutools-signature__initials\s*\{[^}]*transform: rotate\(-45deg\)/s);
});

test("Zentrale Kontrastkombinationen erfüllen WCAG AA", () => {
  assert.ok(contrast("#ffffff", "#176b7a") >= 4.5);
  assert.ok(contrast("#17323a", "#f7fcff") >= 4.5);
  assert.ok(contrast("#3f5960", "#ffffff") >= 4.5);
  assert.ok(contrast("#5b7077", "#ffffff") >= 4.5);
  assert.ok(contrast("#175d8c", "#ffffff") >= 3);
});

test("Statusfarben bleiben von Themefarben getrennt", async () => {
  const [tokens, theme] = await Promise.all([
    read(new URL("css/tokens.css", designRoot)),
    read(new URL("css/themes/vocabulary.css", designRoot)),
  ]);
  for (const status of ["success", "warning", "error", "info"]) assert.match(tokens, new RegExp(`--color-${status}:`));
  assert.doesNotMatch(theme, /--color-(?:success|warning|error|info):/);
});

test("Lernmodi verwenden Unterakzente innerhalb des Vocabulary-Themes", async () => {
  const [theme, dashboard] = await Promise.all([
    read(new URL("css/themes/vocabulary.css", designRoot)),
    read(new URL("styles/dashboard.css", appRoot)),
  ]);
  for (const mode of ["flashcards", "quiz", "writing", "speed"]) {
    assert.match(theme, new RegExp(`--brand-mode-${mode}:`));
    assert.match(dashboard, new RegExp(`var\\(--brand-mode-${mode}\\)`));
  }
});

test("Organische Flächen sind statisch, nicht interaktiv und mobil reduziert", async () => {
  const [dashboard, responsive] = await Promise.all([
    read(new URL("styles/dashboard.css", appRoot)),
    read(new URL("styles/responsive.css", appRoot)),
  ]);
  assert.match(dashboard, /pointer-events: none/);
  assert.doesNotMatch(dashboard, /animation:/);
  assert.match(responsive, /\.dashboard-hero::before,[\s\S]*\.dashboard-hero::after[\s\S]*display: none/);
});

test("Lange Kurs- und Vokabeltexte besitzen belastbare Umbruchregeln", async () => {
  const [shell, learning, authoring] = await Promise.all([
    read(new URL("styles/app-shell.css", appRoot)),
    read(new URL("styles/learning-modes.css", appRoot)),
    read(new URL("styles/authoring.css", appRoot)),
  ]);
  assert.match(shell, /\.course__name\s*\{[^}]*overflow-wrap: anywhere/s);
  assert.match(learning, /\.flashcard__source[\s\S]*overflow-wrap: anywhere/);
  assert.match(authoring, /\.word-editor-item span[\s\S]*overflow-wrap: anywhere/);
});

test("Produktive Builds enthalten nur Brand Core und Vocabulary-Theme", async () => {
  const repositoryRoot = new URL("../../../", import.meta.url).pathname;
  const plan = await createBuildFilePlan({ repositoryRoot, profile: { mode: "learner", features: { motivation: true, pronunciation: true, speedChallenge: true } } });
  const files = plan.map((item) => item.destination);
  assert.ok(files.includes("design-system/css/brand-core.css"));
  assert.ok(files.includes("design-system/css/themes/vocabulary.css"));
  assert.equal(files.includes("design-system/brand-reference.css"), false);
  assert.equal(files.some((file) => /grammar|reading|writing-theme|exam-theme/i.test(file)), false);
});

test("Produktive Brand-Dateien referenzieren weder Jigsaw noch externe Assets", async () => {
  const texts = await Promise.all([
    read(new URL("css/brand-core.css", designRoot)),
    read(new URL("css/themes/vocabulary.css", designRoot)),
    read(new URL("index.html", appRoot)),
  ]);
  const combined = texts.join("\n");
  assert.doesNotMatch(combined, /gruppenpuzzle|majudaschke-max\.github\.io/i);
  assert.doesNotMatch(combined, /https?:\/\//i);
});

test("Interne Referenz dokumentiert Erweiterbarkeit ohne produktive Apps", async () => {
  const reference = await read(new URL("index.html", designRoot));
  for (const name of ["Grammar Trainer", "Reading Trainer", "Writing Trainer", "Exam Trainer"]) assert.match(reference, new RegExp(name));
  assert.match(reference, /keine produktiven Themes/);
  assert.doesNotMatch(reference, /data-route-view|src="app\.js/);
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

console.log(`\n${tests.length - failures}/${tests.length} Brand-System-Tests bestanden.`);
if (failures > 0) process.exitCode = 1;
