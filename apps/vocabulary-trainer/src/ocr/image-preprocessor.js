import {
  createHeicDecoder,
  HEIC_USER_ERROR,
  isHeicImageFile,
} from "../author/image-import/heic-decoder.js";
import {
  calculateQuickImportRegions,
  detectQuickImportBoundariesFromPixels,
} from "./ocr-quick-import.js";

export const OCR_IMAGE_LIMITS = Object.freeze({
  maxFiles: 10,
  maxFileBytes: 20 * 1024 * 1024,
  maxWorkingDimension: 2400,
  minDimension: 100,
});

const STANDARD_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extension(name) {
  return String(name ?? "").trim().toLocaleLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

export function classifyOcrImageFile(file) {
  const type = String(file?.type ?? "").toLocaleLowerCase();
  const suffix = extension(file?.name);
  const standard = STANDARD_TYPES.has(type) || ["jpg", "jpeg", "png", "webp"].includes(suffix);
  const heic = isHeicImageFile(file);
  return Object.freeze({
    supported: standard || heic,
    isHeic: heic,
    requiresConversion: heic,
    requiresNativeDecode: false,
    type: type || suffix,
  });
}

export function validateOcrImageFile(file, options = {}) {
  if (!file || typeof file !== "object") throw new TypeError("Die Bilddatei ist ungültig.");
  const classification = classifyOcrImageFile(file);
  if (!classification.supported) throw new TypeError("Unterstützt werden iPhone-Fotos, JPEG-, PNG- und WebP-Bilder.");
  const size = Number(file.size);
  if (!Number.isFinite(size) || size <= 0) throw new TypeError("Die Bilddatei ist leer.");
  if (size > (options.maxFileBytes ?? OCR_IMAGE_LIMITS.maxFileBytes)) {
    throw new TypeError("Das Bild ist größer als 20 MB. Verwende eine kleinere Arbeitskopie.");
  }
  return classification;
}

function fileFingerprint(file) {
  return [file?.name, file?.type, file?.size, file?.lastModified].map((value) => String(value ?? "")).join("\u0000");
}

function abortError() {
  return new DOMException("Die Bildvorbereitung wurde abgebrochen.", "AbortError");
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function finitePercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(90, Math.max(0, number)) : 0;
}

export function normalizeCrop(crop = {}) {
  const result = {
    top: finitePercent(crop.top),
    right: finitePercent(crop.right),
    bottom: finitePercent(crop.bottom),
    left: finitePercent(crop.left),
  };
  if (result.left + result.right >= 95 || result.top + result.bottom >= 95) {
    throw new RangeError("Der Zuschneidebereich muss sichtbar größer als null bleiben.");
  }
  return Object.freeze(result);
}

export function normalizeRotation(value) {
  const rotation = ((Number(value) % 360) + 360) % 360;
  if (![0, 90, 180, 270].includes(rotation)) throw new RangeError("Bilder können nur in 90-Grad-Schritten gedreht werden.");
  return rotation;
}

export function calculateWorkingSize(width, height, maxDimension = OCR_IMAGE_LIMITS.maxWorkingDimension) {
  if (!(width > 0) || !(height > 0)) throw new RangeError("Das Bild besitzt keine gültigen Abmessungen.");
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return Object.freeze({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale });
}

export function rotatedDimensions(width, height, rotation) {
  const normalized = normalizeRotation(rotation);
  return normalized === 90 || normalized === 270
    ? Object.freeze({ width: height, height: width })
    : Object.freeze({ width, height });
}

function createCanvas(documentRoot, width, height) {
  const canvas = documentRoot.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function drawPreparedCanvas(documentRoot, page, maxDimension) {
  const crop = normalizeCrop(page.crop);
  const sourceWidth = page.bitmap.width;
  const sourceHeight = page.bitmap.height;
  const sx = sourceWidth * crop.left / 100;
  const sy = sourceHeight * crop.top / 100;
  const sw = sourceWidth * (100 - crop.left - crop.right) / 100;
  const sh = sourceHeight * (100 - crop.top - crop.bottom) / 100;
  const working = calculateWorkingSize(sw, sh, maxDimension);
  const intermediate = createCanvas(documentRoot, working.width, working.height);
  const intermediateContext = intermediate.getContext("2d", { alpha: false });
  if (!intermediateContext) throw new Error("Die Bildarbeitskopie konnte nicht erstellt werden.");
  intermediateContext.imageSmoothingEnabled = true;
  intermediateContext.imageSmoothingQuality = "high";
  intermediateContext.drawImage(page.bitmap, sx, sy, sw, sh, 0, 0, intermediate.width, intermediate.height);

  const outputSize = rotatedDimensions(intermediate.width, intermediate.height, page.rotation);
  const output = createCanvas(documentRoot, outputSize.width, outputSize.height);
  const context = output.getContext("2d", { alpha: false });
  if (!context) throw new Error("Die gedrehte Bildarbeitskopie konnte nicht erstellt werden.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, output.width, output.height);
  context.translate(output.width / 2, output.height / 2);
  context.rotate(page.rotation * Math.PI / 180);
  context.drawImage(intermediate, -intermediate.width / 2, -intermediate.height / 2);
  intermediate.width = 1;
  intermediate.height = 1;
  return output;
}

function canvasToBlob(canvas, type = "image/png") {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Die lokale Bildvorschau konnte nicht erzeugt werden."));
    }, type, 0.95);
  });
}

export function createImageWorkspace(options = {}) {
  const documentRoot = options.document ?? globalThis.document;
  const decode = options.decodeImage ?? globalThis.createImageBitmap?.bind(globalThis);
  const urlApi = options.urlApi ?? globalThis.URL;
  const idGenerator = options.idGenerator ?? (() => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
  const maxDimension = options.maxWorkingDimension ?? OCR_IMAGE_LIMITS.maxWorkingDimension;
  const heicDecoder = options.heicDecoder ?? createHeicDecoder();
  const yieldToMain = options.yieldToMain ?? (() => new Promise((resolve) => globalThis.setTimeout(resolve, 0)));
  const logger = options.logger ?? console;
  const pages = [];
  const transientUrls = new Set();

  if (!documentRoot || typeof decode !== "function" || !urlApi?.createObjectURL) {
    throw new Error("Dieser Browser stellt die benötigte lokale Bildverarbeitung nicht bereit.");
  }

  function snapshot(page) {
    return Object.freeze({
      id: page.id,
      name: page.name,
      type: page.type,
      size: page.size,
      width: page.bitmap.width,
      height: page.bitmap.height,
      rotation: page.rotation,
      crop: Object.freeze({ ...page.crop }),
      previewUrl: page.previewUrl,
      convertedFromHeic: page.convertedFromHeic,
    });
  }

  async function addFiles(fileList, addOptions = {}) {
    const files = [...(fileList ?? [])];
    if (files.length === 0) throw new TypeError("Wähle mindestens ein Bild aus.");
    const fingerprints = new Set(pages.map((page) => page.sourceFingerprint));
    const candidates = files.filter((file) => !fingerprints.has(fileFingerprint(file)));
    if (pages.length + candidates.length > OCR_IMAGE_LIMITS.maxFiles) throw new TypeError(`Pro Import sind höchstens ${OCR_IMAGE_LIMITS.maxFiles} Bilder vorgesehen.`);
    const added = [];
    const errors = [];
    const skipped = [];
    for (const [index, file] of files.entries()) {
      const sourceFingerprint = fileFingerprint(file);
      if (fingerprints.has(sourceFingerprint)) {
        skipped.push(Object.freeze({ name: String(file?.name || "Bild"), reason: "duplicate" }));
        continue;
      }
      let classification;
      let workingFile = file;
      let bitmap = null;
      try {
        classification = validateOcrImageFile(file, options);
        throwIfAborted(addOptions.signal);
        if (classification.requiresConversion) {
          addOptions.onProgress?.(Object.freeze({
            current: index + 1,
            total: files.length,
            name: String(file.name || "iPhone-Foto"),
            status: files.length === 1
              ? "iPhone-Foto wird vorbereitet."
              : `Foto ${index + 1} von ${files.length} wird vorbereitet.`,
          }));
          await yieldToMain();
          throwIfAborted(addOptions.signal);
          workingFile = await heicDecoder.convert(file, { signal: addOptions.signal });
        }
        throwIfAborted(addOptions.signal);
        bitmap = await decode(workingFile, { imageOrientation: "from-image" });
        throwIfAborted(addOptions.signal);
        if (Math.min(bitmap.width, bitmap.height) < OCR_IMAGE_LIMITS.minDimension) {
          bitmap.close?.();
          throw new TypeError("Das Bild ist für eine verlässliche Analyse zu klein.");
        }
        const previewUrl = urlApi.createObjectURL(workingFile);
        transientUrls.add(previewUrl);
        const page = {
          id: `ocr-page-${idGenerator()}`,
          name: String(workingFile.name || file.name || `Bild ${pages.length + 1}`),
          originalName: String(file.name || `Bild ${pages.length + 1}`),
          type: String(workingFile.type || "image"),
          size: workingFile.size,
          bitmap,
          file: workingFile,
          previewUrl,
          rotation: 0,
          crop: { top: 0, right: 0, bottom: 0, left: 0 },
          convertedFromHeic: Boolean(classification.requiresConversion),
          sourceFingerprint,
        };
        pages.push(page);
        bitmap = null;
        fingerprints.add(sourceFingerprint);
        added.push(snapshot(page));
      } catch (error) {
        bitmap?.close?.();
        if (error?.name === "AbortError") throw error;
        logger.error?.("Lokale Bildvorbereitung fehlgeschlagen.", error);
        const message = classification?.requiresConversion || isHeicImageFile(file)
          ? HEIC_USER_ERROR
          : (error?.message || "Das Bild konnte nicht lokal dekodiert werden.");
        errors.push(Object.freeze({ name: String(file?.name || "Bild"), message }));
      }
    }
    return Object.freeze({
      added: Object.freeze(added),
      errors: Object.freeze(errors),
      skipped: Object.freeze(skipped),
    });
  }

  function getPages() { return pages.map(snapshot); }

  function requirePage(pageId) {
    const page = pages.find((item) => item.id === pageId);
    if (!page) throw new Error("Die Bildseite wurde nicht gefunden.");
    return page;
  }

  function rotate(pageId, delta = 90) {
    const page = requirePage(pageId);
    page.rotation = normalizeRotation(page.rotation + delta);
    return snapshot(page);
  }

  function setCrop(pageId, crop) {
    const page = requirePage(pageId);
    page.crop = { ...normalizeCrop(crop) };
    return snapshot(page);
  }

  function reset(pageId) {
    const page = requirePage(pageId);
    page.rotation = 0;
    page.crop = { top: 0, right: 0, bottom: 0, left: 0 };
    return snapshot(page);
  }

  function move(pageId, direction) {
    const index = pages.findIndex((page) => page.id === pageId);
    const target = index + (direction === "up" ? -1 : 1);
    if (index >= 0 && target >= 0 && target < pages.length) [pages[index], pages[target]] = [pages[target], pages[index]];
    return getPages();
  }

  function releasePage(pageId) {
    const index = pages.findIndex((page) => page.id === pageId);
    if (index < 0) return false;
    const [page] = pages.splice(index, 1);
    page.bitmap.close?.();
    if (transientUrls.delete(page.previewUrl)) urlApi.revokeObjectURL(page.previewUrl);
    return true;
  }

  function prepare(pageId) {
    const page = requirePage(pageId);
    const canvas = drawPreparedCanvas(documentRoot, page, maxDimension);
    return Object.freeze({ id: page.id, image: canvas, width: canvas.width, height: canvas.height, release() { canvas.width = 1; canvas.height = 1; } });
  }

  function prepareQuickImportRegions(pageId, boundaryValues) {
    const prepared = prepare(pageId);
    const definitions = calculateQuickImportRegions(prepared.width, prepared.height, boundaryValues);
    try {
      return Object.freeze(definitions.map(({ role, x0, x1 }) => {
        const canvas = createCanvas(documentRoot, x1 - x0, prepared.height);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Der Schnellimport-Bereich konnte nicht vorbereitet werden.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(prepared.image, x0, 0, x1 - x0, prepared.height, 0, 0, canvas.width, canvas.height);
        return Object.freeze({
          id: `${pageId}::quick-${role}`,
          sourcePageId: pageId,
          regionRole: role,
          regionOffsetX: x0,
          regionEndX: x1,
          fullPageWidth: prepared.width,
          fullPageHeight: prepared.height,
          image: canvas,
          width: canvas.width,
          height: canvas.height,
          release() { canvas.width = 1; canvas.height = 1; },
        });
      }));
    } finally {
      prepared.release();
    }
  }

  function suggestQuickImportBoundaries(pageId) {
    const prepared = prepare(pageId);
    try {
      const context = prepared.image.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Die automatische Spaltenaufteilung konnte nicht ermittelt werden.");
      const pixels = context.getImageData(0, 0, prepared.width, prepared.height).data;
      return detectQuickImportBoundariesFromPixels(pixels, prepared.width, prepared.height);
    } finally {
      prepared.release();
    }
  }

  async function createRowCropUrl(pageId, bbox) {
    const prepared = prepare(pageId);
    const source = prepared.image;
    const x0 = Math.max(0, Math.floor(Number(bbox?.x0) || 0));
    const y0 = Math.max(0, Math.floor(Number(bbox?.y0) || 0));
    const x1 = Math.min(source.width, Math.ceil(Number(bbox?.x1) || source.width));
    const y1 = Math.min(source.height, Math.ceil(Number(bbox?.y1) || source.height));
    if (x1 <= x0 || y1 <= y0) { prepared.release(); throw new RangeError("Der Zeilenausschnitt ist ungültig."); }
    const canvas = createCanvas(documentRoot, x1 - x0, y1 - y0);
    canvas.getContext("2d", { alpha: false }).drawImage(source, x0, y0, x1 - x0, y1 - y0, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas);
    const url = urlApi.createObjectURL(blob);
    transientUrls.add(url);
    canvas.width = 1;
    canvas.height = 1;
    prepared.release();
    return url;
  }

  function revokeTransientUrl(url) {
    if (transientUrls.delete(url)) urlApi.revokeObjectURL(url);
  }

  function releaseAll() {
    pages.splice(0).forEach((page) => page.bitmap.close?.());
    transientUrls.forEach((url) => urlApi.revokeObjectURL(url));
    transientUrls.clear();
  }

  return Object.freeze({ addFiles, createRowCropUrl, getPages, move, prepare, prepareQuickImportRegions, releaseAll, releasePage, reset, revokeTransientUrl, rotate, setCrop, suggestQuickImportBoundaries });
}
