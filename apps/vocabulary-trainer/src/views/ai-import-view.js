// @ts-check

import { getLanguageDefinitions } from "../languages/language-registry.js";
import { createElement } from "./view-elements.js";

/** @typedef {{code: string, severity: string, message: string, action: string, path: string}} AiImportIssue */
/** @typedef {{name: string, size: number, status: "valid" | "warning" | "error", issueCount: number}} SelectedJsonFile */
/** @typedef {{title: string, fileCount: number, unitCount: number, wordCount: number, sourceLanguage: string, targetLanguage: string, unitTitles: readonly string[]}} BatchPreview */
/** @typedef {{courseName: string, sourceLanguage: string, targetLanguage: string, errors: Record<string, string>, prompt: string, status: string, selectedFiles: readonly SelectedJsonFile[], importIssues: readonly AiImportIssue[], importStatus: string, preview: BatchPreview | null, duplicateChoice: string, duplicates: readonly {unitTitle: string, source: string}[], canImport: boolean}} AiImportViewModel */

/** @param {Document} documentRoot @param {AiImportViewModel} model @param {"courseName" | "sourceLanguage" | "targetLanguage"} name @param {string} label */
function metadataField(documentRoot, model, name, label) {
  const id = `ai-import-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLocaleLowerCase("en-US")}`)}`;
  const errorId = `${id}-error`;
  const wrapper = createElement(documentRoot, "div", { className: "form-field" });
  wrapper.append(createElement(documentRoot, "label", { text: label, attributes: { for: id } }));
  const attributes = {
    id,
    name,
    required: "",
    "aria-describedby": errorId,
    "aria-invalid": String(Boolean(model.errors[name])),
  };
  let control;
  if (name === "courseName") {
    control = createElement(documentRoot, "input", {
      attributes: { ...attributes, type: "text", autocomplete: "off" },
      dataset: { aiImportField: name },
    });
    control.value = model[name];
  } else {
    control = createElement(documentRoot, "select", {
      attributes,
      dataset: { aiImportField: name },
    });
    control.append(createElement(documentRoot, "option", { text: "Bitte wählen", attributes: { value: "" } }));
    getLanguageDefinitions().forEach((language) => control.append(createElement(documentRoot, "option", {
      text: language.label,
      attributes: { value: language.code },
    })));
    control.value = model[name];
  }
  const error = createElement(documentRoot, "p", {
    className: "session-error form-field__error",
    text: model.errors[name] ?? "",
    attributes: { id: errorId, role: "alert" },
    dataset: { aiImportError: name },
  });
  error.hidden = !model.errors[name];
  wrapper.append(control, error);
  return wrapper;
}

/** @param {Document} documentRoot @param {AiImportViewModel} model */
function promptDialog(documentRoot, model) {
  const dialog = createElement(documentRoot, "dialog", {
    className: "quiz-exit-dialog ai-import-dialog",
    attributes: {
      "aria-labelledby": "ai-import-dialog-title",
      "aria-describedby": "ai-import-dialog-description",
    },
    dataset: { aiImportDialog: "" },
  });
  const content = createElement(documentRoot, "div", { className: "quiz-exit-dialog__content" });
  content.append(
    createElement(documentRoot, "h2", { text: "Erzeugter Import-Prompt", attributes: { id: "ai-import-dialog-title" } }),
    createElement(documentRoot, "p", {
      className: "card__description",
      text: "Dieser Text wurde von der versionierten EduTools-Prompt-Engine erzeugt.",
      attributes: { id: "ai-import-dialog-description" },
    }),
    createElement(documentRoot, "pre", {
      className: "ai-import-dialog__prompt",
      text: model.prompt,
      attributes: { tabindex: "0" },
      dataset: { aiImportPromptOutput: "" },
    }),
  );
  const actions = createElement(documentRoot, "div", { className: "quiz-exit-dialog__actions" });
  actions.append(createElement(documentRoot, "button", {
    className: "button button--primary",
    text: "Schließen",
    attributes: { type: "button" },
    dataset: { aiImportAction: "close-prompt" },
  }));
  content.append(actions);
  dialog.append(content);
  return dialog;
}

/** @param {Document} documentRoot @param {AiImportViewModel} model */
export function createAiImportIssueOverview(documentRoot, model) {
  const issues = Array.isArray(model.importIssues) ? model.importIssues : [];
  const summary = createElement(documentRoot, "section", {
    className: "ai-import-issues",
    attributes: { role: "alert", tabindex: "-1", "aria-labelledby": "ai-import-issues-title" },
    dataset: { aiImportIssues: "" },
  });
  summary.hidden = issues.length === 0;
  if (issues.length === 0) return summary;
  summary.append(createElement(documentRoot, "h4", {
    text: issues.some((issue) => issue.severity === "error") ? "Dateien können noch nicht importiert werden" : "Hinweise vor dem Import",
    attributes: { id: "ai-import-issues-title" },
  }));
  const list = createElement(documentRoot, "ul", { className: "ai-import-issues__list" });
  issues.forEach((issue) => {
    const item = createElement(documentRoot, "li", {
      className: `ai-import-issues__item ai-import-issues__item--${issue.severity || "error"}`,
    });
    item.append(createElement(documentRoot, "strong", { text: issue.message }));
    if (issue.action) item.append(createElement(documentRoot, "span", { text: ` ${issue.action}` }));
    list.append(item);
  });
  summary.append(list);
  return summary;
}

/** @param {Document} documentRoot @param {AiImportViewModel} model */
export function createAiImportFileList(documentRoot, model) {
  const list = createElement(documentRoot, "ul", {
    className: "ai-import-files__list",
    dataset: { aiImportFileList: "" },
  });
  list.hidden = model.selectedFiles.length === 0;
  const statusLabels = { valid: "Gültig", warning: "Hinweis", error: "Fehler" };
  model.selectedFiles.forEach((file) => {
    const item = createElement(documentRoot, "li", { className: "ai-import-file" });
    item.append(
      createElement(documentRoot, "span", {
        className: "ai-import-file__name",
        text: file.name,
        attributes: { title: file.name },
      }),
      createElement(documentRoot, "span", {
        className: `course-status course-status--${file.status === "valid" ? "ready" : file.status}`,
        text: statusLabels[file.status] ?? "Unbekannt",
      }),
    );
    list.append(item);
  });
  return list;
}

/** @param {Document} documentRoot @param {AiImportViewModel} model */
function importPreview(documentRoot, model) {
  const section = createElement(documentRoot, "section", {
    className: "ai-import-preview",
    attributes: { "aria-labelledby": "ai-import-preview-title", tabindex: "-1" },
    dataset: { aiImportPreview: "" },
  });
  section.hidden = !model.preview;
  if (!model.preview) return section;
  section.append(createElement(documentRoot, "h4", {
    text: "Importvorschau",
    attributes: { id: "ai-import-preview-title" },
  }));
  const summary = createElement(documentRoot, "dl", { className: "import-summary" });
  for (const [label, value] of [
    ["Kurs", model.preview.title],
    ["Dateien", String(model.preview.fileCount)],
    ["Lernpakete", String(model.preview.unitCount)],
    ["Vokabeleinträge", String(model.preview.wordCount)],
    ["Sprachen", `${model.preview.sourceLanguage} → ${model.preview.targetLanguage}`],
  ]) {
    const item = createElement(documentRoot, "div", { className: "import-summary__item" });
    item.append(createElement(documentRoot, "dt", { text: label }), createElement(documentRoot, "dd", { text: value }));
    summary.append(item);
  }
  section.append(summary);
  const units = createElement(documentRoot, "p", {
    className: "form-field__help",
    text: `Lernpakete: ${model.preview.unitTitles.join(", ")}`,
  });
  section.append(units);
  if (model.duplicates.length > 0) {
    const duplicateSection = createElement(documentRoot, "div", { className: "ai-import-duplicates" });
    duplicateSection.append(createElement(documentRoot, "h5", { text: "Exakte Duplikate" }));
    const duplicateList = createElement(documentRoot, "ul", { className: "ai-import-duplicates__list" });
    model.duplicates.forEach((entry) => duplicateList.append(createElement(documentRoot, "li", {
      text: `${entry.source} – ${entry.unitTitle}`,
    })));
    const fieldset = createElement(documentRoot, "fieldset", { className: "settings-choice" });
    fieldset.append(createElement(documentRoot, "legend", { text: "Wie sollen exakte Duplikate behandelt werden?" }));
    for (const [value, label] of [
      ["skip", "Exakte Duplikate überspringen"],
      ["keep", "Duplikate trotzdem behalten"],
    ]) {
      const choice = createElement(documentRoot, "label");
      const radio = createElement(documentRoot, "input", {
        attributes: { type: "radio", name: "exactDuplicateStrategy", value },
        dataset: { aiImportDuplicateChoice: value },
      });
      radio.checked = model.duplicateChoice === value;
      choice.append(radio, createElement(documentRoot, "span", { text: label }));
      fieldset.append(choice);
    }
    duplicateSection.append(duplicateList, fieldset);
    section.append(duplicateSection);
  }
  return section;
}

/** @param {Document} documentRoot @param {AiImportViewModel} model */
function importFilesForm(documentRoot, model) {
  const form = createElement(documentRoot, "form", {
    className: "ai-import-files-form",
    attributes: { novalidate: "" },
    dataset: { aiImportFilesForm: "" },
  });
  const field = createElement(documentRoot, "div", { className: "form-field file-picker" });
  field.append(
    createElement(documentRoot, "label", { text: "JSON-Datei auswählen", attributes: { for: "ai-import-json-files" } }),
    createElement(documentRoot, "input", {
      className: "file-picker__control",
      attributes: {
        id: "ai-import-json-files",
        name: "jsonFiles",
        type: "file",
        accept: ".json,application/json",
        multiple: "",
        "aria-describedby": "ai-import-json-help ai-import-file-count ai-import-json-status",
      },
      dataset: { aiImportJsonFiles: "" },
    }),
    createElement(documentRoot, "p", {
      className: "form-field__help",
      text: "Wähle alle von ChatGPT erzeugten, zusammengehörigen EduTools-JSON-Dateien in einem Schritt aus. EduTools prüft sie vollständig, bevor ein Kurs gespeichert wird.",
      attributes: { id: "ai-import-json-help" },
    }),
  );
  const count = model.selectedFiles.length;
  const countStatus = createElement(documentRoot, "p", {
    className: "ai-import-file-count",
    text: count === 0 ? "Noch keine Datei ausgewählt" : `${count} ${count === 1 ? "Datei ausgewählt" : "Dateien ausgewählt"}`,
    attributes: { id: "ai-import-file-count", role: "status", "aria-live": "polite" },
    dataset: { aiImportFileCount: "" },
  });
  const status = createElement(documentRoot, "p", {
    className: model.importIssues.some((issue) => issue.severity === "error") ? "session-error" : "course-export-status",
    text: model.importStatus,
    attributes: { id: "ai-import-json-status", role: "status", "aria-live": "polite", tabindex: "-1" },
    dataset: { aiImportJsonStatus: "" },
  });
  status.hidden = !model.importStatus;
  const actions = createElement(documentRoot, "div", { className: "course-actions" });
  const importButton = createElement(documentRoot, "button", {
    className: "button button--primary",
    text: "JSON als neuen Kurs importieren",
    attributes: { type: "submit" },
    dataset: { aiImportAction: "import-files" },
  });
  importButton.disabled = !model.canImport;
  actions.append(importButton);
  form.append(field, countStatus, createAiImportFileList(documentRoot, model), status, createAiImportIssueOverview(documentRoot, model), importPreview(documentRoot, model), actions);
  return form;
}

/** @param {Document} documentRoot @param {string} number @param {string} title */
function step(documentRoot, number, title) {
  const section = createElement(documentRoot, "section", { className: "ai-import-step" });
  const heading = createElement(documentRoot, "h3", { className: "ai-import-step__title" });
  heading.append(
    createElement(documentRoot, "span", { className: "ai-import-step__number", text: number, attributes: { "aria-hidden": "true" } }),
    createElement(documentRoot, "span", { text: title }),
  );
  section.append(heading);
  return section;
}

/** @param {{container: HTMLElement, model: AiImportViewModel}} options */
export function renderAiImportView({ container, model }) {
  const documentRoot = container.ownerDocument;
  const selectedImages = model.selectedImages ?? [];
  const card = createElement(documentRoot, "section", {
    className: "card course-editor-form ai-import-assistant",
    attributes: { "aria-labelledby": "ai-import-title" },
  });
  card.append(
    createElement(documentRoot, "h2", {
      className: "card__title",
      text: "Vokabelseite mit KI vorbereiten",
      attributes: { id: "ai-import-title" },
    }),
    createElement(documentRoot, "p", {
      className: "card__description",
      text: "EduTools kopiert nur einen Prompt. Bilder und ChatGPT-Verarbeitung bleiben außerhalb von EduTools; du entscheidest selbst, welchen KI-Chat du verwendest.",
    }),
  );

  const promptForm = createElement(documentRoot, "form", {
    className: "ai-import-form",
    attributes: { novalidate: "" },
    dataset: { aiImportForm: "" },
  });
  const fields = createElement(documentRoot, "div", { className: "editor-field-grid" });
  fields.append(
    metadataField(documentRoot, model, "courseName", "Kursname"),
    metadataField(documentRoot, model, "sourceLanguage", "Ausgangssprache"),
    metadataField(documentRoot, model, "targetLanguage", "Zielsprache"),
  );
  promptForm.append(fields);

  const first = step(documentRoot, "1", "Bilder auswählen");
  first.append(
    createElement(documentRoot, "p", {
      className: "card__description",
      text: "Die Bilder bleiben lokal. EduTools liest und überträgt sie nicht.",
    }),
    createElement(documentRoot, "label", {
      text: "Vokabelseiten auswählen",
      attributes: { for: "ai-import-images" },
    }),
    createElement(documentRoot, "input", {
      className: "file-picker__control",
      attributes: {
        id: "ai-import-images",
        type: "file",
        accept: ".heic,.heif,.jpg,.jpeg,.png,.webp,image/heic,image/heif,image/jpeg,image/png,image/webp",
        multiple: "",
        "aria-describedby": "ai-import-images-help ai-import-images-status",
      },
      dataset: { aiImportImages: "" },
    }),
    createElement(documentRoot, "p", {
      className: "form-field__help",
      text: "Unterstützt werden HEIC, HEIF, JPG, JPEG, PNG und WEBP.",
      attributes: { id: "ai-import-images-help" },
    }),
  );
  const imageStatus = createElement(documentRoot, "p", {
    className: model.imageStatus && selectedImages.length === 0 ? "session-error" : "course-export-status",
    text: model.imageStatus || "Noch keine Bilder ausgewählt",
    attributes: { id: "ai-import-images-status", role: "status", "aria-live": "polite" },
    dataset: { aiImportImageStatus: "" },
  });
  first.append(imageStatus);
  if (selectedImages.length > 0) {
    const images = createElement(documentRoot, "ol", { className: "ai-import-files__list" });
    selectedImages.forEach((image) => images.append(createElement(documentRoot, "li", {
      text: `${image.label} · ${image.type || "Bilddatei"}`,
    })));
    first.append(images);
  }

  const second = step(documentRoot, "2", "Prompt kopieren");
  second.append(createElement(documentRoot, "p", {
    className: "card__description",
    text: "Lege Kursname und Sprachen fest. EduTools erzeugt daraus den vollständigen Import-Prompt.",
  }));
  const promptActions = createElement(documentRoot, "div", { className: "course-actions" });
  promptActions.append(
    createElement(documentRoot, "button", {
      className: "button button--primary",
      text: "Prompt kopieren",
      attributes: { type: "submit" },
      dataset: { aiImportAction: "copy-prompt" },
    }),
    createElement(documentRoot, "button", {
      className: "button button--secondary",
      text: "Prompt anzeigen",
      attributes: { type: "button" },
      dataset: { aiImportAction: "show-prompt" },
    }),
  );
  const promptStatus = createElement(documentRoot, "p", {
    className: Object.keys(model.errors).length > 0 ? "session-error" : "course-export-status",
    text: model.status,
    attributes: { role: "status", "aria-live": "polite", tabindex: "-1" },
    dataset: { aiImportStatus: "" },
  });
  promptStatus.hidden = !model.status;
  promptForm.append(promptActions, promptStatus);
  second.append(promptForm);

  const third = step(documentRoot, "3", "In ChatGPT hochladen");
  third.append(
    createElement(documentRoot, "p", {
      className: "card__description",
      text: "Öffne ChatGPT und lade dort dieselben Bilder erneut hoch. EduTools öffnet nur den Link und sendet selbst keine Daten.",
    }),
    createElement(documentRoot, "a", {
      className: "button button--secondary",
      text: "ChatGPT öffnen",
      attributes: { href: "https://chatgpt.com/", target: "_blank", rel: "noopener noreferrer" },
      dataset: { aiImportExternalChat: "" },
    }),
  );

  const fourth = step(documentRoot, "4", "Prompt in ChatGPT einfügen");
  fourth.append(createElement(documentRoot, "p", {
    className: "card__description",
    text: "Füge den kopierten Prompt nach dem Bilder-Upload in den Chat ein und lasse die Kursdaten erstellen.",
  }));

  const fifth = step(documentRoot, "5", "EduTools-JSON-Dateien speichern");
  fifth.append(createElement(documentRoot, "p", {
    className: "card__description",
    text: "Speichere die erzeugte EduTools-JSON-Datei oder alle zusammengehörigen Dateiteile. Der Prüfbericht bleibt außerhalb der Kursdateien.",
  }));

  const sixth = step(documentRoot, "6", "Kurs aus JSON importieren");
  sixth.append(
    createElement(documentRoot, "p", {
      className: "card__description",
      text: "Wähle die gespeicherten Dateien aus, prüfe die Vorschau und schließe den Import ab.",
    }),
    importFilesForm(documentRoot, model),
  );

  const responseFallback = createElement(documentRoot, "details", { className: "ai-import-step" });
  responseFallback.append(
    createElement(documentRoot, "summary", { text: "KI-Antwort als Text einfügen (Fallback)" }),
    createElement(documentRoot, "p", {
      className: "card__description",
      text: "Falls der gewählte KI-Chat keine Datei bereitstellt, füge hier seine vollständige Antwort mit den ungekürzten JSON-Kursdaten ein.",
    }),
  );
  const responseForm = createElement(documentRoot, "form", {
    className: "ai-import-response-form",
    attributes: { novalidate: "" },
    dataset: { aiImportResponseForm: "" },
  });
  const responseInput = createElement(documentRoot, "textarea", {
    attributes: {
      id: "ai-import-response",
      rows: "10",
      spellcheck: "false",
      "aria-describedby": "ai-import-response-status",
    },
    dataset: { aiImportResponse: "" },
  });
  responseInput.value = model.responseText ?? "";
  responseForm.append(
    createElement(documentRoot, "label", {
      text: "Vollständige ChatGPT-Antwort",
      attributes: { for: "ai-import-response" },
    }),
    responseInput,
  );
  const responseStatus = createElement(documentRoot, "p", {
    className: model.responseIssues?.some((entry) => entry.severity === "error") ? "session-error" : "course-export-status",
    text: model.responseStatus ?? "",
    attributes: { id: "ai-import-response-status", role: "status", "aria-live": "polite", tabindex: "-1" },
    dataset: { aiImportResponseStatus: "" },
  });
  responseStatus.hidden = !model.responseStatus;
  const responseActions = createElement(documentRoot, "div", { className: "course-actions" });
  const importResponseButton = createElement(documentRoot, "button", {
    className: "button button--primary",
    text: "Kurs importieren",
    attributes: { type: "submit" },
    dataset: { aiImportAction: "import-response" },
  });
  importResponseButton.disabled = !model.canImportResponse;
  responseActions.append(
    createElement(documentRoot, "button", {
      className: "button button--secondary",
      text: "Antwort prüfen",
      attributes: { type: "button" },
      dataset: { aiImportAction: "prepare-response" },
    }),
    importResponseButton,
  );
  responseForm.append(
    responseStatus,
    createAiImportIssueOverview(documentRoot, { ...model, importIssues: model.responseIssues ?? [] }),
    responseActions,
  );
  responseFallback.append(responseForm);

  card.append(first, second, third, fourth, fifth, sixth, responseFallback, createElement(documentRoot, "a", {
    className: "button button--text",
    text: "Zur Kursbibliothek",
    attributes: { href: "#/courses" },
    dataset: { routeLink: "/courses" },
  }), promptDialog(documentRoot, model));
  container.replaceChildren(card);
}
