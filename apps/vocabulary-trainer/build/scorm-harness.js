import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { createStaticServer, listenStaticServer, closeStaticServer } from "./static-server.js";
import { inspectScorm12Manifest } from "./scorm-manifest.js";
import { inspectStoredZipFile } from "./zip-store.js";

function harnessHtml(startFile) {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>EduTools SCORM-1.2-Test-Harness</title>
  <style>
    html,body{margin:0;font-family:system-ui,sans-serif;background:#f5f3fa;color:#25233b}header{padding:.75rem 1rem;background:#fff;border-bottom:1px solid #d9d4e7}p{margin:.25rem 0}iframe{display:block;width:100%;height:calc(100vh - 7rem);border:0}pre{max-height:5rem;overflow:auto;margin:0;padding:.5rem 1rem;background:#27243a;color:#fff;font-size:.75rem}
  </style>
</head>
<body>
  <header><strong>SCORM-1.2-Test-Harness</strong><p id="mock-status">Mock wird vorbereitet.</p></header>
  <pre id="mock-log" aria-live="polite"></pre>
  <script src="mock.js"></script>
  <iframe title="Vocabulary Trainer im SCORM-Test" src="./package/${startFile}"></iframe>
</body>
</html>`;
}

const MOCK_JS = `(() => {
  const params = new URLSearchParams(location.search);
  const log = document.querySelector('#mock-log');
  const status = document.querySelector('#mock-status');
  const calls = [];
  const values = { 'cmi.core.lesson_status': params.get('status') || 'not attempted', 'cmi.core.exit': '' };
  let initialized = false;
  let finished = false;
  let errorCode = '0';
  const fail = params.get('fail') || '';
  const record = (name, args) => { calls.push({ name, args: [...args] }); log.textContent = calls.map((entry) => entry.name + '(' + entry.args.join(', ') + ')').join('\\n'); };
  const result = (name) => { if (fail === name) { errorCode = '101'; return 'false'; } errorCode = '0'; return 'true'; };
  if (params.get('api') !== 'missing') {
    window.API = {
      LMSInitialize(value){ record('LMSInitialize', arguments); initialized = result('initialize') === 'true'; return String(initialized); },
      LMSGetValue(key){ record('LMSGetValue', arguments); return values[key] || ''; },
      LMSSetValue(key,value){ record('LMSSetValue', arguments); if (result('set') === 'false') return 'false'; values[key] = String(value); status.textContent = 'Status: ' + (values['cmi.core.lesson_status'] || 'leer'); return 'true'; },
      LMSCommit(value){ record('LMSCommit', arguments); return result('commit'); },
      LMSFinish(value){ record('LMSFinish', arguments); if (finished) return 'false'; const ok = result('finish'); finished = ok === 'true'; return ok; },
      LMSGetLastError(){ return errorCode; },
      LMSGetErrorString(code){ return code === '0' ? 'No error' : 'Simulated error'; },
      LMSGetDiagnostic(code){ return code === '0' ? '' : 'Harness simulation'; }
    };
    status.textContent = 'API vorhanden, Startstatus: ' + values['cmi.core.lesson_status'];
  } else status.textContent = 'API fehlt (simuliert).';
  window.SCORM_HARNESS = { calls, values, get initialized(){ return initialized; }, get finished(){ return finished; } };
})();`;

export async function prepareScormHarness(packageFile) {
  const zip = await inspectStoredZipFile(packageFile);
  const manifestEntry = zip.entries.find((entry) => entry.path === "imsmanifest.xml");
  const startFile = manifestEntry
    ? inspectScorm12Manifest(manifestEntry.data.toString("utf8")).startFile
    : null;
  if (!startFile || !zip.entries.some((entry) => entry.path === startFile)) {
    throw new Error("SCORM-Harness kann die Manifest-Startdatei nicht laden.");
  }
  const root = await mkdtemp(path.join(tmpdir(), "edutools-scorm-"));
  const packageRoot = path.join(root, "package");
  await mkdir(packageRoot, { recursive: true });
  try {
    for (const entry of zip.entries) {
      const target = path.join(packageRoot, entry.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, entry.data);
    }
    await writeFile(path.join(root, "index.html"), harnessHtml(startFile), "utf8");
    await writeFile(path.join(root, "mock.js"), MOCK_JS, "utf8");
    return Object.freeze({ root, packageRoot, zip, startFile, cleanup: () => rm(root, { recursive: true, force: true }) });
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

export async function startScormHarness(packageFile, options = {}) {
  const prepared = await prepareScormHarness(packageFile);
  const server = createStaticServer({ root: prepared.root });
  try {
    const address = await listenStaticServer(server, { port: options.port ?? 4174 });
    return Object.freeze({
      ...prepared,
      server,
      address,
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
