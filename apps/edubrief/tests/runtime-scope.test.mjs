import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { CONTENT_STORES, DB_NAME, DB_VERSION, PERSONAL_STORES } from "../db.mjs";
import { PACKAGE_BASE } from "../domain.mjs";

const appDirectory = fileURLToPath(new URL("../", import.meta.url));
const html = await readFile(`${appDirectory}index.html`, "utf8");
const script = await readFile(`${appDirectory}app.mjs`, "utf8");
const styles = await readFile(`${appDirectory}styles.css`, "utf8");
const serviceWorker = await readFile(`${appDirectory}service-worker.js`, "utf8");

test("IndexedDB name and explicit version match the architecture contract", () => {
  assert.equal(DB_NAME, "edubrief");
  assert.equal(DB_VERSION, 1);
});

test("content and personal object stores are separated", () => {
  assert.deepEqual(CONTENT_STORES, ["contentPackages", "contentItems", "contentTombstones", "contentMeta"]);
  assert.ok(PERSONAL_STORES.includes("userProfiles"));
  assert.ok(PERSONAL_STORES.includes("calendarConfigurations"));
  assert.ok(PERSONAL_STORES.includes("eduCoffeeProgress"));
  assert.ok(PERSONAL_STORES.includes("savedItems"));
  assert.equal(CONTENT_STORES.some((name) => PERSONAL_STORES.includes(name)), false);
});

test("runtime package path points only to the published distribution directory", () => {
  assert.equal(PACKAGE_BASE, "../../outputs/edubrief/content-packages/foundation-weeks");
  assert.doesNotMatch(PACKAGE_BASE, /content-candidates|review|fundus|arbeitsarchiv/i);
});

test("service worker precaches only app-shell and published package URLs", () => {
  assert.match(serviceWorker, /edubrief-shell-v1\.2\.0-foundation-collection/);
  assert.match(serviceWorker, /content-packages\/foundation-weeks/);
  assert.doesNotMatch(serviceWorker, /content-candidates|review-bundle|fundus|node_modules/i);
  assert.doesNotMatch(serviceWorker, /background sync|pushManager|periodicSync/i);
});

test("theme-week overview groups cards by week and its navigation closes an opened card", () => {
  assert.match(script, /state\.package\.content\.themeWeeks\.map\(\(week, weekIndex\)/);
  assert.match(script, /filter\(\(card\) => card\.themeWeekId === week\.weekId\)/);
  assert.match(script, /class="week-group"/);
  assert.match(script, /class="week-groups"/);
  assert.match(script, /data-action="show-week-overview"/);
  assert.match(script, /state\.weekTarget = null/);
  assert.match(script, /data-action="close-week-coffee"/);
});

test("rest days expose only a voluntary opening action and preserve the scheduled assignment", () => {
  assert.match(script, /Ein ruhiger Tag/);
  assert.match(script, /data-action="open-next-coffee"/);
  assert.match(script, /Nächsten EduCoffee öffnen/);
  assert.match(script, /Sein geplanter Termin bleibt/);
  assert.doesNotMatch(script, /scheduledActiveDate\s*=(?!=)/);
  assert.doesNotMatch(script, /Nachholen|Aufholen|Streak|Belohnung/);
});

test("existing profiles synchronize only missing content assignments", () => {
  assert.match(script, /createMissingAssignments/);
  assert.match(script, /appendProgressAssignments/);
  assert.match(script, /if \(missingAssignments\.length\)/);
});

test("app contains no quiz, answer, scoring, or self-assessment controls", () => {
  assert.doesNotMatch(html, /type=["'](?:text|search|number)["']/i);
  assert.doesNotMatch(script, /<textarea|multiple[- ]?choice|musterantwort|selbstbewertung|scoring|quiz/i);
  assert.doesNotMatch(script, /data-action=["'](?:submit-answer|check-answer|reveal-answer)["']/i);
});

test("responsive navigation exposes only the active product areas", () => {
  for (const label of ["Heute", "Sammlung", "Einstellungen"]) assert.match(script, new RegExp(`>${label}<`));
  for (const obsolete of ["Kalender", "Entdecken", "Mein Lernen", "Mehr"]) assert.doesNotMatch(script, new RegExp(`>${obsolete}<`));
  assert.doesNotMatch(script, /aria-haspopup=\"menu\"/);
});

test("EduBrief touch-target token is 48 CSS pixels", () => {
  assert.match(styles, /--touch-target-min:\s*3rem/);
});

test("subject onboarding uses accessible native checkboxes and an exclusive general mode", () => {
  assert.match(script, /Welche Fächer unterrichtest du\?/);
  assert.match(script, /type="checkbox" name="subject"/);
  assert.match(script, /name="general-subject-mode"/);
  assert.match(script, /Fachübergreifend \/ keine Schwerpunktsetzung/);
  assert.doesNotMatch(script, /<select id="preferred-context"|value="teacher-education"/);
  assert.match(styles, /\.subject-choice[\s\S]*min-height:\s*var\(--touch-target-min\)/);
});

test("possible implementations are equal and expose one implementation-level collection toggle", () => {
  assert.match(script, /Mögliche Umsetzungen/);
  assert.match(script, /data-implementation-id/);
  assert.match(script, /toggle-implementation-saved/);
  assert.match(script, /aria-pressed="\$\{saved\}"/);
  assert.match(script, /Zum Ausprobieren merken/);
  assert.doesNotMatch(script, /toggle-implementation-mark|Ausprobiert/);
  assert.doesNotMatch(script, /Heute im Unterricht|Weitere Ideen|Vorbereitung|Unterrichtszeit/);
  assert.match(styles, /\.implementation-list/);
});

test("scientific foundation remains visible at the end with the approved hierarchy", () => {
  assert.doesNotMatch(script, /<details class="details">/);
  assert.match(script, /<h2 class="section-heading" id="science-heading">Wissenschaftliche Fundierung<\/h2>/);
  const core = script.indexOf("Wissenschaftlicher Kern");
  const limits = script.indexOf("Bedingungen und Grenzen");
  const exclusions = script.indexOf("Was daraus nicht folgt");
  const sources = script.indexOf("Geprüfte Quellen");
  assert.ok(core < limits && limits < exclusions && exclusions < sources);
});

test("visible UI copy omits redundant product-meta explanations", () => {
  assert.doesNotMatch(script, /Der Abschluss ist eine persönliche Lesemarkierung, keine Bewertung/);
  assert.doesNotMatch(script, /Dieser Impuls ist statischer redaktioneller Inhalt/);
  assert.doesNotMatch(script, /Es gibt kein Antwortfeld und keine Bewertung/);
  assert.doesNotMatch(script, /Sprint-1-Umfang|Teil dieses Slices|späteren Slice|bewusst noch nicht implementiert/);
});

test("scientific disclosure heading uses section typography and inner headings remain smaller", () => {
  assert.match(styles, /\.section-heading\s*\{[\s\S]*font-size:\s*var\(--font-size-2xl\);[\s\S]*font-weight:\s*var\(--font-weight-bold\);[\s\S]*line-height:\s*var\(--line-height-tight\);[\s\S]*letter-spacing:\s*-0\.02em;/);
  assert.match(styles, /\.section-heading\s*\{[\s\S]*color:\s*var\(--brand-text-primary\);[\s\S]*font-family:\s*var\(--font-family-display\);/);
  assert.match(styles, /h3,[\s\S]*\.details__heading\s*\{[\s\S]*font-size:\s*var\(--font-size-lg\);/);
  assert.match(script, /<h3 class="science-subheading">Wissenschaftlicher Kern<\/h3>/);
  assert.match(styles, /\.implementations__header > :not\(\.section-heading\)/);
});

test("the only visible personal mark is the reversible implementation collection toggle", () => {
  assert.match(script, /data-action="toggle-implementation-saved"/);
  assert.match(script, /Zum Ausprobieren merken/);
  for (const obsolete of ["Persönliche Markierungen", "Zur Vertiefung merken", "Zur Vertiefung vorgemerkt", "Als gelesen markieren", "Gelesen", "Ausprobiert"]) {
    assert.doesNotMatch(script, new RegExp(obsolete));
  }
  assert.doesNotMatch(script, /data-action="(?:toggle-read|toggle-personal-mark|complete-coffee)"/);
});

test("collection renders only saved implementations with open and remove actions", () => {
  assert.match(script, /Du hast noch keine Umsetzung vorgemerkt\./);
  assert.match(script, /data-action="open-collection-origin"/);
  assert.match(script, /data-action="remove-saved-implementation"/);
  assert.match(script, /Aus Sammlung entfernen/);
  assert.doesNotMatch(script, /Gemerkte Befunde|mehrere Statusgruppen/);
});

test("daily EduCoffee contains no visible subject filter", () => {
  assert.doesNotMatch(script, /implementationFilterOptions|implementation-filter|filter-option|name="implementation-filter"/);
  assert.doesNotMatch(script, />Alle passenden</);
});

test("practice labels use plain-language headings", () => {
  assert.match(script, /Worauf du achten kannst/);
  assert.match(script, /Mögliche Abwandlung:/);
  assert.doesNotMatch(script, />Beobachtungsimpuls<|>Variation:</);
});

test("runtime HTML declares German language, viewport, landmarks, and CSP", () => {
  assert.match(html, /<html lang="de"/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /<main id="main-content"/);
  assert.match(html, /Zum Hauptinhalt/);
});

test("the app directory contains no dependencies, builds, fonts, or private data", async () => {
  const entries = await readdir(appDirectory, { recursive: true });
  assert.equal(entries.some((entry) => /node_modules|\.woff2?$|\.ttf$|\.otf$|content-candidates|fundus|review-bundle/i.test(entry)), false);
});
