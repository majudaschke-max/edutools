# Book Capture – deaktivierter historischer Quellpfad

> **Produktstatus seit Sprint 3.7:** Der Bildimport ist derzeit deaktiviert,
> weil komplexe Schulbuchseiten lokal nicht zuverlässig genug strukturiert
> wurden. Es gibt keinen sichtbaren Einstieg und keine OCR-/HEIC-Assets in
> produktiven Author-, Learner-, Browser- oder SCORM-Builds. Der empfohlene
> Importweg ist eine vorbereitete CSV- oder EduTools-JSON-Datei.
>
> Dieses Dokument beschreibt ausschließlich den erhaltenen, nicht
> ausgelieferten Quellpfad. Eine Reaktivierung erfordert eine neue Architektur-
> und Qualitätsentscheidung; siehe ADR-014.

Book Capture war ein Bildimport im bestehenden Course Builder. Es ist
kein zweiter Vokabeleditor und kein separates Kursmodell. Die bereits in Sprint
3.0 eingeführte lokale Analyse erzeugt einen flüchtigen Entwurf; nur bewusst
geprüfte Fachfelder gelangen über dieselbe Importtransaktion in einen eigenen,
importierten oder duplizierten Kurs.

> Die Bilder werden ausschließlich lokal im Browser verarbeitet. Sie werden
> nicht an einen externen Dienst übertragen und nicht im Kurs gespeichert.

> Book Capture erstellt einen bearbeitbaren Entwurf. Schreibweise,
> Übersetzungen, Lautschrift und Beispiele müssen vor der Übernahme kontrolliert
> werden.

> Kein Produktprofil enthält Book Capture, OCR-Software, HEIC-/HEIF-Decoder,
> WASM-Cores oder Sprachmodelle.

## Historischer Ablauf für Lehrkräfte (deaktiviert)

1. Im Course Builder den Zielkurs öffnen und „Buchseite importieren“ wählen.
2. Die vorhandene Ziel-Unit auswählen oder ausdrücklich einen Titel für eine
   neue Unit eingeben.
3. Eine Buchseite fotografieren, einen Screenshot wählen oder mehrere HEIC-,
   HEIF-, JPEG-, PNG- beziehungsweise WebP-Seiten hinzufügen. Drag-and-drop und
   Einfügen aus der Zwischenablage funktionieren innerhalb des geöffneten Dialogs.
4. Die vorgeschlagene Schnellimport-Aufteilung im Bild prüfen: links
   „Ausgangsbegriffe“, mittig „Übersetzungen“, rechts „wird ignoriert“. Zwei
   native Schieberegler verschieben die relativen Grenzen per Maus, Touch oder
   Tastatur. Eine Aufteilung kann bewusst auf alle Seiten angewendet oder auf
   den automatisch aus den Bildseparatoren ermittelten Vorschlag zurückgesetzt
   werden. Fehlt ein belastbarer Separator, gelten ruhige Drittelwerte.
5. „Schnellimport starten“ wählen. Source und Target werden in getrennten
   Arbeitskopien lokal erkannt; der rechte Bereich wird nicht an die OCR
   übergeben. Seiten lassen sich vorher ordnen, entfernen, drehen und bei Bedarf
   zuschneiden. HEIC-/HEIF-Fotos werden vorher lokal vorbereitet; native
   Browserdekodierung ist dafür nicht erforderlich.
6. Die Zusammenfassung „Vokabeln erkannt · Stellen zu prüfen · Duplikate“
   lesen. Bei guter Erkennung sind valide Zeilen bereits zur Übernahme gewählt.
7. Mit „Nur zu prüfende Stellen“ Warnungen, Fehler und mögliche Duplikate
   konzentriert kontrollieren. Der Originalausschnitt bleibt erreichbar.
8. Problematische Vokabeln, valide Vokabeln, erkannte Abschnitte und nicht
   zugeordnete Inhalte in ihren getrennten Review-Gruppen prüfen. Bei einer
   erkennbar verschobenen Spalte kann ein begründeter Vorschlag einzeln
   übernommen und rückgängig gemacht werden.
9. Source, mehrere Targets und Lautschrift direkt korrigieren. Hint, Beispiel
   und Tags bleiben unter „Weitere Felder“ vollständig bearbeitbar. Vokabeln
   können ein- oder ausgeschlossen und der auf Source plus Target begrenzte
   Bildausschnitt kann geprüft werden. Zeichenpositions-Teilung,
   Zeilenverschiebung und Massenwerkzeuge erscheinen nicht im normalen Review.
10. In der Importübersicht Ziel, Seitenzahl, ausgewählte und ausgeschlossene
   Vokabeln sowie Duplikatentscheidungen prüfen. Echte Feldfehler blockieren die
   Übernahme.
11. „Vokabeln übernehmen“ wählen. Anschließend kann direkt gelernt, eine weitere
    Buchseite importiert, die vollständige Kursdatei heruntergeladen oder zum
    Course Builder zurückgekehrt werden.

„Kursdatei herunterladen“ erstellt die JSON-Datei automatisch aus dem aktuell
gespeicherten Kurs. Sie muss weder manuell geschrieben noch bearbeitet werden
und kann später erneut importiert oder für Browser- und SCORM-Pakete verwendet
werden. Sie enthält Kurs, Sprachen, Units, Wörter und stabile IDs, aber keine
Bilder, OCR-Rohdaten, Bounding Boxes, Entwürfe, Lernstände, XP oder
Stimmenpräferenzen.

CSV, TSV, TXT sowie JSON-Import und -Export bleiben als weitere Formate
vollständig erhalten. Eine neue Unit wird nie allein aus einer erkannten
Überschrift angelegt; die Überschrift ist nur ein unverbindlicher Vorschlag.

## Vier sichtbare Schritte

1. **Seiten hinzufügen** – Ziel festlegen, Bilder vorbereiten, die zwei
   Spaltengrenzen prüfen und den Schnellimport ausdrücklich starten.
2. **Prüfen** – kompakte Erkennungszusammenfassung, Problemfilter, Originalseite
   und bearbeitbare Vokabelkarten.
3. **Übernehmen** – Ziel und Umfang bestätigen; noch vorhandene Fehler werden
   nicht still übersprungen.
4. **Fertig** – Zahl der übernommenen und nach bewusster Entscheidung
   übersprungenen Vokabeln sowie die vier Folgeaktionen.

Auf Desktop und großen Tablets stehen Originalseiten und Review nebeneinander.
Die Originalspalte bleibt beim Scrollen sichtbar. Auf kleinen Viewports werden
beide Bereiche untereinander angeordnet; die Originalseiten sind über ein
natives `details` auf- und zuklappbar, Vokabelzeilen bleiben Karten statt einer
breiten Tabelle.

## Wiederverwendete Architektur aus Sprint 3.0

- `image-preprocessor.js` validiert Bilder und verwaltet flüchtige Bitmaps,
  Object-URLs, Drehung, Crop, Arbeits-Canvases und Zeilenausschnitte.
- `author/image-import/heic-decoder.js` erkennt HEIC/HEIF und kapselt die
  optionale lokale JPEG-Konvertierung vor dieser Bildvorverarbeitung.
- `ocr-adapter.js` lädt genau einen lokal gebündelten Tesseract-Worker und
  verarbeitet Seiten nacheinander.
- `ocr-structure.js` gruppiert erkannte Wörter über relative Boxen und Abstände
  allgemein zu Zeilen und Spaltenkandidaten. Plausible Source-Zellen verankern
  fachliche Einträge; nahe Fortsetzungen werden zugeordnet. Überschriften,
  Seitenmarker, Randdekorationen und nicht zuordenbare Blöcke bleiben getrennt.
- `ocr-column-mapping.js` bildet Spalten auf kanonische Kursfelder ab.
- `ocr-preview-state.js` hält den editierbaren Entwurf, Filter, Auswahl, Reset
  und Duplikathinweise. Ältere Funktionen für Verbinden, Teilen und
  Mehrfachaktionen bleiben intern regressionsgetestet, sind im normalen
  Schnellimport aber nicht sichtbar.
- `ocr-import-transaction.js` validiert Ziel, Entwurf, Strategien und die
  vollständige Kurskopie, bevor der Service genau einmal speichert.

Die Implementierung enthält keine Kursnamen-, Lehrwerks-, Verlags- oder
Sprachenpaarlogik. Sie übersetzt nichts und ergänzt keine fehlenden Inhalte.

## Zweispaltiger Schnellimport und Smart Review

Der Standardvorschlag teilt eine Seite relativ bei ungefähr 34 und 68 Prozent.
Die erste Grenze trennt Source von Target, die zweite Target vom ignorierten
rechten Bereich. Nach Rotation, Crop und Skalierung entstehen zwei eigene
Canvases. Nur diese Source- und Target-Arbeitskopien werden nacheinander
erkannt; Ergebnisse erhalten ihre ursprünglichen horizontalen Offsets erst
beim geometrischen Zusammenführen zurück. Der rechte Bereich wird somit vor
OCR, Zeilenbildung und Feldzuordnung entfernt.

Eine plausible Source ist der fachliche Zeilenanker. Target-Zeilen ohne neue
Source werden nur bei passender vertikaler Nähe angehängt; ansonsten erscheinen
sie als „Nicht zugeordnet“. Dadurch werden leere Source-Felder und einzelne
Randzeichen nicht automatisch übernahmebereit.

IPA in eckigen Klammern wird aus der Source-Zelle extrahiert. Zusätze wie
`(to)` bleiben erhalten. Mehrzeilige Targets werden mit kontrolliertem
Whitespace beziehungsweise einer erkannten Trennstelle zusammengeführt. Ein
isolierter Buchstabe gilt weder als plausible Source noch als plausibles
Target.

Eine zentrale, konservative Bereinigung entfernt Tabellenlinien, Box- und
Warnsymbolreste, isolierte Striche, Seitenreferenzen sowie Randnummern. Sie
normalisiert keine fachlichen Schreibweisen. Abschnittsüberschriften wie
„Introduction“, „Skills training“, „Revision“ und „Word bank“ werden separat
gezählt. Ein Zeilenausschnitt endet an der zweiten Schnellimport-Grenze und
zeigt nur Source, Target und vertikalen Kontext.

Die kompakte Diagnose nennt Source-Zellen, Vokabeleinträge, Überschriften und
nicht zugeordnete Blöcke. Ein erneutes Analysieren verwendet die aktuell
gewählten Grenzen und erzeugt wieder getrennte Arbeitskopien. Die frühere
dreispaltige Klassifikation bleibt als interner Architekturpfad und
Regressionstest erhalten, wird aber nicht als experimenteller Modus angeboten.

## Targets, Warnungen und Duplikate

Mehrere Targets bleiben als Array im kanonischen Wortmodell. Im Review steht
jedes Target in einer eigenen Zeile. Akzente, Sonderzeichen und Lautschrift
werden nicht normalisiert oder erfunden. Kommas werden wegen ihrer möglichen
Bedeutungsfunktion nicht automatisch getrennt.

Valide unauffällige Zeilen sind standardmäßig aktiv. Unsichere Erkennung,
unklare Lautschrift oder verbliebene Artefakte werden kompakt als Text
markiert, nie nur durch Farbe. Der ignorierte rechte Bereich erzeugt keine
Warnungen. Ungültige Source- oder Target-Felder müssen korrigiert oder entfernt
werden, bevor die Importübersicht fortgesetzt wird.

Duplikate werden vor dem Speichern sichtbar. Je nach Fundort kann ein Eintrag
übersprungen, als neue Vokabel behalten, mit Targets ergänzt oder in derselben
Unit ersetzt werden. Zusammenführen und Ersetzen erhalten die bestehende
Wort-ID; Learning State, Wiederholungstermine und Markierungen werden nicht
mutiert. Andere Units werden nicht still geändert.

„Überspringen“ gilt auch für einen Treffer in einer anderen Unit, wenn als Ziel
eine neue Unit angelegt wird. Der bestehende Eintrag wird dabei weder kopiert
noch verändert; „Als neue Vokabel behalten“ bleibt eine bewusste Alternative.

## Datenschutz und Lebenszyklus

- Dateien, Bitmaps, Arbeits-Canvases, Bildausschnitte und technische
  Erkennungsdaten existieren nur während des geöffneten Workflows im Speicher.
- Bilder werden weder in `localStorage` noch IndexedDB, Kurs-JSON, Logs,
  Learner-Build oder SCORM-Paket geschrieben.
- Das Entfernen einer Seite widerruft ihre Object-URL und schließt ihr Bitmap.
  Abbruch, Abschluss, Kurswechsel und Runtime-Zerstörung widerrufen alle übrigen
  URLs, reduzieren temporäre Canvases und beenden den Worker.
- Engine, WASM-Cores und die Modelle `deu`, `eng`, `fra`, `lat` liegen
  versioniert in derselben Author-Auslieferung; es gibt keinen CDN-, Cloud- oder
  Netzwerkfallback.
- HEIC/HEIF wird mit `heic-to` 1.5.2 und libheif 1.22.2 lokal in eine
  JPEG-Arbeitskopie mit Qualität 0,92 gerendert. Die Ausgabe übernimmt keine
  EXIF-, XMP- oder GPS-Blöcke und wird wie jedes andere flüchtige Bild
  freigegeben.
- Urheberrecht, Datenschutz und Nutzungsrechte konkreter Vorlagen bleiben in der
  Verantwortung der importierenden Person.

## Aktuelle Buildgrenzen

Alle positiven Produkt-Dateipläne schließen `ocr/` und
`author/image-import/` aus. Das gilt auch für Author. Browser- und SCORM-Builds
enthalten keine Engine, Worker, WASM-Cores, Sprachmodelle oder Decoder; ihre CSP
benötigt deshalb weder Blob-Worker noch `wasm-unsafe-eval`. Der Quellcode und
isolierte Regressionstests verbleiben außerhalb der Builds.

## Bekannte Grenzen

- Höchstens zehn Bilder und 20 MB pro Bild; Arbeitskopien werden auf maximal
  2400 Pixel an der längsten Seite begrenzt.
- Doppelseiten können als ein Bild verarbeitet und per Crop vorbereitet werden;
  eine automatische Seitentrennung oder Perspektivkorrektur existiert nicht.
- Handschrift, gekrümmte Seiten, Schatten, starke Perspektive, dekorative
  Typografie und komplexe Tabellen können manuelle Korrekturen erfordern.
- Sehr stark geneigte, frei gesetzte oder ineinander verschachtelte Tabellen
  können trotz manueller Grenzen nicht sicher strukturiert werden. Smart Review
  ist keine Layout-KI und verwendet keine inhaltliche Übersetzung.
- Der Entwurf ist absichtlich nicht persistent und geht bei Neuladen oder
  bestätigtem Abbruch verloren. Eine Importhistorie ist nicht Teil von Sprint
  3.2.
- Sehr neue oder beschädigte HEIF-Varianten können trotz lokalem Decoder
  scheitern und müssen für eine konkrete Geräteflotte geprüft werden. Eine
  bereits laufende Einzeldekodierung kann nach Abbruch intern zu Ende laufen;
  ihr Ergebnis wird verworfen. Weitere Fotos werden nicht mehr begonnen.
- Die dokumentierte Qualitätsmessung verwendet eine neutrale synthetische
  Dreispaltenfixture mit 18 Einträgen. Ohne eine ausdrücklich bereitgestellte
  reale Praxisdatei werden keine realen Erkennungsquoten, Korrekturzahlen oder
  Review-Zeiten angegeben; die reale Praxistauglichkeitsabnahme bleibt offen.
