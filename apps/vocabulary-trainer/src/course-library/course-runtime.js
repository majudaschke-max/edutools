import { createCourseEditorController } from "./course-editor-controller.js";
import { commitImport, commitNewCourseImport, createImportPreview } from "../import/vocabulary-importer.js";
import { COURSE_SOURCE_TYPES, createCourse } from "./course-schema.js";
import {
  importJsonCourse,
  importJsonCoursesAsNew,
  JSON_COURSE_IMPORT_MODES,
} from "../import/json-course-importer.js";
import { downloadCourseExport } from "../import/course-exporter.js";
import { downloadIndividualScormPackage } from "../scorm-export/scorm-browser-export.js?v=4.0.3";
import {
  copyImportPromptToClipboard,
  downloadTabularImportTemplate,
} from "../import/import-template.js";
import { parseTabularText, MAX_IMPORT_BYTES } from "../import/tabular-parser.js";
import { suggestColumnMapping } from "../import/import-mapper.js";
import {
  createCourseLanguage,
  describeLanguageSettings,
} from "../languages/language-registry.js";
import { renderCourseLibraryView } from "../views/course-library-view.js";
import { renderCourseBuilderView } from "../views/course-builder-view.js";
import { createAiImportRuntime } from "../ai-import/ai-import-runtime.js?v=4.0.3";

const COURSE_ROUTES = new Set(["/courses", "/course-builder"]);
const EMPTY_LANGUAGE = Object.freeze({ code: "", label: "", speechLocale: "" });

function readCourseForm(form) {
  const data = new FormData(form);
  const source = createCourseLanguage(data.get("sourceLanguage"));
  const target = createCourseLanguage(data.get("targetLanguage"));
  return {
    title: data.get("title"), subtitle: data.get("subtitle"), description: data.get("description"),
    schoolType: data.get("schoolType"), gradeLevel: data.get("gradeLevel"),
    languages: { source, target },
  };
}

const CREATE_FIELD_ORDER = Object.freeze(["title", "sourceLanguage", "targetLanguage"]);

function validateCourseCreationForm(form) {
  const data = new FormData(form);
  const title = String(data.get("title") ?? "").trim();
  const source = createCourseLanguage(data.get("sourceLanguage"));
  const target = createCourseLanguage(data.get("targetLanguage"));
  const errors = {};
  if (!title) errors.title = "Bitte gib einen Kurstitel ein.";
  if (!source) errors.sourceLanguage = "Bitte wähle eine Ausgangssprache.";
  if (!target) errors.targetLanguage = "Bitte wähle eine Zielsprache.";
  if (source && target && source.code === target.code) {
    errors.targetLanguage = "Ausgangs- und Zielsprache müssen unterschiedlich sein.";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

function createNewImportCourse(input, options = {}) {
  return createCourse({
    title: String(input.title ?? "").trim(),
    description: String(input.description ?? "").trim(),
    languages: {
      source: createCourseLanguage(input.sourceLanguage) ?? EMPTY_LANGUAGE,
      target: createCourseLanguage(input.targetLanguage) ?? EMPTY_LANGUAGE,
    },
  }, {
    idGenerator: options.idGenerator,
    sourceType: COURSE_SOURCE_TYPES.OWN,
    editable: true,
  });
}

function validateNewImportCourseInput(input = {}) {
  if (!String(input.title ?? "").trim()) return "Gib einen Namen für den neuen Kurs ein.";
  if (!createCourseLanguage(input.sourceLanguage)) return "Wähle die Ausgangssprache.";
  if (!createCourseLanguage(input.targetLanguage)) return "Wähle die Zielsprache.";
  if (input.sourceLanguage === input.targetLanguage) return "Ausgangs- und Zielsprache müssen unterschiedlich sein.";
  return "";
}

function updateNewImportCourse(course, input) {
  if (!course) return;
  course.title = String(input.title ?? "").trim();
  course.description = String(input.description ?? "").trim();
  course.languages.source = createCourseLanguage(input.sourceLanguage) ?? { ...EMPTY_LANGUAGE };
  course.languages.target = createCourseLanguage(input.targetLanguage) ?? { ...EMPTY_LANGUAGE };
}

function readWordForm(form) {
  const data = new FormData(form);
  return {
    source: data.get("source"),
    targets: String(data.get("targets") ?? "").split(/\r?\n/),
    phonetic: data.get("phonetic"), hint: data.get("hint"), example: data.get("example"),
    tags: String(data.get("tags") ?? "").split("|"), archived: data.get("archived") === "on",
  };
}

export function createCourseRuntime(options) {
  const { appRoot, service, enabled, recovered, onActivateCourse, onCourseUpdated, onNavigate, idGenerator } = options;
  const documentRoot = appRoot.ownerDocument;
  let editor = null;
  let selectedUnitId = null;
  let editingWordId = null;
  let importModel = null;
  let currentRoute = null;
  let pendingRoute = null;
  let allowedRoute = null;
  let deleteCourseId = null;
  let deleteTrigger = null;
  let importInProgress = false;
  let jsonImportInProgress = false;
  let scormExportInProgress = false;

  function container(selector) {
    const element = appRoot.querySelector(selector);
    if (!element) throw new Error(`Kursansicht fehlt: ${selector}`);
    return element;
  }

  function live(message) {
    const region = appRoot.querySelector("[data-course-live]");
    if (!region) return;
    region.textContent = "";
    Promise.resolve().then(() => { region.textContent = message; });
  }

  const aiImportRuntime = createAiImportRuntime({
    appRoot,
    service,
    idGenerator,
    onStatus: live,
    onCourseImported(course) {
      onCourseUpdated?.(course.id);
      live(`Kurs „${course.title}“ wurde importiert.`);
      onNavigate(`/course-builder?course=${encodeURIComponent(course.id)}`);
    },
  });

  function setJsonImportError(message = "") {
    const input = appRoot.querySelector("#course-json-file");
    const error = appRoot.querySelector("[data-course-json-error]");
    if (!input || !error) return;
    error.textContent = message;
    error.hidden = message.length === 0;
    input.setAttribute("aria-invalid", String(message.length > 0));
  }

  function updateJsonImportMode(form) {
    if (!form?.matches?.("[data-course-json-import]")) return;
    const mode = form.querySelector("[name='course-json-mode']:checked")?.value
      ?? JSON_COURSE_IMPORT_MODES.NEW;
    const restore = mode === JSON_COURSE_IMPORT_MODES.RESTORE;
    const conflictField = form.querySelector("[data-course-json-conflict-field]");
    const submitButton = form.querySelector("[data-course-json-import-submit]");
    if (conflictField) conflictField.hidden = !restore;
    if (submitButton) {
      submitButton.textContent = restore
        ? "Backup wiederherstellen"
        : "JSON als neuen Kurs importieren";
    }
    setJsonImportError();
  }

  function showCourseCreationErrors(form, errors = {}) {
    form.querySelectorAll("[data-course-field-error]").forEach((message) => {
      const fieldName = message.dataset.courseFieldError;
      const text = errors[fieldName] ?? "";
      message.textContent = text;
      message.hidden = !text;
      form.elements.namedItem(fieldName)?.setAttribute?.("aria-invalid", String(Boolean(text)));
    });
    const firstInvalidName = CREATE_FIELD_ORDER.find((name) => errors[name]);
    form.elements.namedItem(firstInvalidName)?.focus?.();
  }

  function updateLanguageSummary(scope, role, code) {
    const output = scope?.querySelector?.(`[data-language-settings-role='${role}'] dd`);
    if (!output) return;
    const settings = describeLanguageSettings(code);
    output.textContent = settings
      ? `${settings.code} · ${settings.locale}`
      : "Wird nach der Sprachauswahl automatisch festgelegt.";
  }

  function updateNewImportSaveAvailability() {
    if (importModel?.mode !== "new-course" || !importModel.preview) return;
    const courseBlocker = validateNewImportCourseInput(importModel.courseInput);
    const previewBlocker = importModel.preview.errors[0]
      || (importModel.preview.counts.errors > 0 ? "Korrigiere zuerst die fehlerhaften Zeilen." : "")
      || (importModel.preview.counts.valid === 0 ? "Die Liste enthält noch keine speicherbare Vokabel." : "");
    const blocker = courseBlocker || previewBlocker;
    const button = appRoot.querySelector("[data-import-save-button]");
    const reason = appRoot.querySelector("[data-import-save-reason]");
    if (button) button.disabled = Boolean(blocker || importInProgress);
    if (reason) {
      reason.textContent = blocker || "Die geprüfte Vokabelliste wird als lokaler Kurs gespeichert.";
      reason.className = blocker ? "session-error" : "form-field__help";
    }
  }

  function exportCourse(course, statusTarget = null) {
    try {
      const result = downloadCourseExport(course);
      const message = `Die Kursdatei wurde erstellt. Dateiname: ${result.filename}`;
      if (statusTarget) {
        statusTarget.textContent = message;
        statusTarget.hidden = false;
      }
      live(message);
      return result;
    } catch (error) {
      console.error("Kursdatei konnte nicht erstellt werden.", error);
      const message = "Die Kursdatei konnte nicht erstellt werden. Der Kurs blieb unverändert.";
      if (statusTarget) {
        statusTarget.textContent = message;
        statusTarget.hidden = false;
      }
      live(message);
      throw error;
    }
  }

  async function exportScormPackage(course) {
    if (scormExportInProgress) return null;
    const button = appRoot.querySelector("[data-editor-action='export-scorm']");
    const status = appRoot.querySelector("[data-scorm-export-status]");
    scormExportInProgress = true;
    if (button) {
      button.disabled = true;
      button.textContent = "SCORM-Lernpaket wird erstellt …";
    }
    if (status) {
      status.hidden = false;
      status.className = "course-export-status";
      status.textContent = "Kurs wird geprüft. Lernpaket und ZIP-Datei werden zusammengestellt …";
    }
    live("SCORM-Lernpaket wird erstellt …");
    try {
      const result = await downloadIndividualScormPackage(course);
      const size = Math.max(1, Math.round(result.bytes / 1024));
      const message = `SCORM-Lernpaket wurde erstellt: ${result.filename} (${size} KB). Lade die ZIP-Datei in ByCS oder Moodle als Lernpaket hoch und entpacke sie vorher nicht.`;
      if (status) status.textContent = message;
      live("SCORM-Lernpaket wurde erstellt.");
      return result;
    } catch (error) {
      console.error("SCORM-Lernpaket konnte nicht erstellt werden.", error);
      const details = Array.isArray(error?.issues) && error.issues.length > 0
        ? ` ${error.issues.join(" ")}`
        : " Prüfe Kurs, Freigaben und die lokale SCORM-Vorlage.";
      const message = `Das SCORM-Lernpaket konnte nicht korrekt erstellt werden.${details}`;
      if (status) {
        status.className = "session-error course-export-status";
        status.textContent = message;
        status.focus?.();
      }
      live(message);
      return null;
    } finally {
      scormExportInProgress = false;
      if (button) {
        button.disabled = false;
        button.textContent = "SCORM-Lernpaket herunterladen";
      }
    }
  }

  function renderLibrary() {
    aiImportRuntime.reset();
    if (importModel?.mode === "new-course") importModel = null;
    renderCourseLibraryView({
      container: container("[data-course-library-content]"),
      courses: service.listLocalCourses(),
      enabled,
      recovered,
    });
  }

  function renderBuiltInEditor(course) {
    const target = container("[data-course-builder-content]");
    const card = documentRoot.createElement("section");
    card.className = "card shell-card";
    const heading = documentRoot.createElement("h2");
    heading.className = "card__title";
    heading.textContent = "Mitgelieferter Kurs";
    const text = documentRoot.createElement("p");
    text.className = "card__description";
    text.textContent = "Dieser Kurs bleibt unverändert. Du kannst ihn als eigenen Kurs duplizieren und anschließend bearbeiten.";
    const button = documentRoot.createElement("button");
    button.type = "button";
    button.className = "button button--primary";
    button.textContent = "Als eigenen Kurs duplizieren";
    button.dataset.courseAction = "duplicate";
    button.dataset.courseId = course.id;
    card.append(heading, text, button);
    target.replaceChildren(card);
  }

  function ensureEditor(courseId) {
    const course = service.getCourse(courseId);
    if (!course) return null;
    const libraryEntry = service.listCourses().find((item) => item.id === courseId);
    if (libraryEntry?.builtIn) return { builtIn: true, course };
    if (!editor || editor.getSnapshot().draft.id !== courseId) {
      editor = createCourseEditorController({ service, course, idGenerator });
      selectedUnitId = course.units[0]?.id ?? null;
      editingWordId = null;
      importModel = null;
    }
    return { builtIn: false, course };
  }

  function renderBuilder(query = {}) {
    const target = container("[data-course-builder-content]");
    if (!enabled) {
      aiImportRuntime.reset();
      renderCourseBuilderView({ container: target, enabled: false });
      return;
    }
    if (!query.course && query.import === "ai") {
      editor = null;
      importModel = null;
      aiImportRuntime.mount(target);
      return;
    }
    aiImportRuntime.reset();
    if (!query.course) {
      editor = null;
      if (query.import === "table" && importModel?.mode !== "new-course") {
        const courseInput = {
          title: "Mein Vokabelkurs",
          sourceLanguage: "",
          targetLanguage: "",
          description: "",
        };
        importModel = {
          mode: "new-course",
          courseInput,
          draft: createNewImportCourse(courseInput, { idGenerator }),
          text: "",
          hasHeaders: true,
          newUnitTitle: "Lernpaket 1",
        };
      }
      renderCourseBuilderView({
        container: target,
        enabled: true,
        snapshot: null,
        startWithTabularImport: query.import === "table",
        importModel,
      });
      if (query.import === "table") Promise.resolve().then(() => appRoot.querySelector("#tabular-import-file")?.focus());
      return;
    }
    const context = ensureEditor(query.course);
    if (!context) {
      const card = documentRoot.createElement("section");
      card.className = "card shell-card";
      const heading = documentRoot.createElement("h2");
      heading.className = "card__title";
      heading.textContent = "Kurs nicht gefunden";
      const text = documentRoot.createElement("p");
      text.className = "card__description";
      text.textContent = "Die angegebene Kurs-ID ist in dieser lokalen Bibliothek nicht vorhanden.";
      card.append(heading, text);
      target.replaceChildren(card);
      return;
    }
    if (context.builtIn) return renderBuiltInEditor(context.course);
    if (query.unit && context.course.units.some((unit) => unit.id === query.unit)) selectedUnitId = query.unit;
    renderCourseBuilderView({ container: target, enabled: true, snapshot: editor.getSnapshot(), selectedUnitId, editingWordId, importModel });
    if (query.import === "table") {
      Promise.resolve().then(() => appRoot.querySelector("#tabular-import-file")?.focus());
    }
  }

  function renderRoute(route, _metrics, context = {}) {
    if (!COURSE_ROUTES.has(route)) return;
    currentRoute = route;
    if (route === "/courses") renderLibrary();
    else renderBuilder(context.query ?? {});
  }

  function rerenderBuilder() {
    if (!editor) return;
    const courseId = editor.getSnapshot().draft.id;
    renderBuilder({ course: courseId, unit: selectedUnitId });
  }

  function rerenderNewImport() {
    renderBuilder({ import: "table" });
  }

  function showErrors(errors) {
    const summary = appRoot.querySelector("[data-editor-errors]");
    if (!summary) return;
    summary.hidden = false;
    summary.replaceChildren();
    const heading = documentRoot.createElement("strong");
    heading.textContent = "Bitte prüfe die Eingaben:";
    const list = documentRoot.createElement("ul");
    errors.forEach((message) => {
      const item = documentRoot.createElement("li");
      item.textContent = message;
      list.append(item);
    });
    summary.append(heading, list);
    summary.focus();
  }

  function saveEditor() {
    const result = editor?.save();
    if (!result?.ok) {
      showErrors(result?.errors ?? ["Die Änderungen konnten nicht gespeichert werden."]);
      return false;
    }
    rerenderBuilder();
    live("Änderungen gespeichert.");
    onCourseUpdated?.(result.course.id);
    return true;
  }

  function markDirtyIndicator() {
    const status = appRoot.querySelector(".editor-section-heading .course-status");
    if (status) status.textContent = "Ungespeicherte Änderungen";
  }

  async function copyImportPrompt() {
    const status = appRoot.querySelector("[data-import-help-status]");
    try {
      const draft = editor?.getSnapshot()?.draft;
      const courseInput = importModel?.mode === "new-course" ? importModel.courseInput : null;
      await copyImportPromptToClipboard({
        title: draft?.title ?? courseInput?.title,
        sourceLanguage: draft?.languages?.source ?? courseInput?.sourceLanguage,
        targetLanguage: draft?.languages?.target ?? courseInput?.targetLanguage,
      });
      if (status) {
        status.textContent = "Import-Prompt wurde kopiert.";
        status.hidden = false;
      }
      live("Import-Prompt wurde kopiert.");
      return true;
    } catch (error) {
      console.error("Import-Prompt konnte nicht kopiert werden.", error);
      if (status) {
        status.textContent = "Der Import-Prompt konnte nicht kopiert werden.";
        status.hidden = false;
      }
      live("Der Import-Prompt konnte nicht kopiert werden.");
      return false;
    }
  }

  async function handleEditorAction(control) {
    const action = control.dataset.editorAction;
    const unitId = control.dataset.unitId;
    const wordId = control.dataset.wordId;
    const snapshot = editor?.getSnapshot();
    const unit = snapshot?.draft.units.find((item) => item.id === unitId);
    if (action === "download-import-template") {
      try {
        const result = downloadTabularImportTemplate();
        live(`CSV-Vorlage heruntergeladen: ${result.filename}`);
      } catch (error) {
        console.error("CSV-Vorlage konnte nicht erstellt werden.", error);
        live("Die CSV-Vorlage konnte nicht erstellt werden.");
      }
      return;
    }
    if (action === "copy-import-prompt") { void copyImportPrompt(); return; }
    if (action === "save") { saveEditor(); return; }
    if (action === "discard") { editor.discard(); editingWordId = null; importModel = null; rerenderBuilder(); live("Änderungen verworfen."); return; }
    if (action === "select-unit") { selectedUnitId = unitId; editingWordId = null; rerenderBuilder(); return; }
    if (action === "move-up" || action === "move-down") editor.moveUnit(unitId, action === "move-up" ? "up" : "down");
    else if (action === "toggle-current") editor.changeUnit(unitId, "current", !unit.current);
    else if (action === "toggle-release") {
      editor.changeUnit(unitId, "released", !unit.released);
      if (unit.current && unit.released) editor.changeUnit(unitId, "current", false);
    } else if (action === "toggle-unit-archive") editor.changeUnit(unitId, "archived", !unit.archived);
    else if (action === "edit-word") { selectedUnitId = unitId; editingWordId = wordId; rerenderBuilder(); return; }
    else if (action === "cancel-word-edit") { editingWordId = null; rerenderBuilder(); return; }
    else if (action === "duplicate-word") editor.duplicateWord(unitId, wordId);
    else if (action === "toggle-word-archive") {
      const word = unit.words.find((item) => item.id === wordId);
      editor.saveWord(unitId, { ...word, archived: !word.archived }, wordId);
    } else if (action === "export") {
      const status = appRoot.querySelector("[data-course-export-status]");
      try { exportCourse(snapshot.draft, status); } catch { /* UI was updated above. */ }
      return;
    } else if (action === "export-scorm") {
      await exportScormPackage(snapshot.draft);
      return;
    }
    rerenderBuilder();
  }

  function openDeleteDialog(courseId, trigger) {
    deleteCourseId = courseId;
    deleteTrigger = trigger;
    const dialog = appRoot.querySelector("[data-course-delete-dialog]");
    if (typeof dialog?.showModal === "function") dialog.showModal();
    else dialog?.setAttribute("open", "");
    dialog?.querySelector("[data-course-action='delete-cancel']")?.focus();
  }

  function closeDeleteDialog(restore = true) {
    const dialog = appRoot.querySelector("[data-course-delete-dialog]");
    if (dialog?.open && typeof dialog.close === "function") dialog.close();
    else dialog?.removeAttribute("open");
    if (restore) deleteTrigger?.focus();
  }

  async function handleCourseAction(control) {
    const action = control.dataset.courseAction;
    const courseId = control.dataset.courseId;
    if (action === "delete") return openDeleteDialog(courseId, control);
    if (action === "focus-import") {
      appRoot.querySelector("#course-json-file")?.focus();
      return;
    }
    if (action === "delete-cancel") return closeDeleteDialog();
    if (action === "delete-confirm") {
      const deleted = deleteCourseId;
      closeDeleteDialog(false);
      service.deleteCourse(deleted);
      deleteCourseId = null;
      renderLibrary();
      live("Kursinhalt gelöscht. Lern- und Motivationsdaten wurden beibehalten.");
      onCourseUpdated?.(deleted);
      return;
    }
    if (action === "activate") {
      await onActivateCourse(courseId);
      return;
    }
    if (action === "duplicate") {
      const copy = service.duplicateCourse(courseId);
      onNavigate(`/course-builder?course=${encodeURIComponent(copy.id)}`);
      return;
    }
    if (action === "archive" || action === "restore") {
      service.archiveCourse(courseId, action === "archive");
      renderLibrary();
      live(action === "archive" ? "Kurs archiviert." : "Kurs wiederhergestellt.");
      onCourseUpdated?.(courseId);
      return;
    }
    if (action === "export") {
      const status = appRoot.querySelector("[data-course-export-status]");
      try { exportCourse(service.getCourse(courseId), status); } catch { /* UI was updated above. */ }
    }
  }

  async function handleSubmit(event) {
    const form = event.target;
    if (!form?.matches?.("form")) return;
    if (!appRoot.contains(form)) return;
    if (form.matches("[data-course-create-form]")) {
      event.preventDefault();
      const validation = validateCourseCreationForm(form);
      showCourseCreationErrors(form, validation.errors);
      if (!validation.valid) return;
      try {
        const course = service.createLocalCourse(readCourseForm(form));
        live("Kurs erstellt. Lege als Nächstes ein Lernpaket an.");
        const importQuery = form.dataset.courseCreateImport === "table"
          ? "&import=table"
          : "";
        onNavigate(`/course-builder?course=${encodeURIComponent(course.id)}${importQuery}`);
      } catch (error) {
        console.error("Kurs konnte nicht erstellt werden.", error);
        const target = form.querySelector("[data-course-form-error]");
        target.hidden = false;
        target.textContent = "Der Kurs konnte nicht gespeichert werden. Bitte prüfe die markierten Angaben.";
        form.elements.namedItem("title")?.focus();
      }
      return;
    }
    if (form.matches("[data-unit-add-form]")) {
      event.preventDefault();
      const title = String(new FormData(form).get("unitTitle") ?? "").trim();
      if (!title) return;
      editor.addUnit(title);
      selectedUnitId = editor.getSnapshot().draft.units.at(-1)?.id ?? selectedUnitId;
      rerenderBuilder();
      return;
    }
    if (form.matches("[data-word-editor-form]")) {
      event.preventDefault();
      editor.saveWord(form.dataset.unitId, readWordForm(form), form.dataset.wordId || null);
      editingWordId = null;
      rerenderBuilder();
      return;
    }
    if (form.matches("[data-tabular-import-form]")) {
      event.preventDefault();
      const data = new FormData(form);
      const file = data.get("importFile");
      let text = String(data.get("importText") ?? "");
      try {
        if (file instanceof File && file.size > 0) {
          if (file.size > MAX_IMPORT_BYTES) throw new Error("Die Datei ist größer als 2 MB.");
          if (!/\.(csv|tsv|txt)$/i.test(file.name)) throw new Error("Unterstützt werden nur CSV-, TSV- und TXT-Dateien.");
          text = await file.text();
        }
        const hasHeaders = data.get("hasHeaders") === "on";
        const parsed = parseTabularText(text, { hasHeaders });
        importModel = {
          ...(importModel?.mode === "new-course" ? importModel : {}),
          text,
          hasHeaders,
          parsed,
          preview: null,
          mapping: suggestColumnMapping(parsed.headers),
          defaultUnitId: selectedUnitId,
          error: parsed.errors[0] ?? null,
        };
      } catch (error) {
        importModel = {
          ...(importModel?.mode === "new-course" ? importModel : {}),
          text,
          hasHeaders: data.get("hasHeaders") === "on",
          parsed: null,
          preview: null,
          error: error.message,
        };
      }
      if (importModel.mode === "new-course") rerenderNewImport();
      else rerenderBuilder();
      appRoot.querySelector(importModel.error ? "[data-import-error]" : "[data-import-mapping-form]")?.focus?.();
      return;
    }
    if (form.matches("[data-import-mapping-form]")) {
      event.preventDefault();
      const data = new FormData(form);
      importModel.mapping = importModel.parsed.headers.map((_, index) => data.get(`mapping-${index}`));
      importModel.defaultUnitId = data.get("defaultUnitId") || selectedUnitId;
      importModel.newUnitTitle = String(data.get("newUnitTitle") ?? "").trim() || (importModel.mode === "new-course" ? "Lernpaket 1" : "");
      const importCourse = importModel.mode === "new-course" ? importModel.draft : editor.getSnapshot().draft;
      importModel.preview = createImportPreview({ course: importCourse, parsed: importModel.parsed, mapping: importModel.mapping, defaultUnitId: importModel.defaultUnitId, newUnitTitle: importModel.newUnitTitle, idGenerator });
      importModel.error = importModel.preview.errors[0] ?? null;
      if (importModel.mode === "new-course") rerenderNewImport();
      else rerenderBuilder();
      appRoot.querySelector("#import-preview-title, [data-import-error]")?.focus?.();
      return;
    }
    if (form.matches("[data-import-commit-form]")) {
      event.preventDefault();
      if (importInProgress) return;
      importInProgress = true;
      const button = form.querySelector("button[type='submit']");
      if (button) {
        button.disabled = true;
        button.textContent = "Kurs wird gespeichert …";
      }
      try {
        const strategy = new FormData(form).get("duplicateStrategy");
        if (importModel.mode === "new-course") {
          const blocker = validateNewImportCourseInput(importModel.courseInput);
          if (blocker) throw new Error(blocker);
          const result = commitNewCourseImport({ service, preview: importModel.preview, strategy, idGenerator });
          const saved = result.course;
          importModel = {
            mode: "new-course",
            success: {
              courseId: saved.id,
              title: saved.title,
              wordCount: saved.units.reduce((sum, unit) => sum + unit.words.length, 0),
              unitCount: saved.units.length,
            },
          };
          rerenderNewImport();
          appRoot.querySelector("#course-import-success-title")?.focus();
          live(`Kurs „${saved.title}“ gespeichert.`);
          onCourseUpdated?.(saved.id);
        } else {
          const result = commitImport({ service, preview: importModel.preview, strategy, idGenerator });
          const saved = result.course;
          editor.replaceDraft(saved, false);
          importModel = null;
          rerenderBuilder();
          live(`${result.imported} Wörter wurden übernommen. ${result.skipped} Duplikate wurden übersprungen.`);
          onCourseUpdated?.(saved.id);
        }
      } catch (error) {
        console.error("Tabellarischer Import fehlgeschlagen.", error);
        importModel.error = error.message || "Der Import konnte nicht gespeichert werden. Der bisherige Kurs blieb unverändert.";
        importModel.saving = false;
        if (importModel.mode === "new-course") rerenderNewImport();
        else rerenderBuilder();
      } finally {
        importInProgress = false;
      }
      return;
    }
    if (form.matches("[data-course-json-import]")) {
      event.preventDefault();
      if (jsonImportInProgress) return;
      const data = new FormData(form);
      const input = form.querySelector("#course-json-file");
      const files = Array.from(input?.files ?? []).filter((file) => file.size > 0);
      if (files.length === 0) {
        setJsonImportError("Keine Datei ausgewählt.");
        input?.focus();
        return;
      }
      const oversized = files.find((file) => file.size > MAX_IMPORT_BYTES);
      if (oversized) {
        const message = `Die JSON-Datei „${oversized.name}“ ist größer als 2 MB.`;
        setJsonImportError(message);
        live(message);
        return;
      }
      const mode = data.get("course-json-mode") === JSON_COURSE_IMPORT_MODES.RESTORE
        ? JSON_COURSE_IMPORT_MODES.RESTORE
        : JSON_COURSE_IMPORT_MODES.NEW;
      if (mode === JSON_COURSE_IMPORT_MODES.RESTORE && files.length !== 1) {
        setJsonImportError("Wähle für die Wiederherstellung genau eine EduTools-Backup-Datei aus.");
        input?.focus();
        return;
      }
      setJsonImportError();
      jsonImportInProgress = true;
      const submitButton = form.querySelector("[data-course-json-import-submit]");
      if (submitButton) submitButton.disabled = true;
      try {
        let course;
        if (mode === JSON_COURSE_IMPORT_MODES.RESTORE) {
          const conflict = data.get("course-json-conflict");
          if (conflict === "replace" && !globalThis.confirm("Vorhandenen eigenen Kurs ersetzen? Bestehende Wort-IDs behalten ihre Lernstände; entfernte IDs können verwaiste Lernstände hinterlassen.")) return;
          course = importJsonCourse({ service, text: await files[0].text(), conflict, idGenerator });
        } else {
          const inputs = await Promise.all(files.map(async (file) => ({
            name: file.name,
            type: file.type,
            size: file.size,
            text: await file.text(),
          })));
          const result = importJsonCoursesAsNew({ service, files: inputs, idGenerator });
          course = result.course;
        }
        renderLibrary();
        live(mode === JSON_COURSE_IMPORT_MODES.RESTORE
          ? `Backup „${course.title}“ wurde wiederhergestellt.`
          : `Kurs „${course.title}“ wurde mit neuen technischen IDs importiert.`);
      } catch (error) {
        console.error("JSON-Kursimport fehlgeschlagen.", error);
        setJsonImportError(error.message);
        live(error.message);
      } finally {
        jsonImportInProgress = false;
        if (submitButton?.isConnected) submitButton.disabled = false;
      }
    }
  }

  function handleInput(event) {
    if (event.target?.matches?.("[name='course-json-mode']")) {
      updateJsonImportMode(event.target.form);
      return;
    }
    const newImportField = event.target?.dataset?.newImportField;
    if (newImportField && importModel?.mode === "new-course") {
      importModel.courseInput[newImportField] = event.target.value;
      updateNewImportCourse(importModel.draft, importModel.courseInput);
      updateNewImportCourse(importModel.preview?.sourceCourse, importModel.courseInput);
      event.target.setAttribute?.("aria-invalid", "false");
      updateNewImportSaveAvailability();
      return;
    }
    if (
      event.target?.form?.matches?.("[data-course-create-form]")
      && CREATE_FIELD_ORDER.includes(event.target.name)
    ) {
      const message = event.target.form.querySelector(`[data-course-field-error='${event.target.name}']`);
      if (message) {
        message.hidden = true;
        message.textContent = "";
        event.target.setAttribute("aria-invalid", "false");
      }
    }
    const statusId = event.target?.dataset?.fileNameStatus;
    if (statusId) {
      const selectedFiles = Array.from(event.target.files ?? []);
      const status = documentRoot.getElementById(statusId);
      if (status) status.textContent = selectedFiles.length > 1
        ? `${selectedFiles.length} Dateien ausgewählt: ${selectedFiles.map((file) => file.name).join(", ")}`
        : selectedFiles[0]?.name || "Keine Datei ausgewählt.";
      if (selectedFiles.length > 0) setJsonImportError();
      return;
    }
    const field = event.target?.dataset?.courseField;
    if (field && editor) {
      const type = event.target.dataset.valueType;
      const value = type === "boolean" ? event.target.checked : type === "number" ? Number(event.target.value) : event.target.value;
      editor.change(field, value);
      markDirtyIndicator();
      return;
    }
    const languageRole = event.target?.dataset?.courseLanguageRole;
    if (languageRole && editor) {
      const language = createCourseLanguage(event.target.value);
      if (!language) return;
      editor.change(`languages.${languageRole}`, language);
      updateLanguageSummary(appRoot, languageRole, language.code);
      markDirtyIndicator();
      return;
    }
    if (event.target?.matches?.("[name='sourceLanguage'], [name='targetLanguage']")) {
      const role = event.target.name === "sourceLanguage" ? "source" : "target";
      updateLanguageSummary(event.target.form, role, event.target.value);
      const message = event.target.form?.querySelector(`[data-course-field-error='${event.target.name}']`);
      if (message) {
        message.hidden = true;
        message.textContent = "";
        event.target.setAttribute("aria-invalid", "false");
      }
      return;
    }
    const unitField = event.target?.dataset?.unitField;
    if (unitField && editor) {
      editor.changeUnit(event.target.dataset.unitId, unitField, event.target.value);
      markDirtyIndicator();
    }
  }

  function handleClick(event) {
    const newImportControl = event.target?.closest?.("[data-new-import-action]");
    if (newImportControl?.dataset.newImportAction === "restart") {
      importModel = null;
      rerenderNewImport();
      return;
    }
    const editorControl = event.target?.closest?.("[data-editor-action]");
    if (editorControl && appRoot.contains(editorControl)) {
      handleEditorAction(editorControl).catch((error) => {
        console.error("Kursaktion ist fehlgeschlagen.", error);
        live("Die Kursaktion konnte nicht abgeschlossen werden.");
      });
      return;
    }
    const courseControl = event.target?.closest?.("[data-course-action]");
    if (courseControl && appRoot.contains(courseControl)) handleCourseAction(courseControl).catch((error) => { console.error(error); live(error.message); });
    const dialogControl = event.target?.closest?.("[data-editor-dialog-action]");
    if (dialogControl) {
      const action = dialogControl.dataset.editorDialogAction;
      if (action === "continue") cancelExit();
      else if (action === "discard-leave") { editor.discard(); confirmExit(); }
      else if (action === "save-leave" && saveEditor()) confirmExit();
    }
  }

  function openExitDialog(targetRoute) {
    pendingRoute = targetRoute;
    const dialog = appRoot.querySelector("[data-editor-exit-dialog]");
    if (typeof dialog?.showModal === "function") dialog.showModal();
    else dialog?.setAttribute("open", "");
    dialog?.querySelector("[data-editor-dialog-action='continue']")?.focus();
  }

  function closeExitDialog() {
    const dialog = appRoot.querySelector("[data-editor-exit-dialog]");
    if (dialog?.open && typeof dialog.close === "function") dialog.close();
    else dialog?.removeAttribute("open");
  }

  function cancelExit() {
    pendingRoute = null;
    closeExitDialog();
    appRoot.querySelector("[data-course-field='title']")?.focus();
  }

  function confirmExit() {
    const route = pendingRoute ?? "/courses";
    pendingRoute = null;
    allowedRoute = route;
    closeExitDialog();
    onNavigate(route);
  }

  function interceptRouteChange(nextRoute) {
    if (allowedRoute === nextRoute) { allowedRoute = null; return false; }
    if (currentRoute !== "/course-builder" || nextRoute === "/course-builder" || !editor?.getSnapshot().dirty) return false;
    const courseId = editor.getSnapshot().draft.id;
    onNavigate(`/course-builder?course=${encodeURIComponent(courseId)}`, { replace: true });
    openExitDialog(nextRoute);
    return true;
  }

  function leaveRoute(nextRoute) {
    if (!COURSE_ROUTES.has(nextRoute)) currentRoute = null;
  }

  function handleCancel(event) {
    if (event.target?.matches?.("[data-editor-exit-dialog]")) { event.preventDefault(); cancelExit(); }
    if (event.target?.matches?.("[data-course-delete-dialog]")) { event.preventDefault(); closeDeleteDialog(); }
  }

  function handleInvalid(event) {
    if (event.target?.matches?.("#course-json-file")) {
      setJsonImportError("Wähle zuerst eine JSON-Kursdatei aus.");
    }
  }

  function destroy() {
    aiImportRuntime.destroy();
    appRoot.removeEventListener("submit", handleSubmit);
    appRoot.removeEventListener("input", handleInput);
    appRoot.removeEventListener("change", handleInput);
    appRoot.removeEventListener("click", handleClick);
    appRoot.removeEventListener("cancel", handleCancel, true);
    appRoot.removeEventListener("invalid", handleInvalid, true);
  }

  appRoot.addEventListener("submit", handleSubmit);
  appRoot.addEventListener("input", handleInput);
  appRoot.addEventListener("change", handleInput);
  appRoot.addEventListener("click", handleClick);
  appRoot.addEventListener("cancel", handleCancel, true);
  appRoot.addEventListener("invalid", handleInvalid, true);

  return Object.freeze({ destroy, interceptRouteChange, leaveRoute, renderRoute });
}
