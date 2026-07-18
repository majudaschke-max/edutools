// @ts-check

const NON_VERB_TAGS = new Set([
  "adjective", "adjektiv", "adverb", "conjunction", "konjunktion",
  "fixed phrase", "fixed-phrase", "feste wendung", "noun", "nomen",
  "phrase", "preposition", "präposition", "substantiv",
]);
const VERB_TAGS = new Set(["verb", "verbe", "verbo"]);

function normalizeTag(value) {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().toLocaleLowerCase("de-DE")
    : "";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Returns a safe cloze only when the stored form occurs exactly once. */
export function createExactCloze(example, answer) {
  const sentence = typeof example === "string" ? example.trim() : "";
  const solution = typeof answer === "string" ? answer.trim() : "";
  if (!sentence || !solution) return null;

  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegExp(solution)})(?=$|[^\\p{L}\\p{N}])`, "giu");
  const matches = [...sentence.matchAll(pattern)];
  if (matches.length !== 1) return null;
  const match = matches[0];
  const prefix = match[1] ?? "";
  const start = (match.index ?? 0) + prefix.length;
  const end = start + match[2].length;
  return {
    prompt: `${sentence.slice(0, start)}___${sentence.slice(end)}`,
    answer: match[2],
    original: sentence,
  };
}

export function getStoredPartOfSpeech(word) {
  const tags = Array.isArray(word?.tags) ? word.tags.map(normalizeTag).filter(Boolean) : [];
  if (tags.some((tag) => VERB_TAGS.has(tag))) return "verb";
  if (tags.some((tag) => NON_VERB_TAGS.has(tag))) return "non-verb";
  return "unknown";
}

/** Writing clozes deliberately require an explicit, reliable non-verb tag. */
export function createWritingCloze(word) {
  if (getStoredPartOfSpeech(word) !== "non-verb") return null;
  return createExactCloze(word?.example, word?.source);
}

/** Quiz clozes may include verbs, but only in their exact stored form. */
export function createQuizCloze(word) {
  return createExactCloze(word?.example, word?.source);
}

export function haveCompatibleStoredPartOfSpeech(first, second) {
  const firstPart = getStoredPartOfSpeech(first);
  const secondPart = getStoredPartOfSpeech(second);
  return firstPart === "unknown" || secondPart === "unknown" || firstPart === secondPart;
}
