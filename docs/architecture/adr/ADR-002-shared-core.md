# ADR-002: Gemeinsamer Core

## Status

Accepted

## Context

Mehrere EduTools-Apps werden voraussichtlich ähnliche Grundlagen benötigen. Eine zu frühe gemeinsame Abstraktion könnte jedoch Anforderungen vereinheitlichen, bevor sie verstanden und praktisch erprobt sind.

## Decision

- Gemeinsame, bewährte Funktionen können in einen EduTools Core ausgelagert werden.
- Neue Apps dürfen zunächst eigenständig entstehen.
- Gemeinsame Abstraktionen werden nicht vorschnell eingeführt.

## Consequences

### Positive Folgen

- Erprobte Grundlagen können konsistent wiederverwendet werden.
- Apps behalten in frühen Phasen die nötige fachliche Beweglichkeit.
- Der Core bleibt klein und an realen Anforderungen ausgerichtet.

### Negative Folgen und Risiken

- In frühen Phasen kann vorübergehend ähnliche Logik in mehreren Apps existieren.
- Der richtige Zeitpunkt für eine Auslagerung erfordert bewusste Prüfung.

## Alternatives considered

- Ein vollständig vorab entworfener Core wurde wegen des hohen Risikos unbewährter Abstraktionen verworfen.
- Vollständig isolierte Apps wurden verworfen, weil bewährte gemeinsame Lösungen langfristig unnötig dupliziert würden.

## Date

2026-07-13
