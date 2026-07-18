# EduTools

**Didaktisch durchdacht. Klar gestaltet.**

EduTools ist eine Produktfamilie hochwertiger, datenschutzfreundlicher und didaktisch fundierter Web-Apps für Lehrkräfte, Schülerinnen und Schüler sowie Eltern. Das Projekt befindet sich in der Foundation-Phase: Dieser Stand schafft die gemeinsame Struktur und Dokumentation, enthält aber noch keine Lern-App.

## Vision

EduTools entwickelt digitale Werkzeuge, die Unterricht vereinfachen und Lernen nachhaltiger machen. Didaktische Qualität, unmittelbare Verständlichkeit und ein ruhiges Produkterlebnis bestimmen technische und gestalterische Entscheidungen.

## Produktprinzipien

- Didaktik vor Technik
- weniger, aber besser
- offline first und Datenschutz als Standard
- einfache, konsistente und barrierearme Bedienung
- klare Trennung von Code und Inhalten
- modulare Evolution statt überladener Erstversionen

Die verbindliche Produktphilosophie steht in [EDUTOOLS.md](EDUTOOLS.md).

## Geplante Bereiche

- **Design System:** gemeinsame Tokens, Gestaltungsregeln und Komponenten
- **EduTools Core:** bewährte gemeinsame Funktionen für Storage, Theme, Navigation und Accessibility
- **Apps:** eigenständige fachliche Produkte
- **Courses:** von Programmlogik getrennte Kurs- und Inhaltsdaten
- **Documentation:** Produkt-, Architektur-, Design- und Qualitätsgrundlagen

Das erste geplante Produkt ist **EduTools – Vocabulary Trainer**. Sein vorläufiger Produktrahmen ist unter [apps/vocabulary-trainer/docs/PRD.md](apps/vocabulary-trainer/docs/PRD.md) dokumentiert.

## Projektstatus

**Foundation / frühe Entwicklungsphase.** Der aktuelle Sprint strukturiert das Projekt und stellt einen kleinen Design-System-Platzhalter bereit. Es wurden noch keine Lernfunktionen implementiert.

## Verzeichnisstruktur

```text
edutools/
├── docs/            # Produkt-, Architektur-, Design- und Qualitätsdokumente
├── design-system/   # statischer Platzhalter und vorbereitete CSS-Struktur
├── core/            # Platz für später bewährte gemeinsame Funktionen
├── apps/            # fachliche Produkte und app-spezifische Dokumentation
├── scripts/         # später mögliche, dokumentierte Hilfswerkzeuge
└── assets/          # produktübergreifende Marken-Assets
```

Kursdaten eines Produkts liegen künftig unter dessen `courses/`-Bereich und bleiben von der Programmlogik getrennt.

## Lokale Vorschau

`design-system/index.html` kann direkt in einem Browser geöffnet werden. Alternativ lässt sich im Projektstamm ein einfacher statischer Server starten:

```sh
python3 -m http.server 8000
```

Danach ist der Platzhalter unter `http://localhost:8000/design-system/` erreichbar. Es gibt keine Build-Schritte und keine externen Abhängigkeiten.

## Datenschutz und Offline-first

EduTools plant standardmäßig ohne Anmeldung, Cloud, personenbezogene Daten, Tracking oder unnötige externe Dienste. Daten sollen lokal verarbeitet und gespeichert werden. Jede spätere Ausnahme muss ausdrücklich dokumentiert werden.

## Wichtige Dokumente

- [Produktphilosophie](EDUTOOLS.md)
- [Roadmap](ROADMAP.md)
- [Zielarchitektur](docs/architecture/ARCHITECTURE.md)
- [Design System 0.1](docs/design/DESIGN_SYSTEM.md)
- [Definition of Done](docs/quality/DEFINITION_OF_DONE.md)
- [Beitragsrichtlinien](CONTRIBUTING.md)

## Lizenz

Dieses Projekt steht unter der [MIT-Lizenz](LICENSE).
