# ADR-012: Zentrale Sprach-Registry und einheitlicher Kursdatei-Export

## Status

Accepted

## Context

Die bisherige Kurserstellung verlangte getrennte Sprachcodes, sichtbare Labels
und Speech-Locales. Diese technische Eingabe war fehleranfällig und wurde an
mehreren Stellen interpretiert. Gleichzeitig war der bestehende korrekte
JSON-Exporter nach Book Capture nicht als nächster fachlicher Schritt sichtbar.

## Decision

- Eine zentrale Registry ordnet einer gewählten Sprache Code, Standard-
  Speech-Locale und OCR-Modell zu.
- Normale Author-Formulare zeigen ausschließlich fachliche Sprachauswahlen.
  Technische Werte sind intern und höchstens in einem geschlossenen,
  nicht editierbaren Detailbereich sichtbar.
- Source und Target müssen unterschiedliche Registry-Einträge sein.
- Alle Download-Einstiege verwenden den vorhandenen kanonischen Kurs-Exporter.
  Es entsteht kein zweites JSON-Format und kein zweiter Serializer.
- Der Author-Build zeigt neutrale lokale Leerzustände. Technisch notwendige
  gebündelte Fallback-Inhalte werden nicht als eigener Kurs angeboten.
- Browserstimmen werden passend zur exakten Source-Locale gefiltert. Für
  britisches Englisch ist Daniel die bevorzugte Standardstimme; zusätzlich
  darf höchstens eine tatsächlich installierte, kuratierte weibliche Stimme
  erscheinen. Eddy, Flo und Grandma werden nicht angeboten.
- Ist keine geprüfte sichtbare Stimme verfügbar, bleibt der sichere
  sprachpassende Browserfallback aktiv. Eine gespeicherte, auf einem anderen
  Gerät fehlende Stimme fällt geräuschlos auf Daniel beziehungsweise den
  sicheren Fallback zurück.
- Learner- und Delivery-Dateipläne enthalten keine Author- oder Exportmodule.

## Consequences

Lehrkräfte können mit drei Pflichtfeldern beginnen; Kursnamen, Lehrwerke und
Verlage beeinflussen weder Sprache noch Export. Neue Sprachen benötigen genau
einen Registry-Eintrag. Nicht installierte OCR-Modelle müssen weiterhin
verständlich behandelt und für einen Author-Build bewusst gebündelt werden.
Kursdateien bleiben vollständig roundtrip-fähig, während Nutzungs-, Bild- und
Stimmendaten getrennt bleiben.

## Date

2026-07-16 (Stimmenauswahl in Sprint 4.0 präzisiert)
