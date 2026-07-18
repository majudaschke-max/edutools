const HEADER_ALIASES = Object.freeze({
  source: ["source", "word", "english", "englisch", "ausgangsbegriff"],
  target: ["target", "translation", "german", "deutsch", "übersetzung", "uebersetzung"],
  phonetic: ["phonetic", "lautschrift"],
  hint: ["hint", "hinweis"],
  example: ["example", "beispiel", "beispielsatz"],
  tags: ["tags", "tag"],
  unit: ["unit", "unit title", "unit-titel"],
});

export const IMPORT_FIELDS = Object.freeze(["source", "target", "phonetic", "hint", "example", "tags", "unit", "ignore"]);

function normalizeHeader(value) {
  return String(value ?? "").trim().normalize("NFC").toLocaleLowerCase();
}

export function suggestColumnMapping(headers) {
  let sourceUsed = false;
  return headers.map((header) => {
    const normalized = normalizeHeader(header);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(normalized)) {
        if (field === "source") {
          if (sourceUsed) return "ignore";
          sourceUsed = true;
        }
        return field;
      }
    }
    return "ignore";
  });
}

export function validateColumnMapping(mapping, columnCount = mapping?.length ?? 0) {
  const errors = [];
  if (!Array.isArray(mapping) || mapping.length !== columnCount) {
    errors.push("Für jede Tabellenspalte wird eine Zuordnung benötigt.");
    return { valid: false, errors };
  }
  const unknown = mapping.filter((field) => !IMPORT_FIELDS.includes(field));
  if (unknown.length > 0) errors.push("Die Spaltenzuordnung enthält eine unbekannte Auswahl.");
  if (mapping.filter((field) => field === "source").length !== 1) {
    errors.push("Genau eine Spalte muss als Ausgangsbegriff zugeordnet sein.");
  }
  if (!mapping.includes("target")) errors.push("Mindestens eine Spalte muss als Übersetzung zugeordnet sein.");
  return { valid: errors.length === 0, errors };
}

export function mapImportRow(cells, mapping) {
  const result = { source: "", targets: [], phonetic: "", hint: "", example: "", tags: [], unitTitle: "" };
  mapping.forEach((field, index) => {
    const value = String(cells[index] ?? "").trim();
    if (field === "source") result.source = value;
    else if (field === "target") {
      result.targets.push(...value.split("|").map((target) => target.trim()));
    }
    else if (field === "unit") result.unitTitle = value;
    else if (field === "tags") result.tags.push(...value.split("|").map((tag) => tag.trim()));
    else if (["phonetic", "hint", "example"].includes(field)) result[field] = value;
  });
  result.targets = result.targets.filter(Boolean);
  result.tags = result.tags.filter(Boolean);
  return result;
}
