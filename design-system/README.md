# EduTools Design System

Das gemeinsame Designsystem verbindet die ruhige Richtung **Nordic Education**
mit einem semantischen Brand Core und klar getrennten App-Farbwelten. Der
Vocabulary Trainer ist mit seinem Himmelblau–Mint-Theme die erste vollständige
Referenz-App.

## Vorschau

`index.html` lässt sich direkt im Browser öffnen. Alternativ im Projektstamm:

```sh
python3 -m http.server 8000
```

Anschließend `http://localhost:8000/design-system/` aufrufen.

## Struktur

- `css/tokens.css`: verbindliche semantische Tokens und Kompatibilitätsaliase
- `css/brand-core.css`: gemeinsame Markenrollen, Verläufe und MJ-Signet
- `css/themes/vocabulary.css`: produktives Vocabulary-Theme
- `css/base.css`: Reset, Typografie, globaler Fokus und Reduced Motion
- `css/components.css`: Buttons, Karten, Formgrundlage, Badges und Feedback
- `css/layout.css`: Layout der kleinen Showcase-Seite
- `css/utilities.css`: minimale Accessibility-Hilfsklassen
- `index.html`: interne Author-/Development-Referenz
- `brand-reference.css`: ausschließlich interne Farbstudien; nie Teil eines
  Learner- oder SCORM-Builds

Markenarchitektur und App-Themes stehen in
[`docs/design/EDUTOOLS_BRAND_SYSTEM.md`](../docs/design/EDUTOOLS_BRAND_SYSTEM.md),
Komponentenprinzipien in
[`docs/design/DESIGN_SYSTEM.md`](../docs/design/DESIGN_SYSTEM.md). Die im
Vocabulary Trainer praktisch verwendeten Muster sind zusätzlich in dessen
[`docs/DESIGN_SYSTEM.md`](../apps/vocabulary-trainer/docs/DESIGN_SYSTEM.md)
dokumentiert.
