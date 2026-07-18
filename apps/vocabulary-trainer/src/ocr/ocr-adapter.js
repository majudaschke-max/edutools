import { assertInstalledOcrModels } from "./ocr-language-registry.js";

const LOCAL_ASSETS = Object.freeze({
  module: new URL("./vendor/tesseract/tesseract.esm.min.js", import.meta.url).href,
  workerPath: new URL("./vendor/tesseract/worker.min.js", import.meta.url).href,
  corePath: new URL("./vendor/tesseract/core/", import.meta.url).href,
  langPath: new URL("./vendor/tesseract/lang", import.meta.url).href,
});

function assertLocalUrl(url, baseUrl = import.meta.url) {
  const resolved = new URL(url, baseUrl);
  const base = new URL(baseUrl);
  if (!(["http:", "https:", "file:"].includes(resolved.protocol)) || resolved.origin !== base.origin) {
    throw new TypeError("OCR-Ressourcen müssen lokal aus derselben Author-Auslieferung geladen werden.");
  }
  return resolved.href;
}

export function getLocalOcrAssetPaths() {
  return Object.freeze(Object.fromEntries(
    Object.entries(LOCAL_ASSETS).map(([key, value]) => [key, assertLocalUrl(value)]),
  ));
}

export function normalizeOcrProgress(message, pageIndex = 0, pageCount = 1) {
  const engineProgress = Number.isFinite(message?.progress)
    ? Math.min(1, Math.max(0, message.progress))
    : null;
  const pageProgress = engineProgress === null
    ? null
    : Math.min(1, Math.max(0, (pageIndex + engineProgress) / Math.max(1, pageCount)));
  return Object.freeze({
    status: String(message?.status ?? "Texterkennung läuft."),
    engineProgress,
    progress: pageProgress,
    page: pageIndex + 1,
    pages: pageCount,
  });
}

function numericBox(value = {}) {
  const result = {};
  for (const key of ["x0", "y0", "x1", "y1"]) {
    const number = Number(value[key]);
    result[key] = Number.isFinite(number) ? number : 0;
  }
  return result;
}

function collectWords(blocks) {
  const words = [];
  for (const block of blocks ?? []) {
    for (const paragraph of block?.paragraphs ?? []) {
      for (const line of paragraph?.lines ?? []) {
        for (const word of line?.words ?? []) {
          const text = String(word?.text ?? "").trim();
          if (!text) continue;
          words.push({
            text,
            confidence: Number.isFinite(word.confidence) ? word.confidence : null,
            bbox: numericBox(word.bbox),
            symbols: (word.symbols ?? []).map((symbol) => ({
              text: String(symbol?.text ?? ""),
              confidence: Number.isFinite(symbol?.confidence) ? symbol.confidence : null,
              bbox: numericBox(symbol?.bbox),
            })),
          });
        }
      }
    }
  }
  return words;
}

function collectTsvWords(value) {
  const words = [];
  for (const row of String(value ?? "").split(/\r?\n/u)) {
    const columns = row.split("\t");
    if (columns.length < 12 || Number(columns[0]) !== 5) continue;
    const text = columns.slice(11).join("\t").trim();
    const left = Number(columns[6]);
    const top = Number(columns[7]);
    const width = Number(columns[8]);
    const height = Number(columns[9]);
    if (!text || !(width > 0) || !(height > 0)) continue;
    words.push({
      text,
      confidence: Number.isFinite(Number(columns[10])) ? Number(columns[10]) : null,
      bbox: { x0: left, y0: top, x1: left + width, y1: top + height },
      symbols: [],
    });
  }
  return words;
}

export function normalizeTesseractResult(result, page) {
  const data = result?.data ?? result ?? {};
  const words = collectWords(data.blocks);
  const legacyWords = (data.words ?? []).flatMap((word) => {
    const text = String(word?.text ?? "").trim();
    return text ? [{ text, confidence: Number.isFinite(word.confidence) ? word.confidence : null, bbox: numericBox(word.bbox), symbols: [] }] : [];
  });
  const fallbackWords = words.length > 0 ? words : legacyWords.length > 0 ? legacyWords : collectTsvWords(data.tsv);
  return Object.freeze({
    pageId: String(page?.id ?? ""),
    sourcePageId: page?.sourcePageId ? String(page.sourcePageId) : null,
    regionRole: page?.regionRole ? String(page.regionRole) : null,
    regionOffsetX: Number(page?.regionOffsetX) || 0,
    regionEndX: Number(page?.regionEndX) || Number(page?.width) || 0,
    fullPageWidth: Number(page?.fullPageWidth) || Number(page?.width) || 0,
    fullPageHeight: Number(page?.fullPageHeight) || Number(page?.height) || 0,
    width: Number(page?.width) || 0,
    height: Number(page?.height) || 0,
    text: String(data.text ?? "").trim(),
    confidence: Number.isFinite(data.confidence) ? data.confidence : null,
    blocks: Object.freeze(fallbackWords.map((word) => Object.freeze(word))),
  });
}

async function defaultEngineLoader() {
  return import(LOCAL_ASSETS.module);
}

export function createLocalOcrAdapter(options = {}) {
  const loadEngine = options.engineLoader ?? defaultEngineLoader;
  const assetPaths = options.assetPaths ?? getLocalOcrAssetPaths();
  let worker = null;
  let running = false;
  let aborted = false;
  let initializePromise = null;

  async function terminate() {
    const activeWorker = worker;
    worker = null;
    initializePromise = null;
    if (activeWorker?.terminate) await activeWorker.terminate();
  }

  async function initialize(models, onProgress, pageCount, getPageIndex) {
    if (initializePromise) return initializePromise;
    initializePromise = (async () => {
      const engine = await loadEngine();
      const api = engine?.default ?? engine;
      if (typeof api?.createWorker !== "function") throw new Error("Die lokale OCR-Engine konnte nicht initialisiert werden.");
      worker = await api.createWorker(models, api.OEM?.LSTM_ONLY ?? 1, {
        workerPath: assertLocalUrl(assetPaths.workerPath),
        corePath: assertLocalUrl(assetPaths.corePath),
        langPath: assertLocalUrl(assetPaths.langPath),
        workerBlobURL: false,
        cacheMethod: "none",
        gzip: true,
        logger(message) { onProgress?.(normalizeOcrProgress(message, getPageIndex(), pageCount)); },
        errorHandler(error) { options.logger?.error?.("Lokaler OCR-Workerfehler.", error); },
      });
      return worker;
    })();
    return initializePromise;
  }

  async function recognizePages(pages, runOptions = {}) {
    if (running) throw new Error("Eine Texterkennung läuft bereits.");
    if (!Array.isArray(pages) || pages.length === 0) throw new TypeError("Wähle mindestens ein vorbereitetes Bild aus.");
    const models = assertInstalledOcrModels(runOptions.models);
    running = true;
    aborted = false;
    const results = [];
    let pageIndex = 0;
    const onProgress = runOptions.onProgress;
    const abortSignal = runOptions.signal;
    const abortHandler = () => { aborted = true; void terminate(); };
    abortSignal?.addEventListener?.("abort", abortHandler, { once: true });
    try {
      const activeWorker = await initialize(models, onProgress, pages.length, () => pageIndex);
      if (aborted || abortSignal?.aborted) throw new DOMException("Texterkennung abgebrochen.", "AbortError");
      for (pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
        const page = pages[pageIndex];
        onProgress?.(Object.freeze({ status: `Seite ${pageIndex + 1} von ${pages.length} wird erkannt.`, progress: pageIndex / pages.length, engineProgress: 0, page: pageIndex + 1, pages: pages.length }));
        const recognized = await activeWorker.recognize(page.image, {}, { text: true, blocks: true, tsv: true });
        if (aborted || abortSignal?.aborted) throw new DOMException("Texterkennung abgebrochen.", "AbortError");
        results.push(normalizeTesseractResult(recognized, page));
      }
      return Object.freeze(results);
    } catch (error) {
      if (aborted || abortSignal?.aborted || error?.name === "AbortError") {
        throw new DOMException("Texterkennung abgebrochen.", "AbortError");
      }
      options.logger?.error?.("Lokale Texterkennung fehlgeschlagen.", error);
      throw new Error("Die lokale Texterkennung konnte nicht abgeschlossen werden.", { cause: error });
    } finally {
      abortSignal?.removeEventListener?.("abort", abortHandler);
      await terminate();
      running = false;
    }
  }

  async function abort() {
    aborted = true;
    await terminate();
  }

  return Object.freeze({ abort, isRunning: () => running, recognizePages, terminate });
}
