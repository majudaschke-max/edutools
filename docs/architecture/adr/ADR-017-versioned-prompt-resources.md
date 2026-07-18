# ADR-017: Versionierte lokale Promptressourcen

## Status

Accepted

## Context

Der anbieterneutrale Importprompt war als langer String im JavaScript des
Author-Imports hinterlegt. Dadurch waren fachlicher Prompttext, dynamischer
Kurskontext und Zwischenablage-Integration gekoppelt. Neue Promptversionen
oder weitere Prompttypen hätten Codeänderungen an derselben Stelle erfordert.
Der geplante KI-Import bleibt zugleich ein manueller, lokaler Workflow: Es
gibt weder API-Aufruf noch automatische Datenübertragung.

## Decision

- Vollständige Prompttexte liegen als versionierte UTF-8-Klartextressourcen
  außerhalb des JavaScript-Codes unter `src/prompts/<familie>/`.
- Eine generische Registry ordnet Prompttyp und Version einer lokalen
  Ressourcen-URL, einem Platzhaltervertrag und einem SHA-256-Wert zu. Pro Typ
  darf genau eine Standardversion existieren; eine Version kann ausdrücklich
  ausgewählt werden.
- Der Loader lädt ausschließlich die registrierte lokale Ressource, prüft vor
  der Verwendung ihren SHA-256-Wert und validiert anschließend den
  Platzhaltervertrag. Erfolgreiche Ladevorgänge werden pro Typ und Version
  gecacht; fehlgeschlagene nicht.
- Die Template-Engine akzeptiert nur deklarierte Platzhalternamen. Fehlende,
  unbekannte, mehrfach verwendete oder syntaktisch beschädigte Platzhalter
  werden abgelehnt. Eine freie oder rekursive String-Ersetzung findet nicht
  statt.
- Der PromptGenerator trennt Ressource und Werterzeugung. Der Vocabulary-
  Provider setzt Kursname, Source- und Target-Sprache, unterstützte Sprachen
  sowie das aktuelle importierbare Kursschema ein. Schulart und Jahrgang sind
  als optionale Eingaben vorbereitet.
- Weitere Promptfamilien wie Reading, Grammar oder Quiz registrieren eine
  eigene Ressource und eine kleine Werterzeugung; Loader, Template-Engine und
  Generator bleiben unverändert.
- Die bestehende Importfassade und der bereits asynchrone UI-Handler bleiben
  die einzige Integration. Es entsteht keine neue Route, View oder
  KI-Schnittstelle.
- Prompt-Engine und Ressourcen gehören zum positiven Author-Dateiplan.
  Learner- und SCORM-Builds enthalten sie physisch nicht.
- Die Verträge bleiben im bundlerfreien JavaScript-Projekt mit `@ts-check`
  und JSDoc beschrieben. Es wird keine Templatebibliothek eingeführt.

## Consequences

### Positive Folgen

- Fachlicher Prompttext kann einzeln geprüft, ausgetauscht und versioniert
  werden, ohne ihn erneut in JavaScript einzubetten.
- Eine beschädigte oder versehentlich veränderte Promptdatei wird vor dem
  Kopieren erkannt.
- Dynamische Werte werden deterministisch und ohne Interpretation ersetzt.
- Neue Promptversionen und -typen benötigen keine parallele Engine.
- Browser-Learner und SCORM bleiben frei von Authoring- und Promptcode.
- Der bestehende Importprompt, die Oberfläche und die Datenschutzgrenze
  bleiben fachlich unverändert.

### Negative Folgen und Risiken

- Der bestehende Kopiervorgang lädt beim ersten Aufruf eine zusätzliche lokale
  Textdatei. Schlägt die statische Auslieferung fehl, zeigt die vorhandene UI
  ihre verständliche Kopierfehlermeldung.
- Jede fachliche Änderung einer Promptressource erfordert einen bewusst
  aktualisierten SHA-256-Wert und passende Tests.
- Die Promptversion ist derzeit eine Code-/Buildentscheidung. Eine sichtbare
  Versionsauswahl ist ausdrücklich nicht Bestandteil dieser Entscheidung.

## Alternatives considered

- Ein JavaScript-Template-String wurde verworfen, weil er Prompttext und
  Ausführungslogik erneut koppeln würde.
- Ein frei programmierbares Templatepaket wurde verworfen, weil die sieben
  deklarativen Platzhalter keine externe Abhängigkeit rechtfertigen.
- Ein zweites exportiertes Promptdateiformat oder Remote-Repository wurde
  verworfen, weil EduTools weiterhin statisch, lokal und anbieterneutral
  arbeiten soll.
- Promptressourcen in Learner und SCORM wurden verworfen, weil dort kein
  Import- oder Authoring-Workflow existiert.

## Date

2026-07-17
