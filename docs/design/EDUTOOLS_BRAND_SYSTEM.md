# EduTools Brand-System 1.0

## Stand und Sprint

Der Brand-Sprint ist **Sprint 3.1**. Der unmittelbar vorherige umgesetzte Stand
ist Sprint 3.0 mit lokalem, kontrolliertem OCR-Bildimport im Author-Profil. OCR,
Course Builder, Lernmodi, lokale Speicher, Veröffentlichungsprofile und SCORM
bleiben fachlich unverändert.

Der Vocabulary Trainer ist die erste Referenzimplementierung des gemeinsamen
EduTools-Brand-Systems.

## Visuelle Referenz: Gruppenpuzzle / Jigsaw

Die veröffentlichte Gruppenpuzzle-App wurde am 15. Juli 2026 unter
`https://majudaschke-max.github.io/gruppenpuzzle-app/` ausschließlich visuell
bei 375 × 812, 1440 × 900 und 1920 × 1080 geprüft.

Sichtbar waren:

- eine warme, nahezu weiße Grundfläche;
- große radiale Pastellfelder in Flieder, Mint und Pfirsich;
- ein flieder- bis pfirsichfarbener Hero mit 32-Pixel-Rundung;
- matte, leicht getönte Karten mit ungefähr 24-Pixel-Rundung;
- sehr diffuse, großflächige Schatten;
- eine kräftige, eng gesetzte Titelhierarchie;
- großzügige Innenabstände und eine auf großen Viewports auf ungefähr
  1180 Pixel begrenzte Inhaltsbreite;
- klare, ruhige Buttons mit sichtbaren Rahmen und großen Touchflächen;
- mobil vollständig gestapelte Inhalte ohne horizontalen Überlauf.

Abgeleitet wurden ausschließlich die abstrakten Prinzipien Pastellverlauf,
organische Hintergrundfelder, matte Karten, großzügiger Weißraum, weiche
Rundungen, diffuse Schatten und klare Typografiehierarchie. Es wurden weder
Code noch Assets, Komponenten oder exakte Farbwerte übernommen.

> Die Gruppenpuzzle-App bleibt unverändert. Sie dient ausschließlich als
> visuelle Referenz für Pastellverläufe, organische Flächen und eine freundliche
> Formsprache.

Ihre pastell-violette Identität bleibt exklusiv. Die Gruppenpuzzle-App wurde in
diesem Sprint weder verändert noch als Abhängigkeit eingebunden.

## Gemeinsame Produktsprache

Alle künftig neu erstellten oder überarbeiteten EduTools-Apps teilen:

- Systemschrift und Typografiehierarchie;
- App-Shell, Navigation und Kurs-/Kontextdarstellung;
- 4-Pixel-Abstandsrhythmus;
- weiche Rundungen und matte Flächen;
- sparsame, diffuse Schatten;
- Button-, Karten-, Formular-, Feedback- und Fokuslogik;
- semantisch stabile Statusfarben;
- statische organische Hintergrundformen;
- reduzierte Bewegung;
- das kleine MJ-Autorensignet.

Die Apps unterscheiden sich über ein zentral aktiviertes Pastell-Theme.

## Brand Core und App-Theme

`design-system/css/brand-core.css` definiert ausschließlich die gemeinsamen
semantischen Rollen, Gradienten und das MJ-Signet. Konkrete Vocabulary-Werte
liegen in `design-system/css/themes/vocabulary.css`.

Die Aktivierung erfolgt ohne JavaScript auf dem Wurzelelement:

```html
<html data-edutools-theme="vocabulary">
```

Theme-Erkennung hängt weder von Kursnamen, Lehrwerk, Verlag, Sprache noch
Lerninhalt ab. Author, Learner, Browser und SCORM verwenden dasselbe Theme.

## Vocabulary-Farbwelt

> Der Vocabulary Trainer verwendet bewusst keine violett dominierte Farbwelt.
> Seine Markenfarben sind Himmelblau, Mint und zurückhaltendes Türkis mit
> kleinen warmen Apricot-Akzenten.

Zentrale Werte:

| Rolle | Wert | Verwendung |
| --- | --- | --- |
| Page Start | `#f7fcff` | sehr helles Himmelblau |
| Page End | `#f3fbf7` | sehr helles Mint |
| Hero Start | `#dcefff` | Himmelblau |
| Hero Middle | `#dff7ee` | Mint |
| Primary | `#176b7a` | primäre Aktion, 6,14:1 mit Weiß |
| Primary Hover | `#125e6d` | Hover, 7,37:1 mit Weiß |
| Primary Active | `#0e4e5b` | Active, 9,29:1 mit Weiß |
| Secondary | `#267c78` | zurückhaltendes Türkis |
| Warm | `#ad5c30` | kleiner Apricot-Akzent |
| Text | `#17323a` | Haupttext |
| Secondary Text | `#3f5960` | erklärender Text |
| Focus | `#175d8c` | sichtbarer Fokus |

Der Hauptverlauf verläuft von Himmelblau über Mint zu einer sehr hellen
neutralen Fläche. Apricot erscheint nur bei der Speed Challenge, kleinen
dekorativen Flächen und internen Orientierungsmustern. Es ersetzt niemals eine
Warnfarbe.

## App-Shell und organische Flächen

Die App-Shell trennt Produktfamilie, App-Name und Kurskontext. Die Navigation
bleibt vollständig erreichbar und zeigt aktive Routen zusätzlich strukturell.
Der Dashboard-Hero ist der stärkste Farbträger.

Organische Flächen entstehen ausschließlich mit lokalen CSS-Verläufen und
Pseudoelementen. Sie besitzen `pointer-events: none`, tragen keine Information,
bewegen sich nicht und werden mobil reduziert. Course Builder, Dialoge und
SCORM-Arbeitsbereiche bleiben funktional ruhiger.

## Komponenten

Karten besitzen matte helle Flächen, dezente Rahmen, großzügige Innenabstände
und diffuse Schatten. Lernmodi verwenden Unterakzente innerhalb derselben
Vocabulary-Palette:

- Flashcards: Himmelblau;
- Quiz: Mint;
- Schreiben: Türkisblau;
- Speed Challenge: Apricot;
- OCR/Import: heller Blau-Mint-Verlauf.

Primary-, Secondary-, Outline-, Text-, Destructive-, Compact- und Icon-Buttons
behalten dieselben Zustände und Touchziele. Der Flashcard-Button „Markieren“
beziehungsweise „Markierung entfernen“ bleibt ein vollständig umrandeter
Secondary-Button und löst keine fachliche Bewertung aus.

Formulare, Course Builder und OCR verwenden dieselben Oberflächen und
Fokusregeln, bleiben aber dichter als das Learner-Dashboard. OCR-Funktion,
Importdaten und Transaktionslogik wurden nicht verändert.

## Status und Accessibility

Erfolg, Information, Hinweis, Warnung und Fehler bleiben unabhängig vom
App-Theme in `tokens.css`. Bedeutung wird immer durch Text und Struktur
ergänzt. Pastellfarben werden nicht für schwachen Fließtext verwendet.

Gemessene Kontraste:

- Haupttext auf Page: `12,93:1`;
- Sekundärtext auf Weiß: `7,48:1`;
- gedämpfter Text auf Weiß: `5,21:1`;
- Weiß auf Primary: `6,14:1`;
- Fokus auf Weiß: `7,04:1`.

Touchziele bleiben mindestens 44 × 44 Pixel. Fokus wird über einen festen Ring
und einen weichen Fokus-Schatten angezeigt. `prefers-reduced-motion` reduziert
sämtliche nicht notwendigen Übergänge.

## MJ-Signet

> Die kleine MJ-Raute ist ein gemeinsames Autorensignet aller künftig neu
> erstellten oder überarbeiteten EduTools-Apps. Sie bleibt visuell nachgeordnet
> und wird als gemeinsame Komponente der App-Shell umgesetzt.

Die wiederverwendbare Komponente `.edutools-signature` liegt im Brand Core. Ein
quadratisches Element wird um 45 Grad, die Initialen darin um −45 Grad gedreht.
Das Signet steht einmal im Footer der App-Shell, ist kein Link und wird einmal
als „Erstellt von MJ“ angesagt. Es ist in Author, Learner, Browser und SCORM
enthalten.

> Bereits fertiggestellte externe Apps werden durch diesen Sprint nicht
> automatisch verändert. Eine spätere Ergänzung des MJ-Signets in der
> Gruppenpuzzle-App wäre ein separater kleiner Wartungsschritt.

## Buildgrenzen

Der positive Dateiplan liefert `brand-core.css` und `themes/vocabulary.css` in
Author, Learner und SCORM aus. Die interne Referenz `design-system/index.html`
und `design-system/brand-reference.css` bleiben Development-only. Es gibt keine
externen Fonts, Styles, Bilder oder SVG-Abhängigkeiten.

Unverbindliche Farbrichtungen werden ausschließlich intern dokumentiert:

- Grammar Trainer: Salbei und ruhiges Türkis;
- Reading Trainer: Apricot und warmes helles Gold;
- Writing Trainer: Rosé und Mauve;
- Exam Trainer: klares Blau und gedämpftes Indigo.

Es wurden dafür keine Apps, produktiven Theme-Dateien oder Auslieferungsprofile
angelegt.
