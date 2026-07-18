import { createElement } from "../views/view-elements.js";

/** Presents one calm, consolidated notice and returns the created dialog. */
export function showLevelUpNotice(documentRoot, notification) {
  if (!documentRoot?.body || !notification) return null;
  documentRoot.querySelector("[data-level-up-notice]")?.remove();

  const dialog = createElement(documentRoot, "dialog", {
    className: "level-up-notice",
    attributes: {
      "aria-labelledby": "level-up-title",
      "aria-describedby": "level-up-description",
    },
    dataset: { levelUpNotice: "" },
  });
  const content = createElement(documentRoot, "div", {
    className: "level-up-notice__content",
  });
  const description = notification.toLevel - notification.fromLevel > 1
    ? `Du hast mehrere Level erreicht und bist jetzt auf Level ${notification.toLevel}. Dein regelmäßiges Üben zahlt sich aus.`
    : `Du hast Level ${notification.toLevel} erreicht. Dein regelmäßiges Üben zahlt sich aus.`;
  const button = createElement(documentRoot, "button", {
    className: "button button--primary",
    text: "Weiter",
    attributes: { type: "button" },
  });
  content.append(
    createElement(documentRoot, "p", {
      className: "section-kicker",
      text: "Dein Lernweg",
    }),
    createElement(documentRoot, "h2", {
      text: "Level erreicht",
      attributes: { id: "level-up-title" },
    }),
    createElement(documentRoot, "p", {
      className: "card__description",
      text: description,
      attributes: { id: "level-up-description" },
    }),
    button,
  );
  dialog.append(content);

  const close = () => {
    if (dialog.open && typeof dialog.close === "function") dialog.close();
    dialog.remove();
  };
  button.addEventListener("click", close);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  documentRoot.body.append(dialog);
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  button.focus();
  return dialog;
}
