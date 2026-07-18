export const PRONUNCIATION_PROVIDER = "speech-synthesis";
export const MAX_PRONUNCIATION_TEXT_LENGTH = 200;

export const DEFAULT_PRONUNCIATION_VALUES = Object.freeze({
  rate: 0.9,
  pitch: 1,
  volume: 1,
});

const VALUE_RANGES = Object.freeze({
  rate: [0.5, 1.5],
  pitch: [0.5, 1.5],
  volume: [0, 1],
});

function reportInvalid(logger, message) {
  const method = typeof logger?.error === "function"
    ? logger.error.bind(logger)
    : typeof logger?.warn === "function"
      ? logger.warn.bind(logger)
      : null;
  method?.(message);
}

/** Accepts practical BCP-47 language tags without assuming installed voices. */
export function isValidSpeechLocale(value) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  const locale = value.trim();
  try {
    if (typeof globalThis.Intl?.Locale === "function") {
      return Boolean(new globalThis.Intl.Locale(locale).language);
    }
  } catch {
    return false;
  }

  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(locale);
}

function resolveNumber(value, name, logger) {
  const [minimum, maximum] = VALUE_RANGES[name];
  if (typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum) {
    return value;
  }

  if (value !== undefined) {
    reportInvalid(
      logger,
      `Ungültiger Aussprachewert für ${name}; Standardwert wird verwendet.`,
    );
  }
  return DEFAULT_PRONUNCIATION_VALUES[name];
}

function resolveLanguage(language, role, logger) {
  const speechLocale = typeof language?.speechLocale === "string"
    ? language.speechLocale.trim()
    : "";

  if (!isValidSpeechLocale(speechLocale)) {
    if (speechLocale) {
      reportInvalid(
        logger,
        `Ungültige speechLocale für die Sprachrolle ${role}; Aussprache wird dort nicht angeboten.`,
      );
    }
    return Object.freeze({
      code: typeof language?.code === "string" ? language.code.trim() : "",
      label: typeof language?.label === "string" ? language.label.trim() : "",
      speechLocale: null,
    });
  }

  return Object.freeze({
    code: typeof language?.code === "string" ? language.code.trim() : "",
    label: typeof language?.label === "string" ? language.label.trim() : "",
    speechLocale,
  });
}

/** Resolves safe course-level settings without turning config errors into UI failures. */
export function resolvePronunciationConfig(courseConfig = {}, options = {}) {
  const logger = options.logger ?? console;
  const raw = courseConfig?.pronunciation;
  const hasConfiguration = raw && typeof raw === "object" && !Array.isArray(raw);

  if (hasConfiguration && typeof raw.enabled !== "boolean") {
    reportInvalid(logger, "pronunciation.enabled muss ein boolescher Wert sein.");
  }

  const provider = raw?.provider ?? PRONUNCIATION_PROVIDER;
  const providerSupported = provider === PRONUNCIATION_PROVIDER;
  if (!providerSupported) {
    reportInvalid(logger, `Nicht unterstützter Audio-Provider: ${String(provider)}.`);
  }

  return Object.freeze({
    enabled: Boolean(hasConfiguration && raw.enabled === true && providerSupported),
    provider: PRONUNCIATION_PROVIDER,
    rate: resolveNumber(raw?.rate, "rate", logger),
    pitch: resolveNumber(raw?.pitch, "pitch", logger),
    volume: resolveNumber(raw?.volume, "volume", logger),
    maxTextLength: MAX_PRONUNCIATION_TEXT_LENGTH,
    languages: Object.freeze({
      source: resolveLanguage(courseConfig?.languages?.source, "source", logger),
      target: resolveLanguage(courseConfig?.languages?.target, "target", logger),
    }),
  });
}

/** Returns the configured locale for one explicit vocabulary-side role. */
export function getSpeechLocale(config, role) {
  return role === "source" || role === "target"
    ? config?.languages?.[role]?.speechLocale ?? null
    : null;
}
