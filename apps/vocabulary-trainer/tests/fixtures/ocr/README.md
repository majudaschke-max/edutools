# Neutrale OCR-Testbilder

Diese Bilder sind künstliche, selbst erzeugte Tabellen für die lokale
OCR-Qualitätssicherung. Sie enthalten keine Lehrwerksseiten, Verlagstitel,
Schulbuchgestaltung oder geschützte Beispielsätze.

- `neutral-en-de.png`: zwei Spalten mit frei gewählten englisch-deutschen
  Einzelwörtern und einer alternativen Übersetzung.
- `neutral-fr-la.jpg`: drei neutrale Spalten für Französisch, Deutsch und
  Latein; die dritte Spalte dient der manuellen Spaltenzuordnung.
- `complex-three-column.json`: neutrale Geometrie einer komplexen dreispaltigen
  Seite mit IPA, Umbrüchen, Abschnitten, Infoboxen und Seitenmarker.
- `quick-import-three-column.json`: neutrale dreispaltige Schnellimport-Seite
  mit Tabellenartefakten, 18 Source-/Target-Zeilen, zwei Abschnittstiteln und
  zwei ausdrücklich ignorierten farbigen Hinweisboxen.

Die Dateien werden von `scripts/generate-ocr-fixtures.py` deterministisch mit
einer lokalen Systemschrift erzeugt. Sie sind Testfixtures und werden weder in
Author-, Learner- noch SCORM-Builds kopiert.
