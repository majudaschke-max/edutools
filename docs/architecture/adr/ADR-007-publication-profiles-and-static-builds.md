# ADR-007: Veröffentlichungsprofile und statische Builds

## Status

Accepted

## Context

Der Vocabulary Trainer besitzt zwei unterschiedliche Nutzungskontexte. Im
Autorenkontext werden Kurse erstellt, bearbeitet, importiert und exportiert. In
einer veröffentlichten Lernanwendung soll dagegen genau ein freigegebener Kurs
ohne Autorenwerkzeuge, Kurswechsel oder Quellrepository funktionieren. Eine
rein visuelle Ausblendung würde Autorenmodule und Verwaltungsrouten weiterhin
ausliefern. Direkte Hash-Aufrufe könnten außerdem in unklare Zustände führen.

Mehrere Veröffentlichungen können unter derselben Origin laufen. Die bisherige
lokale Speicherung war nicht nach Deployment getrennt und könnte deshalb
Lernstände gleichnamiger Kurse vermischen.

## Decision

- Ein streng validiertes JSON-Veröffentlichungsprofil legt Modus,
  `deploymentId`, App-Titel, Standardroute, optionale Lernfunktionen und
  Ausgabeverzeichnis fest.
- `author` erzeugt eine vollständige lokale Autorenanwendung. Course Builder,
  Kursbibliothek, CSV-/TSV-/TXT-Import sowie JSON-Import und -Export bleiben
  vollständig erhalten.
- `learner` bindet genau einen kanonisch validierten Vocabulary-Kurs ein. Der
  positive Build-Dateiplan liefert keine Kursbibliothek, keine Editoren, keine
  Import-/Exportmodule und kein Autoren-CSS aus.
- Eine zentrale Capability-Schnittstelle entscheidet zur Laufzeit über
  Navigation, Routen und optionale Lernfunktionen. Nicht verfügbare direkte
  Routen führen in einen verständlichen, zugänglichen Zustand statt auf eine
  leere oder teilweise aktive Autorenoberfläche.
- Autorenspezifische Module werden ausschließlich im Author-Modus dynamisch
  importiert. Ein Learner-Build enthält diese Module physisch nicht.
- Die Veröffentlichung ist ein rein statischer, dependency-freier Build. Sie
  schreibt zuerst in ein temporäres Verzeichnis, validiert Referenzen und
  Dateigrenzen und ersetzt das Ziel erst danach atomar. Ein fehlgeschlagener
  Build lässt den letzten gültigen Stand unverändert.
- Der Lernspeicher verwendet den Namespace
  `edutools:vocabulary:<deploymentId>:course:<courseId>:<dataType>`. Die stabile
  `deploymentId`, nicht Titel oder Ordnername, definiert die Identität einer
  Veröffentlichung.
- Beim ersten Start eines Author-Deployments werden bekannte alte lokale
  Schlüssel kopierend und idempotent in den neuen Namespace übernommen. Erst
  nach bestätigten Schreibvorgängen wird die Migration markiert; Quelldaten
  werden nicht automatisch gelöscht. Learner-Deployments übernehmen keine
  fremden Legacy-Daten.
- Das Build-Manifest ist deterministisch, enthält Profil, Modus, Kurs-ID,
  Features sowie sortierte Dateigrößen und SHA-256-Prüfsummen, aber keinen
  Zeitstempel.

## Consequences

### Positive Folgen

- Eine Lernveröffentlichung liefert nur die für Lernende erforderlichen
  Module und genau einen freigegebenen Kurs aus.
- Autorensystem und beliebig viele Learner-Deployments derselben Origin teilen
  weder Lernstand noch Motivation oder Kursbibliothek.
- Eigene, importierte und duplizierte Kurse bleiben ausschließlich im
  Author-Profil verwaltbar und werden durch Veröffentlichungen nie verändert.
- Builds sind reproduzierbar, lokal hostbar und für statisches Hosting in
  Unterordnern geeignet.
- Neue Ausprägungen werden über validierte Capabilities ergänzt, nicht über
  verstreute Modusabfragen.

### Negative Folgen und Risiken

- Eine geänderte `deploymentId` erzeugt absichtlich einen neuen lokalen
  Speicherraum. Wer sie versehentlich ändert, sieht den bisherigen Lernstand
  unter der neuen Veröffentlichung nicht.
- Hash-Routing bleibt erforderlich, weil ein generischer statischer Host keine
  serverseitigen SPA-Fallbacks garantiert.
- Ein Learner-Build ist eine konkrete Veröffentlichung; ein Kurswechsel
  erfordert einen neuen Build mit eigener Deployment-Identität.

## Alternatives considered

- Das bloße Ausblenden der Autorenoberfläche per CSS wurde verworfen, weil
  Code, Routen und Verwaltungsfunktionen weiterhin ausgeliefert würden.
- Ein universeller Build mit Laufzeit-Schalter wurde verworfen, weil er keine
  belastbare Auslieferungsgrenze schafft.
- Ein Backend- oder Cloud-Buildservice wurde verworfen; Offline-First und
  statisches Hosting bleiben verbindlich.
- Storage-Namespace nach Titel oder Kurs-ID allein wurde verworfen, weil beide
  zwischen verschiedenen Veröffentlichungen kollidieren können.

## Date

2026-07-14
