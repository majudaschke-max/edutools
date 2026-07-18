function createElement(documentRoot, name, options = {}) {
  const element = documentRoot.createElement(name);
  if (options.className) element.className = options.className;
  if (options.text) element.textContent = options.text;
  return element;
}

/** Renders only immutable public catalog metadata, never Author course state. */
export function renderPublishedCourseLibrary(container, catalog, options = {}) {
  if (!container) throw new TypeError("Ziel für die Browser-Kursauswahl fehlt.");
  const documentRoot = container.ownerDocument;
  container.replaceChildren();

  if (options.errorMessage) {
    const errorMessage = createElement(documentRoot, "p", {
      className: "session-error published-course-library__error",
      text: options.errorMessage,
    });
    errorMessage.setAttribute("role", "alert");
    container.append(errorMessage);
  }

  const list = createElement(documentRoot, "ul", { className: "published-course-library" });
  catalog.courses.forEach((course) => {
    const item = createElement(documentRoot, "li", { className: "published-course-library__item" });
    const card = createElement(documentRoot, "article", { className: "card published-course-card" });
    card.append(
      createElement(documentRoot, "h2", { className: "card__title", text: course.title }),
    );
    if (course.subtitle) {
      card.append(createElement(documentRoot, "p", {
        className: "card__description",
        text: course.subtitle,
      }));
    }
    if (course.publicationId === options.lastPublicationId) {
      card.append(createElement(documentRoot, "p", {
        className: "section-kicker published-course-card__recent",
        text: "Zuletzt verwendet",
      }));
    }
    card.append(createElement(documentRoot, "p", {
      className: "published-course-card__languages",
      text: `${course.languages.source.label} → ${course.languages.target.label}`,
    }));
    const link = createElement(documentRoot, "a", {
      className: "button button--primary",
      text: "Kurs öffnen",
    });
    link.href = options.createCourseUrl(course.publicationId);
    link.dataset.publicationId = course.publicationId;
    link.setAttribute("aria-label", `${course.title} öffnen`);
    card.append(link);
    item.append(card);
    list.append(item);
  });
  container.append(list);
  return list;
}
