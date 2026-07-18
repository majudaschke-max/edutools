# ADR-015: Lokale kalenderbasierte Lernserie

## Status

Accepted

## Context

Eine Lernserie soll regelmäßiges Lernen sichtbar machen, ohne Sessions am
selben Tag zu belohnen, mit fachlicher Wiederholungsplanung vermischt zu werden
oder Nutzerkonten und Synchronisierung vorauszusetzen.

## Decision

- Ein Lerntag qualifiziert sich erst nach einer vollständig abgeschlossenen
  Session mit mindestens einem bearbeiteten Wort.
- Der Tag wird aus der lokalen Kalenderzeit des Geräts als `YYYY-MM-DD`
  berechnet. Weitere Abschlüsse am selben Tag verändern die Serie nicht.
- Folgt der nächste lokale Kalendertag, steigt die aktuelle Serie um eins. Nach
  einer Lücke beginnt sie beim nächsten qualifizierenden Abschluss wieder bei
  eins; die längste Serie bleibt als Maximum erhalten.
- Motivation State Schema 2 speichert letzten qualifizierten lokalen Tag,
  Zeitstempel, aktive Gesamttage und Tagesbonus-Deduplizierung. Die Migration
  erhält bestehende XP, Level, Sessions und Lerntage.
- Ein täglicher Bonus von 5 XP wird höchstens einmal pro lokalem Datum und Kurs
  vergeben. Er verändert weder Learning State noch Scheduler.
- App-Start, Uhranzeige und reine Navigation mutieren die Serie nicht.

## Consequences

Mitternacht und Zeitzonenwechsel folgen bewusst dem Gerät. Es gibt keine
geräteübergreifende Synchronisierung, kein Streak-Freeze und keine
nachträgliche Rekonstruktion fehlender Tage.

## Date

2026-07-15
