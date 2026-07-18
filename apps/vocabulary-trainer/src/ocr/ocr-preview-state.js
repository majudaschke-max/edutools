import { normalizeImportSource } from "../import/vocabulary-importer.js";
import { validateOcrColumnMapping } from "./ocr-column-mapping.js";
import { OCR_CONFIDENCE_THRESHOLDS } from "./ocr-structure.js";
import { cleanQuickImportText } from "./ocr-quick-import.js";

const APOSTROPHES = /[\u2018\u2019\u201B\u02BC\uFF07]/g;

export function normalizeOcrDraftText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(APOSTROPHES, "'")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

export function splitOcrTargets(value, options = {}) {
  const text = normalizeOcrDraftText(value);
  if (!text) return Object.freeze({ targets: Object.freeze([]), ambiguous: false });
  const separators = options.separators ?? [";", "/", "\n"];
  const patternParts = [];
  if (separators.includes(";")) patternParts.push(";");
  if (separators.includes("/")) patternParts.push("\\/");
  if (separators.includes("\n")) patternParts.push("\\n");
  if (separators.includes(",")) patternParts.push(",");
  const pattern = patternParts.length ? new RegExp(`(?:${patternParts.join("|")})+`, "u") : null;
  const seen = new Set();
  const targets = (pattern ? text.split(pattern) : [text]).flatMap((item) => {
    const target = normalizeOcrDraftText(item);
    const key = target.toLocaleLowerCase();
    if (!target || seen.has(key)) return [];
    seen.add(key);
    return [target];
  });
  return Object.freeze({ targets: Object.freeze(targets), ambiguous: text.includes(",") && !separators.includes(",") });
}

const IPA_BLOCK = /\[\s*([^\]\n]{1,80})\s*\]/gu;

/** Keeps lexical supplements such as “(to)”, but moves square-bracket IPA into its own field. */
export function extractOcrSourceAndPhonetic(value) {
  const original = normalizeOcrDraftText(value);
  const phonetic = [];
  const source = normalizeOcrDraftText(original.replace(IPA_BLOCK, (match, content) => {
    phonetic.push(`[${normalizeOcrDraftText(content)}]`);
    return " ";
  }));
  return Object.freeze({ source, phonetic: normalizeOcrDraftText(phonetic.join(" ")) });
}

export function isPlausibleOcrTerm(value) {
  const text = normalizeOcrDraftText(value).replace(/[–—,:;.!?]+$/u, "").trim();
  return /\p{L}/u.test(text) && !/^\p{L}$/u.test(text) && text.length <= 100 && text.split(/\s+/u).length <= 8;
}

export function isPlausibleOcrTarget(value) {
  const text = normalizeOcrDraftText(value);
  return /\p{L}/u.test(text) && !/^\p{L}$/u.test(text) && text.length <= 240;
}

function mappedText(columns, mapping, field) {
  return columns.flatMap((value, index) => mapping[index] === field ? [normalizeOcrDraftText(value)] : []).filter(Boolean);
}

function unique(values) {
  const seen = new Set();
  return values.flatMap((value) => {
    const text = normalizeOcrDraftText(value);
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key)) return [];
    seen.add(key);
    return [text];
  });
}

function wordWarnings(row, targetResult) {
  const warnings = [...row.warnings];
  if (targetResult.ambiguous) warnings.push("ambiguous-target-comma");
  if (!row.columns.some((value) => /[\p{L}\p{N}]/u.test(value))) warnings.push("unsupported-characters");
  return [...new Set(warnings)];
}

function rowErrors(source, targets) {
  return [
    !source ? "Source fehlt." : !isPlausibleOcrTerm(source) ? "Source ist kein plausibler Ausgangsbegriff." : null,
    targets.length === 0 ? "Mindestens ein Target fehlt." : targets.some((target) => !isPlausibleOcrTarget(target)) ? "Mindestens ein Target ist nicht plausibel." : null,
  ].filter(Boolean);
}

function suggestReassignment(columns, sourceIndex, targetIndex) {
  const sourceCandidate = columns.findIndex((value, index) => index !== sourceIndex && (IPA_BLOCK.test(String(value)) || /\(to\)/iu.test(String(value))));
  IPA_BLOCK.lastIndex = 0;
  if (sourceCandidate < 0) return null;
  const targetCandidate = columns.findIndex((value, index) => index !== sourceCandidate && index !== sourceIndex && isPlausibleOcrTarget(value));
  if (targetCandidate < 0 || targetCandidate === targetIndex) return null;
  const extracted = extractOcrSourceAndPhonetic(columns[sourceCandidate]);
  return isPlausibleOcrTerm(extracted.source)
    ? { sourceColumn: sourceCandidate, targetColumn: targetCandidate, reason: "Source mit Lautschrift in benachbarter Spalte erkannt." }
    : null;
}

export function createOcrPreviewRows(structuredPages, mappings, options = {}) {
  const rows = [];
  for (const page of structuredPages ?? []) {
    const mapping = mappings?.[page.pageId];
    const validation = validateOcrColumnMapping(mapping, page.boundaries.length + 1);
    if (!validation.valid) throw new TypeError(validation.errors.join(" "));
    for (const rawRow of page.rows) {
      const quickMode = page.importMode === "quick";
      const mappedSourceValue = mappedText(rawRow.columns, mapping, "source").join(" ");
      const mappedSource = quickMode ? cleanQuickImportText(mappedSourceValue, { field: "source" }) : mappedSourceValue;
      const extractedSource = extractOcrSourceAndPhonetic(mappedSource);
      const source = extractedSource.source;
      const targetParts = mappedText(rawRow.columns, mapping, "target").map((value) => (
        quickMode ? cleanQuickImportText(value, { field: "target" }) : value
      ));
      const splitTargets = targetParts.map((part) => splitOcrTargets(part, options.targetOptions));
      const targetResult = {
        targets: unique(splitTargets.flatMap((result) => result.targets)),
        ambiguous: splitTargets.some((result) => result.ambiguous),
      };
      const errors = rowErrors(source, targetResult.targets);
      const explicitPhonetic = mappedText(rawRow.columns, mapping, "phonetic").join(" ");
      const sourceIndex = mapping.indexOf("source");
      const targetIndex = mapping.indexOf("target");
      const reassignment = errors.length ? suggestReassignment(rawRow.columns, sourceIndex, targetIndex) : null;
      rows.push({
        id: rawRow.id,
        source,
        targets: targetResult.targets,
        phonetic: normalizeOcrDraftText([extractedSource.phonetic, explicitPhonetic].filter(Boolean).join(" ")),
        hint: mappedText(rawRow.columns, mapping, "hint").join(" ") || rawRow.suggestions?.hint || "",
        example: mappedText(rawRow.columns, mapping, "example").join(" ") || rawRow.suggestions?.example || "",
        tags: unique(mappedText(rawRow.columns, mapping, "tags").flatMap((value) => value.split(/[|;]/u))),
        included: rawRow.suggestedInclude && errors.length === 0,
        deleted: false,
        pageId: rawRow.pageId,
        pageNumber: rawRow.pageNumber,
        lineNumber: rawRow.lineNumber,
        bbox: { ...rawRow.bbox },
        contentBbox: { ...(rawRow.contentBbox ?? rawRow.bbox) },
        rawColumns: [...rawRow.columns],
        section: rawRow.section ?? "",
        rightClassification: rawRow.right?.kind ?? "ignore",
        confidence: rawRow.confidence,
        warnings: wordWarnings(rawRow, targetResult),
        errors,
        duplicate: null,
        duplicateStrategy: "skip",
        reassignment,
        reassignmentBackup: null,
      });
    }
  }
  return rows;
}

export function annotateOcrDuplicates(rows, course, targetUnitId) {
  const targetUnit = course?.units?.find((unit) => unit.id === targetUnitId) ?? null;
  const allWords = (course?.units ?? []).flatMap((unit) => unit.words.map((word) => ({ ...word, unitId: unit.id, unitTitle: unit.title })));
  return rows.map((row) => {
    const sourceKey = normalizeImportSource(row.source);
    const inUnit = targetUnit?.words.find((word) => normalizeImportSource(word.source) === sourceKey) ?? null;
    const inCourse = allWords.filter((word) => normalizeImportSource(word.source) === sourceKey);
    const existing = inUnit ?? inCourse[0] ?? null;
    if (!existing) return { ...row, duplicate: null };
    const sameTargets = row.targets.every((target) => existing.targets.some((value) => normalizeImportSource(value) === normalizeImportSource(target)))
      && existing.targets.every((target) => row.targets.some((value) => normalizeImportSource(value) === normalizeImportSource(target)));
    return {
      ...row,
      duplicate: {
        scope: inUnit ? "unit" : "course",
        wordId: existing.id,
        unitId: existing.unitId ?? targetUnitId,
        unitTitle: existing.unitTitle ?? targetUnit?.title ?? "",
        sameTargets,
      },
      warnings: [...new Set([...row.warnings, inUnit ? "duplicate-unit" : "duplicate-course"])],
    };
  });
}

function cloneRow(row) {
  return {
    ...row,
    targets: [...row.targets], tags: [...row.tags], bbox: { ...row.bbox }, contentBbox: { ...(row.contentBbox ?? row.bbox) },
    rawColumns: [...(row.rawColumns ?? [])], warnings: [...row.warnings], errors: [...row.errors],
    duplicate: row.duplicate ? { ...row.duplicate } : null,
    reassignment: row.reassignment ? { ...row.reassignment } : null,
    reassignmentBackup: row.reassignmentBackup ? { ...row.reassignmentBackup, targets: [...row.reassignmentBackup.targets] } : null,
  };
}

function cloneRows(rows) { return rows.map(cloneRow); }

export function createOcrPreviewState(rows, metadata = {}) {
  const current = cloneRows(rows ?? []);
  return {
    rows: current, originalRows: cloneRows(current), filter: "all", selectedIds: [],
    sections: [...(metadata.sections ?? [])], unassigned: [...(metadata.unassigned ?? [])],
    diagnostics: { ...(metadata.diagnostics ?? {}) },
  };
}

function withRows(state, rows) { return { ...state, rows, selectedIds: state.selectedIds.filter((id) => rows.some((row) => row.id === id)) }; }

export function updateOcrPreviewRow(state, rowId, field, value) {
  const allowed = new Set(["source", "targets", "phonetic", "hint", "example", "tags", "included", "duplicateStrategy"]);
  if (!allowed.has(field)) throw new TypeError("Dieses Vorschaufeld kann nicht bearbeitet werden.");
  const rows = state.rows.map((row) => {
    if (row.id !== rowId) return row;
    const next = cloneRow(row);
    if (field === "targets") next.targets = Array.isArray(value) ? unique(value) : splitOcrTargets(value).targets;
    else if (field === "tags") next.tags = Array.isArray(value) ? unique(value) : unique(String(value ?? "").split("|"));
    else if (field === "included") next.included = Boolean(value);
    else if (field === "duplicateStrategy") next.duplicateStrategy = String(value);
    else next[field] = normalizeOcrDraftText(value);
    next.errors = rowErrors(next.source, next.targets);
    if (next.errors.length > 0) next.included = false;
    return next;
  });
  return withRows(state, rows);
}

export function applyOcrRowReassignment(state, rowId) {
  return withRows(state, state.rows.map((row) => {
    if (row.id !== rowId || !row.reassignment) return row;
    const next = cloneRow(row);
    const sourceValue = next.rawColumns[next.reassignment.sourceColumn];
    const targetValue = next.rawColumns[next.reassignment.targetColumn];
    const extracted = extractOcrSourceAndPhonetic(sourceValue);
    const targets = splitOcrTargets(targetValue).targets;
    next.reassignmentBackup = { source: next.source, targets: [...next.targets], phonetic: next.phonetic, included: next.included };
    next.source = extracted.source;
    next.phonetic = normalizeOcrDraftText([extracted.phonetic, next.phonetic].filter(Boolean).join(" "));
    next.targets = targets;
    next.errors = rowErrors(next.source, next.targets);
    next.included = next.errors.length === 0;
    next.warnings = [...new Set([...next.warnings, "auto-reassigned"])];
    next.reassignment = null;
    return next;
  }));
}

export function undoOcrRowReassignment(state, rowId) {
  return withRows(state, state.rows.map((row) => {
    if (row.id !== rowId || !row.reassignmentBackup) return row;
    const next = cloneRow(row); const backup = next.reassignmentBackup;
    next.source = backup.source; next.targets = [...backup.targets]; next.phonetic = backup.phonetic; next.included = backup.included;
    next.errors = rowErrors(next.source, next.targets); next.reassignmentBackup = null;
    next.warnings = next.warnings.filter((warning) => warning !== "auto-reassigned");
    return next;
  }));
}

export function deleteOcrPreviewRow(state, rowId) {
  return withRows(state, state.rows.map((row) => row.id === rowId ? { ...row, deleted: true, included: false } : row));
}

export function duplicateOcrPreviewRow(state, rowId, idGenerator = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`) {
  const index = state.rows.findIndex((row) => row.id === rowId);
  if (index < 0) throw new Error("Die Vorschauzeile wurde nicht gefunden.");
  const copy = { ...cloneRow(state.rows[index]), id: `ocr-row-${idGenerator()}`, duplicate: null, warnings: [...state.rows[index].warnings, "manual-copy"] };
  const rows = [...state.rows];
  rows.splice(index + 1, 0, copy);
  return withRows(state, rows);
}

export function moveOcrPreviewRow(state, rowId, direction) {
  const rows = [...state.rows];
  const index = rows.findIndex((row) => row.id === rowId);
  const target = index + (direction === "up" ? -1 : 1);
  if (index >= 0 && target >= 0 && target < rows.length) [rows[index], rows[target]] = [rows[target], rows[index]];
  return withRows(state, rows);
}

export function selectOcrPreviewRow(state, rowId, selected) {
  const ids = new Set(state.selectedIds);
  if (selected) ids.add(rowId); else ids.delete(rowId);
  return { ...state, selectedIds: [...ids] };
}

function selectedRows(state, transform) {
  if (state.selectedIds.length === 0) {
    throw new TypeError("Wähle zuerst mindestens eine Vokabel aus.");
  }
  const selected = new Set(state.selectedIds);
  return withRows(state, state.rows.map((row) => (
    selected.has(row.id) && !row.deleted ? transform(cloneRow(row)) : row
  )));
}

/** Applies one include state to all selected, valid draft rows. */
export function setSelectedOcrRowsIncluded(state, included) {
  return selectedRows(state, (row) => ({
    ...row,
    included: Boolean(included) && row.errors.length === 0,
  }));
}

/** Adds normalized, unique tags to every selected draft row. */
export function addTagsToSelectedOcrRows(state, tags) {
  const additions = Array.isArray(tags)
    ? unique(tags)
    : unique(String(tags ?? "").split("|"));
  if (additions.length === 0) throw new TypeError("Gib mindestens einen Tag ein.");
  return selectedRows(state, (row) => ({ ...row, tags: unique([...row.tags, ...additions]) }));
}

/** Soft-deletes selected rows so the original draft remains restorable. */
export function deleteSelectedOcrRows(state) {
  const next = selectedRows(state, (row) => ({ ...row, deleted: true, included: false }));
  return { ...next, selectedIds: [] };
}

export function mergeOcrPreviewRows(state, rowIds, field = "source") {
  const allowedFields = new Set(["source", "targets", "phonetic", "hint", "example", "tags"]);
  if (!allowedFields.has(field)) throw new TypeError("Wähle ein gültiges Feld zum Verbinden.");
  const selected = state.rows.filter((row) => rowIds.includes(row.id) && !row.deleted);
  if (selected.length < 2) throw new TypeError("Wähle mindestens zwei Zeilen zum Verbinden.");
  const indices = selected.map((row) => state.rows.indexOf(row));
  if (Math.max(...indices) - Math.min(...indices) + 1 !== indices.length) throw new TypeError("Es können nur benachbarte Zeilen verbunden werden.");
  const first = cloneRow(selected[0]);
  if (field === "targets" || field === "tags") first[field] = unique(selected.flatMap((row) => row[field]));
  else first[field] = selected.map((row) => row[field]).filter(Boolean).join(" ");
  first.bbox = {
    x0: Math.min(...selected.map((row) => row.bbox.x0)), y0: Math.min(...selected.map((row) => row.bbox.y0)),
    x1: Math.max(...selected.map((row) => row.bbox.x1)), y1: Math.max(...selected.map((row) => row.bbox.y1)),
  };
  const finiteConfidences = selected
    .filter((row) => row.confidence !== null && row.confidence !== undefined && row.confidence !== "")
    .map((row) => Number(row.confidence))
    .filter(Number.isFinite);
  first.confidence = finiteConfidences.length > 0 ? Math.min(...finiteConfidences) : null;
  first.warnings = [...new Set([...selected.flatMap((row) => row.warnings), "manually-merged"])];
  const rows = state.rows.filter((row) => !rowIds.includes(row.id));
  rows.splice(Math.min(...indices), 0, first);
  return { ...withRows(state, rows), selectedIds: [] };
}

export function splitOcrPreviewRow(state, rowId, position, idGenerator = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`) {
  const index = state.rows.findIndex((row) => row.id === rowId);
  const row = state.rows[index];
  const splitAt = Number(position);
  if (!row || !Number.isInteger(splitAt) || splitAt <= 0 || splitAt >= row.source.length) throw new RangeError("Wähle eine gültige Trennposition innerhalb des Source-Texts.");
  const left = { ...cloneRow(row), source: row.source.slice(0, splitAt).trim(), warnings: [...new Set([...row.warnings, "manually-split"])] };
  const right = { ...cloneRow(row), id: `ocr-row-${idGenerator()}`, source: row.source.slice(splitAt).trim(), targets: [], included: false, warnings: [...new Set([...row.warnings, "manually-split"])], errors: ["Mindestens ein Target fehlt."], duplicate: null };
  const rows = [...state.rows];
  rows.splice(index, 1, left, right);
  return withRows(state, rows);
}

export function resetOcrPreview(state) {
  return createOcrPreviewState(state.originalRows, { sections: state.sections, unassigned: state.unassigned, diagnostics: state.diagnostics });
}

export function setOcrPreviewFilter(state, filter) {
  if (!["all", "problems"].includes(filter)) throw new TypeError("Unbekannter Vorschaufilter.");
  return { ...state, filter };
}

export function getVisibleOcrPreviewRows(state) {
  return state.rows.filter((row) => !row.deleted && (state.filter === "all" || row.errors.length > 0 || row.warnings.length > 0 || row.duplicate));
}

export function getOcrRowStatus(row) {
  if (row.deleted) return "Gelöscht";
  if (!row.included) return "Ausgeschlossen";
  if (row.errors.length > 0) return "Fehler";
  if (row.duplicate) return "Duplikat";
  if (row.confidence !== null && row.confidence < OCR_CONFIDENCE_THRESHOLDS.low) return "Prüfen";
  if (row.warnings.length > 0) return "Prüfen";
  return "Bereit";
}
