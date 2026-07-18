# ADR-014: Book Capture aus Produktbuilds entfernen

## Status

Accepted; supersedes ADR-010 and ADR-013 for current product delivery

## Context

Die lokale Bildanalyse konnte komplexe Schulbuchseiten trotz kontrolliertem
Review nicht zuverlässig genug in Vokabelzeilen strukturieren. Der große
OCR-/HEIC-Laufzeitpfad erhöhte zugleich Paketgröße, CSP-Rechte und
Wartungsaufwand. Für Lehrkräfte sind vorbereitete Tabellen und kanonische
EduTools-Kursdateien der transparentere Importweg.

## Decision

- In normalen Author-, Learner-, Browser- und SCORM-Produkten ist Book Capture
  deaktiviert und besitzt keinen sichtbaren Einstieg.
- Positive Build-Dateipläne schließen `ocr/`, `author/image-import/`, Engines,
  WASM, Modelle und HEIC-/HEIF-Decoder physisch aus.
- Das Author-Profil verwendet dieselbe restriktive CSP wie die übrigen
  statischen Produktprofile; OCR-spezifische Worker-, Blob- und WASM-Rechte
  entfallen.
- Der Quellcode und seine isolierten Regressionstests bleiben vorerst erhalten,
  werden aber nicht produktiv ausgeliefert. Eine erneute Aktivierung erfordert
  eine neue Architektur- und Qualitätsentscheidung.
- Der empfohlene Weg ist eine vorbereitete CSV-/TSV-/TXT-Tabelle oder eine
  validierte EduTools-JSON-Kursdatei. Eine neutrale CSV-Vorlage und ein
  kopierbarer, anbieterunabhängiger Strukturierungs-Prompt unterstützen diesen
  Weg.

## Consequences

Produktbuilds werden kleiner, besitzen weniger ausführbaren Drittcode und
benötigen keine OCR-spezifische CSP. Bilder können derzeit nicht direkt in der
App verarbeitet werden. Bestehende Kurse, tabellarischer Import, manueller
Editor und JSON-Roundtrip bleiben unverändert.

## Date

2026-07-15
