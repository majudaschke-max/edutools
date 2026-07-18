# EduTools Core

Der Core ist für gemeinsame, praktisch bewährte Grundlagen mehrerer EduTools-Apps vorgesehen. In diesem Sprint enthält er noch keine Implementierung.

Vorbereitete Bereiche:

- `storage/`: lokale Speicherung und spätere Migrationen
- `theme/`: Theme-Verhalten auf Basis gemeinsamer Tokens
- `components/`: bewährte, wiederverwendbare UI-Bausteine
- `navigation/`: gemeinsame Navigationsmuster
- `accessibility/`: produktübergreifende Accessibility-Hilfen
- `utils/`: kleine, fachlich neutrale Hilfsfunktionen

Neue Apps dürfen zunächst eigenständig entstehen. Funktionen werden erst in den Core verschoben, wenn die gemeinsame Nutzung praktisch belegt ist. Siehe [ADR-002](../docs/architecture/adr/ADR-002-shared-core.md).
