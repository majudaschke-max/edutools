// @ts-check

import { getLanguageDefinitions } from "../languages/language-registry.js";
import { createElement } from "./view-elements.js";

/** @typedef {{courseName: string, sourceLanguage: string, targetLanguage: string, errors: Record<string, string>, prompt: string, status: string}} AiImportViewModel */

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
      className: "course-export-status",
      text: "EduTools kopiert ausschließlich den Import-Prompt. Die Vokabelbilder lädst du selbst direkt im gewählten KI-Chat hoch. Es findet keine Bildübertragung durch EduTools statt.",
      dataset: { aiImportPrivacyNotice: "" },
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

  const first = step(documentRoot, "1", "Kursdaten festlegen");
  first.append(
    createElement(documentRoot, "p", {
      className: "card__description",
      text: "Lege Kursname, Ausgangssprache und Zielsprache fest.",
    }),
    promptForm,
  );

  const second = step(documentRoot, "2", "Import-Prompt kopieren");
  second.append(createElement(documentRoot, "p", {
    className: "card__description",
    text: "EduTools erzeugt den vollständigen Text ausschließlich mit der versionierten Prompt-Engine.",
  }));
  const promptActions = createElement(documentRoot, "div", { className: "course-actions" });
  promptActions.append(
    createElement(documentRoot, "button", {
      className: "button button--primary",
      text: "Import-Prompt kopieren",
      attributes: { type: "submit", form: "ai-import-prompt-form" },
      dataset: { aiImportAction: "copy-prompt" },
    }),
    createElement(documentRoot, "button", {
      className: "button button--secondary",
      text: "Prompt anzeigen",
      attributes: { type: "button" },
      dataset: { aiImportAction: "show-prompt" },
    }),
  );
  promptForm.setAttribute("id", "ai-import-prompt-form");
  const promptStatus = createElement(documentRoot, "p", {
    className: Object.keys(model.errors).length > 0 ? "session-error" : "course-export-status",
    text: model.status,
    attributes: { role: "status", "aria-live": "polite", tabindex: "-1" },
    dataset: { aiImportStatus: "" },
  });
  promptStatus.hidden = !model.status;
  second.append(promptActions, promptStatus);

  const third = step(documentRoot, "3", "KI-Chat öffnen");
  third.append(createElement(documentRoot, "p", {
    className: "card__description",
    text: "Öffne ChatGPT oder einen anderen geeigneten KI-Chat in einem neuen Tab oder Fenster.",
  }));

  const fourth = step(documentRoot, "4", "Vokabelbilder direkt dort hochladen");
  fourth.append(createElement(documentRoot, "p", {
    className: "card__description",
    text: "Lade die Fotos oder Screenshots der Vokabelseiten direkt im KI-Chat hoch. EduTools selbst erhält, liest oder überträgt keine Bilder.",
  }));

  const fifth = step(documentRoot, "5", "Prompt einfügen");
  fifth.append(
    createElement(documentRoot, "p", {
      className: "card__description",
      text: "Füge anschließend den kopierten Import-Prompt im selben Chat ein und sende die Anfrage ab.",
    }),
  );
  const sequence = createElement(documentRoot, "ol", { className: "ai-import-sequence" });
  [
    "Bilder im KI-Chat hochladen.",
    "Prompt im selben Chat einfügen.",
    "Anfrage absenden.",
  ].forEach((text) => sequence.append(createElement(documentRoot, "li", { text })));
  fifth.append(sequence);

  const sixth = step(documentRoot, "6", "JSON-Datei importieren");
  sixth.append(
    createElement(documentRoot, "p", {
      className: "card__description",
      text: "Speichere die erzeugte EduTools-JSON-Datei und importiere sie anschließend als neuen Kurs.",
    }),
    createElement(documentRoot, "a", {
      className: "button button--primary",
      text: "Zum JSON-Import",
      attributes: { href: "#/courses?import=json" },
      dataset: { routeLink: "/courses", aiImportJsonLink: "" },
    }),
  );

  card.append(
    first,
    second,
    third,
    fourth,
    fifth,
    sixth,
    createElement(documentRoot, "a", {
      className: "button button--text",
      text: "Zur Kursbibliothek",
      attributes: { href: "#/courses" },
      dataset: { routeLink: "/courses" },
    }),
    promptDialog(documentRoot, model),
  );
  container.replaceChildren(card);
}
