# Private SCORM-1.2-Lernpakete für ByCS

Das Paket ist ausschließlich ein Learner-Build. Kurserstellung, Bildimport
und Exportwerkzeuge werden nicht ausgeliefert. Eigene Kurse können im Course
Builder direkt über „SCORM-Lernpaket herunterladen“ vollständig lokal
paketiert werden. Der vorhandene CLI-Weg bleibt für kontrollierte private
Buildprofile verfügbar. Beide Wege verwenden dieselben Manifest- und
deterministischen ZIP-Module und denselben validierten Learner. Stimmenpräferenzen
gehören nicht zum Kursinhalt; das Gerät zeigt höchstens Daniel plus eine
geprüfte weibliche Source-Stimme. Die SCORM-Kommunikation bleibt davon
unverändert.

SCORM ist eine zusätzliche private Auslieferungsform des vorhandenen
Vocabulary-Learners. Das Paket enthält dieselbe App und genau einen bewusst
gewählten Kurs. Es ist keine zweite Lernanwendung.

Moodle erlaubt Lehrkräften, ein SCORM-Paket als Kursaktivität hochzuladen. Die
konkrete ByCS-Oberfläche und ihre Einstellungen müssen in der jeweiligen
Installation geprüft werden. Eine lokale Paketprüfung ersetzt diesen echten
Upload nicht. Siehe auch [MoodleDocs: SCORM activity](https://docs.moodle.org/405/en/SCORM_activity).

## Privater Arbeitsbereich

Diese Pfade sind Git-ignoriert:

```text
apps/vocabulary-trainer/private/courses/
apps/vocabulary-trainer/private/learner-profiles/
apps/vocabulary-trainer/private/scorm-profiles/
dist/private-scorm/
```

Zusätzlich werden `*.private-course.json`, `*.private-scorm.json` und
`*.scorm.zip` ignoriert. Private Dateien gehören weder in ein öffentliches
Repository noch in den GitHub-Pages-Deployment-Satz. Sichere sie stattdessen
über den schulisch vorgesehenen privaten Speicherweg.

## Einrichtung

1. In der Author-App einen eigenen Kurs erstellen oder eine vorbereitete
   EduTools-JSON-/CSV-/TSV-/TXT-Datei importieren. Der Bildimport ist
   produktweit deaktiviert.
2. Source- und Target-Sprache, Units, Wort-IDs und Inhalte prüfen.
3. Im Course Builder „SCORM-Lernpaket herunterladen“ wählen und die ZIP
   unverändert in ByCS/Moodle hochladen. Für den normalen Weg sind die
   folgenden CLI-Schritte nicht erforderlich.

### Kontrollierter CLI-Weg

1. Den Kurs als JSON exportieren.
2. Die JSON-Datei nach
   `apps/vocabulary-trainer/private/courses/` kopieren.
3. Die neutrale Learner-Vorlage
   `scorm/examples/private-learner-profile.example.json` nach
   `private/learner-profiles/` kopieren.
4. Im Learner-Profil Kursdatei, Titel und eine stabile `deploymentId` setzen.
5. Die SCORM-Vorlage `scorm/examples/private-scorm-profile.example.json` nach
   `private/scorm-profiles/` kopieren.
6. Dort `packageId`, Learner-Profil, Titel, Abschlussregel und Ausgabedatei
   anpassen.

Technische Identitäten:

- `packageId` identifiziert das erzeugte Lernpaket.
- `deploymentId` identifiziert den lokalen Storage-Namensraum einer Klasse.
- Kurs-ID identifiziert den fachlichen Kurs.
- Wort-IDs identifizieren die einzelnen Lerngegenstände.

Beim Browserexport werden `packageId`, Profil- und `deploymentId` stabil aus
der Kurs-ID abgeleitet. Ein erneuter Export desselben Kurses behält damit den
lokalen Storage-Namensraum. Eine Kurskopie besitzt eine neue Kurs-ID und damit
bewusst eine neue Paketidentität.

Die `deploymentId` darf keine Namen, E-Mail-Adressen, Geburtsdaten oder andere
personenbezogene Angaben enthalten. Bei einem Update derselben Klasse bleibt
sie stabil. Getrennte Klassen verwenden getrennte IDs.

## Bauen und prüfen

Vom Repository-Root:

```bash
node apps/vocabulary-trainer/scripts/build-scorm.mjs \
  --profile apps/vocabulary-trainer/private/scorm-profiles/englisch-7a.private-scorm.json

node apps/vocabulary-trainer/scripts/inspect-scorm.mjs \
  --file dist/private-scorm/englisch-7a.scorm.zip --verbose
```

Nur die Profilprüfung ohne Paketbau:

```bash
node apps/vocabulary-trainer/scripts/build-scorm.mjs \
  --profile apps/vocabulary-trainer/private/scorm-profiles/englisch-7a.private-scorm.json \
  --validate-only
```

Der Builder validiert SCORM-Profil, Learner-Profil und Kurs, verwendet den
kanonischen Learner-Builder, erzeugt `imsmanifest.xml`, prüft alle Dateien,
schreibt eine deterministische ZIP und inspiziert anschließend die tatsächliche
ZIP erneut. Ein Fehler erhält eine vorhandene gültige Zieldatei.

## Lokaler SCORM-Harness

```bash
node apps/vocabulary-trainer/scripts/serve-scorm-test.mjs \
  --package dist/private-scorm/englisch-7a.scorm.zip --port 4174
```

Danach `http://127.0.0.1:4174/` öffnen. Der Parent-Frame stellt einen
SCORM-1.2-Mock bereit. Query-Parameter simulieren Zustände:

```text
?api=missing
?status=completed
?status=passed
?status=failed
?fail=initialize
?fail=set
?fail=commit
?fail=finish
```

Der Harness ist nur ein lokales QA-Werkzeug. Er wird nicht verpackt und ersetzt
keine echte ByCS-Prüfung.

### Moodle-naher Launch-Harness

Patch 4.0.1 ergänzt einen zweiten Test, der die Startdatei aus dem realen
Manifest liest, den Learner unter einem verschachtelten Pluginfile-Pfad
ausliefert und die `API` zwei Frame-Ebenen oberhalb bereitstellt:

```bash
node apps/vocabulary-trainer/scripts/serve-moodle-scorm-test.mjs \
  --package dist/private-scorm/englisch-7a.scorm.zip --port 4175
```

Die ausgegebene LMS-URL enthält absichtlich `id=123`, `scoid=456`,
`attempt=1` und `display=popup`. Diese Parameter bleiben beim simulierten
Moodle-Player. Das SCO startet ausschließlich die physische Manifestdatei
`index.html`, initialisiert seine Hash-Route erst intern und darf die äußere
URL nicht verändern. Auch dieser realistischere Harness ist keine echte
Moodle- oder ByCS-Abnahme.

## Paketstart und Vorabvalidierung

Vor einem Browserdownload prüft EduTools:

- `imsmanifest.xml` und `index.html` liegen direkt im ZIP-Root;
- `organizations default`, Organization-ID und `identifierref` sind konsistent;
- der Resource-`href` lautet exakt `index.html` – ohne Slash, Query oder Hash;
- Manifest- und statische Dateireferenzen sind relativ und vorhanden;
- es gibt keine lokale, absolute, Author- oder LMS-spezifische URL;
- es gibt keine generische interne `?id=`-Referenz;
- Paketcode navigiert weder `window.parent` noch `window.top`.

Bei einem Verstoß wird kein ZIP heruntergeladen. Das UI meldet:
„Das SCORM-Lernpaket konnte nicht korrekt erstellt werden“ und nennt den
konkreten Paketgrund.

## Retest nach „Ungültige Kursmodul-ID“

1. Die bisherige fehlerhafte SCORM-Aktivität löschen oder bewusst eine neue
   Lernpaket-Aktivität anlegen.
2. Ein mit Version 4.0.1 neu erzeugtes ZIP verwenden.
3. Die ZIP-Datei nicht entpacken.
4. Eine neue Aktivität „Lernpaket/SCORM“ anlegen.
5. Das ZIP hochladen und die Aktivität speichern.
6. Nicht die alte Aktivitäts-URL oder ein altes Lesezeichen wiederverwenden.
7. Die neue Aktivität in der Schüleransicht öffnen.
8. Erscheint der Fehler erneut, Screenshot, vollständige sichtbare URL der
   Moodle-Fehlerseite ohne Zugangsdaten sowie Browserkonsole dokumentieren.

## Abschluss und Lernstand

Unterstützte Abschlussregeln:

- `none`: SCORM wird initialisiert, aber kein Bearbeitungsstatus gesetzt.
- `first-completed-session`: Ein neuer Versuch wird `incomplete`. Die erste
  regulär beendete Flashcard-, Quiz-, Schreib- oder zeitlich vollständig
  beendete Speed-Session setzt `completed`.

Ein bloßes Öffnen oder ein Abbruch setzt nicht `completed`. Bereits vorhandene
Statuswerte `completed`, `passed` und `failed` werden nicht überschrieben. Es
werden keine Scores oder Wortergebnisse gemeldet.

Der detaillierte Vocabulary-Lernstand enthält Wiederholungsplanung,
Wortstatus, schwierige und gemerkte Wörter, Motivation, XP, Level und
Lernserie. Er bleibt lokal unter:

```text
edutools:vocabulary:<deploymentId>:course:<courseId>:learning
edutools:vocabulary:<deploymentId>:course:<courseId>:motivation
edutools:vocabulary:<deploymentId>:settings
```

Der SCORM-Versuch enthält höchstens `incomplete` oder `completed` und liegt im
LMS. Ein neuer oder zurückgesetzter SCORM-Versuch löscht den lokalen Lernstand
nicht. Der lokale Lernstand ist an Browser, Gerät, Origin, `deploymentId` und
Kurs-ID gebunden und wird nicht zwischen Geräten synchronisiert.

ByCS beziehungsweise Moodle kann den SCORM-Versuch dem angemeldeten
Benutzerkonto zuordnen. Die Vocabulary-App selbst liest oder speichert jedoch
keine Namen und übermittelt keine wortbezogenen Lernergebnisse.

## Paket aktualisieren

Bei einer neuen Version:

1. `deploymentId` und Kurs-ID unverändert lassen.
2. IDs unveränderter Wörter erhalten.
3. Neue Wörter mit neuen stabilen IDs ergänzen.
4. Nicht mehr aktive Wörter archivieren, statt ihre IDs wiederzuverwenden.
5. Paket neu bauen und inspizieren.
6. Die ZIP in ByCS bewusst ersetzen.
7. Die Persistenz mit der realen Checkliste prüfen.

Paketname, sichtbarer Titel und ZIP-Dateiname beeinflussen den Storage nicht.
Ein neues Wort beginnt ungelernt; archivierte Wörter werden nicht mehr
angeboten. Eine neue `deploymentId` erzeugt bewusst einen getrennten
Klassen-Namensraum.

## Datenschutz und Inhaltsgrenzen

Das Paket enthält App-Code, Design, genau einen Kurs, Runtime-Konfiguration,
SCORM-Manifest und technische Buildinformationen. Es enthält keine
Browserdaten, Lernstände, XP, Motivation, Namen, E-Mail-Adressen,
ByCS-Kennungen oder Zugangsdaten. `student_id`, `student_name`, Interactions,
Scores und `suspend_data` werden nicht für Vocabulary-Daten verwendet.
Es enthält außerdem keine ausgewählten Bilder, OCR-Rohdaten, Bounding Boxes,
Konfidenzen, OCR-Module, HEIC-/HEIF-Decoder, WASM-Engine oder Sprachmodelle.
Book Capture ist produktweit deaktiviert und kein Bestandteil des
SCORM-Learners.
SpeechRecognition, Sprechübung, Mikrofon-, Aufnahme- und Speech-XP-Funktionen
sind ebenfalls nicht enthalten. Die vorhandene reine Ausgabe sichtbarer
Source-Inhalte über `speechSynthesis` bleibt lokal im Browser und übermittelt
keine Sprachdaten an das LMS.

Das Paket ist nicht verschlüsselt. Eingeschriebene Teilnehmende können
ausgelieferte Webdateien technisch untersuchen. Der geschlossene ByCS-Kurs ist
eine Zugriffsbeschränkung, aber SCORM ist weder Kopierschutz noch DRM. Keine
Schulbuchbilder oder Verlagsaudios automatisch übernehmen. Die rechtliche
Prüfung konkreter Inhalte bleibt Aufgabe der veröffentlichenden Lehrkraft
beziehungsweise Schule.

## Upload in ByCS

1. ByCS-Kurs öffnen und Bearbeitung einschalten.
2. Aktivität „Lernpaket“ hinzufügen.
3. Die erzeugte `.scorm.zip` hochladen.
4. Aktivität speichern und als Lernender beziehungsweise über eine geeignete
   Vorschau öffnen.
5. Die vollständige
   [ByCS-Abnahmecheckliste](BYCS_SCORM_ACCEPTANCE.md) durchführen.

Erst nach dieser Prüfung darf das konkrete Paket als in ByCS erfolgreich
getestet bezeichnet werden.
