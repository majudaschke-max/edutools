#!/usr/bin/env node
import path from "node:path";
import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
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
    else if (entry.isFile() && /\.(?:js|mjs)$/.test(entry.name)) result.push(child);
  }
  return result;
}

function check(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--check", file], { cwd: repositoryRoot, stdio: "pipe" });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${file}: ${stderr.trim()}`))));
  });
}

try {
  const files = await walk(repositoryRoot);
  for (const file of files) await check(file);
  console.log(`${files.length} JavaScript-Dateien syntaktisch geprüft.`);
} catch (error) {
  console.error(`Syntaxprüfung fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
}
