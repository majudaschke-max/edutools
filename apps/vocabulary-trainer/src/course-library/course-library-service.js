import {
  COURSE_SOURCE_TYPES,
  cloneCourse,
  createCourse,
  createUnit,
  createWord,
  duplicateCourse,
} from "./course-schema.js?v=4.0.5";
import { assertValidCourse } from "./course-validator.js?v=4.0.5";

function sortUnits(course) {
  course.units.sort((left, right) => left.order - right.order);
  course.units.forEach((unit, index) => { unit.order = index + 1; });
}

export function createCourseLibraryService(options) {
  const { initialState, storage, idGenerator, now = () => new Date() } = options;
  const bundledCourses = (options.bundledCourses ?? [options.builtInCourse]).map((course) => {
    assertValidCourse(course);
    if (
      course.sourceType !== COURSE_SOURCE_TYPES.BUNDLED
      || course.editable !== false
    ) {
      throw new TypeError("Der mitgelieferte Bibliothekskurs ist nicht eindeutig als bundled gekennzeichnet.");
    }
    return cloneCourse(course);
  });
  if (bundledCourses.length === 0) throw new TypeError("Mindestens ein mitgelieferter Kurs ist erforderlich.");
  const bundledById = new Map(bundledCourses.map((course) => [course.id, course]));
  if (bundledById.size !== bundledCourses.length) throw new TypeError("Mitgelieferte Kurs-IDs müssen eindeutig sein.");
  const defaultBundledCourseId = bundledCourses[0].id;
  let state = { ...initialState, courses: initialState.courses.map(cloneCourse) };

  function snapshot() {
    return { ...state, courses: state.courses.map(cloneCourse) };
  }

  function persist(nextState) {
    const frozenNext = { ...nextState, courses: nextState.courses.map(cloneCourse) };
    if (!storage.save(frozenNext)) throw new Error("Die Kursbibliothek konnte nicht gespeichert werden.");
    state = frozenNext;
    return snapshot();
  }

  function getCourse(id) {
    if (bundledById.has(id)) return cloneCourse(bundledById.get(id));
    const course = state.courses.find((candidate) => candidate.id === id);
    return course ? cloneCourse(course) : null;
  }

  function listCourses() {
    return [
      ...bundledCourses.map((course) => ({
        ...cloneCourse(course),
        builtIn: true,
        active: state.activeCourseId === course.id,
      })),
      ...state.courses.map((course) => ({ ...cloneCourse(course), builtIn: false, active: state.activeCourseId === course.id })),
    ];
  }

  function listLocalCourses() {
    return state.courses.map((course) => ({
      ...cloneCourse(course),
      builtIn: false,
      active: state.activeCourseId === course.id,
    }));
  }

  function addCourse(course) {
    assertValidCourse(course);
    if (course.sourceType === COURSE_SOURCE_TYPES.BUNDLED || course.editable !== true) {
      throw new Error("Nur editierbare eigene, importierte oder duplizierte Kurse können lokal gespeichert werden.");
    }
    if (bundledById.has(course.id) || state.courses.some((item) => item.id === course.id)) {
      throw new Error(`Die Kurs-ID „${course.id}“ ist bereits vorhanden.`);
    }
    persist({ ...state, courses: [...state.courses, cloneCourse(course)] });
    return getCourse(course.id);
  }

  function createLocalCourse(input) {
    return addCourse(createCourse(input, {
      idGenerator,
      now: now(),
      sourceType: COURSE_SOURCE_TYPES.OWN,
      editable: true,
    }));
  }

  function duplicate(id) {
    const source = getCourse(id);
    if (!source) throw new Error("Der zu duplizierende Kurs wurde nicht gefunden.");
    return addCourse(duplicateCourse(source, { idGenerator, now: now() }));
  }

  function updateCourse(course) {
    assertValidCourse(course);
    const index = state.courses.findIndex((item) => item.id === course.id);
    if (index < 0) throw new Error("Der Kurs wurde nicht gefunden.");
    if (
      bundledById.has(course.id)
      || course.sourceType === COURSE_SOURCE_TYPES.BUNDLED
      || course.editable !== true
    ) {
      throw new Error("Der mitgelieferte Kurs kann nicht direkt geändert werden.");
    }
    const updated = cloneCourse(course);
    updated.updatedAt = new Date(now()).toISOString();
    const courses = [...state.courses];
    courses[index] = updated;
    persist({ ...state, courses });
    return getCourse(updated.id);
  }

  function modifyCourse(courseId, modifier) {
    const course = getCourse(courseId);
    if (!course || bundledById.has(courseId)) throw new Error("Der eigene Kurs wurde nicht gefunden.");
    modifier(course);
    return updateCourse(course);
  }

  function archiveCourse(courseId, archived = true) {
    if (bundledById.has(courseId)) throw new Error("Der mitgelieferte Kurs kann nicht archiviert werden.");
    const index = state.courses.findIndex((course) => course.id === courseId);
    if (index < 0) throw new Error("Der Kurs wurde nicht gefunden.");
    const courses = state.courses.map(cloneCourse);
    courses[index].archived = archived;
    courses[index].updatedAt = new Date(now()).toISOString();
    assertValidCourse(courses[index]);
    const activeCourseId = archived && state.activeCourseId === courseId
      ? defaultBundledCourseId
      : state.activeCourseId;
    persist({ ...state, activeCourseId, courses });
    return getCourse(courseId);
  }

  function deleteCourse(courseId) {
    if (bundledById.has(courseId)) throw new Error("Der mitgelieferte Kurs kann nicht gelöscht werden.");
    if (!state.courses.some((course) => course.id === courseId)) throw new Error("Der Kurs wurde nicht gefunden.");
    const activeCourseId = state.activeCourseId === courseId ? defaultBundledCourseId : state.activeCourseId;
    persist({ ...state, activeCourseId, courses: state.courses.filter((course) => course.id !== courseId) });
    return snapshot();
  }

  function setActiveCourse(courseId) {
    const course = getCourse(courseId);
    if (!course || course.archived) throw new Error("Dieser Kurs kann nicht aktiviert werden.");
    const usableUnits = course.units.filter((unit) => !unit.archived && unit.released);
    if (usableUnits.length === 0) throw new Error("Der Kurs benötigt zuerst ein freigegebenes Lernpaket.");
    return persist({ ...state, activeCourseId: courseId });
  }

  function addUnit(courseId, input = {}) {
    return modifyCourse(courseId, (course) => {
      course.units.push(createUnit({ ...input, order: course.units.length + 1 }, { idGenerator }));
      sortUnits(course);
    });
  }

  function updateUnit(courseId, unitId, changes) {
    return modifyCourse(courseId, (course) => {
      const unit = course.units.find((item) => item.id === unitId);
      if (!unit) throw new Error("Das Lernpaket wurde nicht gefunden.");
      Object.assign(unit, changes, { id: unit.id, words: unit.words });
      if (unit.current) course.units.forEach((item) => { if (item.id !== unit.id) item.current = false; });
      if (unit.archived) unit.current = false;
      sortUnits(course);
    });
  }

  function moveUnit(courseId, unitId, direction) {
    return modifyCourse(courseId, (course) => {
      sortUnits(course);
      const index = course.units.findIndex((unit) => unit.id === unitId);
      const target = index + (direction === "up" ? -1 : 1);
      if (index < 0 || target < 0 || target >= course.units.length) return;
      [course.units[index], course.units[target]] = [course.units[target], course.units[index]];
      course.units.forEach((unit, unitIndex) => { unit.order = unitIndex + 1; });
    });
  }

  function addWord(courseId, unitId, input) {
    return modifyCourse(courseId, (course) => {
      const unit = course.units.find((item) => item.id === unitId);
      if (!unit) throw new Error("Das Lernpaket wurde nicht gefunden.");
      unit.words.push(createWord(input, { idGenerator }));
    });
  }

  function updateWord(courseId, unitId, wordId, changes) {
    return modifyCourse(courseId, (course) => {
      const word = course.units.find((unit) => unit.id === unitId)?.words.find((item) => item.id === wordId);
      if (!word) throw new Error("Das Wort wurde nicht gefunden.");
      Object.assign(word, createWord({ ...word, ...changes, id: word.id }), { id: word.id });
    });
  }

  function duplicateWord(courseId, unitId, wordId) {
    return modifyCourse(courseId, (course) => {
      const unit = course.units.find((item) => item.id === unitId);
      const word = unit?.words.find((item) => item.id === wordId);
      if (!word) throw new Error("Das Wort wurde nicht gefunden.");
      unit.words.push(createWord({ ...word, id: "", source: `${word.source} – Kopie` }, { idGenerator }));
    });
  }

  return Object.freeze({
    addCourse,
    addUnit,
    addWord,
    archiveCourse,
    createLocalCourse,
    deleteCourse,
    duplicateCourse: duplicate,
    duplicateWord,
    getCourse,
    getState: snapshot,
    listCourses,
    listLocalCourses,
    moveUnit,
    setActiveCourse,
    updateCourse,
    updateUnit,
    updateWord,
  });
}
