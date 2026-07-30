import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  showRoute,
  showThemeWeek,
  showWeekCoffee,
  showWeekOverview,
  themeWeekEntries,
} from "../navigation.mjs";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const content = JSON.parse(
  await readFile(
    `${projectRoot}outputs/edubrief/content-packages/foundation-weeks/edubrief-foundation-weeks.content.json`,
    "utf8",
  ),
);
const requiredWeekOrder = [
  "Feedback und Überarbeitung",
  "Abrufen / Retrieval Practice",
  "Kognitive Belastung / Cognitive Load",
  "Anleitung und Selbstständigkeit",
  "Tiefe Verarbeitung und Lernhandlungen",
  "Motivation und Selbstbestimmung",
  "Ziele und Selbstregulation",
  "Kooperatives Lernen",
  "Üben, Festigen und Automatisieren",
  "Leistung beurteilen und Noten einordnen",
  "Langeweile und Passung",
  "Klassenführung und Lernzeit",
  "Individualisierung und Adaptivität",
  "Digitale Werkzeuge und Multimedia",
  "Klassenwiederholung",
  "Hausaufgaben als Lernarchitektur",
];

function viewState() {
  return {
    route: "today",
    weekSelection: "week.previous",
    weekTarget: "card.previous",
    collectionTarget: null,
    restDayTarget: null,
    notice: "Vorheriger Hinweis",
  };
}

test("clicking Themenwoche opens the overview and clears deeper week state", () => {
  const state = viewState();
  showWeekOverview(state);
  assert.equal(state.route, "week");
  assert.equal(state.weekSelection, null);
  assert.equal(state.weekTarget, null);
  assert.equal(state.notice, "");
});

test("the overview exposes exactly 16 selectable weeks in the required order", () => {
  const entries = themeWeekEntries(content.themeWeeks, content.cards);
  assert.equal(entries.length, 16);
  assert.deepEqual(entries.map(({ week }) => week.title), requiredWeekOrder);
  assert.ok(entries.every(({ cards }) => cards.length === 5));
});

test("a freely selected week opens only its five ordered EduCoffees", () => {
  const state = viewState();
  const selectedId = content.themeWeeks[10].weekId;
  const selected = showThemeWeek(state, content.themeWeeks, selectedId);
  const entry = themeWeekEntries(content.themeWeeks, content.cards).find(({ week }) => week.weekId === selectedId);
  assert.equal(selected?.weekId, selectedId);
  assert.equal(state.route, "week");
  assert.equal(state.weekSelection, selectedId);
  assert.deepEqual(entry.cards.map((card) => card.sequence), [1, 2, 3, 4, 5]);
});

test("an opened week card can return directly to the overview", () => {
  const state = viewState();
  const card = content.cards.find((item) => item.themeWeekId === content.themeWeeks[14].weekId && item.sequence === 3);
  assert.equal(showWeekCoffee(state, content.cards, card.id)?.id, card.id);
  assert.equal(state.weekSelection, content.themeWeeks[14].weekId);
  assert.equal(state.weekTarget, card.id);
  showWeekOverview(state);
  assert.equal(state.route, "week");
  assert.equal(state.weekSelection, null);
  assert.equal(state.weekTarget, null);
});

test("Heute – EduCoffee remains a separate route from free week selection", () => {
  const state = viewState();
  showRoute(state, "today");
  assert.equal(state.route, "today");
  assert.equal(state.weekSelection, null);
  assert.equal(state.weekTarget, null);
});
