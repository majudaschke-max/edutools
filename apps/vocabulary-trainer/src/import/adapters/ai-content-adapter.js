// @ts-check

import { createImportDraft } from "../core/import-draft.js";
import { createImportIssue } from "../core/import-issues.js";
import {
  getSmallLearningPackageWarnings,
  normalizeImportedLearningPackages,
} from "../core/learning-package-normalizer.js";

export const AI_CONTENT_ADAPTER_ID = "ai-content-json";
export const AI_CONTENT_INPUT_KIND = "ai-response-text";

const DEFAULT_MAX_CHARACTERS = 2_000_000;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function issue(input) {
  return createImportIssue({
    phase: "decode",
    path: "input",
    action: "Füge die vollständige, unveränderte ChatGPT-Antwort erneut ein.",
    ...input,
  });
}

function findUnsafeKey(value) {
  if (!value || typeof value !== "object") return "";
  const stack = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    for (const key of Object.keys(current)) {
      if (DANGEROUS_KEYS.has(key)) return key;
      const nested = current[key];
      if (nested && typeof nested === "object") stack.push(nested);
    }
  }
  return "";
}

function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, value: null };
  }
}

function fencedCandidates(text) {
  const candidates = [];
  const pattern = /```(?:json|javascript|js)?[ \t]*\r?\n([\s\S]*?)```/giu;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const candidate = match[1].trim();
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

/**
 * Finds complete top-level JSON object/array candidates in surrounding prose.
 * Braces inside JSON strings are ignored.
 */
function balancedCandidates(text) {
  const candidates = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (start < 0) {
      if (character === "{" || character === "[") {
        start = index;
        depth = 1;
        inString = false;
        escaped = false;
      }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{" || character === "[") depth += 1;
    else if (character === "}" || character === "]") depth -= 1;
    if (depth === 0) {
      candidates.push(text.slice(start, index + 1));
      start = -1;
    }
  }
  return candidates;
}

function uniqueParsedObjects(candidates) {
  const parsed = [];
  const seen = new Set();
  candidates.forEach((candidate) => {
    const result = parseJson(candidate);
    if (!result.ok) return;
    const serialized = JSON.stringify(result.value);
    if (seen.has(serialized)) return;
    seen.add(serialized);
    parsed.push(result.value);
  });
  return parsed;
}

function decodeResponseText(text, maximum) {
  const trimmed = text.replace(/^\uFEFF/u, "").trim();
  if (!trimmed) {
    return {
      value: null,
      issues: [issue({
        code: "ai.response.empty",
        message: "Die KI-Antwort ist leer.",
        action: "Füge zuerst die vollständige ChatGPT-Antwort ein.",
      })],
    };
  }
  if (trimmed.length > maximum) {
    return {
      value: null,
      issues: [issue({
        code: "ai.response.too-large",
        message: `Die KI-Antwort überschreitet ${maximum.toLocaleString("de-DE")} Zeichen.`,
        action: "Teile den Kurs in kleinere Abschnitte und erzeuge eine neue vollständige Antwort.",
      })],
    };
  }

  const direct = parseJson(trimmed);
  const objects = direct.ok
    ? [direct.value]
    : (() => {
      const fenced = uniqueParsedObjects(fencedCandidates(trimmed));
      return fenced.length > 0 ? fenced : uniqueParsedObjects(balancedCandidates(trimmed));
    })();

  if (objects.length === 0) {
    return {
      value: null,
      issues: [issue({
        code: "ai.response.json-missing",
        message: "In der KI-Antwort wurde kein vollständiges gültiges JSON-Objekt gefunden.",
        action: "Füge die Antwort mit dem vollständigen JSON-Codeblock ein; Aufzählungen und Prüfbericht dürfen davor oder danach stehen.",
      })],
    };
  }
  if (objects.length > 1) {
    const courseParts = objects.filter((value) => isRecord(value) && Array.isArray(value.units));
    if (courseParts.length === objects.length) {
      return {
        value: {
          ...courseParts[0],
          units: courseParts.flatMap((value) => value.units),
        },
        issues: [],
      };
    }
    return {
      value: null,
      issues: [issue({
        code: "ai.response.json-ambiguous",
        message: "Die KI-Antwort enthält mehrere nicht eindeutig zusammengehörige JSON-Objekte.",
        action: "Füge nur die vollständigen Kursdaten eines Kurses erneut ein.",
      })],
    };
  }
  if (!isRecord(objects[0])) {
    return {
      value: null,
      issues: [issue({
        code: "ai.response.object-required",
        message: "Die fachlichen Kursdaten müssen als JSON-Objekt vorliegen.",
        action: "Verwende die vollständige Antwort des EduTools-Importprompts.",
      })],
    };
  }
  const unsafeKey = findUnsafeKey(objects[0]);
  if (unsafeKey) {
    return {
      value: null,
      issues: [issue({
        code: "ai.response.unsafe-key",
        message: `Die KI-Antwort enthält den unzulässigen Schlüssel „${unsafeKey}“.`,
        action: "Erzeuge die Antwort mit dem unveränderten EduTools-Importprompt neu.",
      })],
    };
  }
  return { value: objects[0], issues: [] };
}

function mapWord(value) {
  if (!isRecord(value)) return value;
  return {
    source: value.source ?? "",
    targets: value.targets ?? [],
    phonetic: value.phonetic ?? "",
    hint: value.hint ?? "",
    example: value.example ?? "",
    tags: value.tags ?? [],
  };
}

function mapUnit(value) {
  if (!isRecord(value)) return value;
  return {
    title: value.title ?? "",
    words: Array.isArray(value.words) ? value.words.map(mapWord) : value.words,
  };
}

function courseContext(context) {
  const course = isRecord(context.course) ? context.course : {};
  return {
    title: course.title ?? context.courseName ?? context.title ?? "",
    description: course.description ?? context.description ?? "",
    sourceLanguage: course.sourceLanguage
      ?? course.languages?.source?.code
      ?? context.sourceLanguage
      ?? "",
    targetLanguage: course.targetLanguage
      ?? course.languages?.target?.code
      ?? context.targetLanguage
      ?? "",
  };
}

function adapterContentIssues(units) {
  const issues = [];
  if (!Array.isArray(units) || units.length === 0) {
    issues.push(createImportIssue({
      code: "ai.response.units.required",
      phase: "structure",
      path: "units",
      message: "Die KI-Antwort enthält keine importierbare Lernpaket-Liste.",
      action: "Erzeuge die Antwort mit dem EduTools-Importprompt neu und übernimm den vollständigen JSON-Block.",
    }));
    return issues;
  }
  let wordCount = 0;
  units.forEach((unit, unitIndex) => {
    if (!isRecord(unit) || !Array.isArray(unit.words)) return;
    wordCount += unit.words.length;
    unit.words.forEach((word, wordIndex) => {
      if (!isRecord(word) || typeof word.example !== "string") return;
      if (/(?:\.{3}|…)\s*$/u.test(word.example.trim())) {
        issues.push(createImportIssue({
          code: "word.example.incomplete",
          severity: "warning",
          phase: "content",
          path: `units[${unitIndex}].words[${wordIndex}].example`,
          location: { unitIndex, wordIndex },
          message: `Der Beispielsatz zu „${String(word.source ?? `Eintrag ${wordIndex + 1}`)}“ wirkt unvollständig.`,
          action: "Prüfe und vervollständige den Beispielsatz später im Course Builder.",
        }));
      }
    });
  });
  if (wordCount === 0) {
    issues.push(createImportIssue({
      code: "ai.response.words.required",
      phase: "content",
      path: "units",
      message: "Die KI-Antwort enthält keine importierbaren Vokabeleinträge.",
      action: "Erzeuge die Antwort mit mindestens einem vollständigen Source-/Target-Eintrag neu.",
    }));
  }
  return issues;
}

/**
 * Reads the response format produced by the current prompt as well as the
 * smaller content-only format proposed for future prompt versions. Only the
 * shared semantic `units[].words[]` fields cross the adapter boundary;
 * canonical IDs, statuses, timestamps and metadata are deliberately ignored.
 */
export function createAiContentAdapter() {
  return Object.freeze({
    id: AI_CONTENT_ADAPTER_ID,
    version: 1,
    acceptedKinds: Object.freeze([AI_CONTENT_INPUT_KIND]),

    canHandle(input) {
      return Boolean(input && typeof input === "object" && input.kind === AI_CONTENT_INPUT_KIND);
    },

    decode(input, limits = {}) {
      if (typeof input.text !== "string") {
        return {
          value: null,
          issues: [issue({
            code: "ai.response.type",
            message: "Die KI-Antwort muss als Text eingefügt werden.",
          })],
        };
      }
      const requestedMaximum = Number(limits.maxCharacters);
      const maximum = Number.isInteger(requestedMaximum) && requestedMaximum > 0
        ? requestedMaximum
        : DEFAULT_MAX_CHARACTERS;
      return decodeResponseText(input.text, maximum);
    },

    adapt(decoded, context = {}) {
      const value = isRecord(decoded.value) ? decoded.value : {};
      const rawUnits = value.units;
      const mappedUnits = Array.isArray(rawUnits) ? rawUnits.map(mapUnit) : [];
      const normalized = normalizeImportedLearningPackages(mappedUnits);
      const units = normalized.packages;
      const entries = [];
      units.forEach((unit, unitIndex) => {
        if (!isRecord(unit) || !Array.isArray(unit.words)) return;
        unit.words.forEach((_word, wordIndex) => entries.push({
          path: `units[${unitIndex}].words[${wordIndex}]`,
          location: { unitIndex, wordIndex },
        }));
      });
      return {
        payloadKind: "content",
        draft: createImportDraft({
          intent: "create",
          sourceKind: "ai",
          course: courseContext(context),
          units,
        }),
        provenance: {
          adapterId: AI_CONTENT_ADAPTER_ID,
          responseFormat: typeof value.format === "string"
            ? value.format
            : value.schemaVersion !== undefined || value.appType !== undefined
              ? "edutools-course-compatible"
              : "semantic-content",
          entries,
        },
        issues: isRecord(decoded.value) ? [
          ...adapterContentIssues(rawUnits),
          ...normalized.merges.map((entry) => createImportIssue({
            code: "ai.package.technical-fragment-merged",
            severity: "warning",
            phase: "content",
            path: "units",
            message: `Das technische Fragment „${entry.from}“ wurde mit „${entry.into}“ zu einem Lernpaket zusammengeführt.`,
            action: "Die ursprüngliche Wortreihenfolge bleibt erhalten.",
          })),
          ...getSmallLearningPackageWarnings(units).map((entry) => createImportIssue({
            code: "ai.package.small",
            severity: "warning",
            phase: "content",
            path: `units[${entry.unitIndex}]`,
            message: `Das Lernpaket „${entry.title}“ enthält nur ${entry.wordCount} Wörter.`,
            action: "Prüfe im Course Builder, ob es zusammengeführt werden sollte.",
          })),
        ] : [],
      };
    },
  });
}
