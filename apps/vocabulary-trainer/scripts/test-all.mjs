#!/usr/bin/env node
import path from "node:path";
import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const testRoot = path.join(repositoryRoot, "apps/vocabulary-trainer/tests");
const tests = (await readdir(testRoot))
  .filter((file) => file.endsWith(".test.mjs"))
  .sort();

function run(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(testRoot, file)], {
      cwd: repositoryRoot,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${file} schlug mit Exit-Code ${code} fehl.`))));
  });
}

try {
  for (const file of tests) await run(file);
  console.log(`\nAlle ${tests.length} Testsuiten bestanden.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
