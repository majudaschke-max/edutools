# Implementation Plan

Ticket: `multi-course-browser-and-scorm`

## Scope Lock

Implementiert wird ausschließlich der in `multi-course-browser-and-scorm-spec.md` freigegebene statische Mehrkurs-Pages-Learner einschließlich bewusster Author-Vorbereitung und kursbezogener Zustände. Der bestehende Einzelkurs-Build und der individuelle SCORM-Export werden nur durch Regressionstests berührt.

Ausdrücklich gesperrt sind automatische GitHub-Veröffentlichung, Login, Cloud, Synchronisierung, PWA, Course-Schema-Änderungen, Importrefactoring, Lernlogikänderungen und jede Änderung an SCORM-Runtime, Manifest oder API-Adapter.

Entdeckte Nebenfehler werden dokumentiert und nicht nebenbei behoben. Eine Abweichung von Profilform, Direktlink oder Storage-Migration erfordert vor Produktcode eine Aktualisierung und erneute Freigabe der Spec.

## Schritt 1 – Architekturentscheidung und Profilvertrag festschreiben

Betroffene Dateien:

- `docs/architecture/adr/ADR-018-static-multi-course-browser-catalog.md` (neu)
- `docs/architecture/adr/README.md`
- `docs/architecture/ARCHITECTURE.md`
- `apps/vocabulary-trainer/build/build-profile-schema.js`
- `apps/vocabulary-trainer/build/build-profile-validator.js`
- `apps/vocabulary-trainer/profiles/learner.example.json`
- `apps/vocabulary-trainer/profiles/production/learner.production.json`

Änderung:

- ADR-007 rückwärtskompatibel um eine explizite Katalogvariante ergänzen, ohne die Einzelkurs- und SCORM-Regeln aufzuheben.
- Im Profilschema genau eine von `course.file` oder `courseCatalog.entries[]` erlauben.
- Pro Katalogeintrag eine stabile URL-sichere `publicationId` und einen relativen Kursdateipfad verlangen.
- Leere Kataloge, unbekannte Felder, absolute/ausbrechende Pfade, doppelte IDs, doppelte Kurs-IDs und gleichzeitig gesetzte Varianten konkret ablehnen.
- Nur neutrale, lizenzfreie Beispielbezeichnungen in Repository-Profilen verwenden.

Tests:

- neue Positiv- und Negativfälle in `apps/vocabulary-trainer/tests/static-build.test.mjs`,
- bestehende Einzelkurs- und SCORM-Profiltests unverändert grün,
- Profilfehler nennen Feld und betroffenen Katalogeintrag.

Reale QA:

- Noch keine Produkt-QA; Profilfixtures manuell gegen Spec und ADR lesen.

Risiko:

- Eine permissive Union könnte versehentlich Mischprofile akzeptieren oder Einzelkursprofile brechen.

Rollback:

- Katalogzweig und ADR entfernen; bestehende `course.file`-Validierung unverändert wiederherstellen.

## Schritt 2 – Deterministischen Katalog-Build implementieren

Betroffene Dateien:

- `apps/vocabulary-trainer/build/build-vocabulary-trainer.js`
- `apps/vocabulary-trainer/build/build-manifest.js`
- `apps/vocabulary-trainer/build/build-file-plan.js`
- `apps/vocabulary-trainer/build/release-set-validator.js`
- `apps/vocabulary-trainer/src/runtime/deployment-profile.json` (generierte Fixture/Quelle nur gemäß bestehender Buildkonvention)
- `apps/vocabulary-trainer/tests/fixtures/browser-catalog/course-a.json` (neu, neutral)
- `apps/vocabulary-trainer/tests/fixtures/browser-catalog/course-b.json` (neu, neutral)
- `apps/vocabulary-trainer/tests/fixtures/browser-catalog/course-c.json` (neu, neutral)
- `apps/vocabulary-trainer/tests/multi-course-browser.test.mjs` (neu)
- `apps/vocabulary-trainer/tests/static-build.test.mjs`
- `apps/vocabulary-trainer/tests/release.test.mjs`

Änderung:

- Alle Kursdateien kanonisch validieren und geordnet als `data/courses/<publicationId>.json` ausgeben.
- `data/courses/index.json` deterministisch aus den validierten Kursen erzeugen; keine manuell duplizierten Metadaten.
- Runtimeprofil der Katalogvariante nur auf den Index verweisen lassen.
- Buildmanifest, Hashes und Releasevalidierung für variable, aber explizit geplante Katalogdateien erweitern.
- Einzelkurs-Output `data/course.json` unverändert lassen.
- Produktbuilds weiterhin gegen Testfixtures, lokale Pfade, private Artefakte und Author-Module absichern.

Tests:

- Build mit drei Kursen, stabiler Sortierung und vollständigem Index,
- Index-Metadaten stimmen mit jeder Kursdatei überein,
- fehlende/ungültige Kursdatei und Identitätsduplikate blockieren den Build,
- zwei aufeinanderfolgende Builds sind strukturell reproduzierbar,
- Einzelkurs-Learner und SCORM enthalten weiterhin genau `data/course.json`,
- Katalog-Learner enthält keine Author-, Import- oder SCORM-Generator-Module.

Reale QA:

- Katalog-Build statisch über HTTP aus Repository-Unterpfad laden; Network-Panel bestätigt ausschließlich relative 200-Antworten.

Risiko:

- Dynamische Dateilisten können bestehende positive Buildgrenzen unbemerkt aufweichen.

Rollback:

- Katalog-Builderzweig entfernen; feste Einzelkurs-Dateipläne und Validatoren beibehalten.

## Schritt 3 – Learner-only-Kataloglaufzeit und Direktlinks ergänzen

Betroffene Dateien:

- `apps/vocabulary-trainer/src/runtime/published-course-catalog.js` (neu)
- `apps/vocabulary-trainer/src/runtime/published-course.js`
- `apps/vocabulary-trainer/src/runtime/deployment-profile.js`
- `apps/vocabulary-trainer/src/runtime/deployment-capabilities.js`
- `apps/vocabulary-trainer/src/app.js`
- `apps/vocabulary-trainer/src/core/router.js`
- `apps/vocabulary-trainer/src/views/published-course-library-view.js` (neu)
- `apps/vocabulary-trainer/src/index.html`
- `apps/vocabulary-trainer/src/styles/content.css`
- `apps/vocabulary-trainer/src/styles/responsive.css`
- `apps/vocabulary-trainer/tests/multi-course-browser.test.mjs`
- `apps/vocabulary-trainer/tests/router.test.mjs`
- `apps/vocabulary-trainer/tests/views.test.mjs`

Änderung:

- Katalogschema und ausgewählte Kursdatei strikt validieren.
- `?course=<publicationId>` vor der App-Initialisierung auswerten; interne Navigation bleibt hashbasiert.
- Ohne gültige Auswahl die neue Learner-only-Route `#/course-select` mit semantischer Kursliste rendern.
- Kurswechsel ohne parallele Runtimes durchführen: aktive Session-, Audio-, Delivery- und View-Runtimes wie beim bestehenden Reinitialisieren sauber zerstören und für den ausgewählten Kurs neu aufbauen.
- Unbekannte oder entfernte ID verständlich behandeln und niemals still auf einen anderen Kurs wechseln.
- Capability für veröffentlichte Kursauswahl hinzufügen, ohne Author-Kursverwaltung zu aktivieren.
- `Kurs wechseln` nur in der Katalogvariante anzeigen.

Tests:

- Direktlink öffnet richtigen Kurs; Reload und Hash-Routen bleiben stabil,
- fehlender Parameter zeigt Auswahl, unbekannter Parameter zeigt Fehler plus Auswahl,
- Browser-Zurück/-Vorwärts zwischen Auswahl und Kurs funktioniert,
- mehrfacher Kurswechsel erzeugt keine doppelten Eventhandler oder Runtimes,
- lange Titel und drei Kurskarten bleiben semantisch und responsiv,
- Einzelkurs- und SCORM-Start umgehen den Katalogpfad vollständig.

Reale QA:

- veröffentlichungsnaher Build bei 375 × 812 und 1440 × 900: Auswahl, drei Direktlinks, Reload, Zurück/Vorwärts, Konsole und Netzwerk prüfen.

Risiko:

- Reinitialisierung kann alte Runtime-Listener zurücklassen oder eine explizite Direktlinkauswahl durch lokale Auswahl überschreiben.

Rollback:

- Katalogroute und -loader entfernen; Einzelkurs-Initialisierung und bestehende Router-Tabelle wiederverwenden.

## Schritt 4 – Kursbezogene lokale Zustände und Aktualisierung absichern

Betroffene Dateien:

- `apps/vocabulary-trainer/src/core/storage.js`
- `apps/vocabulary-trainer/src/core/learning-scope.js`
- `apps/vocabulary-trainer/src/app.js`
- `apps/vocabulary-trainer/tests/core.test.mjs`
- `apps/vocabulary-trainer/tests/multi-course-browser.test.mjs`
- `apps/vocabulary-trainer/tests/motivation.test.mjs`

Änderung:

- Zuletzt ausgewählten Katalogkurs deploymentbezogen speichern, ohne einen expliziten Direktlink zu überschreiben.
- Lernbereichsauswahl in den vorhandenen deployment- und kursbezogenen Storage-Namespace überführen.
- Alten `edutools:learning-scope:<courseId>`-Wert einmalig defensiv lesen, in den neuen Schlüssel kopieren und danach idempotent behandeln; keinen globalen Reset durchführen.
- Kursupdate mit stabiler `courseId`, Wort-IDs und höherer `contentVersion` gegen Lernstand, Motivation, Markierungen, Wiederholungen und Lernbereich testen.
- Entfernen eines Katalogeintrags löscht keine lokalen Fachzustände.

Tests:

- drei Kurse besitzen getrennte Learning-, Motivation- und Scope-Schlüssel,
- wiederholte Migration erzeugt keine Dubletten und verliert keine Werte,
- beschädigter Zustand eines Kurses beeinflusst die anderen nicht,
- Update eines Kurses erhält dessen Zustand und verändert keinen anderen,
- Browserstorage-Ausfall verwendet bestehenden sicheren Fallback.

Reale QA:

- In drei Kursen unterschiedliche Units wählen und Sessions abschließen; nach Reload, Kurswechsel und Update gezielt Local-Storage-Schlüssel sowie sichtbare Werte vergleichen.

Risiko:

- Eine fehlerhafte Scope-Migration kann die letzte Unit vergessen oder zwischen Deployments teilen.

Rollback:

- Neuen Scope-Key nur lesend ignorieren und alten kursbezogenen Key weiterverwenden; keine Werte löschen.

## Schritt 5 – Dritten Author-Ausgabekanal ehrlich ergänzen

Betroffene Dateien:

- `apps/vocabulary-trainer/src/views/course-builder-view.js`
- `apps/vocabulary-trainer/src/course-library/course-runtime.js`
- `apps/vocabulary-trainer/src/import/course-exporter.js`
- `apps/vocabulary-trainer/src/styles/authoring.css`
- `apps/vocabulary-trainer/src/styles/responsive.css`
- `apps/vocabulary-trainer/tests/course-library.test.mjs`
- `apps/vocabulary-trainer/tests/views.test.mjs`
- `docs/deployment/GITHUB_PAGES.md`
- `apps/vocabulary-trainer/README.md`

Änderung:

- Neben JSON-Sicherung und SCORM einen klar getrennten Bereich `Browser-Kurs für Veröffentlichung vorbereiten` ergänzen.
- Bestehenden kanonischen Course Export wiederverwenden; kein neues Dateiformat und keine `publicationId` im Kursmodell.
- Vor Download eine knappe ausdrückliche Bestätigung zu öffentlicher Abrufbarkeit, neutralen Titeln, fehlenden personenbezogenen Daten und fehlenden Lehrwerksbildern verlangen.
- Nach Download erklären, dass erst die manuelle Aufnahme in das Repository-Profil und ein Pages-Release veröffentlicht.
- SCORM-Beschriftung, Eventhandler und Generatorpfad nicht ändern.

Tests:

- Browser- und SCORM-Ausgabe sind getrennt beschriftet und nativ bedienbar,
- Browser-Vorbereitung benötigt bewusste Bestätigung und nutzt den bestehenden Exporter,
- kein Netzrequest, GitHub-Aufruf oder automatische Katalogänderung,
- SCORM-only-Kurs wird nicht in ein Profil oder den Pages-Build geschrieben,
- Course-Builder-, JSON-Export- und SCORM-Regressionstests bleiben grün.

Reale QA:

- Author bei 375 × 812 und 1440 × 900: Hinweis lesen, abbrechen, bestätigen, Artefakt herunterladen; getrennt reales SCORM-ZIP erzeugen und validieren.

Risiko:

- Die neue Aktion kann trotz Hinweis als unmittelbare Veröffentlichung missverstanden werden.

Rollback:

- Browser-Vorbereitungsbereich entfernen; bestehende JSON-Sicherung und SCORM-Ausgabe bleiben unangetastet.

## Schritt 6 – Release-, Datenschutz- und End-to-End-Gates ausführen

Betroffene Dateien:

- `docs/development/regression-matrix.md`
- `docs/development/release-checklist.md`
- `docs/deployment/GITHUB_PAGES.md`
- `apps/vocabulary-trainer/docs/PRD.md`
- `apps/vocabulary-trainer/README.md`
- `scripts/regression-check.mjs`
- `scripts/validate-release.mjs`
- `spec/active/multi-course-browser-and-scorm-review.md` (später neu)
- `spec/active/multi-course-browser-and-scorm-final-validation.md` (später neu)

Änderung:

- Öffentlichen Katalogworkflow, stabile IDs, Kursupdates, Entfernen und SCORM-Unabhängigkeit dokumentieren.
- Releasecheck um explizite Katalogdateiliste, lokale Pfade, Secrets und verbotene/private Artefakte erweitern, ohne Inhaltsprüfung vorzutäuschen.
- Regression-Matrix um die realen Mehrkursabläufe ergänzen.
- Code Review und Final Validation als getrennte Harness-Artefakte erstellen.

Tests:

- vollständige bestehende Suite,
- Clean Author-, Einzelkurs-Learner-, Mehrkurs-Pages- und SCORM-Builds,
- Releasevalidator, JSON-Validierung, Buildgrenzen und strukturell reproduzierbare Builds,
- keine absoluten lokalen Pfade, Testfixtures oder privaten Dateien im Release.

Reale QA:

- Pages online mit drei neutralen Kursen auf Desktop und Smartphone,
- jeder Direktlink, Reload und Home-Bildschirm-Link,
- kursgetrennter Lernstand vor und nach einem Kursupdate,
- ein SCORM-only-Kurs in einer neu angelegten ByCS-/Moodle-Aktivität,
- Browserkonsole und Network-Panel ohne unerwartete Fehler oder 404-Antworten.

Risiko:

- Technisch grüne Builds können dennoch personenbezogene oder urheberrechtlich problematische Kursinhalte enthalten.

Rollback:

- Pages-Release atomar auf das letzte validierte Einzelkurs-Release zurücksetzen; lokale Author-Kurse und SCORM-Artefakte bleiben davon unberührt.

## Neu anzulegende Dateien

- `docs/architecture/adr/ADR-018-static-multi-course-browser-catalog.md`
- `apps/vocabulary-trainer/src/runtime/published-course-catalog.js`
- `apps/vocabulary-trainer/src/views/published-course-library-view.js`
- `apps/vocabulary-trainer/tests/multi-course-browser.test.mjs`
- drei neutrale Course Fixtures unter `apps/vocabulary-trainer/tests/fixtures/browser-catalog/`
- nach Implementierung die Harness-Artefakte `multi-course-browser-and-scorm-review.md` und `multi-course-browser-and-scorm-final-validation.md`

## Unverändert zu lassen

- `apps/vocabulary-trainer/src/scorm-export/`
- `apps/vocabulary-trainer/src/delivery/`
- `apps/vocabulary-trainer/build/scorm-*`
- SCORM-Profile, Manifeststruktur und ZIP-Root,
- `apps/vocabulary-trainer/src/import/core/` und alle Importadapter,
- Course Schema sowie stabile Kurs-, Unit- und Wort-IDs,
- Scheduler, Lernbewertung, Quiz-, Writing- und Sessionlogik,
- Motivation und XP-Regeln,
- Author CourseLibraryService und dessen bestehende Persistenz.

## Build- und Release-Auswirkungen

- Neue rückwärtskompatible Learner-Katalogvariante und eine neue ADR.
- Pages-Root wechselt erst nach vollständiger QA vom Einzelkursprofil auf das explizite Katalogprofil.
- Einzelkurs-Learner bleibt für SCORM-Template und andere feste Ausgaben erhalten.
- Ein Pages-Release enthält künftig Katalogindex und explizit gelistete öffentliche Kursdateien; Größe wächst linear mit den Kursen.
- SCORM-Build und individueller Author-SCORM-Export bleiben unverändert und werden als Releaseblocker regressionsgeprüft.
- Veröffentlichung benötigt weiterhin einen bewussten Build, Review, Commit, Push und atomaren Pages-Release; die Author-App führt keinen dieser Schritte aus.

## Offene Planfragen

Keine technische Blockade. Vor der späteren ersten öffentlichen Befüllung müssen die neutralen Produktionskurstitel und dauerhaften `publicationId`-Werte durch den Product Owner ausdrücklich freigegeben werden. Reale private Namen sind nicht zulässig.

Status: APPROVED

Freigabe:

Plan technisch gegen die freigegebene Spec geprüft. `READY FOR USER APPROVAL`; vor ausdrücklicher Nutzerfreigabe darf Schritt 1 nicht implementiert werden.
