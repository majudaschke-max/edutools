import { commitImport, createImportPreview } from "../import/vocabulary-importer.js";

function activeRows(state) {
  return (state?.rows ?? []).filter((row) => row.included && !row.deleted);
}

function createParsedRows(rows) {
  const targetCount = Math.max(1, ...rows.map((row) => row.targets.length));
  const headers = ["source", ...Array.from({ length: targetCount }, (_, index) => `target-${index + 1}`), "phonetic", "hint", "example", "tags"];
  const mapping = ["source", ...Array.from({ length: targetCount }, () => "target"), "phonetic", "hint", "example", "tags"];
  const parsedRows = rows.map((row) => [
    row.source,
    ...Array.from({ length: targetCount }, (_, index) => row.targets[index] ?? ""),
    row.phonetic,
    row.hint,
    row.example,
    row.tags.join("|"),
  ]);
  return {
    parsed: { headers, rows: parsedRows, rowNumbers: rows.map((_, index) => index + 1), errors: [], warnings: [] },
    mapping,
  };
}

function validateRows(rows) {
  const errors = [];
  if (rows.length === 0) errors.push("Aktiviere mindestens eine kontrollierte Vorschauzeile.");
  rows.forEach((row, index) => {
    if (!String(row.source ?? "").trim()) errors.push(`Zeile ${index + 1}: Source fehlt.`);
    if (!Array.isArray(row.targets) || row.targets.length === 0) errors.push(`Zeile ${index + 1}: Mindestens ein Target fehlt.`);
    if (row.duplicate?.scope === "course" && ["merge", "replace"].includes(row.duplicateStrategy)) {
      errors.push(`Zeile ${index + 1}: Ein Duplikat in einer anderen Lernpaket kann nur übersprungen oder als neues Wort angelegt werden.`);
    }
  });
  if (errors.length > 0) {
    const error = new TypeError(errors.join(" "));
    error.issues = errors;
    throw error;
  }
}

/**
 * Converts reviewed OCR rows into the existing tabular import transaction.
 * No image, bounding box or confidence field enters the canonical course.
 */
export function commitOcrImport(options) {
  const { course, previewState, service, targetUnitId, newUnitTitle = "", idGenerator } = options;
  const reviewedRows = activeRows(previewState);
  validateRows(reviewedRows);
  // A duplicate found in another Lernpaket does not exist in the selected target
  // Lernpaket. The shared tabular importer therefore cannot discover it again when
  // a new Lernpaket is created. Apply the explicit cross-Lernpaket "skip" decision before
  // building that import preview; "add" continues through the normal path.
  const courseDuplicatesToSkip = reviewedRows.filter((row) => (
    row.duplicate?.scope === "course" && row.duplicateStrategy === "skip"
  ));
  const rows = reviewedRows.filter((row) => !courseDuplicatesToSkip.includes(row));
  if (rows.length === 0) {
    throw new TypeError("Alle ausgewählten Vokabeln werden nach der Duplikatprüfung übersprungen.");
  }
  const existingUnit = course.units.find((unit) => unit.id === targetUnitId && !unit.archived) ?? null;
  const cleanNewUnitTitle = String(newUnitTitle ?? "").trim();
  if (!existingUnit && !cleanNewUnitTitle) throw new TypeError("Wähle eine Ziel-Lernpaket oder gib einen Titel für ein neues Lernpaket ein.");
  const { parsed, mapping } = createParsedRows(rows);
  const importPreview = createImportPreview({
    course,
    parsed,
    mapping,
    defaultUnitId: existingUnit?.id ?? null,
    newUnitTitle: existingUnit ? "" : cleanNewUnitTitle,
    newUnitReleased: options.newUnitReleased === true,
    idGenerator,
  });
  const previewErrors = [
    ...importPreview.errors,
    ...importPreview.rows.flatMap((row) => row.errors.map((message) => `Zeile ${row.lineNumber}: ${message}`)),
  ];
  if (previewErrors.length > 0) {
    const error = new TypeError(previewErrors.join(" "));
    error.issues = previewErrors;
    error.previewState = previewState;
    throw error;
  }
  const result = commitImport({
    preview: importPreview,
    service,
    strategy(importRow) {
      return rows[importRow.lineNumber - 1]?.duplicateStrategy ?? "skip";
    },
    idGenerator,
    now: options.now,
  });
  return Object.freeze({
    ...result,
    skipped: result.skipped + courseDuplicatesToSkip.length,
    targetUnitId: existingUnit?.id ?? importPreview.newUnits[0]?.id ?? null,
    reviewed: reviewedRows.length,
    needsReview: reviewedRows.filter((row) => row.warnings.length > 0).length,
  });
}
