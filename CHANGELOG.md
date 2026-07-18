# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden in dieser Datei dokumentiert. Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).

## [Unreleased]

## [4.0.3] - 2026-07-17

### Added

- Die Author-App führt Lehrkräfte in vier sichtbaren Schritten vom lokalen
  Import-Prompt über einen sicher in neuem Tab geöffneten ChatGPT-Link bis zur
  Auswahl einer oder mehrerer heruntergeladener EduTools-JSON-Dateien.
- Zusammengehörige JSON-Dateiteile werden vor dem Speichern vollständig
  validiert, deterministisch zu einem Kurs zusammengeführt und mit Dateistatus,
  Vorschau sowie einer ausdrücklichen Entscheidung für exakte Duplikate
  angezeigt.

### Changed

- Der versionierte Prompt fordert bei größeren Kursen mehrere herunterladbare,
  nummerierte JSON-Dateien und einen getrennten, zahlenmäßig exakten
  Prüfbericht zu übernommenen, korrigierten, erzeugten und unsicheren Feldern.
- Der normale geführte Ablauf enthält weder Bildauswahl in EduTools noch ein
  Feld zum Einfügen einer Chatantwort. Der bestehende kanonische JSON-Restore
  bleibt als getrennte Kurssicherungsfunktion erhalten.

### Security

- EduTools verarbeitet und überträgt weiterhin keine Bilder, PDF-Dateien oder
  Chat-Inhalte. Nur ausdrücklich lokal ausgewählte JSON-Dateien werden im
  Browser gelesen; es gibt keine KI-API, kein Backend und keinen Netzimport.

### Changed

- Der bestehende Author-Importprompt liegt als versionierte lokale
  Klartextressource außerhalb des JavaScript-Codes. Registry, SHA-256-Prüfung,
  strikter Platzhaltervertrag und PromptGenerator ersetzen die bisherige
  hardcodierte Stringstruktur ohne sichtbare oder fachliche UI-Änderung.
- Prompt-Engine und Promptressource bleiben durch den positiven Dateiplan auf
  den Author-Build begrenzt; Learner und SCORM enthalten sie nicht.

### Security

- Die Prompt-Engine lädt ausschließlich registrierte lokale Ressourcen und
  führt weiterhin weder KI-API-Aufrufe noch Datenübertragungen aus.

## [4.0.2] - 2026-07-16

### Changed

- Der kopierbare, anbieterneutrale Importprompt erzeugt jetzt das tatsächlich
  importierbare EduTools-JSON-Schema und unterscheidet vollständige
  Schulbuchseiten, einfache Zweispaltenlisten und gemischte Vorlagen.
- Rechte Spalten, Beispielsätze, farbige Kästen, Sonderformen und sichere
  didaktische Ergänzungen besitzen klare Zuordnungs-, Prioritäts- und
  Prüfregeln. Der zugehörige Hilfebereich erläutert externe Verarbeitung und
  fachliche Kontrolle.

### Security

- EduTools kopiert weiterhin ausschließlich lokalen Prompttext in die
  Zwischenablage. Es wurden weder KI-SDK, API, Netzwerkübertragung noch neue
  externe Abhängigkeiten eingeführt.

## [4.0.1] - 2026-07-16

### Fixed

- Der globale Header der Author-App bezeichnet das Produkt wieder als
  „EduTools – Vocabulary Trainer“; „Course Builder“ bleibt ausschließlich die
  Funktionsbezeichnung des Autorenbereichs.
- Der SCORM-Harness startet jetzt ausschließlich die physische Startdatei aus
  `imsmanifest.xml` und hängt keine Hash-Route an den LMS-Start an.
- Ein zusätzlicher Moodle-naher Harness prüft den Learner in zwei
  verschachtelten Frames unter einem Pluginfile-Unterpfad sowie mit äußeren
  `id`-, `scoid`-, `attempt`- und `display`-Parametern.
- Die SCORM-1.2-API-Suche wartet kurz und begrenzt auf eine verzögert vom
  LMS bereitgestellte `API`, ohne Parent-, Top- oder Opener-URLs zu verändern.

### Security

- Der Browserexport validiert vor dem Download Rootstruktur, Manifeststart,
  Organization-/Resource-Verweise, paketrelative Assets, fehlende Dateien,
  LMS-spezifische `id`-Queries, lokale Pfade und verbotene Fensternavigation.
- Ungültige Pakete werden nicht heruntergeladen; das Author-UI zeigt die
  verständliche Hauptmeldung und den konkreten technischen Paketgrund ohne
  Stacktrace.

## [4.0.0] - 2026-07-16

### Added

- Flashcard-Sessions bieten abhängig vom tatsächlich verfügbaren Kursumfang
  fünf, zehn, fünfzehn oder ausdrücklich alle Wörter an; zehn bleibt nur die
  vorausgewählte Empfehlung.
- Eigene Kurse lassen sich in der Author-App direkt und vollständig lokal als
  SCORM-1.2-ZIP für ByCS beziehungsweise Moodle erzeugen. JSON-Sicherung und
  Lernpaket sind klar getrennt.
- Browser- und CLI-Paketierung teilen deterministische ZIP- und
  SCORM-Manifestmodule; der Author-Build enthält dafür einen geprüften,
  unveränderten Learner-Template-Build.

### Changed

- Die Source-Stimmenauswahl zeigt für britisches Englisch Daniel als Standard
  und optional genau eine installierte, kuratierte weibliche Alternative.
  Eddy, Flo und Grandma werden nicht mehr angeboten; insgesamt sind höchstens
  zwei konkrete Stimmen sichtbar.
- Produktive Cache-Referenzen und Metadaten verwenden konsistent Version
  `4.0.0`.

### Security

- Browsererzeugte SCORM-Pakete enthalten ausschließlich den Learner, genau
  einen freigegebenen Kurs und technische SCORM-Dateien. Authoring, OCR, HEIC,
  SpeechRecognition, Lernstände und Motivationsdaten bleiben ausgeschlossen.

## [3.9.0] - 2026-07-16

### Changed

- Produktive Source- und Assetreferenzen verwenden konsistent Version `3.9.0`.
- OCR-, HEIC- und Tesseract-Pakete bleiben für den historischen, deaktivierten
  Quellpfad reproduzierbar verfügbar, sind aber nur noch Entwicklungsabhängigkeiten.
- Motivation-Migration, UTF-8-/IPA-Import, JSON-Roundtrip, Dateipläne und
  deterministische Builds besitzen zusätzliche Regressionstests.

### Security

- Author-, Learner-, Pages- und SCORM-Validatoren lehnen OCR-/HEIC-, Book-
  Capture-, SpeechRecognition- und Mikrofonartefakte explizit ab.
- Book Capture kann nicht mehr durch ein abweichendes Produktprofil aktiviert
  werden.
- Nicht benötigte `data:`-Bild- und `blob:`-Medienfreigaben wurden aus der CSP
  entfernt; `worker-src 'none'` und der bestehende lokale Audioausgabepfad
  bleiben erhalten.

## [Historische Sprints]

### Added

- Sprint 3.7: lokale kalenderbasierte Lernserie mit einmaligem Tagesbonus,
  migrationssicherem Motivation State und Anzeige auf Dashboard und Fortschritt
- Sprint 3.7: neutrale UTF-8-CSV-Vorlage und kopierbarer Import-Prompt für den
  vorbereiteten Tabellenimport
- Initial EduTools foundation
- Project documentation structure
- ADR and PRD templates
- Design system placeholder
- Vocabulary Trainer product placeholder
- Sprint 3.1: gemeinsamer EduTools Brand Core, zentrales Vocabulary-Theme in
  Himmelblau–Mint und gemeinsames MJ-Autorensignet
- Sprint 3.2: Book Capture als primärer, vollständig lokaler Author-Workflow
  mit automatischer Analyse, Vier-Schritt-Review, Mehrseitenverwaltung,
  Problemfilter, Mehrfachbearbeitung und direkter Lernaktion
- Sprint 3.3: vereinfachte Kurserstellung mit zentraler Sprach-Registry,
  verständlichem Kursdatei-Download und durchgängigem Foto-zu-JSON-Workflow
- Sprint 3.4: vollständig lokaler HEIC-/HEIF-Import für iPhone-Fotos mit
  Author-only Decoder, JPEG-Arbeitskopien und stabiler Mehrfachauswahl
- Sprint 3.5: Smart Review für komplexe Vokabelseiten mit source-verankerter
  Zeilenbildung, dreispaltiger Inhaltsklassifikation, kontrollierter
  Neuzuordnung und erneuter Strukturierung aus vorhandenen OCR-Daten
- Sprint 3.6: zweispaltiger Schnellimport mit vor der Analyse einstellbaren
  Source-/Target-Grenzen, getrennten Arbeitskopien und vollständig ignoriertem
  rechten Seitenbereich
- Lokale Ausspracheeinstellungen für Tempo und eine verfügbare Source-Stimme
  mit robustem automatischem Fallback

### Changed

- Sprint 3.7: EduTools-JSON und vorbereitete Tabellen sind die primären
  Author-Importwege; mehrere Targets werden in der CSV mit `|` getrennt
- Sprint 3.7: Sessionboni wurden durch einen kursweiten Tagesbonus von 5 XP
  ersetzt; mehrere qualifizierende Sessions am selben Tag verlängern die Serie
  nicht erneut
- Verfügbare, nicht leere Units sind jetzt als native Karten-Buttons auswählbar
  und aktualisieren den bestehenden Kurs-State ohne Lernstände zu verändern
- Voice-Auflösung priorisiert Locale, Sprachmatch, lokale Stimmen und eine
  gekapselte Qualitätsheuristik; verzögert geladene Stimmen bleiben unterstützt
- Der bisherige technische Bildimport verwendet im normalen Workflow
  verständliche Book-Capture-Begriffe und konzentriert den Review auf
  problematische Stellen
- Die ausdrückliche Entscheidung „Überspringen“ wird bei kursweiten
  Duplikaten auch dann eingehalten, wenn Book Capture eine neue Ziel-Unit anlegt
- Kurstitel sowie Source- und Target-Sprache genügen nun zum Anlegen eines
  Kurses; Codes, Locales und OCR-Modelle werden zentral abgeleitet
- Die Stimmenauswahl zeigt einschließlich „Automatisch“ höchstens fünf
  verständlich benannte, passende Source-Stimmen
- Book Capture behandelt Überschriften, Seitenmarker und Infoboxen als eigene
  Struktur statt als Vokabeln, extrahiert IPA aus Source-Zellen und zeigt den
  Review nach validen, problematischen und nicht zugeordneten Inhalten gruppiert
- Book Capture startet erst nach bestätigter Spaltenvorschau; der normale Review
  konzentriert sich auf Source, Targets, IPA und begrenzte Zeilenausschnitte

### Removed

- Sprint 3.7: Book-Capture-Einstiege und OCR-/HEIC-/WASM-Assets aus allen
  produktiven Author-, Learner-, Browser- und SCORM-Builds; der historische
  Quellcode bleibt deaktiviert und separat getestet
- Werbeclaim im App-Footer; erhalten bleiben nur EduTools und das MJ-Signet
- Doppelte Wiedergabe der Nutzereingabe im falschen Quiz- und Schreibfeedback
- Sichtbare lehrwerksspezifische Beispieldaten und technische Spracheingaben
  aus der normalen Author-Oberfläche
- Zeichenpositions-Teilung, Zeilenverschiebung und OCR-Massenwerkzeuge aus dem
  normalen Schnellimport-Review
