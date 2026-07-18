# Zielarchitektur

Dieses Dokument beschreibt die grundlegende Zielrichtung der EduTools-Architektur. Es legt bewusst noch keine komplexe technische Lösung fest. Architekturentscheidungen werden bei Bedarf als [Architecture Decision Records](adr/README.md) nachvollziehbar dokumentiert.

## Zwei Ebenen

### EduTools Core

Der Core kann bewährte, produktübergreifende Funktionen bündeln:

- Storage
- Theme
- Design Tokens
- UI-Komponenten
- Navigation
- Accessibility-Hilfen
- Utilities

Der Core entsteht schrittweise. Eine Lösung wird erst dann gemeinsam, wenn ihre Wiederverwendung praktisch belegt ist.

### EduTools Apps

Apps sind fachliche Produkte mit eigener Logik, zum Beispiel:

- Vocabulary Trainer
- Grammar Trainer
- Reading Trainer

Eine App darf zunächst eigenständig entstehen und verwendet den Core dort, wo eine gemeinsame Lösung verständlich und stabil ist.

## Grundregeln

- Der Core kennt keine konkreten Vokabeln oder Lehrwerke.
- Kursdaten liegen außerhalb der Programmlogik.
- Apps verwenden den Core, soweit dies sinnvoll ist.
- Apps zeigen bei Ausfall optionaler Core-Funktionen weiterhin verständliche Fehlermeldungen an.
- Es gibt keine frühzeitige Überabstraktion.
- Lösungen werden erst in den Core verschoben, wenn sie sich in der Praxis als gemeinsam nutzbar bewährt haben.
- Eine statische Auslieferung über GitHub Pages bleibt möglich.
- Fachliche Daten werden über klar definierte JSON-Strukturen eingebunden.
- Lernfortschritt wird kurs- und wortbezogen lokal gespeichert.
- Delivery-Adapter wie SCORM kapseln ausschließlich den Auslieferungskanal und
  verwenden den bestehenden validierten App-Build. Sie duplizieren weder Core
  noch Lernmodi und übertragen keine detaillierten lokalen Lernstände.
- Book Capture ist seit ADR-014 in allen Produktprofilen deaktiviert. Der
  historische OCR-/HEIC-Quellpfad bleibt isoliert für Regression und Forschung,
  besitzt aber keinen UI-Einstieg und wird nicht gebaut. Tabellenimport und der
  kanonische JSON-Kursroundtrip sind die unterstützten Importgrenzen.
- Die verworfene Sprechübung besitzt weder Route, Runtime, Motivationsevent
  noch Mikrofonberechtigung. Die getrennte `speechSynthesis`-Ausgabe sichtbarer
  Source-Inhalte bleibt als rein ausgehende Accessibility-/Lernhilfe erhalten.
- Historische OCR-/HEIC-Pakete sind Entwicklungsabhängigkeiten. Positive
  Dateipläne und Artefaktvalidatoren bilden die verbindliche Grenze; ein
  Featureflag kann den deaktivierten Pfad nicht reaktivieren.
- Große Author-Werkzeuge und ihre Laufzeitressourcen werden über positive
  Dateipläne ausschließlich im Author-Profil ausgeliefert. Learner- und
  Delivery-Builds enthalten sie physisch nicht und lockern dafür keine CSP.
- Der visuelle EduTools Brand Core definiert semantische, appübergreifende
  Rollen. Jede App aktiviert genau ein kleines zentrales Theme statisch auf dem
  HTML-Wurzelelement; Themes werden weder aus Kursen noch Sprachen abgeleitet.
- Author, Learner und Delivery verwenden dieselben Brand-Core- und App-Theme-
  Dateien. Development-only-Referenzen und hypothetische Theme-Studien bleiben
  außerhalb positiver Build-Dateipläne.
- Die aktuelle Unit ist Teil des bestehenden Kurskontexts. Ein Wechsel mutiert
  weder Wort-IDs noch Learning State; alle Lernmodi lesen anschließend denselben
  aktualisierten `currentUnit`-Wert.
- Aussprachepräferenzen sind deploymentweit und lokal im Browserprofil. Sie
  gehören weder zum Kurs-JSON noch zu Learning State oder SCORM-Inhaltsdaten.
- Eine zentrale Sprach-Registry übersetzt fachliche Sprachauswahlen in
  Sprachcode, Speech-Locale und OCR-Modell. Views und Kursnamen enthalten keine
  eigenen Sprachzuordnungen.
- Der kanonische Kurs-Exporter ist die einzige Editor-zu-JSON-Grenze.
  Kursbibliothek und Course Builder verwenden dieselbe Implementierung;
  Learning State und Motivation bleiben außerhalb.
- Inhaltsimporte durchlaufen vor dem kanonischen Kursmodell einen flüchtigen,
  technikfreien `ImportDraft`. Source-Adapter, strukturierte Issues und ein
  gemeinsamer Orchestrator bleiben Author-only. JSON-Kurssicherungen verwenden
  im selben Lebenszyklus einen getrennten Restore-Payload, damit stabile IDs
  erhalten bleiben. Die Entscheidung dokumentiert ADR-016.
- Author-Prompttexte sind versionierte lokale Klartextressourcen. Registry,
  Integritätsprüfung, strikter Platzhaltervertrag und Generator bleiben von
  der Importpipeline getrennt. Promptdateien werden ausschließlich im Author-
  Profil ausgeliefert; Learner und SCORM enthalten sie nicht. Die Entscheidung
  dokumentiert ADR-017.
- Der geführte ChatGPT-Inhaltsimport liest ausschließlich lokal ausgewählte
  Schema-v1-JSON-Dateien. Ein eigener Source-Adapter prüft alle Teile, bildet
  daraus einen gemeinsamen `ImportDraft` und übergibt erst eine vollständig
  gültige Session an Materializer und CourseLibraryService. Bild- und
  Chatverarbeitung bleiben außerhalb von EduTools; der kanonische JSON-Restore
  bleibt als getrennte ID-erhaltende Sicherungssemantik bestehen.
- Motivation besitzt einen getrennten, versionierten State. Die Lernserie wird
  nur durch vollständig abgeschlossene Sessions an lokalen Kalendertagen
  fortgeschrieben und beeinflusst weder Learning State noch Scheduler.

## Abgrenzung

Konkrete Datenmodelle, Frameworks, Build-Werkzeuge und Schnittstellen werden in der Foundation-Phase nicht festgelegt. Sie folgen aus überprüften Produktanforderungen und werden bei tragender Bedeutung in ADRs dokumentiert.
