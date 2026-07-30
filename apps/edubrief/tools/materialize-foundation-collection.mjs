import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../content-loader.mjs";
import {
  APP_VERSION,
  DAY_ROLES,
  FOUNDATION_PACKAGE_ID,
} from "../domain.mjs";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const masterDirectory = resolve(projectRoot, "outputs/edubrief/editorial-master");
const outputDirectory = resolve(projectRoot, "outputs/edubrief/content-packages/foundation-weeks");
const contentFilename = "edubrief-foundation-weeks.content.json";
const timestamp = "2026-07-30T00:00:00Z";

const weeks = [
  ["feedback-und-ueberarbeitung-master.md", "feedback-and-revision", "Feedback und Überarbeitung"],
  ["abrufen-retrieval-practice-master.md", "retrieval-practice", "Abrufen / Retrieval Practice"],
  ["kognitive-belastung-cognitive-load-master.md", "cognitive-load", "Kognitive Belastung / Cognitive Load"],
  ["anleitung-und-selbststaendigkeit-master.md", "guidance-and-independence", "Anleitung und Selbstständigkeit"],
  ["tiefe-verarbeitung-und-lernhandlungen-master.md", "deep-processing", "Tiefe Verarbeitung und Lernhandlungen"],
  ["motivation-und-selbstbestimmung-master.md", "motivation-and-self-determination", "Motivation und Selbstbestimmung"],
  ["ziele-und-selbstregulation-master.md", "goals-and-self-regulation", "Ziele und Selbstregulation"],
  ["kooperatives-lernen-master.md", "cooperative-learning", "Kooperatives Lernen"],
  ["ueben-festigen-und-automatisieren-master.md", "practice-and-automaticity", "Üben, Festigen und Automatisieren"],
  ["leistung-beurteilen-und-noten-einordnen-master.md", "assessment-and-grades", "Leistung beurteilen und Noten einordnen"],
  ["langeweile-und-passung-master.md", "boredom-and-fit", "Langeweile und Passung"],
  ["klassenfuehrung-und-lernzeit-master.md", "classroom-management", "Klassenführung und Lernzeit"],
  ["individualisierung-und-adaptivitaet-master.md", "individualization-and-adaptivity", "Individualisierung und Adaptivität"],
  ["digitale-werkzeuge-und-multimedia-master.md", "digital-tools-and-multimedia", "Digitale Werkzeuge und Multimedia"],
  ["klassenwiederholung-master.md", "grade-retention", "Klassenwiederholung"],
  ["hausaufgaben-als-lernarchitektur-master.md", "homework-as-learning-architecture", "Hausaufgaben als Lernarchitektur"],
].map(([filename, slug, title], index) => ({ filename, slug, title, order: index + 1 }));

const legacyRetrievalAliases = {
  "RP-01": ["impulse.rp-02-general", "impulse.rp-02-english", "impulse.rp-02-bwr"],
  "RP-04": ["impulse.rp-01-general", "impulse.rp-01-english", "impulse.rp-01-bwr", "impulse.rp-01-teacher-education"],
  "RP-08": ["impulse.rp-03-general", "impulse.rp-03-english", "impulse.rp-03-bwr", "impulse.rp-03-teacher-education"],
  "RP-11": ["impulse.rp-04-general", "impulse.rp-04-english", "impulse.rp-04-bwr", "impulse.rp-04-teacher-education"],
  "RP-15": ["impulse.rp-05-general", "impulse.rp-05-english", "impulse.rp-05-bwr", "impulse.rp-05-teacher-education"],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stripInlineMarkdown(value) {
  return value
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1 ($2)")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^\s*>\s?/gm, "")
    .trim();
}

function plainText(value) {
  const paragraphs = [];
  let current = [];
  const flush = () => {
    if (current.length) paragraphs.push(current.join(" ").replace(/\s+/g, " ").trim());
    current = [];
  };
  for (const sourceLine of value.trim().split(/\r?\n/)) {
    const line = stripInlineMarkdown(sourceLine.trim());
    if (line === "---") {
      flush();
      continue;
    }
    if (!line) {
      flush();
      continue;
    }
    if (/^[-*] /.test(line)) {
      flush();
      paragraphs.push(`• ${line.slice(2).trim()}`);
    } else {
      current.push(line);
    }
  }
  flush();
  return paragraphs.join("\n\n").trim();
}

function section(text, level, title) {
  const marker = "#".repeat(level);
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^${marker} ${escaped}\\n([\\s\\S]*?)(?=^${marker} |(?![\\s\\S]))`, "m"));
  assert(match, `Abschnitt fehlt: ${title}`);
  return match[1].replace(/\n---\s*$/, "").trim();
}

function cardBlocks(text, filename) {
  const matches = [...text.matchAll(
    /^## Karte (\d+)\n([\s\S]*?)(?=^## Karte \d+|^## Querverbindungen|^# Redaktioneller Herkunftsnachweis|^# Abgleich|(?![\s\S]))/gm,
  )];
  assert(matches.length === 5, `${filename}: erwartet fünf Karten, gefunden ${matches.length}.`);
  return matches.map((match, index) => {
    assert(Number(match[1]) === index + 1, `${filename}: Kartenreihenfolge ist inkonsistent.`);
    return match[2].trim();
  });
}

function listItems(value) {
  const items = [];
  for (const rawLine of value.split(/\r?\n/)) {
    if (/^- /.test(rawLine)) {
      items.push(stripInlineMarkdown(rawLine.slice(2)));
    } else if (/^\s+- /.test(rawLine) && items.length) {
      items[items.length - 1] += ` – ${stripInlineMarkdown(rawLine.replace(/^\s+- /, ""))}`;
    } else if (rawLine.trim() && items.length) {
      items[items.length - 1] += ` ${stripInlineMarkdown(rawLine.trim())}`;
    }
  }
  return items.map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function implementationField(body, labels, required = true) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = body.match(new RegExp(
      `^\\*\\*${escaped}:\\*\\*\\s*([\\s\\S]*?)(?=^\\*\\*[^*]+:\\*\\*|(?![\\s\\S]))`,
      "m",
    ));
    if (match) return plainText(match[1]);
  }
  assert(!required, `Umsetzungsfeld fehlt: ${labels.join(" / ")}`);
  return "";
}

function parseImplementations(value, weekSlug, cardNumber) {
  const matches = [...value.matchAll(
    /^#### ([A-Z]{2}-\d{2}) · (.+)\n([\s\S]*?)(?=^#### [A-Z]{2}-\d{2} · |(?![\s\S]))/gm,
  )];
  assert(matches.length === 3, `${weekSlug}, Karte ${cardNumber}: erwartet drei Umsetzungen, gefunden ${matches.length}.`);
  return matches.map((match, index) => {
    const masterId = match[1];
    const teacherAction = implementationField(match[3], ["Konkrete Lehrkrafthandlung"]);
    const learningAction = implementationField(match[3], [
      "Daraus folgende fachliche Lernhandlung",
      "Daraus folgende fachliche Lernhandlung oder Informationsgewinn",
    ]);
    const observationPrompt = implementationField(match[3], ["Worauf du achten kannst"]);
    const variation = implementationField(match[3], ["Mögliche Abwandlung"], false);
    const implementation = {
      implementationId: `practice-idea.${masterId.toLowerCase()}`,
      editorialOrder: (index + 1) * 10,
      applicability: { type: "general" },
      title: stripInlineMarkdown(match[2]),
      learningAction: `${teacherAction}\n\nDaraus folgende fachliche Lernhandlung: ${learningAction}`,
      observationPrompt,
      transferStatus: "didactic-transfer",
      reviewStatus: "approved",
    };
    if (variation) implementation.variation = variation;
    if (legacyRetrievalAliases[masterId]) {
      implementation.legacyImplementationIds = legacyRetrievalAliases[masterId];
    }
    return implementation;
  });
}

function parseEvidence(value) {
  const levels = [...value.matchAll(/\bE([0-4])\b/g)].map((match) => Number(match[1]));
  assert(levels.length, "Evidenzniveau enthält keinen E0–E4-Wert.");
  return `E${Math.min(...levels)}`;
}

function masterFocus(text) {
  const preamble = text.split(/^---$/m)[0];
  const quote = preamble.match(/^>\s*\*\*([\s\S]*?)\*\*\s*$/m);
  if (quote) return plainText(quote[1]);
  const movement = preamble.match(/Die Themenwoche folgt dem Bogen \*\*([^*]+)\*\*\.[^\n]*/);
  assert(movement, "Wochenbewegung fehlt.");
  return plainText(movement[0]);
}

function dossierIdFor(science, sourceItems, primaryFundusStatementId) {
  if (primaryFundusStatementId) return primaryFundusStatementId.replace(/-A\d{2}$/, "");
  const sourceText = sourceItems.join("\n");
  const dossier = sourceText.match(/Fundus-Dossier(?:s)?\s+([A-Z]{2,4}-\d{2})/)
    ?? sourceText.match(/\b([A-Z]{2,4}-\d{2})\b/)
    ?? science.match(/\b([A-Z]{2,4}-\d{2})\b/);
  assert(dossier, "Kein kanonischer Dossierbezug gefunden.");
  return dossier[1];
}

function cardId(week, sequence) {
  if (week.slug === "retrieval-practice") return `card.retrieval-practice-${String(sequence).padStart(2, "0")}`;
  return `card.${week.slug}-${String(sequence).padStart(2, "0")}`;
}

function weekId(week) {
  return week.slug === "retrieval-practice"
    ? "week.retrieval-practice-01"
    : `week.${week.slug}-01`;
}

function topicId(week) {
  return week.slug === "retrieval-practice"
    ? "topic.retrieval-practice"
    : `topic.${week.slug}`;
}

const masterRecords = [];
for (const week of weeks) {
  const path = resolve(masterDirectory, week.filename);
  const bytes = await readFile(path);
  masterRecords.push({ ...week, path, text: bytes.toString("utf8"), sha256: sha256(bytes) });
}

const allSources = [];
const topics = [];
const themeWeeks = [];
const cards = [];

for (const master of masterRecords) {
  const blocks = cardBlocks(master.text, master.filename);
  const focus = masterFocus(master.text);
  const parsedCards = blocks.map((body, index) => {
    const sequence = index + 1;
    const title = plainText(section(body, 3, "Titel"));
    const guidingQuestion = plainText(section(body, 3, "Leitfrage"));
    const shortAnswer = plainText(section(body, 3, "Antwort in Kürze"));
    const explanation = plainText(section(body, 3, "Etwas genauer"));
    const takeaway = plainText(section(body, 3, "Merksatz"));
    const implementations = parseImplementations(section(body, 3, "Mögliche Umsetzungen"), master.slug, sequence);
    const science = section(body, 3, "Wissenschaftliche Fundierung");
    const robustCore = plainText(section(science, 4, "Wissenschaftlicher Kern"));
    const evidenceText = section(science, 4, "Evidenzniveau");
    const conditionsAndLimits = listItems(section(science, 4, "Bedingungen und Grenzen"));
    const doesNotFollow = listItems(section(science, 4, "Was daraus nicht folgt"));
    const sourceItems = listItems(section(science, 4, "Geprüfte Quellenbasis"));
    const reflection = plainText(section(body, 3, "Ein Gedanke zum Mitnehmen"));
    const statementIds = [...new Set(
      [...science.matchAll(/\b[A-Z]{2,4}-\d{2}-A\d{2}\b/g)].map((match) => match[0]),
    )];
    const primaryFundusStatementId = statementIds[0] ?? null;
    const dossierId = dossierIdFor(science, sourceItems, primaryFundusStatementId);
    assert(conditionsAndLimits.length, `${master.filename}, Karte ${sequence}: Bedingungen und Grenzen fehlen.`);
    assert(doesNotFollow.length, `${master.filename}, Karte ${sequence}: unzulässige Folgerungen fehlen.`);
    assert(sourceItems.length, `${master.filename}, Karte ${sequence}: Quellenbasis fehlt.`);
    assert(sourceItems.length <= 20, `${master.filename}, Karte ${sequence}: mehr als 20 Quellen.`);

    const sourceRefs = sourceItems.map((citation, sourceIndex) => {
      const sourceId = `source.${master.slug}-${String(sequence).padStart(2, "0")}-${String(sourceIndex + 1).padStart(2, "0")}`;
      allSources.push({
        sourceId,
        fundusSourceId: dossierId,
        citation,
        verificationStatus: "verified",
        verificationScope: "full-check",
      });
      return sourceId;
    });

    const researchStatement = {
      supportingFundusStatementIds: statementIds.slice(primaryFundusStatementId ? 1 : 0, 9),
      dossierId,
      statementType: "professional-interpretation",
      evidenceLevel: parseEvidence(evidenceText),
      evidenceSummary: plainText(evidenceText),
      robustCore,
      didacticInterpretation: explanation,
      conditionsAndLimits,
      doesNotFollow,
      sourceRefs,
    };
    if (primaryFundusStatementId) researchStatement.primaryFundusStatementId = primaryFundusStatementId;

    return {
      id: cardId(master, sequence),
      contentRevision: 1,
      topicId: topicId(master),
      themeWeekId: weekId(master),
      sequence,
      dayRole: DAY_ROLES[index],
      title,
      guidingQuestion,
      shortAnswer,
      explanation,
      takeaway,
      researchStatement,
      implementations,
      reflectionPrompts: [{
        reflectionPromptId: `reflection.${master.slug}-${String(sequence).padStart(2, "0")}`,
        prompt: reflection,
      }],
      crossReferences: [],
      reviewState: {
        lifecycleStatus: "approved",
        publicationStatus: "P3",
        editorialVersion: 1,
        reviewedSourceRefs: sourceRefs,
        contentAuthorId: "edubrief-editorial-master-process",
        scientificReviewerId: "edubrief-fundus-review-process",
        editorialReviewerId: "edubrief-editorial-master-process",
        releaseApproverId: "edubrief-project-owner",
        approvedAt: timestamp,
        reviewApprovalRef: "editorial-master-collection-v1",
      },
    };
  });

  topics.push({
    topicId: topicId(master),
    title: `Woche ${master.order}`,
    summary: focus,
  });
  themeWeeks.push({
    weekId: weekId(master),
    topicId: topicId(master),
    title: master.title,
    weekQuestion: focus,
    dayIds: parsedCards.map((card) => card.id),
    nextTopicCrossReference: null,
  });
  cards.push(...parsedCards);
}

for (let weekIndex = 0; weekIndex < themeWeeks.length; weekIndex += 1) {
  const week = themeWeeks[weekIndex];
  const nextWeek = themeWeeks[weekIndex + 1];
  week.nextTopicCrossReference = nextWeek?.dayIds[0] ?? null;
  for (let cardIndex = 0; cardIndex < week.dayIds.length; cardIndex += 1) {
    const currentCard = cards.find((card) => card.id === week.dayIds[cardIndex]);
    const targetContentId = week.dayIds[cardIndex + 1] ?? nextWeek?.dayIds[0] ?? null;
    if (targetContentId) {
      const target = cards.find((card) => card.id === targetContentId);
      currentCard.crossReferences.push({
        targetContentId,
        relation: "continues-with",
        label: `Weiter: ${target.title}`,
      });
    }
  }
}

const content = {
  locale: "de-DE",
  sources: allSources,
  topics,
  themeWeeks,
  cards,
  tombstones: [],
};

const allIds = [
  ...allSources.map((source) => source.sourceId),
  ...topics.map((topic) => topic.topicId),
  ...themeWeeks.map((week) => week.weekId),
  ...cards.map((card) => card.id),
  ...cards.flatMap((card) => card.implementations.map((implementation) => implementation.implementationId)),
];
assert(new Set(allIds).size === allIds.length, "Globale Content-IDs sind nicht eindeutig.");
assert(themeWeeks.length === 16, "Es werden exakt 16 Themenwochen erwartet.");
assert(cards.length === 80, "Es werden exakt 80 EduCoffees erwartet.");
assert(cards.flatMap((card) => card.implementations).length === 240, "Es werden exakt 240 Umsetzungen erwartet.");

const contentText = `${JSON.stringify(content, null, 2)}\n`;
const contentBytes = Buffer.from(contentText);
const masterCollectionFingerprint = sha256(canonicalJson(
  masterRecords.map(({ filename, sha256: fileHash }) => ({ path: `outputs/edubrief/editorial-master/${filename}`, sha256: fileHash })),
));
const manifest = {
  packageId: FOUNDATION_PACKAGE_ID,
  publisherId: "edutools",
  packagePurpose: "distribution",
  schemaVersion: "3.0.0-distribution",
  contentVersion: "1.0.0",
  createdByAppVersion: APP_VERSION,
  minimumAppVersion: APP_VERSION,
  createdAt: timestamp,
  releasedAt: timestamp,
  releaseStatus: "published",
  publicationStatus: "P3",
  locale: "de-DE",
  hashAlgorithm: "sha-256",
  canonicalization: "edubrief-canonical-json-v1",
  files: [{
    path: contentFilename,
    mediaType: "application/json",
    bytes: contentBytes.byteLength,
    sha256: sha256(contentBytes),
  }],
  counts: {
    sources: allSources.length,
    topics: topics.length,
    themeWeeks: themeWeeks.length,
    cards: cards.length,
    implementations: cards.flatMap((card) => card.implementations).length,
    tombstones: 0,
  },
  contentAuthorId: "edubrief-editorial-master-process",
  scientificReviewerId: "edubrief-fundus-review-process",
  editorialReviewerId: "edubrief-editorial-master-process",
  contentGateApprovalRef: "editorial-master-collection-16-weeks",
  contentGateApprovalSha256: masterCollectionFingerprint,
  releaseApproverId: "edubrief-project-owner",
};
manifest.manifestHash = sha256(canonicalJson(manifest));

await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, contentFilename), contentText);
await writeFile(resolve(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

process.stdout.write([
  `Materialisiert: ${basename(outputDirectory)}`,
  `Quellen: ${allSources.length}`,
  `Wochen: ${themeWeeks.length}`,
  `Karten: ${cards.length}`,
  `Umsetzungen: ${cards.flatMap((card) => card.implementations).length}`,
  `Content-SHA-256: ${manifest.files[0].sha256}`,
  `Manifest-SHA-256: ${manifest.manifestHash}`,
  "",
].join("\n"));
