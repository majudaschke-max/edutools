# ADR-005: Lokale Kursbibliothek und getrennte Kursdomänen

## Status

Accepted

Die Aktualisierung des statischen mitgelieferten Kurses wird durch
[ADR-006](ADR-006-versioned-bundled-course-content.md) präzisiert.

## Context

Der Vocabulary Trainer soll neben einem unveränderlichen mitgelieferten Kurs
eigene lokale Kurse aufnehmen. Kursinhalte ändern sich unabhängig von
fachlichem Lernstand und freiwilliger Motivation. Ein Kurswechsel darf diese
Domänen nicht vermischen. Die Lösung soll spätere EduTools-Inhaltsbibliotheken
vorbereiten, ist aber noch nicht praktisch genug erprobt, um in den gemeinsamen
Core verschoben zu werden.

## Decision

- Eigene Kursinhalte verwenden ein kanonisches, versioniertes Kursmodell mit
  stabilen Kurs-, Unit- und Wort-IDs.
- Das Modell unterscheidet die Herkunft über `sourceType`: `bundled` ist nicht
  editierbar; `own`, `imported` und `duplicated` bleiben vollständig editierbar.
  Importierte Dateien können sich nicht selbst als mitgelieferter Kurs
  klassifizieren.
- Der mitgelieferte Kurs bleibt eine statische Ressource und wird für
  Bibliotheksansicht, Export und Duplikation nur in das kanonische Modell
  adaptiert. Seine versionierte Aktualisierung folgt ADR-006.
- Eigene Kurse werden unter
  `edutools:vocabulary-trainer:course-library` gespeichert; der aktive Kurs
  zusätzlich unter `edutools:vocabulary-trainer:active-course`.
- Fachlicher Lernstand und Motivation behalten ihre getrennten,
  kursbezogenen Schlüssel
  `edutools:vocabulary-trainer:<courseId>:learning-state` und
  `edutools:vocabulary-trainer:<courseId>:motivation-state`.
- Änderungen an Worttexten behalten die Wort-ID und damit die Zuordnung
  vorhandener Lernstände. Neue IDs gelten als neue Inhalte.
- Archivierte Units und Wörter bleiben im Kursinhalt und behalten ihre IDs,
  werden aber in keinen Lernmodus übernommen.
- Importvorschauen verändern keinen Kurs. Bestätigte Importe werden auf einer
  Kopie angewendet, vollständig validiert und als kompletter Kurszustand
  gespeichert.

Kursinhalte, fachlicher Lernstand und Motivation werden getrennt gespeichert
und ausschließlich über stabile Kurs- und Inhalts-IDs miteinander verknüpft.

## Consequences

### Positive Folgen

- Kurswechsel können Lernstand, Motivation, Audio und flüchtige Sessions
  eindeutig voneinander trennen.
- Eigene Inhalte lassen sich lokal sichern, übertragen und weiterbearbeiten.
- Archivierung schützt vorhandene Referenzen besser als sofortiges Löschen.
- Der Importablauf kann später anhand realer Anforderungen weiterer Apps
  überprüft werden.

### Negative Folgen und Risiken

- Browserdaten sind keine dauerhafte Sicherung; Nutzerinnen und Nutzer müssen
  regelmäßig JSON-Exporte erstellen.
- Entfernte Inhalts-IDs können verwaiste Lern- oder Motivationsreferenzen
  hinterlassen, die bewusst nicht automatisch gelöscht werden.
- Das Schema und die Importlogik bleiben vorerst app-spezifisch.

## Alternatives considered

- Kursinhalte gemeinsam mit Lernstand und Motivation zu speichern wurde wegen
  hoher Vermischungs- und Datenverlustrisiken verworfen.
- Den mitgelieferten Kurs zur Laufzeit zu überschreiben wurde zugunsten einer
  unveränderlichen, sicheren Rückfalloption verworfen.
- Eine sofortige Auslagerung in den EduTools Core wurde als verfrüht verworfen.

Die Kursbibliothek und der Import sind als Grundlage für spätere
EduTools-Anwendungen konzipiert. Eine Überführung in einen gemeinsamen Core
erfolgt erst nach nachgewiesener Wiederverwendbarkeit.

## Date

2026-07-14
