# ADR-016: Universelle Importpipeline vor dem kanonischen Kursmodell

## Status

Accepted

## Context

Der Vocabulary Trainer besitzt zwei bewährte, aber bisher getrennt
orchestrierte Importwege: tabellarische Wortlisten und die Wiederherstellung
kanonischer EduTools-JSON-Kurssicherungen. Weitere Inhaltsquellen würden ohne
eine gemeinsame Grenze Parser-, Validierungs-, Vorschau- und Speicherlogik
erneut miteinander koppeln. Gleichzeitig dürfen stabile IDs einer
Kurssicherung nicht wie neu extrahierte Fachinhalte behandelt werden.

## Decision

- Inhaltsquellen erzeugen zuerst einen flüchtigen, nicht exportierbaren
  `ImportDraft`. Er enthält ausschließlich Kursname, Sprachen, Units und
  Wortinhalte, aber keine IDs, Zeitstempel oder technischen Kursmetadaten.
- Pure Normalisierung und ein Draft-Validator liefern strukturierte Issues mit
  Code, Phase, Pfad, Quellposition, verständlicher Meldung und Maßnahme.
- Eine injizierte Adapter-Registry wählt Source-Adapter ohne formatspezifische
  Verzweigung im Orchestrator. Neue Inhaltsquellen benötigen nur einen Adapter
  für den bestehenden `content`-Payload.
- Der gemeinsame Orchestrator trennt Vorbereitung, Planung,
  Materialisierung und Commit. Ausschließlich der Materializer erzeugt aus
  einem `ImportDraft` kanonische IDs und technische Defaults.
- EduTools-JSON bleibt eine Wiederherstellung und verwendet einen
  `CourseBackupCandidate` im Payload-Modus `restore`. Beim Ersetzen bleiben
  IDs erhalten; beim Import als Kopie werden Kurs-, Unit- und Wort-IDs neu
  erzeugt.
- Der bestehende Course-Validator und der `CourseLibraryService` bleiben die
  letzten Freigabe- und Speichergrenzen.
- Die bisherigen Importfunktionen bleiben vorerst als Kompatibilitätsfassaden
  erhalten. Views, Routes, Storage, Course Schema und Exportformat ändern sich
  nicht.
- Der geführte ChatGPT-Weg verwendet einen Content-Adapter für eine geordnete
  Liste lokaler Schema-v1-JSON-Dateien. Der Adapter validiert Dateigrenzen und
  gemeinsame Kursidentität, führt Unit-Teile deterministisch zusammen und
  liefert exakt einen `ImportDraft`; der Orchestrator selbst benötigt dafür
  keine formatspezifische Verzweigung.
- Exakte Batch-Duplikate bleiben bis zum ImportPlan erhalten. Eine sichtbare
  Entscheidung wird ausschließlich beim Materialisieren angewendet. Ein
  Fehler in einem Dateiteil verhindert die Planerzeugung und damit jeden
  Teilcommit.
- Die Importpipeline bleibt vollständig im Author-Dateiplan. Learner und
  SCORM enthalten weiterhin keinen Importcode.
- Die Verträge werden im bestehenden JavaScript-Projekt über `@ts-check` und
  JSDoc typisiert. Eine Klassenhierarchie, ein Framework oder ein zweites
  persistentes CourseModel wird nicht eingeführt.

## Consequences

### Positive Folgen

- CSV, TSV und TXT nutzen bereits dieselbe normalisierte fachliche Grenze.
- JSON-Wiederherstellung teilt den Lebenszyklus, ohne ihre ID-Semantik zu
  verlieren.
- Künftige KI-, Anki-, Quizlet-, Markdown- oder Arbeitsmappenadapter können
  hinzukommen, ohne den Orchestrator zu verändern.
- Technische Kursfelder bleiben unter ausschließlicher Kontrolle von EduTools.
- Mehrteilige fachliche Exporte können transaktional zu einem Kurs
  zusammengeführt werden, ohne den ID-erhaltenden Restore-Modus umzudeuten.
- Strukturierte Issues können später von einer gemeinsamen Vorschau verwendet
  werden, ohne Meldungstexte parsen zu müssen.

### Negative Folgen und Risiken

- Die bestehende tabellarische Preview-Struktur bleibt vorübergehend als
  Kompatibilitätsmodell bestehen. Sie wird intern aus dem `ImportDraft`
  gespeist, kann aber erst in einem späteren Sprint vollständig durch einen
  quellenunabhängigen `ImportPlan` ersetzt werden.
- Canonical-Course-Validator und Draft-Validator bilden bewusst zwei
  verschiedene Grenzen und müssen bei fachlichen Feldlimits konsistent
  gehalten werden.
- Neue Binärformate benötigen weiterhin eine eigene Sicherheits-, Lizenz- und
  Buildgrößenentscheidung; die Adapterarchitektur allein macht sie nicht
  automatisch unterstützt.

## Alternatives considered

- Ein zweites persistentes `CourseModel` wurde verworfen, weil es das
  kanonische Kursmodell duplizieren und technische Felder in untrusted
  Importquellen verlagern würde.
- Eine gemeinsame JSON-Struktur für Inhaltsimport und Backup wurde verworfen,
  weil dadurch entweder stabile Restore-IDs verloren gingen oder externe
  Quellen technische Kursmetadaten liefern müssten.
- Eine Klassen- oder Pluginhierarchie wurde verworfen, weil die lokale,
  bundlerfreie App mit kleinen Funktionen und explizit injizierten
  Adapterobjekten vollständig erweiterbar bleibt.

## Date

2026-07-16
