import { readFile } from "node:fs/promises";

import {
  createStoredZipBytes,
  crc32,
  inspectStoredZipBytes,
  validateZipEntryPath,
} from "../src/scorm-export/zip-store.js";

export { crc32, validateZipEntryPath };

/** Node compatibility wrapper around the shared browser-safe ZIP encoder. */
export function createStoredZip(entries) {
  return Buffer.from(createStoredZipBytes(entries));
}

export function inspectStoredZip(input) {
  const inspected = inspectStoredZipBytes(input);
  return Object.freeze({
    ...inspected,
    entries: Object.freeze(inspected.entries.map((entry) => Object.freeze({
      ...entry,
      data: Buffer.from(entry.data),
    }))),
  });
}

export async function inspectStoredZipFile(file) {
  return inspectStoredZip(await readFile(file));
}
