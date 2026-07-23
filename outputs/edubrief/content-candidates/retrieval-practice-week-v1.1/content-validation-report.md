# Content-Validierungsbericht

Kandidat: `1.1.0-candidate`  
Status: `review-candidate`

## Technische Validierung

- `retrieval-practice-week.content.json` ist syntaktisch valides JSON.
- fünf Karten und fünf eindeutige zusätzliche Praxis-IDs sind vorhanden.
- jede Karte besitzt genau eine zusätzliche fachübergreifende Idee.
- alle Pflichtfelder der neuen Ideen sind vorhanden und typgerecht.
- Vorbereitungs- und Unterrichtszeiten sind nicht negativ und jeweils aufsteigend.
- jede Idee referenziert die primäre Fundusaussage ihrer Karte.
- keine neue Fortbildungs-/Lehrerbildungsvariante wurde ergänzt.
- Kandidatenstatus und Kandidatenversion sind ausdrücklich gesetzt.

## Baseline-Vergleich

Nach Entfernung ausschließlich von `candidateMetadata` und `additionalPracticeIdeas` ist der verbleibende JSON-Inhalt strukturell identisch mit der veröffentlichten Contentdatei 1.0.0. Das veröffentlichte Distribution-Paket selbst wurde nicht verändert.

## Nicht Bestandteil dieser Validierung

Die technische Prüfung ist keine wissenschaftliche, redaktionelle oder Releasefreigabe. Die fünf didaktischen Übertragungen benötigen externe Prüfung.
