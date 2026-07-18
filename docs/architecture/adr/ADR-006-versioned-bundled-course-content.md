# ADR-006: Versionierte gebündelte Kursinhalte

## Status

Accepted

## Context

Mitgelieferte Kurse werden aus statischen JSON-Ressourcen erzeugt. Bei einem
früher verwendeten Beispielkurs lieferte der Browser nach einer
Inhaltskorrektur unter der
unveränderten Ressourcen-URL weiterhin eine ältere HTTP-Cache-Antwort. Dadurch
zeigte die Anwendung trotz korrigierter Quelldatei noch einen deutschen Hint.
Frühere Schema-1-Stände können außerdem einen Snapshot des mitgelieferten
Kurses in der lokalen Kursbibliothek enthalten. Lernstand und Motivation liegen
bereits in getrennten, kursbezogenen Speichern.

## Decision

- Jeder mitgelieferte Kurs besitzt eine stabile ID, `sourceType: "bundled"`,
  `editable: false` und eine positive `contentVersion` in Kurskonfiguration,
  Vokabeldaten beziehungsweise kanonischem Kursmodell.
- Kurskonfiguration und Vokabeldaten müssen dieselbe Kurs-ID und Inhaltsversion
  besitzen.
- Die App lädt gebündelte JSON-Ressourcen über eine mit der Inhaltsversion
  versionierte URL. Eine Inhaltsänderung erhöht diese Version und erhält die
  stabilen Kurs-, Unit- und Wort-IDs.
- Der aktuelle Bundle-Inhalt ist für den jeweiligen mitgelieferten Kurs
  autoritativ und
  wird direkt als unveränderlicher Bibliothekskurs verwendet.
- Ein alter lokaler Snapshot wird nur ersetzt, wenn er selbst eindeutig als
  `sourceType: "bundled"` und nicht editierbar gekennzeichnet ist, dieselbe
  stabile Kurs-ID besitzt und eine ältere `contentVersion` hat. Kurstitel,
  Lehrwerk, Verlag und Sprachenpaar sind für diese Entscheidung bedeutungslos.
- Lernstand, Wiederholungstermine, Markierungen und Motivation werden dabei
  weder migriert noch gelöscht, weil ihre getrennten Schlüssel und die stabilen
  Wort-IDs unverändert bleiben.
- Eigene, importierte und duplizierte Kurse tragen eine nicht gebündelte
  Herkunft und bleiben editierbar. Sie werden unabhängig von Titel,
  Sprachenpaar und `contentVersion` niemals automatisch an Bundle-Inhalte
  angeglichen. Ein importiertes JSON darf seine Herkunft nicht zu `bundled`
  hochstufen; eine Duplikation erhält eine neue ID und `sourceType: "duplicated"`.
- `languages.source` definiert Lernsprache, Scaffolding-Sprache,
  HTML-Sprachattribut und die einzige Sprachrolle mit Aussprache. Target-Inhalte
  erhalten kein Audio. Die Policy enthält keine Sonderfälle für konkrete
  Sprachcodes.

Der Vocabulary Trainer besitzt damit keine Abhängigkeit von einem bestimmten
Lehrwerk, Verlag oder Sprachenpaar. Aussprache, Scaffolding und Lernrichtung
werden aus der jeweiligen Kurskonfiguration abgeleitet.

## Consequences

### Positive Folgen

- Korrigierte mitgelieferte Inhalte erscheinen ohne manuellen Storage- oder
  Browsercache-Reset.
- Fachliche Lernhistorie und Motivation überstehen reine Inhaltsupdates.
- Eigene Inhalte bleiben vollständig unter Kontrolle ihrer Nutzenden.
- Der Course Builder bleibt lehrwerks-, verlags- und sprachenpaarunabhängig.
- Laufzeittests können die tatsächlich verwendete Bundle-Version eindeutig
  prüfen.

### Negative Folgen und Risiken

- Jede Änderung gebündelter Inhalte erfordert ein bewusstes Erhöhen der
  Inhaltsversion und des URL-Parameters.
- Bei absichtlich geänderten stabilen Wort-IDs kann bestehender Lernstand nicht
  automatisch dem neuen Wort zugeordnet werden; solche Änderungen benötigen
  eine eigene Migration.

## Alternatives considered

- Ein manueller Browserstorage-Reset wurde verworfen, weil er Lernstände und
  andere lokale Daten gefährdet und die Verantwortung auf Nutzende verlagert.
- Das dauerhafte Speichern des Built-in-Kurses gemeinsam mit eigenen Kursen
  wurde verworfen, weil dadurch veraltete Inhaltskopien bevorzugt werden
  könnten.
- Automatische Änderungen eigener Kurse wurden verworfen, weil ihre Inhalte
  nicht Teil des mitgelieferten Releases sind.

## Date

2026-07-14
