import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const tests = [];
function test(name, callback) { tests.push({ name, callback }); }

const appRoot = new URL("../src/", import.meta.url);
const designRoot = new URL("../../../design-system/css/", import.meta.url);

async function read(url) {
  return readFile(url, "utf8");
}

async function readCssBundle() {
  const designNames = (await readdir(designRoot)).filter((name) => name.endsWith(".css"));
  designNames.push("themes/vocabulary.css");
  const appStyleRoot = new URL("styles/", appRoot);
  const appNames = (await readdir(appStyleRoot)).filter((name) => name.endsWith(".css"));
  const entries = await Promise.all([
    ...designNames.map(async (name) => [name, await read(new URL(name, designRoot))]),
    ...appNames.map(async (name) => [`styles/${name}`, await read(new URL(name, appStyleRoot))]),
    ["dashboard.css", await read(new URL("dashboard.css", appRoot))],
  ]);
  return new Map(entries);
}

test("App-Shell besitzt Skip-Link, Landmarken, Kurskontext und beschriftete Hauptnavigation", async () => {
  const html = await read(new URL("index.html", appRoot));
  assert.match(html, /<a class="skip-link" href="#app-view">/);
  assert.match(html, /<header class="app-header">/);
  assert.match(html, /<nav class="app-nav" aria-label="Hauptnavigation">/);
  assert.match(html, /<main id="app-view"/);
  assert.match(html, /data-dashboard-course-label/);
  assert.equal((html.match(/data-main-nav-link/g) ?? []).length, 4);
});

test("Hauptnavigation kennzeichnet exakte Routen und Routengruppen", async () => {
  const [html, app] = await Promise.all([
    read(new URL("index.html", appRoot)),
    read(new URL("app.js", appRoot)),
  ]);
  assert.match(html, /data-route-group="learning"/);
  assert.match(html, /data-route-group="courses"/);
  assert.match(app, /link\.setAttribute\("aria-current", "page"\)/);
  assert.match(app, /group\?\.has\(route\)/);
});

test("Nordic-Education-Tokens enthalten alle zentralen semantischen Rollen", async () => {
  const tokens = await read(new URL("tokens.css", designRoot));
  for (const token of [
    "--color-bg-page", "--color-bg-surface", "--color-bg-subtle",
    "--color-brand-primary", "--color-success-soft", "--color-error-soft",
    "--color-focus", "--space-16", "--radius-xl", "--shadow-focus",
    "--font-family-ui", "--font-size-3xl", "--content-width",
    "--touch-target-min", "--transition-normal",
  ]) {
    assert.match(tokens, new RegExp(`${token}:`), `${token} fehlt`);
  }
});

test("Alle verwendeten CSS Custom Properties sind definiert", async () => {
  const css = await readCssBundle();
  const defined = new Set([...css.values()].flatMap((text) => [...text.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((match) => match[1])));
  const used = new Set([...css.values()].flatMap((text) => [...text.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1])));
  const unknown = [...used].filter((token) => !defined.has(token));
  assert.deepEqual(unknown, []);
});

test("Rohfarben bleiben auf die zentrale Token-Datei begrenzt", async () => {
  const css = await readCssBundle();
  const offenders = [];
  for (const [name, text] of css) {
    if (name === "tokens.css" || name === "themes/vocabulary.css") continue;
    if (/#[0-9a-f]{3,8}\b|\brgb\(|\bhsl\(/i.test(text)) offenders.push(name);
  }
  assert.deepEqual(offenders, []);
});

test("App-Views enthalten keine Inline-Styles", async () => {
  const sourceNames = ["index.html", "app.js"];
  const viewsRoot = new URL("views/", appRoot);
  const componentRoot = new URL("components/", appRoot);
  const viewNames = (await readdir(viewsRoot)).filter((name) => name.endsWith(".js"));
  const componentNames = (await readdir(componentRoot)).filter((name) => name.endsWith(".js"));
  const texts = await Promise.all([
    ...sourceNames.map((name) => read(new URL(name, appRoot))),
    ...viewNames.map((name) => read(new URL(name, viewsRoot))),
    ...componentNames.map((name) => read(new URL(name, componentRoot))),
  ]);
  assert.equal(texts.some((text) => /\bstyle\s*=|\.style\./i.test(text)), false);
});

test("Buttonsystem enthält alle vereinbarten Varianten und gemeinsame Touchziele", async () => {
  const components = await read(new URL("components.css", designRoot));
  for (const variant of ["primary", "secondary", "outline", "text", "destructive", "compact", "icon"]) {
    assert.match(components, new RegExp(`\\.button--${variant}\\b`));
  }
  assert.match(components, /min-block-size: var\(--touch-target-min\)/);
});

test("Fokus und reduzierte Bewegung sind zentral und deutlich definiert", async () => {
  const base = await read(new URL("base.css", designRoot));
  const learning = await read(new URL("styles/learning-modes.css", appRoot));
  assert.match(base, /:focus-visible\s*\{/);
  assert.match(base, /outline: var\(--focus-ring-width\) solid var\(--brand-focus\)/);
  assert.match(base, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(learning, /:has\(input:focus-visible\)/);
});

test("App-CSS ist nach Shell, Dashboard, Inhalt, Lernmodi, Autorentool und Responsive getrennt", async () => {
  const entry = await read(new URL("dashboard.css", appRoot));
  for (const moduleName of ["app-shell", "dashboard", "content", "learning-modes", "authoring", "responsive"]) {
    assert.match(entry, new RegExp(`styles/${moduleName}\\.css`));
  }
});

test("Status, Empty States und destruktive Aktionen bleiben textlich erkennbar", async () => {
  const [libraryView, builderView, learnView, html] = await Promise.all([
    read(new URL("views/course-library-view.js", appRoot)),
    read(new URL("views/course-builder-view.js", appRoot)),
    read(new URL("views/learn-view.js", appRoot)),
    read(new URL("index.html", appRoot)),
  ]);
  assert.match(libraryView, /Aktiv: "active"/);
  assert.match(libraryView, /course-status--\$\{variant\}/);
  assert.match(builderView, /course-status--\$\{statusVariant\(unit\)\}/);
  assert.match(learnView, /empty-state/);
  assert.match(libraryView, /button--\$\{variant\}/);
  assert.match(html, /button button--destructive/);
});

test("Funktionsseiten nutzen eine konsistente, kompakte Titelhierarchie", async () => {
  const [html, shell] = await Promise.all([
    read(new URL("index.html", appRoot)),
    read(new URL("styles/app-shell.css", appRoot)),
  ]);
  assert.match(html, /id="today-title" class="display-hero"/);
  for (const id of ["learn-view-title", "quiz-view-title", "writing-view-title", "speed-view-title", "progress-view-title", "courses-view-title"]) {
    assert.match(html, new RegExp(`id="${id}" class="page-title"`));
  }
  for (const className of ["display-hero", "page-title", "section-title", "content-title"]) {
    assert.match(shell, new RegExp(`\\.${className}\\b`));
  }
});

test("Flashcardhöhe folgt dem Inhalt und Umfangsoptionen bilden ein 2-mal-2-Raster", async () => {
  const [learning, quizView, scopeView] = await Promise.all([
    read(new URL("styles/learning-modes.css", appRoot)),
    read(new URL("views/quiz-view.js", appRoot)),
    read(new URL("views/learning-scope-view.js", appRoot)),
  ]);
  assert.doesNotMatch(learning, /\.flashcard\s*\{[^}]*min-height/s);
  assert.match(learning, /\.quiz-config__group--balanced \.quiz-config__choices\s*\{[^}]*repeat\(2,/s);
  assert.match(`${quizView}\n${scopeView}`, /quiz-config__group quiz-config__group--balanced/);
});

test("nativer Datei-Input zeigt Dateityp, Dateinamenstatus und verknüpften Fehler", async () => {
  const [libraryView, runtime, contentCss] = await Promise.all([
    read(new URL("views/course-library-view.js", appRoot)),
    read(new URL("course-library/course-runtime.js", appRoot)),
    read(new URL("styles/content.css", appRoot)),
  ]);
  assert.match(libraryView, /type: "file"/);
  assert.match(libraryView, /course-json-file-help course-json-file-status course-json-file-error/);
  assert.match(runtime, /selectedFiles\[0\]\?\.name \|\| "Keine Datei ausgewählt\."/);
  assert.match(contentCss, /::file-selector-button/);
  assert.match(contentCss, /min-block-size: var\(--touch-target-min\)/);
});

test("Kurseditor erklärt Hint-Scaffolding in der Lernsprache", async () => {
  const builder = await read(new URL("views/course-builder-view.js", appRoot));
  assert.match(builder, /Hinweis in der Lernsprache/);
  assert.match(builder, /ohne das gesuchte Wort direkt zu nennen/);
  assert.match(builder, /Übersetzungen gehören in das Feld „Zielübersetzungen“/);
  assert.doesNotMatch(builder, /Übersetzungen gehören in „targets“/);
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

console.log(`\n${tests.length - failures}/${tests.length} Designsystem-Tests bestanden.`);
if (failures > 0) process.exitCode = 1;
