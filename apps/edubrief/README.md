# EduBrief – erste vollständige Themenwochensammlung

Dependency-freie, local-first nutzbare Browser-App mit HTML, CSS, ES-Modulen,
IndexedDB und Service Worker. Das aktive Grundlagenpaket umfasst 16
Themenwochen mit 80 EduCoffees und 240 fachunabhängigen möglichen Umsetzungen.

## Lokal starten

Vom Projektwurzelverzeichnis:

```sh
node apps/edubrief/preview-server.mjs
```

Danach: `http://127.0.0.1:4173/apps/edubrief/`

## Tests

```sh
node --test apps/edubrief/tests/*.test.mjs
```

## Ausschließlich lokale QA-Parameter

- `?qaDate=YYYY-MM-DD` setzt nur auf `localhost`/`127.0.0.1` das fachliche Testdatum.
- `?qaContentError=1` simuliert vor einer Materialisierung einen Contentfehler.
- `?qaStorageError=1` simuliert einen fehlgeschlagenen Speicherstart.

Die Parameter werden nicht persistiert und sind außerhalb lokaler Hosts wirkungslos.

## Inhalt

Das aktive, versionierte Grundlagenpaket liegt unter
`outputs/edubrief/content-packages/foundation-weeks/`. Es wird deterministisch
aus den 16 redaktionellen Masterdateien erzeugt. Das frühere veröffentlichte
Retrieval-Paket bleibt unverändert als historisches Artefakt erhalten.
