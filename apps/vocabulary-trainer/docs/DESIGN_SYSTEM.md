# Vocabulary Trainer – Visuelles Designsystem 2.0

Dieses Dokument beschreibt die praktische Referenzimplementierung des
EduTools-Brand-Systems im Vocabulary Trainer. Die allgemeine Markenarchitektur
steht in
[`docs/design/EDUTOOLS_BRAND_SYSTEM.md`](../../../docs/design/EDUTOOLS_BRAND_SYSTEM.md),
die Komponentenbasis in
[`docs/design/DESIGN_SYSTEM.md`](../../../docs/design/DESIGN_SYSTEM.md).

## Designprinzipien

1. Die nächste sinnvolle Lernhandlung ist visuell am wichtigsten.
2. Fachlicher Fortschritt bleibt wichtiger als XP, Level und Lernserie.
3. Himmelblau, Mint und zurückhaltendes Türkis schaffen eine klare
   Vocabulary-Identität; Apricot bleibt ein kleiner warmer Akzent.
4. Großzügiger Weißraum und klare Gruppen ersetzen dekorative Dichte.
5. Status ist immer durch Text beziehungsweise Struktur und zusätzlich durch
   Farbe erkennbar.
6. Lernoberflächen sind ruhiger und luftiger als das funktional dichtere
   Autorenwerkzeug.

## Audit-Ausgangslage

Vor Sprint 2.1 waren Rohfarben zwar bereits auf eine Token-Datei begrenzt, das
System trug jedoch noch die ausdrücklich vorläufige Warm-Linen-/Dusty-Blue-
Palette. Fast die gesamte App-Gestaltung lag in einer 1.744 Zeilen langen
`dashboard.css`. Die App-Shell besaß keine sichtbare Hauptnavigation, das
Dashboard gruppierte Lernmodi nur als kleine Schnellzugriffe, Status-, Formular-
und Feedbackvarianten waren lokal wiederholt, und das Autorenwerkzeug verwendete
dieselbe visuelle Dichte wie die Lernoberflächen. Inline-Styles oder verteilte
Rohfarben waren nicht vorhanden.

## CSS-Struktur

`src/dashboard.css` ist nur noch ein nachvollziehbarer Einstiegspunkt und lädt:

```text
src/styles/
├── app-shell.css       App-Shell, Navigation, Seitenrhythmus und Dialoge
├── dashboard.css       Lernempfehlung, Lernmodi, Status und Motivation
├── content.css         Fortschritt, Formulare, Feedback und Empty States
├── learning-modes.css  Flashcards, Quiz, Schreiben, Speed und Aussprache
├── authoring.css       Kursbibliothek, Kurseditor, Units, Wörter und Import
└── responsive.css      wenige mobile-first Layoutübergänge
```

Gemeinsame Tokens, Reset und Komponenten bleiben unter `design-system/css/`.
`brand-core.css` enthält die gemeinsame Formsprache und das MJ-Signet;
`themes/vocabulary.css` enthält ausschließlich die zentrale Vocabulary-
Farbwelt. Das Theme ist statisch über
`data-edutools-theme="vocabulary"` aktiviert.
Es gibt keine CSS-in-JS-Lösung, kein Framework und keine neue Abhängigkeit.

## Farbpalette und Kontrast

Die Palette verwendet sehr helle himmelblaue und mintfarbene Flächen, Weiß für
zentrale Inhalte, dunkles Blaugrau für Text und gedecktes Türkis für primäre
Aktionen. Apricot unterstützt ausschließlich kleine warme Akzente. Erfolg,
Warnung, Fehler und Information besitzen weiterhin jeweils eine unabhängige
dunkle Text-/Rahmenrolle und eine separate Soft-Fläche.

Geprüfte Kontrastpaare:

| Kombination | Kontrast |
| --- | ---: |
| Haupttext / Page | 12,93:1 |
| Haupttext / Surface | 13,22:1 |
| Sekundärtext / Surface | 7,48:1 |
| Muted Text / Surface | 5,21:1 |
| Weiß / Brand Primary | 6,14:1 |
| Fokus / Surface | 7,04:1 |
| Statusfarbe / jeweilige Soft-Fläche | mindestens 5,15:1 |

## Typografie

Es werden ausschließlich lokale Systemschriften verwendet. Die UI nutzt einen
robusten Sans-Stack; Überschriften bevorzugen eine vorhandene systemeigene
Rounded-Schrift. Die vier semantischen Stufen `display-hero`, `page-title`,
`section-title` und `content-title` trennen Dashboard-Hero, kompakte
Funktionsseite, Abschnitt und eigentlichen Lerninhalt. Fließtext, Hilfstext,
Metadaten, Status und Buttontext besitzen eindeutige Tokenstufen. Lernbegriffe
und Timer verwenden tabellarisch beziehungsweise großzügig gesetzte Zahlen,
ohne Motivation mit Kompetenz zu verwechseln.

## App-Shell und Navigation

Der Header enthält Marke, aktiven Kurs, beschriftete Hauptnavigation und eine
beschriftete Einstellungsaktion. Hauptbereiche sind Dashboard, Lernen,
Fortschritt und Kurse. Unterseiten der Lernmodi markieren gemeinsam „Lernen“;
Units und Course Builder markieren gemeinsam „Kurse“. `aria-current="page"`
macht den aktiven Bereich programmatisch und visuell sichtbar.

Auf kleinen Viewports wird die Navigation als zweispaltige, klar beschriftete
Fläche dargestellt, ab Tabletbreite viergeteilt und auf breiten Desktops in
eine kompakte Kopfzeile integriert. Ein Skip-Link führt direkt zum fokussierbaren
Hauptinhalt. Es gibt kein unbeschriftetes mobiles Menü und kein horizontales
Navigationsscrollen.

Der Footer enthält genau einmal die gemeinsame `.edutools-signature`. Die
kleine CSS-Raute zeigt sichtbar `MJ`, ist nicht interaktiv und wird für
Screenreader einmal als „Erstellt von MJ“ beschriftet. Sie erscheint identisch
in Author, Learner, Browser und SCORM, ohne mit Lernaktionen zu konkurrieren.
Neben `EduTools` und dem MJ-Signet enthält der Footer keinen Werbeclaim und
keinen leeren Claim-Container.

### Visuelle Referenz und Abgrenzung

Die veröffentlichte Gruppenpuzzle-App wurde vor Sprint 3.1 visuell auf kleinen
und großen Viewports geprüft. Übernommen wurden nur die abstrakten Prinzipien
weicher Pastellverläufe, organischer Hintergrundfelder, matter Karten,
großzügiger Abstände, weicher Rundungen und diffuser Schatten. Ihre dominante
Flieder-/Violettwirkung, konkreten Farben, Komponenten, Assets und ihr Code
wurden nicht übernommen. Der Vocabulary Trainer bleibt durch Himmelblau–Mint
mit Türkis und wenig Apricot klar unterscheidbar.

### Profilabhängige Shell

Die visuelle Hierarchie bleibt in Author- und Learner-Veröffentlichungen
identisch; nur tatsächlich verfügbare Bereiche werden gezeigt:

- Das Author-Profil zeigt Dashboard, Lernen, Fortschritt und Kurse. Course
  Builder, Import und Export bleiben funktional und verwenden die dichtere
  Autorenoberfläche.
- Das Learner-Profil zeigt Dashboard, Lernen und Fortschritt. „Kurse“,
  Verwaltungsaktionen, Datei-Inputs und Autorenflächen werden nicht als
  deaktivierte Attrappen gerendert.
- Ist Motivation deaktiviert, entfällt der Motivationsbereich vollständig,
  ohne leere Karte. Ist Speed Challenge deaktiviert, entfällt sein Einstieg.
- Ein direkter Aufruf einer nicht verfügbaren Route zeigt einen ruhigen
  semantischen Empty State mit Seitentitel, Erklärung und Dashboard-Link.

Die Profilunterscheidung erzeugt keine zweite Farbpalette, Typografie oder
Komponentenfamilie. Navigation bleibt textlich eindeutig, fokusfähig und bei
320 Pixeln ohne horizontalen Überlauf.

### Unit-Auswahl

Aktuelle und verfügbare nicht leere Units verwenden die gesamte Kartenfläche
als nativen Button. Hover, Active, sichtbarer Fokus und `aria-pressed` machen
Auswahl und aktuellen Zustand zusätzlich zum Statuswort erkennbar. Die aktuelle
Unit bleibt öffnbar. Leere und gesperrte Units sind bewusst statische
Listeneinträge ohne Pointer-Cursor oder Scheininteraktion; leere Units erklären
„Diese Unit enthält noch keine Wörter.“. Die Ansicht verwendet konsequent den
Begriff „Units“.

## Dashboard

Die Reihenfolge folgt der fachlichen Priorität:

1. zentrale Lernempfehlung mit aktueller Unit und Lernzeit
2. neue, schwierige und gemerkte Wörter
3. vier zusammengehörige Lernmodus-Karten mit kurzer Erklärung
4. fachlicher Unit-Fortschritt
5. kompakte optionale Motivation
6. weitere ruhige Zugriffe auf Wiederholung, Markierungen, Units und Einstellungen

Die abstrakte Karteikartenform und wenige Pastellflächen erzeugen
Wiedererkennung, ohne Inhalte zu überlagern.

## Karten

- Standardkarten trennen Inhalte mit Rahmen und sehr kleinem Schatten.
- Interaktive Karten besitzen Hover und klaren Fokus, enthalten aber weiterhin
  eine eindeutige Aktion.
- Statuskarten verwenden eine kurze Akzentlinie plus Text.
- Lernmodus-Karten teilen Aufbau, Abstand und Aktionshierarchie.
- Empty States besitzen eine Erklärung und eine sinnvolle Rückkehraktion.
- Autorenkarten sind dichter und überwiegend rahmenbasiert.

## Buttons und Icon Buttons

Verfügbar sind Primary, Secondary, Text, Destructive, Compact und Icon. Alle
verwenden native Buttons oder Links, mindestens ungefähr 44 Pixel Touchhöhe,
einheitliche Rundung und klaren Fokus. Primary ist auf die wichtigste Aktion
eines Bereichs beschränkt. Destruktive Aktionen verwenden die Error-Rolle und
bleiben textlich eindeutig.

Icon Buttons sind rund, besitzen ein zugängliches Label und optional `title`.
Die Einstellungs- und Ausspracheaktionen sind die derzeitigen Referenzen. Emoji
werden nicht als alleinige Icons verwendet.

## Formulare und Auswahlkarten

Textfelder, Textareas, Selects und Datei-Inputs verwenden denselben Rahmen,
Fokus und Disabled-Zustand. Sichtbare Labels bleiben erhalten. Fehlermeldungen
stehen direkt beim betroffenen Kontext und verwenden Text, Soft-Fläche und
Akzentkante.

Quiz-, Schreib- und Speed-Konfigurationen behalten native Radio-Inputs. Das
verbundene Label wird als Auswahlkarte dargestellt; Auswahl und Fokus sind
zusätzlich durch Rahmen und Ring erkennbar.

## Feedback und Status

Richtig, noch nicht richtig, Hinweis, Information, Warnung und Fehler folgen
einem gemeinsamen Muster aus Text, ruhiger Soft-Fläche, Rahmen und Akzentkante.
Es gibt keine aggressive rote Vollfläche und keine beschämende Sprache.

Badges werden für Aktiv, Mitgeliefert, eigener Kurs, Aktuell, Freigegeben,
Gesperrt, Archiviert, Gespeichert, Ungespeichert, Bereit, Warnung, Fehler und
Duplikat genutzt. Der sichtbare Text bleibt die Bedeutung.

## Dialoge

Alle nativen Dialoge verwenden dieselbe Breite, Innenstruktur, Fläche,
Rundung, Schatten und mobile Begrenzung. Fokusfang, initialer Fokus,
Escape-Verhalten und Fokusrückgabe bleiben in den vorhandenen Laufzeitmodulen.
Abbruch ist sekundär; irreversible Bestätigung ist destruktiv und ausdrücklich
beschriftet.

## Lernmodi

### Flashcards

Die zentrale Karte ist visuell fokussiert. Begriff, Lernrichtung, Lautschrift,
Aussprache, Hinweis und Lösung sind klar gestaffelt. Nach dem Aufdecken sind
„Noch nicht“ und „Kann ich“ gleichwertige Secondary-Aktionen; die Gestaltung
drängt nicht zu einer unehrlichen Selbsteinschätzung.
Vor dem Aufdecken folgt die Kartenhöhe ausschließlich dem tatsächlichen Inhalt;
es gibt keine feste Mindesthöhe oder künstliche vertikale Zentrierung.

Vor jeder Session steht eine kompakte Konfiguration mit einem nativen
`fieldset` und drei Radio-Auswahlkarten. Source → Target ist vorausgewählt;
Target → Source und Gemischt bleiben gleichwertig erreichbar. In der
umgekehrten Richtung stehen mehrere Targets als ruhige, slash-getrennte Vorgabe
auf der Vorderseite. Die Source-Lösung samt Lautschrift und Source-Audio
erscheint erst nach dem Aufdecken.

„Markieren“ beziehungsweise „Markierung entfernen“ ist eine vollständig
umrandete Secondary-Aktion mit derselben Mindesthöhe wie die beiden
Bewertungsbuttons. Der aktive Zustand verwendet zusätzlich `aria-pressed`, Text
und eine ruhige Brand-Fläche. Auf schmalen Viewports stapeln sich alle drei
Aktionen ohne Überlauf; die Markierungsaktion bleibt fachlich von der Bewertung
getrennt.

### Quiz

Konfiguration, Frage, native Antwort-Radios, Feedback und Abschluss verwenden
dieselben Karten- und Feedbackmuster. Richtige und gewählte falsche Antwort
erhalten sowohl Textstatus als auch unterschiedliche Soft-Flächen.
Nach einer falschen Auswahl bleibt die eigene Wahl unmittelbar an der
Radiooption als „Ausgewählt“ erkennbar; der Feedbackbereich wiederholt sie
nicht als zusätzliche Zeile. Lösung, vorhandener Scaffolding-Hinweis,
Beispielsatz und die Aktion „Weiter“ bleiben vollständig erhalten.

### Schreibtraining

Das große Texteingabefeld und die Vorgabe bilden die zentrale Lernhandlung.
Hinweis und Aussprache bleiben untergeordnet. Die eigene Eingabe bleibt nach
der Prüfung im deaktivierten Eingabefeld sichtbar; der Feedbackbereich
wiederholt sie nicht. Korrekte Lösungen und vorhandene Lernhilfen stehen dort
weiterhin stabil und textlich eindeutig.

### Speed Challenge

Der Timer ist groß und ruhig. Beide Spalten bleiben auch bei 320 Pixeln sichtbar
und verwenden große native Buttons mit Umbruch. Auswahl, Treffer, Fehlversuch,
Pause und Abschluss sind zusätzlich textlich verständlich.

### Aussprache

Der runde Aussprache-Button ist visuell von Bewertung und Submit getrennt.
`aria-pressed`, wechselndes Abspielen-/Stopp-Symbol und Textlabel bilden den
aktiven Zustand redundant ab. Es gibt keine Pulsanimation.
Die zentrale fachliche Policy bietet Audio ausschließlich für die konfigurierte
Source-Rolle an; Target-Inhalte und unvollständig konfigurierte Sprachrollen
werden ohne Platzhalter oder leere Fokusziele ausgeblendet. Hinweise und
Beispiele sind mit dem konfigurierten Source-Code ausgezeichnet; das deutsche
UI-Label bleibt außerhalb dieses Sprachkontexts. Bei Target → Source wird vor
dem Aufdecken deshalb kein Audioelement gerendert; der Source-Audio-Button
entsteht erst zusammen mit der sichtbaren Lösung. Die konkrete Sprache spielt
für diese visuelle Regel keine Rolle.

Der Einstellungsabschnitt „Aussprache“ verwendet ein natives `fieldset` für
Langsam, Normal und Schnell sowie ein beschriftetes `select` für Automatik und
tatsächlich verfügbare Source-Stimmen. Locale und lokale Bereitstellung werden
im Optionslabel sichtbar, wenn der Browser mehrere Stimmen meldet. Target-
Stimmen erscheinen nicht. Fehlende Stimmen werden mit Hilfetext statt leerer
Auswahl behandelt; Änderungen werden ruhig in einer nicht sichtbaren Live-
Region bestätigt.

## Fortschritt und Level-up

`#/progress` trennt fachlichen Lernfortschritt und freiwillige Motivation in
eigenen Karten. Fachliche Kennzahlen stehen zuerst. Native Progress-Elemente
bleiben beschriftet. Meilensteine wirken wie ruhige Statuslisten, nicht wie
Sammelkarten. Level-up erscheint in einem kompakten markengetönten Dialog
ohne Sound, Konfetti oder Zwangspause während einer Aufgabe.

## Kursbibliothek und Autorenwerkzeug

Kurskarten priorisieren „Kurs verwenden“, während Bearbeiten, Exportieren,
Duplizieren, Archivieren und Löschen abgestuft bleiben. Der aktive Kurs ist über
Textbadge, Rahmen und getönte Fläche erkennbar.

Der JSON-Import integriert das echte native Datei-Input. Auswahlknopf,
Dateityphilfe, sichtbarer Dateiname, verknüpfter Fehler und Fokuszustand bleiben
auch mobil vollständig bedienbar; es gibt keinen nachgebauten Datei-Picker.

Die Kurserstellung ordnet höchstens drei verständliche Felder nebeneinander an:
Kurstitel, Ausgangssprache und Zielsprache zuerst, danach klar optionale
Metadaten. Die Beschreibung spannt die volle sinnvolle Breite. Technische
Sprachwerte liegen nur im standardmäßig geschlossenen nativen `details`
„Erweiterte Spracheinstellungen“. Mobil werden alle Bereiche gestapelt. Unit- und Wortaktionen umbrechen
in eigene Zeilen, ohne horizontale Seitenbreite zu erzeugen. Importvorschauen
dürfen nur innerhalb ihres klar markierten Bereichs horizontal scrollen.
Die leere Author-Bibliothek zeigt „Noch kein eigener Kurs“ und priorisiert
Kursdatei, vorbereitete Tabelle und manuelles Anlegen. Neutrale technische
Fallback-Inhalte werden dort nicht als Kurskarte gezeigt. Eigene, importierte
und duplizierte Kurse behalten sämtliche Editor-, Import- und Exportaktionen;
Herkunft oder Sprachenpaar verändern ihre visuelle Editierbarkeit nicht.

„EduTools-Kursdatei herunterladen“ bezeichnet ausschließlich die bearbeitbare
JSON-Sicherung. „SCORM-Lernpaket herunterladen“ bezeichnet ausschließlich das
ByCS-/Moodle-ZIP. Beide Aktionen sind mindestens 44 Pixel hoch, stehen in
getrennten ruhigen Flächen und besitzen eine unmittelbar folgende sachliche
Download- beziehungsweise Fehlerrückmeldung. Der SCORM-Bereich nennt Kurs,
freigegebene Units, Wörter und Sprachen vor dem Export.

### Importwerkzeuge und deaktivierter Bildimport

JSON-Datei und Tabelle sind die beiden primären Importflächen. Die Tabelle
bietet eine native Datei-/Texteingabe, eine ruhige CSV-Vorlagenaktion und die
sekundäre Aktion „Import-Prompt kopieren“. Eine Bildimport-Aktion existiert
nicht; OCR-/HEIC-spezifische Dialoge und Styles werden aus dem produktiven
Author-Build entfernt.

Die folgenden Regeln dokumentieren nur die historische, deaktivierte
Quellansicht und sind keine produktive Oberflächenvorgabe:

Dateiauswahl und Dropzone verwenden ein natives mehrfaches Datei-Input. Seiten
werden als geordnete Karten mit echter Bildvorschau, textlicher Position und
klaren Verschiebe-/Entfernaktionen dargestellt. Crop-Felder sind beschriftete
Zahleneingaben; Drehung verändert nur die Arbeitsvorschau.

Die Formatzeile lautet „Unterstützt: iPhone-Fotos, JPEG, PNG und WebP“.
HEIC-/HEIF-Vorbereitung verwendet denselben ruhigen Fortschrittsstil und eine
höfliche Live-Region; Datenschutztext und Abbruchaktion bleiben sichtbar. Der
technische Decodername erscheint nicht in der produktiven Oberfläche.

Die Review-Zusammenfassung nennt erkannte Vokabeln, Prüfstellen und Duplikate.
Der Filter „Nur zu prüfende Stellen“ ist gut sichtbar. Auf Desktop bilden
aufklappbare Originalseiten links und editierbare Karten rechts eine ruhige
Split-View. Mobil stehen beide Bereiche untereinander. Jedes kanonische Feld
besitzt ein sichtbares Label. Status und Warnungen stehen immer als Text;
technische Qualitätswerte werden im normalen Workflow nicht gezeigt. Ein
Originalausschnitt bleibt der betreffenden Zeile zugeordnet. Mehrere Targets
werden als eine Variante pro Zeile bearbeitet.

Der Dialog begrenzt seine Höhe auf den Viewport, scrollt nur im Inhaltsbereich
und darf bei 320 Pixeln keinen horizontalen Seitenüberlauf erzeugen. Aktionen
stapeln sich auf schmalen Viewports, Touchziele bleiben mindestens 44 Pixel.
Mehrfachauswahl und gemeinsame Aktionen verwenden native Checkboxen und klar
begrenzte Controls. Destruktives Entfernen verlangt eine Bestätigung und bleibt
über Entwurf-Reset rücksetzbar. Echte Feldfehler deaktivieren den Übergang zur
Importübersicht; der Zustand wird textlich erklärt.

Fortschritt verwendet ein natives `progress`-Element mit höflicher Live-Region;
Fehler stehen in einer Alert-Region. Fokus beginnt an der Schrittüberschrift,
bleibt nach Fehlern an einer sinnvollen Aktion und kehrt beim Schließen zum
auslösenden Button zurück. Bilder, Warnungen und Auswahlzustände besitzen
verständliche nichtvisuelle Beschriftungen.

## Responsive Regeln

Die Referenzgrößen sind 320, 375, 768, 1024, 1440 und 1920 Pixel. Das System
nutzt mobile Defaults und Übergänge bei 35, 48 und 64 rem. Auf großen Viewports
begrenzt `--content-width` die App. Bei 200 Prozent Zoom greifen dieselben
Reflow-Regeln wie auf kleineren Viewports. Touchziele bleiben mindestens
ungefähr 44 × 44 Pixel groß.

## Fokus und Bewegung

Alle interaktiven Elemente verwenden denselben äußeren Fokus-Ring plus
Focus-Shadow. Bei Radio-Auswahlkarten wird der Ring auf das gesamte Label
übertragen. Fokus wird nicht durch abgeschnittene Container verborgen.

Übergänge sind kurz und funktional. `prefers-reduced-motion: reduce` setzt
Animationen und Übergänge auf eine technisch minimale Dauer und deaktiviert
fixierte Hintergrundwirkung. Es gibt keine dauerhafte Bewegung.

## Produktionsseiten und Sicherheitsmetadaten

Produktions-`index.html` und `404.html` verwenden ausschließlich die
vorhandenen Tokens, Styles und Komponenten. Die Release-Assembly führt keine
neue Farbpalette, Schrift oder Komponente ein. Die gemeinsame 404-Seite nutzt
eine semantische Main-Landmarke, Skip-Link, klare Überschrift und einen
vorhandenen Primary Button zum Root-Trainer.

Profilbezogene Sprache, Titel und Description werden im Build gesetzt. Eine
restriktive Meta-CSP und `referrer=no-referrer` verändern die visuelle Sprache
nicht. Fokusdarstellung, 200-%-Reflow und bestehende responsive Regeln gelten
unverändert für Root-Learner und Author-Mount.

## Wiederverwendung

Für spätere EduTools-Apps geeignet sind Tokens, Typografie, Shell, Navigation,
Karten, Buttons, Formulare, Auswahlkarten, Feedback, Badges, Dialoge,
Fortschritt, Empty States, Fokus und responsive Regeln.

Vocabulary-spezifisch bleiben Flashcards, Wortpaar-Spalten, Positionen der
Vokabel-Aussprache, Unit-/Worteditor und wortbezogene Lernstatusanzeigen. Eine
technische Auslagerung in einen gemeinsamen Core ist nicht Bestandteil dieses
Sprints.

## SCORM-Frame und fehlende LMS-Verbindung

Der SCORM-Learner verwendet unverändert dieselbe App-Shell und dieselben
Responsive-Regeln. Es entsteht keine zweite Komponentenfamilie. Ist die
angeforderte SCORM-API nicht erreichbar, erscheint am Anfang des Hauptinhalts
eine ruhige, nicht modale Info-Fläche mit Überschrift, Erklärung und nativem
Schließen-Button. Sie blockiert weder Navigation noch Lernfunktionen und wird
nicht wiederholt über eine Live-Region ausgegeben. Standalone- und Pages-Builds
zeigen diesen Hinweis nicht.

Einbettung setzt keine Mindestbreite oder feste Höhe voraus. Dialoge, Fokus,
Touchziele, 200-%-Reflow, Skip-Link und `prefers-reduced-motion` bleiben im
Frame unverändert gültig.
