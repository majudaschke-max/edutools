# ADR-003: Trennung von Code und Inhalten

## Status

Accepted

## Context

Dieselbe Anwendung soll unterschiedliche Lehrwerke und Kurse unterstützen. Fachliche Inhalte haben andere Änderungs-, Prüf- und Veröffentlichungszyklen als die Programmlogik.

## Decision

- Programmlogik, Kurskonfiguration und Vokabeldaten werden getrennt.
- Unterschiedliche Lehrwerke und Kurse verwenden dieselbe Anwendung.
- Schülerinnen und Schüler erhalten jeweils nur Zugriff auf den für sie veröffentlichten Kurs.

## Consequences

### Positive Folgen

- Inhalte können unabhängig von der Programmlogik gepflegt und validiert werden.
- Eine App kann mehrere Kurse und Lehrwerke bedienen.
- Veröffentlichte Kursumfänge lassen sich gezielt steuern.

### Negative Folgen und Risiken

- Datenstrukturen benötigen klare Schemata und Validierung.
- Die Bereitstellung getrennter Kursvarianten muss zuverlässig organisiert werden.
- Urheberrecht und Vertraulichkeit von Kursdaten bleiben vor jeder Veröffentlichung zu prüfen.

## Alternatives considered

- Fest im Code hinterlegte Inhalte wurden wegen schlechter Wartbarkeit und fehlender Wiederverwendbarkeit verworfen.
- Eine zentrale, für alle Lernenden sichtbare Kursdatenbank wurde wegen Zugriffs- und Datenschutzanforderungen verworfen.

## Date

2026-07-13
