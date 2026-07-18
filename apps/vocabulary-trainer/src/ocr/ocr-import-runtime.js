import { createImageWorkspace } from "./image-preprocessor.js";
import { isHeicImageFile } from "../author/image-import/heic-decoder.js";
import { createLocalOcrAdapter } from "./ocr-adapter.js";
import { resolveCourseOcrModels } from "./ocr-language-registry.js";
import { createOcrPageMappings } from "./ocr-column-mapping.js";
import { structureOcrPage } from "./ocr-structure.js";
import {
  mergeQuickImportRegionResults,
  normalizeQuickImportBoundaries,
  QUICK_IMPORT_DEFAULT_BOUNDARIES,
} from "./ocr-quick-import.js";
import {
  addTagsToSelectedOcrRows,
  applyOcrRowReassignment,
  annotateOcrDuplicates,
  createOcrPreviewRows,
  createOcrPreviewState,
  deleteOcrPreviewRow,
  deleteSelectedOcrRows,
  duplicateOcrPreviewRow,
  mergeOcrPreviewRows,
  moveOcrPreviewRow,
  resetOcrPreview,
  selectOcrPreviewRow,
  setOcrPreviewFilter,
  setSelectedOcrRowsIncluded,
  splitOcrPreviewRow,
  updateOcrPreviewRow,
  undoOcrRowReassignment,
} from "./ocr-preview-state.js";
import { commitOcrImport } from "./ocr-import-transaction.js";
import { createOcrImportDialog, renderOcrImportView } from "./ocr-import-view.js";

function defaultModel() {
  return {
    step: "images",
    pages: [],
    course: null,
    selectedModels: [],
    targetUnitId: null,
    newUnitTitle: "",
    newUnitReleased: false,
    progress: null,
    imageProgress: null,
    running: false,
    structuredPages: [],
    importMode: "quick",
    quickBoundaries: {},
    columnStatus: "",
    ocrResults: [],
    boundaryDrafts: {},
    mappings: {},
    headingSuggestion: "",
    previewState: null,
    result: null,
  };
}

function userFacingError(error, fallback) {
  const message = typeof error?.message === "string" ? error.message.trim() : "";
  return /\b(?:OCR|Texterkennung|Recognition|Engine|Worker|Bounding Box|Confidence|Token)\b/iu.test(message)
    ? fallback
    : message || fallback;
}

export function createOcrImportRuntime(options) {
  const {
    appRoot,
    getCourse,
    getSelectedUnitId,
    service,
    idGenerator,
    onCommitted,
    onFinished,
    onExportCourse,
  } = options;
  const documentRoot = appRoot.ownerDocument;
  const workspaceFactory = options.workspaceFactory ?? createImageWorkspace;
  const adapterFactory = options.adapterFactory ?? createLocalOcrAdapter;
  const confirmDiscardPrompt = options.confirm ?? ((message) => globalThis.confirm(message));
  const dialog = createOcrImportDialog(documentRoot);
  appRoot.append(dialog);

  let workspace = null;
  let adapter = adapterFactory({ logger: console });
  let model = defaultModel();
  let abortController = null;
  let imageAbortController = null;
  let rowCropUrl = null;
  let committing = false;
  let destroyed = false;
  let completionNotified = false;

  function makeWorkspace() {
    return workspaceFactory({ document: documentRoot, idGenerator, heicDecoder: options.heicDecoder });
  }

  function errorElement() {
    return dialog.querySelector("[data-ocr-error]");
  }

  function setError(message = "") {
    const element = errorElement();
    if (!element) return;
    element.textContent = message;
    element.hidden = !message;
    if (message) element.focus();
  }

  function clearError() {
    setError();
  }

  function render(focus = true) {
    if (destroyed) return;
    model.pages = workspace?.getPages() ?? [];
    renderOcrImportView(dialog, model);
    clearError();
    if (focus) dialog.querySelector("[data-ocr-content] h3")?.focus();
  }

  function updateProgress(progress) {
    const logicalPage = model.importMode === "quick" ? Math.ceil(progress.page / 2) : progress.page;
    const logicalPages = model.importMode === "quick" ? Math.ceil(progress.pages / 2) : progress.pages;
    const pageText = Number.isInteger(logicalPage) && Number.isInteger(logicalPages)
      ? `Seite ${logicalPage} von ${logicalPages} wird analysiert.`
      : "Buchseiten werden lokal analysiert.";
    model.progress = { ...progress, status: pageText };
    const status = dialog.querySelector("[data-ocr-progress-status] p");
    const bar = dialog.querySelector("[data-ocr-progress]");
    if (status && status.textContent !== pageText) status.textContent = pageText;
    if (bar) {
      if (Number.isFinite(progress.progress)) bar.value = progress.progress;
      else bar.removeAttribute("value");
    }
  }

  function updateImageProgress(progress) {
    model.imageProgress = { ...progress };
    const status = dialog.querySelector("[data-ocr-image-progress-status] p");
    const bar = dialog.querySelector("[data-ocr-image-progress]");
    if (status) status.textContent = progress.status;
    if (bar) {
      bar.max = progress.total;
      bar.value = progress.current;
    }
  }

  function revokeRowCrop() {
    if (rowCropUrl) workspace?.revokeTransientUrl(rowCropUrl);
    rowCropUrl = null;
  }

  async function clearSession() {
    imageAbortController?.abort();
    imageAbortController = null;
    abortController?.abort();
    abortController = null;
    await adapter.abort();
    revokeRowCrop();
    workspace?.releaseAll();
    workspace = makeWorkspace();
    model = defaultModel();
  }

  async function open() {
    if (destroyed) throw new Error("Book Capture wurde bereits beendet.");
    if (dialog.open) {
      dialog.querySelector("#ocr-import-title")?.focus();
      return;
    }
    await clearSession();
    const course = getCourse();
    const languageModels = resolveCourseOcrModels(course);
    model = {
      ...defaultModel(),
      course,
      targetUnitId: getSelectedUnitId?.() ?? course.units.find((unit) => !unit.archived)?.id ?? null,
      selectedModels: [...languageModels.suggested],
    };
    completionNotified = false;
    render(false);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.querySelector("#ocr-import-title")?.focus();
  }

  function hasDraft() {
    if (model.result) return false;
    return Boolean(workspace?.getPages().length || model.previewState || model.running);
  }

  async function close({ force = false, destination = "builder" } = {}) {
    if (
      !force
      && hasDraft()
      && !confirmDiscardPrompt("Book Capture abbrechen? Nicht übernommene Buchseiten und Korrekturen gehen verloren.")
    ) return false;
    const completedResult = model.result;
    await clearSession();
    if (dialog.open && typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    if (completedResult && !completionNotified) {
      completionNotified = true;
      onFinished?.(completedResult, destination);
    }
    return true;
  }

  function validateAnalysisContext() {
    if (model.selectedModels.length === 0) {
      throw new TypeError("Für die Kurssprachen ist noch keine lokale Analyse verfügbar.");
    }
    if (!model.targetUnitId && !model.newUnitTitle.trim()) {
      throw new TypeError("Wähle eine Ziel-Lernpaket oder gib einen Titel für ein neues Lernpaket ein.");
    }
  }

  function createPreview() {
    let rows = createOcrPreviewRows(model.structuredPages, model.mappings);
    rows = annotateOcrDuplicates(rows, model.course, model.targetUnitId);
    const sections = model.structuredPages.flatMap((page) => page.sections ?? []);
    const unassigned = model.structuredPages.flatMap((page) => page.unassigned ?? []);
    const diagnostics = model.structuredPages.reduce((sum, page) => {
      Object.entries(page.diagnostics ?? {}).forEach(([key, value]) => { sum[key] = (sum[key] ?? 0) + Number(value || 0); });
      return sum;
    }, {});
    model.previewState = createOcrPreviewState(rows, { sections, unassigned, diagnostics });
    model.step = "preview";
  }

  function ensureQuickBoundaries(pages = workspace.getPages()) {
    const shared = Object.values(model.quickBoundaries)[0] ?? QUICK_IMPORT_DEFAULT_BOUNDARIES;
    const next = { ...model.quickBoundaries };
    pages.forEach((page) => { if (!next[page.id]) next[page.id] = [...normalizeQuickImportBoundaries(shared)]; });
    model.quickBoundaries = next;
  }

  function setBoundaryDraft(page) {
    model.boundaryDrafts[page.pageId] = page.boundaries.map((value) => Number(((value / page.width) * 100).toFixed(1)));
  }

  function restructurePage(pageId, reset = false) {
    const rawPage = model.ocrResults.find((page) => page.pageId === pageId);
    if (!rawPage) throw new Error("Die OCR-Ausgangsdaten dieser Seite wurden nicht gefunden.");
    if (!confirmDiscardPrompt("Seite erneut strukturieren? Manuelle Korrekturen im Entwurf werden zurückgesetzt.")) return false;
    const percentages = reset ? null : model.boundaryDrafts[pageId];
    const boundaries = percentages?.map((value) => Number(value) / 100).filter((value) => value > 0 && value < 1);
    const pageNumber = model.structuredPages.find((page) => page.pageId === pageId)?.pageNumber ?? 1;
    const structured = structureOcrPage(rawPage, { pageNumber, ...(boundaries?.length ? { boundaries } : {}) });
    model.structuredPages = model.structuredPages.map((page) => page.pageId === pageId ? structured : page);
    setBoundaryDraft(structured);
    model.mappings = createOcrPageMappings(model.structuredPages);
    createPreview();
    return true;
  }

  async function startAnalysis(pageId = null) {
    clearError();
    let prepared = [];
    try {
      validateAnalysisContext();
      const pages = workspace.getPages().filter((page) => !pageId || page.id === pageId);
      if (pages.length === 0) throw new TypeError("Die ausgewählte Buchseite wurde nicht gefunden.");
      ensureQuickBoundaries(pages);
      prepared = model.importMode === "quick"
        ? pages.flatMap((page) => workspace.prepareQuickImportRegions(page.id, model.quickBoundaries[page.id]))
        : pages.map((page) => workspace.prepare(page.id));
      model.running = true;
      model.step = "analyzing";
      model.progress = { status: "Lokale Analyse wird vorbereitet.", progress: null };
      render(false);
      abortController = new AbortController();
      const recognizedResults = await adapter.recognizePages(prepared, {
        models: model.selectedModels,
        signal: abortController.signal,
        onProgress: updateProgress,
      });
      const results = model.importMode === "quick"
        ? mergeQuickImportRegionResults(recognizedResults)
        : recognizedResults;
      const pageOrder = workspace.getPages().map((page) => page.id);
      const structured = results.map((page) => structureOcrPage(page, {
        pageNumber: pageOrder.indexOf(page.pageId) + 1,
        ...(model.importMode === "quick" ? {
          mode: "quick",
          boundaries: [page.quickBoundaries[0]],
          analysisLimit: page.quickBoundaries[1],
        } : {}),
      }));
      if (structured.every((page) => page.rows.length === 0)) {
        throw new TypeError("In den Buchseiten wurden keine Vokabelzeilen erkannt.");
      }
      if (pageId) {
        const rawReplacements = new Map(results.map((page) => [page.pageId, page]));
        model.ocrResults = workspace.getPages().flatMap((page) => {
          const replacement = rawReplacements.get(page.id);
          if (replacement) return [replacement];
          const existing = model.ocrResults.find((item) => item.pageId === page.id);
          return existing ? [existing] : [];
        });
        const replacements = new Map(structured.map((page) => [page.pageId, page]));
        model.structuredPages = workspace.getPages().flatMap((page) => {
          const replacement = replacements.get(page.id);
          if (replacement) return [replacement];
          const existing = model.structuredPages.find((item) => item.pageId === page.id);
          return existing ? [existing] : [];
        });
      } else {
        model.ocrResults = results;
        model.structuredPages = structured;
      }
      model.structuredPages.forEach(setBoundaryDraft);
      model.mappings = createOcrPageMappings(model.structuredPages);
      model.headingSuggestion = model.structuredPages
        .map((page) => page.headingSuggestion)
        .find(Boolean) ?? "";
      model.running = false;
      createPreview();
      render();
    } catch (error) {
      model.running = false;
      model.step = "images";
      model.progress = error?.name === "AbortError"
        ? { status: "Analyse wurde abgebrochen.", progress: null }
        : { status: "Analyse konnte nicht abgeschlossen werden.", progress: null };
      render(false);
      if (error?.name !== "AbortError") {
        console.error("Lokale Buchseitenanalyse fehlgeschlagen.", error);
        setError(userFacingError(error, "Die Buchseiten konnten nicht vollständig analysiert werden. Prüfe die Bilder und versuche es erneut."));
      } else {
        dialog.querySelector("[data-ocr-action='start-analysis']")?.focus();
      }
    } finally {
      abortController = null;
      prepared.forEach((page) => page.release());
    }
  }

  async function addFiles(files) {
    clearError();
    const selectedFiles = [...(files ?? [])];
    const includesHeic = selectedFiles.some(isHeicImageFile);
    imageAbortController?.abort();
    imageAbortController = new AbortController();
    try {
      if (includesHeic) {
        model.running = true;
        model.step = "preparing";
        model.imageProgress = {
          current: null,
          total: selectedFiles.length,
          status: selectedFiles.length === 1
            ? "iPhone-Foto wird vorbereitet."
            : `Foto 1 von ${selectedFiles.length} wird vorbereitet.`,
        };
        render(false);
      }
      const result = await workspace.addFiles(selectedFiles, {
        signal: imageAbortController.signal,
        onProgress: updateImageProgress,
      });
      model.running = false;
      model.step = "images";
      const currentPages = workspace.getPages();
      const firstNewPage = result.added[0];
      const sharedSuggestion = Object.values(model.quickBoundaries)[0]
        ?? (firstNewPage ? workspace.suggestQuickImportBoundaries(firstNewPage.id) : QUICK_IMPORT_DEFAULT_BOUNDARIES);
      model.quickBoundaries = Object.fromEntries(currentPages.map((page) => [
        page.id,
        [...normalizeQuickImportBoundaries(model.quickBoundaries[page.id] ?? sharedSuggestion)],
      ]));
      render(false);
      if (result.errors.length > 0) {
        const message = result.errors.length === 1
          ? result.errors[0].message
          : result.errors.map((entry) => `${entry.name}: ${entry.message}`).join(" ");
        setError(message);
        return;
      }
      if (result.added.length === 0 && result.skipped.length > 0) {
        setError("Dieses Foto wurde bereits hinzugefügt.");
        return;
      }
      model.columnStatus = "Prüfe die vorgeschlagenen Spalten und starte anschließend die Analyse.";
      render(false);
    } catch (error) {
      model.running = false;
      model.step = "images";
      render(false);
      if (error?.name === "AbortError") {
        setError("Die Vorbereitung wurde abgebrochen. Bereits vorbereitete Fotos bleiben erhalten.");
        dialog.querySelector("[data-ocr-files]")?.focus();
      } else {
        console.error("Lokale Buchseite konnte nicht vorbereitet werden.", error);
        setError(userFacingError(error, "Die Buchseite konnte nicht vorbereitet werden. Prüfe Dateiformat und Bildgröße."));
      }
    } finally {
      imageAbortController = null;
    }
  }

  async function showRowCrop(rowId) {
    clearError();
    try {
      const row = model.previewState.rows.find((item) => item.id === rowId);
      if (!row) throw new Error("Die Vokabel wurde im Entwurf nicht gefunden.");
      revokeRowCrop();
      rowCropUrl = await workspace.createRowCropUrl(row.pageId, row.bbox);
      const figure = dialog.querySelector("[data-ocr-row-crop]");
      const image = figure?.querySelector("[data-ocr-row-crop-image]");
      const caption = figure?.querySelector("[data-ocr-row-crop-caption]");
      if (figure && image && caption) {
        image.src = rowCropUrl;
        image.alt = `Lokaler Bildausschnitt für „${row.source || "noch leer"}“ auf Seite ${row.pageNumber}.`;
        caption.textContent = `Bildausschnitt zu Seite ${row.pageNumber}, Zeile ${row.lineNumber}.`;
        figure.hidden = false;
        figure.scrollIntoView?.({ block: "nearest" });
        dialog.querySelector("[data-ocr-action='hide-crop']")?.focus();
      }
    } catch (error) {
      console.error("Bildausschnitt konnte nicht erzeugt werden.", error);
      setError(userFacingError(error, "Der Bildausschnitt konnte nicht angezeigt werden."));
    }
  }

  function hideRowCrop() {
    revokeRowCrop();
    const figure = dialog.querySelector("[data-ocr-row-crop]");
    if (figure) figure.hidden = true;
  }

  async function commit() {
    if (committing) return;
    committing = true;
    clearError();
    const trigger = dialog.querySelector("[data-ocr-action='commit']");
    if (trigger) trigger.disabled = true;
    try {
      model.previewState = {
        ...model.previewState,
        rows: annotateOcrDuplicates(model.previewState.rows, getCourse(), model.targetUnitId),
      };
      const result = commitOcrImport({
        course: getCourse(),
        previewState: model.previewState,
        service,
        targetUnitId: model.targetUnitId,
        newUnitTitle: model.newUnitTitle,
        newUnitReleased: model.newUnitReleased,
        idGenerator,
      });
      model.result = result;
      model.course = result.course;
      model.step = "success";
      workspace.releaseAll();
      revokeRowCrop();
      onCommitted?.(result);
      render();
    } catch (error) {
      console.error("Book-Capture-Import konnte nicht transaktional übernommen werden.", error);
      setError(userFacingError(
        { message: error.issues?.join(" ") ?? error.message },
        "Die Vokabeln konnten nicht übernommen werden. Prüfe die markierten Stellen und versuche es erneut.",
      ));
      if (trigger) trigger.disabled = false;
    } finally {
      committing = false;
    }
  }

  async function handleClick(event) {
    const control = event.target?.closest?.("[data-ocr-action]");
    if (!control || !dialog.contains(control)) return;
    event.preventDefault();
    const action = control.dataset.ocrAction;
    const pageId = control.dataset.pageId;
    const rowId = control.dataset.rowId;
    try {
      if (action === "close") { await close(); return; }
      if (action === "to-images") model.step = "images";
      else if (action === "to-preview") model.step = "preview";
      else if (action === "to-summary") model.step = "summary";
      else if (action === "page-up" || action === "page-down") workspace.move(pageId, action === "page-up" ? "up" : "down");
      else if (action === "remove-page") workspace.releasePage(pageId);
      else if (action === "rotate") workspace.rotate(pageId, 90);
      else if (action === "reset-page") workspace.reset(pageId);
      else if (action === "reset-quick-columns") {
        model.quickBoundaries = { ...model.quickBoundaries, [pageId]: [...workspace.suggestQuickImportBoundaries(pageId)] };
        model.columnStatus = "Die automatische Spaltenaufteilung wurde wiederhergestellt.";
      }
      else if (action === "apply-quick-columns-all") {
        const values = normalizeQuickImportBoundaries(model.quickBoundaries[pageId]);
        model.quickBoundaries = Object.fromEntries(workspace.getPages().map((page) => [page.id, [...values]]));
        model.columnStatus = "Die Spaltenaufteilung gilt jetzt für alle Seiten.";
      }
      else if (action === "confirm-quick-columns") model.columnStatus = "Spaltenaufteilung übernommen. Die Seiten können analysiert werden.";
      else if (action === "start-analysis") { await startAnalysis(); return; }
      else if (action === "reanalyze-page") { await startAnalysis(pageId); return; }
      else if (action === "restructure-page") { if (!restructurePage(pageId, false)) return; }
      else if (action === "reset-structure") { if (!restructurePage(pageId, true)) return; }
      else if (action === "cancel-image-preparation") { imageAbortController?.abort(); return; }
      else if (action === "cancel-ocr") { abortController?.abort(); await adapter.abort(); return; }
      else if (action === "refresh-preview") {
        if (!confirmDiscardPrompt("Spaltenzuordnung übernehmen? Manuelle Korrekturen im Entwurf werden zurückgesetzt.")) return;
        createPreview();
      } else if (action === "delete-row") model.previewState = deleteOcrPreviewRow(model.previewState, rowId);
      else if (action === "auto-reassign-row") model.previewState = applyOcrRowReassignment(model.previewState, rowId);
      else if (action === "undo-reassign-row") model.previewState = undoOcrRowReassignment(model.previewState, rowId);
      else if (action === "duplicate-row") model.previewState = duplicateOcrPreviewRow(model.previewState, rowId, idGenerator);
      else if (action === "row-up" || action === "row-down") model.previewState = moveOcrPreviewRow(model.previewState, rowId, action === "row-up" ? "up" : "down");
      else if (action === "reset-preview") model.previewState = resetOcrPreview(model.previewState);
      else if (action === "bulk-include") model.previewState = setSelectedOcrRowsIncluded(model.previewState, true);
      else if (action === "bulk-exclude") model.previewState = setSelectedOcrRowsIncluded(model.previewState, false);
      else if (action === "bulk-add-tags") {
        const tags = dialog.querySelector("[data-ocr-bulk-tags]")?.value ?? "";
        model.previewState = addTagsToSelectedOcrRows(model.previewState, tags);
      } else if (action === "bulk-remove") {
        if (!confirmDiscardPrompt("Ausgewählte Vokabeln aus diesem Entwurf entfernen?")) return;
        model.previewState = deleteSelectedOcrRows(model.previewState);
      } else if (action === "merge-rows") {
        const mergeField = dialog.querySelector("[data-ocr-merge-field]")?.value ?? "source";
        model.previewState = mergeOcrPreviewRows(model.previewState, model.previewState.selectedIds, mergeField);
      } else if (action === "split-row") {
        const escaped = globalThis.CSS?.escape?.(rowId) ?? rowId;
        const position = Number(dialog.querySelector(`[data-ocr-split-position='${escaped}']`)?.value);
        model.previewState = splitOcrPreviewRow(model.previewState, rowId, position, idGenerator);
      } else if (action === "show-crop") { await showRowCrop(rowId); return; }
      else if (action === "hide-crop") { hideRowCrop(); return; }
      else if (action === "commit") { await commit(); return; }
      else if (action === "learn") { await close({ force: true, destination: "learn" }); return; }
      else if (action === "finish") { await close({ force: true, destination: "builder" }); return; }
      else if (action === "export-course") {
        if (typeof onExportCourse !== "function" || !model.result?.course) {
          throw new Error("Die Kursdatei ist noch nicht verfügbar.");
        }
        const result = onExportCourse(model.result.course);
        model.exportStatus = `Die Kursdatei wurde erstellt. Dateiname: ${result.filename}`;
      }
      else if (action === "restart") {
        const course = model.course;
        const targetUnitId = model.result?.targetUnitId ?? getSelectedUnitId?.() ?? null;
        await clearSession();
        const languageModels = resolveCourseOcrModels(course);
        model = {
          ...defaultModel(),
          course,
          selectedModels: [...languageModels.suggested],
          targetUnitId,
        };
        completionNotified = false;
      }
      render();
    } catch (error) {
      console.error("Book-Capture-Aktion fehlgeschlagen.", error);
      setError(userFacingError(error, "Diese Book-Capture-Aktion konnte nicht abgeschlossen werden."));
    }
  }

  function handleInput(event) {
    const target = event.target;
    if (!dialog.contains(target)) return;
    try {
      if (target.matches("[data-ocr-crop]")) {
        const page = workspace.getPages().find((item) => item.id === target.dataset.pageId);
        workspace.setCrop(target.dataset.pageId, { ...page.crop, [target.dataset.ocrCrop]: target.value });
      } else if (target.matches("[data-ocr-quick-boundary]")) {
        const pageId = target.dataset.pageId;
        const index = Number(target.dataset.ocrQuickBoundary);
        const values = [...(model.quickBoundaries[pageId] ?? QUICK_IMPORT_DEFAULT_BOUNDARIES)];
        values[index] = Number(target.value);
        const normalized = normalizeQuickImportBoundaries(values);
        model.quickBoundaries = { ...model.quickBoundaries, [pageId]: [...normalized] };
        const card = target.closest?.(".ocr-page-card");
        const preview = card?.querySelector?.("[data-ocr-column-preview]");
        preview?.style?.setProperty("--quick-source-boundary", `${normalized[0]}%`);
        preview?.style?.setProperty("--quick-ignore-boundary", `${normalized[1]}%`);
        card?.querySelectorAll?.("[data-ocr-quick-boundary]").forEach((control) => {
          control.value = normalized[Number(control.dataset.ocrQuickBoundary)];
        });
      } else if (target.matches("[data-ocr-mapping]")) {
        const pageId = target.dataset.pageId;
        const mapping = [...model.mappings[pageId]];
        mapping[Number(target.dataset.ocrMapping)] = target.value;
        model.mappings = { ...model.mappings, [pageId]: mapping };
      } else if (target.matches("[data-ocr-boundary]")) {
        const pageId = target.dataset.pageId;
        const values = [...(model.boundaryDrafts[pageId] ?? [])];
        values[Number(target.dataset.ocrBoundary)] = target.value;
        model.boundaryDrafts = { ...model.boundaryDrafts, [pageId]: values };
      } else if (target.matches("[data-ocr-target-unit]")) model.targetUnitId = target.value || null;
      else if (target.matches("[data-ocr-new-unit-title]")) model.newUnitTitle = target.value;
      else if (target.matches("[data-ocr-new-unit-released]")) model.newUnitReleased = target.checked;
      else if (target.matches("[data-ocr-row-field]")) {
        const fieldName = target.dataset.ocrRowField;
        const value = fieldName === "included"
          ? target.checked
          : fieldName === "targets" ? target.value.split(/\r?\n/u) : target.value;
        model.previewState = updateOcrPreviewRow(model.previewState, target.dataset.rowId, fieldName, value);
      } else if (target.matches("[data-ocr-row-select]")) {
        model.previewState = selectOcrPreviewRow(model.previewState, target.dataset.ocrRowSelect, target.checked);
      } else if (target.matches("[data-ocr-filter]")) {
        model.previewState = setOcrPreviewFilter(model.previewState, target.value);
        render();
      }
    } catch (error) {
      setError(userFacingError(error, "Diese Änderung konnte nicht übernommen werden."));
    }
  }

  function handleChange(event) {
    if (event.target?.matches?.("[data-ocr-files]")) {
      void addFiles(event.target.files);
      event.target.value = "";
      return;
    }
    handleInput(event);
  }

  function handlePaste(event) {
    if (!dialog.open || model.step !== "images") return;
    const files = [...(event.clipboardData?.items ?? [])]
      .filter((item) => item.kind === "file" && String(item.type).startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (files.length > 0) {
      event.preventDefault();
      void addFiles(files);
    }
  }

  function handleDragOver(event) {
    if (!event.target?.closest?.("[data-ocr-dropzone]")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDrop(event) {
    if (!event.target?.closest?.("[data-ocr-dropzone]")) return;
    event.preventDefault();
    void addFiles(event.dataTransfer?.files);
  }

  function handleKeydown(event) {
    const dropzone = event.target?.closest?.("[data-ocr-dropzone]");
    if (dropzone && ["Enter", " "].includes(event.key)) {
      event.preventDefault();
      dialog.querySelector("[data-ocr-files]")?.click();
    }
  }

  function handleCancel(event) {
    if (event.target !== dialog) return;
    event.preventDefault();
    void close();
  }

  function confirmRouteLeave() {
    if (!dialog.open) return true;
    if (!hasDraft() || confirmDiscardPrompt("Book Capture verlassen? Nicht übernommene Buchseiten und Korrekturen gehen verloren.")) {
      void close({ force: true });
      return true;
    }
    return false;
  }

  async function destroy() {
    if (destroyed) return;
    destroyed = true;
    dialog.removeEventListener("click", handleClick);
    dialog.removeEventListener("input", handleInput);
    dialog.removeEventListener("change", handleChange);
    dialog.removeEventListener("paste", handlePaste);
    dialog.removeEventListener("dragover", handleDragOver);
    dialog.removeEventListener("drop", handleDrop);
    dialog.removeEventListener("keydown", handleKeydown);
    dialog.removeEventListener("cancel", handleCancel);
    abortController?.abort();
    imageAbortController?.abort();
    await adapter.terminate();
    revokeRowCrop();
    workspace?.releaseAll();
    dialog.remove();
  }

  dialog.addEventListener("click", handleClick);
  dialog.addEventListener("input", handleInput);
  dialog.addEventListener("change", handleChange);
  dialog.addEventListener("paste", handlePaste);
  dialog.addEventListener("dragover", handleDragOver);
  dialog.addEventListener("drop", handleDrop);
  dialog.addEventListener("keydown", handleKeydown);
  dialog.addEventListener("cancel", handleCancel);

  return Object.freeze({
    confirmRouteLeave,
    destroy,
    isActive: () => Boolean(dialog.open),
    open,
  });
}
