// @ts-check

import { createAiImportController } from "./ai-import-controller.js?v=4.0.3";
import { renderAiImportView } from "../views/ai-import-view.js?v=4.0.3";

/**
 * Binds the Author-only guided workflow. Images and external chat content never
 * enter this runtime; it reads only JSON files explicitly selected by users.
 * @param {{
 *   appRoot: HTMLElement,
 *   onStatus?: (message: string) => void,
 *   onCourseImported?: (course: object) => void,
 *   service?: object,
 *   idGenerator?: Function,
 *   controller?: ReturnType<typeof createAiImportController>,
 * }=} options
 */
export function createAiImportRuntime(options = {}) {
  if (!options.appRoot) throw new TypeError("Der ChatGPT-Import benötigt die Author-App als Wurzelelement.");
  const { appRoot } = options;
  const controller = options.controller ?? createAiImportController({
    service: options.service,
    idGenerator: options.idGenerator,
  });
  const onStatus = options.onStatus ?? (() => {});
  const onCourseImported = options.onCourseImported ?? (() => {});
  /** @type {HTMLElement | null} */
  let viewContainer = null;
  /** @type {HTMLElement | null} */
  let dialogRestoreTarget = null;
  let busy = false;
  let generation = 0;

  function render() {
    if (!viewContainer) return;
    renderAiImportView({ container: viewContainer, model: controller.getSnapshot() });
  }

  function focusFirstError() {
    const snapshot = controller.getSnapshot();
    const name = ["courseName", "sourceLanguage", "targetLanguage"].find((field) => snapshot.errors[field]);
    appRoot.querySelector(`[data-ai-import-field='${name}']`)?.focus?.();
  }

  /** @param {boolean=} forceError */
  function syncPromptFeedback(forceError = false) {
    const snapshot = controller.getSnapshot();
    for (const name of ["courseName", "sourceLanguage", "targetLanguage"]) {
      const control = appRoot.querySelector(`[data-ai-import-field='${name}']`);
      const error = appRoot.querySelector(`[data-ai-import-error='${name}']`);
      const message = snapshot.errors[name] ?? "";
      control?.setAttribute?.("aria-invalid", String(Boolean(message)));
      if (error) {
        error.textContent = message;
        error.hidden = !message;
      }
    }
    const status = appRoot.querySelector("[data-ai-import-status]");
    if (status) {
      status.textContent = snapshot.status;
      status.hidden = !snapshot.status;
      status.className = snapshot.status && (forceError || Object.keys(snapshot.errors).length > 0)
        ? "session-error"
        : "course-export-status";
    }
    const output = appRoot.querySelector("[data-ai-import-prompt-output]");
    if (output) output.textContent = snapshot.prompt;
  }

  function setBusy(value) {
    busy = value;
    appRoot.querySelectorAll("[data-ai-import-form], [data-ai-import-files-form], [data-ai-import-response-form]")
      .forEach((form) => form.setAttribute("aria-busy", String(value)));
    appRoot.querySelectorAll("[data-ai-import-action]")
      .forEach((control) => { control.disabled = value; });
  }

  function openPromptDialog() {
    const dialog = appRoot.querySelector("[data-ai-import-dialog]");
    if (typeof dialog?.showModal === "function") dialog.showModal();
    else dialog?.setAttribute("open", "");
    dialog?.querySelector("[data-ai-import-prompt-output]")?.focus?.();
  }

  function closePromptDialog(restoreFocus = true) {
    const dialog = appRoot.querySelector("[data-ai-import-dialog]");
    if (dialog?.open && typeof dialog.close === "function") dialog.close();
    else dialog?.removeAttribute("open");
    if (restoreFocus) dialogRestoreTarget?.focus?.();
    dialogRestoreTarget = null;
  }

  /** @param {Event} event */
  function handleInput(event) {
    const target = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (event.target);
    if (target?.matches?.("[data-ai-import-response]")) {
      controller.setResponseText(target.value);
      return;
    }
    const field = target?.dataset?.aiImportField;
    if (!field || !appRoot.contains(target)) return;
    controller.setField(field, target.value);
    target.setAttribute("aria-invalid", "false");
    const error = target.form?.querySelector?.(`[data-ai-import-error='${field}']`);
    if (error) {
      error.textContent = "";
      error.hidden = true;
    }
    const status = appRoot.querySelector("[data-ai-import-status]");
    if (status) {
      status.textContent = "";
      status.hidden = true;
    }
  }

  /** @param {Event} event */
  async function handleChange(event) {
    const target = /** @type {HTMLInputElement | null} */ (event.target);
    if (!target || !appRoot.contains(target)) return;
    if (target.matches?.("[data-ai-import-duplicate-choice]")) {
      controller.setDuplicateChoice(target.value);
      return;
    }
    if (target.matches?.("[data-ai-import-images]")) {
      controller.setImageFiles(target.files);
      render();
      onStatus(controller.getSnapshot().imageStatus);
      return;
    }
    if (!target.matches?.("[data-ai-import-json-files]") || busy) return;
    const operation = generation;
    setBusy(true);
    const result = await controller.setJsonFiles(target.files);
    if (operation !== generation || !viewContainer) return;
    busy = false;
    render();
    onStatus(controller.getSnapshot().importStatus);
    const focusTarget = !result.ok
      ? appRoot.querySelector("[data-ai-import-issues]")
      : appRoot.querySelector("[data-ai-import-preview]");
    focusTarget?.focus?.();
    if (result.error) console.error("JSON-Dateien konnten nicht geprüft werden.", result.error);
  }

  /** @param {SubmitEvent} event */
  async function handleSubmit(event) {
    const form = /** @type {HTMLFormElement | null} */ (event.target);
    if (!form || !appRoot.contains(form)) return;
    event.preventDefault();
    if (busy) return;
    if (form.matches("[data-ai-import-files-form]")) {
      const result = controller.importJsonFiles();
      onStatus(controller.getSnapshot().importStatus);
      if (!result.ok) {
        render();
        appRoot.querySelector("[data-ai-import-issues]")?.focus?.();
        if (result.error) console.error("JSON-Mehrfachimport konnte nicht gespeichert werden.", result.error);
        return;
      }
      onCourseImported(result.course);
      return;
    }
    if (form.matches("[data-ai-import-response-form]")) {
      const result = controller.importResponse();
      onStatus(controller.getSnapshot().responseStatus);
      if (!result.ok) {
        render();
        appRoot.querySelector("[data-ai-import-response-status]")?.focus?.();
        if (result.error) console.error("ChatGPT-Antwort konnte nicht importiert werden.", result.error);
        return;
      }
      onCourseImported(result.course);
      return;
    }
    if (!form.matches("[data-ai-import-form]")) return;
    const operation = generation;
    setBusy(true);
    const result = await controller.copyPrompt();
    if (operation !== generation || !viewContainer) return;
    syncPromptFeedback(!result.ok);
    setBusy(false);
    onStatus(controller.getSnapshot().status);
    if (!result.ok && Object.keys(result.errors ?? {}).length > 0) focusFirstError();
    else appRoot.querySelector("[data-ai-import-status]")?.focus?.();
    if (result.error) console.error("Import-Prompt konnte nicht kopiert werden.", result.error);
  }

  /** @param {MouseEvent} event */
  async function handleClick(event) {
    const control = /** @type {HTMLElement | null} */ (event.target)?.closest?.("[data-ai-import-action]");
    if (!control || !appRoot.contains(control)) return;
    const action = control.dataset.aiImportAction;
    if (action === "close-prompt") {
      closePromptDialog();
      return;
    }
    if (action === "prepare-response") {
      const result = controller.prepareResponse();
      render();
      onStatus(controller.getSnapshot().responseStatus);
      appRoot.querySelector(result.ok ? "[data-ai-import-response-status]" : "[data-ai-import-issues]")?.focus?.();
      if (result.error) console.error("ChatGPT-Antwort konnte nicht geprüft werden.", result.error);
      return;
    }
    if (action !== "show-prompt" || busy) return;
    const operation = generation;
    setBusy(true);
    const result = await controller.generatePrompt();
    if (operation !== generation || !viewContainer) return;
    syncPromptFeedback(!result.ok);
    setBusy(false);
    onStatus(controller.getSnapshot().status);
    if (!result.ok) {
      if (Object.keys(result.errors ?? {}).length > 0) focusFirstError();
      else appRoot.querySelector("[data-ai-import-status]")?.focus?.();
      if (result.error) console.error("Import-Prompt konnte nicht angezeigt werden.", result.error);
      return;
    }
    dialogRestoreTarget = /** @type {HTMLElement | null} */ (appRoot.querySelector("[data-ai-import-action='show-prompt']"));
    openPromptDialog();
  }

  /** @param {Event} event */
  function handleCancel(event) {
    const target = /** @type {HTMLElement | null} */ (event.target);
    if (!target?.matches?.("[data-ai-import-dialog]")) return;
    event.preventDefault();
    closePromptDialog();
  }

  /** @param {HTMLElement} container */
  function mount(container) {
    generation += 1;
    viewContainer = container;
    controller.reset();
    render();
    Promise.resolve().then(() => appRoot.querySelector("[data-ai-import-field='courseName']")?.focus?.());
  }

  function reset() {
    generation += 1;
    closePromptDialog(false);
    viewContainer = null;
    busy = false;
    controller.reset();
  }

  function destroy() {
    reset();
    appRoot.removeEventListener("input", handleInput);
    appRoot.removeEventListener("change", handleChange);
    appRoot.removeEventListener("submit", handleSubmit);
    appRoot.removeEventListener("click", handleClick);
    appRoot.removeEventListener("cancel", handleCancel, true);
  }

  appRoot.addEventListener("input", handleInput);
  appRoot.addEventListener("change", handleChange);
  appRoot.addEventListener("submit", handleSubmit);
  appRoot.addEventListener("click", handleClick);
  appRoot.addEventListener("cancel", handleCancel, true);

  return Object.freeze({ destroy, mount, reset });
}
