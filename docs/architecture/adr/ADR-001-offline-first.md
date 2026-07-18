# ADR-001: Offline First

## Status

Accepted

## Context

EduTools soll ohne unnötige technische Hürden im Unterricht und zu Hause nutzbar sein. Verbindungen können instabil sein; zugleich sind Datenschutz und ein einfacher Zugang zentrale Produktprinzipien.

## Decision

- Anwendungen werden möglichst lokal ausgeführt.
- Daten werden standardmäßig lokal gespeichert.
- Für die Nutzung ist keine Anmeldung erforderlich.
- Unnötige Serverdienste werden nicht eingesetzt.

## Consequences

### Positive Folgen

- Zentrale Funktionen bleiben ohne stabile Netzwerkverbindung verfügbar.
- Es entstehen weniger Datenschutz- und Betriebskomplexität.
- Der Einstieg bleibt niedrigschwellig.

### Negative Folgen und Risiken

- Daten werden nicht automatisch zwischen Geräten synchronisiert.
- Das Löschen lokaler Browserdaten kann gespeicherte Fortschritte entfernen.
- Optionale Online-Funktionen müssen klar abgegrenzt werden.

## Alternatives considered

- Ein verpflichtendes Konto mit Cloud-Speicherung wurde wegen zusätzlicher Hürden, personenbezogener Daten und Serverabhängigkeit verworfen.
- Eine vollständig serverseitige Anwendung wurde wegen der Offline-Anforderung verworfen.

## Date

2026-07-13
