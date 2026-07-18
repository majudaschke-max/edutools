import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { closeStaticServer, createStaticServer, listenStaticServer } from "./static-server.js";
import { inspectScorm12Manifest } from "./scorm-manifest.js";
import { inspectStoredZipFile } from "./zip-store.js";

const CONTENT_ROOT = "pluginfile.php/11/mod_scorm/content/1";
const PLAYER_ROOT = "mod/scorm/player";

const API_MOCK = `(() => {
  const calls = [];
  const values = { 'cmi.core.lesson_status': 'not attempted', 'cmi.core.exit': '' };
  const initialHref = location.href;
  const log = document.querySelector('#mock-log');
  const status = document.querySelector('#mock-status');
  const record = (name, args) => {
    calls.push({ name, args: [...args] });
    log.textContent = calls.map((entry) => entry.name + '(' + entry.args.join(', ') + ')').join('\\n');
  };
  window.API = {
    LMSInitialize(){ record('LMSInitialize', arguments); return 'true'; },
    LMSGetValue(key){ record('LMSGetValue', arguments); return values[key] || ''; },
    LMSSetValue(key,value){ record('LMSSetValue', arguments); values[key] = String(value); status.textContent = 'Status: ' + values['cmi.core.lesson_status']; return 'true'; },
    LMSCommit(){ record('LMSCommit', arguments); return 'true'; },
    LMSFinish(){ record('LMSFinish', arguments); return 'true'; },
    LMSGetLastError(){ return '0'; },
    LMSGetErrorString(){ return 'No error'; },
    LMSGetDiagnostic(){ return ''; }
  };
  window.MOODLE_SCORM_HARNESS = {
    calls,
    values,
    initialHref,
    get parentUrlUnchanged(){ return location.href === initialHref; }
  };
  status.textContent = 'Status: not attempted';
})();`;

function outerHtml() {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Moodle-naher SCORM-Launch</title>
  <style>html,body{margin:0;font-family:system-ui,sans-serif;background:#f5f3fa;color:#25233b}header{padding:.6rem 1rem;background:#fff;border-bottom:1px solid #d9d4e7}p{margin:.2rem 0}pre{max-height:4rem;overflow:auto;margin:0;padding:.4rem 1rem;background:#27243a;color:#fff;font-size:.75rem}iframe{display:block;width:100%;height:calc(100vh - 6rem);border:0}</style>
</head>
<body>
  <header><strong>Moodle-naher SCORM-1.2-Launch</strong><p id="mock-status">API wird vorbereitet.</p></header>
  <pre id="mock-log" aria-live="polite"></pre>
  <script src="./mock.js"></script>
  <iframe title="Moodle SCORM Player" src="./${PLAYER_ROOT}/index.html?id=123&amp;scoid=456&amp;attempt=1&amp;display=popup"></iframe>
</body>
</html>`;
}

function playerHtml(startFile) {
  return `<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SCORM Player</title><style>html,body,iframe{margin:0;width:100%;height:100%;border:0}</style></head>
<body><iframe title="EduTools SCO" src="../../../${CONTENT_ROOT}/${startFile}"></iframe></body>
</html>`;
}

export async function prepareMoodleScormHarness(packageFile) {
  const zip = await inspectStoredZipFile(packageFile);
  const manifestEntry = zip.entries.find((entry) => entry.path === "imsmanifest.xml");
  const startFile = manifestEntry
    ? inspectScorm12Manifest(manifestEntry.data.toString("utf8")).startFile
    : null;
  if (!startFile || !zip.entries.some((entry) => entry.path === startFile)) {
    throw new Error("Moodle-Harness kann die Manifest-Startdatei nicht laden.");
  }
  const root = await mkdtemp(path.join(tmpdir(), "edutools-moodle-scorm-"));
  const contentRoot = path.join(root, CONTENT_ROOT);
  const playerRoot = path.join(root, PLAYER_ROOT);
  await mkdir(contentRoot, { recursive: true });
  await mkdir(playerRoot, { recursive: true });
  try {
    for (const entry of zip.entries) {
      const target = path.join(contentRoot, entry.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, entry.data);
    }
    await writeFile(path.join(root, "index.html"), outerHtml(), "utf8");
    await writeFile(path.join(root, "mock.js"), API_MOCK, "utf8");
    await writeFile(path.join(playerRoot, "index.html"), playerHtml(startFile), "utf8");
    return Object.freeze({
      root,
      contentRoot,
      playerRoot,
      zip,
      startFile,
      cleanup: () => rm(root, { recursive: true, force: true }),
    });
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

export async function startMoodleScormHarness(packageFile, options = {}) {
  const prepared = await prepareMoodleScormHarness(packageFile);
  const server = createStaticServer({ root: prepared.root });
  try {
    const address = await listenStaticServer(server, { port: options.port ?? 4175 });
    return Object.freeze({
      ...prepared,
      server,
      address,
      launchUrl: `${address.url}/index.html?id=123&scoid=456&attempt=1&display=popup`,
      async close() {
        await closeStaticServer(server);
        await prepared.cleanup();
      },
    });
  } catch (error) {
    await prepared.cleanup();
    throw error;
  }
}
