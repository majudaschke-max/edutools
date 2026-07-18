# Accessibility

Barrierearme Nutzung ist eine Grundanforderung und wird nicht erst nachträglich ergänzt. Jede Funktion wird anhand der [Definition of Done](../quality/DEFINITION_OF_DONE.md) geprüft.

## Anforderungen

- Semantisches HTML bildet Struktur und Bedeutung ab.
- Alle Funktionen sind vollständig per Tastatur bedienbar.
- Interaktive Elemente haben deutlich sichtbare Fokuszustände.
- Touch-Ziele sind mindestens ungefähr 44 × 44 Pixel groß.
- Text und wesentliche UI-Elemente haben ausreichende Kontraste.
- `prefers-reduced-motion` wird unterstützt; nicht notwendige Bewegung entfällt.
- Bedeutung wird nie ausschließlich durch Farbe kommuniziert.
- Eingaben und Bedienelemente haben verständliche Labels.
- ARIA-Attribute werden nur verwendet, wenn semantisches HTML nicht ausreicht.
- Die Darstellung bleibt ab ungefähr 320 Pixel Breite nutzbar und lesbar.
- Eine Vergrößerungssperre im Viewport wird nicht erzwungen.
- Schriftgrößen und Zeilenabstände bleiben gut lesbar.
- Fehlermeldungen stehen direkt am betroffenen Eingabefeld und sind technisch mit ihm verknüpft.

## Prüfung

Accessibility wird mindestens mit Tastatur, sichtbarem Fokus, vergrößerter Darstellung, reduzierter Bewegung und kleinen Viewports manuell geprüft. Farbe wird zusätzlich auf Kontrast und redundante Bedeutungssignale kontrolliert.
