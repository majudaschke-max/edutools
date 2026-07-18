# Course Builder – Kurse erstellen und austauschen

## Empfohlener Nutzerweg

1. Eine vorhandene EduTools-JSON-Kursdatei über „Kursdatei importieren“ öffnen,
   eine vorbereitete Tabelle importieren oder einen Kurs manuell anlegen.
2. Bei einem neuen Kurs Kurstitel, Source- und Target-Sprache auswählen.
3. Units und Wörter ergänzen beziehungsweise eine CSV-/TSV-/TXT-Tabelle prüfen.
4. Den fertigen Kurs über „EduTools-Kursdatei herunterladen“ als JSON sichern
   oder über „SCORM-Lernpaket herunterladen“ als fertiges ByCS-/Moodle-ZIP
   bereitstellen.

Der lokale Bildimport ist deaktiviert, weil komplexe Schulbuchseiten lokal
nicht zuverlässig genug strukturiert wurden. EduTools besitzt keine
Bildauswahl, OCR oder Bildübertragung. Als geführte Alternative kopiert die
Author-App einen Prompt; Fotos, Screenshots, PDFs oder Listen lädt die
Lehrkraft anschließend selbst in einem externen KI-Chat hoch und importiert
nur die dort heruntergeladenen EduTools-JSON-Dateien zurück.

## Tabelle und CSV-Vorlage

„Vokabelliste importieren“ akzeptiert eingefügten Text und UTF-8-Dateien im
bestehenden CSV-, TSV- oder TXT-Format. Kursname und Sprachen werden vor der
Vorschau festgelegt; der Sprint-3.8-Ablauf und seine Statuslogik bleiben in
Version 4.0.2 fachlich unverändert. Die
downloadbare neutrale CSV-Vorlage enthält:

`source,target,phonetic,hint,example,tags,unit`

Mehrere Targets und Tags werden innerhalb einer Zelle mit `|` getrennt. Die
Vorlage enthält nur neutrale Beispieldaten und kann in Tabellenprogrammen
bearbeitet werden. Die bestehende Vorschau, Unit-Zusammenfassung, Statuslogik,
Duplikatentscheidung und atomare Übernahme bleiben verbindlich. Die neutrale
Releasefixture importiert 19 Vokabeln in zwei Units mit null Warnungen und null
Fehlern; Reload, Course Builder, Export und Wiederimport werden gemeinsam
regressionsgeprüft.

„Import-Prompt kopieren“ kopiert eine anbieterneutrale Arbeitsanweisung mit
dem tatsächlich importierbaren EduTools-JSON-Schema. Der Prompt unterscheidet
vollständige dreispaltige Seiten, einfache Source-/Target-Listen und gemischte
Vorlagen. Er ordnet Beispielsätze, Hinweise, Sonderformen und farbige Kästen
den vorhandenen Feldern zu und lässt fehlende Lautschrift oder Beispiele nur
kontrolliert ergänzen. Vorhandene Inhalte haben Vorrang; unsichere und neu
ergänzte Angaben müssen in einem separaten Prüfbericht genannt werden.

Der vollständige Prompt liegt seit Sprint 4.1.2 nicht mehr als JavaScript-
String vor, sondern als versionierte lokale UTF-8-Klartextressource. Eine
zentrale Registry legt Prompttyp, Version, erlaubte Platzhalter und SHA-256-
Integrität fest. Loader, Template-Engine und Generator füllen ausschließlich
die deklarierten Werte für Kursname, Source- und Target-Sprache sowie das
aktuelle importierbare Schema. Promptcode und -ressourcen werden nur im
Author-Build ausgeliefert.

Die Verarbeitung findet ausschließlich in einem von der Lehrkraft selbst
gewählten externen KI-Chat statt. EduTools kopiert nur Prompttext in die
Zwischenablage und sendet weder Bilder noch Dateien, Kursdaten oder andere
Inhalte an einen Dienst. Automatisch ergänzte Inhalte müssen vor dem Import
fachlich geprüft werden.

Der geführte Ablauf zeigt vier Schritte: Import-Prompt kopieren, ChatGPT in
einem neuen sicheren Tab öffnen, eine oder mehrere JSON-Dateien herunterladen
und alle zusammengehörigen Dateien in EduTools auswählen. Die App prüft jeden
Teil, zeigt Dateinamen und Status sowie eine gemeinsame Vorschau und speichert
transaktional genau einen Kurs. Abweichende Titel, Sprachen, Speech-Locales,
`appType` oder `schemaVersion` blockieren die Zusammenführung.

Im Einzelnen: (1) Import-Prompt in EduTools kopieren, (2) ChatGPT öffnen,
(3) Prompt einfügen, (4) Vokabelseiten dort hochladen, (5) erzeugte JSON-Datei
oder JSON-Dateien herunterladen, (6) zu EduTools zurückkehren, (7) alle Teile
auswählen, (8) Vorschau prüfen und (9) als einen Kurs importieren. Der
Dateiimport findet vollständig lokal in der Author-App statt. Es wird keine
API benötigt. ChatGPT Plus ist weder Bestandteil von EduTools noch eine
technische Schnittstelle der App.

Gleichnamige Units werden stabil zusammengeführt. Optionale Metadaten verwenden
bei Konflikten den ersten nicht leeren Wert der Auswahlreihenfolge und erzeugen
eine Warnung. Exakte Duplikate werden aus Unit, Source und Targets nach sicherer
Unicode-/Whitespace-Normalisierung erkannt und erst nach der sichtbaren Wahl
„überspringen“ oder „behalten“ beim Commit behandelt. Der klassische
„Kursdatei importieren“-Weg bleibt davon getrennt und stellt vollständige
EduTools-Sicherungen mit stabilen IDs wieder her.

## Sprachen und Felder

Sprachcodes und Speech-Locales werden aus der zentralen Sprach-Registry
abgeleitet und nur informativ angezeigt. Wörter unterstützen Source, mehrere
Targets, Lautschrift, Scaffolding-Hinweis, Beispiel, Tags und Unit. `hint`
gehört in die Source-/Lernsprache; Übersetzungen gehören in `targets`.

## Kursdatei und Lernpaket

Die versionierte JSON-Datei enthält Kursmetadaten, Sprachen,
Aussprachekonfiguration, Units, Wörter, stabile IDs und Inhaltsversion. Sie
enthält keine Lernstände, Wiederholungstermine, Markierungen, XP, Audio,
Transkripte oder personenbezogene Browserdaten. Ein Export lässt sich über den
kanonischen Importpfad wieder als eigener Kurs öffnen.

Das getrennte SCORM-Lernpaket ist ein vollständiges ZIP mit
`imsmanifest.xml`, startfähigem Learner, Runtimeprofil und genau den
freigegebenen, nicht archivierten Inhalten des aktuellen eigenen Kurses. Der
Author-Build verwendet einen eingebetteten, separat validierten
Produktions-Learner als Vorlage. Manifest und ZIP werden mit denselben
dependency-freien Modulen wie im CLI erzeugt. Die ZIP-Datei wird nicht
entpackt, sondern direkt als SCORM-Aktivität in ByCS/Moodle hochgeladen.

Der Export übernimmt keine Lernstände, Markierungen, Wiederholungstermine,
Motivation, XP, Lernserie, Importhistorie oder Browserdaten. Kurs-ID, Unit- und
Wort-IDs bleiben erhalten; die technische Deployment-ID wird stabil aus der
Kurs-ID abgeleitet.

## Buildgrenzen

Nur das Author-Profil enthält Kursbibliothek, Editor und Import/Export.
Produktive Author-, Learner-, Browser- und SCORM-Builds enthalten keine OCR-,
HEIC-/HEIF-, Bildanalyse-, WASM- oder Sprachmodell-Assets. Der historische
Quellpfad bleibt deaktiviert und wird nicht ausgeliefert. Learner und SCORM
enthalten außerdem weder Tabellen-/JSON-Import noch Course Builder;
SpeechRecognition- oder Mikrofonmodule existieren in keinem Produktprofil.
