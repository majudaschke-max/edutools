import assert from "node:assert/strict";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  createHeicDecoder,
  createHeicJpegName,
  HEIC_JPEG_QUALITY,
  HEIC_USER_ERROR,
  isHeicImageFile,
} from "../src/author/image-import/heic-decoder.js";
import { createImageWorkspace } from "../src/ocr/image-preprocessor.js";
import { createBuildFilePlan } from "../build/build-file-plan.js";
import { createContentSecurityPolicy } from "../build/build-vocabulary-trainer.js";

const TEST_ROOT = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(TEST_ROOT, "..");
const REPOSITORY_ROOT = path.resolve(APP_ROOT, "../..");
const tests = [];
const test = (name, callback) => tests.push({ name, callback });

function namedBlob(parts, { name, type, lastModified = 1 }) {
  const blob = new Blob(parts, { type });
  Object.defineProperties(blob, {
    name: { value: name },
    lastModified: { value: lastModified },
  });
  return blob;
}

function imageFile(name, type, width = 800, height = 600, size = 1024) {
  return { name, type, width, height, size, lastModified: 1 };
}

test("HEIC und HEIF werden zentral über MIME-Type oder Dateiendung erkannt", () => {
  for (const file of [
    { name: "foto.bin", type: "image/heic" },
    { name: "foto.bin", type: "image/heif" },
    { name: "FOTO.HEIC", type: "" },
    { name: "FOTO.HeIf", type: "application/octet-stream" },
  ]) assert.equal(isHeicImageFile(file), true);
  for (const file of [
    { name: "foto.jpg", type: "image/jpeg" },
    { name: "foto.png", type: "image/png" },
    { name: "foto.webp", type: "image/webp" },
  ]) assert.equal(isHeicImageFile(file), false);
  assert.equal(createHeicJpegName("IMG_1001.HEIC"), "IMG_1001.jpg");
  assert.equal(createHeicJpegName("scan.heif"), "scan.jpg");
});

test("der Adapter erzeugt eine benannte JPEG-Arbeitskopie mit Qualität 0,92", async () => {
  const calls = [];
  const output = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });
  const decoder = createHeicDecoder({
    loadModule: async () => ({
      async isHeic(file) { calls.push(["signature", file.name]); return true; },
      async heicTo(options) { calls.push(["convert", options.type, options.quality]); return output; },
    }),
    createFile: (blob, name, lastModified) => ({
      name, type: blob.type, size: blob.size, lastModified, blob,
    }),
  });
  const source = namedBlob(["source metadata and pixels"], {
    name: "IMG_1001.HEIC", type: "image/heic", lastModified: 123,
  });
  const result = await decoder.convert(source);
  assert.equal(HEIC_JPEG_QUALITY, 0.92);
  assert.equal(result.name, "IMG_1001.jpg");
  assert.equal(result.type, "image/jpeg");
  assert.equal(result.lastModified, 123);
  assert.deepEqual(calls, [["signature", "IMG_1001.HEIC"], ["convert", "image/jpeg", 0.92]]);
  assert.doesNotMatch(await output.text(), /metadata|GPS|EXIF/i);
});

test("beschädigte iPhone-Fotos erhalten ausschließlich die verständliche Rückmeldung", async () => {
  const decoder = createHeicDecoder({
    loadModule: async () => ({ isHeic: async () => false, heicTo: async () => null }),
  });
  const corrupt = namedBlob(["not a complete image"], { name: "kaputt.heic", type: "image/heic" });
  await assert.rejects(decoder.convert(corrupt), (error) => (
    error instanceof TypeError && error.message === HEIC_USER_ERROR
  ));
});

test("Abbruch wird vor der Konvertierung respektiert", async () => {
  let loaded = false;
  const controller = new AbortController();
  controller.abort();
  const decoder = createHeicDecoder({ loadModule: async () => { loaded = true; return {}; } });
  const file = namedBlob(["data"], { name: "foto.heic", type: "image/heic" });
  await assert.rejects(decoder.convert(file, { signal: controller.signal }), (error) => error.name === "AbortError");
  assert.equal(loaded, false);
});

test("Abbruch beendet auch eine bereits wartende lokale Dekodierung für die Oberfläche", async () => {
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const decoder = createHeicDecoder({
    loadModule: async () => ({
      isHeic: async () => true,
      heicTo: async () => {
        markStarted();
        return new Promise(() => {});
      },
    }),
  });
  const controller = new AbortController();
  const file = namedBlob(["data"], { name: "foto.heic", type: "image/heic" });
  const conversion = decoder.convert(file, { signal: controller.signal });
  await started;
  controller.abort();
  await assert.rejects(conversion, (error) => error.name === "AbortError");
});

test("gemischte Mehrfachauswahl behält Reihenfolge und Standardformate unverändert", async () => {
  const decoded = [];
  const progress = [];
  const workspace = createImageWorkspace({
    document: { createElement: () => ({}) },
    logger: { error() {} },
    heicDecoder: {
      async convert(file) {
        return imageFile(file.name.replace(/\.heic$/i, ".jpg"), "image/jpeg", file.width, file.height, 2048);
      },
    },
    decodeImage: async (file) => {
      decoded.push([file.name, file.type]);
      return { width: file.width, height: file.height, close() {} };
    },
    urlApi: { createObjectURL: (file) => `blob:${file.name}`, revokeObjectURL() {} },
    idGenerator: (() => { let id = 0; return () => ++id; })(),
    yieldToMain: async () => {},
  });
  const files = [
    imageFile("eins.png", "image/png"),
    imageFile("zwei.heic", "image/heic", 600, 900),
    imageFile("drei.jpg", "image/jpeg"),
  ];
  const result = await workspace.addFiles(files, { onProgress: (value) => progress.push(value.status) });
  assert.deepEqual(decoded, [
    ["eins.png", "image/png"],
    ["zwei.jpg", "image/jpeg"],
    ["drei.jpg", "image/jpeg"],
  ]);
  assert.deepEqual(workspace.getPages().map((page) => page.name), ["eins.png", "zwei.jpg", "drei.jpg"]);
  assert.equal(workspace.getPages()[1].convertedFromHeic, true);
  assert.deepEqual(progress, ["Foto 2 von 3 wird vorbereitet."]);
  assert.equal(result.errors.length, 0);
});

test("ein defektes Foto verwirft keine gültigen Dateien und ein Retry dupliziert nichts", async () => {
  let attempts = 0;
  const workspace = createImageWorkspace({
    document: { createElement: () => ({}) },
    logger: { error() {} },
    heicDecoder: {
      async convert(file) {
        attempts += 1;
        if (attempts === 1) throw new TypeError(HEIC_USER_ERROR);
        return imageFile("defekt.jpg", "image/jpeg", file.width, file.height, 2048);
      },
    },
    decodeImage: async (file) => ({ width: file.width, height: file.height, close() {} }),
    urlApi: { createObjectURL: (file) => `blob:${file.name}`, revokeObjectURL() {} },
    idGenerator: (() => { let id = 0; return () => ++id; })(),
    yieldToMain: async () => {},
  });
  const goodOne = imageFile("gut.png", "image/png");
  const broken = imageFile("defekt.heic", "image/heic", 600, 900);
  const goodTwo = imageFile("auch-gut.jpg", "image/jpeg");
  const first = await workspace.addFiles([goodOne, broken, goodTwo]);
  assert.equal(first.added.length, 2);
  assert.equal(first.errors[0].message, HEIC_USER_ERROR);
  assert.deepEqual(workspace.getPages().map((page) => page.name), ["gut.png", "auch-gut.jpg"]);
  const retry = await workspace.addFiles([goodOne, broken, goodTwo]);
  assert.equal(retry.added.length, 1);
  assert.equal(retry.skipped.length, 2);
  assert.deepEqual(workspace.getPages().map((page) => page.name), ["gut.png", "auch-gut.jpg", "defekt.jpg"]);
});

test("reale Testfixtures besitzen HEIC-Signaturen und bleiben test-only", async () => {
  const vendor = await import("../src/author/image-import/vendor/heic-to.js");
  const fixtureRoot = path.join(APP_ROOT, "tests/fixtures/heic");
  for (const name of ["landscape-camera.heic", "portrait-oriented-camera.heic"]) {
    const bytes = await readFile(path.join(fixtureRoot, name));
    const file = namedBlob([bytes], { name, type: "image/heic" });
    assert.equal(await vendor.isHeic(file), true, name);
    assert.ok(bytes.byteLength > 100_000 && bytes.byteLength < 2_000_000, name);
  }
  const corrupt = await readFile(path.join(fixtureRoot, "corrupt-truncated.heic"));
  assert.equal(corrupt.byteLength, 128);
  const readme = await readFile(path.join(fixtureRoot, "README.md"), "utf8");
  assert.match(readme, /keine Lehrwerksseiten/);
  assert.match(readme, /eingebetteter HEIF-Ausrichtung/);
});

test("Decoder, Lizenz und reproduzierbares Manifest sind lokal gebündelt", async () => {
  const vendorRoot = path.join(APP_ROOT, "src/author/image-import/vendor");
  const manifest = JSON.parse(await readFile(path.join(vendorRoot, "asset-manifest.json"), "utf8"));
  assert.deepEqual(manifest.decoder, {
    name: "heic-to",
    version: "1.5.2",
    license: "LGPL-3.0",
    variant: "csp",
    libheifVersion: "1.22.2",
  });
  assert.equal((await stat(path.join(vendorRoot, "heic-to.js"))).size, 2_995_463);
  assert.equal((await stat(path.join(vendorRoot, "heic-to-LICENSE"))).isFile(), true);
  const adapter = await readFile(path.join(APP_ROOT, "src/author/image-import/heic-decoder.js"), "utf8");
  assert.doesNotMatch(adapter, /\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket)\b/);
});

test("HEIC bleibt als deaktivierte Quelle erhalten und fehlt in allen Produkt-Buildplänen", async () => {
  const author = await createBuildFilePlan({
    repositoryRoot: REPOSITORY_ROOT,
    profile: { mode: "author", features: {} },
  });
  const learner = await createBuildFilePlan({
    repositoryRoot: REPOSITORY_ROOT,
    profile: { mode: "learner", features: { motivation: true, pronunciation: true, speedChallenge: true } },
  });
  const authorFiles = author.map((entry) => entry.destination);
  const learnerFiles = learner.map((entry) => entry.destination);
  assert.equal(authorFiles.some((file) => /heic|heif|image-import|^ocr\//i.test(file)), false);
  assert.equal(authorFiles.some((file) => file.startsWith("tests/fixtures/heic")), false);
  assert.equal(learnerFiles.some((file) => /heic|heif|image-import|^ocr\//i.test(file)), false);
  assert.match(createContentSecurityPolicy("author"), /worker-src 'none'/);
  assert.doesNotMatch(createContentSecurityPolicy("author"), /wasm-unsafe-eval|worker-src[^;]*blob:|img-src[^;]*blob:/);
  assert.match(createContentSecurityPolicy("learner"), /worker-src 'none'/);
  assert.doesNotMatch(createContentSecurityPolicy("learner"), /worker-src[^;]*blob:/);
  assert.match(createContentSecurityPolicy("learner"), /img-src 'self'(?:;|$)/);
  assert.doesNotMatch(createContentSecurityPolicy("learner"), /img-src[^;]*(?:data:|blob:)|media-src[^;]*blob:/);
  assert.doesNotMatch(createContentSecurityPolicy("learner"), /img-src[^;]*blob:/);
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

if (failures > 0) process.exitCode = 1;
else console.log(`\n${tests.length}/${tests.length} HEIC-/HEIF-Importtests bestanden.`);
