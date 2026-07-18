import { cleanQuickImportText, hasQuickImportArtifact } from "./ocr-quick-import.js";

export const OCR_CONFIDENCE_THRESHOLDS = Object.freeze({ low: 60, medium: 80 });

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function box(item) {
  const source = item?.bbox ?? {};
  return { x0: Number(source.x0) || 0, y0: Number(source.y0) || 0, x1: Number(source.x1) || 0, y1: Number(source.y1) || 0 };
}

function unionBox(items) {
  const boxes = items.map(box);
  return {
    x0: Math.min(...boxes.map((item) => item.x0)), y0: Math.min(...boxes.map((item) => item.y0)),
    x1: Math.max(...boxes.map((item) => item.x1)), y1: Math.max(...boxes.map((item) => item.y1)),
  };
}

function averageConfidence(items) {
  const values = items.map((item) => Number(item.confidence)).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function verticalCenter(item) { const value = box(item); return (value.y0 + value.y1) / 2; }
function verticalOverlap(left, right) {
  const a = box(left); const b = box(right);
  return Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
}

export function groupOcrWordsIntoLines(words) {
  const clean = (words ?? [])
    .filter((word) => String(word?.text ?? "").trim() && box(word).x1 > box(word).x0 && box(word).y1 > box(word).y0)
    .sort((left, right) => verticalCenter(left) - verticalCenter(right) || box(left).x0 - box(right).x0);
  const medianHeight = median(clean.map((word) => box(word).y1 - box(word).y0)) || 12;
  const lines = [];
  for (const word of clean) {
    const candidate = [...lines].reverse().find((line) => {
      const centerDistance = Math.abs(verticalCenter(word) - verticalCenter({ bbox: line.bbox }));
      const overlap = verticalOverlap(word, { bbox: line.bbox });
      return overlap >= Math.min(box(word).y1 - box(word).y0, line.bbox.y1 - line.bbox.y0) * 0.35
        || centerDistance <= medianHeight * 0.65;
    });
    if (candidate) {
      candidate.words.push(word);
      candidate.words.sort((left, right) => box(left).x0 - box(right).x0);
      candidate.bbox = unionBox(candidate.words);
    } else lines.push({ words: [word], bbox: box(word) });
  }
  return lines.sort((left, right) => left.bbox.y0 - right.bbox.y0 || left.bbox.x0 - right.bbox.x0);
}

function clusterBoundaries(candidates, tolerance) {
  const clusters = [];
  candidates.sort((left, right) => left.position - right.position).forEach((candidate) => {
    let cluster = clusters.find((item) => Math.abs(item.position - candidate.position) <= tolerance);
    if (!cluster) { cluster = { position: candidate.position, entries: [] }; clusters.push(cluster); }
    cluster.entries.push(candidate);
    const weights = cluster.entries.reduce((sum, entry) => sum + entry.gap, 0);
    cluster.position = cluster.entries.reduce((sum, entry) => sum + entry.position * entry.gap, 0) / weights;
  });
  return clusters;
}

/** Finds up to two stable table separators. Large, recurring gaps outrank gaps inside a phrase. */
export function inferOcrColumnBoundaries(lines, pageWidth) {
  const medianHeight = median(lines.flatMap((line) => line.words.map((word) => box(word).y1 - box(word).y0))) || 12;
  const minimumGap = Math.max(pageWidth * 0.025, medianHeight * 1.2);
  const candidates = [];
  lines.forEach((line, lineIndex) => {
    const words = [...line.words].sort((left, right) => box(left).x0 - box(right).x0);
    for (let index = 0; index < words.length - 1; index += 1) {
      const gap = box(words[index + 1]).x0 - box(words[index]).x1;
      const position = box(words[index]).x1 + gap / 2;
      if (gap >= minimumGap && position > pageWidth * 0.08 && position < pageWidth * 0.92) {
        candidates.push({ lineIndex, position, gap });
      }
    }
  });
  const minimumSupport = Math.max(2, Math.ceil(lines.length * 0.12));
  const ranked = clusterBoundaries(candidates, Math.max(8, pageWidth * 0.025))
    .map((cluster) => ({
      ...cluster,
      support: new Set(cluster.entries.map((entry) => entry.lineIndex)).size,
      score: new Set(cluster.entries.map((entry) => entry.lineIndex)).size * median(cluster.entries.map((entry) => entry.gap)),
    }))
    .filter((cluster) => cluster.support >= minimumSupport)
    .sort((left, right) => right.score - left.score);
  const selected = [];
  for (const cluster of ranked) {
    if (selected.every((value) => Math.abs(value - cluster.position) >= pageWidth * 0.14)) selected.push(cluster.position);
    if (selected.length === 2) break;
  }
  return selected.sort((left, right) => left - right).map(Math.round);
}

function normalizeBoundaries(values, width) {
  return [...new Set((values ?? []).map(Number).filter(Number.isFinite).map((value) => (
    value > 0 && value < 1 ? value * width : value
  )).filter((value) => value > width * 0.05 && value < width * 0.95).map(Math.round))].sort((a, b) => a - b).slice(0, 2);
}

function lineToColumns(line, boundaries) {
  const buckets = Array.from({ length: boundaries.length + 1 }, () => []);
  line.words.forEach((word) => {
    const value = box(word); const center = (value.x0 + value.x1) / 2;
    const index = boundaries.findIndex((boundary) => center < boundary);
    buckets[index < 0 ? buckets.length - 1 : index].push(word);
  });
  return buckets.map((words) => words.sort((left, right) => box(left).x0 - box(right).x0)
    .map((word) => String(word.text).trim()).join(" ").replace(/\s+/gu, " ").trim());
}

function onlyDecoration(text) { return Boolean(text) && !/[\p{L}\p{N}]/u.test(text); }
function isPageMarker(text) { return /^(?:S(?:eite)?\.?|p(?:age)?\.?)?\s*\d{1,3}\s*$/iu.test(text.trim()); }
function withoutIpa(text) { return text.replace(/[\[\/]\s*[^\]\n/]{1,80}\s*[\]\/]/gu, " ").replace(/\([^)]{1,24}\)/gu, " ").trim(); }
function plausibleTerm(text) {
  const value = withoutIpa(String(text ?? "")).replace(/[–—,:;.!?]+$/u, "").trim();
  return /\p{L}/u.test(value) && !/^\p{L}$/u.test(value) && value.split(/\s+/u).length <= 8 && value.length <= 100 && !isPageMarker(value);
}
function phoneticOnly(text) { return /^\s*\[[^\]\n]{1,80}\]\s*$/u.test(String(text ?? "")); }
function likelySentence(text) { return /[.!?]$/u.test(text.trim()) || text.trim().split(/\s+/u).length >= 7; }
function titleCase(text) {
  const words = text.trim().split(/\s+/u);
  return words.length > 1 && words.length <= 8 && words.every((word) => !/\p{L}/u.test(word) || /^\p{Lu}/u.test(word));
}
function isLikelyHeading(line, columns, medianLineHeight, pageHeight) {
  const nonEmpty = columns.filter(Boolean); const text = nonEmpty.join(" ");
  if (nonEmpty.length !== 1 || !text || isPageMarker(text) || onlyDecoration(text)) return false;
  const prominent = (line.bbox.y1 - line.bbox.y0) >= medianLineHeight * 1.18;
  const named = /^(?:unit|lesson|chapter|section|vocabulary|overview|introduction|skills?\s+training|revision|word\s+bank|wortschatz|teil)\b/iu.test(text);
  const allCaps = text.length > 2 && text === text.toLocaleUpperCase() && /\p{L}/u.test(text);
  return prominent || named || allCaps || titleCase(text) || (line.bbox.y0 < pageHeight * 0.08 && text.split(/\s+/u).length <= 8);
}

function isQuickColumnHeader(columns) {
  const source = String(columns[0] ?? "").trim();
  const target = String(columns[1] ?? "").trim();
  return /^(?:source|ausgangsbegriff(?:e)?|wort|vokabeln?)$/iu.test(source)
    && /^(?:target|übersetzungen?|bedeutungen?|translation(?:s)?)$/iu.test(target);
}

/** Classifies the semantic role of a vocabulary book's optional right-hand column. */
export function classifyOcrRightText(value) {
  const text = String(value ?? "").trim();
  if (!text || onlyDecoration(text) || isPageMarker(text)) return "ignore";
  if (/^(?:syn(?:onym)?|ant(?:onym)?|opp(?:osite)?|word family|related|plural|past|pp\.?|vgl\.?|siehe)\s*[:.-]/iu.test(text)) return "word-relation";
  if (/^(?:hint|tip|usage|note|remember|merk(?:e)?|achtung)\s*[:.-]/iu.test(text)) return "hint";
  if (/^(?:e\.?g\.?|example|beispiel)\s*[:.-]/iu.test(text) || /[.!?]$/u.test(text)) return "example";
  if (likelySentence(text)) return "hint";
  return "unclear";
}

function joinContinuation(previous, next) {
  if (!previous) return next;
  if (!next) return previous;
  if (/[-‐‑]$/u.test(previous)) return `${previous.slice(0, -1)}${next}`;
  return `${previous}\n${next}`;
}

function joinWrappedText(previous, next) {
  if (!previous) return next;
  if (!next) return previous;
  return /[-‐‑]$/u.test(previous) ? `${previous.slice(0, -1)}${next}` : `${previous} ${next}`;
}

function freezeRecord(record) {
  return Object.freeze({ ...record, bbox: Object.freeze(record.bbox), contentBbox: Object.freeze(record.contentBbox), columns: Object.freeze(record.columns), warnings: Object.freeze(record.warnings), right: Object.freeze(record.right) });
}

export function structureOcrPage(page, options = {}) {
  const quickMode = options.mode === "quick" || page?.importMode === "quick";
  const lines = groupOcrWordsIntoLines(page?.blocks ?? []);
  const empty = { pageId: page?.pageId, width: page?.width, height: page?.height, boundaries: Object.freeze([]), rows: Object.freeze([]), sections: Object.freeze([]), unassigned: Object.freeze([]), ignored: Object.freeze([]), diagnostics: Object.freeze({ sourceCells: 0, vocabularyEntries: 0, headings: 0, ignoredMargins: 0, unassignedBlocks: 0, problemRows: 0 }), headingSuggestion: "" };
  if (lines.length === 0) return Object.freeze(empty);
  const width = Number(page.width) || Math.max(...lines.map((line) => line.bbox.x1));
  const height = Number(page.height) || Math.max(...lines.map((line) => line.bbox.y1));
  const inferred = inferOcrColumnBoundaries(lines, width);
  const quickBoundaries = page?.quickBoundaries ?? [];
  const boundaries = normalizeBoundaries(options.boundaries ?? (quickMode && quickBoundaries[0] ? [quickBoundaries[0]] : inferred), width);
  const analysisLimit = Math.min(width, Number(options.analysisLimit ?? quickBoundaries[1] ?? width) || width);
  const lineHeights = lines.map((line) => line.bbox.y1 - line.bbox.y0);
  const medianLineHeight = median(lineHeights) || 12;
  const sections = []; const unassigned = []; const ignored = []; const drafts = [];
  let current = null; let currentSection = "";

  function pushCurrent() { if (current) { drafts.push(current); current = null; } }
  lines.forEach((line, index) => {
    const columns = lineToColumns(line, boundaries);
    while (columns.length < 3) columns.push("");
    if (quickMode) {
      columns[0] = cleanQuickImportText(columns[0], { field: "source" });
      columns[1] = cleanQuickImportText(columns[1], { field: "target" });
      columns[2] = "";
    }
    const text = columns.filter(Boolean).join(" | ");
    const confidence = averageConfidence(line.words);
    if (!text) {
      ignored.push(Object.freeze({ id: `${page.pageId}-ignored-${index + 1}`, text: "", reason: "cleaned-artifact", bbox: Object.freeze({ ...line.bbox }) }));
      return;
    }
    if (onlyDecoration(text) || isPageMarker(text) || line.bbox.x0 > width * 0.92 || line.bbox.x1 < width * 0.035) {
      ignored.push(Object.freeze({ id: `${page.pageId}-ignored-${index + 1}`, text, reason: isPageMarker(text) ? "page-marker" : "decoration-or-margin", bbox: Object.freeze({ ...line.bbox }) }));
      return;
    }
    if ((quickMode && isQuickColumnHeader(columns)) || isLikelyHeading(line, columns, medianLineHeight, height)) {
      pushCurrent(); currentSection = text;
      sections.push(Object.freeze({ id: `${page.pageId}-section-${sections.length + 1}`, text, bbox: Object.freeze({ ...line.bbox }) }));
      return;
    }
    const source = columns[0]; const target = columns[1]; const rightText = quickMode ? "" : columns.slice(2).filter(Boolean).join(" ");
    const sourceAnchor = plausibleTerm(source);
    const gap = current ? line.bbox.y0 - current.contentBbox.y1 : Infinity;
    const continuation = current && gap <= medianLineHeight * 1.85;
    if (continuation && phoneticOnly(source) && !target && !rightText) {
      current.source = joinWrappedText(current.source, source);
      current.words.push(...line.words); current.contentBbox = unionBox(current.words);
      if (confidence !== null) current.confidenceValues.push(confidence);
      return;
    }
    if (continuation && sourceAnchor && !target && !rightText && /[-‐‑]$/u.test(current.source)) {
      current.source = joinWrappedText(current.source, source);
      current.words.push(...line.words); current.contentBbox = unionBox(current.words);
      if (confidence !== null) current.confidenceValues.push(confidence);
      return;
    }
    if (sourceAnchor) {
      pushCurrent();
      current = {
        id: `${page.pageId}-entry-${drafts.length + 1}`, pageId: page.pageId, pageNumber: options.pageNumber ?? 1,
        lineNumber: index + 1, source, target, rightText, rightKinds: rightText ? [classifyOcrRightText(rightText)] : [],
        words: [...line.words], contentBbox: { ...line.bbox }, confidenceValues: confidence === null ? [] : [confidence], section: currentSection,
      };
      return;
    }
    if (continuation && (target || rightText || (source && /[-‐‑]$/u.test(current.source)))) {
      if (source) current.source = joinWrappedText(current.source, source);
      if (target) current.target = joinWrappedText(current.target, target);
      if (rightText) { current.rightText = joinContinuation(current.rightText, rightText); current.rightKinds.push(classifyOcrRightText(rightText)); }
      current.words.push(...line.words); current.contentBbox = unionBox(current.words);
      if (confidence !== null) current.confidenceValues.push(confidence);
      return;
    }
    const kind = classifyOcrRightText(rightText || target || source);
    if (current && (kind === "example" || kind === "hint" || kind === "word-relation") && gap <= medianLineHeight * 3.2) {
      const info = rightText || target || source;
      current.rightText = joinContinuation(current.rightText, info); current.rightKinds.push(kind);
      current.words.push(...line.words); current.contentBbox = unionBox(current.words);
      if (confidence !== null) current.confidenceValues.push(confidence);
    } else {
      unassigned.push(Object.freeze({ id: `${page.pageId}-unassigned-${unassigned.length + 1}`, text, columns: Object.freeze(columns), reason: "no-plausible-source", bbox: Object.freeze({ ...line.bbox }), confidence }));
    }
  });
  pushCurrent();

  const rows = drafts.map((draft) => {
    const warnings = [];
    const confidence = draft.confidenceValues.length ? Math.min(...draft.confidenceValues) : null;
    const rightKinds = [...new Set(draft.rightKinds.filter((kind) => kind !== "ignore"))];
    if (confidence !== null && confidence < (options.lowConfidence ?? OCR_CONFIDENCE_THRESHOLDS.low)) warnings.push("low-confidence");
    if (!draft.target.trim()) warnings.push("missing-target");
    if (!quickMode && rightKinds.includes("unclear")) warnings.push("unclear-right-column");
    if (!quickMode && draft.rightText.includes("\n")) warnings.push("grouped-info-block");
    if (quickMode && /\[[^\]]*$|^[^\[]*\]/u.test(draft.source)) warnings.push("uncertain-phonetic");
    if (quickMode && (hasQuickImportArtifact(draft.source) || hasQuickImportArtifact(draft.target))) warnings.push("remaining-artifact");
    const right = { kind: rightKinds.length === 1 ? rightKinds[0] : rightKinds.length ? "mixed" : "ignore", text: draft.rightText };
    const suggestions = { hint: "", example: "", tags: [] };
    if (right.kind === "example") suggestions.example = draft.rightText.replace(/^(?:e\.?g\.?|example|beispiel)\s*[:.-]?\s*/iu, "");
    else if (right.kind === "hint" || right.kind === "word-relation" || right.kind === "mixed") suggestions.hint = draft.rightText.replace(/^(?:hint|tip|usage|note|remember|merk(?:e)?|achtung)\s*[:.-]?\s*/iu, "");
    return freezeRecord({
      id: draft.id, pageId: draft.pageId, pageNumber: draft.pageNumber, lineNumber: draft.lineNumber,
      text: [draft.source, draft.target, draft.rightText].filter(Boolean).join(" | "), columns: [draft.source, draft.target, draft.rightText], confidence,
      contentBbox: draft.contentBbox,
      bbox: { x0: Math.round(width * 0.02), y0: Math.max(0, Math.floor(draft.contentBbox.y0 - medianLineHeight * 0.45)), x1: quickMode ? Math.round(analysisLimit) : Math.round(width * 0.98), y1: Math.min(height, Math.ceil(draft.contentBbox.y1 + medianLineHeight * 0.45)) },
      warnings, right, suggestions: Object.freeze(suggestions), section: draft.section,
      suggestedInclude: plausibleTerm(draft.source) && Boolean(draft.target.trim()),
    });
  });
  const problemRows = rows.filter((row) => row.warnings.length > 0 || !row.suggestedInclude).length;
  const diagnostics = Object.freeze({
    sourceCells: drafts.length, vocabularyEntries: rows.length, headings: sections.length,
    ignoredMargins: ignored.length, unassignedBlocks: unassigned.length, problemRows,
  });
  return Object.freeze({
    pageId: page.pageId, width, height, boundaries: Object.freeze(boundaries), rows: Object.freeze(rows),
    sections: Object.freeze(sections), unassigned: Object.freeze(unassigned), ignored: Object.freeze(ignored), diagnostics,
    headingSuggestion: sections[0]?.text ?? "", importMode: quickMode ? "quick" : "extended", analysisLimit,
  });
}

export function structureOcrResults(results, options = {}) {
  return Object.freeze((results ?? []).map((page, index) => structureOcrPage(page, { ...options, pageNumber: index + 1 })));
}
