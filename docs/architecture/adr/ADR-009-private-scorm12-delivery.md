# ADR-009: Private SCORM-1.2-Auslieferung

## Status

Accepted

## Context

Lehrkräfte sollen einen selbst erstellten Vocabulary-Kurs als geschlossenes
ByCS-Lernpaket bereitstellen können, ohne schulbuchbezogene Inhalte öffentlich
über GitHub Pages auszuliefern. Detaillierte Vocabulary-Lernstände sind bereits
lokal und deploymentbezogen gespeichert.

## Decision

- SCORM 1.2 verpackt den bestehenden validierten Learner-Build und ist keine
  eigene Vocabulary-App oder Kopie des Cores.
- Ein striktes privates Profil benennt genau ein Learner-Profil, Paket-ID,
  Titel, Abschlussregel und private Ausgabedatei.
- CLI und Author-App verwenden dieselben kanonischen Module für
  SCORM-Manifest und deterministisches ZIP. Der Author-Build bettet dafür
  einen separat validierten Learner-Build als unveränderliche Vorlage ein.
- Der Browserexport ersetzt ausschließlich Kurs, Deployment- und
  Delivery-Metadaten in dieser Vorlage. Es entsteht weder eine zweite
  Lernanwendung noch parallele Vocabulary-Fachlogik.
- Ein isolierter Delivery-Adapter verwendet nur SCORM 1.2 und meldet höchstens
  `incomplete` beziehungsweise `completed`.
- Detaillierter Lernstand, Motivation und Wortergebnisse bleiben im bestehenden
  lokalen Storage. Das LMS erhält keine Scores, Namen oder Wortdaten.
- Private Kursdaten, Profile und ZIP-Dateien bleiben aus öffentlichem Git,
  GitHub Pages und öffentlichen Workflow-Artefakten ausgeschlossen.
- ZIP, XML- und technische Manifeste sind deterministisch und werden vor sowie
  nach dem atomaren Paketaustausch validiert.
- Der Browserexport validiert das vollständige Paket vor dem Download. Der
  SCO-Start bleibt exakt `index.html`; Hash-Routing beginnt erst innerhalb des
  Learners. LMS-Parameter und Parent-/Top-Navigation sind keine App-Schnittstelle.
- Ein Moodle-naher Testkanal bildet verschachtelte Player-/SCO-Frames,
  Pluginfile-Pfade und äußere `id`-/`scoid`-Parameter ab, ersetzt aber keine
  echte ByCS-Abnahme.
- IMS Content Packaging als eigenes Format, SCORM 2004, xAPI und LRS sind nicht
  Bestandteil dieser Entscheidung.

## Consequences

### Positive Folgen

- Dieselbe geprüfte Lernanwendung kann privat in einem LMS bereitgestellt werden.
- Einfache Aktivitätsabschlüsse sind möglich, ohne Detaildaten zu übertragen.
- Stabile Deployment-, Kurs- und Wort-IDs erhalten lokale Lernstände bei Updates.
- Öffentliche und private Auslieferungswege besitzen überprüfbare Dateigrenzen.

### Negative Folgen und Risiken

- Lokaler Detailstand wird nicht zwischen Geräten synchronisiert.
- Das LMS kann nur einen groben Abschlussstatus auswerten.
- SCORM ist kein DRM; ausgelieferte Kursdateien bleiben technisch einsehbar.
- Die reale ByCS-Kompatibilität muss mit jedem relevanten Plattformstand geprüft werden.

## Alternatives considered

- Ein eigener SCORM-Lernclient wurde wegen doppelter Lernlogik verworfen.
- `suspend_data`, Interactions oder Scores wurden wegen Datenschutz und
  widersprüchlicher Zustandsmodelle verworfen.
- Ein unabhängiger browserbasierter Paketierer wurde wegen doppelter Logik
  verworfen. Der umgesetzte Browserexport teilt die Paketierungsmodule mit dem
  CLI und verwendet dessen validierte Learner-Architektur.
- Öffentliche Pages-Kurse wurden für private schulbuchbezogene Inhalte verworfen.

## Date

2026-07-16 (für Patch 4.0.1 erweitert)
