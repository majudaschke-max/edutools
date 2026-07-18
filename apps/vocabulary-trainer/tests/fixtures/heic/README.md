# Neutrale HEIC-Testfixtures

Diese Dateien enthalten keine Lehrwerksseiten, Verlagstitel oder produktiven
Kursinhalte. Sie sind ausschließlich Testdaten und werden in keinen Author-,
Learner- oder SCORM-Build kopiert.

- `landscape-camera.heic`: reales HEIC-Kamerabild im Querformat (4000 × 3000).
- `portrait-oriented-camera.heic`: reales Kamerabild mit quer gespeichertem
  Raster und eingebetteter HEIF-Ausrichtung für die Hochformatdarstellung.
- `corrupt-truncated.heic`: bewusst auf 128 Byte gekürzte Kopie des
  Querformat-Headers für den verständlichen Fehlerpfad.

Die beiden intakten Originale stammen aus der frei nutzbaren Testsammlung von
[HEIC Digital](https://heic.digital/samples/). Die Sammlung erlaubt die
Verwendung ausdrücklich ohne Einschränkung für Tests und Entwicklung, auch in
kommerzieller Software. Abruf für diesen Testbestand: 15. Juli 2026.

Die Originaldateien enthalten bewusst typische Kamerametadaten. Der
Produktionspfad übernimmt davon nichts: Die lokal erzeugte JPEG-Arbeitskopie
enthält nur die gerenderten Bildpixel.
