# ADR-008: Atomare GitHub-Pages-Release-Sätze

## Status

Accepted

## Context

ADR-007 definiert getrennte Author- und Learner-Builds. Für eine kontrollierte
Produktionsfreigabe müssen mehrere ausdrücklich gewählte Profile jedoch als
ein einziges GitHub-Pages-Artefakt zusammengeführt werden. Ein partieller
Build, eine automatische Ordneraufnahme oder ein Upload ungeprüfter Dateien
würde die dort eingeführten Auslieferungsgrenzen umgehen.

## Decision

- Ein versionierter Deployment-Satz listet jedes Produktionsprofil und seinen
  eindeutigen Mount-Pfad explizit. Es gibt genau ein Root-Profil.
- Die Assembly verwendet ausschließlich den vorhandenen Profilbuilder. Sie
  baut in einem temporären Releasebereich, validiert Profil- und
  Release-Manifeste, führt HTTP-Smoke-Tests aus und ersetzt `dist/pages` erst
  danach atomar.
- Das Root-Learner-Profil und der Author-Mount behalten unterschiedliche,
  stabile `deploymentId`-Werte. Die Release-Version ändert niemals den
  Storage-Namespace.
- Profil- und Release-Manifeste enthalten sortierte Dateigrößen und SHA-256.
  Ein deterministischer Build-Hash wird über Manifestdaten erzeugt und in
  Runtime-Profil und Buildinformation veröffentlicht.
- Eine restriktive Meta-CSP und eine Referrer-Policy schützen die statischen
  Einstiegspunkte. Es gibt weder externe Scripts noch Fonts, Tracking,
  Service Worker oder Offline-Cache.
- GitHub Actions prüft Tests, Syntax, JSON, Profile, den JSON-Roundtrip,
  Assembly, Manifeste und HTTP-Endpunkte. Nur `dist/pages` wird hochgeladen;
  Pull Requests deployen nicht.

## Consequences

### Positive Folgen

- Ein fehlerhafter Build lässt den letzten gültigen Pages-Stand unangetastet.
- Beispielprofile, Fixtures, lokale Exporte und Tests gelangen nicht in das
  öffentliche Artefakt.
- Root, Author-Mount, 404, Runtimeprofile und Kursdatei sind lokal genauso
  prüfbar wie später auf GitHub Pages.
- Rollbacks erfolgen durch erneutes Deployment eines bekannten Commits; bei
  stabilen IDs bleiben lokale Lernstände erhalten.

### Negative Folgen und Risiken

- GitHub Pages liefert keine frei konfigurierbaren Security-Header. Die CSP
  wird deshalb als Meta-Tag gesetzt und ersetzt keine serverseitige
  Härtung.
- Ohne Bundler wird nur der HTML-Einstieg, das Runtimeprofil und die Kursdatei
  mit dem Build-Hash differenziert. ES-Modulimporte werden bewusst nicht
  fragil umgeschrieben.
- Öffentliche Learner-Kursdaten sind technisch lesbar und dürfen keine
  geheimen oder personenbezogenen Inhalte enthalten.

## Alternatives considered

- Ein gemeinsamer Universalbuild wurde wegen der fehlenden Dateigrenze
  verworfen.
- Automatisches Publizieren aller Profile eines Ordners wurde wegen
  unbeabsichtigter Beispiel- und Fixture-Veröffentlichungen verworfen.
- Service Worker und externer Bundler wurden als unnötige neue Komplexität
  verworfen.

## Date

2026-07-14
