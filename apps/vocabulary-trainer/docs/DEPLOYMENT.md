# Vocabulary Trainer – Veröffentlichung und statische Builds

Der Vocabulary Trainer wird ohne Framework, Bundler, Backend oder externe
Laufzeitabhängigkeit veröffentlicht. Ein JSON-Profil erzeugt entweder die
vollständige lokale Autorenanwendung, eine auf genau einen Kurs begrenzte
Lernanwendung oder den statischen Pages-Learner mit einem expliziten
Mehrkurs-Katalog.

## Voraussetzungen

- aktuelle Node.js-Version
- Repository-Root als Arbeitsverzeichnis
- statischer HTTP-Server für die fertigen Dateien

Ein Build wird mit folgendem Befehl erzeugt:

```bash
node apps/vocabulary-trainer/scripts/build.mjs \
  --profile apps/vocabulary-trainer/profiles/learner.example.json
```

Das Author-Beispiel wird entsprechend mit
`profiles/author.example.json` gebaut. Die Profile schreiben ausschließlich in
einen Unterordner von `dist/`. `--all` ist bewusst nicht implementiert; jede
Veröffentlichung muss ein ausdrücklich benanntes und prüfbares Profil besitzen.

## Profile

Gemeinsame Pflichtfelder:

- `schemaVersion`: derzeit `1`
- `profileId`: stabile technische Profil-ID
- `deploymentId`: stabile Storage- und Veröffentlichungsidentität
- `mode`: `author` oder `learner`
- `app.title` und `app.defaultRoute`
- `features`: explizite Capability-Schalter
- `output.directory`: relativer Pfad innerhalb von `dist/`

Unbekannte Felder, unbekannte Features, absolute Pfade und Pfad-Traversal
werden abgelehnt.

### Author-Profil

Das Author-Profil enthält die vollständige Anwendung. Es unterstützt weiterhin:

- eigene Kurse und Sprachkonfiguration,
- Units sowie vollständige Wortdaten,
- CSV-, TSV- und TXT-Import mit Vorlage und neutralem Import-Prompt,
- JSON-Import und JSON-Export,
- Duplizieren und lokale Kursverwaltung.

Es bindet keinen festen Veröffentlichungskurs ein. Die lokale Kursbibliothek
bleibt die Quelle der aktiven Autorenarbeit.

Book Capture ist produktweit deaktiviert. Auch der Author-Dateiplan enthält
weder `ocr/` noch `author/image-import/`, Engine, WASM, Modelle oder
HEIC-/HEIF-Decoder. Die Author-CSP benötigt deshalb keine Blob-Worker und kein
`wasm-unsafe-eval`; `worker-src 'none'` gilt wie in den übrigen statischen
Builds. Der historische Quellcode bleibt außerhalb jedes Produktbuilds.
Ein Profil mit `features.bookCapture=true` wird bereits bei der Validierung
abgelehnt. Die dafür historisch benötigten npm-Pakete sind ausschließlich
Entwicklungsabhängigkeiten und werden nicht in Produktdateipläne kopiert.

### Learner-Profil

Ein Learner-Profil referenziert entweder exakt eine kanonische Kursdatei über
`course.file` oder einen expliziten Katalog über `courseCatalog.entries`. Beide
Varianten schließen sich gegenseitig aus. Der Validator prüft App-Typ, Kurs-,
Unit- und Wortstruktur vor dem Schreiben des Builds. Der Einzelkurs-Build
enthält anschließend eine eigene `data/course.json`; der Katalog-Build enthält
einen deterministisch erzeugten `data/courses/index.json` und genau eine
Kursdatei pro stabiler `publicationId`. Beide Varianten enthalten keine
Kursbibliothek, Editoren, Import-/Exportmodule, OCR-Module, OCR-Engine,
HEIC-/HEIF-Decoder, Sprachmodelle, SpeechRecognition-, Mikrofon- oder
Aufnahmemodule oder Autorenstyles.

Course Builder, Import/Export, Kursverwaltung und Kurswechsel müssen im
Learner-Profil `false` sein. Motivation, Aussprache und Speed Challenge sind
optionale Lernfunktionen. Deaktivierte optionale Module und ihre Navigation
werden nicht ausgeliefert beziehungsweise nicht gerendert.
Die Learner-CSP bleibt bei `script-src 'self'` und `worker-src 'none'`; sie wird
für die Author-OCR nicht gelockert. Derselbe physische Ausschluss gilt für alle
SCORM-Pakete, da sie aus dem Learner-Dateiplan gebaut werden.

Produktionsprofile liegen getrennt unter `profiles/production/`. Sie werden
nicht durch Ordnersuche veröffentlicht, sondern ausschließlich durch den
Deployment-Satz `deployments/github-pages.production.json` ausgewählt. Der
im Katalog ausgewählten, frei erfundenen Kurse sind austauschbare
Beispielquellen; weder Kursname noch Sprachenpaar beeinflussen die Buildlogik.
Nur Einträge des ausdrücklich benannten Produktionsprofils werden öffentlich
ausgeliefert. Das feste Einzelkursprofil bleibt unverändert die Quelle der
Author-SCORM-Vorlage.

## Build-Ablauf

1. Profil und gegebenenfalls Kurs werden vollständig validiert.
2. Ein positiver Dateiplan wird für den gewählten Modus berechnet.
3. Dateien werden in ein temporäres Nachbarverzeichnis kopiert und
   profilspezifisch transformiert.
4. Laufzeitprofil, Buildinformation, Learner-Kurs beziehungsweise
   Katalogindex und Katalogkurse, `.nojekyll` und
   deterministisches `build-manifest.json` werden geschrieben.
5. Der Build prüft fehlende Referenzen, verbotene Autoren-, OCR-/HEIC- und
   Speech-Module, lokale absolute Pfade, Testdateien sowie feste Kurs- oder
   Katalogidentitäten.
6. Erst nach erfolgreicher Prüfung ersetzt der temporäre Stand das Ziel
   atomar. Ein vorhandener gültiger Build wird bei einem Fehler wiederhergestellt.

Der Builder verändert weder Quelldateien noch lokale Browserdaten.

## Statisches Hosting und Unterordner

Alle App-Referenzen sind relativ. Das erzeugte Verzeichnis kann deshalb als
Root oder Unterordner eines statischen Hosts veröffentlicht werden. Routen
verwenden Hashes, beispielsweise `#/dashboard`; es ist keine Rewrite-Regel des
Servers erforderlich.

Lokale Prüfung des vollständigen Produktionsartefakts:

```bash
node apps/vocabulary-trainer/scripts/serve-static.mjs \
  --root dist/pages --port 4173
```

Danach:

```text
http://127.0.0.1:4173/index.html#/course-select
http://127.0.0.1:4173/index.html?course=english-everyday#/dashboard
http://127.0.0.1:4173/author/index.html#/courses
```

`file://` ist nicht unterstützt, weil Profil und Kurs über `fetch` geladen
werden.

## Speichertrennung und Migration

Persistente Schlüssel folgen diesem Muster:

```text
edutools:vocabulary:<deploymentId>:course:<courseId>:learning
edutools:vocabulary:<deploymentId>:course:<courseId>:motivation
edutools:vocabulary:<deploymentId>:course-library
edutools:vocabulary:<deploymentId>:active-course
edutools:vocabulary:<deploymentId>:pronunciation-preferences
```

Die `deploymentId` muss über Updates stabil bleiben. Eine zweite
Veröffentlichung verwendet eine andere ID, auch wenn derselbe Kurs enthalten
ist. So bleiben Author, Learner A und Learner B derselben Origin unabhängig.

Nur das Author-Profil migriert bekannte alte Vocabulary-Trainer-Schlüssel. Die
Migration kopiert vorhandene Werte ohne Überschreiben, bestätigt jeden
Schreibvorgang und ist wiederholbar. Alte Schlüssel bleiben als Rückfalloption
erhalten. Learner-Builds importieren keine alte Autorenbibliothek.

Das in ADR-006 beschriebene `contentVersion`-Update gilt weiterhin nur für
eindeutig `bundled` gekennzeichnete Kurse. Eigene, importierte und duplizierte
Kurse werden niemals automatisch ersetzt oder inhaltlich verändert.
Aussprachetempo und die optional bevorzugte lokale Source-Stimme werden nur
deploymentbezogen gespeichert und enthalten keine Kurs- oder Lernergebnisse.

## Manifest und Reproduzierbarkeit

`build-manifest.json` enthält keine aktuelle Uhrzeit. Bei gleichen Quellen,
gleichem Profil und gleichem Kurs entstehen identische Manifestdaten und
Dateiprüfsummen. Das Manifest dokumentiert Profil, Deployment, Modus,
Featureumfang, feste Kurs-ID beziehungsweise alle Katalog-Kurs-IDs, Build-Hash
und die tatsächlich ausgelieferten Dateien. Derselbe
Hash steht in `runtime/deployment-profile.json` und
`runtime/build-info.json`.

## Produktions-Release und Deployment-Satz

Der versionierte Deployment-Satz veröffentlicht genau zwei Profile:

- `vocabulary-learner-catalog` am Root-Mount mit der stabilen
  `deploymentId=vocabulary-learner`,
- `vocabulary-author` unter `/author/` mit
  `deploymentId=vocabulary-author`.

Die Assembly wird so ausgeführt:

```bash
node apps/vocabulary-trainer/scripts/release-pages.mjs \
  --deployment apps/vocabulary-trainer/deployments/github-pages.production.json
```

Ohne `--verified` führt das CLI Tests, Syntax- und JSON-Prüfung sowie den
Roundtrip vor der Assembly aus. CI verwendet `--verified`, nachdem diese Gates
bereits als eigene Schritte bestanden wurden. Die Assembly baut jedes Profil
über den Builder aus ADR-007, mountet es in einem temporären Dateibaum,
erzeugt 404 und Release-Manifest, validiert alle Hashes und führt fünfzehn echte
HTTP-Smoke-Checks aus. Erst dann ersetzt sie `dist/pages`. Ein Fehler erhält
den letzten gültigen Ordner und entfernt temporäre Verzeichnisse.

Das Root-`release-manifest.json` enthält Deployment-Satz, Site-Metadaten,
sortierte Profile, Mount-Pfade, feste Kurs-ID beziehungsweise Katalog-Kurs-IDs,
Profil-Build-Hashes, eine sortierte
Dateiliste, Bytegrößen, SHA-256 sowie einen deterministischen Release-Hash.
Zeitstempel, lokale Quellpfade und Nutzerdaten werden nicht aufgenommen.

## JSON-Release-Gate

Vor der Produktionsfreigabe wird ein Kurs über den realen Author-Export als
JSON erzeugt. `scripts/roundtrip.mjs` liest die Datei, verwendet den
produktiven Kursvalidator, importiert sie in eine frische lokale Bibliothek,
vergleicht Metadaten, Sprachen, Aussprachekonfiguration, Units, Wörter,
Targets, Lautschrift, Hint, Beispiel, Tags und Archivierungsstatus und baut
dieselbe Datei anschließend als Learner-Kursquelle. Learning State,
Motivation, XP und Lernserie sind nie Teil eines Kursexports.

## Sicherheit und öffentliche Daten

Jeder erzeugte Einstieg besitzt eine profilbezogene Sprache, Title und
Description sowie `referrer=no-referrer`. Eine Meta-CSP erlaubt ausschließlich
lokale Scripts, Styles, Fonts, Bilder, Verbindungen und Medien; Objekte und
Worker sind gesperrt. Nicht benötigte `data:`-Bild- und `blob:`-Medienquellen,
`unsafe-eval`,
`unsafe-inline`, Wildcards, externe Fonts, Tracking und Analytics werden nicht
verwendet. Blob-Downloads, lokaler JSON-Import und Web Speech Synthesis bleiben
funktionsfähig. Eine Canonical-URL wird erst gesetzt, wenn die endgültige URL
sicher bekannt ist.

GitHub Pages ist ein öffentliches statisches Hosting. Kursdaten in
Learner-Builds können von jeder Person mit Zugriff auf die URL gelesen werden.
Produktionskurse dürfen deshalb keine Geheimnisse oder personenbezogenen Daten
enthalten.

Die Author-Aktion `Browser-Kurs für Veröffentlichung vorbereiten` lädt nur das
kanonische JSON-Artefakt herunter. Sie veröffentlicht nichts automatisch. Vor
dem Download ist zu bestätigen, dass Titel und Inhalte neutral sind und weder
Namen, Lehrwerksbilder noch personenbezogene Daten enthalten. Erst die bewusst
geprüfte Aufnahme in das Katalogprofil und ein späterer Pages-Release machen
den Kurs öffentlich. SCORM-only-Kurse werden dadurch nicht veröffentlicht.

## Cache- und Updateverhalten

Es gibt keinen Service Worker und keinen Offline-Cache. Ein deterministischer
Profil-Build-Hash versioniert die direkten HTML-Assets, das Runtimeprofil und
die Kurs- beziehungsweise Katalogdateien. Der unveränderte ES-Modulgraph wird bewusst nicht fragil
umgeschrieben. Ein harter Reload kann nach einem Deployment kurzfristig
zwischengespeicherte Module aktualisieren; die funktionalen Einstiegspunkte
verweisen jedoch auf die neue Buildversion.

Bei gleicher `deploymentId`, `publicationId`, Kurs-ID und stabilen Wort-IDs bleiben Learning
State, Wiederholungstermine, schwierige und gemerkte Wörter, Motivation, XP,
Level und Lernserie erhalten. Neue Wort-IDs beginnen ungelernt. Entfernte oder
archivierte Wörter werden nicht mehr angeboten; alte lokale Einträge dürfen
verwaist bleiben. Eine geänderte Wort-ID gilt als neues Wort. Der zuletzt
gewählte Lernbereich wird ebenfalls deployment- und kursbezogen gespeichert;
ein vorhandener älterer kursbezogener Schlüssel wird einmalig und idempotent
kopiert, aber nicht gelöscht.

## GitHub Actions und Pages-Einstellungen

`.github/workflows/deploy-vocabulary-trainer-pages.yml` läuft bei Pull
Requests, Push auf `main` in buildrelevanten Pfaden und manuell. Offizielle
Actions sind auf vollständige Commit-SHAs gepinnt. Pull Requests führen alle
Verifikationen einschließlich Assembly und Smoke-Tests aus, laden aber kein
Artefakt hoch und deployen nicht. Push und manueller Start laden ausschließlich
`dist/pages` hoch. Der getrennte Deploy-Job benötigt nur `pages: write` und
`id-token: write` und verwendet das Environment `github-pages`.

Repository-Einrichtung:

1. GitHub-Repository öffnen und `Settings` → `Pages` wählen.
2. Unter `Build and deployment` die Source `GitHub Actions` einstellen.
3. Optional das Environment `github-pages` schützen.
4. Workflow über `workflow_dispatch` oder einen Push auf `main` starten.
5. Ausschließlich die vom offiziellen Deploy-Schritt ausgegebene `page_url`
   als Live-URL verwenden und danach die dokumentierten Smoke-Checks
   wiederholen.

Es sind keine benutzerdefinierten Secrets erforderlich. Bis zu einem
autorisierten Workflowlauf wird keine Live-Veröffentlichung behauptet.

## Freigabe- und Rollback-Checkliste

Vor dem Build:

- [ ] Produktionsprofile, stabile `publicationId`-Werte und alle bewusst
  gewählten öffentlichen Kurse prüfen.
- [ ] Keine personenbezogenen, geheimen oder urheberrechtlich unzulässigen
  Kursdaten aufnehmen.
- [ ] `deploymentId`, `publicationId`, Kurs-ID und bestehende Wort-IDs stabil
  halten.
- [ ] JSON-Export-/Import-Roundtrip mit der tatsächlichen Datei durchführen.

Automatische Prüfungen:

- [ ] alle Tests, Syntax- und JSON-Prüfung bestehen,
- [ ] Deployment-Satz, Profile und Kurse sind valide,
- [ ] Roundtrip und Learner-Buildquelle bestehen,
- [ ] Assembly, Profil- und Release-Hashes stimmen,
- [ ] 404, MIME-Typen und HTTP-Smoke-Tests bestehen,
- [ ] nur `dist/pages` ist das Pages-Artefakt.

Manuelle Prüfungen:

- [ ] Learner und Author bei 320, 375, 768 und 1440 Pixeln prüfen,
- [ ] Kursauswahl, drei Direktlinks, Kurswechsel, Reload und Browser-Zurück
  prüfen,
- [ ] unterschiedliche Lernbereiche und Lernstände in mindestens drei Kursen
  getrennt prüfen,
- [ ] Tastatur, Fokus, Reflow und Browserhistorie prüfen,
- [ ] Course Builder, Import/Export und alle Lernrichtungen prüfen,
- [ ] Konsole, CSP und fehlgeschlagene Requests prüfen,
- [ ] Chromium prüfen; WebKit nur als bestanden dokumentieren, wenn verfügbar.

Nach dem Deployment:

- [ ] Root, `/author/`, Runtimeprofile, Katalogindex, alle öffentlichen Kurse,
  CSS, App-Modul und 404 über die ausgegebene URL prüfen,
- [ ] Deployment-URL und funktionalen Release-Hash dokumentieren,
- [ ] keine Live-Freigabe behaupten, bevor diese Checks wirklich bestanden
  sind.

Rollback: letzten bekannten funktionsfähigen Commit auswählen und den gleichen
Workflow erneut ausführen. `deploymentId`, `publicationId`, Kurs-ID und Wort-IDs unverändert
lassen, damit lokale Zustände erhalten bleiben. GitHub Pages stellt danach das
neu hochgeladene vollständige `dist/pages`-Artefakt bereit; kein partieller
Dateitausch ist vorgesehen.

## Veröffentlichungshistorie

Eine Freigabe dokumentiert mindestens Quellcommit (falls vorhanden),
Release-Hash, Profil-Build-Hashes, die vom Deploy-Schritt ausgegebene URL,
Testergebnis und manuelle Browser-QA. Lokale Builds ohne Git-Kontext bleiben
gültig und verwenden keine erfundene Commit-ID.

Version `3.9.0` ist ein reines Härtungsrelease. Der Sprint-3.8-Import blieb
fachlich unverändert; ergänzt wurden strengere Artefaktgrenzen, bereinigte CSP,
einheitliche Cache-Referenzen, Migrationsregressionen und reproduzierbare
Clean-Build-Nachweise.

Version `4.0.0` ergänzt einen lokalen Author-Export für individuelle
SCORM-1.2-ZIPs. Der Author-Build enthält dafür unter `scorm-template/` einen
separat validierten Produktions-Learner. Das Browsermodul ersetzt in dieser
Vorlage ausschließlich Kurs- und Deploymentdaten, erzeugt Manifest und ZIP
mit den gemeinsamen CLI-Modulen und lädt die fertige Datei als Blob herunter.
Der exportierte Learner selbst enthält weder Exportmodul noch Authoring.

Patch `4.0.1` härtet ausschließlich den SCORM-Start: Der Browserexport
validiert Manifest- und Paketpfade vor dem Download, der Standard-Harness
startet den tatsächlichen Manifest-`href` ohne Hash und ein Moodle-naher
Harness prüft verschachtelte Frames, Pluginfile-Unterpfade und äußere LMS-
Parameter. Ein erfolgreicher Harness-Test wird weiterhin nicht als reale
ByCS-/Moodle-Freigabe bezeichnet.

## Fehlerbehandlung

Profil- und Kursfehler werden vor dem Austausch des Zielverzeichnisses mit
konkretem Feldpfad gemeldet. Das CLI liefert einen Fehlerstatus. Die App zeigt
für unbekannte oder nicht verfügbare Routen einen verständlichen Zustand mit
Rückkehr zum Dashboard. Technische Details bleiben in der Konsole.

## Grenzen

- kein Backend, keine Cloud und keine Benutzerkonten
- keine Live-Veröffentlichung ohne autorisierten GitHub-Workflowlauf
- keine dauerhafte Speicherung laufender Sessions
- keine serverseitigen Pretty-URL-Routen
- kein Schutz öffentlich ausgelieferter Kursinhalte vor Einsicht im Browser
- ein Einzelkurs- oder SCORM-Learner enthält genau einen Kurs und bietet keinen
  Kurswechsel; nur der explizite Pages-Katalog-Learner enthält mehrere Kurse
- kein Service Worker, Offline-Cache oder vollständiges Modulgraph-Bundling

## Private SCORM-1.2-Auslieferung

Neben dem öffentlichen Pages-Satz existiert ein vollständig getrennter lokaler
SCORM-Weg. Er verwendet ausschließlich ein explizit benanntes Profil und den
vorhandenen Learner-Builder:

```bash
node apps/vocabulary-trainer/scripts/build-scorm.mjs \
  --profile apps/vocabulary-trainer/private/scorm-profiles/klasse.private-scorm.json
node apps/vocabulary-trainer/scripts/inspect-scorm.mjs \
  --file dist/private-scorm/klasse.scorm.zip
```

`apps/vocabulary-trainer/private/`, `dist/private-scorm/` und `.scorm.zip`
werden nicht durch den Pages-Deployment-Satz oder den GitHub-Workflow
aufgenommen. Das Pages-Artefakt bleibt ausschließlich `dist/pages`.

Der SCORM-Prozess validiert Profil, Learner und Kurs, baut in einem temporären
Verzeichnis, ergänzt das Delivery-Profil, erzeugt XML- und Paketmanifest,
prüft den physischen Baum, schreibt eine deterministische ZIP, liest deren
Central Directory und Dateien erneut und ersetzt erst danach die Zieldatei.
Fehler erhalten die letzte gültige ZIP und entfernen temporäre Daten.

Die SCORM-Meta-CSP enthält kein `frame-ancestors`, da diese Direktive in einer
Meta-CSP nicht verlässlich gesetzt werden kann und die Einbettung nicht
blockiert werden darf. Es werden keine externe Script-, Font-, Tracking- oder
Analytics-Domain, kein `unsafe-eval` und keine ByCS-Domain freigegeben. Relative
Assets, Web Speech und der kontrollierte Parent-API-Zugriff bleiben nutzbar.

Storage bleibt unverändert:

```text
edutools:vocabulary:<deploymentId>:course:<courseId>:learning
edutools:vocabulary:<deploymentId>:course:<courseId>:motivation
edutools:vocabulary:<deploymentId>:settings
```

Paket-ID, Titel und ZIP-Dateiname ändern diesen Namespace nicht. Ein
SCORM-Versuchsreset löscht keinen lokalen Vocabulary-Lernstand. Details,
private Arbeitsstruktur, Updateablauf, Datenschutz und echte ByCS-Schritte
stehen in [`SCORM_BYCS.md`](SCORM_BYCS.md) und
[`BYCS_SCORM_ACCEPTANCE.md`](BYCS_SCORM_ACCEPTANCE.md).

## Author-Kursdatei, SCORM-ZIP und Sprachwerte

Der Author-Weg lautet: Kurs anlegen oder EduTools-JSON importieren → Source- und
Target-Sprache prüfen → vorbereitete Tabelle prüfen und übernehmen →
EduTools-Kursdatei herunterladen oder ein SCORM-Lernpaket herunterladen. Codes
und Speech-Locales werden automatisch aus der zentralen Sprach-Registry
abgeleitet. Die JSON-Datei ist die bearbeitbare Sicherung und kann wieder
importiert werden. Das ZIP ist ein fertiger Learner für ByCS/Moodle und wird
nicht entpackt.

Learner- und SCORM-Dateipläne enthalten weder Kurserstellung, Bildimport noch
Kursdatei-Export. Die auf höchstens zwei konkrete Optionen begrenzte lokale
Source-Stimmenauswahl bleibt eine Gerätepräferenz und wird nicht in Kurs- oder
Paketdaten geschrieben.
