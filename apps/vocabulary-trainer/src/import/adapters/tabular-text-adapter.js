// @ts-check

import { createImportDraft } from "../core/import-draft.js";
import { createImportIssue } from "../core/import-issues.js";
import { normalizeImportComparisonKey } from "../core/import-normalizer.js";
import { mapImportRow, suggestColumnMapping, validateColumnMapping } from "../import-mapper.js";
import { parseTabularText } from "../tabular-parser.js";

export const TABULAR_TEXT_ADAPTER_ID = "tabular-text";

function parserIssueCode(message) {
  if (/keine Tabellenwerte/.test(message)) return "import.input.empty";
  if (/größer als/.test(message)) return "import.input.too-large";
  if (/höchstens .* Datenzeilen/.test(message)) return "import.rows.too-many";
  if (/Trennzeichen/.test(message)) return "import.tabular.delimiter";
  if (/zitierte Tabellenzeile/.test(message)) return "import.tabular.quote";
  return "import.tabular.parse";
}

function mappingIssueCode(message) {
  if (/Für jede Tabellenspalte/.test(message)) return "import.mapping.columns";
  if (/unbekannte Auswahl/.test(message)) return "import.mapping.field";
  if (/Ausgangsbegriff/.test(message)) return "import.mapping.source";
  if (/Übersetzung/.test(message)) return "import.mapping.target";
  return "import.mapping.invalid";
}

function issueFromLegacy(message, severity = "error") {
  return createImportIssue({
    code: severity === "warning" ? "import.tabular.warning" : parserIssueCode(message),
    severity,
    phase: "decode",
    path: "input",
    message,
    action: severity === "error"
      ? "Korrigiere die Tabelle und prüfe sie erneut."
      : "Prüfe die betroffenen Tabellenzeilen in der Vorschau.",
  });
}

function copyParsed(parsed) {
  return {
    headers: Array.isArray(parsed?.headers) ? [...parsed.headers] : [],
    rows: Array.isArray(parsed?.rows) ? parsed.rows.map((row) => [...row]) : [],
    rowNumbers: Array.isArray(parsed?.rowNumbers) ? [...parsed.rowNumbers] : [],
    detectedDelimiter: parsed?.detectedDelimiter ?? null,
    warnings: Array.isArray(parsed?.warnings) ? [...parsed.warnings] : [],
    errors: Array.isArray(parsed?.errors) ? [...parsed.errors] : [],
  };
}

function courseContext(context) {
  const course = context.course ?? {};
  return {
    title: course.title ?? context.title ?? "",
    description: course.description ?? context.description ?? "",
    sourceLanguage: course.languages?.source?.code ?? context.sourceLanguage ?? "",
    targetLanguage: course.languages?.target?.code ?? context.targetLanguage ?? "",
  };
}

function effectiveUnitTitle(mappedTitle, context) {
  if (String(mappedTitle ?? "").trim()) return String(mappedTitle).trim();
  if (String(context.newUnitTitle ?? "").trim()) return String(context.newUnitTitle).trim();
  const defaultUnit = context.course?.units?.find?.((unit) => unit.id === context.defaultUnitId);
  return defaultUnit?.title ?? "";
}

/** Returns the first production adapter for the universal content pipeline. */
export function createTabularTextAdapter() {
  return Object.freeze({
    id: TABULAR_TEXT_ADAPTER_ID,
    version: 1,
    acceptedKinds: Object.freeze(["tabular-text"]),

    canHandle(input) {
      return Boolean(input && typeof input === "object" && input.kind === "tabular-text");
    },

    decode(input, limits = {}) {
      const parsed = input.parsed
        ? copyParsed(input.parsed)
        : parseTabularText(input.text, { ...(input.options ?? {}), ...limits });
      return {
        parsed,
        issues: [
          ...parsed.errors.map((message) => issueFromLegacy(message)),
          ...parsed.warnings.map((message) => issueFromLegacy(message, "warning")),
        ],
      };
    },

    adapt(decoded, context = {}) {
      const parsed = decoded.parsed;
      const mapping = Array.isArray(context.mapping)
        ? [...context.mapping]
        : suggestColumnMapping(parsed.headers);
      const mappingResult = validateColumnMapping(mapping, parsed.headers.length);
      const mappingIssues = mappingResult.errors.map((message) => createImportIssue({
        code: mappingIssueCode(message),
        phase: "structure",
        path: "mapping",
        message,
        action: "Ordne genau eine Source- und mindestens eine Target-Spalte zu.",
      }));
      const groups = [];
      const groupByTitle = new Map();
      const entries = [];
      if (mappingResult.valid) {
        parsed.rows.forEach((cells, rowIndex) => {
          const mapped = mapImportRow(cells, mapping);
          const unitTitle = effectiveUnitTitle(mapped.unitTitle, context);
          const unitKey = normalizeImportComparisonKey(unitTitle);
          let unitIndex = groupByTitle.get(unitKey);
          if (unitIndex === undefined) {
            unitIndex = groups.length;
            groupByTitle.set(unitKey, unitIndex);
            groups.push({ title: unitTitle, words: [] });
          }
          const wordIndex = groups[unitIndex].words.length;
          groups[unitIndex].words.push({
            source: mapped.source,
            targets: [...mapped.targets],
            phonetic: mapped.phonetic,
            hint: mapped.hint,
            example: mapped.example,
            tags: [...mapped.tags],
          });
          entries.push({
            path: `units[${unitIndex}].words[${wordIndex}]`,
            location: {
              unitIndex,
              wordIndex,
              line: parsed.rowNumbers[rowIndex] ?? rowIndex + 1,
            },
            cells: [...cells],
            mappedWord: {
              source: mapped.source,
              targets: [...mapped.targets],
              phonetic: mapped.phonetic,
              hint: mapped.hint,
              example: mapped.example,
              tags: [...mapped.tags],
            },
            unitTitle: mapped.unitTitle,
            ignoredValues: cells.filter((value, columnIndex) => (
              mapping[columnIndex] === "ignore" && String(value ?? "").trim().length > 0
            )),
          });
        });
      }
      return {
        payloadKind: "content",
        draft: createImportDraft({
          intent: context.intent ?? "append",
          sourceKind: "tabular",
          course: courseContext(context),
          units: groups,
        }),
        provenance: {
          adapterId: TABULAR_TEXT_ADAPTER_ID,
          entries,
          mapping,
          parsed,
          fatal: parsed.errors.length > 0 || !mappingResult.valid,
          legacyErrors: [...parsed.errors, ...mappingResult.errors],
        },
        issues: mappingIssues,
      };
    },
  });
}
