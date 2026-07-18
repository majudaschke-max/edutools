# Code Review

Ticket: `multi-course-browser-and-scorm`

## Review-Grundlage

- freigegebene Spec: `spec/active/multi-course-browser-and-scorm-spec.md`
- freigegebener Plan: `spec/active/multi-course-browser-and-scorm-plan.md`
- geprüfter Diff: Profilvertrag, Builder, Pages-Assembly, Kataloglaufzeit,
  Storage-Migration, Author-Ausgabekanal, Tests und Dokumentation des Slice A
- ausgeführte Tests: vollständiger Lauf mit 29 Suiten und 689 Tests vor den
  Review-Fixes; anschließend 15 gezielte Mehrkurs-Tests und nach allen Fixes
  der zentrale Harness-Lauf mit 29 Suiten, 691 Tests und 10/10 grünen
  Regression-Gates sowie reale lokale Pages-QA

## Correctness

Der Pages-Builder erzeugt aus einem expliziten Katalogprofil deterministisch
einen Index und genau die freigegebenen Kursdateien. Laufzeitprofil und Loader
akzeptieren exklusiv Einzelkurs oder Katalog, validieren Metadaten und fallen
bei unbekannten Veröffentlichungs-IDs nicht auf einen anderen Kurs zurück.
Direktlinks, Kursauswahl, Kurswechsel, Browserhistorie und Update-/Entfernen-
Verhalten wurden geprüft.

## Scope

Die Produktänderungen bleiben auf Slice A begrenzt. ImportDraft,
Importadapter, Course Schema, Scheduler, Lernbewertung, Motivation und die
mobile Learner-Gestaltung wurden nicht verändert. SCORM-Generator, Manifest,
ZIP-Struktur, API-Adapter und Runtime blieben unverändert.

Eine notwendige Planabweichung ist dokumentiert: Statt das bestehende
`learner.production.json` in einen Katalog umzuwandeln, wurde
`learner-catalog.production.json` ergänzt. So bleibt das bestehende feste
Produktionsprofil unverändert die Author-SCORM-Vorlage. Die im Plan genannte,
nicht vorhandene Datei `docs/deployment/GITHUB_PAGES.md` wurde durch die
bestehende kanonische Dokumentation
`apps/vocabulary-trainer/docs/DEPLOYMENT.md` ersetzt.

## Readability

Profilvalidierung, buildseitige Katalogerzeugung, Laufzeitloader und View sind
getrennt. Stabile Namen (`publicationId`, `courseCatalog`,
`published-course-catalog`) bilden die fachliche Grenze ab. Die neue
Kataloglaufzeit enthält keine Author- oder Fachlogik.

## Maintainability

Einzelkurs- und Katalogprofile teilen den bestehenden Builder und den
kanonischen Course Validator. Künftige Katalogkurse benötigen nur einen
weiteren Profileintrag. Der Katalog wird aus Kursdaten erzeugt und nicht
doppelt manuell gepflegt. Die Author-Vorbereitung verwendet den bestehenden
Course Exporter.

## Security und Datenschutz

Pfade und Veröffentlichungs-IDs werden streng validiert. Externe URLs,
Traversal, doppelte Veröffentlichungs- und Kurs-IDs sowie Metadatendrift
werden abgelehnt. Die Author-App verlangt vor der Browser-Vorbereitung eine
ausdrückliche Bestätigung der öffentlichen Abrufbarkeit und nennt Namen,
personenbezogene Daten, Lehrwerksbilder und Scans als Ausschlussgründe. Es
existiert kein Upload, GitHub-Aufruf oder neuer Netzwerkdienst.

## Error Handling

Leerer oder ungültiger Katalog stoppt den Start kontrolliert. Unbekannte oder
entfernte Direktlinks zeigen eine verständliche Kursauswahl. Eine nicht
ladbare Kursdatei öffnet keinen Ersatzkurs. Storage-Fehler verwenden die
bestehenden defensiven Fallbacks; die Legacy-Migration löscht keine Daten.

## Buildgrenzen

Nur der Katalog-Learner enthält Katalogloader und Auswahl-View. Author,
Einzelkurs-Learner und SCORM enthalten diese Dateien nicht. Der Pages-Learner
enthält keine Author- oder Importmodule. Die feste Author-SCORM-Vorlage bleibt
bei `course.file` und genau `data/course.json`.

## Issue 1

Severity: High

Bereich: Katalog-Kursloader

Beschreibung: Kursdateien wurden zunächst relativ zur Dokument-URL statt zum
geladenen Katalogindex aufgelöst.

Auswirkung: Direktlinks auf einen gültigen Katalogkurs hätten im realen
Pages-Build die Kursdatei am falschen Pfad angefordert.

Empfohlene Lösung: Den validierten Katalogpfad als Basis-URL an den bestehenden
Published-Course-Loader übergeben und den realen Pfad testen.

Status: RESOLVED

## Issue 2

Severity: High

Bereich: Kursauswahl im App-Header

Beschreibung: Navigation und Einstellungen trugen `hidden`, bestehende
Layoutregeln berechneten aber weiterhin `display: grid` beziehungsweise
`display: flex`.

Auswirkung: Auf der Kursauswahl waren Aktionen sichtbar, obwohl noch kein Kurs
initialisiert war.

Empfohlene Lösung: Verborgene Headerelemente innerhalb der geplanten
Learner-Styles verbindlich ausblenden und den berechneten Zustand im Browser
prüfen.

Status: RESOLVED

## Issue 3

Severity: Medium

Bereich: Buildgrenzen und Rückwärtskompatibilität

Beschreibung: Der erste Dateiplan hätte die Learner-only-Katalogmodule auch
in den Author kopiert; zusätzliche leere Katalogfelder im festen
Buildmanifest hätten außerdem das SCORM-Template unnötig verändert.

Auswirkung: Unscharfe Buildgrenzen und vermeidbare Änderungen an einem
ausdrücklich unveränderten Ausgabekanal.

Empfohlene Lösung: Katalogmodule positiv nur für Katalog-Learner aufnehmen und
Katalogmanifestfelder ausschließlich bei einem vorhandenen Katalog schreiben.

Status: RESOLVED

## Issue 4

Severity: Medium

Bereich: Regressionstest für Aktualisieren und Entfernen

Beschreibung: Der erste Teststand belegte drei Kurse und getrennte
Storage-Schlüssel, aber noch keinen vollständigen Rebuild nach Update und
Entfernen eines Katalogeintrags.

Auswirkung: Akzeptanzkriterium 5 war nur indirekt statt artefaktbezogen
abgedeckt.

Empfohlene Lösung: Temporären realen Katalog bauen, einen Kurs bei stabiler ID
aktualisieren, einen anderen entfernen und unveränderte Artefakte sowie den
kursbezogenen Zustandskey vergleichen.

Status: RESOLVED

## Issue 5

Severity: Low

Bereich: Strenge Katalogvalidierung und Wartbarkeit

Beschreibung: Zusätzliche Schlüssel auf dem `languages`-Objekt wurden nicht
abgewiesen und die Learner-only-Dateimenge wurde pro Filteraufruf neu erzeugt.

Auswirkung: Unnötig lockerer Laufzeitvertrag und kleine vermeidbare
Allokationen.

Empfohlene Lösung: Erlaubte Sprachschlüssel explizit prüfen und die Dateimenge
als Konstante führen.

Status: RESOLVED

## Issue 6

Severity: Medium

Bereich: finales lokales Release-Artefakt

Beschreibung: Nach der Browser-QA lagen im generierten `dist/pages` lokal
nummerierte Dubletten einzelner Root-Dateien und leere nummerierte
Verzeichnisse. Sie gehörten nicht zum Manifest und nicht zum Quellstand.

Auswirkung: Das repositoryweite Release-Gate lehnte den nachträglich
veränderten Dateibaum korrekt ab.

Empfohlene Lösung: Den ausschließlich generierten Pages-Ordner vollständig
entfernen, aus den geprüften Quellen neu assemblieren und Manifest sowie
Release-Policy erneut validieren.

Status: RESOLVED

## Review-Ergebnis

Offene Critical-Issues: 0

Offene High-Issues: 0

Offene Medium-Issues: 0

Status: APPROVED
