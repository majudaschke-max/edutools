# EduTools – Vocabulary Trainer

> Lernen statt Suchen.

Der Vocabulary Trainer lädt Kurs- und Vokabeldaten getrennt von der
Programmlogik, berechnet daraus ein tägliches Lernpaket und speichert den
wortbezogenen Lernstand ausschließlich lokal im Browser. Die vorhandene
Single-Page-Navigation verbindet Dashboard, Tageslernen, Wiederholungen,
gemerkte Wörter, Multiple-Choice-Quiz, Schreibtraining und Speed Challenge.
Eine manuell ausgelöste, browserbasierte Aussprache ergänzt Flashcards, Quiz,
Schreibtraining und gemerkte Wörter, ohne Lösungen vorzeitig hörbar zu machen.
Eine davon fachlich getrennte, optional abschaltbare Motivationsebene ergänzt
XP, Level, Lernserien, Meilensteine und die Route `#/progress`.
Eine lokale Kursbibliothek mit Kurseditor, tabellarischem Wortlisten-Import und
versioniertem JSON-Import/-Export ermöglicht eigene Kurse, ohne Quellcode oder
die getrennten Lern- und Motivationsdaten zu verändern.
Sprint 3.1 macht den Vocabulary Trainer zur ersten Referenz-App des gemeinsamen
EduTools-Brand-Systems: Himmelblau, Mint und zurückhaltendes Türkis grenzen ihn
klar von der pastell-violetten Gruppenpuzzle-App ab; Apricot bleibt ein kleiner
warmer Akzent. Das gemeinsame MJ-Signet erscheint einmal in jeder App-Shell.
Sprint 3.7 vereinfacht das Produkt: EduTools-JSON und vorbereitete Tabellen
sind die primären Importwege; eine UTF-8-CSV-Vorlage und ein neutraler
Import-Prompt unterstützen die Vorbereitung. Book Capture ist deaktiviert,
weil komplexe Schulbuchseiten lokal nicht zuverlässig genug strukturiert
wurden. OCR-/HEIC-Code bleibt nur als nicht ausgelieferte Quelle erhalten.
Eine kalenderbasierte lokale Lernserie ergänzt das Lernen.
Sprint 3.8 macht die vorbereitete Vokabelliste zum primären Autorenweg:
Kursname und Sprachen werden direkt beim CSV-, TSV- oder TXT-Import erfasst,
neue Units gelten als reguläres Ergebnis und der vollständige Kurs wird mit
einer Bestätigung lokal gespeichert. JSON bleibt als nachrangige
Wiederherstellung einer EduTools-Kursdatei erhalten.
Sprint 3.9 verändert diese Funktionen nicht. Version `3.9.0` härtet
ausschließlich Buildgrenzen, CSP, Cache-Versionierung, Migrationen,
Regressionstests und Release-Dokumentation. Book Capture, OCR, HEIC/HEIF,
Sprechübung, Spracherkennung und Mikrofonzugriff bleiben aus allen
Produktartefakten ausgeschlossen; die reine Audioausgabe sichtbarer
Source-Wörter bleibt erhalten.
Sprint 4.0 ergänzt keine neue Lernlogik: Flashcards können nun fünf, zehn,
fünfzehn oder alle tatsächlich verfügbaren Wörter verwenden. Eigene Kurse
lassen sich außerdem direkt im Browser als lokales SCORM-1.2-Lernpaket für
ByCS beziehungsweise Moodle herunterladen. Version `4.0.0` trennt die
bearbeitbare JSON-Sicherung klar vom vollständigen Learner-ZIP. Daniel bleibt
für britisches Englisch die Standardstimme; optional erscheint genau eine
installierte, kuratierte weibliche Alternative.
Patch `4.0.1` verändert keine Lern- oder Exportfunktion. Er prüft das
browsererzeugte ZIP vor dem Download strenger, startet im Test exakt den
Manifest-`href` und ergänzt eine verschachtelte Moodle-artige Launch-Umgebung
mit äußeren LMS-Parametern. Ein lokaler Harness bleibt ausdrücklich kein
Nachweis für einen erfolgreichen Start in einer realen ByCS-Installation.
Patch `4.0.2` ersetzt ausschließlich den kopierbaren Importprompt und dessen
Hilfetext. Der anbieterneutrale Prompt beschreibt das aktuelle, direkt
importierbare EduTools-JSON-Schema, berücksichtigt auch rechte Spalten und
farbige Kästen und fordert kontrollierte didaktische Ergänzungen samt
separatem Prüfbericht. EduTools selbst überträgt weiterhin keine Daten an
einen KI-Dienst.
Patch `4.0.3` macht daraus einen geführten, rein manuellen Workflow: Prompt
kopieren, ChatGPT in einem neuen Tab öffnen, Vorlagen dort selbst hochladen,
eine oder mehrere herunterladbare JSON-Dateien erzeugen lassen und diese lokal
in EduTools auswählen. EduTools liest keine Bilder und sendet keine Daten.
Zusammengehörige Dateiteile werden vollständig geprüft, deterministisch zu
einem Kurs zusammengeführt und erst nach Vorschau und Bestätigung gespeichert.
Release `4.0.5` entfernt die irreführende lokale Bildauswahl aus dieser
Vorbereitung. Lehrkräfte legen nur Kursname und Sprachen fest, kopieren den
versionierten Prompt, laden ihre Vorlagen selbst im gewählten KI-Chat hoch und
wechseln anschließend direkt zum getrennten JSON-Neuimport. EduTools erhält
weiterhin keine Bilder. Der browserbasierte SCORM-Export überspringt reine
Pages-Steuerdateien der eingebetteten Learner-Vorlage und löst deren Pfad auch
unter dem GitHub-Pages-Unterpfad zuverlässig auf.
Sprint 4.1.1 führt intern den flüchtigen `ImportDraft`, Source-Adapter und den
gemeinsamen Import-Orchestrator ein, ohne Austauschformate oder Oberfläche zu
verändern. Sprint 4.1.2 lagert den bestehenden Prompt als versionierte lokale
Klartextressource aus. Registry, SHA-256-Prüfung, strikte Template-Engine und
PromptGenerator bereiten weitere Versionen und Promptfamilien vor; eine neue
KI-Importfunktion oder sichtbare UI entsteht dabei nicht.
Veröffentlichungsprofile erzeugen wahlweise die vollständige Autorenanwendung
oder eine statische Lernanwendung mit genau einem freigegebenen Kurs.

## Struktur

```text
apps/vocabulary-trainer/
├── build/                 profilbasierter statischer Builder
├── docs/
│   ├── DESIGN_SYSTEM.md
│   ├── AUDIO.md
│   ├── MOTIVATION.md
│   ├── DEPLOYMENT.md
│   └── PRD.md
├── profiles/              validierte Author-/Learner-Beispiele
├── scripts/build.mjs
├── tests/
│   ├── core.test.mjs
│   ├── brand-system.test.mjs
│   ├── design-system.test.mjs
│   ├── motivation.test.mjs
│   ├── ocr.test.mjs
│   ├── quiz.test.mjs
│   ├── router.test.mjs
│   ├── pronunciation.test.mjs
│   ├── session.test.mjs
│   ├── speed.test.mjs
│   ├── views.test.mjs
│   ├── writing.test.mjs
│   └── static-build.test.mjs
└── src/
    ├── app.js
    ├── index.html
    ├── dashboard.css
    ├── runtime/            Profil, Capabilities und Published Course
    ├── styles/
    │   ├── app-shell.css
    │   ├── dashboard.css
    │   ├── content.css
    │   ├── learning-modes.css
    │   ├── authoring.css
    │   └── responsive.css
    ├── config/course-config.json
    ├── data/vocabulary.json
    ├── core/
    │   ├── course.js
    │   ├── learning-rules.js
    │   ├── learning-state.js
    │   ├── router.js
    │   ├── scheduler.js
    │   ├── storage.js
    │   ├── utils.js
    │   └── vocabulary.js
    ├── audio/
    │   ├── pronunciation-config.js
    │   ├── pronunciation-controller.js
    │   ├── pronunciation-policy.js
    │   ├── pronunciation-preferences.js
    │   ├── pronunciation-service.js
    │   └── pronunciation-state.js
    ├── components/
    │   ├── level-up-notice.js
    │   └── pronunciation-button.js
    ├── motivation/
    │   ├── level-system.js
    │   ├── milestone-system.js
    │   ├── motivation-config.js
    │   ├── motivation-controller.js
    │   ├── motivation-events.js
    │   ├── motivation-service.js
    │   ├── motivation-state.js
    │   ├── motivation-storage.js
    │   └── streak-system.js
    ├── course-library/
    │   ├── built-in-course.js
    │   ├── course-schema.js
    │   ├── course-validator.js
    │   ├── course-library-state.js
    │   ├── course-library-storage.js
    │   ├── course-library-service.js
    │   ├── course-editor-controller.js
    │   └── course-runtime.js
    ├── import/
    │   ├── adapters/       tabellarischer Inhalt und JSON-Restore
    │   ├── core/           ImportDraft, Issues, Validator, Orchestrator
    │   ├── import-pipeline.js
    │   ├── tabular-parser.js
    │   ├── import-mapper.js
    │   ├── vocabulary-importer.js
    │   ├── json-course-importer.js
    │   └── course-exporter.js
    ├── prompts/            Author-only Prompt-Engine und Versionen
    │   ├── prompt-generator.js
    │   ├── prompt-loader.js
    │   ├── prompt-registry.js
    │   ├── template-engine.js
    │   └── vocabulary/import-v1.txt
    ├── ocr/                 deaktivierter historischer Quellpfad, nicht im Build
    │   ├── image-preprocessor.js
    │   ├── ocr-adapter.js
    │   ├── ocr-import-runtime.js
    │   ├── ocr-import-view.js
    │   ├── ocr-preview-state.js
    │   └── vendor/
    ├── session/
    │   ├── session-controller.js
    │   ├── session-runtime.js
    │   └── session-state.js
    ├── quiz/
    │   ├── quiz-controller.js
    │   ├── quiz-generator.js
    │   ├── quiz-runtime.js
    │   └── quiz-state.js
    ├── writing/
    │   ├── writing-controller.js
    │   ├── writing-evaluator.js
    │   ├── writing-runtime.js
    │   └── writing-state.js
    ├── speed/
    │   ├── speed-controller.js
    │   ├── speed-generator.js
    │   ├── speed-runtime.js
    │   ├── speed-state.js
    │   └── speed-timer.js
    └── views/
        ├── course-library-view.js
        ├── course-builder-view.js
        ├── dashboard-view.js
        ├── learn-view.js
        ├── marked-view.js
        ├── progress-view.js
        ├── quiz-view.js
        ├── review-view.js
        ├── session-view.js
        ├── speed-view.js
        ├── units-view.js
        ├── view-elements.js
        └── writing-view.js
```

`config/` entscheidet, welcher Kurs und welche Units freigegeben sind. `data/`
enthält austauschbare Lerninhalte. `core/` kennt weder das konkrete Lehrwerk
noch die Oberfläche. `audio/` kapselt Konfiguration, Web Speech API, flüchtigen
Status und fachliche Sprachauflösung; `components/` enthält den nativen
Aussprache-Button. `session/`, `quiz/`, `writing/` und `speed/` trennen ihre
flüchtigen Abläufe von der dauerhaften Lernhistorie. `motivation/` beobachtet
normierte Lernergebnisse, besitzt aber keinerlei Zugriff auf Scheduler oder
fachliche Bewertungsregeln. `views/` erzeugt die semantischen Ansichten;
`app.js` verbindet Daten, Routing und App-Shell.
`course-library/` kapselt das kanonische Kursmodell, Validierung, lokale
Persistenz und Editor-Lifecycle. `import/` analysiert und validiert Dateien,
ohne Kurs- oder Lernzustände direkt zu vermischen. `runtime/` lädt das
Veröffentlichungsprofil und stellt die zentralen Capabilities bereit. `build/`
erzeugt daraus reproduzierbare statische Ausgaben.

Der Vocabulary Trainer besitzt keine Abhängigkeit von einem bestimmten
Lehrwerk, Verlag oder Sprachenpaar. Aussprache, Scaffolding und Lernrichtung
werden aus der jeweiligen Kurskonfiguration abgeleitet.

`dashboard.css` ist nur noch der Einstiegspunkt für die nach Shell, Dashboard,
Inhalt, Lernmodi, Autorenwerkzeug und Responsive getrennten Styles. Gemeinsame
Tokens, Basis und Komponenten liegen weiterhin unter `design-system/css/`.

## Navigation und App-Shell

Der kleine Hash-Router liegt unabhängig von Oberfläche und Lernlogik in
[`src/core/router.js`](src/core/router.js). Folgende Bereiche sind direkt
adressierbar:

- `#/dashboard` – bestehende Tagesübersicht
- `#/learn` – vorbereitete Auswahl für die kommende Lernsitzung
- `#/review` – fällige Wiederholungen
- `#/marked` – gemerkte Wörter
- `#/quiz` – Quiz konfigurieren, durchführen und auswerten
- `#/write` – Schreibtraining konfigurieren, durchführen und auswerten
- `#/speed` – Speed Challenge konfigurieren, durchführen und auswerten
- `#/progress` – fachlichen Fortschritt und freiwillige Motivation ansehen
- `#/units` – aktuelle und verfügbare Units als native Karten-Buttons; leere
  und gesperrte Units bleiben verständlich nicht interaktiv
- `#/settings` – lokale Daten- und Kurseinstellungen
- `#/courses` – eigene und importierte lokale Kurse verwalten
- `#/course-builder?course=<id>&unit=<id>` – eigenen Kurs direkt bearbeiten

Ohne Hash wird die Adresse durch `#/dashboard` ersetzt. Unbekannte Routen
zeigen einen verständlichen Nicht-gefunden-Zustand. Native Hash-Historie sorgt
dafür, dass Browser-Zurück und Browser-Vorwärts funktionieren. Nach einem
Routenwechsel erhält der zentrale Inhaltsbereich den Fokus; beim ersten Laden
wird der Fokus nicht unnötig verschoben.

Die sichtbare Hauptnavigation gruppiert Dashboard, Lernen, Fortschritt und
Kurse. Flashcards, Wiederholen, Markierungen, Quiz, Schreibtraining und Speed
markieren gemeinsam den Bereich „Lernen“; Units, Kursbibliothek und Course
Builder markieren „Kurse“. `aria-current`, ein Skip-Link, der aktive
Kurskontext und eine beschriftete Einstellungsaktion gehören zur gemeinsamen
App-Shell.

## EduTools Brand-System und Vocabulary-Theme

Sprint 2.1 konsolidierte die Oberfläche erstmals in der Richtung „Nordic
Education“. Sprint 3.1 entwickelt diese Grundlage zu einem getrennten Brand
Core und zentralen App-Theme weiter. Der Vocabulary Trainer verwendet nun eine
eigenständige Himmelblau–Mint-Palette, zurückhaltendes Türkis für zentrale
Aktionen und sparsame Apricot-Akzente. Violett ist bewusst nicht dominant.

Das Dashboard priorisiert Lernempfehlung und Lernmodi vor fachlichem
Fortschritt, Motivation und Kursverwaltung. Flashcards, Quiz, Schreiben, Speed,
Aussprache, Fortschritt, Kursbibliothek, Editor, Import, Feedback, Empty States
und Dialoge verwenden konsistente Karten-, Button-, Formular-, Fokus- und
Statusmuster. Lernoberflächen bleiben bewusst luftiger als das lokale
Autorenwerkzeug.

Brand Core, Themefarben und Layoutrollen liegen in zentralen CSS Custom
Properties. `data-edutools-theme="vocabulary"` aktiviert dasselbe Theme ohne
JavaScript in Author, Learner, Browser und SCORM. Die gemeinsame MJ-Raute wird
einmal im Footer der App-Shell ausgegeben.
Text- und UI-Kontraste wurden gegen WCAG AA geprüft. Touchziele sind mindestens
ungefähr 44 Pixel groß; die App ist mobile-first, unterstützt 320 Pixel Breite,
200 Prozent Zoom und `prefers-reduced-motion`. Es wurden keine Webfonts,
Frameworks, externen Icons oder Laufzeitabhängigkeiten ergänzt.

Die vollständige praktische Dokumentation steht in
[`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md), die produktübergreifenden
Grundlagen in
[`../../docs/design/EDUTOOLS_BRAND_SYSTEM.md`](../../docs/design/EDUTOOLS_BRAND_SYSTEM.md).

## Flashcard-Lerneinheit

`#/learn` verwendet das Tagespaket des Schedulers. Vor dem Start werden fällige,
schwierige und neue Wörter, Gesamtzahl und geschätzte Lernzeit angezeigt.
`#/review` verwendet dieselbe Session ausschließlich für aktuell fällige
Wörter. `#/marked` listet die persönliche Auswahl mit Übersetzungen und Unit.
Falsche Wörter aus Quiz und Schreiben sowie auffällige Wörter aus Speed werden
als dedupliziertes, noch nicht gestartetes Flashcard-Paket an `#/learn`
übergeben. Für leere Auswahlen gibt es jeweils einen verständlichen Rückweg zum
Dashboard.

Vor jeder nicht leeren Flashcard-Session wird in einem semantischen `fieldset`
mit nativen Radios eine Richtung gewählt:

- Ausgangssprache → Zielsprache, standardmäßig vorausgewählt
- Zielsprache → Ausgangssprache
- Gemischt

Die Auswahl gilt nur für diese Session. Der flüchtige Zustand verwendet
`mode: "flashcards"`, eine getrennte Quellenrolle und `direction`. Gemischte
Karten erhalten pro Wort-ID genau einmal eine injizierbar zufällige Richtung;
Neurendern, Aufdecken und Markieren ändern sie nicht. Bei mindestens zwei
Wörtern kommen beide Kartenrichtungen vor.

Source → Target zeigt Source-Begriff, Lautschrift, Source-Audio und Scaffolding
in der Source-Sprache vorn. Die Rückseite enthält alle Target-Varianten und das
Source-Beispiel, aber kein Target-Audio. Target → Source zeigt alle Targets vorn;
Source-Wort und Audio bleiben bis zum Aufdecken vollständig verborgen. Die
Rückseite enthält Source, Lautschrift, Source-Audio und Beispiel. Der Hint bleibt
in beiden Richtungen sichtbar und mit dem konfigurierten Source-Sprachcode
ausgezeichnet.

Nach dem Aufdecken stehen drei unabhängige Aktionen bereit:

- „Kann ich“ ruft `markWordCorrect` auf, speichert und wechselt zur nächsten
  Karte.
- „Noch nicht“ ruft `markWordWrong` auf und speichert genau eine fachliche
  Bewertung für das Wort in der ursprünglichen Session.
- „Markieren“ beziehungsweise „Markierung entfernen“ ruft `toggleMarkedWord`
  auf und speichert sofort, bewertet die Karte aber nicht und wechselt sie
  nicht. Die Aktion ist ein umrandeter Secondary-Button mit `aria-pressed`.

Der Session-Zustand mit Modus, Quelle, Richtung, stabilen Kartenrichtungen,
ursprünglichen Wort-IDs, Position, Ergebnissen und Sichtbarkeit der Lösung
bleibt flüchtig.
Beim Verlassen der Lernroute oder Neuladen wird er verworfen. Der davon
getrennte Lernstand wird nach jeder Bewertung beziehungsweise Markierung lokal
gespeichert. Schlägt das Speichern fehl, bleiben sowohl Lernstand als auch
Kartenposition unverändert und die Oberfläche zeigt eine verständliche
Fehlermeldung.

Nach der letzten Karte zeigt die App eine Zusammenfassung für „Kann ich“, „Noch
nicht“ und aktuell gemerkte Wörter. Unsichere Wörter können anschließend als
neues, dedupliziertes Paket mit einer erneut wählbaren Richtung geübt werden.
Beim Rückweg zum Dashboard werden alle Kennzahlen frisch aus der gespeicherten
Historie berechnet.

### Tastatursteuerung

- vor der Lösung: `Enter` oder `Leertaste` – Lösung anzeigen
- nach der Lösung: `Pfeil links` – Noch nicht
- nach der Lösung: `Pfeil rechts` – Kann ich
- nach der Lösung: `M` – Markierung umschalten

Die Kürzel sind in Eingabefeldern, Selects, Textareas, editierbaren Bereichen
und offenen Dialogen deaktiviert. Wiederholte Tastendrücke und Aktionen während
eines Kartenwechsels werden blockiert. Fokuswechsel, sichtbare Fokusstile,
`aria-live`, `aria-pressed` und ein natives `<progress>` unterstützen die
Tastatur- und Screenreader-Nutzung.

## Quizmodus

`#/quiz` bietet eine vollständig lokale Multiple-Choice-Lerneinheit. Als
Lernquelle stehen – sofern nicht leer – die aktuelle Unit, alle freigegebenen
Units, schwierige, gemerkte und fällige Wörter zur Auswahl. Die Fragerichtung
kann Ausgangs- zu Zielsprache, Ziel- zu Ausgangssprache oder gemischt sein; der
Umfang ist auf 5, 10, 20 oder alle verfügbaren Wörter begrenzbar. Sind weniger
Wörter verfügbar, wird dies vor dem Start transparent angezeigt.

Jede Frage erhält bis zu drei eindeutige falsche Antworten. Der Generator
bevorzugt dafür Begriffe aus derselben Unit und ergänzt bei Bedarf aus anderen
freigegebenen Units. Alternative Zielübersetzungen eines Wortes werden
gemeinsam als richtige Option behandelt und nicht als Ablenkung wiederholt.
Nach „Antwort prüfen“ erscheint ein textlicher Richtig- oder Falschzustand mit
der korrekten Lösung; die nächste Frage wird erst bewusst geöffnet.

Richtige und falsche Quizantworten verwenden dieselben Core-Regeln wie die
Flashcards und werden sofort im lokalen Lernstand gespeichert. Die laufende
Quizsession selbst bleibt flüchtig. Beim Verlassen eines unvollständigen Quiz
fragt die App nach; Browser-Zurück und Browser-Vorwärts bleiben dabei sinnvoll
nutzbar. Die Auswertung zeigt Trefferzahl, Fehlerzahl und Erfolgsquote. Falsch
beantwortete Wörter können anschließend dedupliziert in der vorhandenen
Flashcard-Lerneinheit geübt werden; es gibt im Quiz keine automatische
Wiederholung oder Wiederholungsschlange.

### Quiz-Tastatursteuerung

- `Pfeil hoch` und `Pfeil links` – vorherige Antwort auswählen
- `Pfeil runter` und `Pfeil rechts` – nächste Antwort auswählen
- `1` bis `4` – sichtbare Antwort direkt auswählen
- `Enter` – Antwort prüfen beziehungsweise nächste Frage öffnen
- `Escape` – Verlassen-Dialog öffnen

Die Kürzel greifen nicht während Texteingaben und nicht in geöffneten Dialogen.
Radio-Gruppen, natives `<progress>`, Fokusführung, sichtbare Fokusstile,
beschriftete Statusmeldungen und `aria-live` unterstützen Tastatur und
Screenreader.

## Schreibtraining

`#/write` bietet ein vollständig lokales Training mit selbst eingegebenen
Antworten. Verfügbar sind dieselben nicht leeren Lernquellen wie im Quiz:
aktuelle Unit, alle freigegebenen Units sowie schwierige, gemerkte und fällige
Wörter. Schreibrichtung und Umfang können vor dem Start gewählt werden; bei
einer kleineren Datenmenge verwendet die App transparent alle verfügbaren
Wörter.

In Ausgangs- zu Zielsprache gilt jede ausdrücklich in `targets` hinterlegte
Variante als richtige Einzellösung. In der Gegenrichtung wird ausschließlich
`source` akzeptiert. Die Normalisierung vereinheitlicht Unicode und
Apostrophvarianten, ignoriert Groß-/Kleinschreibung, äußere und mehrfache
Leerzeichen sowie abschließende Satzzeichen. Buchstabenfehler, abweichende
Wortreihenfolge, grammatische Formen oder nicht hinterlegte Verkürzungen bleiben
bewusst falsch; es gibt keine unscharfe Rechtschreibkorrektur.

Vorhandene Hinweise erscheinen erst nach „Hinweis anzeigen“ und ihre Nutzung
wird nur in der flüchtigen Session erfasst. Nach einer bewussten Prüfung bleibt
die Eingabe sichtbar, alle akzeptierten Lösungen werden angezeigt und der
Wechsel erfolgt erst über „Weiter“. Richtige und falsche Antworten verwenden
dieselben Core-Funktionen wie Flashcards und Quiz und werden sofort lokal
gespeichert. Die Auswertung zeigt Treffer, Fehler, Erfolgsquote, verwendete
Hinweise und die eigenen falschen Eingaben. Unsichere Wörter lassen sich danach
dedupliziert in der bestehenden Flashcard-Einheit üben.

### Schreibtraining-Tastatursteuerung

- `Enter` im Eingabefeld – Antwort prüfen
- `Enter` nach der Rückmeldung – nächste Aufgabe öffnen
- `Escape` – Verlassen-Dialog öffnen
- `H` außerhalb des Eingabefelds – vorhandenen Hinweis anzeigen

Das Eingabefeld erhält bei jeder neuen Aufgabe den Fokus. Buchstaben-Shortcuts
bleiben während der Eingabe und alle Shortcuts bei geöffnetem Dialog aus.
Natives Formular, sichtbares Label, verknüpfte Fehlermeldung, Fokusführung,
Statusmeldungen und ein natives `<progress>` unterstützen Tastatur und
Screenreader.

## Speed Challenge

`#/speed` ordnet vorhandene Quellbegriffe und Übersetzungen als lokale,
zeitbegrenzte Wortpaare zu. Verfügbar sind aktuelle Unit, alle freigegebenen
Units sowie schwierige, gemerkte und fällige Wörter, sobald eine Quelle
mindestens vier eindeutige Paare ermöglicht. Die Richtung kann festgelegt oder
pro Runde gemischt werden; wählbar sind 30, 60 oder 90 Sekunden und – abhängig
vom Wortbestand – vier, sechs oder acht Paare.

Der Generator fasst alternative Übersetzungen zu einer sichtbaren Option wie
„Burg / Schloss“ zusammen. Wörter mit überschneidenden Übersetzungen oder
doppelten sichtbaren Texten erscheinen nicht gemeinsam in einer Runde. Beide
Spalten werden mit injizierbarem Fisher-Yates getrennt gemischt und ohne
offensichtliche Positionspaare angeordnet. Nach einer gelösten Runde werden
zunächst noch nicht verwendete Wörter bevorzugt; bei erschöpftem Bestand sind
Wiederholungen möglich.

Der Timer speichert einen absoluten Zielzeitpunkt und berechnet die Restzeit
bei jedem Tick aus der aktuellen Uhr. Dadurch bleibt er auch nach einem
verzögerten Browser-Tab korrekt. Pause und Fortsetzen verschieben den
Zielzeitpunkt um die verbleibende Zeit. Eine Screenreader-Warnung erfolgt
einmalig bei zehn Sekunden, nicht bei jeder sichtbaren Aktualisierung.

Ein Wort wird beim ersten korrekten Zuordnen innerhalb der Challenge genau
einmal mit `markWordCorrect` bewertet und sofort lokal gespeichert. Spätere
Treffer desselben Wortes verändern den Lernstand nicht erneut. Fehlversuche
werden ausschließlich flüchtig erfasst und rufen bewusst nie `markWordWrong`
auf, weil der Modus neben Wissen auch Bediengeschwindigkeit misst. Wörter, die
an mindestens zwei Fehlversuchen beteiligt waren, gelten nur in der
Abschlussauswertung als auffällig.

### Speed-Challenge-Tastatursteuerung

- `Tab` sowie `Pfeil hoch/runter` – innerhalb einer Spalte navigieren
- `Pfeil links/rechts` – zwischen den Spalten wechseln
- `Enter` oder `Leertaste` – nativen Paar-Button auswählen
- `Escape` – Auswahl aufheben oder Abbruchdialog öffnen
- `P` – pausieren beziehungsweise fortsetzen

Die Auswertung zeigt Dauer, abgeschlossene Runden, korrekte Paare,
Fehlversuche, Trefferquote und unterschiedliche erfolgreiche Wörter.
Auffällige Wörter können dedupliziert in der bestehenden Flashcard-Session
weitergeübt werden. Laufende Challenge, Timerstand und Ergebnisse bleiben
flüchtig; ausschließlich korrekte Core-Bewertungen werden gespeichert.

## Aussprache und gemeinsamer Audio-Service

Sprint 1.8 ergänzt eine ausschließlich manuell gestartete Aussprache für kurze
Begriffe und Wendungen. Der zentrale Service in
[`src/audio/pronunciation-service.js`](src/audio/pronunciation-service.js)
kapselt `speechSynthesis` und `SpeechSynthesisUtterance`; Views enthalten keine
eigene Speech-API-Logik. Seine öffentliche Instanz unterstützt
`isSupported()`, `speak(request)`, `stop()`, `isSpeaking()`,
`getAvailableVoices()`, `refreshVoices()` und `destroy()`. Browserobjekte und
Logger sind injizierbar, sodass Node-Tests keine installierte Stimme benötigen.

Die Kurskonfiguration ordnet `languages.source` und `languages.target` jeweils
eine `speechLocale` zu. `pronunciation` aktiviert den Provider
`speech-synthesis` und definiert Rate, Pitch und Lautstärke. Ungültige Werte
werden intern protokolliert und durch sichere Standards ersetzt; fehlt eine
gültige Locale, wird für diese Sprachrolle kein Button angeboten. Stimmen
werden zuerst exakt nach Locale und danach nach Sprachpräfix eingegrenzt.
Innerhalb dieser Treffer folgen lokale Stimmen, eine gekapselte allgemeine
Qualitätsheuristik und ein stabiler Fallback. Eine anfangs leere Stimmenliste
ist zulässig und wird über genau einen `voiceschanged`-Listener aktualisiert.

Unter `#/settings` kann das Tempo als Langsam (`0.8`), Normal (`0.9`) oder
Schnell (`1.05`) gewählt werden. Pitch bleibt neutral bei `1.0`, Lautstärke bei
`1`. Zusätzlich werden nur tatsächlich verfügbare Stimmen der Source-Sprache
angeboten. Tempo und Stimme liegen deploymentweit im lokalen Browserprofil,
nicht im Kurs-JSON oder Learning State. Ist eine gespeicherte Stimme später
nicht mehr vorhanden, zeigt und verwendet die App automatisch den sicheren
Fallback. Details und die verpflichtende manuelle Hörcheckliste stehen in
[`docs/AUDIO.md`](docs/AUDIO.md).

Es läuft höchstens eine Wiedergabe. Ein zweiter Klick auf denselben nativen
Aussprache-Button stoppt sie; ein anderer Button ersetzt sie. Start, Ende,
Stopp und Fehler werden zurückhaltend über eine zentrale `aria-live`-Region
gemeldet. Die Buttons besitzen wechselnde Abspielen-/Stoppen-Labels,
`aria-pressed`, sichtbaren Fokus und eine Touchfläche von ungefähr 44 × 44
Pixel. Audio-Buttons blockieren die globalen Lernkürzel, senden keine Formulare
ab und verlieren nach dem Wiedergabeende nicht den Fokus. Routenwechsel,
Neurendern des sichtbaren Lernkontexts und App-Zerstörung beenden laufende
Ausgabe.

Die zentrale Vocabulary-Trainer-Policy bietet Aussprache ausschließlich für
Inhalte der konfigurierten Source-Sprache an. Target-Inhalte erhalten unabhängig
vom konkreten Sprachenpaar keinen Audio-Button. Bei fehlender oder
widersprüchlicher Sprachkonfiguration gilt derselbe sichere Fallback. Ein Kurs
mit Deutsch als Source und Englisch als Target kann deshalb deutsche
Source-Inhalte aussprechen; englische Target-Inhalte bleiben ohne Audio. Vor
einer Auswertung ist zudem nur bereits sichtbarer Source-Inhalt hörbar. In der
Gegenrichtung erscheint die Source-Lösung erst nach der Auswertung. Optionen und
falsche Eingaben erhalten keine Audio-Aktion. Vorhandene Lautschrift bleibt
unverändert sichtbar. Die rollenbasierte Policy liegt im Controllerpfad; der
allgemeine Speech-Service bleibt vollständig sprachneutral wiederverwendbar.

Die Speed Challenge wurde bewusst nicht um Audio erweitert. Getrennte
Aussprache- und Zuordnungsbuttons würden das bestehende zweispaltige
320-Pixel-Layout und seine Pfeiltastensteuerung überladen. Eine größere
Umstrukturierung nur für Audio ist nicht Teil dieses Sprints; die übrigen
geforderten Lern- und Listenansichten sind vollständig integriert.

Die Sprachausgabe sendet selbst keine Wortdaten an einen EduTools-Server oder
eine externe TTS-API. EduTools übergibt den kurzen Text an die
Sprachausgabefunktion des verwendeten Browsers beziehungsweise Betriebssystems.
Welche Stimme technisch
bereitgestellt wird, hängt vom jeweiligen Gerät und Browser ab. Daher wird
nicht behauptet, jede Browserstimme sei immer vollständig offline verfügbar.
Fehlt die Web Speech API, bleiben alle Lernfunktionen nutzbar und die
Aussprache-Buttons werden nicht angezeigt. Browserstimmen sind eine praktische
Lernhilfe, aber keine Garantie für eine einzig richtige Aussprache.

Jeder Ausgabe-Request trägt `provider: "speech-synthesis"`. Echte
Audiodateien, Downloads und Cloud-TTS sind nicht implementiert.

## Lernfortschritt und sanfte Motivation

Sprint 1.9 ergänzt unter `#/progress` zwei bewusst getrennte Bereiche. Der
fachliche Bereich berechnet verfügbare, geübte, sicher gelernte, schwierige,
fällige und gemerkte Wörter sowie den Fortschritt je freigegebener Unit direkt
aus Vocabulary Core und Learning State. Der optionale Motivationsbereich zeigt
Level, Gesamt-XP, Fortschritt zum nächsten Level, aktuelle und längste
Lernserie, abgeschlossene Sessions, unterschiedliche geübte Wörter und
freigeschaltete Meilensteine. Das Dashboard erhält nur eine kompakte Anzeige
für Level, XP innerhalb des Levels, Level-Fortschritt und Lernserie sowie den
Link „Mein Fortschritt“; die nächste Lernhandlung
bleibt visuell dominant.

„Sicher gelernt“ bedeutet verbindlich: mindestens drei richtige bewertete
Abrufe, darunter mindestens ein aktiver schriftlicher Abruf, richtige
Bearbeitungen an mindestens zwei lokalen Kalendertagen und zwei zuletzt
aufeinanderfolgende richtige Ergebnisse. Ein späterer Fehler führt zurück zu
„Wird gelernt“, erhält aber Zähler, Markierung und bisherige Lernhistorie.

Motivationselemente dienen ausschließlich der freiwilligen Lernunterstützung. Sie verändern weder den fachlichen Lernstand noch die Wiederholungsplanung.

Die XP-Regeln liegen zentral in der optionalen Kurskonfiguration: Flashcards
vergeben einmal pro lokalem Tag, Modus und Wort 1 XP; richtige Quizantworten
2 XP, richtige Schreibantworten 3 XP und erstmals korrekt gespeicherte
Speed-Zuordnungen 2 XP. Die erste qualifizierende, vollständig abgeschlossene
Session pro lokalem Kalendertag und Kurs erhält
einmalig 5 XP. Falsche objektive Antworten und abgebrochene oder leere Sessions
erhalten keine XP. Alle Lernmodi melden erst nach ihren
bereits vorhandenen erfolgreichen Core-Übergängen normierte Events mit einer
flüchtigen, eindeutigen Session-ID. Event-ID, Tages-/Wortschlüssel und
Tages-/Session-Schlüssel verhindern Doppelvergaben.

Die Lernserie verwendet lokale `YYYY-MM-DD`-Kalendertage: weitere Sessions am
selben Tag ändern sie nicht, der Folgetag erhöht sie und eine Lücke setzt die
aktuelle Serie beim nächsten Abschluss auf eins. Die längste Serie bleibt
erhalten. Sie wird lokal auf dem Gerät gespeichert und nicht synchronisiert.
Die Motivation-State-Migration auf Schema 2 erhält vorhandene XP, Level,
Sessions, Lerntage und Meilensteine. Details stehen in
[`docs/MOTIVATION.md`](docs/MOTIVATION.md).

Level verwenden die unbeschränkte Schwelle
`50 × ((Level - 1) × Level) / 2`. Ein Levelsprung wird nie während einer
Aufgabe eingeblendet, sondern gesammelt nach dem Sessionabschluss oder später
auf dem Dashboard. Lerntage entstehen ausschließlich durch regulär
abgeschlossene Sessions mit mindestens einem geübten Wort. Meilensteine werden
für die erste Session, drei Lerntage, zehn und 25 verschiedene Wörter, fünf
Sessions sowie das erste vollständig richtige Quiz oder Schreibtraining genau
einmal gespeichert.

„Motivationselemente anzeigen“ schaltet XP-Verarbeitung und
Motivationsdarstellung aus, ohne vorhandene Motivationsdaten zu löschen. Beim
erneuten Aktivieren wird der bisherige Stand fortgesetzt. Der getrennte Reset
löscht ausschließlich XP, Level, Lernserien, Meilensteine und
Deduplizierungsdaten. Wortlernstände, Wiederholungstermine und Markierungen
bleiben unangetastet. Beide Datendomänen besitzen eigene kursbezogene,
versionierte `localStorage`-Schlüssel; beschädigte Motivationsdaten fallen auf
einen leeren Motivationsstand zurück und können den Lernbetrieb nicht
blockieren. Event- und Tages-Deduplizierung werden auf die letzten 30 lokalen
Kalendertage begrenzt, während XP, Lerntage, Sessions, Wort-IDs und Meilensteine
dauerhaft erhalten bleiben.

Die Fortschrittsbalken sind native, beschriftete `<progress>`-Elemente. Toggle,
Reset-Dialog und Level-up-Rückmeldung sind vollständig per Tastatur bedienbar,
verwenden sichtbare Fokuszustände und kommunizieren Bedeutung nie nur über
Farbe. Es gibt keine verpflichtende Animation, Audioausgabe oder negative
Meldung bei einer unterbrochenen Lernserie.

Die Motivation-Schicht ist als wiederverwendbarer EduTools-Baustein konzipiert. Eine spätere Überführung in einen gemeinsamen Core ist vorgesehen, aber nicht automatisch Bestandteil dieses Sprints.

## Lokale Kursbibliothek und Kurseditor

Der Bearbeitungsmodus wird über `features.courseBuilder.enabled` in der
mitgelieferten Kurskonfiguration aktiviert. Bei deaktiviertem Feature bleiben
Dashboard, Lernmodi, Einstellungen und mitgelieferter Kurs nutzbar; direkte
Editorrouten zeigen einen verständlichen deaktivierten Zustand. Der lokale
Bearbeitungsmodus schützt Inhalte nicht vor anderen Personen, die dasselbe
Browserprofil verwenden.

Das kanonische Schema Version 1 trennt Inhaltsversion, Metadaten, Sprachen,
Aussprachekonfiguration, Units und Wörter von allen Nutzungsdaten. Kurs-, Unit-
und Wort-IDs werden über `crypto.randomUUID()` beziehungsweise eine für Tests
injizierbare Erzeugung angelegt. Umbenennen oder fachliches Bearbeiten ändert
die ID nicht. Der mitgelieferte Kurs bleibt eine statische Ressource und wird
nicht überschrieben; „Als eigenen Kurs duplizieren“ erzeugt neue IDs für den
Kurs sowie alle Units und Wörter.

Im normalen Editor genügen Kurstitel, Ausgangssprache und Zielsprache.
Untertitel, Schulart, Jahrgangsstufe und Beschreibung sind als optional
gekennzeichnet. Sprachcode, Speech-Locale und OCR-Modell werden aus einer
zentralen Sprach-Registry abgeleitet; technische Werte sind nicht editierbar
und nur in „Erweiterte Spracheinstellungen“ zusammengefasst. Units lassen sich anlegen, umbenennen,
ordnen, als aktuell markieren, freigeben, sperren, archivieren und
wiederherstellen. Höchstens eine freigegebene, nicht archivierte Unit ist
aktuell. Einzelne Wörter unterstützen mehrere explizite Zielübersetzungen,
Lautschrift, „Hinweis in der Lernsprache“, Beispielsatz, Tags, Duplikation und
Archivierung. Der Hilfstext leitet die Sprache aus `languages.source` ab und
erinnert daran, die gesuchte Lösung nicht wörtlich zu nennen.

Archivierte Wörter werden in keinem Lernmodus mehr angeboten, behalten aber
ihren gespeicherten Lernstand für eine mögliche spätere Wiederherstellung.
Dasselbe gilt für ihre stabilen IDs. Archivierte Units sind vollständig aus
Lernquellen ausgeschlossen. Freigegebene frühere Units bleiben für reguläre
Wiederholungen verfügbar; gesperrte zukünftige Units liefern keine neuen
Lernwörter.

Ungespeicherte Änderungen werden sichtbar markiert. Beim Verlassen fragt ein
fokussierter Dialog nach Weiterbearbeiten, Speichern oder Verwerfen. Eigene
Kurse können archiviert oder nach Bestätigung inhaltlich gelöscht werden. Beim
Löschen bleiben vorhandene fachliche Lernstände und Motivationsdaten
standardmäßig erhalten, damit keine andere Datendomäne stillschweigend
entfernt wird.

## Wortlisten-Import und lokale Sicherung

„Vokabelliste importieren“ ist in einer leeren Kursbibliothek die primäre
Aktion. Der Ablauf erfasst auf derselben Seite den standardmäßigen Kursnamen
„Mein Vokabelkurs“, verpflichtende Ausgangs- und Zielsprache sowie eine
optionale Beschreibung. Eine Lehrkraft muss daher weder vorab einen leeren
Kurs noch Units anlegen. „Kurs manuell anlegen“ bleibt als sekundärer Weg
erhalten. Der tabellarische Import unterstützt eingefügten Text sowie `.csv`, `.tsv` und
`.txt` bis 2 MB und höchstens 5000 Datenzeilen. Er erkennt Tabulator, Semikolon
und Komma und verarbeitet einfache korrekt zitierte CSV-Felder mit Kommas oder
Zeilenumbrüchen. Kopfzeilen sind optional; ohne Kopfzeile erscheinen neutrale
Bezeichnungen wie „Spalte 1“. Bekannte Überschriften liefern nur Vorschläge.

Intern werden tabellarische Inhalte seit Sprint 4.1.1 zuerst durch einen
Source-Adapter in einen flüchtigen `ImportDraft` überführt. Diese Struktur
enthält ausschließlich fachliche Angaben und niemals IDs, Zeitstempel oder
technische Kursmetadaten. Ein gemeinsamer Orchestrator normalisiert und prüft
den Draft, bevor ein Materializer daraus innerhalb von EduTools den
kanonischen Kurs erzeugt. JSON-Sicherungen verwenden denselben Lebenszyklus in
einem getrennten Restore-Modus, damit ihre stabilen IDs erhalten bleiben. Die
bisherige Oberfläche und alle Austauschformate bleiben unverändert. Weitere
Architekturdetails dokumentiert
[`ADR-016`](../../../docs/architecture/adr/ADR-016-universal-import-pipeline.md).

Der bestehende kopierbare Importprompt wird seit Sprint 4.1.2 durch eine
getrennte Author-only Prompt-Engine erzeugt. Die vollständige Vorlage liegt als
`prompts/vocabulary/import-v1.txt` außerhalb des Programmcodes. Eine Registry
ordnet Typ und Version zu, der Loader prüft SHA-256 und Platzhaltervertrag, die
Template-Engine ersetzt nur deklarierte Namen, und der Generator erzeugt die
dynamischen Kurs- und Schemawerte. Fehlende Dateien sowie fehlende,
unbekannte, doppelte oder fehlerhafte Platzhalter brechen mit eindeutiger
Fehlermeldung ab. Das Konzept dokumentiert
[`ADR-017`](../../docs/architecture/adr/ADR-017-versioned-prompt-resources.md).

### Geführter ChatGPT-Import

„Vokabelseiten mit ChatGPT umwandeln“ ist ausschließlich in der Author-App
verfügbar. Die Lehrkraft legt Kursname und Sprachen fest und kopiert den
versionierten Import-Prompt. „ChatGPT öffnen“ öffnet lediglich
`https://chatgpt.com/` in einem neuen Tab mit `noopener noreferrer`; EduTools
überträgt dabei keine Bilder, PDFs, Listen oder Kursdaten. Upload und
Verarbeitung erfolgen vollständig außerhalb von EduTools und können auch mit
einem anderen selbst gewählten KI-Chat durchgeführt werden.

Die dort heruntergeladene `.json`-Datei oder alle nummerierten Dateiteile
werden anschließend gemeinsam ausgewählt. EduTools prüft jede Datei gegen das
fachliche Schema v1 und verlangt identischen Kurstitel, `appType`,
`schemaVersion`, Sprachcodes und Speech-Locales. Erst wenn alle Dateien gültig
sind, zeigt die App Kursname, Datei-, Unit- und Vokabelzahl, Sprachen,
Dateistatus und Warnungen. Ein fehlerhafter Teil blockiert die gesamte
Transaktion; es entsteht kein Teilkurs.

Gleichnamige Units werden in Auswahl- und Wortreihenfolge zusammengeführt.
Unit-Gruppen werden nach Quell-`order`, danach stabil nach Dateiauswahl und
Position in der Datei geordnet und abschließend auf `1..n` normalisiert. Unter
mehreren geeigneten aktuellen Units bleibt die erste der finalen Reihenfolge
aktuell; fehlt eine, wird die erste freigegebene, nicht archivierte Unit
aktuell. Bei widersprüchlichen optionalen Metadaten gewinnt deterministisch der
erste nicht leere Wert in Dateiauswahlreihenfolge und eine Warnung bleibt
sichtbar.

Exakte Duplikate verwenden ausschließlich die Unicode- und
Whitespace-normalisierte Kombination aus Unit, Source und Targets; die
Großschreibung bleibt bedeutungstragend. Sie werden nicht automatisch
verworfen. Vor dem Speichern wird ausdrücklich zwischen „Exakte Duplikate
überspringen“ und „Duplikate trotzdem behalten“ gewählt. Die Auswahl wirkt
erst beim Commit. Der klassische JSON-Kursrestore mit stabilen IDs bleibt
separat als Sicherungs- und Wiederherstellungsweg bestehen.

Vor der Übernahme müssen genau eine Source-Spalte und mindestens eine
Target-Spalte zugeordnet sein. Weitere Target-Spalten, Lautschrift, Hinweis,
Beispielsatz, mit `|` getrennte Tags und Unit-Titel sind möglich. Leere
Unit-Zellen verwenden die gewählte Standard-Unit; neue Unit-Titel werden in der
Vorschau ausgewiesen und bei der Übernahme mit stabilen IDs erzeugt. Eine
downloadbare UTF-8-CSV-Vorlage verwendet die Spalten
`source,target,phonetic,hint,example,tags,unit`; mehrere Targets und Tags werden
mit `|` getrennt. Der kopierbare neutrale Import-Prompt beschreibt dieselbe
Struktur, sendet aber selbst keine Daten an einen Dienst.

Das Feld `hint` enthält Scaffolding in der unter `languages.source`
konfigurierten Lernsprache. Der Hinweis sollte das Source-Wort nicht wörtlich
enthalten. Übersetzungen in der Target-Sprache gehören in `targets`, nicht in
`hint`. Die Importlogik übersetzt oder erkennt Sprachen nicht automatisch.

Die kompakte Importübersicht zählt Vokabeln, gültige Einträge, echte
Prüfhinweise, Fehler, Duplikate und neue Units. Neue Unit-Titel sind ein
reguläres positives Ergebnis und keine Warnung; sie werden einmalig mit ihrer
Vokabelzahl zusammengefasst. Eine Warnung entsteht nur bei einem tatsächlich
erklärbaren Prüfbedarf, beispielsweise bei gefüllten, nicht zugeordneten
Spalten. Jede Zeile besitzt den textlichen Status „Gültig“, „Zu prüfen“,
„Fehler“ oder „Duplikat“. Fehlerhafte Zeilen werden ausgeschlossen. Ausgangstext, Targets,
Lautschrift, Hinweise, Beispiele und Tags werden gegen die dokumentierten
Maximallängen geprüft und nie still abgeschnitten.

Duplikate innerhalb derselben Unit werden anhand von Unicode-normalisiertem,
groß-/kleinschreibungsunabhängigem und whitespace-normalisiertem Source-Text
erkannt. Standardmäßig werden sie übersprungen. „Übersetzungen
zusammenführen“ behält die bestehende Wort-ID, ergänzt eindeutige Targets und
füllt nur leere optionale Felder. „Vorhandenen Eintrag ersetzen“ behält
ebenfalls die Wort-ID, ersetzt aber seine fachlichen Inhalte. Dadurch bleibt
ein vorhandener Learning State bewusst derselben ID zugeordnet.

Gültige Einträge erscheinen in einer responsiven Tabelle; bei langen Listen
ist sie standardmäßig eingeklappt. Fehler und Prüfhinweise stehen getrennt
davor. Eine am unteren Rand haftende Aktion „Kurs speichern“ zeigt Vokabel-
und Unit-Anzahl, bleibt auf kleinen Viewports erreichbar und nennt den
konkreten Blocker, wenn sie deaktiviert ist.

Eine Vorschau mutiert den Kurs nicht. Nach ausdrücklicher Bestätigung wird der
Import auf einer Kopie angewendet, der vollständige Kurs validiert und als ein
neuer lokaler Kurszustand gespeichert. Die Erfolgsansicht verlinkt den
gespeicherten Course Builder und die Kursbibliothek. Ein Speicherfehler lässt den im App-Service
aktiven Originalzustand unangetastet; ein laufender Import wird nicht doppelt
übernommen.

Unter „Weitere Importmöglichkeiten“ stellt „EduTools-Kursdatei
wiederherstellen“ eine zuvor gesicherte JSON-Datei wieder her. Versionierte
EduTools-JSON-Dateien müssen Schema 1, `appType: "vocabulary"`,
gültige Sprachen, Aussprachewerte, IDs, Units und Wörter besitzen. Importierte
Objekte werden über erlaubte eigene Felder neu aufgebaut; `__proto__`,
`prototype` und `constructor` werden rekursiv abgelehnt. Eine bereits
vorhandene Kurs-ID wird nie still überschrieben: Der Kurs kann mit vollständig
neuen Inhalts-IDs als Kopie importiert oder ein eigener Kurs nach deutlicher
Warnung ersetzt werden.

„EduTools-Kursdatei herunterladen“ ist bei jedem eigenen Kurs im Course
Builder erreichbar. Der JSON-Export verwendet
einen lokalen Blob-Download und gibt die Objekt-URL anschließend frei. Ein
normalisierter Kurstitel und optional die Jahrgangsstufe bilden den sprechenden
Dateinamen. Der Export enthält nur Schema, App-Typ, Kursmetadaten, Sprachen,
Aussprache, Units und Wörter. Learning State, Review-Termine, Markierungen, XP,
Level, Lernserien, Meilensteine und Sessions werden ausdrücklich nicht
exportiert.

Daneben erzeugt „SCORM-Lernpaket herunterladen“ vollständig lokal ein
SCORM-1.2-ZIP für genau diesen eigenen Kurs. Das Paket übernimmt nur
freigegebene, nicht archivierte Units und Wörter mit ihren stabilen IDs. Es
enthält denselben validierten Learner wie die statische Lernanwendung, aber
keinen Course Builder, Import, OCR-/HEIC-Code, SpeechRecognition, Lernstand,
Markierungen, XP oder Motivation. Kurs-ID und daraus abgeleitete
`deploymentId` bleiben bei erneutem Export stabil. Die ZIP wird unverändert in
ByCS beziehungsweise Moodle als SCORM-Aktivität hochgeladen und nicht vorher
entpackt.

## Book Capture – deaktivierter historischer Quellpfad

Der Bildimport ist seit Sprint 3.7 deaktiviert, weil komplexe Schulbuchseiten
lokal nicht zuverlässig genug strukturiert wurden. Es gibt im normalen
Author-UI keine Bildimport-Aktion; produktive Builds enthalten keine OCR-,
HEIC-/HEIF-, WASM- oder Modell-Assets. Der empfohlene Weg ist eine vorbereitete
CSV- oder EduTools-JSON-Datei. Der folgende Abschnitt dokumentiert nur die
historisch erhaltene, nicht ausgelieferte Quellimplementierung.

Historisch war „Buchseite importieren“ eine Importaktion in editierbaren Kursen der
Author-Version. CSV, TSV, TXT und JSON bleiben unter „Weitere Import- und
Exportformate“ vollständig erhalten. Ein früher Zielkurs-/Unit-Kontext, mehrere
HEIC-, HEIF-, JPEG-, PNG- oder WebP-Seiten, Drag-and-drop, Zwischenablage, mobile Fotoauswahl,
Reihenfolge, Entfernen, Drehung, Crop und einzelne erneute Analyse verwenden
weiterhin die vorhandene lokale Sprint-3.0-Architektur.

Der sichtbare Ablauf besteht aus „Seiten hinzufügen“, „Prüfen“, „Übernehmen“
und „Fertig“. Vor dem Start zeigt die App das Foto mit den Bereichen
„Ausgangsbegriffe“, „Übersetzungen“ und „wird ignoriert“. Zwei native
Schieberegler verändern die relativen Grenzen per Maus, Touch oder Tastatur;
„Auf alle Seiten anwenden“ übernimmt eine Einstellung bewusst für den gesamten
Import. Erst „Schnellimport starten“ beginnt die lokale Analyse. Valide Zeilen
sind vorausgewählt; „Nur zu prüfende Stellen“ konzentriert Warnungen,
Feldfehler und mögliche Duplikate. Auf Desktop stehen Originalseiten und Review
nebeneinander, mobil untereinander als aufklappbare Originale und editierbare
Vokabelkarten.

Die bestätigte Vorschau nutzt dieselbe transaktionale Importlogik wie der
tabellarische Import. Feldfehler blockieren die Übernahme; Duplikate werden nie
still überschrieben. Nur kanonische Wortfelder gelangen in den Kurs.
Nach der Übernahme kann neben Lernen und einer weiteren Buchseite unmittelbar
die vollständige Kursdatei heruntergeladen werden. Originalbilder,
Arbeitskopien und technische Analysedaten gelangen weder in
Browserstorage noch JSON, Learner-Build oder SCORM-Paket. Die vollständige
Bedienung, Datenschutzgrenzen und bekannte Grenzen stehen in
[`docs/IMAGE_OCR_IMPORT.md`](docs/IMAGE_OCR_IMPORT.md).

iPhone-Fotos werden anhand von MIME-Type oder Endung erkannt und vor der
bisherigen Pipeline vollständig lokal in eine JPEG-Arbeitskopie umgewandelt.
Die Arbeitskopie verwendet Qualität 0,92, übernimmt die sichtbare Ausrichtung,
aber keine EXIF-, XMP- oder GPS-Metadaten. Mehrere Bilder werden in ihrer
Auswahlreihenfolge und einzeln verarbeitet; ein defektes Foto verwirft keine
gültigen Seiten. Die lokal gebündelte CSP-Variante von `heic-to` 1.5.2
(libheif 1.22.2, LGPL-3.0, 2.995.463 Byte) wird nur im Author-Profil und erst
bei Bedarf geladen. Learner und SCORM enthalten weder Decoder noch
Arbeitskopien.

### Zweispaltiger Schnellimport und Smart Review

Der Standardmodus verarbeitet ausschließlich die linke Source-/IPA-Spalte und
die mittlere Target-Spalte. Aus beiden relativen Bereichen werden vor der OCR
getrennte Arbeitskopien erzeugt. Der Bereich rechts der zweiten Grenze wird
weder erkannt noch an Zeilenbildung, Inhaltsklassifikation oder Warnungen
beteiligt. Die ältere dreispaltige Strukturierungslogik bleibt intern für
Regressionstests und bestehende Architekturpfade erhalten, besitzt aber keinen
experimentellen Schalter im normalen Author-UI.

Eine plausible Source-Zelle verankert genau einen fachlichen Eintrag; nahe
Target-Fortsetzungen werden an diesen Eintrag gebunden. Überschriften wie
„Introduction“, „Skills training“, „Revision“ und „Word bank“, Seitenmarker,
Randnummern, Linien- und Symbolreste werden zentral gefiltert und sind keine
übernahmebereiten Vokabeln.

IPA in eckigen Klammern wird aus der Source-Zelle in das Lautschriftfeld
verschoben; Zusätze wie `(to)` bleiben Teil des Source-Begriffs. Die mittlere
Spalte bewahrt mehrere Targets und verbindet kontrollierte Zeilenumbrüche. Es
gibt keine Lehrwerks-, Verlags- oder Sprachpaarsonderregel und keine erfundene
Ergänzung. Hinweise, Beispiele und Tags bleiben als optionale manuelle Felder
im Review verfügbar, werden im Schnellimport aber nicht aus der rechten
Buchspalte befüllt.

Der Review gruppiert problematische und valide Vokabeln sowie erkannte
Abschnitte und nicht zugeordnete Blöcke. Source, Targets, Lautschrift,
Übernahmestatus und der auf Source plus Target begrenzte Zeilenausschnitt bilden
die kompakte Standardkarte. Hinweis, Beispiel und Tags liegen in „Weitere
Felder“. Zeichenpositions-Teilung, Zeilenverschiebung und Massenwerkzeuge werden
im normalen Schnellimport nicht angeboten.

Die neutrale Reliability-Fixture bildet 18 künstliche Einträge mit IPA,
mehrzeiligen Targets, zwei Überschriften, Randzahlen, Tabellenlinien, rechter
Beispielspalte und zwei Infoboxen. Sie erzeugt exakt 18 Karten; mindestens 17
Sources und Targets sowie mindestens 16 Lautschriften werden korrekt getrennt.
Eine reale Praxisdatei ist nicht im Repository enthalten, weshalb keine reale
Erkennungsquote oder Review-Zeit behauptet wird. Author-only-, Learner- und
SCORM-Grenzen ändern sich nicht.

## Kurskonfiguration

[`src/config/course-config.json`](src/config/course-config.json) definiert unter
anderem eine dauerhaft eindeutige `courseId`, die positive `contentVersion`,
die Herkunft `sourceType`, die Editierbarkeit, die aktuelle Unit, alle
freigegebenen Units, `languages.source` und
`languages.target` sowie Tageslimits
für neue Wörter und Wiederholungen. Die Aussprachekonfiguration verwendet die
dort hinterlegten `speechLocale`-Werte und den Provider `speech-synthesis`.
Der optionale Bereich `motivation` definiert Aktivierung, 30-tägige
Deduplizierungsfrist und die zentralen XP-Werte; ungültige optionale Werte
fallen auf sichere Standards zurück.
Nicht freigegebene Units werden vom Scheduler nicht berücksichtigt.

Konfigurations- und Vokabeldatei müssen dieselbe `courseId` und
`contentVersion` besitzen. Fehlende
Pflichtfelder, eine nicht freigegebene aktuelle Unit oder widersprüchliche Daten
führen zu einer verständlichen Fehlermeldung im Dashboard.

## Vokabeldaten

[`src/data/vocabulary.json`](src/data/vocabulary.json) verwendet Schema-Version
1 und dieselbe `contentVersion` wie die Kurskonfiguration. Jede Unit und jedes
Wort besitzt eine dauerhaft eindeutige ID. Ein Wort hat
einen sprachneutral benannten Ausgangstext (`source`) und mindestens eine
mögliche Zielantwort (`targets`). Aussprache, Hinweise, Beispielsätze und Tags
sind optional.

Mitgelieferte Hinweise sind kurze Definitionen oder Umschreibungen in der
jeweiligen Source-Sprache und nennen das gesuchte Source-Wort nicht. Deutsche
UI-Labels wie „Hinweis“ bleiben davon getrennt; Hinweis- und Beispielinhalt wird
in den Lernansichten mit dem konfigurierten Source-Sprachcode ausgezeichnet.

Die gebündelten Inhalte sind frei zusammengestellte, neutrale Beispieldaten.
Sie stammen aus keinem Schulbuch und werden in der Author-Kursbibliothek nicht
als eigener Kurs angeboten.

## Lokale Speicherung

Lernstände werden als JSON unter einem kursbezogenen Schlüssel gespeichert:

```text
edutools:vocabulary-trainer:<courseId>:learning-state
edutools:vocabulary-trainer:<courseId>:motivation-state
edutools:vocabulary-trainer:course-library
edutools:vocabulary-trainer:active-course
```

Jeder Wortzustand enthält Zähler, Wiederholungsstufe, Markierung und
Zeitstempel. Die Schema-Version wird mitgespeichert, damit spätere Migrationen
erkennbar bleiben. Beschädigte oder inkompatible Einträge werden verworfen und
durch einen leeren Zustand des betroffenen Kurses ersetzt. Andere Kurse bleiben
unangetastet.
Der Motivationsstand besitzt eine eigene Schema-Version. Ein Fehler beim Lesen
oder Schreiben dieses Schlüssels verändert weder Learning State noch laufende
Lernsession.

Die bestehenden kursbezogenen Schlüssel mitgelieferter Kurse bleiben
unverändert. Aktuelle statische JSON-Inhalte werden über `sourceType: "bundled"`,
eine stabile ID, `contentVersion` und eine dazu passende
Ressourcen-URL geladen. Nur ein eindeutig als `bundled` und nicht editierbar
gekennzeichneter Bibliothekssnapshot derselben ID darf durch den aktuellen
Bundle-Inhalt ersetzt werden; Learning State, Motivation und Markierungen
bleiben in ihren getrennten Schlüsseln erhalten. Eigene, importierte und aus
einem mitgelieferten Kurs duplizierte Kurse bleiben editierbar und werden nie
automatisch verändert. Der aktive Kurs wird separat
gespeichert; eine beschädigte
Kursbibliothek oder unbekannte aktive Kurs-ID fällt auf den mitgelieferten Kurs
zurück und berührt keine Lern- oder Motivationsschlüssel.

Kursinhalte, fachlicher Lernstand und Motivation werden getrennt gespeichert
und ausschließlich über stabile Kurs- und Inhalts-IDs miteinander verknüpft.

## Veröffentlichungsprofile und statische Builds

Sprint 2.2 führt zwei explizite Modi ein:

- `author`: vollständige Kursbibliothek mit Course Builder, Sprachkonfiguration,
  Units, vollständigen Wortfeldern, CSV-/TSV-/TXT-Import samt Vorlage und
  JSON-Import/-Export; ohne Book Capture oder OCR-/HEIC-Assets.
- `learner`: genau ein freigegebener Kurs ohne Kurswechsel,
  Kursverwaltung, Editor oder Import-/Exportcode.

Beide Modi verwenden dieselbe Lernlogik und dasselbe Designsystem. Eine
zentrale Capability-Schnittstelle steuert Navigation, Routen und optionale
Module. Nicht verfügbare direkte Routen zeigen einen kontrollierten
Unavailable-Zustand. Im Learner-Build werden Autorenmodule nicht lediglich
ausgeblendet, sondern gar nicht ausgeliefert.

Beispielbuilds vom Repository-Root:

```bash
node apps/vocabulary-trainer/scripts/build.mjs \
  --profile apps/vocabulary-trainer/profiles/author.example.json
node apps/vocabulary-trainer/scripts/build.mjs \
  --profile apps/vocabulary-trainer/profiles/learner.example.json
```

Die Ausgabe liegt ausschließlich unter `dist/`. Der Builder validiert Profil,
Kurs, Dateigrenzen und statische Referenzen, schreibt zuerst temporär und
ersetzt das Ziel erst nach erfolgreicher Prüfung. Das deterministische
`build-manifest.json` enthält sortierte Dateiprüfsummen ohne Zeitstempel.

Persistente Daten sind über die stabile `deploymentId` getrennt. Author und
mehrere Learner-Veröffentlichungen derselben Origin beeinflussen einander
nicht. Eine idempotente Author-Migration übernimmt bekannte alte lokale
Schlüssel kopierend; eigene, importierte und duplizierte Kurse werden niemals
automatisch verändert. Das `contentVersion`-Verhalten aus ADR-006 bleibt
ausschließlich auf eindeutig mitgelieferte Kurse begrenzt.

Alle Profilfelder, Hostinghinweise und Fehlerfälle beschreibt
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Die Architekturentscheidung steht
in
[`ADR-007`](../../../docs/architecture/adr/ADR-007-publication-profiles-and-static-builds.md).

## Lokal starten

Da Konfiguration und Daten per `fetch` geladen werden, muss die App über HTTP
statt direkt als `file://` geöffnet werden. Vom Repository-Root aus:

```bash
python3 -m http.server 8000
```

Danach öffnen:

```text
http://127.0.0.1:8000/apps/vocabulary-trainer/src/
```

Der Quellmodus besitzt weiterhin keine externen Laufzeitabhängigkeiten. Für
eine statische Veröffentlichung ist der oben beschriebene Node-Build
verbindlich.

## Tests

Der kleine Test-Runner benötigt keine Bibliothek. Mit einer aktuellen
Node.js-Version vom Repository-Root:

```bash
node apps/vocabulary-trainer/tests/core.test.mjs
node apps/vocabulary-trainer/tests/brand-system.test.mjs
node apps/vocabulary-trainer/tests/course-library.test.mjs
node apps/vocabulary-trainer/tests/design-system.test.mjs
node apps/vocabulary-trainer/tests/heic.test.mjs
node apps/vocabulary-trainer/tests/import-architecture.test.mjs
node apps/vocabulary-trainer/tests/motivation.test.mjs
node apps/vocabulary-trainer/tests/ocr.test.mjs
node apps/vocabulary-trainer/tests/prompt-engine.test.mjs
node apps/vocabulary-trainer/tests/quiz.test.mjs
node apps/vocabulary-trainer/tests/pronunciation.test.mjs
node apps/vocabulary-trainer/tests/quick-import.test.mjs
node apps/vocabulary-trainer/tests/router.test.mjs
node apps/vocabulary-trainer/tests/release.test.mjs
node apps/vocabulary-trainer/tests/scorm.test.mjs
node apps/vocabulary-trainer/tests/session.test.mjs
node apps/vocabulary-trainer/tests/smart-review.test.mjs
node apps/vocabulary-trainer/tests/speed.test.mjs
node apps/vocabulary-trainer/tests/views.test.mjs
node apps/vocabulary-trainer/tests/writing.test.mjs
node apps/vocabulary-trainer/tests/static-build.test.mjs
```

Der aktuelle Stand umfasst 640 bestandene Tests in 25 Suiten ohne externe
Testbibliothek. Darin enthalten sind 18 gezielte Prompt-Engine-Tests,
17 Tests für den geführten ChatGPT-Assistenten, 11 Tests für den
JSON-Mehrfachimport, 17 Brand-System-Tests, 31 OCR-Tests, 13
Smart-Review-Tests und 15 Schnellimport-Reliability-Tests sowie
die bestehenden Release-, SCORM-, ZIP-, Runtime-, Datenschutz- und
Trennungstests.

Die Tests decken Vocabulary Core und Dashboard-Kennzahlen, Hash-Routing,
Flashcard-, Quiz-, Schreib-, Speed-, Aussprache- und Motivation-Zustände, Paar- und Fragengenerierung,
Timer, Antwortnormalisierung, alternative Lösungen, Richtungswechsel,
Speicherung, Tastaturkürzel, Empty States und die Neuberechnung des Dashboards
ab. Die Audio-Tests prüfen Konfigurations-Fallbacks, Speech-API-Unterstützung,
Stimmenauflösung, Lifecycle, zugängliche Buttons und den didaktischen
Lösungsschutz. Zusätzlich werden die rollenbasierte Source-Aussprache,
Deutsch als Source-Sprache, sichere Fallbacks, Scaffolding in der
Source-Sprache und die sprachliche HTML-Auszeichnung geprüft. Außerdem werden
Levelkurve, lokale Datumsgrenzen, XP-Deduplizierung, Tagesbonus, Lernserien,
Meilensteine, getrennte Speicherung, Deaktivierung, Reset und die getrennte
Fortschrittsansicht geprüft. Darüber hinaus werden
App-Landmarken, Skip-Link, zugängliche Navigation, Tokenvollständigkeit,
unbekannte Custom Properties, zentralisierte Rohfarben, fehlende Inline-Styles,
Buttonvarianten, Fokus, Reduced Motion, CSS-Modulstruktur sowie textliche
Status- und Empty-State-Muster geprüft. Außerdem werden
Initialisierung, direkte Hash-Aufrufe, Browser-Historie, Konsole,
`localStorage`, Fokusführung und responsive Darstellung im Browser geprüft.
Die Kursbibliotheks-Suite prüft zusätzlich Schema und stabile IDs, Validierung,
Storage-Fallbacks, Service-Operationen, Archivierung, Parser und
Spaltenzuordnung, Importvorschau, alle Duplikatstrategien, atomare Speicherung,
JSON-Sicherheit, Exportgrenzen und direkte Routen. Sprint 2.1.2 ergänzt den
realen Built-in-Ladepfad, Inhaltsversionen, alte Built-in-Snapshots, Erhalt der
getrennten Zustände, alle drei Flashcard-Richtungen, stabile gemischte Karten,
Audio-Schutz, native Richtungsradios und beide Markierungszustände. Die
Sprint-2.2-Suite prüft zusätzlich strikte Profile, feste Published Courses,
Author-/Learner-Dateigrenzen, deaktivierte Features, Deployment-Namespaces,
idempotente Legacy-Migration, deterministische Manifeste, Unterordnerreferenzen
und die atomare Erhaltung des letzten gültigen Builds.
Die Importarchitektur-Suite prüft den technikfreien `ImportDraft`,
idempotente Normalisierung, strukturierte Issues, Adapter-Registry,
CSV-/TSV-Parität, Materialisierung, Erweiterbarkeit ohne Orchestratorumbau und
den ID-erhaltenden JSON-Restore-Modus.
Die Prompt-Engine-Suite prüft Registry und Versionauswahl, SHA-256-Integrität,
fehlende Ressourcen, Cacheverhalten, den strikten Platzhaltervertrag,
deterministische Ersetzung, dynamische Kurs- und Schemadaten, weitere
Prompttypen sowie die physische Author-only-Ressourcengrenze.
Die Brand-Suite prüft semantische Rollen, zentrale Theme-Aktivierung,
Himmelblau–Mint-Abgrenzung, Kontraste, stabile Statusfarben, Lernmodusakzente,
organische Flächen, lange Textumbrüche, das einmalige MJ-Signet und die
Development-/Buildgrenzen zukünftiger Farbstudien.
Die OCR-Suite prüft lokale und exakt versionierte Engine-/Modellpfade,
Sprachregistry, sequentielle Worker-Ausführung, Abbruch und Cleanup,
Bildgrenzen, relative Tabellenstrukturierung, Spaltenzuordnung,
Textnormalisierung, alternative Targets, vollständig editierbare Vorschau,
Mehrseitenreihenfolge, lokale Ressourcenfreigabe, Mehrfachaktionen,
Duplikat-ID-Erhalt, atomare Übernahme und neutrale Testfixtures.
Smart Review ergänzt eine neutrale komplexe Dreispaltenfixture mit 20
Vokabeleinträgen. Gemessen werden Source-, Target- und IPA-Zuordnung,
Zeilenassoziation, Review-Anteil, Überschriften-/Seitenmarker-Ausschluss,
mehrzeilige Targets, vollständige Zeilenausschnitte, manuelle relative
Spaltengrenzen und die physische Author-only-Buildgrenze. Die View- und
Audio-Suiten prüfen zusätzlich semantische Unit-Karten, Kurs-State-Wechsel ohne
Lernstandsänderung, Rate-Presets, Source-Voice-Filter und fehlende gespeicherte
Stimmen. Build-, Release- und SCORM-Tests belegen zusätzlich, dass kein
Produktprofil OCR-/HEIC-Software, Modelle, Book Capture, Spracherkennung oder
Mikrofoncode enthält und dass die CSP dafür nicht gelockert wird.
Die HEIC-Suite ergänzt MIME-/Endungserkennung, JPEG-Adapter, Abbruch,
gemischte Mehrfachauswahl, Einzelfehler, Retry-Deduplizierung, reale Quer- und
Hochformatfixtures, lokale Lizenz-/Hashnachweise sowie den physischen Ausschluss
aus Learner und SCORM.

## Sprint 2.3 – Produktionsfreigabe und GitHub Pages

Die Produktionsfreigabe kombiniert ausschließlich ausdrücklich ausgewählte
Profile aus `deployments/github-pages.production.json`: Der Learner liegt am
Root, der vollständige Course Builder unter `/author/`. Beispielprofile und
Testfixtures werden nicht automatisch aufgenommen.

```bash
node apps/vocabulary-trainer/scripts/release-pages.mjs \
  --deployment apps/vocabulary-trainer/deployments/github-pages.production.json
node apps/vocabulary-trainer/scripts/serve-static.mjs --root dist/pages --port 4173
```

Das Release-Gate umfasst sämtliche Tests, JavaScript-Syntax, JSON- und
Profilvalidierung, einen vollständigen Kurs-Export-/Import-Roundtrip, atomare
Assembly, SHA-256-Manifeste und echte HTTP-Smoke-Tests. `dist/pages` enthält
Root-Learner, `/author/`, eine zugängliche `404.html`, `.nojekyll` und das
deterministische `release-manifest.json`.

Build-Hashes versionieren direkte HTML-Assets, Runtimeprofil und Kursdatei.
Stabile `deploymentId`, Kurs- und Wort-IDs erhalten Lernstand und Motivation
über Releases. Öffentliche Learner-Kursdaten sind für Personen mit URL-Zugriff
lesbar und dürfen keine vertraulichen Inhalte enthalten.

GitHub Pages wird über den SHA-gepinnten Workflow
`.github/workflows/deploy-vocabulary-trainer-pages.yml` vorbereitet. Pull
Requests verifizieren, deployen aber nicht. Eine tatsächliche Live-URL gilt
erst nach einem autorisierten Workflowlauf und nachgelagerter Prüfung als
freigegeben. Details, Pages-Einrichtung, Checkliste und Rollback stehen in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Grenzen von Sprint 2.3

Enthalten sind Flashcards, Multiple-Choice-Quiz, Schreibtraining, die
beschriebene Speed Challenge, manuelle Browser-Sprachausgabe sowie die sanfte,
abschaltbare Motivationsebene. Audiodateien, Speed-Challenge-Audio,
Aufnahme, Spracherkennung, Aussprachebewertung, Highscore-Listen,
unscharfe Rechtschreibkorrektur, tägliche Aufgaben, Belohnungsshop,
Ranglisten, Wettbewerbe, PDF-, DOCX- und XLSX-Import, KI-Übersetzung,
Konten, Synchronisierung und weitere Lernmodi sind nicht implementiert.
Laufende Lernsessionen werden bewusst weder gespeichert noch nach einem
Neuladen wiederhergestellt. Es gibt kein Deployment ohne die beschriebene
Workflowfreigabe,
kein Backend und keine serverseitigen Pretty-URL-Rewrites. Ein Learner-Build
enthält genau einen Kurs; ein Kurswechsel erfolgt durch eine eigenständige
Veröffentlichung mit stabiler, separater Deployment-ID.

Eigene Kurse und importierte Wortlisten werden ausschließlich lokal im
verwendeten Browser gespeichert. Ein JSON-Export dient als lokale Sicherung
und zur Übertragung auf ein anderes Gerät.

Das Löschen von Browserdaten kann lokal gespeicherte Kurse und Lernstände
entfernen. Regelmäßige JSON-Exporte werden daher empfohlen.

Die Kursbibliothek und der Import sind als Grundlage für spätere
EduTools-Anwendungen konzipiert. Eine Überführung in einen gemeinsamen Core
erfolgt erst nach nachgewiesener Wiederverwendbarkeit.

## Datenschutz

- keine Anmeldung und keine personenbezogenen Daten
- keine Cloud, kein Backend und keine API
- keine Analyse- oder Trackingdienste
- keine extern geladenen Bibliotheken oder Ressourcen
- Lernhistorie bleibt im lokalen Browserprofil
- keine eigene EduTools-Cloud-Übertragung für die Aussprache
- kein Mikrofonzugriff, keine Sprachaufnahme und keine Spracherkennung
- keine OCR-, HEIC-/HEIF- oder Bilddaten in Author-, Learner-, Pages- oder
  SCORM-Artefakten

Die Aussprache verwendet die Sprachausgabefunktion des Browsers beziehungsweise
Betriebssystems. Die Lernserie bleibt lokal auf diesem Gerät und wird nicht
synchronisiert.

Beim Löschen der Website-Daten im Browser geht der lokale Lernstand verloren.

## Sprint 2.4 – private SCORM-1.2-Lernpakete

Der bestehende Learner-Build kann lokal als privates SCORM-1.2-Paket für einen
geschlossenen ByCS-/Moodle-Kurs erzeugt werden. SCORM ist dabei ausschließlich
ein Delivery-Adapter: Vocabulary Core, Scheduler, Views, Lernmodi, Aussprache,
Storage und Kursvalidator werden nicht kopiert.

Neutrales Beispiel bauen, inspizieren und im lokalen Parent-Frame testen:

```bash
node apps/vocabulary-trainer/scripts/build-scorm.mjs \
  --profile apps/vocabulary-trainer/scorm/examples/private-scorm-profile.example.json
node apps/vocabulary-trainer/scripts/inspect-scorm.mjs \
  --file dist/private-scorm/neutral-classroom-package.scorm.zip
node apps/vocabulary-trainer/scripts/serve-scorm-test.mjs \
  --package dist/private-scorm/neutral-classroom-package.scorm.zip --port 4174
```

Ein privater Kurs wird weiterhin in der Author-App erstellt oder importiert und
als JSON exportiert. Erst ein ausdrücklich angepasstes privates Learner- und
SCORM-Profil nimmt diese Datei in genau ein Paket auf. Private Quellen unter
`apps/vocabulary-trainer/private/`, Ausgaben unter `dist/private-scorm/` und
`*.scorm.zip` sind Git-ignoriert und werden vom Pages-Workflow nicht verarbeitet.

`completionPolicy` unterstützt `none` und `first-completed-session`. Im zweiten
Fall beginnt ein neuer Versuch als `incomplete`; erst eine regulär vollständig
beendete Lernsession setzt `completed`. An das LMS gehen keine Scores,
Wortantworten, Lernstände, Motivation, Namen oder Nutzer-IDs. Der detaillierte
Lernstand bleibt im bestehenden Namespace aus stabiler `deploymentId`, Kurs-ID
und Wort-IDs lokal im Browser.

Die vollständige Anleitung steht in [`docs/SCORM_BYCS.md`](docs/SCORM_BYCS.md),
die echte Abnahmevorlage in
[`docs/BYCS_SCORM_ACCEPTANCE.md`](docs/BYCS_SCORM_ACCEPTANCE.md). Ein lokaler
Mock-Nachweis ist keine erfolgreiche ByCS-Integration; diese Bezeichnung ist
erst nach einem echten authentifizierten Upload und Test zulässig.
