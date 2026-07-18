import { cloneCourse, createUnit, createWord } from "./course-schema.js";
import { validateCourse } from "./course-validator.js";

function setPath(target, path, value) {
  const parts = path.split(".");
  const key = parts.pop();
  const parent = parts.reduce((current, part) => current[part], target);
  parent[key] = value;
}

export function createCourseEditorController(options) {
  const { service, course, idGenerator, now = () => new Date() } = options;
  let draft = cloneCourse(course);
  let dirty = false;

  function getSnapshot() {
    return { draft: cloneCourse(draft), dirty, validation: validateCourse(draft) };
  }

  function change(path, value) {
    setPath(draft, path, value);
    dirty = true;
    return getSnapshot();
  }

  function changeUnit(unitId, field, value) {
    const unit = draft.units.find((item) => item.id === unitId);
    if (!unit) throw new Error("Das Lernpaket wurde nicht gefunden.");
    unit[field] = value;
    if (field === "current" && value) {
      unit.released = true;
      unit.archived = false;
      draft.units.forEach((item) => { if (item.id !== unitId) item.current = false; });
    }
    if (field === "archived" && value) unit.current = false;
    dirty = true;
    return getSnapshot();
  }

  function addUnit(title) {
    draft.units.push(createUnit({ title, order: draft.units.length + 1 }, { idGenerator }));
    dirty = true;
    return getSnapshot();
  }

  function moveUnit(unitId, direction) {
    draft.units.sort((left, right) => left.order - right.order);
    const index = draft.units.findIndex((unit) => unit.id === unitId);
    const target = index + (direction === "up" ? -1 : 1);
    if (index >= 0 && target >= 0 && target < draft.units.length) {
      [draft.units[index], draft.units[target]] = [draft.units[target], draft.units[index]];
      draft.units.forEach((unit, unitIndex) => { unit.order = unitIndex + 1; });
      dirty = true;
    }
    return getSnapshot();
  }

  function saveWord(unitId, input, wordId = null) {
    const unit = draft.units.find((item) => item.id === unitId);
    if (!unit) throw new Error("Das Lernpaket wurde nicht gefunden.");
    if (wordId) {
      const index = unit.words.findIndex((word) => word.id === wordId);
      if (index < 0) throw new Error("Das Wort wurde nicht gefunden.");
      unit.words[index] = createWord({ ...input, id: wordId }, { idGenerator });
    } else unit.words.push(createWord(input, { idGenerator }));
    dirty = true;
    return getSnapshot();
  }

  function duplicateWord(unitId, wordId) {
    const unit = draft.units.find((item) => item.id === unitId);
    const word = unit?.words.find((item) => item.id === wordId);
    if (!word) throw new Error("Das Wort wurde nicht gefunden.");
    unit.words.push(createWord({ ...word, id: "", source: `${word.source} – Kopie` }, { idGenerator }));
    dirty = true;
    return getSnapshot();
  }

  function replaceDraft(nextCourse, nextDirty = true) {
    draft = cloneCourse(nextCourse);
    dirty = nextDirty;
    return getSnapshot();
  }

  function save() {
    const result = validateCourse(draft);
    if (!result.valid) return { ok: false, errors: result.errors, snapshot: getSnapshot() };
    const saved = service.updateCourse({ ...draft, updatedAt: new Date(now()).toISOString() });
    draft = cloneCourse(saved);
    dirty = false;
    return { ok: true, course: saved, snapshot: getSnapshot() };
  }

  function discard() {
    const stored = service.getCourse(draft.id);
    if (!stored) throw new Error("Der Kurs wurde nicht gefunden.");
    draft = stored;
    dirty = false;
    return getSnapshot();
  }

  return Object.freeze({ addUnit, change, changeUnit, discard, duplicateWord, getSnapshot, moveUnit, replaceDraft, save, saveWord });
}
