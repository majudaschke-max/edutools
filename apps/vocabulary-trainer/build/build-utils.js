import path from "node:path";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";

export async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

export async function copyPlannedFiles(plan, destinationRoot) {
  for (const item of plan) {
    const target = path.join(destinationRoot, item.destination);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(item.source, target);
  }
}

export async function writeJson(target, value) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function listFiles(root, relative = "") {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(root, child));
    else if (entry.isFile()) result.push(child.replace(/\\/g, "/"));
  }
  return result;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function removeBuildBlock(source, name) {
  const pattern = new RegExp(`\\s*<!-- build:${name}:start -->[\\s\\S]*?<!-- build:${name}:end -->`, "g");
  return source.replace(pattern, "");
}

export function removeBuildMarkers(source) {
  return source.replace(/\s*<!-- build:[a-z-]+:(?:start|end) -->/g, "");
}

export async function readText(target) {
  return readFile(target, "utf8");
}

export async function cleanDirectory(target) {
  await rm(target, { recursive: true, force: true });
}

