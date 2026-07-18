import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(appRoot, "src/ocr/vendor");

async function packageRoot(name) {
  const packageJson = import.meta.resolve(`${name}/package.json`);
  return path.dirname(fileURLToPath(packageJson));
}

async function copyAsset(source, destination, transform = null) {
  const target = path.join(outputRoot, destination);
  await mkdir(path.dirname(target), { recursive: true });
  if (transform) {
    await writeFile(target, transform(await readFile(source, "utf8")), "utf8");
  } else await copyFile(source, target);
  const bytes = await readFile(target);
  return {
    file: destination.replaceAll(path.sep, "/"),
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

await rm(outputRoot, { recursive: true, force: true });

const tesseractRoot = await packageRoot("tesseract.js");
const coreRoot = await packageRoot("tesseract.js-core");
const files = [];

function removeCdnFallbacks(source) {
  return source
    .replaceAll("https://cdn.jsdelivr.net/npm/tesseract.js@v", "./ocr-local-unconfigured/tesseract.js@v")
    .replaceAll("https://cdn.jsdelivr.net/npm/@tesseract.js-data/", "./ocr-local-unconfigured/lang/")
    .replaceAll("https://cdn.jsdelivr.net/npm/tesseract.js-core@v", "./ocr-local-unconfigured/core@v");
}

for (const [source, destination, transform] of [
  [path.join(tesseractRoot, "dist/tesseract.esm.min.js"), "tesseract/tesseract.esm.min.js", removeCdnFallbacks],
  [path.join(tesseractRoot, "dist/worker.min.js"), "tesseract/worker.min.js", removeCdnFallbacks],
  [path.join(tesseractRoot, "LICENSE.md"), "licenses/tesseract.js-LICENSE.md"],
  [path.join(coreRoot, "LICENSE"), "licenses/tesseract.js-core-LICENSE"],
]) {
  files.push(await copyAsset(source, destination, transform));
}

for (const name of [
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm.js",
]) {
  files.push(await copyAsset(path.join(coreRoot, name), `tesseract/core/${name}`));
}

for (const language of ["deu", "eng", "fra", "lat"]) {
  const languageRoot = await packageRoot(`@tesseract.js-data/${language}`);
  files.push(await copyAsset(
    path.join(languageRoot, `4.0.0_best_int/${language}.traineddata.gz`),
    `tesseract/lang/${language}.traineddata.gz`,
  ));
}

files.sort((left, right) => left.file.localeCompare(right.file));
await writeFile(path.join(outputRoot, "asset-manifest.json"), `${JSON.stringify({
  schemaVersion: 1,
  engine: { name: "tesseract.js", version: "7.0.0" },
  core: { name: "tesseract.js-core", version: "7.0.0", mode: "lstm-only" },
  languageData: { packageVersion: "1.0.0", variant: "4.0.0_best_int", installed: ["deu", "eng", "fra", "lat"] },
  files,
}, null, 2)}\n`, "utf8");

process.stdout.write(`OCR-Assets vendored: ${files.length} files, ${files.reduce((sum, file) => sum + file.bytes, 0)} bytes.\n`);
