/**
 * Vocabulary-Trainer policy for deciding whether a configured language may
 * receive pronunciation controls. The reusable speech service deliberately
 * remains language-agnostic.
 */

function getConfiguredLanguage(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return new Intl.Locale(value.trim()).language.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Allows pronunciation only for content in the configured Source role. The
 * concrete language is course data; Target content is never pronounced.
 */
export function isPronunciationAllowedForRole(role, languageConfig) {
  if (role !== "source") return false;
  if (!languageConfig || typeof languageConfig !== "object") return false;

  const codeLanguage = getConfiguredLanguage(languageConfig.code);
  const localeLanguage = getConfiguredLanguage(languageConfig.speechLocale);
  return Boolean(codeLanguage && localeLanguage && codeLanguage === localeLanguage);
}
