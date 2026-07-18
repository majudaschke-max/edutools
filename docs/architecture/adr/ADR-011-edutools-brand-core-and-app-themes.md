# ADR-011: EduTools Brand Core und zentrale App-Themes

## Status

Accepted

## Context

Die fertige Gruppenpuzzle-App zeigt eine freundliche, pastellige und organische
Formsprache, besitzt aber eine eigenständige violette Farbidentität. Der
Vocabulary Trainer soll als Teil derselben EduTools-Produktfamilie erkennbar
sein, ohne diese Farbidentität zu kopieren. Author-, Learner-, Browser- und
SCORM-Auslieferungen müssen weiterhin dieselbe App darstellen.

## Decision

- Ein gemeinsamer Brand Core definiert semantische Rollen, Verläufe,
  Oberflächenlogik und das MJ-Autorensignet ohne Kurs- oder App-Namen in den
  Tokenbezeichnungen.
- Eine App aktiviert genau ein Theme statisch über `data-edutools-theme` auf
  dem HTML-Wurzelelement. Es gibt keinen Theme-Picker und keine Ableitung aus
  Kurs, Lehrwerk oder Sprache.
- Der Vocabulary Trainer verwendet Himmelblau, Mint, zurückhaltendes Türkis
  und kleine Apricot-Akzente. Violett bleibt nicht dominant.
- Semantische Statusfarben bleiben außerhalb der App-Themes stabil.
- Author, Learner, Browser und SCORM erhalten Brand Core und Vocabulary-Theme
  über denselben positiven Dateiplan.
- Die kleine MJ-Raute ist ein gemeinsames, nicht interaktives App-Shell-Element
  und wird pro App-Shell genau einmal ausgegeben.
- Zukünftige App-Farbrichtungen werden nur auf einer Development-only-Referenz
  dokumentiert. Nicht benötigte Themes werden nicht erzeugt oder ausgeliefert.
- Die Gruppenpuzzle-App bleibt unverändert; weder Code noch Assets werden
  übernommen.

## Consequences

### Positive Folgen

- Produktfamilie und App-Identität bleiben gleichzeitig erkennbar.
- Kontraste, Fokus, Komponenten und Buildgrenzen lassen sich zentral prüfen.
- Neue Apps können nach praktischer Bewährung ein eigenes kleines Theme
  ergänzen, ohne Lern- oder Komponentenlogik zu duplizieren.
- SCORM und statische Learner-Builds benötigen keine Laufzeit-Theme-Erkennung.

### Negative Folgen und Risiken

- Änderungen am Brand Core können mehrere Auslieferungsformen betreffen und
  benötigen vollständige Build- und Reflow-Prüfungen.
- Ein neues App-Theme muss alle Brand-Rollen vollständig und kontrastgeprüft
  definieren.
- Die technische Auslagerung weiterer Komponenten in einen gemeinsamen Core
  bleibt bis zur praktischen Bewährung zusätzlicher Apps bewusst begrenzt.

## Alternatives considered

- Eine violette Vocabulary-Farbwelt wurde wegen fehlender Unterscheidbarkeit
  zur Gruppenpuzzle-App verworfen.
- Kursabhängige Themes wurden wegen instabiler Markenidentität und zusätzlicher
  Laufzeitlogik verworfen.
- Vollständige Theme-Dateien für hypothetische Apps wurden wegen unnötiger
  Auslieferung und unbewährter Abstraktion verworfen.
- Kopieren von Jigsaw-Code oder Assets wurde ausdrücklich verworfen.

## Date

2026-07-15
