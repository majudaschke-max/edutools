# Motivation, XP und lokale Lernserie

Motivation ist eine optionale, kursbezogene Datendomäne neben dem fachlichen
Learning State. XP, Level und Lernserie verändern weder Scheduler noch
Wortbewertung.

## Qualifizierender Lerntag

Ein Tag zählt, wenn eine reguläre Flashcard-, Quiz-, Schreib-, Speed- oder
Sprechsession vollständig abgeschlossen wurde und mindestens ein Wort
bearbeitet wurde. Mehrere Sessions am selben Tag erhöhen die Serie nicht
erneut. Abbruch, leere Auswahl, Navigation oder App-Start qualifizieren nicht.

Der Datumsschlüssel wird aus dem lokalen Kalender des Geräts als `YYYY-MM-DD`
gebildet. Der direkt folgende Kalendertag erhöht die aktuelle Serie. Nach einer
Lücke beginnt sie beim nächsten Abschluss bei eins. Die längste Serie bleibt
das Maximum. Die Anzeige gilt am letzten Lerntag und am unmittelbar folgenden
Tag als aktuell; erst ein neuer qualifizierender Abschluss schreibt Zustand.

Die Lernserie wird nur lokal auf dem Gerät gespeichert und nicht zwischen
Geräten synchronisiert. Zeitzonen- und Uhreinstellungen des Geräts bestimmen
den lokalen Tag. Es gibt kein Streak-Freeze und keine nachträgliche Korrektur.

## XP

Der Tagesabschluss vergibt 5 XP höchstens einmal pro lokalem Datum und Kurs,
unabhängig von der Zahl der Lernmodi. Wortbezogene XP werden zusätzlich durch
Tages-, Modus-, Wort- und Session-Schlüssel dedupliziert. Fehler geben keine
negativen XP.

## Speicherung und Migration

Motivation State Schema 2 ergänzt `lastQualifiedLocalDate`,
`lastQualifiedTimestamp`, `totalActiveDays`,
`awardedDailyBonusDateKeys`. Die Migration aus Schema 1 erhält XP, Level,
vorhandene Lerntage, Sessions, Wortschlüssel und Meilensteine. Beschädigte
Daten fallen isoliert auf einen leeren Motivationszustand zurück und
beschädigen niemals den Learning State.
