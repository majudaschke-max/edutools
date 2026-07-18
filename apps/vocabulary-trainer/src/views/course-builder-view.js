import { IMPORT_FIELDS } from "../import/import-mapper.js";
import {
  MULTIPLE_TARGET_SEPARATOR,
} from "../import/import-template.js";
import {
  describeLanguageSettings,
  getLanguageDefinitions,
} from "../languages/language-registry.js";
import { createElement } from "./view-elements.js";

const FIELD_LABELS = Object.freeze({ source: "Ausgangsbegriff", target: "Übersetzung", phonetic: "Lautschrift", hint: "Hinweis in der Lernsprache", example: "Beispielsatz", tags: "Tags", unit: "Lernpaket", ignore: "Nicht verwenden" });

function field(documentRoot, options) {
  const wrapper = createElement(documentRoot, "div", { className: "form-field" });
  const id = options.id;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const attributes = { id, name: options.name ?? id, ...(options.attributes ?? {}) };
  if (options.description || options.error) {
    attributes["aria-describedby"] = [
      attributes["aria-describedby"],
      options.description ? helpId : null,
      options.error ? errorId : null,
    ]
      .filter(Boolean)
      .join(" ");
  }
  const label = createElement(documentRoot, "label", { text: options.label, attributes: { for: id } });
  const input = createElement(documentRoot, options.multiline ? "textarea" : "input", {
    attributes,
    dataset: options.dataset,
  });
  if (options.value !== undefined) input.value = options.value;
  if (options.checked !== undefined) input.checked = options.checked;
  wrapper.append(label, input);
  if (options.description) {
    wrapper.append(createElement(documentRoot, "p", {
      className: "form-field__help",
      text: options.description,
      attributes: { id: helpId },
    }));
  }
  if (options.error) {
    wrapper.append(createElement(documentRoot, "p", {
      className: "session-error form-field__error",
      attributes: { id: errorId, role: "alert", hidden: "" },
      dataset: { courseFieldError: options.name ?? id },
    }));
  }
  return wrapper;
}

function languageField(documentRoot, options) {
  const wrapper = createElement(documentRoot, "div", { className: "form-field" });
  const errorId = `${options.id}-error`;
  const label = createElement(documentRoot, "label", { text: options.label, attributes: { for: options.id } });
  const select = createElement(documentRoot, "select", {
    attributes: {
      id: options.id,
      name: options.name,
      required: "",
      "aria-describedby": errorId,
    },
    dataset: options.dataset,
  });
  select.append(createElement(documentRoot, "option", {
    text: "Sprache wählen",
    attributes: { value: "" },
  }));
  getLanguageDefinitions().forEach((definition) => {
    const option = createElement(documentRoot, "option", {
      text: definition.label,
      attributes: { value: definition.code },
    });
    option.selected = definition.code === options.value;
    select.append(option);
  });
  wrapper.append(
    label,
    select,
    createElement(documentRoot, "p", {
      className: "session-error form-field__error",
      attributes: { id: errorId, role: "alert", hidden: "" },
      dataset: { courseFieldError: options.name },
    }),
  );
  return wrapper;
}

function languageSettingsDetails(documentRoot, sourceCode = "", targetCode = "") {
  const details = createElement(documentRoot, "details", { className: "course-language-details" });
  details.append(
    createElement(documentRoot, "summary", { text: "Erweiterte Spracheinstellungen" }),
    createElement(documentRoot, "p", {
      className: "form-field__help",
      text: "Die automatisch gewählten Einstellungen passen für die meisten Kurse.",
    }),
  );
  const list = createElement(documentRoot, "dl", { className: "summary-list", dataset: { languageSettingsSummary: "" } });
  for (const [role, label, code] of [["source", "Ausgangssprache", sourceCode], ["target", "Zielsprache", targetCode]]) {
    const settings = describeLanguageSettings(code);
    const row = createElement(documentRoot, "div", { className: "summary-list__row", dataset: { languageSettingsRole: role } });
    row.append(
      createElement(documentRoot, "dt", { text: label }),
      createElement(documentRoot, "dd", {
        text: settings
          ? `${settings.code} · ${settings.locale}`
          : "Wird nach der Sprachauswahl automatisch festgelegt.",
      }),
    );
    list.append(row);
  }
  details.append(list);
  return details;
}

function aiImportHelp(documentRoot) {
  const details = createElement(documentRoot, "details", { className: "course-import-help" });
  details.append(
    createElement(documentRoot, "summary", { text: "Vokabelseite mit KI vorbereiten" }),
    createElement(documentRoot, "p", {
      className: "form-field__help",
      text: "Der kopierte Prompt berücksichtigt auch Beispielsätze, Hinweise, farbige Kästen und eine mögliche dritte Spalte. Fehlen Lautschrift, Beispiele oder wichtige Sonderformen, lässt der Prompt diese kontrolliert ergänzen.",
    }),
  );
  const steps = createElement(documentRoot, "ol", { className: "import-help-steps" });
  [
    "Import-Prompt kopieren.",
    "Bilder in einem selbst gewählten KI-Chat hochladen.",
    "Prompt dort einfügen.",
    "Erzeugte EduTools-JSON-Datei speichern und den Prüfbericht fachlich kontrollieren.",
    "Die Datei unter „Kurs aus JSON importieren“ auswählen.",
    "Import prüfen und abschließen.",
  ].forEach((text) => steps.append(createElement(documentRoot, "li", { text })));
  details.append(
    steps,
    createElement(documentRoot, "p", {
      className: "form-field__help",
      text: "Prüfe automatisch ergänzte Inhalte vor dem Import. EduTools selbst überträgt keine Bilder, Dateien oder Kursdaten an einen KI-Dienst.",
    }),
    createElement(documentRoot, "p", {
      className: "form-field__help",
      text: "EduTools kopiert ausschließlich den Textprompt. Du entscheidest selbst, welchen externen Dienst du verwendest; Upload und Verarbeitung erfolgen außerhalb von EduTools.",
    }),
    createElement(documentRoot, "button", {
      className: "button button--secondary",
      text: "Import-Prompt kopieren",
      attributes: { type: "button" },
      dataset: { editorAction: "copy-import-prompt" },
    }),
    createElement(documentRoot, "p", {
      className: "course-export-status",
      attributes: { role: "status", hidden: "" },
      dataset: { importHelpStatus: "" },
    }),
  );
  return details;
}

function statusText(unit) {
  if (unit.archived) return "Archiviert";
  if (unit.current) return "Aktuell · Freigegeben";
  return unit.released ? "Freigegeben" : "Gesperrt";
}

function statusVariant(unit) {
  if (unit.archived) return "archived";
  if (unit.current) return "current";
  return unit.released ? "released" : "locked";
}

function hiddenInput(documentRoot, name, value) {
  return createElement(documentRoot, "input", { attributes: { type: "hidden", name, value } });
}

export function renderNewCourseView(container, options = {}) {
  const documentRoot = container.ownerDocument;
  const form = createElement(documentRoot, "form", {
    className: "card course-editor-form",
    dataset: {
      courseCreateForm: "",
      courseCreateImport: options.startWithTabularImport ? "table" : "manual",
    },
    attributes: { novalidate: "" },
  });
  form.append(createElement(documentRoot, "h2", { className: "card__title", text: "Kursdaten" }));
  form.append(createElement(documentRoot, "p", {
    className: "card__description",
    text: options.startWithTabularImport
      ? "Lege zuerst Kurstitel und Sprachen fest. Danach kannst du deine vorbereitete CSV-, TSV- oder TXT-Tabelle direkt importieren."
      : "Kurstitel und Sprachen genügen für den Start. Technische Sprachwerte werden automatisch festgelegt.",
  }));
  const grid = createElement(documentRoot, "div", { className: "editor-field-grid" });
  grid.append(
    field(documentRoot, { id: "course-title", label: "Kurstitel", name: "title", error: true, attributes: { type: "text", required: "" } }),
    languageField(documentRoot, { id: "course-source-language", label: "Ausgangssprache", name: "sourceLanguage" }),
    languageField(documentRoot, { id: "course-target-language", label: "Zielsprache", name: "targetLanguage" }),
    field(documentRoot, { id: "course-subtitle", label: "Untertitel (optional)", name: "subtitle" }),
    field(documentRoot, { id: "course-school", label: "Schulart (optional)", name: "schoolType" }),
    field(documentRoot, { id: "course-grade", label: "Jahrgangsstufe (optional)", name: "gradeLevel" }),
    field(documentRoot, { id: "course-description", label: "Beschreibung (optional)", name: "description", multiline: true }),
  );
  form.append(
    grid,
    languageSettingsDetails(documentRoot),
    createElement(documentRoot, "p", { className: "session-error", attributes: { role: "alert", hidden: "", "data-course-form-error": "" } }),
  );
  const actions = createElement(documentRoot, "div", { className: "course-actions" });
  actions.append(createElement(documentRoot, "button", { className: "button button--primary", text: "Kurs erstellen", attributes: { type: "submit" } }), createElement(documentRoot, "a", { className: "button button--text", text: "Abbrechen", attributes: { href: "#/courses" }, dataset: { routeLink: "/courses" } }));
  form.append(actions);
  container.replaceChildren(form);
}

function newCourseBlocker(model) {
  const input = model?.courseInput ?? {};
  if (!String(input.title ?? "").trim()) return "Gib einen Namen für den neuen Kurs ein.";
  if (!input.sourceLanguage) return "Wähle die Ausgangssprache.";
  if (!input.targetLanguage) return "Wähle die Zielsprache.";
  if (input.sourceLanguage === input.targetLanguage) return "Ausgangs- und Zielsprache müssen unterschiedlich sein.";
  return "";
}

export function renderNewCourseImportView(container, model) {
  const documentRoot = container.ownerDocument;
  if (model?.success) {
    const success = createElement(documentRoot, "section", { className: "card course-import-success" });
    success.append(
      createElement(documentRoot, "h2", { className: "card__title", text: "Kurs gespeichert", attributes: { id: "course-import-success-title", tabindex: "-1" } }),
      createElement(documentRoot, "p", { className: "card__description", text: `„${model.success.title}“ wurde mit ${model.success.wordCount} Vokabeln in ${model.success.unitCount} Lernpakete lokal gespeichert.` }),
    );
    const actions = createElement(documentRoot, "div", { className: "course-actions" });
    actions.append(
      createElement(documentRoot, "a", {
        className: "button button--primary", text: "Kurs öffnen",
        attributes: { href: `#/course-builder?course=${encodeURIComponent(model.success.courseId)}` },
        dataset: { routeLink: "/course-builder" },
      }),
      createElement(documentRoot, "a", {
        className: "button button--secondary", text: "Zur Kursbibliothek",
        attributes: { href: "#/courses" }, dataset: { routeLink: "/courses" },
      }),
      createElement(documentRoot, "button", {
        className: "button button--text", text: "Weitere Vokabelliste importieren",
        attributes: { type: "button" }, dataset: { newImportAction: "restart" },
      }),
    );
    success.append(actions);
    container.replaceChildren(success);
    return;
  }

  const section = createElement(documentRoot, "section", { className: "card course-editor-section course-import-workspace" });
  section.append(
    createElement(documentRoot, "h2", { className: "card__title", text: "Vokabelliste importieren" }),
    createElement(documentRoot, "p", { className: "card__description", text: "Lege die Kursdaten fest und füge anschließend eine CSV-, TSV- oder TXT-Liste ein. Der Kurs wird erst nach deiner Prüfung gespeichert." }),
  );
  const input = model?.courseInput ?? {};
  const metadata = createElement(documentRoot, "form", { className: "course-import-metadata", dataset: { newCourseImportMetadata: "" }, attributes: { novalidate: "" } });
  const grid = createElement(documentRoot, "div", { className: "editor-field-grid" });
  grid.append(
    field(documentRoot, { id: "import-course-title", label: "Name des neuen Kurses", name: "title", value: input.title ?? "Mein Vokabelkurs", attributes: { type: "text", required: "" }, dataset: { newImportField: "title" } }),
    languageField(documentRoot, { id: "import-source-language", label: "Ausgangssprache", name: "sourceLanguage", value: input.sourceLanguage, dataset: { newImportField: "sourceLanguage" } }),
    languageField(documentRoot, { id: "import-target-language", label: "Zielsprache", name: "targetLanguage", value: input.targetLanguage, dataset: { newImportField: "targetLanguage" } }),
    field(documentRoot, { id: "import-course-description", label: "Beschreibung (optional)", name: "description", value: input.description ?? "", multiline: true, dataset: { newImportField: "description" } }),
  );
  metadata.append(grid);
  section.append(metadata);

  const source = createElement(documentRoot, "section", { className: "course-import-source" });
  source.append(
    createElement(documentRoot, "h3", { text: "Vokabelliste auswählen" }),
    createElement(documentRoot, "p", { className: "form-field__help", text: `Mehrere Übersetzungen kannst du mit ${MULTIPLE_TARGET_SEPARATOR} trennen. Leere optionale Felder sind erlaubt.` }),
  );
  const tools = createElement(documentRoot, "div", { className: "course-actions" });
  tools.append(
    createElement(documentRoot, "button", { className: "button button--secondary", text: "CSV-Vorlage herunterladen", attributes: { type: "button" }, dataset: { editorAction: "download-import-template" } }),
  );
  source.append(tools, aiImportHelp(documentRoot));
  const form = createElement(documentRoot, "form", { className: "tabular-import-form", dataset: { tabularImportForm: "" } });
  form.append(
    field(documentRoot, { id: "tabular-import-text", label: "Vokabelliste einfügen", name: "importText", multiline: true, value: model?.text ?? "" }),
    field(documentRoot, { id: "tabular-import-file", label: "Oder CSV-, TSV- beziehungsweise TXT-Datei auswählen", name: "importFile", attributes: { type: "file", accept: ".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" } }),
  );
  const headerLabel = createElement(documentRoot, "label", { className: "setting-toggle" });
  const header = createElement(documentRoot, "input", { attributes: { type: "checkbox", name: "hasHeaders" } });
  header.checked = model?.hasHeaders ?? true;
  headerLabel.append(header, createElement(documentRoot, "span", { text: "Erste Zeile enthält Überschriften" }));
  form.append(headerLabel, createElement(documentRoot, "button", { className: "button button--primary", text: "Vokabelliste einlesen", attributes: { type: "submit" } }));
  source.append(form);
  section.append(source);
  if (model?.error) section.append(createElement(documentRoot, "p", { className: "session-error", text: model.error, attributes: { role: "alert", tabindex: "-1" }, dataset: { importError: "" } }));
  const draft = model?.draft;
  if (model?.parsed && draft) section.append(renderImportMapping(documentRoot, draft, null, model, true));
  if (model?.preview) section.append(renderImportPreview(documentRoot, model, { courseBlocker: newCourseBlocker(model) }));
  container.replaceChildren(section);
}

function renderMetadata(documentRoot, draft, dirty) {
  const section = createElement(documentRoot, "section", { className: "card course-editor-section" });
  const heading = createElement(documentRoot, "div", { className: "editor-section-heading" });
  heading.append(createElement(documentRoot, "h2", { className: "card__title", text: "Kursdaten" }), createElement(documentRoot, "span", { className: `course-status course-status--${dirty ? "dirty" : "saved"}`, text: dirty ? "Ungespeicherte Änderungen" : "Gespeichert" }));
  section.append(heading);
  const grid = createElement(documentRoot, "div", { className: "editor-field-grid" });
  grid.append(
    field(documentRoot, { id: "edit-title", label: "Kurstitel", value: draft.title, dataset: { courseField: "title" }, attributes: { required: "" } }),
    languageField(documentRoot, { id: "edit-source-language", label: "Ausgangssprache", name: "editSourceLanguage", value: draft.languages.source.code, dataset: { courseLanguageRole: "source" } }),
    languageField(documentRoot, { id: "edit-target-language", label: "Zielsprache", name: "editTargetLanguage", value: draft.languages.target.code, dataset: { courseLanguageRole: "target" } }),
    field(documentRoot, { id: "edit-subtitle", label: "Untertitel (optional)", value: draft.subtitle, dataset: { courseField: "subtitle" } }),
    field(documentRoot, { id: "edit-school", label: "Schulart (optional)", value: draft.schoolType, dataset: { courseField: "schoolType" } }),
    field(documentRoot, { id: "edit-grade", label: "Jahrgangsstufe (optional)", value: draft.gradeLevel, dataset: { courseField: "gradeLevel" } }),
    field(documentRoot, { id: "edit-description", label: "Beschreibung (optional)", value: draft.description, multiline: true, dataset: { courseField: "description" } }),
  );
  section.append(
    grid,
    languageSettingsDetails(documentRoot, draft.languages.source.code, draft.languages.target.code),
  );
  const actions = createElement(documentRoot, "div", { className: "course-actions" });
  actions.append(
    createElement(documentRoot, "button", { className: "button button--primary", text: "Änderungen speichern", attributes: { type: "button" }, dataset: { editorAction: "save" } }),
    createElement(documentRoot, "button", { className: "button button--secondary", text: "Änderungen verwerfen", attributes: { type: "button" }, dataset: { editorAction: "discard" } }),
  );
  section.append(createElement(documentRoot, "div", { className: "editor-error-summary", attributes: { hidden: "", role: "alert", tabindex: "-1" }, dataset: { editorErrors: "" } }), actions);
  return section;
}

function renderUnits(documentRoot, draft, selectedUnitId) {
  const section = createElement(documentRoot, "section", { className: "card course-editor-section" });
  section.append(createElement(documentRoot, "h2", { className: "card__title", text: "Lernpakete" }), createElement(documentRoot, "p", { className: "card__description", text: "Freigegebene Lernpakete können gelernt werden. Gesperrte und archivierte Lernpakete sind keine Lernquelle." }));
  const addForm = createElement(documentRoot, "form", { className: "inline-editor-form", dataset: { unitAddForm: "" } });
  addForm.append(field(documentRoot, { id: "new-unit-title", label: "Neues Lernpaket", name: "unitTitle", attributes: { required: "" } }), createElement(documentRoot, "button", { className: "button button--secondary", text: "Lernpaket erstellen", attributes: { type: "submit" } }));
  section.append(addForm);
  const list = createElement(documentRoot, "div", { className: "unit-editor-list" });
  [...draft.units].sort((a, b) => a.order - b.order).forEach((unit, index) => {
    const item = createElement(documentRoot, "article", { className: `unit-editor-item${unit.id === selectedUnitId ? " unit-editor-item--selected" : ""}` });
    const heading = createElement(documentRoot, "div", { className: "unit-editor-item__heading" });
    heading.append(createElement(documentRoot, "strong", { text: unit.title }), createElement(documentRoot, "span", { className: `course-status course-status--${statusVariant(unit)}`, text: statusText(unit) }));
    item.append(heading, field(documentRoot, { id: `unit-title-${unit.id}`, label: "Bezeichnung", value: unit.title, dataset: { unitField: "title", unitId: unit.id } }), field(documentRoot, { id: `unit-description-${unit.id}`, label: "Beschreibung", value: unit.description, multiline: true, dataset: { unitField: "description", unitId: unit.id } }));
    if (unit.words.length > 0 && unit.words.length < 8) {
      item.append(createElement(documentRoot, "p", {
        className: "form-field__help course-editor-package-warning",
        text: `Dieses Lernpaket enthält nur ${unit.words.length} Wörter. Prüfe, ob es mit einem anderen Lernpaket zusammengeführt werden sollte.`,
        attributes: { role: "status" },
      }));
    }
    const actions = createElement(documentRoot, "div", { className: "course-actions" });
    const buttons = [
      ["select-unit", "Wörter anzeigen"], ["move-up", "Nach oben"], ["move-down", "Nach unten"],
      ["toggle-current", unit.current ? "Nicht mehr aktuell" : "Als aktuell markieren"], ["toggle-release", unit.released ? "Sperren" : "Freigeben"],
      ["toggle-unit-archive", unit.archived ? "Wiederherstellen" : "Archivieren"],
    ];
    buttons.forEach(([action, label]) => {
      const button = createElement(documentRoot, "button", { className: "button button--text", text: label, attributes: { type: "button" }, dataset: { editorAction: action, unitId: unit.id } });
      if ((action === "move-up" && index === 0) || (action === "move-down" && index === draft.units.length - 1)) button.disabled = true;
      actions.append(button);
    });
    item.append(actions);
    list.append(item);
  });
  if (draft.units.length === 0) list.append(createElement(documentRoot, "p", { className: "card__description", text: "Noch kein Lernpaket vorhanden." }));
  section.append(list);
  return section;
}

function renderWords(documentRoot, unit, editingWordId, sourceLanguage) {
  const section = createElement(documentRoot, "section", { className: "card course-editor-section" });
  section.append(createElement(documentRoot, "h2", { className: "card__title", text: unit ? `Wörter · ${unit.title}` : "Wörter" }));
  if (!unit) {
    section.append(createElement(documentRoot, "p", { className: "card__description", text: "Erstelle oder wähle zuerst ein Lernpaket." }));
    return section;
  }
  const editing = unit.words.find((word) => word.id === editingWordId) ?? null;
  const form = createElement(documentRoot, "form", { className: "word-editor-form", dataset: { wordEditorForm: "", wordId: editing?.id ?? "", unitId: unit.id } });
  const grid = createElement(documentRoot, "div", { className: "editor-field-grid" });
  for (const [id, label, name, value, multiline, description] of [
    ["word-source", "Ausgangsbegriff", "source", editing?.source ?? ""], ["word-targets", "Zielübersetzungen (eine pro Zeile)", "targets", editing?.targets.join("\n") ?? "", true],
    ["word-phonetic", "Lautschrift", "phonetic", editing?.phonetic ?? ""], ["word-hint", "Hinweis in der Lernsprache", "hint", editing?.hint ?? "", true, sourceLanguage
      ? `Formuliere eine kurze Erklärung oder Umschreibung auf ${sourceLanguage}, ohne das gesuchte Wort direkt zu nennen. Übersetzungen gehören in das Feld „Zielübersetzungen“.`
      : "Formuliere eine kurze Erklärung oder Umschreibung in der Lernsprache, ohne das gesuchte Wort direkt zu nennen. Übersetzungen gehören in das Feld „Zielübersetzungen“."],
    ["word-example", "Beispielsatz", "example", editing?.example ?? "", true], ["word-tags", "Tags (mit | trennen)", "tags", editing?.tags.join("|") ?? ""],
  ]) grid.append(field(documentRoot, { id, label, name, value, multiline, description, attributes: name === "source" || name === "targets" ? { required: "" } : {} }));
  form.append(grid);
  const archivedLabel = createElement(documentRoot, "label", { className: "setting-toggle" });
  const archived = createElement(documentRoot, "input", { attributes: { type: "checkbox", name: "archived" } });
  archived.checked = editing?.archived ?? false;
  archivedLabel.append(archived, createElement(documentRoot, "span", { text: "Wort archiviert" }));
  form.append(archivedLabel, createElement(documentRoot, "button", { className: "button button--secondary", text: editing ? "Wort speichern" : "Wort hinzufügen", attributes: { type: "submit" } }));
  if (editing) form.append(createElement(documentRoot, "button", { className: "button button--text", text: "Bearbeitung abbrechen", attributes: { type: "button" }, dataset: { editorAction: "cancel-word-edit" } }));
  section.append(form);
  const list = createElement(documentRoot, "ul", { className: "word-editor-list" });
  unit.words.forEach((word) => {
    const item = createElement(documentRoot, "li", { className: "word-editor-item" });
    const content = createElement(documentRoot, "div");
    content.append(createElement(documentRoot, "strong", { text: word.source }), createElement(documentRoot, "span", { text: word.targets.join(" · ") }));
    if (word.archived) content.append(createElement(documentRoot, "span", { className: "course-status course-status--archived", text: "Archiviert" }));
    const actions = createElement(documentRoot, "div", { className: "course-actions" });
    for (const [action, label] of [["edit-word", "Bearbeiten"], ["duplicate-word", "Duplizieren"], ["toggle-word-archive", word.archived ? "Wiederherstellen" : "Archivieren"]]) {
      actions.append(createElement(documentRoot, "button", { className: "button button--text", text: label, attributes: { type: "button" }, dataset: { editorAction: action, unitId: unit.id, wordId: word.id } }));
    }
    item.append(content, actions);
    list.append(item);
  });
  if (unit.words.length === 0) list.append(createElement(documentRoot, "li", { className: "card__description", text: "Dieses Lernpaket enthält noch keine Wörter." }));
  section.append(list);
  return section;
}

function renderImportMapping(documentRoot, draft, selectedUnitId, model, newCourse = false) {
  const mapping = createElement(documentRoot, "form", {
    className: "import-mapping",
    dataset: { importMappingForm: "" },
    attributes: { tabindex: "-1" },
  });
  mapping.append(
    createElement(documentRoot, "h3", { text: "Spalten zuordnen" }),
    createElement(documentRoot, "p", {
      className: "form-field__help",
      text: "Prüfe kurz, welche Bedeutung die Spalten deiner Liste haben.",
    }),
  );
  model.parsed.headers.forEach((headerText, index) => {
    const wrapper = createElement(documentRoot, "div", { className: "form-field" });
    const id = `mapping-${index}`;
    wrapper.append(createElement(documentRoot, "label", { text: headerText, attributes: { for: id } }));
    const select = createElement(documentRoot, "select", {
      attributes: { id, name: `mapping-${index}` },
      dataset: { mappingIndex: index },
    });
    IMPORT_FIELDS.forEach((value) => {
      const option = createElement(documentRoot, "option", { text: FIELD_LABELS[value], attributes: { value } });
      option.selected = model.mapping[index] === value;
      select.append(option);
    });
    wrapper.append(select);
    mapping.append(wrapper);
  });
  if (newCourse) {
    mapping.append(hiddenInput(documentRoot, "newUnitTitle", model.newUnitTitle || "Lernpaket 1"));
  } else {
    mapping.append(field(documentRoot, {
      id: "import-new-unit",
      label: "Neues Standard-Lernpaket (optional)",
      name: "newUnitTitle",
      value: model.newUnitTitle ?? "",
    }));
    const unitSelectWrap = createElement(documentRoot, "div", { className: "form-field" });
    unitSelectWrap.append(createElement(documentRoot, "label", { text: "Vorhandene Standard-Lernpaket", attributes: { for: "import-default-unit" } }));
    const unitSelect = createElement(documentRoot, "select", { attributes: { id: "import-default-unit", name: "defaultUnitId" } });
    draft.units.filter((unit) => !unit.archived).forEach((unit) => {
      const option = createElement(documentRoot, "option", { text: unit.title, attributes: { value: unit.id } });
      option.selected = (model.defaultUnitId ?? selectedUnitId) === unit.id;
      unitSelect.append(option);
    });
    unitSelectWrap.append(unitSelect);
    mapping.append(unitSelectWrap);
  }
  mapping.append(createElement(documentRoot, "button", {
    className: "button button--primary",
    text: "Vokabelliste prüfen",
    attributes: { type: "submit" },
  }));
  return mapping;
}

function summaryItem(documentRoot, label, value) {
  const item = createElement(documentRoot, "div", { className: "import-summary__item" });
  item.append(
    createElement(documentRoot, "dt", { text: label }),
    createElement(documentRoot, "dd", { text: String(value) }),
  );
  return item;
}

function renderProblemGroup(documentRoot, title, rows, type) {
  if (rows.length === 0) return null;
  const group = createElement(documentRoot, "section", { className: `import-problems import-problems--${type}` });
  group.append(createElement(documentRoot, "h4", { text: `${title} (${rows.length})` }));
  const list = createElement(documentRoot, "ul", { className: "import-problems__list" });
  rows.forEach((row) => {
    const item = createElement(documentRoot, "li");
    item.append(createElement(documentRoot, "strong", { text: `Zeile ${row.lineNumber}: ${row.word.source || "kein Ausgangsbegriff"}` }));
    [...row.errors, ...row.warnings].forEach((message) => item.append(createElement(documentRoot, "span", { text: message })));
    list.append(item);
  });
  group.append(list);
  return group;
}

function renderImportPreview(documentRoot, model, options = {}) {
  const { preview } = model;
  const section = createElement(documentRoot, "section", {
    className: "import-preview",
    attributes: { "aria-labelledby": "import-preview-title" },
  });
  section.append(createElement(documentRoot, "h3", {
    text: "Importübersicht",
    attributes: { id: "import-preview-title", tabindex: "-1" },
  }));
  const summary = createElement(documentRoot, "dl", { className: "import-summary", attributes: { "aria-label": "Zusammenfassung der Vokabelliste" } });
  [
    ["Vokabeln", preview.counts.read],
    ["Gültig", preview.counts.valid],
    ["Zu prüfen", preview.counts.warnings],
    ["Fehler", preview.counts.errors],
    ["Duplikate", preview.counts.duplicates],
    ["Neue Lernpakete", preview.counts.newUnits],
  ].forEach(([label, value]) => summary.append(summaryItem(documentRoot, label, value)));
  section.append(summary);

  if (preview.newUnitSummaries.length > 0) {
    const units = createElement(documentRoot, "section", { className: "import-unit-summary" });
    units.append(createElement(documentRoot, "h4", { text: "Neue Lernpakete" }));
    const list = createElement(documentRoot, "ul");
    preview.newUnitSummaries.forEach((unit) => list.append(createElement(documentRoot, "li", {
      text: `${unit.title} · ${unit.wordCount} ${unit.wordCount === 1 ? "Vokabel" : "Vokabeln"}`,
    })));
    units.append(list);
    section.append(units);
  }

  const errorRows = preview.rows.filter((row) => row.errors.length > 0);
  const warningRows = preview.rows.filter((row) => row.errors.length === 0 && row.warnings.length > 0);
  const errors = renderProblemGroup(documentRoot, "Fehler", errorRows, "error");
  const warnings = renderProblemGroup(documentRoot, "Zu prüfen", warningRows, "warning");
  if (errors) section.append(errors);
  if (warnings) section.append(warnings);

  const validRows = preview.rows.filter((row) => row.errors.length === 0);
  const valid = createElement(documentRoot, "details", { className: "import-valid-rows" });
  if (validRows.length <= 20) valid.setAttribute("open", "");
  valid.append(createElement(documentRoot, "summary", { text: `Gültige Vokabeln ansehen (${validRows.length})` }));
  const tableWrap = createElement(documentRoot, "div", { className: "import-preview-table-wrap" });
  const table = createElement(documentRoot, "table", { className: "import-preview-table" });
  const head = createElement(documentRoot, "thead");
  const headingRow = createElement(documentRoot, "tr");
  ["Ausgangsbegriff", "Übersetzung", "Lernpaket", "Status"].forEach((label) => headingRow.append(createElement(documentRoot, "th", { text: label, attributes: { scope: "col" } })));
  head.append(headingRow);
  const body = createElement(documentRoot, "tbody");
  validRows.forEach((row) => {
    const tr = createElement(documentRoot, "tr");
    [
      ["Ausgangsbegriff", row.word.source || "–"],
      ["Übersetzung", row.word.targets.join(" / ") || "–"],
      ["Lernpaket", row.unitTitle || "–"],
      ["Status", row.status],
    ].forEach(([label, value]) => tr.append(createElement(documentRoot, "td", { text: value, attributes: { "data-label": label } })));
    body.append(tr);
  });
  table.append(head, body);
  tableWrap.append(table);
  valid.append(tableWrap);
  section.append(valid);

  const blocker = options.courseBlocker
    || (preview.errors.length > 0 ? preview.errors[0] : "")
    || (preview.counts.errors > 0 ? "Korrigiere zuerst die fehlerhaften Zeilen." : "")
    || (preview.counts.valid === 0 ? "Die Liste enthält noch keine speicherbare Vokabel." : "");
  const commit = createElement(documentRoot, "form", { className: "import-save-bar", dataset: { importCommitForm: "" } });
  const unitCount = new Set(validRows.map((row) => row.unitId).filter(Boolean)).size;
  if (preview.counts.duplicates > 0) {
    const strategyWrap = createElement(documentRoot, "div", { className: "form-field import-duplicate-choice" });
    strategyWrap.append(createElement(documentRoot, "label", { text: "Vorhandene Vokabeln", attributes: { for: "duplicate-strategy" } }));
    const strategy = createElement(documentRoot, "select", { attributes: { id: "duplicate-strategy", name: "duplicateStrategy" } });
    for (const [value, label] of [["skip", "Unverändert lassen"], ["merge", "Übersetzungen ergänzen"], ["replace", "Durch Import ersetzen"]]) {
      strategy.append(createElement(documentRoot, "option", { text: label, attributes: { value } }));
    }
    strategyWrap.append(strategy);
    commit.append(strategyWrap);
  } else {
    commit.append(hiddenInput(documentRoot, "duplicateStrategy", "skip"));
  }
  const copy = createElement(documentRoot, "div", { className: "import-save-bar__copy" });
  copy.append(
    createElement(documentRoot, "strong", { text: `${preview.counts.valid} Vokabeln in ${unitCount} ${unitCount === 1 ? "Lernpaket" : "Lernpaketen"} speichern` }),
    createElement(documentRoot, "p", {
      className: blocker ? "session-error" : "form-field__help",
      text: blocker || "Die geprüfte Vokabelliste wird als lokaler Kurs gespeichert.",
      attributes: { role: blocker ? "alert" : "status" },
      dataset: { importSaveReason: "" },
    }),
  );
  const button = createElement(documentRoot, "button", {
    className: "button button--primary import-save-button",
    text: model.saving ? "Kurs wird gespeichert …" : "Kurs speichern",
    attributes: { type: "submit" },
    dataset: { importSaveButton: "" },
  });
  button.disabled = Boolean(blocker || model.saving);
  commit.append(copy, button);
  section.append(commit);
  return section;
}

function renderImport(documentRoot, draft, selectedUnitId, model) {
  const section = createElement(documentRoot, "section", { className: "card course-editor-section" });
  const sourceLanguage = draft.languages.source.label?.trim() || "der Lernsprache";
  const releasedUnits = draft.units.filter((unit) => unit.released && !unit.archived);
  const releasedWords = releasedUnits.reduce(
    (total, unit) => total + unit.words.filter((word) => !word.archived).length,
    0,
  );
  section.append(
    createElement(documentRoot, "h2", { className: "card__title", text: "Import und Export" }),
    createElement(documentRoot, "p", { className: "card__description", text: "Vorbereitete Tabellen werden zuerst geprüft und nur nach ausdrücklicher Bestätigung gespeichert. Sicherung und Lernpaket bleiben zwei getrennte Wege." }),
  );

  const exportOptions = createElement(documentRoot, "div", { className: "course-export-options" });
  const jsonExport = createElement(documentRoot, "section", { className: "course-export-panel" });
  const jsonDescription = createElement(documentRoot, "div");
  jsonDescription.append(
    createElement(documentRoot, "h3", { text: "EduTools-Kursdatei sichern (.json)" }),
    createElement(documentRoot, "p", {
      className: "form-field__help",
      text: "Zum Sichern und späteren Bearbeiten in EduTools.",
    }),
  );
  jsonExport.append(
    jsonDescription,
    createElement(documentRoot, "button", {
      className: "button button--secondary",
      text: "EduTools-Kursdatei herunterladen",
      attributes: { type: "button" },
      dataset: { editorAction: "export" },
    }),
  );
  const exportHelp = createElement(documentRoot, "details", { className: "course-export-help" });
  exportHelp.append(
    createElement(documentRoot, "summary", { text: "Wofür brauche ich die Kursdatei?" }),
    createElement(documentRoot, "p", {
      className: "form-field__help",
      text: "Die JSON-Datei enthält deinen vollständigen Vokabelkurs. Du kannst sie später wieder in EduTools importieren. Für ByCS verwendest du stattdessen das separate SCORM-Lernpaket.",
    }),
  );
  jsonExport.append(
    createElement(documentRoot, "p", {
      className: "course-export-status",
      attributes: { role: "status", hidden: "" },
      dataset: { courseExportStatus: "" },
    }),
    exportHelp,
  );

  const scormExport = createElement(documentRoot, "section", { className: "course-export-panel course-export-panel--scorm" });
  const scormDescription = createElement(documentRoot, "div");
  scormDescription.append(
    createElement(documentRoot, "h3", { text: "Lernpaket für ByCS erstellen (.zip)" }),
    createElement(documentRoot, "p", {
      className: "form-field__help",
      text: `Lernpaket erstellen für: ${draft.title}`,
    }),
    createElement(documentRoot, "p", {
      className: "form-field__help",
      text: `${releasedUnits.length} ${releasedUnits.length === 1 ? "freigegebenes Lernpaket" : "freigegebene Lernpakete"} · ${releasedWords} ${releasedWords === 1 ? "Wort" : "Wörter"} · ${draft.languages.source.label} → ${draft.languages.target.label}`,
    }),
    createElement(documentRoot, "p", {
      className: "form-field__help",
      text: "ZIP-Datei für den Upload als Lernpaket in ByCS oder Moodle.",
    }),
  );
  scormExport.append(
    scormDescription,
    createElement(documentRoot, "button", {
      className: "button button--primary",
      text: "SCORM-Lernpaket herunterladen",
      attributes: { type: "button" },
      dataset: { editorAction: "export-scorm" },
    }),
    createElement(documentRoot, "p", {
      className: "course-export-status",
      attributes: { role: "status", "aria-live": "polite", tabindex: "-1", hidden: "" },
      dataset: { scormExportStatus: "" },
    }),
  );
  const scormHelp = createElement(documentRoot, "details", { className: "course-export-help" });
  scormHelp.append(
    createElement(documentRoot, "summary", { text: "In ByCS verwenden" }),
    createElement(documentRoot, "ol", { className: "import-help-steps" }),
  );
  [
    "Lade das SCORM-Lernpaket hier als ZIP-Datei herunter.",
    "Lege in ByCS beziehungsweise Moodle eine SCORM-Aktivität an.",
    "Lade die ZIP-Datei unverändert als Lernpaket hoch.",
    "Speichere die Aktivität und öffne sie zum Testen.",
  ].forEach((text) => scormHelp.children[1].append(createElement(documentRoot, "li", { text })));
  scormHelp.append(createElement(documentRoot, "p", {
    className: "form-field__help",
    text: "Wichtig: Die ZIP-Datei nicht entpacken.",
  }));
  scormExport.append(scormHelp);
  exportOptions.append(jsonExport, scormExport);

  const tableImport = createElement(documentRoot, "div", { className: "course-import-primary", dataset: { tableImportSection: "" } });
  tableImport.append(
    createElement(documentRoot, "h3", { text: "Vokabelliste importieren" }),
    createElement(documentRoot, "p", {
      className: "form-field__help",
      text: "Unterstützt werden UTF-8-Dateien als CSV, TSV oder TXT. Ausgangsbegriff und Übersetzung sind erforderlich; alle weiteren Angaben sind optional.",
    }),
    createElement(documentRoot, "p", {
      className: "form-field__help",
      text: `Mehrere Übersetzungen werden mit ${MULTIPLE_TARGET_SEPARATOR} getrennt. Hinweise werden auf ${sourceLanguage} formuliert.`,
    }),
  );
  const templateActions = createElement(documentRoot, "div", { className: "course-actions" });
  templateActions.append(createElement(documentRoot, "button", {
    className: "button button--secondary",
    text: "CSV-Vorlage herunterladen",
    attributes: { type: "button" },
    dataset: { editorAction: "download-import-template" },
  }));
  tableImport.append(templateActions);

  tableImport.append(aiImportHelp(documentRoot));

  tableImport.append(createElement(documentRoot, "p", {
    className: "form-field__help",
    text: "Du kannst eine Datei auswählen oder Tabellenwerte direkt einfügen.",
  }));
  const form = createElement(documentRoot, "form", { className: "tabular-import-form", dataset: { tabularImportForm: "" } });
  form.append(field(documentRoot, { id: "tabular-import-text", label: "Tabellenwerte einfügen", name: "importText", multiline: true, value: model?.text ?? "" }));
  form.append(field(documentRoot, { id: "tabular-import-file", label: "Oder CSV-, TSV- beziehungsweise TXT-Datei auswählen", name: "importFile", attributes: { type: "file", accept: ".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" } }));
  const headerLabel = createElement(documentRoot, "label", { className: "setting-toggle" });
  const header = createElement(documentRoot, "input", { attributes: { type: "checkbox", name: "hasHeaders" } });
  header.checked = model?.hasHeaders ?? true;
  headerLabel.append(header, createElement(documentRoot, "span", { text: "Erste Zeile enthält Überschriften" }));
  form.append(headerLabel, createElement(documentRoot, "button", { className: "button button--secondary", text: "Vokabelliste einlesen", attributes: { type: "submit" } }));
  tableImport.append(form);
  if (model?.error) tableImport.append(createElement(documentRoot, "p", { className: "session-error", text: model.error, attributes: { role: "alert", tabindex: "-1" }, dataset: { importError: "" } }));
  if (model?.parsed) tableImport.append(renderImportMapping(documentRoot, draft, selectedUnitId, model));
  if (model?.preview) tableImport.append(renderImportPreview(documentRoot, model));
  const existingSections = [...section.children];
  section.replaceChildren(
    existingSections[0],
    existingSections[1],
    tableImport,
    exportOptions,
  );
  return section;
}

function renderExitDialog(documentRoot) {
  const dialog = createElement(documentRoot, "dialog", { className: "quiz-exit-dialog", dataset: { editorExitDialog: "" }, attributes: { "aria-labelledby": "editor-exit-title", "aria-describedby": "editor-exit-description" } });
  const content = createElement(documentRoot, "div", { className: "quiz-exit-dialog__content" });
  content.append(createElement(documentRoot, "h2", { text: "Ungespeicherte Änderungen", attributes: { id: "editor-exit-title" } }), createElement(documentRoot, "p", { className: "card__description", text: "Möchtest du weiter bearbeiten, die Änderungen speichern oder sie verwerfen?", attributes: { id: "editor-exit-description" } }));
  const actions = createElement(documentRoot, "div", { className: "quiz-exit-dialog__actions" });
  for (const [action, label, variant] of [["continue", "Weiter bearbeiten", "secondary"], ["discard-leave", "Änderungen verwerfen", "text"], ["save-leave", "Speichern und verlassen", "primary"]]) actions.append(createElement(documentRoot, "button", { className: `button button--${variant}`, text: label, attributes: { type: "button" }, dataset: { editorDialogAction: action } }));
  content.append(actions);
  dialog.append(content);
  return dialog;
}

export function renderCourseBuilderView(options) {
  const {
    container,
    enabled,
    snapshot,
    selectedUnitId,
    editingWordId,
    importModel,
    startWithTabularImport = false,
  } = options;
  if (!enabled) {
    const card = createElement(container.ownerDocument, "section", { className: "card shell-card empty-state" });
    card.append(createElement(container.ownerDocument, "h2", { className: "card__title", text: "Bearbeitungsmodus deaktiviert" }), createElement(container.ownerDocument, "p", { className: "card__description", text: "Die App bleibt mit dem aktiven Kurs vollständig nutzbar." }));
    container.replaceChildren(card);
    return;
  }
  if (!snapshot) {
    if (startWithTabularImport) return renderNewCourseImportView(container, importModel);
    return renderNewCourseView(container);
  }
  const { draft, dirty } = snapshot;
  const documentRoot = container.ownerDocument;
  const fragment = documentRoot.createDocumentFragment();
  fragment.append(renderMetadata(documentRoot, draft, dirty), renderUnits(documentRoot, draft, selectedUnitId));
  const selectedUnit = draft.units.find((unit) => unit.id === selectedUnitId) ?? draft.units[0] ?? null;
  fragment.append(
    renderWords(documentRoot, selectedUnit, editingWordId, draft.languages.source.label?.trim()),
    renderImport(documentRoot, draft, selectedUnit?.id ?? null, importModel),
    renderExitDialog(documentRoot),
  );
  container.replaceChildren(fragment);
}
