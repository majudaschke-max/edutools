import { createElement } from "../views/view-elements.js";
import { OCR_COLUMN_FIELDS } from "./ocr-column-mapping.js";
import { getOcrRowStatus, getVisibleOcrPreviewRows } from "./ocr-preview-state.js";

const STEPS = Object.freeze([
  ["pages", "1. Seiten hinzufügen"],
  ["review", "2. Prüfen"],
  ["summary", "3. Übernehmen"],
  ["success", "4. Fertig"],
]);

const FIELD_LABELS = Object.freeze({
  source: "Ausgangsbegriff",
  target: "Übersetzung",
  phonetic: "Lautschrift",
  hint: "Hinweis",
  example: "Beispielsatz",
  tags: "Tags",
  ignore: "Ignorieren",
});

const WARNING_LABELS = Object.freeze({
  "low-confidence": "Diese Stelle wurde nicht eindeutig erkannt.",
  "possible-wrap": "Möglicher Zeilenumbruch.",
  "possible-merge": "Möglicherweise gehören mehrere Zeilen zusammen.",
  "unusually-long": "Ungewöhnlich lange Zeile.",
  decorative: "Möglicherweise rein dekorativer Text.",
  "possible-heading": "Mögliche Seitenüberschrift; nicht zur Übernahme ausgewählt.",
  "ambiguous-target-comma": "Komma in der Übersetzung: Bitte prüfe, ob mehrere Bedeutungen gemeint sind.",
  "unsupported-characters": "Diese Stelle enthält keine eindeutig erkennbaren Zeichen.",
  "duplicate-unit": "Der Ausgangsbegriff ist in der Ziel-Lernpaket bereits vorhanden.",
  "duplicate-course": "Der Ausgangsbegriff ist in einer anderen Lernpaket bereits vorhanden.",
  "manual-copy": "Manuell duplizierte Zeile.",
  "manually-merged": "Manuell verbundene Zeilen.",
  "manually-split": "Manuell geteilte Zeile.",
  "missing-target": "Für diese Source-Zeile wurde noch keine Übersetzung erkannt.",
  "unclear-right-column": "Der Inhalt der rechten Spalte ist nicht eindeutig klassifiziert.",
  "grouped-info-block": "Ein mehrzeiliger Zusatz wurde dieser Vokabel zugeordnet.",
  "auto-reassigned": "Spalten automatisch neu zugeordnet; bitte kurz prüfen.",
  "uncertain-phonetic": "Lautschrift wurde nicht sicher erkannt.",
  "remaining-artifact": "Ausgangsbegriff oder Übersetzung bitte prüfen.",
});

function button(documentRoot, label, action, variant = "secondary", dataset = {}) {
  return createElement(documentRoot, "button", {
    className: `button button--${variant}`,
    text: label,
    attributes: { type: "button" },
    dataset: { ocrAction: action, ...dataset },
  });
}

function field(documentRoot, {
  id, label, value = "", type = "text", multiline = false,
  attributes = {}, dataset = {}, help = "",
}) {
  const wrapper = createElement(documentRoot, "div", { className: "form-field" });
  const helpId = `${id}-help`;
  wrapper.append(createElement(documentRoot, "label", { text: label, attributes: { for: id } }));
  const control = createElement(documentRoot, multiline ? "textarea" : "input", {
    attributes: {
      id,
      ...(multiline ? {} : { type }),
      ...(help ? { "aria-describedby": helpId } : {}),
      ...attributes,
    },
    dataset,
  });
  control.value = value;
  wrapper.append(control);
  if (help) {
    wrapper.append(createElement(documentRoot, "p", {
      className: "form-field__help", text: help, attributes: { id: helpId },
    }));
  }
  return wrapper;
}

function visibleStep(step) {
  if (["images", "preparing", "analyzing"].includes(step)) return "pages";
  if (step === "preview") return "review";
  return step;
}

function renderSteps(documentRoot, activeStep) {
  const list = createElement(documentRoot, "ol", {
    className: "ocr-steps",
    attributes: { "aria-label": "Schritte von Book Capture" },
  });
  const current = visibleStep(activeStep);
  const activeIndex = STEPS.findIndex(([key]) => key === current);
  STEPS.forEach(([key, label], index) => {
    const item = createElement(documentRoot, "li", { text: label });
    if (index === activeIndex) item.setAttribute("aria-current", "step");
    if (index < activeIndex) item.dataset.completed = "true";
    list.append(item);
  });
  return list;
}

export function createOcrImportDialog(documentRoot) {
  const dialog = createElement(documentRoot, "dialog", {
    className: "ocr-import-dialog",
    dataset: { ocrDialog: "" },
    attributes: {
      "aria-labelledby": "ocr-import-title",
      "aria-describedby": "ocr-import-privacy ocr-import-review-note",
    },
  });
  const shell = createElement(documentRoot, "div", { className: "ocr-import-dialog__shell" });
  const header = createElement(documentRoot, "header", { className: "ocr-import-dialog__header" });
  const heading = createElement(documentRoot, "div");
  heading.append(
    createElement(documentRoot, "p", { className: "eyebrow", text: "Lokaler Author-Workflow" }),
    createElement(documentRoot, "h2", { text: "Book Capture", attributes: { id: "ocr-import-title", tabindex: "-1" } }),
    createElement(documentRoot, "p", {
      className: "card__description",
      text: "Importiere ein Foto oder einen Screenshot deiner Vokabelliste.",
    }),
  );
  header.append(heading, button(documentRoot, "Book Capture schließen", "close", "text"));
  shell.append(
    header,
    createElement(documentRoot, "p", {
      className: "ocr-privacy-note",
      text: "Die Bilder werden ausschließlich lokal im Browser verarbeitet. Sie werden nicht an einen externen Dienst übertragen und nicht im Kurs gespeichert.",
      attributes: { id: "ocr-import-privacy" },
    }),
    createElement(documentRoot, "p", {
      className: "form-field__help",
      text: "Book Capture erstellt einen bearbeitbaren Entwurf. Schreibweise, Übersetzungen, Lautschrift und Beispiele müssen vor der Übernahme kontrolliert werden.",
      attributes: { id: "ocr-import-review-note" },
    }),
    createElement(documentRoot, "div", { dataset: { ocrSteps: "" } }),
    createElement(documentRoot, "p", {
      className: "session-error",
      attributes: { role: "alert", hidden: "", tabindex: "-1" },
      dataset: { ocrError: "" },
    }),
    createElement(documentRoot, "div", {
      className: "ocr-import-dialog__content", dataset: { ocrContent: "" },
    }),
  );
  dialog.append(shell);
  return dialog;
}

function renderTargetSelection(documentRoot, model) {
  const target = createElement(documentRoot, "section", {
    className: "book-capture-target",
    attributes: { "aria-labelledby": "book-capture-target-title" },
  });
  target.append(
    createElement(documentRoot, "h4", { text: "Ziel festlegen", attributes: { id: "book-capture-target-title" } }),
    createElement(documentRoot, "p", {
      className: "ocr-context-summary",
      text: `Kurs: ${model.course.title}`,
    }),
  );
  const unitField = createElement(documentRoot, "div", { className: "form-field" });
  unitField.append(createElement(documentRoot, "label", { text: "Ziel-Lernpaket", attributes: { for: "ocr-target-unit" } }));
  const select = createElement(documentRoot, "select", {
    attributes: { id: "ocr-target-unit" }, dataset: { ocrTargetUnit: "" },
  });
  select.append(createElement(documentRoot, "option", { text: "Neues Lernpaket anlegen", attributes: { value: "" } }));
  model.course.units.filter((unit) => !unit.archived).forEach((unit) => {
    const option = createElement(documentRoot, "option", { text: unit.title, attributes: { value: unit.id } });
    option.selected = model.targetUnitId === unit.id;
    select.append(option);
  });
  unitField.append(select);
  target.append(
    unitField,
    field(documentRoot, {
      id: "ocr-new-unit-title",
      label: "Titel der neuen Lernpaket",
      value: model.newUnitTitle,
      dataset: { ocrNewUnitTitle: "" },
      help: model.headingSuggestion
        ? `Unverbindlicher Vorschlag aus der Seite: ${model.headingSuggestion}`
        : "Nur ausfüllen, wenn ausdrücklich ein neues Lernpaket angelegt werden soll.",
    }),
  );
  const releasedLabel = createElement(documentRoot, "label", { className: "setting-toggle" });
  const released = createElement(documentRoot, "input", {
    attributes: { type: "checkbox" }, dataset: { ocrNewUnitReleased: "" },
  });
  released.checked = model.newUnitReleased;
  releasedLabel.append(released, createElement(documentRoot, "span", { text: "Neues Lernpaket sofort freigeben" }));
  target.append(releasedLabel);
  return target;
}

function pageControls(documentRoot, page, index, count) {
  const actions = createElement(documentRoot, "div", { className: "course-actions" });
  const up = button(documentRoot, "Nach oben", "page-up", "text", { pageId: page.id });
  const down = button(documentRoot, "Nach unten", "page-down", "text", { pageId: page.id });
  up.disabled = index === 0;
  down.disabled = index === count - 1;
  actions.append(
    up,
    down,
    button(documentRoot, "90° drehen", "rotate", "secondary", { pageId: page.id }),
    button(documentRoot, "Seite entfernen", "remove-page", "text", { pageId: page.id }),
  );
  return actions;
}

function renderPageCard(documentRoot, page, index, count, { compact = false, quickBoundaries = [34, 68], importMode = "quick" } = {}) {
  const item = createElement(documentRoot, compact ? "article" : "li", { className: "ocr-page-card" });
  const preview = createElement(documentRoot, "div", { className: "ocr-column-preview", dataset: { ocrColumnPreview: "" } });
  preview.style.setProperty("--quick-source-boundary", `${quickBoundaries[0]}%`);
  preview.style.setProperty("--quick-ignore-boundary", `${quickBoundaries[1]}%`);
  preview.append(
    createElement(documentRoot, "img", {
      className: `ocr-page-card__image ocr-page-card__image--rotation-${page.rotation}`,
      attributes: { src: page.previewUrl, alt: `Buchseite ${index + 1}: ${page.name}` },
    }),
  );
  if (importMode === "quick") {
    const overlay = createElement(documentRoot, "div", { className: "ocr-column-preview__overlay", attributes: { "aria-hidden": "true" } });
    const ignored = createElement(documentRoot, "span", { className: "ocr-column-preview__ignored" });
    ignored.append(createElement(documentRoot, "span", { className: "ocr-column-preview__ignored-label", text: "wird ignoriert" }));
    overlay.append(
      createElement(documentRoot, "span", { className: "ocr-column-preview__source", text: "Ausgangsbegriffe" }),
      createElement(documentRoot, "span", { className: "ocr-column-preview__target", text: "Übersetzungen" }),
      ignored,
      createElement(documentRoot, "i", { className: "ocr-column-preview__line ocr-column-preview__line--source" }),
      createElement(documentRoot, "i", { className: "ocr-column-preview__line ocr-column-preview__line--ignored" }),
    );
    preview.append(overlay);
  }
  item.append(
    preview,
    createElement(documentRoot, "div", { className: "ocr-page-card__body" }),
  );
  const body = item.lastElementChild;
  body.append(
    createElement(documentRoot, "strong", { text: `Seite ${index + 1} von ${count}` }),
    createElement(documentRoot, "span", { text: page.name }),
  );
  if (compact) {
    body.append(
      button(documentRoot, "Seite neu analysieren", "reanalyze-page", "text", { pageId: page.id }),
    );
  } else {
    if (importMode === "quick") {
      const columns = createElement(documentRoot, "details", { className: "ocr-quick-columns", attributes: { open: "" } });
      columns.append(
        createElement(documentRoot, "summary", { text: "Spalten anpassen" }),
        createElement(documentRoot, "p", { className: "form-field__help", text: "Lege fest, wo Ausgangsbegriffe enden und der ignorierte rechte Bereich beginnt." }),
      );
      const ranges = createElement(documentRoot, "fieldset", { className: "ocr-quick-columns__ranges" });
      ranges.append(createElement(documentRoot, "legend", { text: "Vertikale Spaltengrenzen" }));
      ranges.append(
        field(documentRoot, {
          id: `ocr-quick-source-${page.id}`, label: "Grenze nach den Ausgangsbegriffen", value: quickBoundaries[0], type: "range",
          attributes: { min: "15", max: "70", step: "1" }, dataset: { ocrQuickBoundary: "0", pageId: page.id },
        }),
        field(documentRoot, {
          id: `ocr-quick-target-${page.id}`, label: "Grenze vor dem ignorierten Bereich", value: quickBoundaries[1], type: "range",
          attributes: { min: "30", max: "92", step: "1" }, dataset: { ocrQuickBoundary: "1", pageId: page.id },
        }),
      );
      const columnActions = createElement(documentRoot, "div", { className: "course-actions" });
      columnActions.append(
        button(documentRoot, "Übernehmen", "confirm-quick-columns", "secondary", { pageId: page.id }),
        button(documentRoot, "Zurücksetzen", "reset-quick-columns", "text", { pageId: page.id }),
        button(documentRoot, "Auf alle Seiten anwenden", "apply-quick-columns-all", "text", { pageId: page.id }),
      );
      columns.append(ranges, columnActions);
      body.append(columns);
    }
    const crop = createElement(documentRoot, "fieldset", { className: "ocr-crop-fields" });
    crop.append(createElement(documentRoot, "legend", { text: "Bildausschnitt in Prozent" }));
    for (const [key, label] of [["top", "Oben"], ["right", "Rechts"], ["bottom", "Unten"], ["left", "Links"]]) {
      crop.append(field(documentRoot, {
        id: `ocr-crop-${key}-${page.id}`,
        label,
        value: page.crop[key],
        type: "number",
        attributes: { min: "0", max: "90", step: "1" },
        dataset: { ocrCrop: key, pageId: page.id },
      }));
    }
    body.append(crop, pageControls(documentRoot, page, index, count));
  }
  return item;
}

function renderImageStep(documentRoot, model) {
  const section = createElement(documentRoot, "section", { className: "ocr-step", attributes: { "aria-labelledby": "ocr-images-title" } });
  const importSummary = createElement(documentRoot, "div", { className: "book-capture-summary" });
  importSummary.append(
    createElement(documentRoot, "strong", { text: "Schnellimport: Ausgangsbegriffe und Übersetzungen" }),
    createElement(documentRoot, "span", { text: "Beispiele und Hinweise in der rechten Spalte werden nicht übernommen." }),
  );
  section.append(
    createElement(documentRoot, "h3", { text: "Buchseiten hinzufügen", attributes: { id: "ocr-images-title", tabindex: "-1" } }),
    importSummary,
    renderTargetSelection(documentRoot, model),
  );
  const drop = createElement(documentRoot, "div", {
    className: "ocr-dropzone",
    dataset: { ocrDropzone: "" },
    attributes: { role: "group", "aria-describedby": "ocr-image-help", tabindex: "0" },
  });
  const label = createElement(documentRoot, "label", {
    className: "button button--primary", text: "Buchseiten auswählen", attributes: { for: "ocr-image-files" },
  });
  const input = createElement(documentRoot, "input", {
    attributes: {
      id: "ocr-image-files", type: "file", multiple: "", capture: "environment",
      accept: "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif",
    },
    dataset: { ocrFiles: "" },
  });
  drop.append(
    label,
    input,
    createElement(documentRoot, "p", { className: "card__description", text: "Unterstützt: iPhone-Fotos, JPEG, PNG und WebP" }),
    createElement(documentRoot, "p", {
      className: "form-field__help",
      text: "HEIC-/HEIF-Fotos werden ausschließlich lokal im Browser vorbereitet.",
      attributes: { id: "ocr-image-help" },
    }),
  );
  section.append(drop);
  const pages = createElement(documentRoot, "ol", { className: "ocr-page-list" });
  model.pages.forEach((page, index) => pages.append(renderPageCard(documentRoot, page, index, model.pages.length, {
    quickBoundaries: model.quickBoundaries?.[page.id], importMode: model.importMode,
  })));
  if (model.pages.length === 0) pages.append(createElement(documentRoot, "li", { className: "empty-state", text: "Noch keine Buchseite ausgewählt." }));
  section.append(pages);
  const actions = createElement(documentRoot, "div", { className: "ocr-step-actions" });
  if (model.columnStatus) section.append(createElement(documentRoot, "p", { className: "form-field__help", text: model.columnStatus, attributes: { role: "status" } }));
  const analyze = button(documentRoot, "Schnellimport starten", "start-analysis", "primary");
  analyze.disabled = model.pages.length === 0;
  actions.append(analyze);
  section.append(actions);
  return section;
}

function renderPreparingStep(documentRoot, model) {
  const section = createElement(documentRoot, "section", {
    className: "ocr-step",
    attributes: { "aria-labelledby": "ocr-preparing-title" },
  });
  section.append(
    createElement(documentRoot, "h3", {
      text: "iPhone-Foto wird vorbereitet",
      attributes: { id: "ocr-preparing-title", tabindex: "-1" },
    }),
    createElement(documentRoot, "p", {
      className: "card__description",
      text: "Die Umwandlung läuft ausschließlich lokal. Das Original wird weder hochgeladen noch im Kurs gespeichert.",
    }),
  );
  const status = createElement(documentRoot, "div", {
    className: "ocr-progress",
    attributes: { role: "status", "aria-live": "polite", "aria-atomic": "true" },
    dataset: { ocrImageProgressStatus: "" },
  });
  status.append(
    createElement(documentRoot, "p", { text: model.imageProgress?.status ?? "iPhone-Foto wird vorbereitet." }),
    createElement(documentRoot, "progress", {
      attributes: { max: String(model.imageProgress?.total ?? 1) },
      dataset: { ocrImageProgress: "" },
    }),
  );
  const progress = status.querySelector("progress");
  if (Number.isInteger(model.imageProgress?.current)) progress.value = model.imageProgress.current;
  else progress.removeAttribute("value");
  section.append(status, button(documentRoot, "Vorbereitung abbrechen", "cancel-image-preparation", "secondary"));
  return section;
}

function renderAnalyzingStep(documentRoot, model) {
  const section = createElement(documentRoot, "section", { className: "ocr-step", attributes: { "aria-labelledby": "ocr-analysis-title" } });
  section.append(
    createElement(documentRoot, "h3", { text: "Buchseiten werden analysiert", attributes: { id: "ocr-analysis-title", tabindex: "-1" } }),
    createElement(documentRoot, "p", { className: "card__description", text: "Die Analyse läuft vollständig lokal. Anschließend kannst du jede erkannte Vokabel bearbeiten." }),
  );
  const status = createElement(documentRoot, "div", {
    className: "ocr-progress",
    attributes: { role: "status", "aria-live": "polite", "aria-atomic": "true" },
    dataset: { ocrProgressStatus: "" },
  });
  status.append(
    createElement(documentRoot, "p", { text: model.progress?.status ?? "Analyse wird vorbereitet." }),
    createElement(documentRoot, "progress", { attributes: { max: "1" }, dataset: { ocrProgress: "" } }),
  );
  const progress = status.querySelector("progress");
  if (Number.isFinite(model.progress?.progress)) progress.value = model.progress.progress;
  else progress.removeAttribute("value");
  section.append(status, button(documentRoot, "Analyse abbrechen", "cancel-ocr", "secondary"));
  return section;
}

function renderMappingDetails(documentRoot, model) {
  const details = createElement(documentRoot, "details", { className: "book-capture-columns" });
  details.append(createElement(documentRoot, "summary", { text: model.importMode === "quick" ? "Erkennungsübersicht" : "Erkannte Spalten prüfen" }));
  if (model.importMode === "quick") {
    details.append(createElement(documentRoot, "p", {
      className: "form-field__help",
      text: "Analysiert wurden ausschließlich Ausgangsbegriffe und Übersetzungen. Der rechte Seitenbereich wurde vor der Strukturierung ausgeschlossen.",
    }));
    model.structuredPages.forEach((page, pageIndex) => {
      const diagnostics = page.diagnostics ?? {};
      details.append(createElement(documentRoot, "p", {
        className: "ocr-diagnostics",
        text: `Seite ${pageIndex + 1}: ${diagnostics.vocabularyEntries ?? 0} Vokabeln · ${diagnostics.headings ?? 0} Überschriften entfernt · ${diagnostics.unassignedBlocks ?? 0} nicht zugeordnet`,
      }));
    });
    return details;
  }
  model.structuredPages.forEach((page, pageIndex) => {
    const group = createElement(documentRoot, "fieldset", { className: "ocr-mapping-page" });
    group.append(createElement(documentRoot, "legend", { text: `Seite ${pageIndex + 1}` }));
    const diagnostics = page.diagnostics ?? {};
    group.append(createElement(documentRoot, "p", {
      className: "ocr-diagnostics",
      text: `${diagnostics.sourceCells ?? 0} Source-Zellen · ${diagnostics.vocabularyEntries ?? 0} Vokabeln · ${diagnostics.headings ?? 0} Überschriften · ${diagnostics.unassignedBlocks ?? 0} nicht zugeordnet`,
    }));
    const boundaries = createElement(documentRoot, "div", { className: "ocr-boundary-fields" });
    [0, 1].forEach((boundaryIndex) => boundaries.append(field(documentRoot, {
      id: `ocr-boundary-${page.pageId}-${boundaryIndex}`,
      label: `Spaltengrenze ${boundaryIndex + 1} in %`,
      value: model.boundaryDrafts?.[page.pageId]?.[boundaryIndex] ?? "",
      type: "number",
      attributes: { min: "5", max: "95", step: "0.5", inputmode: "decimal" },
      dataset: { ocrBoundary: boundaryIndex, pageId: page.pageId },
    })));
    group.append(boundaries);
    model.mappings[page.pageId].forEach((mapped, columnIndex) => {
      const wrapper = createElement(documentRoot, "div", { className: "form-field" });
      const id = `ocr-map-${page.pageId}-${columnIndex}`;
      wrapper.append(createElement(documentRoot, "label", { text: `Spalte ${columnIndex + 1}`, attributes: { for: id } }));
      const select = createElement(documentRoot, "select", { attributes: { id }, dataset: { ocrMapping: columnIndex, pageId: page.pageId } });
      OCR_COLUMN_FIELDS.forEach((fieldName) => {
        const option = createElement(documentRoot, "option", { text: FIELD_LABELS[fieldName], attributes: { value: fieldName } });
        option.selected = mapped === fieldName;
        select.append(option);
      });
      wrapper.append(select);
      group.append(wrapper);
    });
    const actions = createElement(documentRoot, "div", { className: "course-actions" });
    actions.append(
      button(documentRoot, "Seite erneut strukturieren", "restructure-page", "secondary", { pageId: page.pageId }),
      button(documentRoot, "Erkannte Grenzen zurücksetzen", "reset-structure", "text", { pageId: page.pageId }),
    );
    group.append(actions);
    details.append(group);
  });
  details.append(button(documentRoot, "Spaltenzuordnung übernehmen", "refresh-preview", "secondary"));
  return details;
}

function renderPreviewRow(documentRoot, row, index, total, model) {
  const status = getOcrRowStatus(row);
  const article = createElement(documentRoot, "article", {
    className: "ocr-preview-row",
    attributes: { "aria-labelledby": `ocr-row-title-${row.id}` },
    dataset: { ocrRow: row.id },
  });
  const heading = createElement(documentRoot, "div", { className: "ocr-preview-row__heading" });
  heading.append(
    createElement(documentRoot, "h4", { text: `Vokabel ${index + 1} · Seite ${row.pageNumber}`, attributes: { id: `ocr-row-title-${row.id}` } }),
    createElement(documentRoot, "span", { className: `course-status course-status--${status === "Bereit" ? "ready" : status === "Fehler" ? "error" : "warning"}`, text: status }),
  );
  article.append(heading);
  const includeLabel = createElement(documentRoot, "label", { className: "setting-toggle" });
  const include = createElement(documentRoot, "input", { attributes: { type: "checkbox" }, dataset: { ocrRowField: "included", rowId: row.id } });
  include.checked = row.included;
  includeLabel.append(include, createElement(documentRoot, "span", { text: "Diese Vokabel übernehmen" }));
  article.append(includeLabel);
  const grid = createElement(documentRoot, "div", { className: "ocr-preview-row__fields ocr-preview-row__fields--primary" });
  grid.append(
    field(documentRoot, { id: `ocr-source-${row.id}`, label: "Ausgangsbegriff", value: row.source, dataset: { ocrRowField: "source", rowId: row.id } }),
    field(documentRoot, { id: `ocr-targets-${row.id}`, label: "Übersetzungen (eine pro Zeile)", value: row.targets.join("\n"), multiline: true, dataset: { ocrRowField: "targets", rowId: row.id } }),
    field(documentRoot, { id: `ocr-phonetic-${row.id}`, label: "Lautschrift", value: row.phonetic, dataset: { ocrRowField: "phonetic", rowId: row.id } }),
  );
  article.append(grid);
  const secondary = createElement(documentRoot, "details", { className: "ocr-preview-row__secondary" });
  secondary.append(createElement(documentRoot, "summary", { text: "Weitere Felder" }));
  const secondaryGrid = createElement(documentRoot, "div", { className: "ocr-preview-row__fields" });
  secondaryGrid.append(
    field(documentRoot, { id: `ocr-hint-${row.id}`, label: "Hinweis", value: row.hint, multiline: true, dataset: { ocrRowField: "hint", rowId: row.id } }),
    field(documentRoot, { id: `ocr-example-${row.id}`, label: "Beispielsatz", value: row.example, multiline: true, dataset: { ocrRowField: "example", rowId: row.id } }),
    field(documentRoot, { id: `ocr-tags-${row.id}`, label: "Tags (mit | trennen)", value: row.tags.join("|"), dataset: { ocrRowField: "tags", rowId: row.id } }),
  );
  secondary.append(secondaryGrid);
  article.append(secondary);
  if (row.reassignment || row.reassignmentBackup) {
    const suggestion = createElement(documentRoot, "div", { className: "ocr-reassignment" });
    suggestion.append(createElement(documentRoot, "p", { text: row.reassignment?.reason ?? "Die automatische Neuzuordnung wurde angewendet." }));
    suggestion.append(row.reassignment
      ? button(documentRoot, "Vorschlag übernehmen", "auto-reassign-row", "secondary", { rowId: row.id })
      : button(documentRoot, "Neuzuordnung rückgängig", "undo-reassign-row", "text", { rowId: row.id }));
    article.append(suggestion);
  }
  const reviewMessages = [...row.errors, ...row.warnings.map((warning) => WARNING_LABELS[warning] ?? warning)];
  if (reviewMessages.length > 0) {
    const issues = createElement(documentRoot, "div", { className: "ocr-review-issues", attributes: { role: "status" } });
    const list = createElement(documentRoot, "ul");
    reviewMessages.forEach((message) => list.append(createElement(documentRoot, "li", { text: message })));
    issues.append(list); article.append(issues);
  }
  if (row.duplicate) {
    const duplicate = createElement(documentRoot, "div", { className: "ocr-duplicate" });
    duplicate.append(createElement(documentRoot, "p", {
      text: row.duplicate.scope === "unit"
        ? "Diese Vokabel ist in der Ziel-Lernpaket bereits vorhanden. Wähle bewusst, wie sie behandelt wird."
        : `Diese Vokabel ist bereits in „${row.duplicate.unitTitle}“ vorhanden. Andere Lernpakete werden nicht still verändert.`,
    }));
    const label = createElement(documentRoot, "label", { text: "Duplikat behandeln", attributes: { for: `ocr-duplicate-${row.id}` } });
    const select = createElement(documentRoot, "select", { attributes: { id: `ocr-duplicate-${row.id}` }, dataset: { ocrRowField: "duplicateStrategy", rowId: row.id } });
    const strategies = row.duplicate.scope === "unit"
      ? [["skip", "Überspringen"], ["merge", "Übersetzungen ergänzen"], ["replace", "Vorhandene Vokabel ersetzen"], ["add", "Als neue Vokabel hinzufügen"]]
      : [["skip", "Überspringen"], ["add", "In der Ziel-Lernpaket neu hinzufügen"]];
    strategies.forEach(([value, text]) => {
      const option = createElement(documentRoot, "option", { text, attributes: { value } });
      option.selected = row.duplicateStrategy === value;
      select.append(option);
    });
    duplicate.append(label, select);
    article.append(duplicate);
  }
  const actions = createElement(documentRoot, "div", { className: "course-actions" });
  actions.append(button(documentRoot, "Bildausschnitt prüfen", "show-crop", "secondary", { rowId: row.id }));
  article.append(actions);
  return article;
}

function previewCounts(state) {
  const active = state.rows.filter((row) => !row.deleted);
  return {
    rows: active.length,
    errors: active.filter((row) => row.errors.length > 0).length,
    issues: active.filter((row) => row.errors.length || row.warnings.length || row.duplicate).length,
    duplicates: active.filter((row) => row.duplicate).length,
    included: active.filter((row) => row.included && row.errors.length === 0).length,
    excluded: active.filter((row) => !row.included).length,
  };
}

function renderPreviewStep(documentRoot, model) {
  const counts = previewCounts(model.previewState);
  const section = createElement(documentRoot, "section", { className: "ocr-step", attributes: { "aria-labelledby": "ocr-preview-title" } });
  section.append(
    createElement(documentRoot, "h3", { text: "Erkannte Vokabeln prüfen", attributes: { id: "ocr-preview-title", tabindex: "-1" } }),
    createElement(documentRoot, "p", { className: "book-capture-summary", text: `${counts.rows} Vokabeln erkannt · ${counts.issues} Stellen zu prüfen · ${counts.duplicates} Duplikate` }),
    renderMappingDetails(documentRoot, model),
  );
  const toolbar = createElement(documentRoot, "div", { className: "ocr-preview-toolbar" });
  const filterLabel = createElement(documentRoot, "label", { text: "Ansicht", attributes: { for: "ocr-preview-filter" } });
  const filter = createElement(documentRoot, "select", { attributes: { id: "ocr-preview-filter" }, dataset: { ocrFilter: "" } });
  [["all", "Alle Vokabeln"], ["problems", "Nur zu prüfende Stellen"]].forEach(([value, text]) => {
    const option = createElement(documentRoot, "option", { text, attributes: { value } });
    option.selected = model.previewState.filter === value;
    filter.append(option);
  });
  toolbar.append(
    filterLabel,
    filter,
    button(documentRoot, "Entwurf zurücksetzen", "reset-preview", "text"),
  );
  section.append(toolbar);

  const review = createElement(documentRoot, "div", { className: "book-capture-review" });
  const pages = createElement(documentRoot, "details", {
    className: "book-capture-review__pages",
    attributes: { open: "" },
  });
  pages.append(createElement(documentRoot, "summary", { text: "Originalseiten" }));
  model.pages.forEach((page, index) => pages.append(renderPageCard(documentRoot, page, index, model.pages.length, {
    compact: true, quickBoundaries: model.quickBoundaries?.[page.id], importMode: model.importMode,
  })));
  const rows = getVisibleOcrPreviewRows(model.previewState);
  const list = createElement(documentRoot, "div", { className: "ocr-preview-list", attributes: { role: "list" } });
  const problemRows = rows.filter((row) => row.errors.length || row.warnings.length || row.duplicate);
  const readyRows = rows.filter((row) => !problemRows.includes(row));
  [["Zu prüfen", problemRows], ["Erkannte Vokabeln", readyRows]].forEach(([title, groupRows]) => {
    if (groupRows.length === 0) return;
    const group = createElement(documentRoot, "section", { className: "ocr-review-group", attributes: { "aria-label": title } });
    group.append(createElement(documentRoot, "h4", { text: `${title} (${groupRows.length})` }));
    groupRows.forEach((row, index) => {
      const wrapper = createElement(documentRoot, "div", { attributes: { role: "listitem" } });
      wrapper.append(renderPreviewRow(documentRoot, row, index, groupRows.length, model)); group.append(wrapper);
    });
    list.append(group);
  });
  if (rows.length === 0) list.append(createElement(documentRoot, "p", { className: "empty-state", text: "Für diese Ansicht sind keine Stellen vorhanden." }));
  if (model.previewState.sections.length > 0) {
    const sections = createElement(documentRoot, "details", { className: "ocr-metadata-group" });
    sections.append(createElement(documentRoot, "summary", { text: `Erkannte Abschnitte (${model.previewState.sections.length})` }));
    const values = createElement(documentRoot, "ul");
    model.previewState.sections.forEach((entry) => values.append(createElement(documentRoot, "li", { text: entry.text })));
    sections.append(values); list.append(sections);
  }
  if (model.previewState.unassigned.length > 0) {
    const unassigned = createElement(documentRoot, "details", { className: "ocr-metadata-group" });
    unassigned.append(createElement(documentRoot, "summary", { text: `Nicht zugeordnet (${model.previewState.unassigned.length})` }));
    const values = createElement(documentRoot, "ul");
    model.previewState.unassigned.forEach((entry) => values.append(createElement(documentRoot, "li", { text: entry.text })));
    unassigned.append(values); list.append(unassigned);
  }
  review.append(pages, list);
  section.append(review);

  const crop = createElement(documentRoot, "figure", { className: "ocr-row-crop", attributes: { hidden: "" }, dataset: { ocrRowCrop: "" } });
  crop.append(
    createElement(documentRoot, "img", { attributes: { alt: "" }, dataset: { ocrRowCropImage: "" } }),
    createElement(documentRoot, "figcaption", { dataset: { ocrRowCropCaption: "" } }),
    button(documentRoot, "Bildausschnitt schließen", "hide-crop", "text"),
  );
  section.append(crop);
  const actions = createElement(documentRoot, "div", { className: "ocr-step-actions" });
  const next = button(documentRoot, "Importübersicht prüfen", "to-summary", "primary");
  next.disabled = counts.included === 0 || counts.errors > 0;
  if (counts.errors > 0) {
    next.title = "Korrigiere oder entferne zuerst alle Stellen mit Fehlern.";
  }
  actions.append(button(documentRoot, "Weitere Seiten hinzufügen", "to-images", "secondary"), next);
  section.append(actions);
  return section;
}

function targetTitle(model) {
  return model.course.units.find((unit) => unit.id === model.targetUnitId)?.title
    ?? (model.newUnitTitle.trim() || "Neues Lernpaket");
}

function renderSummaryStep(documentRoot, model) {
  const counts = previewCounts(model.previewState);
  const section = createElement(documentRoot, "section", { className: "ocr-step book-capture-import-summary", attributes: { "aria-labelledby": "ocr-summary-title" } });
  section.append(
    createElement(documentRoot, "h3", { text: "Importübersicht", attributes: { id: "ocr-summary-title", tabindex: "-1" } }),
    createElement(documentRoot, "p", { className: "card__description", text: "Prüfe Ziel und Umfang. Erst danach wird der Kurs in einem Schritt gespeichert." }),
  );
  const list = createElement(documentRoot, "dl", { className: "summary-list" });
  for (const [label, value] of [
    ["Kurs", model.course.title],
    ["Ziel-Lernpaket", targetTitle(model)],
    ["Buchseiten", model.pages.length],
    ["Vokabeln übernehmen", counts.included],
    ["Deaktiviert", counts.excluded],
    ["Noch fehlerhaft", counts.errors],
    ["Duplikate mit Entscheidung", counts.duplicates],
  ]) {
    const row = createElement(documentRoot, "div", { className: "summary-list__row" });
    row.append(createElement(documentRoot, "dt", { text: label }), createElement(documentRoot, "dd", { text: String(value) }));
    list.append(row);
  }
  section.append(list);
  const actions = createElement(documentRoot, "div", { className: "ocr-step-actions" });
  actions.append(button(documentRoot, "Zurück zum Prüfen", "to-preview", "secondary"), button(documentRoot, "Vokabeln übernehmen", "commit", "primary"));
  section.append(actions);
  return section;
}

function renderSuccessStep(documentRoot, model) {
  const unit = model.result.course.units.find((item) => item.id === model.result.targetUnitId);
  const section = createElement(documentRoot, "section", { className: "ocr-step ocr-success", attributes: { "aria-labelledby": "ocr-success-title" } });
  section.append(
    createElement(documentRoot, "h3", { text: "Book Capture abgeschlossen", attributes: { id: "ocr-success-title", tabindex: "-1" } }),
    createElement(documentRoot, "p", { text: `${model.result.imported} Vokabeln wurden übernommen.` }),
    createElement(documentRoot, "p", { className: "card__description", text: `${model.result.skipped} Einträge wurden nach deiner Duplikatentscheidung übersprungen. Ziel: ${unit?.title ?? "Lernpaket"}.` }),
  );
  const actions = createElement(documentRoot, "div", { className: "ocr-step-actions" });
  const learn = button(documentRoot, "Jetzt lernen", "learn", "primary");
  learn.disabled = unit?.released !== true;
  if (learn.disabled) learn.title = "Gib die neues Lernpaket zuerst frei, um sie direkt zu lernen.";
  actions.append(
    learn,
    button(documentRoot, "Weitere Buchseite importieren", "restart", "secondary"),
    button(documentRoot, "Kursdatei herunterladen", "export-course", "secondary"),
    button(documentRoot, "Zum Course Builder", "finish", "text"),
  );
  section.append(
    actions,
    createElement(documentRoot, "p", {
      className: "form-field__help",
      text: "Lädt den vollständigen Kurs als JSON-Datei herunter.",
    }),
    (() => {
      const status = createElement(documentRoot, "p", {
      className: "course-export-status",
      text: model.exportStatus ?? "",
      attributes: { role: "status" },
      dataset: { ocrExportStatus: "" },
      });
      status.hidden = !model.exportStatus;
      return status;
    })(),
  );
  return section;
}

export function renderOcrImportView(dialog, model) {
  const documentRoot = dialog.ownerDocument;
  dialog.querySelector("[data-ocr-steps]").replaceChildren(renderSteps(documentRoot, model.step));
  const views = {
    images: renderImageStep,
    preparing: renderPreparingStep,
    analyzing: renderAnalyzingStep,
    preview: renderPreviewStep,
    summary: renderSummaryStep,
    success: renderSuccessStep,
  };
  dialog.querySelector("[data-ocr-content]").replaceChildren(views[model.step](documentRoot, model));
}
