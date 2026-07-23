import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";
import { canonicalJson, sha256Hex, validateContentSemantics, validatePackage } from "../content-loader.mjs";
import { CONTENT_HASH, MANIFEST_HASH, PACKAGE_ID } from "../domain.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const packageDirectory = fileURLToPath(
  new URL("../../../outputs/edubrief/content-packages/retrieval-practice-week/", import.meta.url),
);
const manifestBytes = await readFile(`${packageDirectory}manifest.json`);
const contentBytes = await readFile(`${packageDirectory}retrieval-practice-week.content.json`);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const content = JSON.parse(contentBytes.toString("utf8"));

function clone(value) {
  return structuredClone(value);
}

test("published package identity and lifecycle are exact", () => {
  assert.equal(manifest.packageId, PACKAGE_ID);
  assert.equal(manifest.contentVersion, "1.0.0");
  assert.equal(manifest.publisherId, "edutools");
  assert.equal(manifest.releaseStatus, "published");
  assert.equal(manifest.publicationStatus, "P3");
});

test("content raw-byte hash matches the released manifest", async () => {
  assert.equal(await sha256Hex(contentBytes), CONTENT_HASH);
  assert.equal(await sha256Hex(contentBytes), manifest.files[0].sha256);
  assert.equal(contentBytes.byteLength, manifest.files[0].bytes);
});

test("canonical manifest hash matches the released value", async () => {
  const withoutHash = { ...manifest };
  delete withoutHash.manifestHash;
  assert.equal(await sha256Hex(canonicalJson(withoutHash)), MANIFEST_HASH);
});

test("published package passes runtime validation", async () => {
  const validated = await validatePackage(manifest, content, contentBytes);
  assert.equal(validated.content.cards.length, 5);
  assert.equal(validated.content.themeWeeks.length, 1);
});

test("the five cards are read in the published week order", () => {
  const week = content.themeWeeks[0];
  assert.deepEqual(
    [...content.cards].sort((a, b) => a.sequence - b.sequence).map((card) => card.id),
    week.dayIds,
  );
});

test("every published card is P3 and has a general practice fallback", () => {
  for (const card of content.cards) {
    assert.equal(card.reviewState.publicationStatus, "P3");
    assert.ok(card.practiceImpulses.some((impulse) => impulse.variantType === "general"));
  }
});

test("unexpected publisher is rejected", async () => {
  const altered = clone(manifest);
  altered.publisherId = "untrusted";
  await assert.rejects(() => validatePackage(altered, content, contentBytes), /Unerwarteter Publisher/);
});

test("non-P3 package is rejected", async () => {
  const altered = clone(manifest);
  altered.publicationStatus = "P2";
  await assert.rejects(() => validatePackage(altered, content, contentBytes), /nicht P3/);
});

test("wrong day role is rejected", async () => {
  const altered = clone(content);
  altered.cards[0].dayRole = "research_and_orientation";
  assert.throws(() => validateContentSemantics(manifest, altered), /Ungültige Tagesrolle/);
});

test("learning-query structures are rejected", () => {
  const altered = clone(content);
  altered.cards[0].answerOptions = ["A", "B"];
  assert.throws(() => validateContentSemantics(manifest, altered), /Nicht zulässige Lernabfragestruktur/);
});

test("tampered content bytes are rejected before materialization", async () => {
  const tampered = new Uint8Array(contentBytes);
  tampered[tampered.length - 2] ^= 1;
  await assert.rejects(() => validatePackage(manifest, content, tampered), /Content-Prüfsumme stimmt nicht/);
});
