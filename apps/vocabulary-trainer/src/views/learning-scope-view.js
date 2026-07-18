// @ts-check

import { LEARNING_SCOPE_MULTIPLE } from "../core/learning-scope.js";
import {
  getDefaultSessionSize,
  getSessionSizeOptions,
} from "../core/session-size.js?v=4.0.3";
import { createElement } from "./view-elements.js";

function choice(documentRoot, inputOptions, labelText) {
  const label = createElement(documentRoot, "label", { className: "quiz-choice" });
  const input = createElement(documentRoot, "input", { attributes: inputOptions });
  input.type = inputOptions.type;
  input.checked = inputOptions.checked === true || inputOptions.checked === "";
  input.disabled = inputOptions.disabled === true;
  label.append(input, createElement(documentRoot, "span", {
    className: "quiz-choice__label",
    text: labelText,
  }));
  return label;
}

/** Creates the shared single/multiple/all learning-scope controls. */
export function createLearningScopeFieldsets(
  documentRoot,
  prefix,
  options,
  selected = "all",
  selectedPackageIds = [],
) {
  const source = createElement(documentRoot, "fieldset", { className: "quiz-config__group" });
  source.append(createElement(documentRoot, "legend", {
    className: "quiz-config__legend",
    text: "Lernbereich",
  }));
  const sourceChoices = createElement(documentRoot, "div", { className: "quiz-config__choices" });
  options.forEach((option, index) => sourceChoices.append(choice(documentRoot, {
    id: `${prefix}-source-${index}`,
    name: `${prefix}-source`,
    type: "radio",
    value: option.value,
    checked: option.value === selected,
  }, `${option.label} (${option.words.length})`)));
  source.append(sourceChoices);

  const packages = options.filter((option) => option.packageId);
  const multiple = createElement(documentRoot, "fieldset", {
    className: "quiz-config__group learning-scope-packages",
    attributes: { "aria-describedby": `${prefix}-packages-help` },
    dataset: { learningScopePackages: prefix },
  });
  multiple.append(
    createElement(documentRoot, "legend", {
      className: "quiz-config__legend",
      text: "Lernpakete für die Mehrfachauswahl",
    }),
    createElement(documentRoot, "p", {
      className: "form-field__help",
      text: "Wähle mindestens zwei Lernpakete oder nutze oben direkt ein einzelnes beziehungsweise alle Lernpakete.",
      attributes: { id: `${prefix}-packages-help` },
    }),
  );
  const packageChoices = createElement(documentRoot, "div", { className: "quiz-config__choices" });
  const rememberedPackages = new Set(selectedPackageIds);
  packages.forEach((option, index) => packageChoices.append(choice(documentRoot, {
    id: `${prefix}-package-${index}`,
    name: `${prefix}-package`,
    type: "checkbox",
    value: option.packageId,
    checked: rememberedPackages.size === 0 || rememberedPackages.has(option.packageId),
    disabled: selected !== LEARNING_SCOPE_MULTIPLE,
  }, `${option.label} (${option.words.length})`)));
  multiple.append(packageChoices);
  multiple.hidden = packages.length < 2;
  return [source, multiple];
}

export function readLearningScopeSelection(form, prefix) {
  return {
    value: form.querySelector(`input[name='${prefix}-source']:checked`)?.value ?? "all",
    packageIds: [...form.querySelectorAll(`input[name='${prefix}-package']:checked`)]
      .map((input) => input.value),
  };
}

export function syncLearningScopePackageControls(form, prefix) {
  const selection = readLearningScopeSelection(form, prefix);
  const enabled = selection.value === LEARNING_SCOPE_MULTIPLE;
  form.querySelectorAll(`input[name='${prefix}-package']`).forEach((input) => {
    input.disabled = !enabled;
  });
  return selection;
}

export function createSessionAmountFieldset(documentRoot, prefix, count, mode, noun) {
  const fieldset = createElement(documentRoot, "fieldset", {
    className: "quiz-config__group quiz-config__group--balanced",
    dataset: { sessionAmountGroup: prefix },
  });
  fieldset.append(createElement(documentRoot, "legend", {
    className: "quiz-config__legend",
    text: "Umfang",
  }));
  const choices = createElement(documentRoot, "div", {
    className: "quiz-config__choices",
    dataset: { sessionAmountChoices: prefix },
  });
  const selected = getDefaultSessionSize(count, mode);
  getSessionSizeOptions(count, mode).forEach((option, index) => choices.append(choice(documentRoot, {
    id: `${prefix}-amount-${index}`,
    name: `${prefix}-amount`,
    type: "radio",
    value: option.value,
    checked: option.value === selected,
  }, option.all ? option.label.replace(/Wörter?$/u, noun) : `${option.count} ${noun}`)));
  fieldset.append(choices);
  return fieldset;
}

export function updateSessionAmountChoices(container, prefix, count, mode, noun) {
  const oldGroup = container.querySelector(`[data-session-amount-group='${prefix}']`);
  if (!oldGroup) return false;
  oldGroup.replaceWith(createSessionAmountFieldset(container.ownerDocument, prefix, count, mode, noun));
  return true;
}
