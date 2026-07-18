// @ts-check

const MINIMUM_AUTOMATIC_PACKAGE_SIZE = 8;
const TARGET_MAXIMUM_PACKAGE_SIZE = 25;
const TECHNICAL_TITLE = /^(?:(?:(?:lern)?paket|part|teil|page|seite|bild|image|datei|file|chunk|abschnitt)\s*[-_.:#]?[a-z0-9]+|(?:temp|tmp)[-_\s]?(?:image|bild|file|datei)[-_\s]?[a-z0-9]*|.+\.(?:heic|heif|jpe?g|png|webp|json))$/iu;

export function isTechnicalLearningPackageTitle(title) {
  return TECHNICAL_TITLE.test(String(title ?? "").trim());
}

/**
 * Merges only clearly technical, undersized fragments. Semantic headings and
 * deliberately authored small packages remain untouched.
 */
export function normalizeImportedLearningPackages(units) {
  const mapped = (Array.isArray(units) ? units : []).map((unit) => ({
    ...unit,
    words: Array.isArray(unit?.words) ? [...unit.words] : unit?.words,
  }));
  const titled = new Map();
  const source = [];
  for (const unit of mapped) {
    const key = String(unit.title ?? "").normalize("NFKC").trim().toLocaleLowerCase("de-DE");
    const existing = titled.get(key);
    if (key && existing) {
      existing.words.push(...(Array.isArray(unit.words) ? unit.words : []));
      existing.current = Boolean(existing.current || unit.current);
      continue;
    }
    if (key) titled.set(key, unit);
    source.push(unit);
  }
  const normalized = [];
  const merges = [];
  const reservedTitles = new Set(source
    .filter((unit) => !isTechnicalLearningPackageTitle(unit.title))
    .map((unit) => String(unit.title).normalize("NFKC").trim().toLocaleLowerCase("de-DE")));
  let generatedPackageNumber = 1;
  let technicalRun = [];

  function nextGeneratedTitle() {
    let title;
    do {
      title = `Lernpaket ${generatedPackageNumber}`;
      generatedPackageNumber += 1;
    } while (reservedTitles.has(title.toLocaleLowerCase("de-DE")));
    reservedTitles.add(title.toLocaleLowerCase("de-DE"));
    return title;
  }

  function balancedSizes(total) {
    let count = Math.max(1, Math.round(total / 20));
    while (Math.ceil(total / count) > TARGET_MAXIMUM_PACKAGE_SIZE) count += 1;
    while (count > 1 && Math.floor(total / count) < 15) count -= 1;
    const base = Math.floor(total / count);
    const remainder = total % count;
    return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
  }

  function flushTechnicalRun() {
    if (technicalRun.length === 0) return;
    const words = technicalRun.flatMap((unit) => unit.words ?? []);
    const previous = normalized.at(-1);
    if (words.length < MINIMUM_AUTOMATIC_PACKAGE_SIZE && previous) {
      previous.words.push(...words);
      previous.current = Boolean(previous.current || technicalRun.some((unit) => unit.current));
      technicalRun.forEach((unit) => merges.push({
        from: unit.title,
        into: previous.title,
        wordCount: unit.words?.length ?? 0,
      }));
      technicalRun = [];
      return;
    }

    const template = technicalRun[0];
    const hasCurrent = technicalRun.some((unit) => unit.current);
    const sizes = balancedSizes(words.length);
    let offset = 0;
    sizes.forEach((size, index) => {
      const title = nextGeneratedTitle();
      normalized.push({
        ...template,
        title,
        description: index === 0 ? template.description : "",
        current: hasCurrent && index === 0,
        words: words.slice(offset, offset + size),
      });
      offset += size;
    });
    const generatedTitles = normalized.slice(-sizes.length).map((unit) => unit.title);
    technicalRun.forEach((unit) => merges.push({
      from: unit.title,
      into: generatedTitles.join(" / "),
      wordCount: unit.words?.length ?? 0,
    }));
    technicalRun = [];
  }

  for (const unit of source) {
    if (isTechnicalLearningPackageTitle(unit.title)) {
      technicalRun.push(unit);
      continue;
    }
    flushTechnicalRun();
    normalized.push(unit);
  }
  flushTechnicalRun();

  normalized.forEach((unit, index) => {
    if (Object.hasOwn(unit, "order")) unit.order = index + 1;
  });
  return { packages: normalized, merges };
}

export function getSmallLearningPackageWarnings(units) {
  return (Array.isArray(units) ? units : []).flatMap((unit, index) => {
    const count = Array.isArray(unit?.words) ? unit.words.length : 0;
    return count > 0 && count < MINIMUM_AUTOMATIC_PACKAGE_SIZE
      ? [{ unitIndex: index, title: unit.title, wordCount: count }]
      : [];
  });
}
