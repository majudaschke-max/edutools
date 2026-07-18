# ADR-018: Statischer Mehrkurs-Katalog für öffentliche Browser-Learner

## Status

Accepted

## Context

ADR-007 definiert einen Learner-Build mit genau einem Kurs. Diese feste
Ausprägung bleibt für SCORM, private Einzelkursausgaben und austauschbare
Learner-Artefakte erforderlich. Für den öffentlichen Pages-Learner sollen
jedoch mehrere bewusst freigegebene, nicht personenbezogene Kurse gemeinsam
auswählbar sein und jeweils einen stabilen Direktlink besitzen.

Die Author-App ist eine statische Browseranwendung. Ohne Backend oder
GitHub-API kann sie keinen Repository- oder Pages-Release verändern. Eine
lokale Kursbibliothek wäre außerdem weder geräteübergreifend noch über einen
stabilen öffentlichen Link erreichbar.

## Decision

- Learner-Profile unterstützen zwei gegenseitig exklusive Varianten:
  `course.file` für genau einen Kurs oder `courseCatalog.entries` für einen
  statischen öffentlichen Katalog.
- Jedes Katalogelement besitzt eine explizite, URL-sichere und nach der ersten
  Veröffentlichung unveränderliche `publicationId`. Sie gehört zum
  Deployment, nicht zum kanonischen Course Schema.
- Der Build validiert alle kanonischen Kursdateien, lehnt doppelte
  Veröffentlichungs- und Kurs-IDs ab, schreibt sie unter
  `data/courses/<publicationId>.json` und erzeugt daraus deterministisch
  `data/courses/index.json`.
- Der Direktlink verwendet den Queryparameter `course`; der bestehende
  Hash-Router bleibt für App-Routen zuständig:
  `?course=<publicationId>#/dashboard`.
- Ohne gültigen Queryparameter zeigt der Katalog-Learner eine kleine
  Learner-only-Kursauswahl. Unbekannte oder entfernte IDs fallen nicht still
  auf einen anderen Kurs zurück.
- Die Author-App bereitet nach einem ausdrücklichen Öffentlichkeitshinweis
  ausschließlich den bestehenden kanonischen JSON-Export vor. Die Aufnahme in
  ein versioniertes Katalogprofil und der Pages-Release bleiben ein separater,
  kontrollierter Repository-Prozess.
- Learning State, Motivation und Lernbereich verwenden weiter die stabile
  `deploymentId` und `courseId`. Der frühere Lernbereichsschlüssel wird
  kopierend und idempotent in den deployment- und kursbezogenen Namespace
  übernommen.
- Einzelkursprofile, Author-SCORM-Vorlage, SCORM-Generator, Manifest,
  API-Adapter und Runtime bleiben unverändert. Ein SCORM-ZIP enthält weiterhin
  genau einen Kurs und keinen Browser-Katalog.

## Consequences

### Positive Folgen

- Mindestens drei bewusst veröffentlichte Kurse können in einer gemeinsamen
  Pages-Learner-App angeboten werden.
- Titeländerungen brechen einen stabilen Direktlink nicht.
- Kursupdates mit stabiler Kurs- und Wortidentität erhalten lokale
  Fachzustände und beeinflussen keine anderen Kurse.
- Der Learner erhält weder Author-Kursbibliothek noch Import- oder
  Exportmodule.
- SCORM-only-Kurse werden nicht automatisch öffentlich.

### Negative Folgen und Risiken

- Alle Katalog- und Kursdateien auf GitHub Pages sind öffentlich einsehbar.
  Ein schwer erratbarer Link ist keine Zugriffskontrolle.
- Das Hinzufügen, Aktualisieren oder Entfernen eines Browser-Kurses benötigt
  weiterhin einen bewussten Build- und Releaseprozess.
- Eine versehentlich geänderte `publicationId` bricht den Direktlink; eine
  geänderte `courseId` trennt den bisherigen Lernstand absichtlich ab.
- Entfernte Kurse löschen lokale Fachzustände nicht automatisch und können
  verwaiste Browserdaten hinterlassen.

## Alternatives considered

- Eine lokale Learner-Kursbibliothek wurde verworfen, weil sie nicht
  geräteübergreifend ist und keine stabilen öffentlichen Links erzeugt.
- Ein eigener Learner-Build pro Kurs wurde verworfen, weil er keine gemeinsame
  Auswahl bietet und Build-/Mountprofile mit wachsender Kurszahl vervielfacht.
- Automatisches GitHub-Publishing aus der Author-App wurde wegen fehlender
  Authentisierung, Datenschutzrisiken und statischer Architektur verworfen.
- Titelbasierte Slugs wurden verworfen, weil Umbenennungen Links brechen.
- Ein universeller Author-/Learner-Build wurde erneut verworfen; positive
  Dateipläne bleiben die Auslieferungsgrenze.

## Date

2026-07-18
