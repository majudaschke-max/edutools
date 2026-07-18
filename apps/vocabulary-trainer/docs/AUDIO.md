# Aussprache im Vocabulary Trainer

Die Aussprache nutzt ausschließlich `speechSynthesis` und
`SpeechSynthesisUtterance` des Browsers beziehungsweise Betriebssystems.
EduTools lädt keine Audiodatei und ruft keinen externen TTS-Dienst auf. Diese
Ausgabefunktion dient ausschließlich dem Anhören sichtbarer Source-Inhalte.
Sie verwendet weder `SpeechRecognition` noch Mikrofon, Aufnahme oder
Aussprachebewertung. Es wird keine Mikrofonberechtigung angefordert; diese
Abgrenzung gilt ebenso für Browser-Learner und SCORM.

## Didaktische Policy

- Nur Inhalte der konfigurierten Source-/Lernsprache erhalten Audio.
- Target-/Übersetzungsinhalte erhalten unabhängig vom Sprachenpaar keinen
  Audio-Button.
- Eine verborgene Source-Lösung wird erst nach Aufdecken beziehungsweise
  Auswertung hörbar.
- Speed Challenge bleibt ohne Aussprache.
- Ohne gültige Source-Locale oder Web Speech API bleiben alle Lernfunktionen
  vollständig nutzbar; Audioelemente werden nicht als leere Platzhalter
  gerendert.

## Automatische Voice-Auswahl

Der zentrale Service lädt und cached die Browserstimmen. Eine anfangs leere
Liste ist zulässig; genau ein `voiceschanged`-Listener aktualisiert den Cache.
Die normale Oberfläche zeigt bewusst nur verlässlich geprüfte Stimmen. Für
`en-GB` ist Daniel die erste und standardmäßig gewählte Stimme. Optional wird
genau eine auf dem Gerät tatsächlich installierte weibliche Alternative aus
einer kleinen, locale-spezifischen Positivliste angeboten. Für `en-GB` wird
Serena vor Kate und Martha geprüft. Eddy, Flo und Grandma gehören nicht zur
sichtbaren Auswahl. Stimmen einer anderen Locale werden nicht als Alternative
angeboten.

Für andere Source-Sprachen wird höchstens eine lokale Stimme sichtbar, wenn
deren Browsermetadaten ausdrücklich eine hochwertige Variante kennzeichnen.
Ohne verlässlich prüfbare Option bleibt der sprachpassende sichere
Browserfallback aktiv. Eine gespeicherte Stimme wird nur verwendet, wenn sie
noch zur geprüften sichtbaren Auswahl gehört. Fehlt sie nach Gerätewechsel,
fällt die Ausgabe geräuschlos auf Daniel oder – wenn Daniel nicht installiert
ist – auf die nächste geprüfte beziehungsweise sichere sprachpassende Stimme
zurück.

## Einstellungen

Unter `#/settings` enthält „Aussprache“ native Controls für:

- Langsam: Rate `0.8`,
- Normal: Rate `0.9`,
- Schnell: Rate `1.05`,
- Stimme: Daniel und optional eine geprüfte weibliche Alternative.

Die sichtbare Auswahl umfasst damit höchstens zwei konkrete Stimmen. Ist nur
Daniel verfügbar, bleibt die Einstellung fest auf Daniel. Ist keine geprüfte
Stimme verfügbar, zeigt die Oberfläche nur den sicheren automatischen
Source-Sprachfallback. Labels verwenden „Stimmenname – Sprache (Region)“;
Voice-URI, Providerkennung und rohe Browserlisten bleiben verborgen.

Pitch bleibt neutral bei `1.0`, Lautstärke bei `1`. Tempo und Stimmauswahl
werden deploymentweit im lokalen Browserprofil gespeichert. Sie sind nicht
Teil von Kurs-JSON, Learning State, Motivation, Export oder SCORM-Inhaltsdaten.
Bei einem Kurswechsel wird die passende Stimme anhand der neuen Source-Locale
neu aufgelöst.

## Lifecycle und Accessibility

Es läuft höchstens eine Ausgabe. Ein erneuter Klick auf dieselbe Aussprache
stoppt sie; eine andere Ausgabe beendet zuerst die vorherige. Routenwechsel,
Neurendern und Runtime-Zerstörung stoppen laufende Sprache und entfernen
Listener. Buttons sind nativ, mindestens 44 × 44 Pixel groß, besitzen sichtbaren
Fokus, `aria-pressed` und wechselnde Abspielen-/Stoppbeschriftungen. Eine ruhige
Live-Region meldet Start, Ende, Stopp oder Fehler.

## Manuelle Hörcheckliste

Automatisierte Tests prüfen Auswahl, Rate, Lifecycle und Fallback, nicht die
subjektive Natürlichkeit einer Systemstimme. Für jede konkrete Zielumgebung ist
deshalb hörend zu prüfen:

1. kurzes Source-Wort,
2. langes Source-Wort,
3. Source-Beispielsatz,
4. Langsam, Normal und Schnell,
5. Daniel und die tatsächlich angebotene weibliche Alternative,
6. schnelle wiederholte Klicks und kontrollierter Abbruch,
7. nicht mehr vorhandene gespeicherte Stimme,
8. Kurswechsel zu einer anderen Source-Sprache,
9. keine Audioaktion für Target oder verborgene Source-Lösung.

Chromium, Safari/macOS und Safari/iPadOS können unterschiedliche Stimmen
melden. Eine Umgebung darf nur dann als hörend geprüft dokumentiert werden,
wenn dort tatsächlich Ton ausgegeben und beurteilt wurde.
