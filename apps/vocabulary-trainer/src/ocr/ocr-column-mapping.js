export const OCR_COLUMN_FIELDS = Object.freeze(["source", "target", "phonetic", "hint", "example", "tags", "ignore"]);

export function suggestOcrColumnMapping(columnCount) {
  return Object.freeze(Array.from({ length: Math.max(0, columnCount) }, (_, index) => (
    index === 0 ? "source" : index === 1 ? "target" : "ignore"
  )));
}

export function validateOcrColumnMapping(mapping, columnCount = mapping?.length ?? 0) {
  const errors = [];
  if (!Array.isArray(mapping) || mapping.length !== columnCount) {
    errors.push("Für jede erkannte Spalte wird eine Zuordnung benötigt.");
    return Object.freeze({ valid: false, errors: Object.freeze(errors) });
  }
  if (mapping.some((field) => !OCR_COLUMN_FIELDS.includes(field))) errors.push("Die Spaltenzuordnung enthält ein unbekanntes Feld.");
  if (mapping.filter((field) => field === "source").length !== 1) errors.push("Genau eine erkannte Spalte muss Source sein.");
  if (!mapping.includes("target")) errors.push("Mindestens eine erkannte Spalte muss Target sein.");
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function createOcrPageMappings(structuredPages) {
  return Object.freeze(Object.fromEntries((structuredPages ?? []).map((page) => [
    page.pageId,
    suggestOcrColumnMapping(Math.max(0, page.boundaries.length + 1)),
  ])));
}

export function applyMappingToAllPages(mappings, sourcePageId, structuredPages) {
  const source = mappings?.[sourcePageId];
  if (!source) throw new TypeError("Die Ausgangszuordnung wurde nicht gefunden.");
  const next = { ...mappings };
  for (const page of structuredPages ?? []) {
    const count = page.boundaries.length + 1;
    next[page.pageId] = Array.from({ length: count }, (_, index) => source[index] ?? "ignore");
  }
  return Object.freeze(next);
}
