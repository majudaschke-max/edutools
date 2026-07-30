import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  loadPublishedPackage,
  sha256Hex,
  validateContentSemantics,
} from "../content-loader.mjs";
import { FOUNDATION_PACKAGE_ID } from "../domain.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const packageDirectory = fileURLToPath(
  new URL("../../../outputs/edubrief/content-packages/retrieval-practice-week/", import.meta.url),
);
const sourceManifest = JSON.parse(await readFile(`${packageDirectory}manifest.json`, "utf8"));
const sourceContent = JSON.parse(await readFile(`${packageDirectory}retrieval-practice-week.content.json`, "utf8"));

function cardsForWeek(prefix, weekId) {
  const idMap = new Map(sourceContent.cards.map((card, index) => [card.id, `card.${prefix}-${index + 1}`]));
  return sourceContent.cards.map((card) => ({
    ...structuredClone(card),
    id: idMap.get(card.id),
    themeWeekId: weekId,
    crossReferences: card.crossReferences.map((reference) => ({
      ...reference,
      targetContentId: idMap.get(reference.targetContentId),
    })),
  }));
}

function structuralTwoWeekContent() {
  const firstCards = cardsForWeek("first", "week.first");
  const secondCards = cardsForWeek("second", "week.second");
  const weekTemplate = sourceContent.themeWeeks[0];
  return {
    ...structuredClone(sourceContent),
    themeWeeks: [
      { ...structuredClone(weekTemplate), weekId: "week.first", title: "Strukturelle Testwoche A", dayIds: firstCards.map((card) => card.id) },
      { ...structuredClone(weekTemplate), weekId: "week.second", title: "Strukturelle Testwoche B", dayIds: secondCards.map((card) => card.id) },
    ],
    cards: [...secondCards].reverse().concat([...firstCards].reverse()),
  };
}

function manifestFor(content, contentBytes) {
  const practiceVariants = content.cards.reduce((sum, card) => sum + card.practiceImpulses.length, 0);
  return {
    ...structuredClone(sourceManifest),
    packageId: FOUNDATION_PACKAGE_ID,
    contentVersion: "1.1.0",
    files: [{
      path: "edubrief-foundation-weeks.content.json",
      mediaType: "application/json",
      sha256: "",
      bytes: contentBytes.byteLength,
    }],
    counts: {
      ...sourceManifest.counts,
      themeWeeks: content.themeWeeks.length,
      cards: content.cards.length,
      practiceVariants,
    },
    manifestHash: "",
  };
}

test("the generic loader resolves a manifest-declared filename and validates two five-card weeks", async () => {
  const content = structuralTwoWeekContent();
  const contentBytes = new TextEncoder().encode(JSON.stringify(content));
  const manifest = manifestFor(content, contentBytes);
  manifest.files[0].sha256 = await sha256Hex(contentBytes);
  const withoutHash = { ...manifest };
  delete withoutHash.manifestHash;
  manifest.manifestHash = await sha256Hex(canonicalJson(withoutHash));
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    if (url.endsWith("/manifest.json")) {
      return { ok: true, json: async () => structuredClone(manifest) };
    }
    if (url.endsWith("/edubrief-foundation-weeks.content.json")) {
      return {
        ok: true,
        arrayBuffer: async () => contentBytes.buffer.slice(contentBytes.byteOffset, contentBytes.byteOffset + contentBytes.byteLength),
      };
    }
    return { ok: false };
  };

  const validated = await loadPublishedPackage({ baseUrl: "/foundation", fetchImpl });
  assert.equal(validated.content.themeWeeks.length, 2);
  assert.equal(validated.content.cards.length, 10);
  assert.deepEqual(requested, [
    "/foundation/manifest.json",
    "/foundation/edubrief-foundation-weeks.content.json",
  ]);
});

test("multiweek validation rejects broken week, topic, ordering, and manifest counts", () => {
  const content = structuralTwoWeekContent();
  const manifest = manifestFor(content, new TextEncoder().encode(JSON.stringify(content)));

  const brokenWeek = structuredClone(content);
  brokenWeek.cards[0].themeWeekId = "week.unknown";
  assert.throws(() => validateContentSemantics(manifest, brokenWeek), /unbekannte Themenwoche|genau fünf Karten/);

  const brokenTopic = structuredClone(content);
  brokenTopic.cards[0].topicId = "topic.unknown";
  assert.throws(() => validateContentSemantics(manifest, brokenTopic), /Gebrochene Themenreferenz/);

  const brokenSequence = structuredClone(content);
  brokenSequence.cards.find((card) => card.themeWeekId === "week.first" && card.sequence === 5).sequence = 4;
  assert.throws(() => validateContentSemantics(manifest, brokenSequence), /Ungültige Sequenz|Kartenreihenfolge/);

  const wrongCounts = { ...manifest, counts: { ...manifest.counts, cards: 9 } };
  assert.throws(() => validateContentSemantics(wrongCounts, content), /Kartenzähler/);
});
