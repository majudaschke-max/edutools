export const QUICK_IMPORT_DEFAULT_BOUNDARIES = Object.freeze([34, 68]);

const TABLE_ARTIFACTS = /[|¦│┃‖]+/gu;
const BOX_ARTIFACTS = /[□■◆◇▯▢⚠⚡]+/gu;
const PAGE_REFERENCE = /(?:^|\s)(?:p(?:age)?|s(?:eite)?)\.?\s*\d{1,3}(?=\s|$)/giu;
const ISOLATED_LINE = /(?:^|\s)[_―—–-]{1,4}(?=\s|$)/gu;
const EDGE_NUMBER = /(?:^\s*\d{1,3}[.)]?\s+|\s+\d{1,3}[.)]?\s*$)/gu;

export function normalizeQuickImportBoundaries(values = QUICK_IMPORT_DEFAULT_BOUNDARIES) {
  const source = Number(values?.[0]);
  const ignored = Number(values?.[1]);
  if (!Number.isFinite(source) || !Number.isFinite(ignored)) {
    return Object.freeze([...QUICK_IMPORT_DEFAULT_BOUNDARIES]);
  }
  const first = Math.min(70, Math.max(15, source));
  const second = Math.min(92, Math.max(first + 12, ignored));
  return Object.freeze([Number(first.toFixed(1)), Number(second.toFixed(1))]);
}

export function calculateQuickImportRegions(width, height, boundaryValues) {
  if (!(Number(width) > 0) || !(Number(height) > 0)) throw new RangeError("Die Buchseite besitzt keine gültige Größe.");
  const boundaries = normalizeQuickImportBoundaries(boundaryValues);
  const sourceEnd = Math.round(Number(width) * boundaries[0] / 100);
  const targetEnd = Math.round(Number(width) * boundaries[1] / 100);
  return Object.freeze([
    Object.freeze({ role: "source", x0: 0, x1: sourceEnd, width: sourceEnd, height: Number(height) }),
    Object.freeze({ role: "target", x0: sourceEnd, x1: targetEnd, width: targetEnd - sourceEnd, height: Number(height) }),
  ]);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * Finds long vertical separators before OCR. If no separator is sufficiently
 * distinct from ordinary text, the calm one-third proposal remains in place.
 */
export function detectQuickImportBoundariesFromPixels(pixels, width, height) {
  const pageWidth = Math.floor(Number(width));
  const pageHeight = Math.floor(Number(height));
  if (!(pageWidth > 0) || !(pageHeight > 0) || Number(pixels?.length) < pageWidth * pageHeight * 4) {
    return Object.freeze([...QUICK_IMPORT_DEFAULT_BOUNDARIES]);
  }
  const yStep = Math.max(1, Math.floor(pageHeight / 600));
  const scores = new Float32Array(pageWidth);
  for (let x = 0; x < pageWidth; x += 1) {
    let ink = 0;
    let samples = 0;
    for (let y = 0; y < pageHeight; y += yStep) {
      const offset = (y * pageWidth + x) * 4;
      const lightness = (Number(pixels[offset]) + Number(pixels[offset + 1]) + Number(pixels[offset + 2])) / 3;
      if (Number(pixels[offset + 3]) > 0 && lightness < 218) ink += 1;
      samples += 1;
    }
    scores[x] = samples ? ink / samples : 0;
  }

  function findSeparator(minPercent, maxPercent, fallback) {
    const start = Math.max(0, Math.floor(pageWidth * minPercent / 100));
    const end = Math.min(pageWidth - 1, Math.ceil(pageWidth * maxPercent / 100));
    const candidates = [];
    let bestX = start;
    let bestScore = -1;
    for (let x = start; x <= end; x += 1) {
      const score = scores[x];
      candidates.push(score);
      if (score > bestScore) { bestScore = score; bestX = x; }
    }
    const background = median(candidates);
    if (bestScore < 0.4 || bestScore - background < 0.18) return fallback;
    return Number(((bestX / pageWidth) * 100).toFixed(1));
  }

  return normalizeQuickImportBoundaries([
    findSeparator(20, 50, QUICK_IMPORT_DEFAULT_BOUNDARIES[0]),
    findSeparator(52, 97, QUICK_IMPORT_DEFAULT_BOUNDARIES[1]),
  ]);
}

function removeDuplicatedTailBeforeIpa(value) {
  const match = value.match(/^(.*?)\s+(\[[^\]\n]{1,80}\])(?:\s*)$/u);
  if (!match) return value;
  const lexical = match[1].trim();
  const words = lexical.split(/\s+/u);
  if (words.length < 3 || /[()]/u.test(words[0])) return value;
  const first = words[0].toLocaleLowerCase();
  const last = words.at(-1).replace(/[^\p{L}]/gu, "").toLocaleLowerCase();
  if (first.length > 4 && last.length >= 3 && first.endsWith(last)) return `${words[0]} ${match[2]}`;
  return value;
}

/** Conservative, language-neutral cleanup used before any draft field is created. */
export function cleanQuickImportText(value, options = {}) {
  let text = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201B\u02BC\uFF07]/gu, "'")
    .replace(TABLE_ARTIFACTS, " ")
    .replace(BOX_ARTIFACTS, " ")
    .replace(PAGE_REFERENCE, " ")
    .replace(ISOLATED_LINE, " ")
    .replace(EDGE_NUMBER, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (options.field === "source") text = removeDuplicatedTailBeforeIpa(text);
  return text;
}

export function hasQuickImportArtifact(value) {
  const text = String(value ?? "");
  return /[|¦│┃‖]/u.test(text)
    || /[□■◆◇▯▢⚠⚡]/u.test(text)
    || /(?:^|\s)(?:p(?:age)?|s(?:eite)?)\.?\s*\d{1,3}(?=\s|$)/iu.test(` ${text} `)
    || /^\s*(?:\d{1,3}[.)]?|[-–—_=]+)\s*$/u.test(text);
}

function offsetBox(value, offsetX) {
  return {
    x0: Number(value?.x0 || 0) + offsetX,
    y0: Number(value?.y0 || 0),
    x1: Number(value?.x1 || 0) + offsetX,
    y1: Number(value?.y1 || 0),
  };
}

/** Recombines separately recognized source/target crops into one geometry-only page. */
export function mergeQuickImportRegionResults(results) {
  const groups = new Map();
  for (const result of results ?? []) {
    if (!result?.sourcePageId || !["source", "target"].includes(result.regionRole)) continue;
    if (!groups.has(result.sourcePageId)) groups.set(result.sourcePageId, []);
    groups.get(result.sourcePageId).push(result);
  }
  return Object.freeze([...groups.entries()].map(([pageId, regions]) => {
    const ordered = regions.sort((left, right) => Number(left.regionOffsetX) - Number(right.regionOffsetX));
    const source = ordered.find((item) => item.regionRole === "source");
    const target = ordered.find((item) => item.regionRole === "target");
    if (!source || !target) throw new Error("Source- und Target-Bereich müssen getrennt erkannt worden sein.");
    const blocks = ordered.flatMap((region) => (region.blocks ?? []).map((word) => Object.freeze({
      ...word,
      text: cleanQuickImportText(word.text, { field: region.regionRole }),
      bbox: Object.freeze(offsetBox(word.bbox, Number(region.regionOffsetX) || 0)),
      regionRole: region.regionRole,
    }))).filter((word) => word.text);
    return Object.freeze({
      pageId,
      width: Number(source.fullPageWidth || target.fullPageWidth),
      height: Math.max(Number(source.fullPageHeight || source.height), Number(target.fullPageHeight || target.height)),
      text: blocks.map((word) => word.text).join(" "),
      confidence: null,
      blocks: Object.freeze(blocks),
      quickBoundaries: Object.freeze([
        Number(source.regionEndX),
        Number(target.regionEndX),
      ]),
      importMode: "quick",
    });
  }));
}
