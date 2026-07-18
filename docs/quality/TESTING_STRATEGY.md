# Testing Strategy

In der frühen Foundation-Phase liegt der Schwerpunkt auf kleinen, nachvollziehbaren manuellen Prüfungen. Automatisierte Tests werden ergänzt, sobald echte Programmlogik vorhanden ist und stabile Testgrenzen erkennbar sind.

## Frühe Testarten

- manuelle Browser-Tests
- definierte Testfälle pro Funktion
- Prüfung auf Smartphonebreite
- Prüfung mit Tastatur
- Prüfung mit deaktiviertem oder leerem `localStorage`
- Prüfung ungültiger Konfigurationsdaten
- Prüfung ohne Netzwerk, soweit die App offline funktionieren soll

## Dokumentation der Ergebnisse

Für eine Funktion werden relevante Browser, Viewports, Eingaben und erwartete Zustände festgehalten. Fehler werden mit reproduzierbaren Schritten dokumentiert. Die [Quality Checklist](QUALITY_CHECKLIST.md) und die [Definition of Done](DEFINITION_OF_DONE.md) bilden den gemeinsamen Abschlussrahmen.

## Späterer Ausbau

Automatisierte Unit-, Integrations- und End-to-End-Tests werden erst eingeführt, wenn ihre Ziele aus vorhandener Programmlogik abgeleitet werden können. Die Wahl der Werkzeuge folgt dann den tatsächlichen Anforderungen und vermeidet eine unnötige Build-Pipeline.
