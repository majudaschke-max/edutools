import { assertValidCourse } from "../course-library/course-validator.js";
import { cloneCourse } from "../course-library/course-schema.js";

function slug(value) {
  return String(value).replaceAll("ß", "ss").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "kurs";
}

export function createCourseExport(course, now = new Date()) {
  assertValidCourse(course);
  const content = cloneCourse(course);
  void now;
  const grade = slug(course.gradeLevel ?? "");
  const gradeSuffix = grade ? `-jahrgang-${grade.replace(/^jahrgang-?/, "")}` : "";
  return {
    filename: `edutools-vocabulary-${slug(course.title)}${gradeSuffix}.json`,
    text: JSON.stringify(content, null, 2),
    content,
  };
}

export function downloadCourseExport(course, options = {}) {
  const documentRoot = options.document ?? globalThis.document;
  const URLObject = options.URL ?? globalThis.URL;
  const BlobClass = options.Blob ?? globalThis.Blob;
  if (!documentRoot || !URLObject?.createObjectURL || !BlobClass) {
    throw new Error("Der Browser kann den Kurs-Export nicht erzeugen.");
  }
  const result = createCourseExport(course, options.now);
  const url = URLObject.createObjectURL(new BlobClass([result.text], { type: "application/json" }));
  try {
    const link = documentRoot.createElement("a");
    link.href = url;
    link.download = result.filename;
    link.hidden = true;
    documentRoot.body.append(link);
    link.click();
    link.remove();
  } finally {
    URLObject.revokeObjectURL(url);
  }
  return result;
}
