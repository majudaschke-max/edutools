# EduTools Design System 2.0

Die verbindliche Marken- und Theme-Architektur ist in
[`EDUTOOLS_BRAND_SYSTEM.md`](EDUTOOLS_BRAND_SYSTEM.md) dokumentiert. Dieses
Dokument fasst die appübergreifende Komponenten- und Interaktionsgrundlage
zusammen.

## Designrichtung

EduTools verbindet die Ruhe skandinavischer Lern- und Arbeitsräume mit einer
freundlichen, organischen Pastellsprache. Die Oberfläche wirkt hochwertig,
leicht und zugänglich – nicht kindlich, technisch-kalt oder spielerisch.

> Das Design unterstützt die nächste sinnvolle Lernhandlung.

Fachliche Orientierung hat Vorrang vor XP, Lernserie, Dekoration und Bewegung.

## Architektur

- `design-system/css/tokens.css`: Struktur, Typografie, Abstände, Statusfarben
  und technische Grundlagen;
- `design-system/css/brand-core.css`: gemeinsame Markenrollen, Verläufe,
  Oberflächen und MJ-Signet;
- `design-system/css/themes/vocabulary.css`: konkrete, zentral aktivierte
  Vocabulary-Farbwelt;
- `design-system/css/base.css`: Reset, Typografie und globaler Fokus;
- `design-system/css/components.css`: Buttons, Karten, Formulare und Feedback;
- app-spezifische CSS-Module: ausschließlich fachliche Komposition.

Die interne Referenz unter `design-system/index.html` wird nicht in Learner-
oder SCORM-Builds ausgeliefert.

## Gemeinsame Komponenten

- App-Shell, Skip-Link und beschriftete Hauptnavigation;
- einmaliges, nicht interaktives MJ-Signet;
- Primary-, Secondary-, Outline-, Text-, Destructive-, Compact- und
  Icon-Buttons;
- Standard-, interaktive, Status-, Statistik-, Feedback- und Empty-State-
  Karten;
- Textfelder, Textareas, Selects, Checkboxen und native Radiogruppen;
- native Dialoge und Fortschrittsanzeigen;
- textlich verständliche Statusflächen und Badges.

Interaktive Komponenten definieren Default, Hover, Focus, Active, Selected und
Disabled. Browserfokus wird nie ersatzlos entfernt. Touchziele sind mindestens
44 × 44 Pixel groß.

## Semantische Statusfarben

Erfolg, Information, Hinweis, Warnung und Fehler bleiben von App-Themes
getrennt. Farbe vermittelt Bedeutung nie allein. Der warme Apricot-Akzent des
Vocabulary Themes ist deshalb keine Warnfarbe; Mint ist nicht automatisch
Erfolg.

## Typografie, Abstände und Bewegung

Die UI nutzt ausschließlich lokale Systemschrift-Stacks. Abstände folgen dem
4-Pixel-Rhythmus. Weiche Rundungen und drei diffuse Schattenstufen bilden
Hierarchie; Rahmen und Flächen bleiben bevorzugte Trennmittel.

Übergänge dauern 120 bis 320 Millisekunden und unterstützen nur Orientierung.
`prefers-reduced-motion` reduziert unnötige Übergänge technisch auf ein
Minimum. Bewegte Verläufe, Parallax, dauerhaft pulsierende Elemente und
Konfetti gehören nicht zum System.

## Responsive und Accessibility

Das System ist mobile-first. Inhalte bleiben ab 320 Pixel und bei 200-%-Zoom
nutzbar. Lange Kursnamen, Source-Wörter, Targets, Hinweise und Beispielsätze
brechen um. Breite Arbeitsbereiche scrollen nur lokal und gekennzeichnet.

Verbindlich bleiben WCAG-AA-Kontraste, sichtbarer Fokus, semantische Landmarken,
native Formelemente, verständliche Statusbeschriftungen und dekorative Formen
außerhalb des Accessibility Trees.
