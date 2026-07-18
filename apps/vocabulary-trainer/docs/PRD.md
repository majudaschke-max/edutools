# EduTools – Vocabulary Trainer

Dieses Dokument hält nur bereits beschlossene Grundlagen fest. Es ist noch keine vollständige Produktspezifikation. Die spätere Ausarbeitung verwendet das zentrale [PRD-Template](../../../docs/product/PRD_TEMPLATE.md).

## Produktname

EduTools – Vocabulary Trainer

## Produktgedanke

> Lernen statt Suchen.

## Ziel

Die App soll Lernenden zeigen, welche Wörter sie aktuell sinnvoll lernen oder wiederholen sollten.

## Nutzungsszenarien

### Schule

- ein veröffentlichter Trainer pro Kurs beziehungsweise Lehrwerk
- Schülerinnen und Schüler sehen keine privaten oder fremden Kurse
- bisherige Units bleiben zum Wiederholen verfügbar
- kommende Units können ausgeblendet oder gesperrt werden
- die aktuelle Unit wird über den bestehenden Kurskontext festgelegt und kann
  aus verfügbaren, nicht leeren Units gewählt werden

### Privat

- eigener Trainer pro Kind oder Lehrwerk
- alle vorgesehenen Units können freigegeben sein
- freie Auswahl und individuelle Wiederholung

## Umgesetztes technisches Fundament

Sprint 1.2 setzt folgende produktbezogene Entscheidungen verbindlich um:

- Kurskonfiguration und Vokabelinhalte werden als getrennte JSON-Dateien
  geladen und unabhängig von der Programmlogik validiert.
- Eine dauerhaft eindeutige `courseId` verbindet beide Datenquellen und trennt
  lokale Lernstände verschiedener Kurse.
- Freigegebene Units werden über die Kurskonfiguration bestimmt. Die aktuelle
  Unit liegt im bestehenden Kurskontext und kann auf `#/units` gewechselt
  werden. Nicht freigegebene Units gelangen nicht in ein Lernpaket.
- Der wortbezogene Lernstand wird mit Schema-Version 2 ausschließlich im
  Browser gespeichert. Er enthält Erfolgs- und Fehlerzähler, aktuelle Serie,
  interne Wiederholungsstufe, Markierung, aktive richtige Abrufe, erfolgreiche
  lokale Lerntage, die letzten zwei Ergebnisse sowie letzte und nächste
  Bearbeitung. Schema 1 wird ohne Verlust bestehender Zähler und Markierungen
  konservativ migriert.
- Ein schwieriges Wort hat mindestens zwei Fehler, mehr Fehler als richtige
  Antworten oder wurde auf Stufe 0 bereits bearbeitet.
- Ein Wort gilt als sicher gelernt, wenn es mindestens drei richtige bewertete
  Abrufe erreicht hat, davon mindestens einen aktiven schriftlichen Abruf, an
  mindestens zwei lokalen Kalendertagen richtig war und die letzten beiden
  bewerteten Versuche richtig waren. Ein späterer Fehler setzt es auf „Wird
  gelernt“, ohne die Lernhistorie zu löschen.
- Wiederholungsintervalle reichen transparent von zehn Minuten auf Stufe 0 bis
  zu 30 Tagen auf Stufe 5.
- Das tägliche Lernpaket priorisiert fällige Wiederholungen, anschließend noch
  nicht enthaltene schwierige Wörter und danach neue Wörter der aktuellen Unit.
  Wort-IDs werden dabei nicht doppelt aufgenommen.
- Dashboard-Kennzahlen und der Fortschritt der aktuellen Unit werden aus diesen
  Daten berechnet. Die geschätzte Lernzeit basiert auf ungefähr 25 Sekunden pro
  Wort, wird auf volle Minuten aufgerundet und beträgt mindestens eine Minute.

## Umgesetzte Navigation und Lernsitzungs-Shell

Sprint 1.3 macht die vorhandenen Dashboard-Aktionen über eine frameworkfreie
Single-Page-Navigation erreichbar:

- Dashboard, Lernen, Wiederholen, gemerkte Wörter, Units und Einstellungen
  besitzen eindeutige Hash-Routen und können direkt aufgerufen werden.
- Browser-Zurück und Browser-Vorwärts bleiben Teil des normalen
  Navigationsverlaufs.
- Der zentrale Inhaltsbereich erhält nach einem Routenwechsel den Fokus und
  jede Ansicht besitzt eine eindeutige Überschrift und einen Seitentitel.
- Unbekannte Routen führen zu einem verständlichen Nicht-gefunden-Zustand.
- Die Lernansicht zeigt ausschließlich die vom Vocabulary Core vorbereitete
  Auswahl und ihre Kategorien. Sie bewertet noch keine Antworten.
- Wiederholungen, Markierungen und Unit-Status werden aus den bestehenden
  Kurs-, Vokabel- und Lernstandsdaten dargestellt.

## Umgesetzte funktionale Flashcard-Lerneinheit

Sprint 1.4 ergänzt auf dem bestehenden Vocabulary Core genau einen gemeinsamen
Flashcard-Ablauf für Tageslernen, fällige Wiederholungen und gemerkte Wörter:

- `#/learn` startet das aktuelle Tagespaket des Schedulers. Vorher werden
  Gesamtzahl, fällige, schwierige und neue Wörter sowie die geschätzte Lernzeit
  aus echten Daten dargestellt.
- `#/review` verwendet denselben Ablauf ausschließlich mit aktuell fälligen
  Wörtern; neue Wörter werden dort nicht ergänzt.
- `#/marked` listet aktuelle Markierungen mit Ausgangsbegriff, Übersetzungen und
  Unit. Markierungen können entfernt und als eigene Session geübt werden.
- Eine Lösung ist bis zur bewussten Aufdeckung auch semantisch verborgen.
  Danach bewerten „Kann ich“ und „Noch nicht“ über die bestehenden Core-
  Funktionen; „Gemerkt“ bleibt davon unabhängig.
- Jede erfolgreiche Bewertung oder Markierungsänderung wird sofort lokal
  gespeichert. Erst danach wird der flüchtige Session-Zustand fortgeschrieben.
  Ein Speicherfehler verändert daher weder Lernhistorie noch Kartenposition.
- Jedes Wort wird innerhalb der ursprünglichen Session höchstens einmal
  fachlich bewertet. Nach Abschluss kann eine neue, deduplizierte Session nur
  mit den unsicheren Wörtern konfiguriert und gestartet werden.
- Die Abschlussansicht fasst Bewertungen und Markierungen zusammen. Nach der
  Rückkehr werden Dashboard-Kennzahlen aus der aktuellen Lernhistorie neu
  berechnet.
- Enter und Leertaste decken die Lösung auf; Pfeil links, Pfeil rechts und M
  steuern anschließend Bewertung und Markierung. Kürzel bleiben in Formular-
  feldern, editierbaren Bereichen und Dialogen aus.

Der Session-Zustand ist absichtlich nicht persistent. Er enthält Modus, Quelle,
Lernrichtung, stabile Kartenrichtungen, ursprüngliche Wort-IDs, aktuelle
Position, Ergebnisse, Lösungssichtbarkeit und Abschlussstatus. Verlassen der
Lernroute oder Neuladen verwirft ihn; der wortbezogene Lernstand bleibt davon
getrennt erhalten.

## Umgesetzter funktionaler Quizmodus

Sprint 1.5 ergänzt einen eigenständigen, frameworkfreien Multiple-Choice-Modus
unter `#/quiz` und nutzt dafür unverändert Vocabulary Core, Kurskonfiguration
und Lernzustand:

- Verfügbare Lernquellen sind die aktuelle Unit, alle freigegebenen Units sowie
  aktuell schwierige, gemerkte und fällige Wörter. Leere Quellen werden nicht
  angeboten.
- Ausgangs- zu Zielsprache, Ziel- zu Ausgangssprache und eine gemischte
  Richtung sind wählbar. Der Umfang beträgt 5, 10, 20 oder alle verfügbaren
  Wörter; kleinere Datenmengen werden transparent behandelt.
- Der Quizgenerator erzeugt pro Wort höchstens drei normalisierte, eindeutige
  Ablenkungsantworten. Er bevorzugt dieselbe Unit und fällt anschließend auf
  andere freigegebene Units zurück. Gültige Übersetzungsvarianten bleiben
  gemeinsam richtige Antworten.
- Jede Antwort wird explizit ausgewählt und geprüft. Richtig- und
  Falsch-Rückmeldungen enthalten Text und die richtige Lösung; es gibt keinen
  automatischen Wechsel zur nächsten Frage.
- Bewertungen laufen über die bestehenden `markWordCorrect`- und
  `markWordWrong`-Regeln und werden vor dem Fortschreiben der Quizsession lokal
  gespeichert. Fehler beim Speichern lassen die aktuelle Frage unverändert.
- Die Abschlussansicht zeigt richtige und falsche Antworten sowie die
  Erfolgsquote. Falsch beantwortete Wörter können dedupliziert in einer
  Flashcard-Session weitergeübt werden, werden im Quiz aber nicht automatisch
  wiederholt.
- Pfeiltasten, Ziffern 1 bis 4, Enter und Escape ergänzen die native
  Formularbedienung. Fokusführung, Live-Meldungen, sichtbare Fokuszustände und
  ein Bestätigungsdialog beim vorzeitigen Verlassen sind Bestandteil des
  Ablaufs.

Die Quizsession einschließlich Konfiguration, Fragenreihenfolge, Position und
Ergebnissen ist absichtlich flüchtig und wird beim Neuladen oder bestätigten
Verlassen verworfen. Nur der wortbezogene Lernstand bleibt erhalten.

## Umgesetztes funktionales Schreibtraining

Sprint 1.6 ergänzt unter `#/write` einen eigenständigen, frameworkfreien
Schreibmodus und verwendet unverändert Kursdaten, Vocabulary Core und lokalen
Lernstand:

- Als Lernquellen stehen die aktuelle Unit, alle freigegebenen Units sowie
  aktuell schwierige, gemerkte und fällige Wörter zur Verfügung, sofern sie
  nicht leer sind. Schreibrichtung und Umfang werden vor dem Start gewählt.
- In Ausgangs- zu Zielsprache reicht jede ausdrücklich hinterlegte
  Zielübersetzung als richtige Antwort. In der Gegenrichtung gilt nur `source`.
  Alternative Artikel oder Zusätze werden ausschließlich akzeptiert, wenn sie
  in den Daten stehen.
- Die allgemeine Normalisierung vereinheitlicht Unicode und Apostrophe,
  ignoriert Groß-/Kleinschreibung, äußere und mehrfache Leerzeichen sowie
  abschließende Satzzeichen. Sie korrigiert keine Buchstaben, Wortreihenfolgen
  oder grammatischen Formen und enthält keine sprachspezifischen Sonderregeln.
- Vorhandene Hinweise bleiben zunächst verborgen und werden nur auf
  ausdrückliche Aktion sichtbar. Ihre Nutzung wird im flüchtigen Ergebnis
  festgehalten, verändert die Bewertung aber nicht.
- Jede Eingabe wird genau einmal bewusst geprüft. Richtiges und falsches
  Feedback zeigt die akzeptierten Lösungen; falsches Feedback zeigt zusätzlich
  die eigene Eingabe und vorhandene Lernhilfen. Die nächste Aufgabe erscheint
  erst nach „Weiter“.
- Bewertungen verwenden ausschließlich `markWordCorrect` oder `markWordWrong`
  und werden gespeichert, bevor die Schreibsession fortgeschrieben wird.
  Speicherfehler lassen die aktuelle Aufgabe unverändert.
- Die Abschlussansicht zeigt Aufgaben, richtige und falsche Antworten,
  Erfolgsquote, Hinweisnutzung sowie falsche Eingaben. Unsichere Wörter können
  dedupliziert in der vorhandenen Flashcard-Session weitergeübt werden.
- Native Formulare, fokussierte Eingabefelder, verknüpfte Fehlermeldungen,
  Live-Meldungen, Enter, Escape und optional H ermöglichen eine vollständige
  Tastatur- und Screenreader-Bedienung.

Die Schreibsession mit Konfiguration, Reihenfolge, Position, Rohantworten,
Hinweisnutzung und Ergebnissen bleibt flüchtig. Beim Neuladen oder bestätigten
Verlassen wird sie verworfen; nur der wortbezogene Lernstand bleibt erhalten.

## Umgesetzte funktionale Speed Challenge

Sprint 1.7 ergänzt unter `#/speed` eine frameworkfreie, zeitbegrenzte
Zuordnung vorhandener Quellbegriffe und Übersetzungen:

- Als Lernquellen werden aktuelle Unit, alle freigegebenen Units sowie
  schwierige, gemerkte und fällige Wörter angeboten, sofern mindestens vier
  eindeutige Paare gebildet werden können.
- Pro Challenge sind feste oder je Runde gemischte Richtungen, 30, 60 oder 90
  Sekunden und abhängig vom Bestand vier, sechs oder acht Paare wählbar.
- Alternative Übersetzungen bilden eine gemeinsame Zieloption. Überlappende
  Übersetzungen und doppelte sichtbare Texte werden innerhalb einer Runde
  ausgeschlossen; linke und rechte Seite werden injizierbar mit Fisher-Yates
  getrennt gemischt.
- Der Timer verwendet einen absoluten Zielzeitpunkt statt eines dekrementierten
  Zählers. Verzögerte Browser-Tabs werden beim nächsten Tick korrigiert; Pause
  und Fortsetzen berechnen den Zielzeitpunkt aus der echten Restzeit neu.
- Native Buttons erlauben Auswahl per Maus, Touch, Tab, Pfeiltasten, Enter und
  Leertaste. Escape hebt zuerst eine Auswahl auf und öffnet sonst den
  Abbruchdialog; P pausiert oder setzt fort.
- Die erste richtige Zuordnung eines Wortes pro Challenge verwendet
  `markWordCorrect` und wird sofort gespeichert. Weitere Treffer desselben
  Wortes werden nicht erneut bewertet.
- Fehlversuche bleiben flüchtig und verwenden bewusst nie `markWordWrong`.
  Wörter gelten in der Speed-Auswertung als auffällig, wenn sie an mindestens
  zwei Fehlversuchen beteiligt waren.
- Die Auswertung zeigt Dauer, Runden, korrekte Zuordnungen, Fehlversuche,
  Trefferquote und unterschiedliche erfolgreiche Wörter. Auffällige Wörter
  können dedupliziert in der bestehenden Flashcard-Session geübt werden.

Challenge-Konfiguration, Runden, Timer und Ergebnisse bleiben flüchtig. Es
gibt keine Highscore-Liste, keine automatische Falschbewertung bei Zeitablauf
und kein Drag-and-Drop; Klick, Touch und Tastatur sind die vollständigen
Bedienwege.

## Umgesetzte Aussprache und gemeinsamer Audio-Service

Sprint 1.8 ergänzt manuell ausgelöste Aussprache für kurze Vokabeln und
Wendungen. Die Funktion verwendet ausschließlich die im Browser vorhandene Web
Speech API; es gibt keine externe TTS-API, keine Audiodateien, keine Aufnahme,
keine Spracherkennung und keine Aussprachebewertung.

- Ein zentraler, für Tests vollständig injizierbarer Service kapselt
  `speechSynthesis` und `SpeechSynthesisUtterance`. Er bietet Unterstützungstest,
  Start, Stopp, Status, Stimmenzugriff, Stimmenaktualisierung und sauberes
  Zerstören. `app.js` verdrahtet lediglich die eine Instanz für die App-Laufzeit.
- Die Kurskonfiguration unterscheidet `languages.source` und
  `languages.target` mit eigener `speechLocale`. Rate, Pitch und Lautstärke
  liegen in `pronunciation`; ungültige Werte werden protokolliert und durch
  sichere Standardwerte ersetzt.
- Die Stimmenauswahl bevorzugt zuerst einen exakten Locale-Treffer, dann den
  Sprachpräfix. Innerhalb der Treffer werden lokale und anschließend als
  Standard markierte Stimmen bevorzugt. Verzögert geladene Stimmen werden ohne
  Polling über genau einen `voiceschanged`-Listener übernommen.
- Der zentrale flüchtige Status kennt Verfügbarkeit, geladene Stimmen, aktive
  ID, Wiedergabestatus und letzten Fehler. Es läuft nie mehr als eine Ausgabe:
  derselbe Button stoppt, ein anderer ersetzt die laufende Ausgabe.
- Der native Aussprache-Button besitzt ein eingebettetes Lautsprecher-/Stopp-
  Symbol, ein wechselndes `aria-label`, `aria-pressed`, sichtbaren Fokus und
  eine ungefähr 44 × 44 Pixel große Touchfläche. Eine zentrale ruhige
  Live-Region meldet Start, Ende, Stopp oder Fehler ohne den Fokus zu verlagern.
- Eine zentrale Vocabulary-Trainer-Policy erlaubt Aussprache ausschließlich für
  Inhalte der konfigurierten Source-Sprache. Target-Inhalte erhalten unabhängig
  vom Sprachenpaar kein Audio; fehlende oder widersprüchliche Konfiguration fällt
  sicher auf keinen Button zurück. Der allgemeine Audio-Service bleibt
  sprachneutral.
- Vor Aufdeckung oder Auswertung ist ausschließlich sichtbarer Source-Inhalt
  hörbar. Eine Source-Lösung in der Gegenrichtung wird erst nach der Auswertung
  angeboten. Ist Deutsch als Source konfiguriert, ist deutsche Aussprache
  ausdrücklich zulässig.
- Die gemerkte Wortliste bietet nur erlaubte Sprachseiten. Leere Texte,
  fehlende Locales, deaktivierte Aussprache oder fehlende Browserunterstützung
  erzeugen keinen Button.
- Audio-Buttons senden keine Formulare ab und blockieren die globalen
  Lernkürzel. Routenwechsel, Neurendern und vollständiges Zerstören beenden eine
  laufende Ausgabe und entfernen Listener.
- Die Speed Challenge bleibt bewusst ohne Audio: getrennte Aussprache- und
  Zuordnungsbuttons würden das zweispaltige 320-Pixel-Layout und seine
  Pfeiltastensteuerung überladen. Der Sprint nimmt dafür keine größere
  Umstrukturierung des Modus vor.
- Ohne Web Speech API bleiben alle Lernmodi vollständig bedienbar. Vorhandene
  Lautschrift bleibt sichtbar und wird weder ersetzt noch automatisch erzeugt.

EduTools übergibt den kurzen Text an die Sprachausgabefunktion des verwendeten
Browsers beziehungsweise Betriebssystems. Welche Stimme technisch
bereitgestellt wird, hängt vom jeweiligen Gerät und Browser ab. EduTools
implementiert für die Ausgabe keine eigene Cloud-Übertragung und erstellt keine
Sprachaufnahmen. Der Request kennzeichnet den Provider als
`speech-synthesis`.

Der Aussprache-Service ist als wiederverwendbarer EduTools-Baustein konzipiert.
Eine spätere Überführung in einen gemeinsamen Core ist vorgesehen, aber nicht
automatisch Teil dieses Sprints.

## Umgesetzter Lernfortschritt und sanfte Motivation

Sprint 1.9 ergänzt die direkt erreichbare Route `#/progress` und eine
unabhängige, standardmäßig aktive Motivationsebene:

- Die Fortschrittsansicht trennt den aus dem Learning Core berechneten
  fachlichen Lernfortschritt sichtbar von freiwilligen Motivationswerten.
  Fachlich werden Gesamtbestand, bereits geübte, sicher gelernte, schwierige,
  fällige und gemerkte Wörter sowie der Fortschritt jeder freigegebenen Unit
  gezeigt.
- Motivation verwendet einen eigenen versionierten, kursbezogenen
  `localStorage`-Schlüssel. Der Service importiert weder Scheduler noch
  Learning State und kann fachliche Level, Wiederholungstermine oder
  Bewertungen nicht verändern. Nicht lesbare Daten werden isoliert verworfen;
  nicht speicherbare Events blockieren keinen Lernmodus.
- Flashcards, Quiz, Schreibtraining und Speed Challenge erzeugen pro Start eine
  flüchtige Session-ID und melden normierte Wort- beziehungsweise
  Abschlussereignisse erst nach bestätigten fachlichen Übergängen. Stabile
  Event-IDs, lokale Tages-/Wortschlüssel und lokale Tages-/Session-Schlüssel
  machen die Verarbeitung idempotent.
- Flashcards vergeben für die erste Bewertung eines Worts je lokalem Tag und
  Modus 1 XP. Richtige Quiz-, Schreib- und Speed-Ergebnisse vergeben 2, 3
  beziehungsweise 2 XP. Falsche objektive Ergebnisse vergeben 0 XP. Die
  erste qualifizierende vollständig abgeschlossene Session je lokalem Tag und
  Kurs vergibt einmalig 5 XP.
  Abbrüche und Sessions ohne geübtes Wort erzeugen keinen Bonus und keinen
  Lerntag.
- Level folgen der Formel `50 × ((Level - 1) × Level) / 2` ohne festes
  Höchstlevel. Mehrere übersprungene Level werden in einer ruhigen Meldung
  zusammengefasst und nur nach dem Sessionabschluss oder auf dem Dashboard
  gezeigt, nie während einer Frage oder Karte.
- Aktuelle und längste Lernserie beruhen ausschließlich auf verschiedenen
  lokalen Kalendertagen mit regulärem Sessionabschluss. Unterbrechungen erzeugen
  keine negativen oder beschämenden Texte.
- Permanente Meilensteine bestehen für die erste Session, drei Lerntage, zehn
  und 25 verschiedene Wörter, fünf Sessions sowie das erste vollständig
  richtige Quiz oder Schreibtraining. Jeder Meilenstein wird nur einmal
  freigeschaltet.
- Das Dashboard zeigt höchstens Level, kompakten Levelfortschritt, aktuelle
  Lernserie und „Mein Fortschritt“. Lernempfehlung, aktuelle Unit,
  Wiederholungen und schwierige Wörter bleiben wichtiger.
- Die Einstellung „Motivationselemente anzeigen“ stoppt neue XP,
  Levelmeldungen und Meilensteine, erhält aber den bisherigen Motivationsstand.
  Der fachliche Fortschritt und alle Lernmodi bleiben sichtbar und vollständig
  nutzbar. Der getrennte Reset löscht nur Motivation; Wortlernstände,
  Wiederholungen und gemerkte Wörter bleiben bestehen.
- Native Fortschrittsanzeigen, semantische Überschriften, beschrifteter Toggle,
  fokussierter Bestätigungsdialog, tastaturbedienbare Levelmeldung, sichtbare
  Fokuszustände und rein textlich verständliche Statusinformationen erfüllen
  die Accessibility-Vorgaben. Es gibt keine automatische Audioausgabe und
  keine zwingende Animation.
- Zeitlich begrenzte Event-, Wort- und Session-Deduplizierung wird auf die
  letzten 30 lokalen Tage bereinigt. Bereits vergebene XP sowie permanente
  Lerntage, Sessionzahl, geübte Wort-IDs und Meilensteine bleiben erhalten.

Motivationselemente dienen ausschließlich der freiwilligen Lernunterstützung. Sie verändern weder den fachlichen Lernstand noch die Wiederholungsplanung.

Die Motivation-Schicht ist als wiederverwendbarer EduTools-Baustein konzipiert. Eine spätere Überführung in einen gemeinsamen Core ist vorgesehen, aber nicht automatisch Bestandteil dieses Sprints.

## Umgesetzte lokale Kursbibliothek und Wortlisten-Import

Sprint 2.0 ergänzt die direkt erreichbaren Routen `#/courses` und
`#/course-builder`. Der Bearbeitungsmodus ist über
`features.courseBuilder.enabled` konfigurierbar und bleibt ein lokales
Autorenwerkzeug ohne Anmeldung oder Rollenverwaltung. Der lokale
Bearbeitungsmodus schützt Inhalte nicht vor anderen Personen, die dasselbe
Browserprofil verwenden.

- Ein versioniertes kanonisches Kursmodell enthält ausschließlich Metadaten,
  Sprach- und Aussprachekonfiguration, Units und Wörter. Stabile Kurs-, Unit-
  und Wort-IDs ändern sich nicht durch Textänderungen.
- Ein neutraler technischer Fallback bleibt als unveränderliche gebündelte
  Ressource nutzbar, wird in der Author-Kursbibliothek jedoch nicht als eigener
  Kurs angeboten. Eigene, importierte und duplizierte Kurse werden niemals
  automatisch verändert.
- Eigene Kurse lassen sich erstellen, bearbeiten, archivieren, löschen,
  exportieren und aktivieren. Units können geordnet, freigegeben, gesperrt,
  aktuell gesetzt und archiviert werden. Wörter unterstützen mehrere
  Übersetzungen, optionale Lernhilfen, Tags, Duplikation und Archivierung.
- Archivierte Wörter werden in keinem Lernmodus mehr angeboten, behalten aber
  ihren gespeicherten Lernstand für eine mögliche spätere Wiederherstellung.
  Archivierte Units sowie gesperrte zukünftige Units werden ebenfalls aus den
  regulären Lernquellen ausgeschlossen.
- Der tabellarische Import verarbeitet eingefügten Text sowie `.csv`, `.tsv`
  und `.txt` bis 2 MB und 5000 Datenzeilen. Tabulator, Semikolon und Komma
  werden erkannt; einfache korrekt zitierte CSV-Felder einschließlich
  eingebetteter Kommas und Zeilenumbrüche werden unterstützt.
- Überschriften sind optional. Jede Spalte wird vor der Übernahme explizit als
  Ausgangsbegriff, eine oder mehrere Zielübersetzungen, Lautschrift, Hinweis,
  Beispiel, Tags, Unit-Titel oder ignoriert zugeordnet. Bekannte Überschriften
  liefern nur überprüfbare Vorschläge.
- Die Importvorschau zeigt gelesene, gültige und fehlerhafte Zeilen,
  Duplikate, neue Units sowie textliche Zeilenstatus. Sie verändert den Kurs
  nicht. Erst „Kurs speichern“ wendet gültige Zeilen auf einer Kopie an,
  validiert den vollständigen Kurs und speichert ihn als einen Zustand.
- Duplikate werden innerhalb derselben Unit über Unicode-normalisierten,
  groß-/kleinschreibungsunabhängigen und whitespace-normalisierten
  Ausgangstext erkannt. Sie können übersprungen, unter Beibehaltung der
  Wort-ID zusammengeführt oder unter Beibehaltung der Wort-ID ersetzt werden.
- Versionierte EduTools-JSON-Kurse werden rekursiv validiert und als neue
  sichere Datenobjekte aufgebaut. Gefährliche Schlüssel, falscher App-Typ,
  unbekannte Schema-Versionen und doppelte IDs werden abgelehnt. Bei gleicher
  Kurs-ID ist eine bewusste Kopie mit neuen Inhalts-IDs oder das Ersetzen eines
  eigenen Kurses erforderlich.
- JSON-Exporte enthalten ausschließlich Kursinhalte. Lernstände,
  Wiederholungstermine, Markierungen, Motivation und flüchtige Sessions sind
  ausgeschlossen.
- Ein Kurswechsel stoppt Aussprache und laufende Sessions, speichert die aktive
  Kurs-ID, lädt den kursbezogenen Learning State und Motivation State neu und
  berechnet das Dashboard aus dem neuen Kurskontext.

Kursinhalte, fachlicher Lernstand und Motivation werden getrennt gespeichert
und ausschließlich über stabile Kurs- und Inhalts-IDs miteinander verknüpft.

Eigene Kurse und importierte Wortlisten werden ausschließlich lokal im
verwendeten Browser gespeichert. Ein JSON-Export dient als lokale Sicherung
und zur Übertragung auf ein anderes Gerät.

Das Löschen von Browserdaten kann lokal gespeicherte Kurse und Lernstände
entfernen. Regelmäßige JSON-Exporte werden daher empfohlen.

Die Kursbibliothek und der Import sind als Grundlage für spätere
EduTools-Anwendungen konzipiert. Eine Überführung in einen gemeinsamen Core
erfolgt erst nach nachgewiesener Wiederverwendbarkeit.

## Sprint 3.0 – lokaler Bildimport mit kontrollierter OCR-Übernahme

Im Author-Profil kann eine Lehrkraft im bestehenden Course Builder eigene
HEIC-, HEIF-, JPEG-, PNG- oder WebP-Wortlisten auswählen, ablegen oder aus der
Zwischenablage einfügen. Mehrere Seiten werden lokal geordnet, gedreht,
zugeschnitten und nacheinander erkannt. HEIC/HEIF wird seit Sprint 3.4 über
einen lokal gebündelten Author-Decoder vorbereitet und hängt nicht mehr von
nativer Browserdekodierung ab.

Die Texterkennung läuft mit lokal gebündeltem Tesseract.js, lokalem WASM-Core
und den installierten Modellen Deutsch, Englisch, Französisch und Latein. Die
Kurssprachen liefern nur eine Vorauswahl. Es gibt keine Cloud, keinen Upload,
keine automatische Übersetzung und keine kurs-, lehrwerks- oder
sprachenpaarbezogene Erkennungslogik.

OCR erzeugt ausschließlich einen flüchtigen, vollständig bearbeitbaren
Entwurf. Bounding Boxes und Konfidenzen dienen der relativen Zeilen- und
Spaltenstrukturierung sowie als Prüfhinweise. Die Lehrkraft ordnet jede Spalte
zu, kontrolliert jedes Wort und entscheidet über Warnungen, alternative
Targets, verbundene oder geteilte Zeilen und Duplikate. Neue Units bleiben bis
zur bewussten Freigabe gesperrt.

Nur eingeschlossene und valide Source-, Target-, Lautschrift-, Hint-, Beispiel-
und Tag-Felder werden über die vorhandene Importtransaktion übernommen. Bilder,
Arbeitskopien, Ausschnitte, Bounding Boxes und Konfidenzen werden nicht
persistiert und nicht exportiert. Bei einem Fehler bleibt der Kurs unverändert.

OCR-Module, Engine, WASM und Sprachmodelle sind Author-only. Learner- und
SCORM-Builds enthalten sie physisch nicht. Der vorgelagerte Ablauf bleibt:
lokal prüfen und Kursinhalte übernehmen. Der historische Sprint-3.0-Stand
besitzt noch keinen Browser-SCORM-Export; Sprint 4.0 ergänzt ihn ausschließlich
für kanonische eigene Kursdaten und ohne OCR-Code im Paket.

## Sprint 4.0 – vollständige Flashcard-Auswahl und privater SCORM-Export

Vor jeder Flashcard-Session zeigt die App den vollständigen fachlich
verfügbaren Umfang. Dynamische native Radios bieten fünf, zehn, fünfzehn und
„Alle N Wörter“ nur dann an, wenn die jeweilige Teilmenge sinnvoll ist. Zehn
bleibt bei mehr als zehn Wörtern die Empfehlung, ist aber keine technische
Grenze. „Alle“ übergibt sämtliche deduplizierten IDs der ausgewählten Quelle
an den unveränderten Session-Controller. Quiz und Schreiben behalten ihre
bestehenden Umfänge fünf, zehn, zwanzig und alle.

Im Course Builder sind zwei Exporte getrennt: „EduTools-Kursdatei
herunterladen“ erzeugt die roundtrip-fähige JSON-Sicherung;
„SCORM-Lernpaket herunterladen“ erzeugt lokal ein vollständiges
SCORM-1.2-ZIP. Dafür bettet der Author-Build einen validierten
Produktions-Learner ein. Browser und CLI teilen XML-Escaping,
Manifest-Erzeugung und den dependency-freien deterministischen ZIP-STORE-Core.
Der Browser ersetzt ausschließlich Kurs-, Deployment- und Deliverydaten.

Das Lernpaket enthält genau einen eigenen Kurs, dessen freigegebene,
nichtarchivierte Units und Wörter, `imsmanifest.xml`, Startdatei, Learner-
Assets sowie technische Manifeste. Kurs-, Unit- und Wort-IDs bleiben stabil;
Paket-, Profil- und Deployment-ID werden deterministisch aus der Kurs-ID
abgeleitet. Learning State, Reviewtermine, Markierungen, Motivation, XP,
Lernserie, Browserdaten, Authoring, Import, OCR, HEIC und SpeechRecognition
werden nicht eingebettet.

Für britisches Englisch zeigt die Source-Stimmenauswahl Daniel als Standard
und optional genau eine installierte kuratierte weibliche Alternative (Serena,
ersatzweise Kate oder Martha). Eddy, Flo und Grandma werden nicht angeboten.
Fehlt eine gespeicherte Stimme auf einem anderen Gerät, wird ohne Fehler Daniel
beziehungsweise der sichere sprachpassende Browserfallback verwendet. Das UI
zeigt höchstens zwei konkrete Stimmen; Learner und SCORM nutzen dieselbe
zentrale Regel.

## Patch 4.0.1 – Moodle-kompatible SCORM-Startgrenze

Der individuelle Browserexport behält Kursdaten, Deployment-ID und
Lernfunktionen unverändert. Vor dem Download validiert er zusätzlich, dass
`imsmanifest.xml` und `index.html` direkt im ZIP-Root liegen, der SCO-`href`
exakt `index.html` ohne Slash, Query oder Hash lautet, Organization und
`identifierref` konsistent sind und alle statischen Referenzen paketintern
auflösbar bleiben. LMS-spezifische `id`-Queries, lokale oder absolute URLs,
Author-Routen sowie Navigation von Parent- oder Top-Fenstern blockieren den
Export.

Der Standard-Harness liest die Startdatei aus dem tatsächlichen Manifest. Ein
zweiter Moodle-naher Harness liefert das SCO unter einem verschachtelten
`pluginfile.php/.../mod_scorm/content/...`-Pfad aus, setzt eine SCORM-1.2-API
zwei Frame-Ebenen oberhalb und verwendet ausschließlich auf der simulierten
LMS-Seite `id`, `scoid`, `attempt` und `display`. Diese Parameter werden weder
als EduTools-Kurs-ID gelesen noch an die SCO-URL angehängt. Die API-Suche ist
begrenzt, Cross-Origin-defensiv und wartet kurz auf verzögerte LMS-
Initialisierung, ohne eine fremde URL zu verändern.

Die reale Meldung „Ungültige Kursmodul-ID“ konnte anhand des heruntergeladenen
Pakets nicht auf einen fehlerhaften Manifest- oder App-Pfad zurückgeführt
werden: Das geprüfte Paket besaß bereits einen korrekten relativen Start. Eine
reale ByCS-/Moodle-Abnahme bleibt deshalb erforderlich und muss mit einer neu
angelegten Aktivität erfolgen; der lokale Harness ersetzt sie nicht.

## Patch 4.0.2 – Adaptiver externer Importprompt

Der kopierbare Author-Prompt beschreibt das tatsächliche EduTools-Kursschema
Version 1 mit `appType` `vocabulary`. Technische IDs und weitere vom Importer
erzeugte Metadaten werden nicht verlangt. Der Prompt verarbeitet vollständige
dreispaltige Vokabelseiten, einfache Source-/Target-Listen sowie gemischte
Vorlagen, berücksichtigt rechte Spalten und farbige Kästen und ordnet Inhalt
ausschließlich den vorhandenen Feldern `phonetic`, `example`, `hint`, `tags`
und `targets` zu. Vorhandene Inhalte haben Vorrang; Lautschrift, ein kurzer
Beispielsatz und fachlich relevante Sonderformen dürfen nur kontrolliert
ergänzt werden. Unsichere sowie neu erzeugte Angaben erscheinen in einem
separaten Prüfbericht und nicht als neue Kursfelder oder sichtbare KI-Tags.

EduTools stellt keine KI-Schnittstelle bereit. Die App kopiert nur lokalen
Prompttext. Auswahl des externen Dienstes, Upload und Verarbeitung liegen bei
der Lehrkraft; EduTools sendet keine Bilder, Dateien oder Kursdaten.

## Patch 4.0.3 – Geführter ChatGPT-Import und JSON-Mehrfachimport

Die Author-App führt den manuellen Ablauf in vier Schritten: Kurskontext
festlegen und Import-Prompt kopieren, ChatGPT in einem neuen Tab öffnen,
herunterladbare EduTools-JSON-Dateien erzeugen lassen und eine oder mehrere
zusammengehörige Dateien lokal auswählen. Es gibt in EduTools weder
Bildauswahl noch Antwort-Textfeld, OCR, KI-API oder Datenübertragung.

Alle gewählten Dateien werden vor dem Commit gemeinsam validiert. Identisch
sein müssen Schema-Version 1, `appType` `vocabulary`, bereinigter Kurstitel,
Source-/Target-Sprachcode und beide Speech-Locales. Ein Konflikt oder eine
beschädigte Datei blockiert den gesamten Import. Die Vorschau zeigt Dateien,
Units, Vokabeleinträge, Sprachen, Warnungen und exakte Duplikate.

Gleichnamige Unit-Teile werden in stabiler Datei- und Wortreihenfolge
zusammengeführt; die finale Reihenfolge wird nach Quell-`order`, Dateiauswahl
und In-Datei-Position auf `1..n` normalisiert. Unter mehreren geeigneten
aktuellen Units bleibt die erste der finalen Reihenfolge aktuell. Optionale
Metadaten übernehmen bei Konflikten den ersten nicht leeren Wert in
Auswahlreihenfolge und melden die Abweichung.

Exakte Duplikate werden anhand der Unicode-/Whitespace-normalisierten
Kombination aus Unit, Source und Targets erkannt. Großschreibung wird nicht
pauschal verworfen. Vor dem Speichern wählt die Lehrkraft sichtbar zwischen
Überspringen und Behalten; nahe oder nur teilweise gleiche Einträge bleiben
unverändert. Erst danach materialisiert die zentrale Importpipeline IDs und
technische Metadaten und speichert genau einen Kurs. Der kanonische
JSON-Restore bleibt der separate Sicherungsweg.

## Sprint 3.1 – gemeinsames Brand-System und Vocabulary-Referenz-App

Sprint 3.1 ist ein reines Designsystem- und UI-Refactoring. Sprint 3.0 mit
lokalem OCR-Bildimport war vor Beginn vollständig vorhanden und bleibt mitsamt
Author-only-Buildgrenze, Importtransaktion und Tests unverändert.

Die fertig veröffentlichte Gruppenpuzzle-App dient ausschließlich als visuelle
Referenz. Aus ihrer sichtbaren Gestaltung werden weiche Pastellverläufe,
organische Hintergrundfelder, matte helle Karten, großzügiger Weißraum, weiche
Rundungen, diffuse Schatten und klare Typografiehierarchie abstrahiert. Die
pastell-violette Farbidentität, konkrete Werte, Assets, Code und Komponenten
werden nicht übernommen; die Gruppenpuzzle-App selbst bleibt unverändert.

Der gemeinsame Brand Core definiert semantische Farbrollen, Verläufe,
Oberflächen, Schatten, Fokus und die wiederverwendbare MJ-Raute. Das zentral
über `data-edutools-theme="vocabulary"` aktivierte Vocabulary-Theme verwendet
Himmelblau, Mint und zurückhaltendes Türkis mit kleinen Apricot-Akzenten.
Author, Learner, Browser und SCORM verwenden dieselben beiden Brand-Dateien.

App-Shell, Hero, Karten, Buttons, Formulare, Lernmodi, Fortschritt, Motivation,
Kursbibliothek, Course Builder und vorhandener OCR-Dialog erhalten die neue
Markensprache. Statusfarben bleiben getrennt; Lern-, Storage-, Kurs-,
Aussprache-, Motivation-, Import-, Build- und SCORM-Logik ändern sich nicht.

Das kleine Signet `MJ` erscheint genau einmal im Footer jeder App-Shell. Die
Raute wird mit CSS erzeugt, ist nicht interaktiv und wird einmal als „Erstellt
von MJ“ beschriftet. Die interne Designreferenz zeigt zusätzlich unverbindliche
Farbrichtungen für Grammar, Reading, Writing und Exam, wird aber weder im
Learner noch im SCORM ausgeliefert. Es werden keine zukünftigen Apps oder
produktiven Zukunftsthemes angelegt.

## Sprint 3.3 – Vereinfachte Kurserstellung und Kursdatei

Die normale Author-Kurserstellung zeigt als Pflichtfelder ausschließlich
Kurstitel, Ausgangssprache und Zielsprache. Untertitel, Schulart,
Jahrgangsstufe und Beschreibung sind sichtbar optional. Native Selects bieten
Englisch, Deutsch, Französisch, Latein, Spanisch und Italienisch; Source und
Target müssen unterschiedlich sein.

Eine zentrale Sprach-Registry leitet Sprachcode, Standard-Speech-Locale und
OCR-Modell ab. Die normalen Formulare enthalten keine editierbaren technischen
Sprachfelder. Ein standardmäßig geschlossenes `details` zeigt die abgeleiteten
Werte nur informativ. Pflichtfehler werden direkt am Feld ausgegeben, erhalten
vorhandene Eingaben und fokussieren das erste fehlerhafte Feld.

Die Author-Bibliothek listet nur eigene, importierte oder duplizierte Kurse.
Ohne diese Inhalte zeigt sie „Noch kein eigener Kurs“ sowie Book Capture als
primäre Aktion. Ein neutraler gebündelter Fallback bleibt für die technische
Laufzeit verfügbar, erscheint aber nicht als Kurskarte. Frühere eindeutig als
`bundled` und nicht editierbar gespeicherte Snapshots werden unabhängig von
ihrer alten ID entfernt; lokale Kurse bleiben unverändert.

„Kursdatei herunterladen“ verwendet überall denselben bestehenden kanonischen
JSON-Exporter: in Kursbibliothek, Course Builder und Book-Capture-Abschluss.
Die Datei wird automatisch erstellt und muss weder manuell geschrieben noch
bearbeitet werden. Sie enthält Kursmetadaten, Sprachen, Units, Wörter und
stabile Inhalts-IDs; Bilder, technische Erkennungsdaten, Lernstände, XP und
lokale Stimmenpräferenzen bleiben ausgeschlossen. Der Dateiname entsteht aus
dem normalisierten Kurstitel und optional der Jahrgangsstufe. Die Datei kann
erneut importiert oder für den bestehenden Browser-/SCORM-Buildprozess genutzt
werden.

Die Source-Stimmenauswahl zeigt höchstens „Automatisch“ plus vier passende,
deduplizierte Geräte-Stimmen. Locale, Sprache, lokale Verfügbarkeit, allgemeine
Qualitätsmerkmale und eine stabile Sortierung bestimmen die Auswahl. Labels
nennen Stimme, Sprache und – sofern ableitbar – Region. Fehlende gespeicherte
Stimmen fallen auf Automatik zurück. Author-Funktionen bleiben physisch aus
Learner- und SCORM-Dateiplänen ausgeschlossen.

## Sprint 3.2 – UX-Korrekturen und Book Capture

Sprint 3.2 verändert weder Lernbewertung, Scheduler, XP, Kurs-, Unit- oder
Wort-IDs noch Delivery. Der Footer enthält nur EduTools und das MJ-Signet. Eine
verfügbare nicht leere Unit ist als vollständiger nativer Button auswählbar und
setzt `courseConfig.currentUnit` im bestehenden Kurskontext. Eigene Kurse
persistieren ihren kanonischen `current`-Status über den vorhandenen
Course-Library-Service. Learning State, Wiederholungstermine, Markierungen und
Motivation bleiben unangetastet. Leere Units zeigen „Diese Unit enthält noch
keine Wörter.“ und gesperrte Units bleiben statisch.

Falsches Quiz- und Schreibfeedback wiederholt die bereits sichtbare Auswahl
beziehungsweise Eingabe nicht mehr. Wertschätzende Einordnung, Lösung,
Scaffolding-Hint, Beispiel, Status und Weiter-Aktion bleiben erhalten. Die
Abschlussauswertung darf eine falsche Eingabe weiterhin als „Eingabe“ listen,
weil dort das ursprüngliche Feld nicht mehr sichtbar ist.

Die Source-only-Aussprache besitzt drei lokale Rate-Presets: `0.8`, `0.9` und
`1.05`; Pitch bleibt `1.0`, Lautstärke `1`. Die Voice-Auswahl priorisiert
exakte Locale, Sprachmatch, lokale Stimmen, eine allgemeine gekapselte
Qualitätsheuristik und einen stabilen Fallback. `voiceschanged` aktualisiert
einen zentralen Cache über genau einen Listener. Unter `#/settings` können nur
verfügbare Source-Stimmen gewählt werden. Präferenzen liegen im lokalen
Browserprofil, nicht im Kurs, Learning State oder SCORM. Eine fehlende
gespeicherte Stimme fällt sichtbar und funktional auf Automatik zurück.

Der bestehende Author-Bildimport wird ohne zweite Architektur zu Book Capture.
„Buchseite importieren“ ist der primäre Einstieg; CSV, TSV, TXT und JSON bleiben
nachgeordnet erreichbar. Der sichtbare Ablauf umfasst „Seiten hinzufügen“,
„Prüfen“, „Übernehmen“ und „Fertig“. Mehrere Seiten teilen Zielkurs und
Ziel-Unit, können geordnet, entfernt, gedreht, zugeschnitten und einzeln erneut
analysiert werden. Nach der Auswahl startet die vorhandene lokale Analyse
automatisch.

Der Review zeigt Zahl der erkannten Zeilen, Prüfstellen und Duplikate. Valide
Zeilen sind vorausgewählt; „Nur zu prüfende Stellen“ konzentriert Warnungen,
Fehler und Duplikate. Desktop verwendet Originalseiten und Vokabelkarten als
Split-View, mobil stehen sie untereinander mit aufklappbaren Originalen.
Kanonische Felder, mehrere Targets, Crop-Ausschnitt, Duplizieren, Verbinden,
Teilen, Reset sowie begrenzte Mehrfachaktionen bleiben bearbeitbar. Fehler
blockieren die Importübersicht. Duplikate werden bewusst entschieden und nie
still überschrieben.

Die transaktionale Übernahme validiert die vollständige Kurskopie und speichert
erst danach einmal. Die Abschlussansicht bietet „Jetzt lernen“, „Weitere
Buchseite importieren“, „Kursdatei herunterladen“ und „Zum Course Builder“.
Bilder, Bitmaps, Canvas,
Object-URLs und technische Analysedaten bleiben flüchtig und werden bei
Entfernen, Abbruch, Abschluss oder Runtime-Zerstörung freigegeben. Author
enthält Engine und Modelle; Learner und SCORM enthalten weder Book Capture noch
den `ocr/`-Pfad. Eine Importhistorie, automatische Doppelseitentrennung,
Perspektivkorrektur, Handschrifterkennung, Übersetzung, Cloud oder KI gehören
nicht zu Sprint 3.2.

## Sprint 3.4 – HEIC-/HEIF-Import für iPhone-Fotos

Book Capture erkennt HEIC/HEIF zentral über MIME-Type oder Dateiendung. Vor der
bisherigen Bildvorverarbeitung erzeugt ein austauschbarer Author-Adapter lokal
eine flüchtige JPEG-Arbeitskopie mit Qualität 0,92. Sichtbare
HEIF-Transformationen und Seitenverhältnis bleiben erhalten; EXIF-, XMP- und
GPS-Metadaten werden nicht kopiert. JPG, PNG und WebP bleiben auf ihrem
bisherigen Pfad.

Mehrfachauswahlen werden sequentiell in ihrer ursprünglichen Reihenfolge
bearbeitet. Fortschritt und Abbruch bleiben verständlich; ein Einzelfehler
verwirft keine gültigen Fotos und ein Retry dupliziert bereits übernommene
Seiten nicht. Die Session persistiert weder Originale noch Arbeitskopien.

`heic-to` 1.5.2 mit libheif 1.22.2 wird in der LGPL-3.0-CSP-Variante lokal mit
Lizenz und SHA-256-Manifest gebündelt und erst beim ersten iPhone-Foto geladen.
Nur die Author-CSP ergänzt den für diese Variante erforderlichen Blob-Worker.
Der positive Learner-Dateiplan und damit SCORM enthalten weder Decoder,
Book-Capture-Code noch Fixtures; ihre CSP bleibt unverändert.

Keine Cloud-Konvertierung, automatische Inhaltskorrektur, Bildpersistenz,
neue Lernfunktion oder Änderung am kanonischen Kursmodell gehört zu Sprint 3.4.

## Sprint 3.5 – Smart Review für komplexe Vokabelseiten

Die vorhandene lokale Texterkennung bleibt unverändert. Nach ihrer Ausgabe
bildet Book Capture die Tabellenstruktur geometrisch: höchstens zwei
wiederkehrende relative Spaltengrenzen, plausible Source-Zellen als
Zeilenanker und vertikal nahe Fortsetzungen. Dadurch steht eine fachliche
Vokabelzeile nicht länger für jede einzelne OCR-Baseline.

Die linke Spalte liefert Source und darin enthaltene eckig geklammerte IPA.
Grammatische Zusätze wie `(to)` bleiben im Source-Feld. Die mittlere Spalte
liefert Targets und verbindet kontrollierte Wortumbrüche beziehungsweise
mehrzeilige Bedeutungen. Die rechte Spalte wird ohne Fachinhalt zu erfinden als
Beispiel, Hinweis/Usage, Wortbeziehung, ignorierbar oder unklar klassifiziert.
Überschriften, Seitenmarker, Randdekorationen und nicht zuordenbare Blöcke sind
keine übernahmebereiten Vokabeln.

Smart Review zeigt problematische Einträge zuerst, danach valide Vokabeln sowie
eigene Gruppen für Abschnitte und nicht zugeordnete Inhalte. Die drei primären
Fachfelder Source, Targets und Lautschrift bleiben direkt sichtbar; Hinweis,
Beispiel und Tags werden nachgeordnet bearbeitet. Warnungen sind kompakt und
textlich verständlich. Eine vorgeschlagene Spaltenneuzuordnung ist eine
bewusste, rückgängig machbare Einzelaktion.

Der vollständige Zeilenausschnitt umfasst die Tabellenbreite und vertikalen
Kontext. Unter der Spaltenprüfung dürfen Lehrkräfte relative Grenzen anpassen
und eine Seite nach Bestätigung aus den bereits vorhandenen flüchtigen OCR-Boxen
neu strukturieren. Dafür wird weder OCR erneut gestartet noch ein Entwurf
persistiert. Ein Reset stellt die allgemeine Geometrieerkennung wieder her.

Eine synthetische, verlagsneutrale Dreispaltenfixture mit 20 Einträgen misst
Zeilen-, Source-, Target- und IPA-Zuordnung, Falschzeilen und Review-Anteil.
Sie bleibt test-only. Eine reale Praxisdatei ist nicht Bestandteil des
Repositories; ohne bereitgestellte Datei werden keine realen Qualitätswerte
behauptet. Course Builder, Importtransaktion, OCR-Engine, kanonisches
Kursmodell, Learner-, SCORM- und Datenschutzgrenzen bleiben unverändert.

## Sprint 3.6 – zuverlässiger Schnellimport aus zwei Spalten

Der empfohlene und voreingestellte Book-Capture-Ablauf verarbeitet nur
Ausgangsbegriffe mit optionaler Lautschrift und die zugehörigen Übersetzungen.
Die rechte Spalte mit Beispielen, Hinweisen, Grammatik- und Infoboxen gehört
nicht zum Standardimport. Diese Produktentscheidung priorisiert einen schnell
prüfbaren, fachlich schmalen Entwurf vor möglichst vollständiger Extraktion.

Vor der Erkennung zeigt jede Seite drei beschriftete Bereiche und zwei relative
Grenzen. Native Range-Eingaben sind per Maus, Touch und Tastatur bedienbar; die
Einstellung kann seitenspezifisch bleiben, zurückgesetzt oder bewusst auf alle
Seiten übertragen werden. Source und Target werden als getrennte Arbeitskopien
erkannt. Der rechte Bereich wird schon bei der Bilderzeugung ausgespart und
kann deshalb weder Bounding Boxes noch Zeilen, Klassifikationen oder Warnungen
erzeugen.

Die sprachneutrale Bereinigung entfernt Linien- und Boxreste, Seitenangaben und
Randnummern konservativ vor der Feldübernahme. Bekannte Abschnittsüberschriften
werden als Struktur und nicht als Vokabel geführt. Source bleibt der
Zeilenanker; eckig geklammerte IPA wird in das Lautschriftfeld verschoben,
grammatische Zusätze bleiben erhalten und vertikal nahe Target-Fortsetzungen
werden zusammengeführt.

Der normale Review zeigt direkt nur Source, Targets, Lautschrift,
Übernahmestatus und den auf beide analysierten Spalten begrenzten
Zeilenausschnitt. Hinweis, Beispiel und Tags bleiben unter „Weitere Felder“
bearbeitbar. Zeichenpositions-Teilung, Zeilenverschiebung und
Massenbearbeitungswerkzeuge gehören nicht mehr zur sichtbaren Standardoberfläche.
Die ältere dreispaltige Logik bleibt intern für Regressionen bestehen; ein
experimenteller erweiterter Modus wird nicht angeboten.

Eine künstliche, verlagsneutrale Fixture enthält 18 Einträge, IPA,
mehrzeilige Targets, Überschriften, Randzahlen, Tabellenlinien, eine rechte
Beispielspalte und zwei Infoboxen. Sie belegt exakt 18 Karten, mindestens 17
korrekte Sources und Targets sowie mindestens 16 korrekt getrennte
Lautschriften. Die strukturelle Parität nach HEIC-, JPEG- und PNG-Dekodierung
wird automatisiert geprüft. Da keine reale Praxisdatei bereitgestellt wurde,
bleiben reale Erkennungsquote, Korrekturzahl, Review-Zeit und die endgültige
Praxistauglichkeitsabnahme ausdrücklich offen.

## Sprint 3.7 – Produktvereinfachung, Importworkflow und Lernserie

### Unterstützte Importwege

Book Capture ist im normalen Produkt deaktiviert, weil komplexe
Schulbuchseiten lokal nicht zuverlässig genug strukturiert wurden. Es gibt
keinen sichtbaren Bildimport-Einstieg. Author-, Learner-, Browser- und
SCORM-Builds enthalten keine OCR-/HEIC-/WASM-/Modell-Assets und keine dafür
gelockerte CSP. Der historische Quellcode bleibt isoliert und nicht
ausgeliefert.

Primär sind eine validierte EduTools-JSON-Kursdatei und eine vorbereitete
CSV-/TSV-/TXT-Tabelle. Die neutrale UTF-8-CSV-Vorlage verwendet
`source,target,phonetic,hint,example,tags,unit`; mehrere Targets oder Tags werden
mit `|` getrennt. Ein kopierbarer neutraler Prompt beschreibt dieselbe
Tabellenstruktur. EduTools ruft damit keinen Dienst auf; jede Übernahme läuft
weiter über Vorschau, Duplikatentscheidung, Kursvalidierung und atomare
Speicherung. JSON- und Tabellen-Roundtrip bleiben lehrwerks- und
sprachenpaarunabhängig.

### Lokale Lernserie

Ein qualifizierender Lerntag entsteht ausschließlich nach einer vollständig
abgeschlossenen Flashcard-, Quiz-, Schreib- oder Speed-Session mit
mindestens einem bearbeiteten Wort. Der lokale Gerätekalender liefert den
Schlüssel `YYYY-MM-DD`. Weitere Sessions am selben Tag verändern die Serie
nicht. Der direkte Folgetag erhöht sie; nach einer Lücke startet sie beim
nächsten Abschluss bei eins. Die längste Serie bleibt als Maximum erhalten.

Ein kursweiter Tagesbonus von 5 XP wird höchstens einmal pro lokalem Datum
vergeben. Motivation State Schema 2 ergänzt letzten qualifizierten lokalen Tag,
Zeitstempel, aktive Gesamttage und getrennte Deduplizierung für den Tagesbonus.
Die Migration erhält vorhandene XP, Level, Sessions, Lerntage, Wortschlüssel
und Meilensteine. Die Daten bleiben lokal auf dem Gerät und werden nicht
synchronisiert. Zeitzonen- und Uhreinstellungen des Geräts sind maßgeblich; es
gibt kein Streak-Freeze.

### Nicht Bestandteil

Keine OCR-Weiterentwicklung, Bild-KI, eigene Speech-to-Text-Cloud,
Audioaufzeichnung, phonetische Bewertung, Streak-Freeze, Erinnerungen,
Nutzerkonten oder Gerätesynchronisierung.

## Sprint 3.8 – radikal vereinfachter Importworkflow

Im Author-Profil ist „Vokabelliste importieren“ der primäre Einstieg in einer
leeren Kursbibliothek. „Kurs manuell anlegen“ bleibt sekundär. Der JSON-Weg
erscheint nachrangig unter „Weitere Importmöglichkeiten“ als
„EduTools-Kursdatei wiederherstellen“ und ist ausschließlich für zuvor
gesicherte vollständige Kursdateien beschrieben.

Der Direktimport erfasst Kursname, Ausgangs- und Zielsprache und optional eine
Beschreibung, ohne vorher einen leeren Kurs anzulegen. CSV-, TSV- und TXT-
Zeilen dürfen Units unmittelbar benennen; EduTools gruppiert sie in der
Reihenfolge ihres ersten Auftretens. Eine neue Unit und mit `|` getrennte
Mehrfachübersetzungen sind regulär gültig. Leere optionale Felder erzeugen
weder Fehler noch Warnung. Die Warnstufe „Zu prüfen“ ist ausschließlich für
konkret erklärte Auffälligkeiten vorgesehen, etwa nicht zugeordnete gefüllte
Spalten.

Die Importübersicht trennt Fehler und Prüfhinweise von der kompakten Tabelle
gültiger Vokabeln. Sie nennt Vokabelzahl, gültige Zeilen, Prüfhinweise,
Fehler, Duplikate und neue Units. Neue Units erscheinen einmalig mit ihrer
Vokabelzahl. Lange gültige Listen sind standardmäßig eingeklappt. Der
haftende Speicherbereich zeigt den Umfang und deaktiviert „Kurs speichern“
nur bei einem konkreten Blocker. Mehrfaches Speichern derselben Vorschau ist
gesperrt.

Nach erfolgreicher Kursvalidierung wird der gesamte Kurs atomar in der lokalen
Kursbibliothek gespeichert. Die Bestätigung bietet „Kurs öffnen“, „Zur
Kursbibliothek“ und einen weiteren Import an. Der gespeicherte Kurs bleibt
nach einem Reload vollständig bearbeitbar und per EduTools-JSON exportier- und
wiederherstellbar. Lernlogik, Motivation, Storage-Schema, SCORM und
Veröffentlichungsprofile werden fachlich nicht geändert.

## Sprint 3.9 – Release-Härtung ohne neue Funktionen

Version `3.9.0` verändert weder den Sprint-3.8-Import noch Lernmodi,
Kursdaten, XP-Regeln oder sichtbare Produktabläufe. Die Releasegrenzen werden
stattdessen technisch verbindlich: Kein Author-, Learner-, Pages- oder
SCORM-Artefakt darf Book Capture, OCR-/HEIC-/Tesseract-Ressourcen,
SpeechRecognition, Mikrofon- oder Aufnahmecode enthalten. Der historische
Bildimport-Quellpfad bleibt dokumentiert, testbar und als Entwicklungsbestand
erhalten, kann aber weder per Route noch per Profil reaktiviert werden.

Author enthält weiterhin Kursbibliothek, Course Builder, manuelle Erstellung,
CSV-/TSV-/TXT-Import, CSV-Vorlage, Import-Prompt sowie JSON-Wiederherstellung
und -Export. Learner und SCORM enthalten ausschließlich Lernfunktionen,
Fortschritt, Motivation, Lernserie und die bestehende ausgehende
Source-Audioausgabe. Spracherkennung, Sprechübung und Mikrofonberechtigungen
sind ausdrücklich nicht unterstützt.

Produktive Cache-Referenzen und Metadaten verwenden einheitlich `3.9.0`.
Positive Dateipläne, restriktive CSP, atomare Clean Builds, deterministische
Manifeste und ZIPs, Pfadprüfungen, idempotente Migrationen sowie Import- und
JSON-Roundtrip-Regressionen bilden die Freigabegrenze. Es gibt weiterhin
keinen Service Worker, keine Cloud, Synchronisierung, automatische
Übersetzung, OCR oder neue Importformate.

## Historischer Designstand Sprint 2.1

Sprint 2.1 führt alle bestehenden Funktionen in der visuellen Richtung
„Nordic Education“ zusammen, ohne Lernlogik, Datenmodell, XP-Regeln,
Wiederholungsplanung oder Kursfunktionen zu verändern:

- Die damalige zentrale Palette verwendete sehr helle lavendelgetönte
  Neutrals, dunkles blauviolettes Textsystem und gedecktes Lavendel. Sprint 3.1
  ersetzt diese App-Farbidentität durch das zentrale Vocabulary-Theme;
  Statusfarben bleiben weiterhin getrennt.
- Zentrale Tokens definieren Farben, 4-Pixel-Abstände, Rundungen, Schatten,
  Systemtypografie, Inhaltsbreiten, Touchziele, Fokus, Bewegung und eine kleine
  z-index-Skala. Rohfarben bleiben auf die Token-Datei begrenzt.
- Die App-Shell enthält Marke, aktiven Kurs, Skip-Link, beschriftete
  Hauptnavigation und Einstellungen. Lern- und Kursunterseiten markieren den
  zugehörigen Hauptbereich zusätzlich mit `aria-current`.
- Das Dashboard priorisiert die nächste Lernhandlung, aktuellen Lernstatus und
  vier erklärte Lernmodi vor fachlichem Fortschritt, kompakter Motivation und
  Kursverwaltung.
- Karten, Buttons, Icon Buttons, Formulare, native Radio-Auswahlkarten,
  Feedback, Status-Badges, Empty States, Dialoge und Progress-Anzeigen folgen
  gemeinsamen Zustands- und Fokusmustern.
- Flashcards, Quiz, Schreibtraining, Speed Challenge und Aussprache besitzen
  eine einheitliche Lernsitzungsoberfläche. Die Flashcard-Bewertungen „Kann ich“
  und „Noch nicht“ sind visuell gleichwertig.
- Die Fortschrittsansicht trennt fachliche Kennzahlen weiterhin sichtbar von
  Motivation. Level-up bleibt ein ruhiger, tastaturbedienbarer Dialog.
- Kursbibliothek, Kurseditor, Unit-/Wortverwaltung und Import verwenden eine
  dichtere, aber konsistente Autorenoberfläche. Importvorschauen scrollen nur in
  ihrem gekennzeichneten Bereich.
- Das responsive System ist mobile-first und für 320, 375, 768, 1024, 1440
  und 1920 Pixel sowie 200 Prozent Browserzoom ausgelegt. Touchziele bleiben
  ungefähr 44 × 44 Pixel groß; `prefers-reduced-motion` wird zentral beachtet.
- Allgemeine Komponenten sind für spätere EduTools-Apps dokumentiert.
  Flashcards, Wortpaare, Vokabel-Ausspracheposition und Unit-/Worteditor bleiben
  Vocabulary-spezifisch und werden nicht vorschnell in einen Core ausgelagert.

Die praktische Designreferenz steht in `docs/DESIGN_SYSTEM.md`. Das Redesign
führt keine externe Bibliothek, keinen Webfont und keine neue fachliche Funktion
ein.

## Umgesetztes Visual Polish und didaktische Korrekturen

Sprint 2.1.1 schärft die bestehende Nordic-Education-Oberfläche ohne neue
Lernlogik: Funktionsseitentitel verwenden eine kompakte gemeinsame Hierarchie,
die Flashcard folgt vor dem Aufdecken ihrer tatsächlichen Inhaltshöhe, die
Quiz-Umfangsauswahl bildet ein ausgeglichenes Raster und die Motivationskarte
zeigt Level, XP, Lernserie und Level-Fortschritt kompakt. Leere Units erklären
ihren Zustand ohne Prozentwert. Der native JSON-Datei-Input bleibt erhalten,
zeigt Dateityp, Dateinamen und verknüpften Fehler in der Designsprache.

Alle `hint`-Inhalte mitgelieferter Kurse sind kurze Definitionen oder
Umschreibungen in der jeweiligen Source-Sprache, ohne das gesuchte Source-Wort.
Die deutsche UI-Beschriftung bleibt getrennt; Hinweis- und Beispieltexte
erhalten den konfigurierten Source-Sprachcode. Der Kurseditor bezeichnet das
Feld als „Hinweis in der Lernsprache“, und die Importhilfe dokumentiert:
`hint` enthält Source-Scaffolding, Übersetzungen gehören in `targets`. Es findet
keine automatische Übersetzung oder Spracherkennung statt. Gebündelte
Beispielinhalte bleiben künstlich und lehrwerksunabhängig.

## Umgesetzte verbindliche didaktische Korrekturen und Flashcard-Lernrichtung

Sprint 2.1.2 korrigiert den realen Laufzeitpfad der gebündelten Inhalte und
ergänzt genau die fehlende Flashcard-Richtungswahl:

- Jeder mitgelieferte Kurs besitzt eine stabile ID, `sourceType: "bundled"`,
  `editable: false` und eine `contentVersion`. Kurskonfiguration und Vokabeldaten
  werden über eine versionsabhängige URL geladen, damit geänderte Bundle-Inhalte
  nicht von einer alten HTTP-Cache-Antwort überlagert werden.
- Ein mitgelieferter Kurs wird direkt aus den aktuellen Bundle-Daten aufgebaut.
  Nur ein eindeutig als `bundled` gekennzeichneter alter Snapshot mit derselben
  ID wird isoliert entfernt. Eigene, importierte und duplizierte Kurse bleiben
  editierbar und inhaltlich unverändert.
- Stabile Kurs- und Wort-IDs sowie getrennte Storage-Schlüssel erhalten
  Learning State, Wiederholungstermine, Markierungen und Motivation bei einem
  reinen Inhaltsupdate.
- Scaffolding und HTML-Sprachattribut werden aus `languages.source` abgeleitet.
  Im aktuellen neutralen Fallback verwendet `cloudy` als konkrete Regression-Fixture
  „When the sky is covered with clouds.“
- Vor Tageslernen, Wiederholung, markierten Wörtern und übergebenen unsicheren
  Wortpaketen wird Source → Target, Target → Source oder Gemischt gewählt.
  Source → Target ist die nicht dauerhaft gespeicherte Standardauswahl.
- Eine gemischte Session weist jeder Wort-ID die Kartenrichtung beim Erzeugen
  einmal zu. Diese Zuordnung bleibt bei Aufdecken und Neurendern stabil und
  nutzt bei mindestens zwei Wörtern beide Richtungen.
- Target → Source zeigt alle Target-Inhalte als Vorgabe, aber weder Source-Wort
  noch Audio vor dem Aufdecken. Danach erscheinen Source-Lösung, Lautschrift,
  Source-Audio und Beispiel.
- „Markieren“ und „Markierung entfernen“ sind umrandete Secondary-Buttons mit
  textlichem und programmatischem Zustand. Das Umschalten bewertet das Wort
  nicht und hält den Fokus auf der Aktion.
- Der Course Builder bleibt vollständig erhalten: eigene Kurse konfigurieren
  Source- und Target-Sprache, verwalten Units und vollständige Wortfelder und
  unterstützen weiterhin CSV-, TSV-, TXT- sowie JSON-Import und JSON-Export.

Der Vocabulary Trainer besitzt keine Abhängigkeit von einem bestimmten
Lehrwerk, Verlag oder Sprachenpaar. Aussprache, Scaffolding und Lernrichtung
werden aus der jeweiligen Kurskonfiguration abgeleitet.

## Sprint 2.2 – Veröffentlichungsprofile und statische Kurs-Builds

Sprint 2.2 trennt die lokale Autorenarbeit von einer konkreten
Lernveröffentlichung, ohne zwei Produktlinien oder getrennte Lernlogiken zu
erzeugen.

### Veröffentlichungsmodi

- Das `author`-Profil liefert die vollständige Kursbibliothek und den Course
  Builder. Eigene Kurse, Source-/Target-Sprachen, Units, vollständige Wortfelder,
  CSV-/TSV-/TXT-Import und JSON-Import/-Export bleiben erhalten.
- Das `learner`-Profil bindet exakt einen validierten Vocabulary-Kurs ein. Es
  besitzt keine Kursverwaltung, keinen Kurswechsel, keinen Course Builder und
  keinen Import-/Exportcode.
- Beide Profile verwenden denselben Vocabulary Core, Scheduler, Lernmodi,
  Accessibility-Regeln und dieselbe visuelle Sprache.

### Capability- und Routenmodell

Eine zentrale Capability-Schnittstelle steuert Kursverwaltung, Buildrechte,
Import/Export, Kurswechsel, festen Kurs sowie Motivation, Aussprache und Speed
Challenge. Die App rendert Navigation und Routen aus diesen Fähigkeiten.
Nicht verfügbare direkte Hash-Routen führen in einen erklärenden Zustand mit
Rückkehr zum Dashboard. Learner-Builds enthalten Autorenmodule physisch nicht.

### Veröffentlichungskurs

Der Learner-Build lädt ausschließlich die im Laufzeitprofil benannte
`data/course.json`. Eine fehlende oder abweichende Kurs-ID ist ein
Initialisierungsfehler und fällt nicht still auf einen anderen oder lokal
gespeicherten Kurs zurück. Der Kurs ist in dieser Veröffentlichung fest; die
fachlichen Lernstände bleiben dennoch lokal und kursbezogen.

### Storage und Updates

Alle persistenten Daten verwenden `deploymentId` und `courseId`. Dadurch
bleiben Author und mehrere Learner-Deployments derselben Origin voneinander
getrennt. Eine stabile Deployment-ID erhält Lernstand und Motivation über
Buildupdates. Das Author-Profil migriert bekannte alte lokale Schlüssel
kopierend, idempotent und ohne Quelllöschung.

Die Aktualisierung über `contentVersion` gilt weiterhin ausschließlich für
eindeutig `bundled` gekennzeichnete Kurse. Eigene, importierte und duplizierte
Kurse werden niemals automatisch ersetzt, aktualisiert oder sprachlich
verändert.

### Statischer Build

Ein dependency-freies Node-Skript validiert Profil und Kurs, erstellt einen
positiven Dateiplan, schreibt temporär, prüft alle statischen Referenzen und
ersetzt das Ziel erst nach erfolgreicher Validierung. Das deterministische
Manifest enthält keine Buildzeit. Relative Ressourcen und Hash-Routing machen
die Ausgabe auf statischem Hosting in Unterordnern lauffähig.

### Abnahmerelevante Grenzen

- keine Cloud, Konten, Synchronisierung oder serverseitige Persistenz
- keine automatische CI-/Deployment-Pipeline
- keine Wiederherstellung laufender Sessions nach Reload
- genau ein Kurs je Learner-Build und kein Laufzeit-Kurswechsel
- öffentlich ausgelieferte Kursdaten sind im Browser technisch einsehbar

## Sprint 2.3 – kontrollierte Produktionsfreigabe

Der Vocabulary Trainer besitzt einen versionierten GitHub-Pages-
Deployment-Satz mit genau einem Learner-Root und einem getrennten Author-
Mount. Die Produktionsprofile sind explizit ausgewählt; Beispielprofile,
Fixtures und lokale Exporte sind keine Veröffentlichungsquellen.

Ein Release darf nur nach erfolgreichem produktivem Kursvalidator,
Export-/Import-Roundtrip, Learner-Buildnachweis, vollständiger Testsuite,
atomarer Assembly, Hashvalidierung und HTTP-Smoke-Tests freigegeben werden.
Course Builder, freie Sprachenpaare, vollständige Wortfelder und lokale
Import-/Exportwege bleiben im Author-Profil erhalten. Der Learner enthält
weiterhin genau einen bewusst gewählten Kurs und keine Autorenmodule.

GitHub Pages ist öffentlich: ausgelieferte Kursdaten sind nicht geheim. Ein
neuer Build mit stabiler `deploymentId`, Kurs-ID und Wort-IDs erhält lokale
Lern- und Motivationszustände. Diese Freigabe führt keinen Service Worker,
Backend, Cloudspeicher, Nutzerkonten oder neue Lernfunktion ein.

## Slice A – mehrere öffentliche Browser-Kurse bei unabhängigem SCORM-Export

ADR-018 ergänzt die weiterhin gültige Einzelkurs-Variante um einen
buildgenerierten Browser-Katalog. Ein Learner-Profil verwendet exklusiv
entweder `course.file` oder `courseCatalog.entries`. Der Pages-Katalog kopiert
nur ausdrücklich gelistete, kanonisch validierte Kurse und erzeugt
`data/courses/index.json` deterministisch aus deren Metadaten.

Jeder Browser-Kurs besitzt eine stabile, titelunabhängige `publicationId` und
ist über `?course=<publicationId>#/dashboard` direkt erreichbar. Ohne gültigen
Parameter zeigt der Learner eine Kursauswahl; unbekannte oder entfernte IDs
öffnen niemals still einen anderen Kurs. Learning State, Motivation und der
zuletzt gewählte Lernbereich bleiben über Deployment- und Kurs-ID getrennt.

Die Author-App kann eine kanonische Kursdatei für die spätere öffentliche
Bereitstellung vorbereiten, nachdem die öffentliche Abrufbarkeit und das
Fehlen von Namen, personenbezogenen Daten, Lehrwerksbildern und Scans bestätigt
wurden. Sie veröffentlicht nicht selbst. Der eigentliche Katalogeintrag und
Pages-Release bleiben kontrollierte Repository-Schritte.

Der bestehende SCORM-Export bleibt eine unabhängige Einzelkurs-Ausgabe. Seine
Vorlage verwendet weiterhin das feste Produktions-Learner-Profil; Katalog,
Kursauswahl und Browser-Publikationsmodule gelangen nicht in das ZIP.

## Noch nicht Bestandteil des MVP

- Accounts
- Cloud
- Klassenverwaltung
- Ranglisten
- KI
- Lehrkraft-Dashboard mit Schülerdaten
- weitere Lernmodi neben Flashcards, Multiple-Choice-Quiz, Schreibtraining und
  Speed Challenge
- Wiederherstellung einer laufenden Session nach einem Neuladen
- tägliche Aufgaben, XP-Shop, Ranglisten, Wettbewerbe oder soziale Vergleiche

## Sprint 2.4 – privater SCORM-1.2-Delivery-Kanal

Lehrkräfte können einen eigenen Author-JSON-Export lokal über ein strikt
validiertes Profil mit dem unveränderten Learner-Build zu einer privaten
SCORM-1.2-ZIP paketieren. Das Paket enthält genau einen Vocabulary-Kurs, keine
Autorenmodule und keine Browser- oder Lerndaten. Ein deterministisches
`imsmanifest.xml`, technische SHA-256-Dateiliste, CRC-validierte STORE-ZIP und
atomarer Dateiaustausch bilden die Release-Grenze.

Der isolierte SCORM-Adapter meldet je nach Profil entweder keinen Status oder
nach dem ersten regulären Abschluss eines vorhandenen Lernmodus `completed`.
Vorher kann ein neuer Versuch `incomplete` sein. Scores, Interactions,
Wortergebnisse, Namen, Nutzer-IDs und lokaler Detailstand werden nicht an das
LMS übertragen. Flashcards, Quiz, Schreiben und zeitlich vollständig beendete
Speed-Sessions verwenden dafür ein allgemeines, datenarmes Domain-Ereignis.

Private Kurse, Learner-Profile, SCORM-Profile und ZIP-Dateien sind Git-ignoriert
und vollständig vom öffentlichen Pages-Deployment getrennt. Der lokale
SCORM-Harness prüft Parent-/Opener-API, Fehlerzustände und fehlende API, ersetzt
aber nicht die reale ByCS-Abnahme. SCORM 2004, xAPI, LRS, zentrale
Lernstandssynchronisierung und neue Lernlogik bleiben ausgeschlossen.
