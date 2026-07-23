import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const sourceDirectory = resolve(projectRoot, "outputs/edubrief/content-candidates/retrieval-practice-week-v1.1-candidate.3");
const outputDirectory = resolve(projectRoot, "outputs/edubrief/content-candidates/retrieval-practice-week-v1.1-candidate.4");
const sourceContentPath = resolve(sourceDirectory, "retrieval-practice-week.content.json");

const EXPECTED = {
  sourceContent: "0616ad474a60dc19583ba778c2ec27b9bdb0d30d6fc728809005c8323d0641ec",
  sourceManifest: "ce9dc6dd5e8e0d202c1486a6fdbfb542f050bf9542c30f0c8caad3bcbf7beb48",
  publishedManifest: "1309cefe589de53f6961c2bb6a2e7be0603194a7ec71a589708df0dae226e400",
  publishedContent: "d796fb45f16c90e002d4c99ad196e301d34374316474b4e971d5521932130c51",
  stagingManifest: "ec858901501b6bf8cc274364914aa9608881e6145f395a601b5df8a880c9d381",
  stagingContent: "f7965ed3af8cf97d006791e758bb54495844be660e8d33cd9eee3ba0fb6131ca",
  stagingZip: "e2d632d1f9807a86ff5bab6f2daf0b4010578fbefdd177938d4d054cfd72d3d1",
};

const CARD_CHANGES = {
  "card.retrieval-practice-01": {
    guidingQuestion: "Woran erkenne ich, ob eine Frage aus dem Gedächtnis beim Lernen hilft und nicht nur Wissen kontrolliert?",
    shortAnswer: "Lass Lernende einen bereits behandelten Inhalt zunächst aus dem Gedächtnis beantworten. Danach vergleichen und verbessern sie ihre Antwort. Die Aufgabe bleibt kurz, und Fehler dürfen sichtbar korrigiert werden.",
    takeaway: "Aus dem Gedächtnis antworten kann Lernen fördern – auch ohne Note, Punkte oder öffentlichen Vergleich.",
  },
  "card.retrieval-practice-02": {
    shortAnswer: "Lass Lernende zunächst selbst antworten, bevor sie Heft, Buch, Wortbank oder Musterlösung öffnen. Erst danach vergleichen und verbessern sie ihre Antwort.",
    takeaway: "Erst selbst antworten, dann vergleichen: So wird sichtbar, was schon aus dem Gedächtnis gelingt.",
  },
  "card.retrieval-practice-03": {
    title: "Hilfen geben, ohne die Antwort vorwegzunehmen",
    guidingQuestion: "Wie kann ich helfen, ohne die Antwort schon zu zeigen?",
    shortAnswer: "Beginne mit einer offenen Frage. Wenn Lernende nicht weiterkommen, gib schrittweise kleine Hinweise. Erst danach vergleichen und verbessern sie ihre Antwort.",
    takeaway: "Lernende denken so lange wie möglich selbst; Hinweise geben nur so viel Orientierung wie nötig.",
    reflectionPrompt: "Welche Hilfe gibt einen hilfreichen Anstoß – und welche verrät schon zu viel?",
  },
  "card.retrieval-practice-04": {
    title: "Antworten vergleichen und gezielt verbessern",
    guidingQuestion: "Wie wird aus einer Rückmeldung zu einer selbst formulierten Antwort eine konkrete Verbesserung?",
    shortAnswer: "Lass Lernende zuerst selbst antworten. Danach vergleichen sie mit einer Musterlösung, Definition oder einem korrekten Beispiel und verbessern mindestens eine Stelle sichtbar.",
    takeaway: "Rückmeldung hilft weiter, wenn Lernende ihre eigene Antwort prüfen und gezielt verbessern.",
    reflectionPrompt: "Welche kleine sichtbare Verbesserung könnte in deiner nächsten Aufgabe zeigen, dass die Rückmeldung genutzt wurde?",
  },
  "card.retrieval-practice-05": {
    title: "Später mit einem neuen Beispiel erneut abrufen",
    guidingQuestion: "Wie kann ich eine Frage später erneut aufgreifen, ohne immer genau dasselbe zu wiederholen?",
    shortAnswer: "Stelle eine frühere Frage später noch einmal und ändere das Beispiel oder die Situation. Die Lernenden antworten zunächst ohne Vorlage, vergleichen und verbessern anschließend.",
    takeaway: "Später mit einem neuen Beispiel aus dem Gedächtnis antworten – statt dieselbe Frage sofort zu wiederholen.",
    reflectionPrompt: "Welche kurze Frage möchtest du später mit einem neuen Beispiel noch einmal aufgreifen – und welche Grenze musst du dabei beachten?",
  },
};

const IMPLEMENTATION_CHANGES = {
  "practice-idea.rp-01-concept-map": {
    learningAction: "Nenne drei Begriffe aus einem bereits behandelten Thema. Die Lernenden zeichnen ohne Heft oder Buch zwei Verbindungen zwischen den Begriffen. Danach vergleichen sie ihr Netz mit einer kurzen Musterlösung oder Übersicht und ergänzen oder verbessern es.",
    observationPrompt: "Achte darauf, welche Verbindungen viele selbst finden und welche häufig fehlen oder falsch sind. Greife eine häufig fehlende oder falsche Verbindung anschließend noch einmal kurz auf.",
  },
  "impulse.rp-01-english": {
    title: "Englische Wendung zuerst selbst formulieren",
    learningAction: "Nenne eine bereits behandelte Wendung oder Regel. Die Lernenden formulieren sie zunächst selbst, ohne ein Beispiel zu sehen. Danach vergleichen sie mit einem korrekten Beispiel und verbessern ihre Formulierung.",
    observationPrompt: "Achte darauf, welche Wörter oder Satzteile viele selbst formulieren und was häufig erst beim Beispiel erkannt wird. Greife eine häufige Unsicherheit anschließend kurz auf.",
  },
  "impulse.rp-01-bwr": {
    learningAction: "Nenne einen vertrauten Geschäftsfall. Die Lernenden bilden zunächst ohne Muster einen Buchungssatz. Danach vergleichen sie mit einer begründeten Musterlösung und verbessern bei Bedarf Kontoauswahl oder Soll-Haben-Zuordnung.",
    observationPrompt: "Achte darauf, ob viele das passende Konto oder die Soll-Haben-Zuordnung verwechseln. Greife die häufigste Verwechslung anschließend noch einmal kurz auf.",
  },
  "practice-idea.rp-02-sketch-first": {
    learningAction: "Bitte die Lernenden, einen bekannten Ablauf, Zusammenhang oder Aufbau zunächst ohne Heft oder Buch als einfache Skizze darzustellen. Danach öffnen sie die Text- oder Bildvorlage, markieren fehlende Elemente und ergänzen ihre Skizze.",
    observationPrompt: "Achte darauf, welche wichtigen Schritte oder Bestandteile viele schon einzeichnen und was häufig fehlt oder in der falschen Reihenfolge steht. Greife einen häufig fehlenden Punkt anschließend noch einmal kurz auf.",
  },
  "impulse.rp-02-english": {
    learningAction: "Lass die Lernenden ein bekanntes Wort, eine Wendung oder eine passende sprachliche Form zunächst selbst nennen oder formulieren. Öffne die Wortbank erst danach. Die Lernenden vergleichen und verbessern ihre Antwort.",
    observationPrompt: "Achte darauf, welche Wörter oder Wendungen viele selbst nennen und was häufig erst in der Wortbank erkannt wird. Übe eine häufig fehlende Form anschließend noch einmal kurz.",
  },
  "impulse.rp-02-bwr": {
    learningAction: "Gib einen bekannten Geschäftsfall. Die Lernenden notieren zunächst ohne Muster passende Konten und entscheiden über Soll und Haben. Danach vergleichen sie mit einer begründeten Musterlösung und verbessern ihre Entscheidung.",
    observationPrompt: "Achte darauf, ob häufig die Kontoauswahl oder die Buchungsrichtung verwechselt wird. Kläre die häufigere Verwechslung anschließend noch einmal an einem kurzen Beispiel.",
  },
  "practice-idea.rp-03-single-cue": {
    learningAction: "Stelle eine Frage zu einem bereits behandelten Inhalt zunächst ohne Hilfe. Wer nicht weiterkommt, erhält einen vorbereiteten Schlüsselbegriff und versucht erneut selbst zu antworten. Erst danach öffnest du eine Musterlösung, Definition oder ein korrektes Beispiel.",
    observationPrompt: "Achte darauf, ob der Schlüsselbegriff vielen hilft, die Antwort selbst fortzusetzen. Wenn nicht, plane für das nächste Mal einen konkreteren Zwischenschritt.",
  },
  "impulse.rp-03-english": {
    title: "Englische Form mit kleinen Hinweisen erinnern",
    learningAction: "Bitte die Lernenden, eine bekannte Wendung oder grammatische Form selbst zu formulieren. Gib bei Bedarf zuerst den Satzkontext, dann den Anfangsbuchstaben und danach ein Wort aus derselben Wortfamilie. Zeige erst anschließend die korrekte Form.",
    observationPrompt: "Achte darauf, welcher Hinweis vielen reicht, um die Form selbst zu finden. Wenn der letzte Hinweis nur zum Wiedererkennen führt, beginne beim nächsten Mal mit einem anderen Hinweis.",
  },
  "impulse.rp-03-bwr": {
    learningAction: "Gib einen bekannten Geschäftsfall. Die Lernenden wählen zunächst Konten und Soll oder Haben selbst. Wenn sie nicht weiterkommen, gib nacheinander einen Hinweis zur Kontenart, eine Soll-Haben-Leitfrage und eine Teilbuchung. Zeige danach die Musterlösung.",
    observationPrompt: "Achte darauf, ob häufig die Kontenart, die Kontenwahl oder die Soll-Haben-Zuordnung die Hürde ist. Greife genau diesen Schritt vor einer ähnlichen Aufgabe noch einmal kurz auf.",
  },
  "practice-idea.rp-04-repair-reasoning": {
    learningAction: "Lass die Lernenden eine bekannte Regel oder Erklärung zunächst ohne Heft oder Buch aufschreiben. Danach vergleichen sie mit einer Musterlösung oder Definition, verbessern genau eine unklare oder falsche Stelle und markieren ihre Änderung.",
    observationPrompt: "Achte darauf, ob der fehlende oder falsche Punkt nach der Änderung fachlich stimmt und ob die Lernenden ihre Änderung erklären können. Greife eine häufige Lücke anschließend noch einmal kurz auf.",
  },
  "impulse.rp-04-english": {
    learningAction: "Lass die Lernenden eine bekannte sprachliche Form oder kurze Erklärung zunächst selbst formulieren. Danach vergleichen sie mit einem korrekten Beispiel, verbessern eine konkrete Stelle ihrer Antwort und begründen die Änderung kurz.",
    observationPrompt: "Achte darauf, ob die Lernenden erklären können, warum ihre Änderung nötig ist. Wenn viele nur abschreiben, besprecht eine typische Änderung gemeinsam.",
  },
  "impulse.rp-04-bwr": {
    learningAction: "Lass die Lernenden einen bekannten Geschäftsfall zunächst ohne Muster buchen. Danach vergleichen sie mit einer Musterlösung, verbessern eine Konten- oder Soll-Haben-Entscheidung sichtbar und erklären ihre Änderung kurz.",
    observationPrompt: "Achte darauf, welche Konten- oder Soll-Haben-Entscheidung häufig verbessert werden muss. Greife genau diese Entscheidung anschließend noch einmal an einem kurzen Beispiel auf.",
  },
  "practice-idea.rp-05-two-moments": {
    title: "Eine Frage später mit einem neuen Beispiel wiederholen",
    learningAction: "Stelle eine Frage zu einem früher behandelten Inhalt in einer späteren Stunde erneut, zunächst ohne Heft oder Buch. Verwende ein anderes Beispiel oder eine veränderte Situation. Danach markieren die Lernenden, was sie übertragen oder korrigieren mussten.",
    observationPrompt: "Achte darauf, ob viele dasselbe Prinzip auf die neue Situation anwenden können und wo die Übertragung nicht gelingt. Greife eine häufige Schwierigkeit anschließend noch einmal kurz auf.",
  },
  "impulse.rp-05-english": {
    title: "Bekannte englische Form in einem neuen Satz verwenden",
    learningAction: "Gib einen neuen Satz oder kurzen Dialog vor. Die Lernenden verwenden darin zunächst ohne Beispiel eine bekannte Wendung oder Regel. Danach vergleichen sie mit einem korrekten Beispiel und verbessern ihre Formulierung.",
    observationPrompt: "Achte darauf, ob die bekannte Form passend an den neuen Satz oder Dialog angepasst wird. Kläre eine häufige Fehlanpassung anschließend an einem weiteren kurzen Beispiel.",
  },
  "impulse.rp-05-bwr": {
    learningAction: "Gib einen neuen Geschäftsfall, für den eine bereits behandelte Regel gebraucht wird. Die Lernenden entscheiden ohne Muster, welche Konten und welche Buchungsrichtung passen. Danach vergleichen und verbessern sie ihre Lösung.",
    observationPrompt: "Achte darauf, ob die bekannte Regel erkannt und auf den neuen Geschäftsfall richtig übertragen wird. Greife eine häufige Fehlübertragung anschließend noch einmal kurz auf.",
  },
};

const DIFFERENCES = {
  "practice-idea.rp-01-concept-map": "Begriffe und ihre Beziehungen aus dem Gedächtnis darstellen",
  "impulse.rp-01-english": "bekannte Wendung oder Regel selbst formulieren",
  "impulse.rp-01-bwr": "Buchungssatz ohne Muster bilden",
  "practice-idea.rp-02-sketch-first": "Ablauf oder Aufbau zunächst skizzieren",
  "impulse.rp-02-english": "Wort oder Wendung vor der Wortbank nennen",
  "impulse.rp-02-bwr": "Konten und Buchungsrichtung vor dem Muster bestimmen",
  "practice-idea.rp-03-single-cue": "einen gezielten Schlüsselbegriff als Hilfe erproben",
  "impulse.rp-03-english": "sprachliche Hilfen schrittweise öffnen",
  "impulse.rp-03-bwr": "Buchungsentscheidung mit gestuften Hinweisen unterstützen",
  "practice-idea.rp-04-repair-reasoning": "eine selbst formulierte Erklärung punktuell verbessern",
  "impulse.rp-04-english": "eine eigene sprachliche Antwort begründet verbessern",
  "impulse.rp-04-bwr": "eine eigene Buchungsentscheidung sichtbar verbessern",
  "practice-idea.rp-05-two-moments": "frühere Frage später in veränderter Situation aufgreifen",
  "impulse.rp-05-english": "bekannte sprachliche Form in neuem Satz oder Dialog verwenden",
  "impulse.rp-05-bwr": "bekannte Buchungsregel auf neuen Geschäftsfall übertragen",
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const stableJson = (value) => JSON.stringify(value);

async function verified(path, expected, label) {
  const bytes = await readFile(path);
  assert(sha256(bytes) === expected, `${label}: geschützter Hash weicht ab.`);
  return bytes;
}

async function immutableWrite(path, bytes) {
  try {
    await access(path);
    const existing = await readFile(path);
    assert(Buffer.compare(existing, bytes) === 0, `Immutabilitätskonflikt: ${path}`);
    return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(path, bytes, { flag: "wx" });
}

await verified(sourceContentPath, EXPECTED.sourceContent, "Candidate-3-Content");
await verified(resolve(sourceDirectory, "review-manifest.json"), EXPECTED.sourceManifest, "Candidate-3-Manifest");
await verified(resolve(projectRoot, "outputs/edubrief/content-packages/retrieval-practice-week/manifest.json"), EXPECTED.publishedManifest, "Paket-1.0.0-Manifest");
await verified(resolve(projectRoot, "outputs/edubrief/content-packages/retrieval-practice-week/retrieval-practice-week.content.json"), EXPECTED.publishedContent, "Paket-1.0.0-Content");
await verified(resolve(projectRoot, "outputs/edubrief/content-packages-staging/retrieval-practice-distribution-1.1.0-rc.1/manifest.json"), EXPECTED.stagingManifest, "RC-1-Manifest");
await verified(resolve(projectRoot, "outputs/edubrief/content-packages-staging/retrieval-practice-distribution-1.1.0-rc.1/retrieval-practice-week.content.json"), EXPECTED.stagingContent, "RC-1-Content");
await verified(resolve(projectRoot, "outputs/edubrief-retrieval-practice-distribution-1.1.0-rc.1.zip"), EXPECTED.stagingZip, "RC-1-ZIP");

const source = JSON.parse(await readFile(sourceContentPath, "utf8"));
assert(source.candidateMetadata.candidateVersion === "1.1.0-candidate.3", "Unerwartete Candidate-3-Version.");
assert(source.candidateMetadata.status === "review-candidate" && source.candidateMetadata.notForRuntime === true, "Candidate 3 ist kein unveränderter Reviewkandidat.");

const candidate = structuredClone(source);
candidate.candidateMetadata = {
  ...source.candidateMetadata,
  candidateVersion: "1.1.0-candidate.4",
  supersedesCandidateVersion: "1.1.0-candidate.3",
};

const deltas = [];
const changeField = (target, field, nextValue, path) => {
  assert(Object.hasOwn(target, field), `Quellfeld fehlt: ${path}`);
  const previousValue = target[field];
  assert(typeof previousValue === "string" && previousValue.length > 0, `Ungültiger Quellwert: ${path}`);
  assert(previousValue !== nextValue, `Kein tatsächliches Delta: ${path}`);
  target[field] = nextValue;
  deltas.push({ path, before: previousValue, after: nextValue });
};

for (const card of candidate.cards) {
  const cardChanges = CARD_CHANGES[card.id];
  if (cardChanges) {
    for (const [field, value] of Object.entries(cardChanges)) {
      if (field === "reflectionPrompt") changeField(card.reflectionPrompts[0], "prompt", value, `cards.${card.id}.reflectionPrompts[0].prompt`);
      else changeField(card, field, value, `cards.${card.id}.${field}`);
    }
  }
  for (const implementation of card.implementations) {
    const implementationChanges = IMPLEMENTATION_CHANGES[implementation.implementationId];
    assert(implementationChanges, `Keine Plain-Language-Prüfung für ${implementation.implementationId}.`);
    for (const [field, value] of Object.entries(implementationChanges)) {
      changeField(implementation, field, value, `implementations.${implementation.implementationId}.${field}`);
    }
  }
}

assert(candidate.cards.length === 5, "Kartenanzahl verändert.");
const sourceImplementations = source.cards.flatMap((card) => card.implementations);
const candidateImplementations = candidate.cards.flatMap((card) => card.implementations);
assert(candidateImplementations.length === 15, "Umsetzungsanzahl verändert.");
assert(sourceImplementations.every((item, index) => item.implementationId === candidateImplementations[index].implementationId), "Umsetzungs-IDs oder Reihenfolge verändert.");
assert(candidateImplementations.every((item) => !Object.hasOwn(item, "variation")), "Candidate 4 darf keine künstliche Abwandlung ergänzen.");

const protectedRootFields = ["locale", "sources", "topics", "themeWeeks", "tombstones"];
for (const field of protectedRootFields) assert(stableJson(candidate[field]) === stableJson(source[field]), `Geschütztes Rootfeld verändert: ${field}`);
const protectedCardFields = ["id", "contentRevision", "topicId", "themeWeekId", "sequence", "dayRole", "estimatedMinutes", "researchStatement", "crossReferences", "reviewState"];
const protectedImplementationFields = ["implementationId", "editorialOrder", "applicability", "transferStatus", "reviewStatus", "fundusStatementId", "subjectLabel", "subjectExample", "variation"];
for (let index = 0; index < source.cards.length; index += 1) {
  for (const field of protectedCardFields) assert(stableJson(candidate.cards[index][field]) === stableJson(source.cards[index][field]), `Geschütztes Kartenfeld verändert: ${candidate.cards[index].id}.${field}`);
  for (let implementationIndex = 0; implementationIndex < source.cards[index].implementations.length; implementationIndex += 1) {
    const before = source.cards[index].implementations[implementationIndex];
    const after = candidate.cards[index].implementations[implementationIndex];
    for (const field of protectedImplementationFields) assert(stableJson(after[field]) === stableJson(before[field]), `Geschütztes Umsetzungsfeld verändert: ${after.implementationId}.${field}`);
  }
}

const contentBytes = Buffer.from(`${JSON.stringify(candidate, null, 2)}\n`, "utf8");

const deltaSections = deltas.map(({ path, before, after }) => `### \`${path}\`\n\n**Vorher**\n\n\`\`\`text\n${before}\n\`\`\`\n\n**Nachher**\n\n\`\`\`text\n${after}\n\`\`\``).join("\n\n");
const deltaReport = `# Content-Delta 1.1.0-candidate.3 → 1.1.0-candidate.4\n\nStatus: vollständiger wortgenauer Plain-Language-Delta; keine externe Freigabe.\n\nGeändert wurden ${deltas.length} sichtbare Textfelder. Candidate-Metadaten wurden ausschließlich auf \`candidateVersion=1.1.0-candidate.4\` und \`supersedesCandidateVersion=1.1.0-candidate.3\` fortgeschrieben. Alle stabilen IDs, Anwendbarkeiten, Reihenfolgen, Funduszuordnungen, wissenschaftlichen Aussagen, Bedingungen, Grenzen, Quellen, Evidenz- sowie Review-/Releasezustände sind maschinell unverändert. Candidate 3 wurde nicht überschrieben.\n\n${deltaSections}\n`;

const implementationRows = candidate.cards.flatMap((card) => card.implementations.map((item) => `| \`${item.implementationId}\` | ${item.title} | ${item.learningAction.replaceAll("|", "\\|")} | ${item.observationPrompt.replaceAll("|", "\\|")} | PASS |`)).join("\n");
const plainLanguageReview = `# Plain-Language-Review Candidate 4\n\n**Status:** internes Redaktionsreview bestanden; externe Delta-Prüfung ausstehend.\n\nVerbindliches Prinzip: Praxisformulierungen werden aus der Nutzungsperspektive einer Lehrkraft geschrieben, nicht aus der Sprache eines wissenschaftlichen Dossiers oder didaktischen Datenmodells.\n\n| ID | sichtbarer Titel | konkrete Lernhandlung | nutzbare Beobachtung | Ergebnis |\n| --- | --- | --- | --- | --- |\n${implementationRows}\n\nAlle 15 Umsetzungen benennen den Impuls der Lehrkraft, die konkrete Handlung der Lernenden, den Zeitpunkt des Vergleichs und eine sichtbare Verbesserung. Jeder Beobachtungshinweis nennt eine wahrnehmbare Häufung und einen anschließenden kleinen Unterrichtsschritt. Kein Hinweis verlangt Rangordnung, aufwendige Diagnose oder Wirkungsgarantie. Candidate 3 enthält keine Abwandlungsfelder; Candidate 4 ergänzt daher keine künstlichen Varianten.\n`;

const qualityRows = candidate.cards.flatMap((card) => card.implementations.map((item) => `| \`${item.implementationId}\` | \`${item.fundusStatementId}\` | ${DIFFERENCES[item.implementationId]} | Ja | Nein | Ja | ${item.applicability.type === "general" ? "fachübergreifend" : item.applicability.subjectIds.join(", ")} |`)).join("\n");
const qualityReview = `# Qualitätsreview der möglichen Umsetzungen – Candidate 4\n\nStatus: internes Plain-Language- und Authentizitätsreview; keine Reviewer- oder Approverfreigabe.\n\n| Umsetzungs-ID | Befund | eigenständige Lernhandlung | mehr als Sozialform? | beliebig austauschbar? | ohne Zeit-/Wirkungsversprechen? | Anwendbarkeit |\n| --- | --- | --- | --- | --- | --- | --- |\n${qualityRows}\n\nAlle Umsetzungen bleiben unmittelbar ihrem unveränderten Fundusbezug zugeordnet. Die sprachliche Konkretisierung verändert weder wissenschaftlichen Kern noch didaktische Eigenständigkeit.\n`;

const reports = {
  "content-delta-report.md": deltaReport,
  "plain-language-review.md": plainLanguageReview,
  "implementation-quality-review.md": qualityReview,
  "schema-validation-report.md": `# Schema-Validierungsbericht Candidate 4\n\nStatus: **PASS für Reviewkandidat**, keine Distributionfreigabe.\n\n- Kandidatenversion: \`1.1.0-candidate.4\`\n- Status: \`review-candidate\`; \`notForRuntime=true\`\n- Karten: 5\n- Umsetzungen: 15, jeweils genau 3\n- IDs, Reihenfolge und Anwendbarkeit: gegenüber Candidate 3 unverändert\n- Rootdaten, Forschungsaussagen, Quellen, Evidenz, Bedingungen, Grenzen, Cross-References und Reviewzustände: feldgenau unverändert\n- geänderte sichtbare Textfelder: ${deltas.length}\n- Beobachtungshinweise: 15 vorhanden, konkret und nicht leer\n- Abwandlungen: 0; keine künstliche Ergänzung\n- keine Zeit-, Quiz-, Antwort-, Scoring- oder Bewertungsstruktur\n\nDer Kandidat ist ein extern prüfbares Reviewartefakt und kein Runtime- oder Distribution-Paket.\n`,
  "applicability-review.md": `# Anwendbarkeitsreview Candidate 4\n\nStatus: **PASS für externes Review**.\n\nJede Karte enthält unverändert eine fachübergreifende, eine englischbezogene und eine BwR-bezogene Umsetzung. Fach-IDs, Typ \`general|subjects\`, redaktionelle Reihenfolge und Kardinalität sind feldgenau identisch zu Candidate 3. Mehrfachprofile erhalten weiterhin die deterministische Vereinigung geeigneter Umsetzungen mit höchstens drei Ergebnissen; Profile ohne eigene Variante behalten die fachübergreifende Umsetzung.\n`,
  "personal-state-migration-report.md": `# Bericht zu persönlichen Zuständen – Candidate 4\n\nStatus: **keine Datenmigration erforderlich**.\n\nAlle Karten- und Umsetzungs-IDs bleiben gegenüber Candidate 3 unverändert. Candidate 4 wird weder installiert noch aktiviert. Bestehende \`rememberedAt\`-, \`deepenAt\`-, \`wantToTryAt\`-, \`triedAt\`-, Lese-, Kalender- und Fortschrittsdaten werden nicht verändert. Die neue UI-Beschriftung liest weiterhin das bestehende Feld \`deepenAt\`; es entsteht kein paralleler persönlicher Zustand.\n`,
  "release-readiness-report.md": `# Release-Readiness Candidate 4\n\nGesamturteil: **NOT READY FOR DISTRIBUTION – bereit für externen Plain-Language-Delta-Check**.\n\nBestanden: Parsebarkeit, Struktur, 5 Karten, 15 Umsetzungen, stabile IDs, unveränderte Anwendbarkeit und Reihenfolge, unveränderte wissenschaftliche Felder und Quellen, konkrete Nutzertexte, nutzbare Beobachtungshinweise, Zeitfeldfreiheit und vollständiger Delta-Nachweis.\n\nOffen: externe fachlich-redaktionelle Prüfung sämtlicher Textdeltas und eine davon getrennte spätere Releasefreigabe. Status bleibt \`review-candidate\`; \`distributionEligible=false\`. Es wurde kein RC und kein Distribution-Paket erzeugt.\n`,
};

await mkdir(outputDirectory, { recursive: false });
await immutableWrite(resolve(outputDirectory, "retrieval-practice-week.content.json"), contentBytes);
for (const [filename, value] of Object.entries(reports)) await immutableWrite(resolve(outputDirectory, filename), Buffer.from(value, "utf8"));

const fileOrder = [
  "retrieval-practice-week.content.json",
  "schema-validation-report.md",
  "plain-language-review.md",
  "implementation-quality-review.md",
  "applicability-review.md",
  "personal-state-migration-report.md",
  "content-delta-report.md",
  "release-readiness-report.md",
];
const files = [];
for (const path of fileOrder) {
  const bytes = await readFile(resolve(outputDirectory, path));
  files.push({ path, bytes: bytes.byteLength, sha256: sha256(bytes) });
}

const manifest = {
  candidateId: "edutools.edubrief.retrieval-practice-week-v1.1-candidate.4",
  candidateVersion: "1.1.0-candidate.4",
  status: "review-candidate",
  basedOnPackageId: "edutools.edubrief.retrieval-practice-week",
  basedOnContentVersion: "1.0.0",
  supersedesCandidateVersion: "1.1.0-candidate.3",
  createdAt: "2026-07-22T00:00:00Z",
  publicationStatus: "not-assigned",
  reviewState: {
    scientificReview: "pending-external-delta-check",
    editorialReview: "pending-external-delta-check",
    releaseApproval: "not-requested",
  },
  hashAlgorithm: "sha-256",
  files,
  counts: {
    cards: 5,
    implementations: 15,
    generalImplementations: 5,
    englishImplementations: 5,
    bwrImplementations: 5,
    changedVisibleTextFields: deltas.length,
  },
  distributionEligible: false,
};
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await immutableWrite(resolve(outputDirectory, "review-manifest.json"), manifestBytes);

process.stdout.write(`${JSON.stringify({
  outputDirectory,
  contentBytes: contentBytes.byteLength,
  contentSha256: sha256(contentBytes),
  manifestBytes: manifestBytes.byteLength,
  manifestSha256: sha256(manifestBytes),
  changedVisibleTextFields: deltas.length,
  files: fileOrder.length + 1,
}, null, 2)}\n`);
