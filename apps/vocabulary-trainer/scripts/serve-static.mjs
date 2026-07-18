#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createStaticServer, listenStaticServer, closeStaticServer } from "../build/static-server.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const argv = process.argv.slice(2);
function argument(name, fallback) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}
const root = path.resolve(repositoryRoot, argument("--root", "dist/pages"));
const port = Number(argument("--port", "4173"));
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("--port ist ungültig.");
const server = createStaticServer({ root });
const address = await listenStaticServer(server, { port });
console.log(`Statisches Pages-Artefakt: ${address.url}`);
const stop = async () => {
  await closeStaticServer(server);
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
