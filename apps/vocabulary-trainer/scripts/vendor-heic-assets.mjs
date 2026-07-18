import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(appRoot, "src/author/image-import/vendor");
const modulePath = fileURLToPath(import.meta.resolve("heic-to/csp"));
const packageRoot = path.resolve(path.dirname(modulePath), "../..");

async function copyAsset(source, destination) {
  const target = path.join(outputRoot, destination);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  const bytes = await readFile(target);
  return {
    file: destination.replaceAll(path.sep, "/"),
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

await rm(outputRoot, { recursive: true, force: true });
const files = [
  await copyAsset(modulePath, "heic-to.js"),
  await copyAsset(path.join(packageRoot, "LICENSE"), "heic-to-LICENSE"),
];

files.sort((left, right) => left.file.localeCompare(right.file));
await writeFile(path.join(outputRoot, "asset-manifest.json"), `${JSON.stringify({
  schemaVersion: 1,
  decoder: {
    name: "heic-to",
    version: "1.5.2",
    license: "LGPL-3.0",
    variant: "csp",
    libheifVersion: "1.22.2",
  },
  files,
}, null, 2)}\n`, "utf8");

process.stdout.write(`HEIC-Assets vendored: ${files.length} files, ${files.reduce((sum, file) => sum + file.bytes, 0)} bytes.\n`);
