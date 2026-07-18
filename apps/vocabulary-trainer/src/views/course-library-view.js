import { createElement } from "./view-elements.js";

function wordCount(course) {
  return course.units.filter((unit) => !unit.archived)
    .reduce((sum, unit) => sum + unit.words.filter((word) => !word.archived).length, 0);
}

function createStatus(documentRoot, text) {
  const variants = {
    Aktiv: "active",
    Archiviert: "archived",
    "Eigener Kurs": "info",
  };
  const variant = variants[text];
  return createElement(documentRoot, "span", {
    className: `course-status${variant ? ` course-status--${variant}` : ""}`,
    text,
  });
}

function createCourseCard(documentRoot, course) {
  const card = createElement(documentRoot, "article", { className: "card course-card" });
  const heading = createElement(documentRoot, "div", { className: "course-card__heading" });
  const title = createElement(documentRoot, "h2", { className: "card__title", text: course.title });
  const statuses = createElement(documentRoot, "div", { className: "course-statuses" });
  if (course.active) statuses.append(createStatus(documentRoot, "Aktiv"));
  statuses.append(createStatus(documentRoot, "Eigener Kurs"));
  if (course.archived) statuses.append(createStatus(documentRoot, "Archiviert"));
  heading.append(title, statuses);
  const details = createElement(documentRoot, "dl", { className: "summary-list" });
  for (const [label, value] of [
    ["Sprachen", `${course.languages.source.label} → ${course.languages.target.label}`],
    ["Lernpakete", course.units.filter((unit) => !unit.archived).length],
    ["Aktive Wörter", wordCount(course)],
    ["Geändert", new Date(course.updatedAt).toLocaleDateString("de-DE")],
  ]) {
    const row = createElement(documentRoot, "div", { className: "summary-list__row" });
    row.append(createElement(documentRoot, "dt", { text: label }), createElement(documentRoot, "dd", { text: value }));
    details.append(row);
  }
  const actions = createElement(documentRoot, "div", { className: "course-actions" });
  if (!course.active && !course.archived) actions.append(actionButton(documentRoot, "Kurs verwenden", "activate", course.id, "primary"));
  const edit = createElement(documentRoot, "a", {
    className: "button button--secondary", text: "Bearbeiten",
    attributes: { href: `#/course-builder?course=${encodeURIComponent(course.id)}` },
    dataset: { routeLink: "/course-builder" },
  });
  actions.append(edit, actionButton(documentRoot, "Duplizieren", "duplicate", course.id, "text"));
  actions.append(actionButton(documentRoot, course.archived ? "Wiederherstellen" : "Archivieren", course.archived ? "restore" : "archive", course.id, "text"));
  actions.append(actionButton(documentRoot, "Löschen", "delete", course.id, "destructive"));
  actions.append(actionButton(documentRoot, "EduTools-Kursdatei herunterladen", "export", course.id));
  const exportHelp = createElement(documentRoot, "p", {
    className: "form-field__help",
    text: "JSON-Datei zum Sichern und späteren Bearbeiten. Das fertige SCORM-Lernpaket erstellst du im Course Builder.",
  });
  card.append(heading, details, actions, exportHelp);
  return card;
}

function actionButton(documentRoot, label, action, courseId, variant = "secondary") {
  return createElement(documentRoot, "button", {
    className: `button button--${variant}`,
    text: label,
    attributes: { type: "button" },
    dataset: { courseAction: action, courseId },
  });
}

function aiImportLink(documentRoot) {
  return createElement(documentRoot, "a", {
    className: "button button--secondary",
    text: "Vokabelseite mit KI vorbereiten",
    attributes: { href: "#/course-builder?import=ai" },
    dataset: { routeLink: "/course-builder" },
  });
}

function jsonImportLink(documentRoot) {
  return actionButton(documentRoot, "Kurs aus JSON importieren", "focus-import", "");
}

function jsonImportModeChoice(documentRoot, value, title, description, checked = false) {
  const id = `course-json-mode-${value}`;
  const choice = createElement(documentRoot, "label", {
    className: "quiz-choice course-json-mode__choice",
    attributes: { for: id },
  });
  const input = createElement(documentRoot, "input", {
    attributes: { id, name: "course-json-mode", type: "radio", value },
    dataset: { courseJsonMode: value },
  });
  input.type = "radio";
  input.name = "course-json-mode";
  input.value = value;
  input.checked = checked;
  const copy = createElement(documentRoot, "span", { className: "course-json-mode__copy" });
  copy.append(
    createElement(documentRoot, "strong", { text: title }),
    createElement(documentRoot, "span", { className: "form-field__help", text: description }),
  );
  choice.append(input, copy);
  return choice;
}

function renderDisabled(container) {
  const documentRoot = container.ownerDocument;
  const card = createElement(documentRoot, "section", { className: "card shell-card empty-state" });
  card.append(
    createElement(documentRoot, "h2", { className: "card__title", text: "Kursverwaltung ist deaktiviert" }),
    createElement(documentRoot, "p", { className: "card__description", text: "Der Vocabulary Trainer bleibt mit dem fest veröffentlichten Kurs vollständig nutzbar." }),
  );
  container.replaceChildren(card);
}

export function renderCourseLibraryView(options) {
  const { container, courses, enabled, recovered = false } = options;
  if (!enabled) return renderDisabled(container);
  const documentRoot = container.ownerDocument;
  const content = documentRoot.createDocumentFragment();
  if (recovered) content.append(createElement(documentRoot, "p", {
    className: "session-error", text: "Eine beschädigte lokale Kursbibliothek wurde zurückgesetzt. Eigene Kursdateien können erneut importiert werden.", attributes: { role: "status" },
  }));
  if (courses.length === 0) {
    const empty = createElement(documentRoot, "section", { className: "card shell-card empty-state course-library-empty" });
    empty.append(
      createElement(documentRoot, "h2", { className: "card__title", text: "Noch kein eigener Kurs" }),
      createElement(documentRoot, "p", { className: "card__description", text: "Importiere eine vorbereitete Vokabelliste oder lege einen Kurs manuell an." }),
    );
    const actions = createElement(documentRoot, "div", { className: "course-actions" });
    actions.append(
      createElement(documentRoot, "a", {
        className: "button button--primary",
        text: "Vokabelliste importieren",
        attributes: { href: "#/course-builder?import=table" },
        dataset: { routeLink: "/course-builder" },
      }),
      createElement(documentRoot, "a", {
        className: "button button--secondary",
        text: "Kurs manuell anlegen",
        attributes: { href: "#/course-builder" },
        dataset: { routeLink: "/course-builder" },
      }),
      aiImportLink(documentRoot),
      jsonImportLink(documentRoot),
    );
    empty.append(actions);
    content.append(empty);
  } else {
    const toolbar = createElement(documentRoot, "div", { className: "course-library-toolbar" });
    toolbar.append(
      createElement(documentRoot, "a", {
        className: "button button--primary", text: "Vokabelliste importieren",
        attributes: { href: "#/course-builder?import=table" }, dataset: { routeLink: "/course-builder" },
      }),
      createElement(documentRoot, "a", {
        className: "button button--secondary", text: "Kurs manuell anlegen",
        attributes: { href: "#/course-builder" }, dataset: { routeLink: "/course-builder" },
      }),
      aiImportLink(documentRoot),
      jsonImportLink(documentRoot),
    );
    content.append(toolbar);
    const list = createElement(documentRoot, "div", { className: "course-library-grid" });
    courses.forEach((course) => list.append(createCourseCard(documentRoot, course)));
    content.append(list);
  }

  content.append(createElement(documentRoot, "p", {
    className: "course-export-status",
    attributes: { role: "status", hidden: "" },
    dataset: { courseExportStatus: "" },
  }));

  const importCard = createElement(documentRoot, "section", {
    className: "card shell-card course-import-card",
    attributes: { "aria-labelledby": "course-json-import-title" },
    dataset: { courseJsonImportSection: "" },
  });
  importCard.append(
    createElement(documentRoot, "h2", {
      className: "card__title",
      text: "Kurs aus JSON importieren",
      attributes: { id: "course-json-import-title" },
    }),
    createElement(documentRoot, "p", {
      className: "card__description",
      text: "Wähle, ob aus der JSON-Datei ein neuer Kurs entstehen oder ein vollständiges EduTools-Backup mit seinen bestehenden IDs wiederhergestellt werden soll.",
    }),
  );
  const form = createElement(documentRoot, "form", {
    className: "course-json-import",
    attributes: { novalidate: "" },
    dataset: { courseJsonImport: "" },
  });
  const modeFieldset = createElement(documentRoot, "fieldset", {
    className: "quiz-config__group course-json-mode",
  });
  modeFieldset.append(createElement(documentRoot, "legend", {
    className: "quiz-config__legend",
    text: "Importart",
  }));
  const modeChoices = createElement(documentRoot, "div", {
    className: "quiz-config__choices course-json-mode__choices",
  });
  modeChoices.append(
    jsonImportModeChoice(
      documentRoot,
      "new",
      "Als neuen Kurs importieren",
      "Für eine von ChatGPT oder einem anderen Werkzeug erzeugte EduTools-Kursdatei. Fehlende oder fremde technische IDs werden verworfen und von EduTools neu erzeugt.",
      true,
    ),
    jsonImportModeChoice(
      documentRoot,
      "restore",
      "EduTools-Backup wiederherstellen",
      "Für einen zuvor aus EduTools exportierten vollständigen Kurs. Bestehende Kurs-, Lernpaket- und Vokabeleintrags-IDs bleiben erhalten.",
    ),
  );
  modeFieldset.append(modeChoices);
  const fileField = createElement(documentRoot, "div", { className: "form-field file-picker" });
  const label = createElement(documentRoot, "label", { text: "JSON-Datei auswählen", attributes: { for: "course-json-file" } });
  const file = createElement(documentRoot, "input", {
    className: "file-picker__control",
    attributes: {
      id: "course-json-file",
      name: "course-json-file",
      type: "file",
      accept: ".json,application/json",
      multiple: "",
      required: "",
      "aria-describedby": "course-json-file-help course-json-file-status course-json-file-error",
    },
    dataset: { fileNameStatus: "course-json-file-status" },
  });
  fileField.append(
    label,
    file,
    createElement(documentRoot, "p", {
      className: "form-field__help",
      text: "Neuimport: eine oder mehrere zusammengehörige JSON-Dateien. Backup: genau eine JSON-Datei. Maximal 2 MB je Datei.",
      attributes: { id: "course-json-file-help" },
    }),
    createElement(documentRoot, "p", {
      className: "file-picker__status",
      text: "Keine Datei ausgewählt.",
      attributes: { id: "course-json-file-status", "aria-live": "polite" },
    }),
    createElement(documentRoot, "p", {
      className: "session-error file-picker__error",
      attributes: { id: "course-json-file-error", role: "alert", hidden: "" },
      dataset: { courseJsonError: "" },
    }),
  );
  const conflictField = createElement(documentRoot, "div", {
    className: "form-field",
    attributes: { hidden: "" },
    dataset: { courseJsonConflictField: "" },
  });
  const conflictLabel = createElement(documentRoot, "label", { text: "Bei gleicher Kurs-ID", attributes: { for: "course-json-conflict" } });
  const select = createElement(documentRoot, "select", { attributes: { id: "course-json-conflict", name: "course-json-conflict" } });
  for (const [value, labelText] of [["new", "Als neuen Kurs importieren"], ["replace", "Vorhandenen eigenen Kurs ersetzen"]]) {
    select.append(createElement(documentRoot, "option", { text: labelText, attributes: { value } }));
  }
  conflictField.append(conflictLabel, select);
  form.append(modeFieldset, fileField, conflictField, createElement(documentRoot, "button", {
    className: "button button--primary", text: "JSON als neuen Kurs importieren", attributes: { type: "submit" },
    dataset: { courseJsonImportSubmit: "" },
  }));
  importCard.append(form);
  content.append(importCard);

  const dialog = createElement(documentRoot, "dialog", { className: "quiz-exit-dialog", dataset: { courseDeleteDialog: "" }, attributes: { "aria-labelledby": "course-delete-title", "aria-describedby": "course-delete-description" } });
  const dialogContent = createElement(documentRoot, "div", { className: "quiz-exit-dialog__content" });
  dialogContent.append(
    createElement(documentRoot, "h2", { text: "Lokalen Kurs löschen?", attributes: { id: "course-delete-title" } }),
    createElement(documentRoot, "p", { className: "card__description", text: "Der Kursinhalt wird gelöscht. Zugehörige Lern- und Motivationsdaten bleiben standardmäßig lokal erhalten.", attributes: { id: "course-delete-description" } }),
  );
  const dialogActions = createElement(documentRoot, "div", { className: "quiz-exit-dialog__actions" });
  dialogActions.append(actionButton(documentRoot, "Abbrechen", "delete-cancel", ""), actionButton(documentRoot, "Kursinhalt löschen", "delete-confirm", "", "destructive"));
  dialogContent.append(dialogActions);
  dialog.append(dialogContent);
  content.append(dialog);
  container.replaceChildren(content);
}
