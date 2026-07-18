# Vocabulary Trainer – Release-Checkliste

## Öffentliche GitHub-Pages-Freigabe

- [ ] Paketmetadaten und produktive Cache-Referenzen nennen einheitlich `4.0.5`.
- [ ] ausschließlich der explizite Pages-Deployment-Satz wird verwendet.
- [ ] private Kurse, Profile und `dist/private-scorm` fehlen im Artefakt.
- [ ] JSON-Roundtrip, Tests, Syntax, Profile, Assembly und HTTP-Smoke bestehen.
- [ ] KI-Vorbereitung enthält keine lokale Bildauswahl und führt direkt zum
      standardmäßig gewählten JSON-Neuimport.
- [ ] Browser-SCORM-Export lädt unter `/edutools/author/` alle Paketdateien,
      ignoriert `.nojekyll` und erzeugt ein validiertes ZIP.
- [ ] ausschließlich `dist/pages` wird hochgeladen.
- [ ] ein zweiter Clean Build besitzt denselben strukturellen Release-Hash.
- [ ] keine absoluten lokalen Pfade, temporären Dateien oder alten Assets enthalten.
- [ ] OCR, HEIC/HEIF, Tesseract, Book Capture, SpeechRecognition,
      Mikrofoncode und Authoring fehlen im Root-Learner.
- [ ] echte `page_url` wird erst nach autorisiertem Deployment dokumentiert.

## Privates SCORM-1.2-Paket

- [ ] Browserexport nennt aktiven Kurs, freigegebene Units, Wörter und Sprachen.
- [ ] JSON-Sicherung und SCORM-ZIP sind im Author-UI eindeutig getrennt.
- [ ] bei 19 verfügbaren Flashcard-Wörtern enthält „Alle“ wirklich 19 IDs.
- [ ] Kurs-JSON stammt aus einem bewussten Author-Export.
- [ ] keine personenbezogenen oder nicht freigegebenen Inhalte enthalten.
- [ ] private Dateien liegen nur unter Git-ignorierten Pfaden.
- [ ] `deploymentId`, Kurs-ID und bestehende Wort-IDs sind stabil.
- [ ] SCORM-Profil besteht `--validate-only`.
- [ ] Paket wurde mit `build-scorm.mjs` erzeugt.
- [ ] dieselbe ZIP besteht `inspect-scorm.mjs`.
- [ ] Manifest liegt im ZIP-Root und startet `index.html`.
- [ ] Manifeststart besitzt weder führenden Slash noch Query oder Hash.
- [ ] Moodle-naher Harness erhält äußere `id`-/`scoid`-Parameter unverändert.
- [ ] reale ByCS-Abnahme verwendet eine neu angelegte SCORM-Aktivität.
- [ ] genau ein Kurs und keine Author-Module enthalten.
- [ ] Book Capture, OCR-Module, Engines, Modelle und Bilddaten fehlen vollständig.
- [ ] SpeechRecognition, Sprechübung, Mikrofon- und Aufnahmefunktionen fehlen.
- [ ] bestehende Source-Audioausgabe funktioniert weiterhin ohne Mikrofonrecht.
- [ ] Footer zeigt nur EduTools und das MJ-Signet, ohne Werbeclaim.
- [ ] zwei identische Builds sind byte-identisch.
- [ ] Harness prüft vorhandene sowie fehlende API.
- [ ] alle Lernmodi und Sessionabschluss im Harness geprüft.
- [ ] Browser-QA bei 320, 375, 768 und 1440 Pixeln bestanden.
- [ ] echte ByCS-Abnahme mit `BYCS_SCORM_ACCEPTANCE.md` steht aus oder ist
      nachvollziehbar dokumentiert.

Rollback: die letzte bekannte gültige private ZIP erneut hochladen. Für
denselben Klassenstand `deploymentId`, Kurs-ID und Wort-IDs nicht ändern.
