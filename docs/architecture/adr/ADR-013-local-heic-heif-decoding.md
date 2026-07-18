# ADR-013: Lokale HEIC-/HEIF-Dekodierung vor Book Capture

## Status

Superseded for product delivery by ADR-014; source retained but disabled

## Context

iPhones speichern Fotos häufig als HEIC/HEIF. Der bisherige Book-Capture-Pfad
akzeptierte diese Endungen, war aber auf eine native Browserdekodierung
angewiesen. Das war zwischen Browsern unzuverlässig. Bilder können zudem
personenbezogene EXIF- und GPS-Daten enthalten; ein Cloud-Konverter ist mit der
Offline- und Datenschutzarchitektur unvereinbar.

## Decision

- HEIC/HEIF wird anhand von MIME-Type **oder** Dateiendung zentral erkannt und
  vor `image-preprocessor.js` über einen gekapselten Author-Adapter dekodiert.
- Verwendet wird `heic-to` 1.5.2 mit libheif 1.22.2 in der unveränderten
  CSP-Variante. Modul und LGPL-3.0-Lizenz liegen mit SHA-256-Manifest lokal in
  `src/author/image-import/vendor/`; es gibt keinen CDN- oder Netzwerkfallback.
- Der Decoder wird erst beim ersten HEIC-/HEIF-Foto dynamisch geladen. Seine
  JavaScript-Datei ist 2.995.463 Byte groß und existiert ausschließlich im
  Author-Dateiplan.
- Die Ausgabe ist eine flüchtige JPEG-Arbeitskopie mit Qualität `0.92`. Dieser
  Wert hält kleine Schrift und Linien stabil, ohne die Arbeitskopie unnötig
  stark zu vergrößern. Seitenverhältnis und HEIF-Transformationen werden beim
  Rendern übernommen; EXIF-, XMP- und GPS-Blöcke werden nicht kopiert.
- Mehrfachauswahlen werden in Eingangsreihenfolge und mit höchstens einer
  aktiven Konvertierung verarbeitet. Fehler einer Datei verwerfen keine bereits
  gültigen Seiten. Ein Dateifingerabdruck verhindert Duplikate beim Retry.
- Abbruch wird über `AbortSignal` an der Adaptergrenze sichtbar wirksam. Eine
  bereits im Bibliotheks-Worker laufende Einzeldekodierung kann intern noch zu
  Ende laufen; ihr Ergebnis wird verworfen und nicht in den Workspace
  übernommen.
- Die CSP-Variante vermeidet `eval` und zusätzliche externe Ressourcen. Da die
  Bibliothek ihren lokalen Decoder in einem Blob-Worker ausführt, erlaubt nur
  die Author-CSP `worker-src 'self' blob:`. Für die flüchtige lokale
  Seitenvorschau erlaubt Author zusätzlich `img-src 'self' data: blob:`. Die
  bereits für OCR erforderliche Script-/WASM-Regel wird nicht erweitert.
  Learner und SCORM behalten `worker-src 'none'` und erhalten keine
  `blob:`-Freigabe für Bilder.
- HEIC-Original, JPEG-Arbeitskopie, Bitmap und Object-URL bleiben flüchtig. Nur
  bestätigte kanonische Wortfelder dürfen die vorhandene Importtransaktion
  erreichen.

## Consequences

### Positive Folgen

- iPhone-Fotos funktionieren unabhängig von nativer HEIC-Unterstützung des
  Browsers und bleiben vollständig lokal.
- JPG, PNG und WebP verwenden unverändert den bisherigen Pfad.
- Kamerametadaten gelangen weder in Vorschau-Export noch Kursdatei, Learner oder
  SCORM.
- Decoder, Version, Lizenz, Größe und Hash sind reproduzierbar prüfbar.

### Negative Folgen und Risiken

- Der Author-Build wächst um rund 3,0 MB; Learner und SCORM bleiben unverändert.
- Hochauflösende Kamerafotos benötigen vor der bestehenden 2400-Pixel-
  Arbeitskopie vorübergehend zusätzlichen Speicher und Rechenzeit.
- Der Bibliotheks-Worker ist nicht von außen terminierbar. Ein Abbruch beendet
  den EduTools-Ablauf sofort, kann eine bereits begonnene Einzeldekodierung aber
  nur verwerfen, nicht mitten im Codec stoppen.
- Browser- und Geräteunterschiede bei sehr neuen HEIF-Varianten bleiben
  möglich und müssen mit realen Kameradateien geprüft werden.

## Alternatives considered

- Native Browserdekodierung blieb wegen uneinheitlicher Verfügbarkeit
  unzureichend.
- `heic2any` wurde wegen älterer Veröffentlichung und weniger aktiver
  Weiterentwicklung nicht gewählt.
- `libheif-js` bietet eine niedrigere API, hätte aber mehr eigenen
  Canvas-/Worker-/Fehlercode und dieselbe LGPL-/Größenklasse erfordert.
- Cloud- oder Serverkonvertierung wurde wegen Datenschutz, Offline-Ziel und
  zusätzlicher Infrastruktur verworfen.
- Decoder in Learner oder SCORM wurde wegen fehlenden Lernbedarfs, Paketgröße
  und Angriffsfläche verworfen.

## Date

2026-07-15
