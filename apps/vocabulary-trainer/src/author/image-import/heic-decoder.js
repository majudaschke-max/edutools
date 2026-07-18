/**
 * Author-only HEIC/HEIF adapter.
 *
 * The decoder is loaded only for matching files. Its JPEG output contains the
 * rendered pixels, but no source EXIF/GPS metadata. Keeping this boundary here
 * prevents format-specific code from leaking into the generic OCR workspace.
 */

export const HEIC_JPEG_QUALITY = 0.92;
export const HEIC_USER_ERROR = "Dieses iPhone-Foto konnte nicht verarbeitet werden. Bitte wähle ein anderes Foto oder exportiere es als JPEG.";

const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);
const HEIC_EXTENSIONS = new Set(["heic", "heif"]);

function extension(name) {
  return String(name ?? "").trim().toLocaleLowerCase().match(/\.([a-z0-9]+)$/u)?.[1] ?? "";
}

export function isHeicImageFile(file) {
  const type = String(file?.type ?? "").trim().toLocaleLowerCase();
  return HEIC_MIME_TYPES.has(type) || HEIC_EXTENSIONS.has(extension(file?.name));
}

export function createHeicJpegName(name) {
  const value = String(name || "iPhone-Foto").trim() || "iPhone-Foto";
  return /\.(?:heic|heif)$/iu.test(value)
    ? value.replace(/\.(?:heic|heif)$/iu, ".jpg")
    : `${value}.jpg`;
}

function abortError() {
  return new DOMException("Die Vorbereitung des iPhone-Fotos wurde abgebrochen.", "AbortError");
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function abortable(promise, signal) {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => { cleanup(); resolve(value); },
      (error) => { cleanup(); reject(error); },
    );
  });
}

function nameJpegBlob(blob, sourceFile, createFile) {
  const name = createHeicJpegName(sourceFile?.name);
  const lastModified = Number(sourceFile?.lastModified) || Date.now();
  if (typeof createFile === "function") return createFile(blob, name, lastModified);
  if (typeof globalThis.File === "function") {
    return new globalThis.File([blob], name, { type: "image/jpeg", lastModified });
  }
  Object.defineProperties(blob, {
    name: { configurable: true, value: name },
    lastModified: { configurable: true, value: lastModified },
  });
  return blob;
}

async function defaultLoader() {
  return import("./vendor/heic-to.js");
}

export function createHeicDecoder(options = {}) {
  const loadModule = options.loadModule ?? defaultLoader;
  const quality = options.quality ?? HEIC_JPEG_QUALITY;
  const createFile = options.createFile;
  let modulePromise = null;

  async function convert(file, conversionOptions = {}) {
    const { signal } = conversionOptions;
    if (!isHeicImageFile(file)) throw new TypeError("Die Datei ist kein HEIC-/HEIF-Bild.");
    if (!(Number(file?.size) > 0)) throw new TypeError(HEIC_USER_ERROR);
    throwIfAborted(signal);

    try {
      modulePromise ??= Promise.resolve().then(loadModule);
      const decoder = await modulePromise;
      throwIfAborted(signal);
      if (typeof decoder?.isHeic !== "function" || typeof decoder?.heicTo !== "function") {
        throw new Error("Der lokale HEIC-Decoder ist unvollständig.");
      }
      if (!await abortable(decoder.isHeic(file), signal)) throw new Error("Die HEIC-Dateisignatur ist ungültig.");
      throwIfAborted(signal);
      const blob = await abortable(decoder.heicTo({ blob: file, type: "image/jpeg", quality }), signal);
      throwIfAborted(signal);
      if (!(blob instanceof Blob) || blob.size <= 0) throw new Error("Der lokale HEIC-Decoder lieferte kein Bild.");
      return nameJpegBlob(blob, file, createFile);
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      throw new TypeError(HEIC_USER_ERROR, { cause: error });
    }
  }

  return Object.freeze({ convert });
}
