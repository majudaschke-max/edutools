# EduBrief Sprint-1.0.1-Preview

Dependency-freier Browser-Slice mit HTML, CSS, ES-Modulen, IndexedDB und Service Worker.

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

## Isolierter Distribution-V2-Preview

`http://127.0.0.1:4173/apps/edubrief-qa/qa-preview-v2.html` validiert ausschließlich lokal das Staging-Paket `1.1.0-rc.1` über den expliziten Preview-Loader. Der QA-Ordner liegt bewusst außerhalb des Service-Worker-Scopes der App. Normaler App-Start, Service Worker und aktiver Paketpfad bleiben auf dem veröffentlichten v1-Paket `1.0.0`. Die QA-Seite installiert oder aktiviert keine Contentdaten.
