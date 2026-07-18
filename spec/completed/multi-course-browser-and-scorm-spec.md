# Mehrere Browser-Kurse und bestehender SCORM-Export

Ticket: `multi-course-browser-and-scorm`

## Problem

Die Author-App verwaltet mehrere lokale Kurse und kann jeden Kurs als EduTools-JSON oder eigenständiges SCORM-1.2-Paket ausgeben. Der öffentliche Pages-Learner wird dagegen gemäß ADR-007 derzeit mit genau einem fest gebundenen Kurs gebaut. Private Haushalte können deshalb nicht mehrere bewusst veröffentlichte Browser-Kurse in derselben Learner-App auswählen oder über stabile Direktlinks öffnen.

Die Author-App läuft vollständig statisch im Browser. Sie kann ohne Backend, GitHub-API oder Repository-Zugriff keinen Pages-Release verändern. Eine Schaltfläche darf daher nicht den Eindruck erwecken, ein lokaler Kurs werde unmittelbar online veröffentlicht.

## Ziel

Der Pages-Learner erhält zusätzlich zum bestehenden Einzelkurs-Profil eine statische Mehrkurs-Variante mit einem buildseitig erzeugten Kurskatalog. Ein veröffentlichter Kurs wird über eine stabile Veröffentlichungs-ID adressiert, erscheint in einer verständlichen Learner-Kursauswahl und kann direkt geöffnet werden.

Die Author-App stellt zwei fachlich und technisch unabhängige Ausgabekanäle dar:

1. Browser-Kurs für einen bewussten Pages-Release vorbereiten.
2. Unverändert ein eigenständiges SCORM-1.2-ZIP für ByCS oder Moodle erzeugen.

Eine Browser-Veröffentlichung ist ein zweistufiger Prozess: Die Author-App erzeugt nach ausdrücklichem Öffentlichkeitshinweis das kanonische Kursartefakt; erst ein separater Repository- und Pages-Release nimmt dieses Artefakt in den öffentlichen Katalog auf.

## Nutzermehrwert

Familien können mehrere Sprachkurse in einer gemeinsamen, mobilen Learner-App nutzen und jeden Kurs über einen wiederverwendbaren Link beziehungsweise einen Home-Bildschirm-Link öffnen. Lehrkräfte behalten den bewährten privaten SCORM-Workflow, ohne Kurse zusätzlich öffentlich bereitstellen zu müssen.

## Scope

- statischer, versionierter Browser-Kurskatalog für den Pages-Learner,
- mindestens drei gleichzeitig veröffentlichte Kurse,
- stabile Veröffentlichungs-ID und Direktlink je Browser-Kurs,
- Learner-Kursauswahl bei einem Aufruf ohne gültigen Kursparameter,
- getrennte lokale Lern-, Motivations- und Lernbereichszustände pro Deployment und Kurs,
- kontrolliertes Aktualisieren und Entfernen von Katalogeinträgen,
- eigener Author-Ausgabepfad zum Vorbereiten eines Browser-Kursartefakts mit Öffentlichkeitshinweis,
- unveränderter individueller SCORM-Export.

## Nicht-Ziele

- kein Login, keine Benutzerkonten und keine Rechteverwaltung,
- keine private Cloud, serverseitige Datenbank oder Synchronisierung,
- kein automatischer GitHub-Push oder Pages-Release aus der Author-App,
- kein individueller privater Browser-Link und keine Zugriffsbeschränkung,
- keine PWA und keine neue Offline-Cache-Architektur,
- keine Änderung der SCORM-Runtime, SCORM-Kommunikation oder SCORM-Paketstruktur,
- keine Änderung der Lernstatus-, Motivation-, Scheduler- oder Importlogik,
- keine neue Importarchitektur oder Änderung am kanonischen Course Schema.

## Bestehendes Verhalten

- `learner.production.json` bindet genau eine Kursdatei ein.
- Profilschema, Profilvalidator, Builder und Laufzeitprofil akzeptieren im Learner-Modus genau `course.file`.
- Der Builder schreibt genau `data/course.json`; die Buildvalidierung verlangt exakt diese eine Kursdatei.
- `published-course.js` lädt eine einzelne im Deployment-Profil referenzierte Kursdatei.
- Der Learner hat `fixedCourse: true`; lokale Author-Kursbibliothek und deren Storage-Module fehlen absichtlich im Learner- und SCORM-Build.
- Der Pages-Release setzt den festen Learner unter `/` und die Author-App unter `/author/` zusammen.
- Lernstand und Motivation verwenden bereits Schlüssel mit `deploymentId` und `courseId`. Die Lernbereichsauswahl verwendet derzeit nur die `courseId` und benötigt für die neue Veröffentlichungsvariante eine rückwärtskompatible Deployment-Namensgebung.
- Der Course Builder trennt JSON-Sicherung und SCORM-Ausgabe sichtbar. Der SCORM-Generator validiert und verpackt genau einen Kurs.
- Eine lokal in der Author-App gespeicherte Kursdatei kann ohne bewussten Build- und Release-Schritt nicht auf einem anderen Gerät im Pages-Learner erscheinen.

## Gewünschtes Verhalten

- Ein Mehrkurs-Learner lädt zunächst ausschließlich einen kleinen statischen Katalog und erst nach einer Auswahl die zugehörige Kursdatei.
- Der Aufruf `?course=<publicationId>#/dashboard` öffnet den angegebenen Kurs direkt. Der Hash-Router bleibt unverändert für die interne Navigation zuständig.
- Fehlt `course`, zeigt der Learner die veröffentlichte Kursauswahl. Eine zuletzt lokal getroffene Auswahl darf angeboten, aber nicht stillschweigend über einen expliziten Direktlink gestellt werden.
- Eine unbekannte oder entfernte Veröffentlichungs-ID führt zu einer verständlichen Meldung und zur Kursauswahl; es wird kein anderer Kurs als scheinbarer Ersatz geöffnet.
- Ein Kursupdate behält `publicationId`, kanonische `courseId` und bestehende Wort-IDs bei. Eine höhere `contentVersion` und veränderte Inhalte dürfen die fachlichen Zustände dieses Kurses nicht löschen.
- Das Entfernen eines Katalogeintrags entfernt Kurs und Link aus dem neuen Pages-Build. Lokale Lernstände werden nicht automatisch gelöscht und andere Katalogeinträge bleiben unverändert.
- Nur explizit in das Veröffentlichungsprofil aufgenommene Kurse gelangen in den Pages-Learner. Ein lokaler Author- oder SCORM-Kurs wird niemals automatisch öffentlich.
- Einzelkurs-Learner und SCORM behalten den bestehenden `course.file`-Pfad vollständig bei.

## Betroffene Komponenten

- Buildprofile, Profilschema und Buildprofilvalidierung,
- statischer Vocabulary-Trainer-Builder und Buildmanifest,
- Pages-Release-Assembly und Releasevalidierung,
- Deployment-Profil, Deployment-Capabilities und veröffentlichter Kursloader,
- neue kleine Learner-only-Kataloglaufzeit und Learner-only-Kursauswahl,
- Hash-Routing und App-Initialisierung,
- Storage-Schlüssel für zuletzt gewählten Kurs und Lernbereich,
- Course-Builder-Ausgabebereich für die Vorbereitung des öffentlichen Artefakts,
- Architektur-, Deployment-, Datenschutz- und Release-Dokumentation,
- bestehende Static-Build-, Release-, Storage-, Routing- und SCORM-Regressionstests.

Nicht betroffen sind ImportDraft, Importadapter, CourseLibraryService, Lernmodi, Scheduler, fachliche Bewertungslogik sowie SCORM-Generator und SCORM-Runtime.

## Architektur

### Publikationsvarianten

Das bestehende Learner-Profil wird rückwärtskompatibel um zwei exklusive Varianten ergänzt:

- `course.file`: bestehender Einzelkurs für SCORM und feste Learner-Ausgaben,
- `courseCatalog.entries`: neuer statischer Mehrkurs-Pages-Learner.

Ein Profil darf niemals beide Varianten gleichzeitig enthalten. Die neue Variante aktiviert keine Author-Kursbibliothek, sondern nur eine positive Learner-only-Lesefunktion.

### Buildzeit

Das Quellprofil enthält für jeden bewusst veröffentlichten Kurs:

- eine explizite `publicationId`,
- den relativen Pfad zur kanonischen Kursdatei.

Der Builder validiert die IDs und Kursdateien, kopiert jeden Kurs als `data/courses/<publicationId>.json` und erzeugt daraus deterministisch `data/courses/index.json`. Der Index wird nicht manuell gepflegt, damit Titel, Sprachen, `courseId` und `contentVersion` nicht zwischen Index und Kursdatei auseinanderlaufen.

Erwartete Ausgabeform:

```text
data/
└── courses/
    ├── index.json
    ├── family-english.json
    ├── family-latin.json
    └── family-english-advanced.json
```

Die Namen sind neutrale Beispiele. Reale personenbezogene Titel sind im öffentlichen Profil nicht zulässig.

### Laufzeit

Das Deployment-Profil verweist in der Katalogvariante nur auf `data/courses/index.json`. Eine neue kleine Kataloglaufzeit lädt und validiert diesen Index. Sie lädt keine Author-Kursbibliothek und schreibt keine Kurse in den Author-Storage.

Die Auswahlreihenfolge lautet:

1. gültige `publicationId` aus dem URL-Queryparameter,
2. bewusst gewählte Kurskarte in der Katalogansicht,
3. andernfalls Katalogansicht.

Der Router bleibt hashbasiert. Die Kursauswahl erhält eine dedizierte Learner-Route, beispielsweise `#/course-select`, damit die bestehende Author-Route `#/courses` semantisch und technisch unverändert bleibt.

### Stabile Identität

`publicationId` ist ein separates Deployment-Merkmal und kein aus dem veränderlichen Kurstitel bei jedem Build neu erzeugter Slug. Zulässig ist ein kleingeschriebener, URL-sicherer Wert aus Buchstaben, Ziffern und Bindestrichen. Nach Veröffentlichung wird er für denselben Browser-Link nicht mehr geändert.

Die kanonische `courseId` bleibt für Lernstand und fachliche Identität maßgeblich. Ein Kursupdate muss dieselbe `courseId` und dieselben IDs unveränderter Wörter behalten. `contentVersion` beschreibt die Inhaltsversion, ersetzt aber nicht die Identität.

### Author-Ausgabekanal

Die Author-App erhält neben Sicherung und SCORM eine klar benannte Aktion wie `Browser-Kurs für Veröffentlichung vorbereiten`. Sie verwendet den bestehenden kanonischen Exporter und erzeugt kein zweites Course Schema. Vor dem Download bestätigt die nutzende Person einen kurzen Hinweis, dass Pages öffentlich ist und der Kurs keine Namen, Scans oder personenbezogenen Inhalte enthalten darf.

Die Oberfläche erklärt ausdrücklich, dass der Download den Kurs noch nicht veröffentlicht. Die Aufnahme in das explizite Katalogprofil und der Pages-Release bleiben ein nachgelagerter, kontrollierter Repository-Prozess.

### SCORM-Unabhängigkeit

SCORM-Profile, Template, Generator, ZIP-Root, Manifest, API-Adapter und Runtime bleiben unverändert. Sie verwenden weiterhin genau einen validierten Einzelkurs. Ein Browser-Katalog wird weder in die Author-SCORM-Vorlage kopiert noch in ein erzeugtes SCORM-ZIP aufgenommen.

Die neue Architekturentscheidung wird in einer ADR dokumentiert, welche ADR-007 ausschließlich für die neue Pages-Katalogvariante erweitert; die bestehenden Einzelkurs- und SCORM-Aussagen bleiben gültig.

## Datenmodelle

Der Build erzeugt ein technisches, nicht vom Author exportiertes Katalogmodell:

```json
{
  "schemaVersion": 1,
  "deploymentId": "vocabulary-learner",
  "courses": [
    {
      "publicationId": "family-english",
      "courseId": "stabile-kanonische-kurs-id",
      "contentVersion": 3,
      "title": "Englisch – Grundkurs",
      "sourceLanguage": "en",
      "targetLanguage": "de",
      "file": "./family-english.json"
    }
  ]
}
```

Die endgültigen Feldnamen werden aus den vorhandenen Sprach- und Course-Schema-Konventionen abgeleitet. Der Index enthält nur die für Auswahl und Validierung nötigen Metadaten. Er enthält keine Lernstände, Motivation, Nutzernamen, Zeitstempel aus dem Browser oder private Author-Daten.

Der kanonische Kurs bleibt unverändert. `publicationId` gehört zum Deployment-Profil und nicht in das Course Schema.

## Schnittstellen

- Buildprofil: genau eine der Strukturen `course.file` oder `courseCatalog.entries[]`.
- Buildausgabe: `deployment-profile.json`, `data/courses/index.json` und eine JSON-Datei je Katalogeintrag.
- Direktlink: `https://<host>/<pages-base>/?course=<publicationId>#/dashboard`.
- Katalogloader: lädt Index und ausgewählte Kursdatei ausschließlich relativ zu `document.baseURI` beziehungsweise dem validierten Runtimeprofil.
- Storage: bestehende Course-Storage-Schlüssel; neue deploymentbezogene Auswahl sowie rückwärtskompatibel migrierter Lernbereichsschlüssel.
- Author: bestehender Course Export als Download, ergänzt um eine separate öffentliche Verwendungserklärung.
- Keine Netzwerk-Schnittstelle außer dem statischen Abruf derselben Pages-Origin, keine GitHub-API und kein Upload aus der App.

## UI-Verhalten

- Ohne Direktlink zeigt der Learner eine ruhige Kursauswahl mit Kurstitel, Sprachrichtung und primärer Aktion `Kurs öffnen`.
- Der aktive Kurs bleibt im bestehenden App-Kopf sichtbar. Eine gut erreichbare Aktion `Kurs wechseln` führt zurück zur Auswahl.
- Ein Direktlink öffnet den Kurs unmittelbar und setzt den Fokus nach der Initialisierung wie bisher auf die Zielansicht.
- Ein unbekannter Link zeigt `Dieser Browser-Kurs ist nicht verfügbar.` und bietet die Kursauswahl an.
- Die Author-Ausgabe zeigt Browser-Vorbereitung und SCORM als getrennte Karten oder eindeutig getrennte Bereiche. Der Browser-Hinweis nennt öffentliche Abrufbarkeit vor dem Download.
- Es gibt keine Oberfläche zum Löschen fremder oder lokaler Lernstände beim Entfernen eines veröffentlichten Kurses.

## Fehlerbehandlung

- Ungültiger oder nicht erreichbarer Katalog: verständlicher nichttechnischer Fehlerzustand; technische Ursache über kontrolliertes `console.error`.
- Doppelte, leere oder unsichere `publicationId`: Buildabbruch mit Profilpfad und betroffenem Eintrag.
- Doppelte `courseId` unter verschiedenen Veröffentlichungs-IDs: Buildabbruch, um zwei scheinbar getrennte Links mit gemeinsamem Lernstand zu verhindern.
- Katalogmetadaten stimmen nicht mit der geladenen Kursdatei überein: Kurs nicht starten; Auswahl mit konkretem Kursfehler anzeigen.
- Kursdatei fehlt oder ist ungültig: nur dieser Eintrag wird als nicht verfügbar behandelt; kein anderer Kurs wird überschrieben.
- Entfernte Veröffentlichungs-ID: verständlicher Linkfehler und Rückkehr zur Auswahl.
- Storage ist beschädigt oder nicht verfügbar: bestehende defensive Fallbacks bleiben erhalten; andere Kurse werden nicht zurückgesetzt.

## Datenschutz und Sicherheit

Alle Dateien im Pages-Build sind ohne Anmeldung öffentlich abrufbar, auch wenn ihre URL nicht prominent verlinkt ist. Die Author-App und Release-Dokumentation müssen dies vor der Browser-Vorbereitung eindeutig nennen.

Verbindliche Regeln:

- keine Namen von Schülerinnen, Schülern oder Familienmitgliedern in öffentlichen Kurstiteln, Units, Hinweisen oder Beispielen,
- keine Lehrwerksbilder, Scans, personenbezogenen Daten oder privaten Sicherungen,
- neutrale frei wählbare Publikationstitel und Veröffentlichungs-IDs,
- keine Annahme, ein schwer erratbarer Direktlink sei privat,
- keine Lernstände oder Motivation im veröffentlichten Kursartefakt,
- keine automatische Veröffentlichung lokaler Author-Kurse,
- Releasevalidierung prüft Dateigrenzen, Secrets, lokale Pfade und bekannte private Artefakte; eine fachliche Datenschutzsichtung bleibt ein manueller Pflichtschritt.

## Buildgrenzen

- Author: lokale Kursverwaltung, Browser-Artefaktvorbereitung und unveränderter SCORM-Export.
- Pages-Learner: Katalogloader, Kursauswahl, Katalogindex und explizit freigegebene Kursdateien; keine Author-Kursbibliothek, Importadapter oder SCORM-Generatorlogik.
- Einzelkurs-Learner: bestehendes `data/course.json` und bestehende feste Course-Capability.
- SCORM: genau ein Kurs, bestehende Runtime und bestehendes Manifest; kein Katalog, keine Browser-Publikationsansicht und keine Author-Module.
- Pages-Assembly: ein Root-Learner mit Katalog und eine Author-App; keine manuell zusammenkopierten Mischstände.

## Rückwärtskompatibilität

- Bestehende Einzelkursprofile mit `course.file` bleiben ohne Migration gültig.
- SCORM-Profile und individuelle Author-SCORM-Downloads bleiben binär und fachlich vom Katalogpfad getrennt.
- Bestehende Lernstände bleiben erhalten, wenn `deploymentId`, `courseId` und fachliche IDs stabil bleiben.
- Die Lernbereichsauswahl erhält eine defensive Migration vom bisherigen kursbezogenen Schlüssel in den deployment- und kursbezogenen Schlüssel; wiederholte Migration ist idempotent.
- Der bisher fest eingebaute neutrale Kurs kann als erster expliziter Katalogeintrag weiterverwendet werden.
- Import, Export, Course Builder und Lernmodi verwenden weiterhin das kanonische Course Schema.

## Edge Cases

- leeres Katalogprofil,
- genau ein veröffentlichter Kurs,
- drei oder mehr Kurse mit sehr langen neutralen Titeln,
- doppelte oder nur in Groß-/Kleinschreibung verschiedene Veröffentlichungs-IDs,
- unbekannter, entfernter oder URL-kodierter Direktlink,
- Kursupdate mit gleicher `courseId`, höherer `contentVersion` und stabilen Wort-IDs,
- irrtümlicher Austausch der `courseId` unter derselben `publicationId`,
- derselbe kanonische Kurs unter zwei Veröffentlichungs-IDs,
- beschädigter Lernstand eines Kurses bei intakten Zuständen anderer Kurse,
- deaktivierter Browserstorage,
- direkter Reload auf jeder Hash-Route mit gesetztem `course`-Queryparameter,
- Browser-Zurück zwischen Auswahl und Kurs,
- Kurs nur für SCORM, aber nicht im Katalog,
- Entfernen eines Kurses bei noch vorhandenen Home-Bildschirm-Links.

## Risiken

- Eine scheinbare One-Click-Veröffentlichung würde ohne Backend falsche Erwartungen erzeugen; die zweistufige Releasegrenze muss sichtbar bleiben.
- Eine aus dem Titel abgeleitete ID könnte Links bei Umbenennung brechen; deshalb ist eine explizite stabile Veröffentlichungs-ID erforderlich.
- Eine geänderte `courseId` würde Lernstände wie einen neuen Kurs behandeln; Build- und Releaseprozess müssen Identitätsänderungen sichtbar machen.
- Ein zu breiter Katalogloader könnte die Author-Kursbibliothek in den Learner ziehen; positive Dateipläne und Negativtests verhindern dies.
- Öffentliche Kursinhalte können personenbezogene oder urheberrechtlich problematische Angaben enthalten; technische Prüfung ersetzt keine manuelle Freigabe.
- Änderungen am gemeinsamen Startup können Einzelkurs- und SCORM-Starts beeinträchtigen; beide Wege benötigen eigenständige Regressionstests.
- Eine automatische Löschung entfernter Kurszustände könnte Daten vernichten; lokale Zustände bleiben unangetastet.

## Teststrategie

### Unit-Tests

- Profilvalidierung für exklusive Einzelkurs- und Katalogvarianten,
- `publicationId`-Validierung, Duplikate und Pfadsicherheit,
- deterministische Katalogerzeugung aus validierten Kursdateien,
- Katalogloader, Direktlinkauflösung und unbekannte IDs,
- Storage-Schlüssel und idempotente Lernbereichsmigration,
- Auswahl- und Fehlerzustände der Learner-Kursansicht,
- öffentlicher Author-Hinweis und getrennte Ausgabeschaltflächen.

### Integrations- und Buildtests

- Mehrkurs-Profil mit mindestens drei neutralen Fixtures bauen und validieren,
- Kursdateien und Index vollständig und ausschließlich im Pages-Learner,
- Direktstart, Auswahl, Kurswechsel, Reload und Browser-Zurück,
- Update nur eines Kursartefakts bei stabiler Identität und erhaltenem Lernstand,
- Entfernen eines Katalogeintrags ohne Änderung anderer Kursdateien,
- keine Author- oder Importmodule im Learner,
- kein Katalog im SCORM-ZIP,
- bestehender individueller SCORM-Export und ZIP-Validierung unverändert grün,
- bestehende JSON-/CSV-/TSV-/TXT-Import- und Export-Roundtrips unverändert grün.

### Regression

Die Regression-Matrix wird um Browser-Katalog, Direktlink, kursbezogenen Lernstand und SCORM-Unabhängigkeit ergänzt. Der bestehende neutrale Einzelkurs-Build bleibt ein eigener Testfall und wird nicht durch den Katalogtest ersetzt.

## Reale End-to-End-Szenarien

1. Drei neutrale, lizenzfreie Testkurse werden bewusst in ein Pages-Katalogprofil aufgenommen, als veröffentlichungsnaher Pages-Build gebaut und über Auswahl sowie jeweilige Direktlinks geöffnet.
2. In jedem Kurs wird ein anderer Lernbereich gewählt und eine Lernsession abgeschlossen; nach Reload und Kurswechsel bleiben Fortschritt und Auswahl dem richtigen Kurs zugeordnet.
3. Genau ein Kurs wird mit stabiler `publicationId`, `courseId` und Wort-IDs auf eine höhere `contentVersion` aktualisiert; die beiden anderen Kurse und alle drei Lernstände bleiben erhalten.
4. Ein Kurs wird aus dem Katalog entfernt; sein alter Direktlink zeigt den verständlichen Nicht-verfügbar-Zustand, während die übrigen Links funktionieren.
5. Ein vierter Author-Kurs wird ausschließlich als SCORM-ZIP erzeugt, in einer neuen ByCS-/Moodle-Aktivität gestartet und erscheint nicht im Pages-Katalog.
6. Pages wird online geprüft: Desktop und Smartphone, Reload, Home-Bildschirm-Link, Konsole, Netzwerk und 404-Fehler.

Es werden ausschließlich neutrale, selbst erstellte QA-Kurse verwendet. Fehlt eine reale Pages- oder LMS-Prüfung, darf die spätere Implementierung nicht als releasefähig markiert werden.

## Akzeptanzkriterien

1. In der Learner-App können mindestens drei Browser-Kurse gleichzeitig angeboten werden.
2. Jeder Browser-Kurs besitzt einen stabilen Direktlink und kann direkt geöffnet werden.
3. Die Learner-App zeigt eine verständliche Kursauswahl, wenn kein Kurs direkt verlinkt wurde.
4. Lernstand und zuletzt gewählter Lernbereich werden getrennt pro Kurs gespeichert.
5. Ein Browser-Kurs kann aktualisiert werden, ohne andere Browser-Kurse oder deren Lernstände zu überschreiben.
6. Ein Author-Kurs kann weiterhin unabhängig als SCORM-ZIP exportiert werden.
7. Kurse, die nur für SCORM vorgesehen sind, erscheinen nicht automatisch in der öffentlichen Learner-App.
8. Author-, Learner-, Pages- und SCORM-Buildgrenzen sowie bestehende Import- und Lernfunktionen bleiben erhalten.

## Spec Review

Status: APPROVED

### Findings

- Das Problem ist anhand der aktuellen Einzelkurs-Profile, der Buildvalidierung und ADR-007 nachgewiesen; es ist keine fehlende lokale Author-Kursbibliothek.
- Ein lokaler Author-Button kann ohne verbotene Cloud- oder GitHub-Schnittstelle keinen geräteübergreifenden Pages-Kurs veröffentlichen. Die Spezifikation trennt daher Vorbereitung und bewussten Release eindeutig.
- Ein statischer buildgenerierter Index ist kleiner und verlässlicher als eine zweite persistente Kursbibliothek im Learner.
- Die explizite Veröffentlichungs-ID trennt stabile Links von veränderlichen Titeln und vom kanonischen Course Schema.
- Lernstand und Motivation sind bereits grundsätzlich kursbezogen. Nur die Lernbereichsauswahl benötigt eine konsistente, rückwärtskompatible Deployment-Namensgebung.
- Das neue Katalogprofil erweitert eine bestehende Architekturentscheidung. Eine neue ADR ist notwendig; eine neue SCORM-Architektur ist ausdrücklich nicht notwendig.
- Die Datenschutzgrenze ist korrekt: GitHub Pages ist öffentlich, ein Direktlink ist keine Zugriffskontrolle.
- Die acht Akzeptanzkriterien sind konkret, überprüfbar und decken den unabhängigen SCORM-Weg ab.

### Erforderliche Änderungen

Keine Änderungen vor Erstellung des Implementation Plans erforderlich.

### Freigabe

Senior-Spec-Review technisch freigegeben. Die Implementierung bleibt bis zur ausdrücklichen Nutzerfreigabe von Spec und Plan gesperrt.
