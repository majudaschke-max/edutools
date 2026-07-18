export function createElement(documentRoot, tagName, options = {}) {
  const element = documentRoot.createElement(tagName);

  if (options.className) {
    element.className = options.className;
  }

  if (options.text !== undefined) {
    element.textContent = String(options.text);
  }

  Object.entries(options.attributes ?? {}).forEach(([name, value]) => {
    element.setAttribute(name, String(value));
  });

  Object.entries(options.dataset ?? {}).forEach(([name, value]) => {
    element.dataset[name] = String(value);
  });

  return element;
}

export function createActionButton(documentRoot, label, action, variant = "primary") {
  const button = createElement(documentRoot, "button", {
    className: `button button--${variant}`,
    text: label,
    dataset: { sessionAction: action },
  });
  button.type = "button";
  return button;
}

export function createDashboardLink(documentRoot, label = "Zum Dashboard", variant = "primary") {
  return createElement(documentRoot, "a", {
    className: `button button--${variant}`,
    text: label,
    attributes: { href: "#/dashboard" },
    dataset: { routeLink: "/dashboard" },
  });
}

export function createSummaryList(documentRoot, rows) {
  const list = createElement(documentRoot, "dl", { className: "summary-list" });

  rows.forEach(({ label, value, total = false, valueDataset = undefined }) => {
    const row = createElement(documentRoot, "div", {
      className: total
        ? "summary-list__row summary-list__row--total"
        : "summary-list__row",
    });
    row.append(
      createElement(documentRoot, "dt", { text: label }),
      createElement(documentRoot, "dd", { text: value, dataset: valueDataset }),
    );
    list.append(row);
  });

  return list;
}

export function appendViewError(container, message) {
  if (!message) {
    return;
  }

  container.append(createElement(container.ownerDocument, "p", {
    className: "session-error",
    text: message,
    attributes: { role: "alert", tabindex: "-1" },
    dataset: { sessionFocusError: "" },
  }));
}
