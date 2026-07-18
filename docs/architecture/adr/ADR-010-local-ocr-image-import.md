# ADR-010: Lokale Bildanalyse und Book Capture im Author-Profil

## Status

Superseded for product delivery by ADR-014; source retained but disabled

## Context

Lehrkräfte sollen gedruckte oder als Bild vorliegende eigene Wortlisten in den
vorhandenen Course Builder übernehmen können. Bilddaten können personenbezogen
oder urheberrechtlich sensibel sein. OCR ist außerdem groß, rechenintensiv und
fehleranfällig; sie darf weder zu einem zweiten Kursmodell noch zu zusätzlichen
Risiken in Learner- oder SCORM-Auslieferungen führen.

## Decision

- OCR ist ausschließlich ein optional geladener Author-Workflow im bestehenden
  Course Builder. Es gibt keine eigenständige OCR-Kursverwaltung.
- Tesseract.js, LSTM-WASM-Core und die Modelle Deutsch, Englisch, Französisch
  und Latein werden exakt versioniert und lokal mit Lizenz- und Hashmanifest
  gebündelt. CDN-, Cloud- und Netzwerkfallbacks sind ausgeschlossen.
- Bilder, Arbeitskopien, Bounding Boxes, Konfidenzen und Zeilenausschnitte sind
  flüchtig. Nur nach menschlicher Prüfung bestätigte kanonische Wortfelder
  gelangen über die bestehende Importtransaktion in einen editierbaren Kurs.
- Die Strukturierung ist sprach-, kurs- und lehrwerksneutral. Bounding Boxes und
  relative Abstände liefern nur Vorschläge; Spalten, Zeilen, Targets und
  Duplikatbehandlung bleiben kontrollierbar.
- Author-Dateipläne enthalten OCR-Code, Engine, WASM-Cores und Sprachmodelle.
  Learner- und SCORM-Dateipläne verbieten den gesamten `ocr/`-Pfad.
- Die Author-CSP erlaubt ausschließlich zusätzlich lokales Worker-Laden und
  `'wasm-unsafe-eval'`. Learner und SCORM behalten `worker-src 'none'` und keine
  WASM-Freigabe.
- Der Browserworkflow erzeugt weder Learner- noch SCORM-Builds. Nach dem Import
  bleibt der vorhandene JSON-Export die Übergabegrenze zum getrennten CLI-Build.
- Die produktive Oberfläche heißt „Book Capture“ und bildet genau vier sichtbare
  Schritte: Seiten hinzufügen, Prüfen, Übernehmen und Fertig. Analyse und
  technische Spaltenerkennung bleiben interne Zustände der vorhandenen
  Architektur.
- Mehrere Seiten teilen einen Zielkurs und standardmäßig eine Ziel-Unit. Sie
  können flüchtig geordnet, entfernt, gedreht, zugeschnitten und einzeln erneut
  analysiert werden.
- Valide Zeilen sind vorausgewählt. Fehler blockieren die Übernahme; Warnungen
  und Duplikate werden über „Nur zu prüfende Stellen“ konzentriert. Korrekturen,
  mehrere Targets und der Übernahmestatus arbeiten direkt auf dem bestehenden
  Vorschau-State. Verbinden, Teilen und Mehrfachaktionen bleiben als ältere
  interne Funktionen erhalten, erscheinen seit Sprint 3.6 aber nicht im
  normalen Schnellimport.
- Komplexe zwei- und dreispaltige Seiten werden seit Sprint 3.5 geometrisch
  strukturiert: wiederkehrende relative Lücken bestimmen höchstens zwei
  Spaltengrenzen, plausible Source-Zellen verankern fachliche Zeilen und nahe
  Fortsetzungen werden kontrolliert zugeordnet. Überschriften, Seitenmarker,
  Randdekorationen und nicht zuordenbare Blöcke sind keine Vokabelzeilen.
- Die in Sprint 3.5 eingeführte Klassifikation einer rechten Spalte als
  Beispiel, Hinweis/Usage, Wortbeziehung, ignorierbar oder unklar bleibt nur im
  internen erweiterten Architekturpfad. Der sichtbare Schnellimport verwendet
  sie nicht.
- Die frühere erneute Strukturierung bereits vorhandener dreispaltiger
  OCR-Boxen bleibt intern. Im sichtbaren Schnellimport werden geänderte Grenzen
  vor einer neuen, getrennten Source-/Target-Analyse angewendet.
- Seit Sprint 3.6 ist ein zweispaltiger Schnellimport der einzige sichtbare
  Standardmodus. Lehrkräfte legen vor der Erkennung zwei relative Grenzen für
  Source, Target und den ignorierten rechten Bereich fest. Source und Target
  werden als getrennte Canvases erkannt; der rechte Bereich wird bereits vor
  der OCR ausgeschlossen und beeinflusst weder Boxen, Zeilen noch Warnungen.
- Die frühere dreispaltige Klassifikation bleibt als interner, getesteter
  Architekturpfad erhalten, besitzt jedoch keinen Schalter im normalen
  Author-UI. Der kompakte Review zeigt Source, Targets, IPA und den begrenzten
  Zeilenausschnitt; manuelle optionale Felder bleiben nachgeordnet verfügbar.

## Consequences

### Positive Folgen

- Sensible Bilder verlassen den Browser nicht und werden nicht Teil eines
  Kurses oder Lernpakets.
- Der bestehende Course Builder, das kanonische Kursmodell und seine atomare
  Speicherung bleiben die einzige Inhaltsquelle.
- Große OCR-Assets belasten weder Lernende noch SCORM-Pakete.
- Sprachmodelle, Lizenzen und Laufzeitpfade sind reproduzierbar prüfbar.
- Menschliche Kontrolle bleibt vor jeder fachlichen Übernahme verbindlich.
- Der normale Lehrkräfte-Workflow spricht von Buchseiten, Analyse, Prüfen und
  Vokabeln statt von Engine-, Worker- oder Konfidenzdetails.

### Negative Folgen und Risiken

- Der Author-Build wird durch Engine und Sprachmodelle deutlich größer.
- Erster OCR-Start und Texterkennung können auf schwachen Geräten dauern.
- OCR kann Inhalte falsch erkennen; Konfidenz und Strukturvorschläge ersetzen
  keine fachliche Prüfung.
- Bilddekodierung, Worker und WASM können sich zwischen Browsern unterscheiden.
  HEIC/HEIF wird seit ADR-013 über einen lokal gebündelten Author-Adapter
  vorbereitet und hängt nicht mehr von nativer HEIC-Dekodierung ab.
- Flüchtige Entwürfe gehen bei Neuladen oder bewusstem Abbruch verloren.
- Eine Importhistorie oder Wiederherstellung nach einem Browser-Neuladen ist
  bewusst nicht Teil der Entscheidung.

## Alternatives considered

- Cloud-OCR wurde wegen Datenschutz, Offline-Ziel, Abhängigkeiten und
  Übertragungsrisiken verworfen.
- Ein externer lokaler Desktopdienst wurde wegen Installationsaufwand und einer
  zweiten Betriebsarchitektur verworfen.
- OCR im Learner oder SCORM wurde wegen Paketgröße, Angriffsfläche und fehlendem
  Lernbedarf verworfen.
- Automatische Übernahme ohne Vorschau wurde wegen unvermeidbarer
  Erkennungsfehler verworfen.
- Persistente Bild- und OCR-Entwürfe wurden wegen Datenschutz und zusätzlicher
  Storage-Migrationen verworfen.

## Date

2026-07-15, in Sprint 3.2 um den Book-Capture-Review, in Sprint 3.4 durch
ADR-013 um lokale HEIC-/HEIF-Dekodierung, in Sprint 3.5 um geometrisches
Smart Review und in Sprint 3.6 um den zweispaltigen Schnellimport ergänzt
