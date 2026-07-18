#!/usr/bin/env node
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");

async function walk(root, relative = "") {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (["dist", ".git", "node_modules", "private"].includes(entry.name)) continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await walk(root, child));
    else if (entry.isFile() && entry.name.endsWith(".json")) result.push(child);
  }
  return result;
}

try {
  const files = await walk(repositoryRoot);
  for (const file of files) JSON.parse(await readFile(path.join(repositoryRoot, file), "utf8"));
  console.log(`${files.length} JSON-Dateien validiert.`);
} catch (error) {
  console.error(`JSON-Validierung fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
}
