const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function createSvgElement(documentRoot, tagName) {
  return typeof documentRoot.createElementNS === "function"
    ? documentRoot.createElementNS(SVG_NAMESPACE, tagName)
    : documentRoot.createElement(tagName);
}

function createIcon(documentRoot) {
  const svg = createSvgElement(documentRoot, "svg");
  svg.setAttribute("class", "pronunciation-button__icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const playIcon = createSvgElement(documentRoot, "g");
  playIcon.setAttribute("data-pronunciation-icon-play", "");
  const speaker = createSvgElement(documentRoot, "path");
  speaker.setAttribute("d", "M11 5 6 9H2v6h4l5 4z");
  const sound = createSvgElement(documentRoot, "path");
  sound.setAttribute("d", "M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12");
  playIcon.append(speaker, sound);

  const stopIcon = createSvgElement(documentRoot, "g");
  stopIcon.setAttribute("data-pronunciation-icon-stop", "");
  const stopShape = createSvgElement(documentRoot, "rect");
  stopShape.setAttribute("x", "7");
  stopShape.setAttribute("y", "7");
  stopShape.setAttribute("width", "10");
  stopShape.setAttribute("height", "10");
  stopShape.setAttribute("rx", "1");
  stopIcon.append(stopShape);
  svg.append(playIcon, stopIcon);
  return svg;
}

function getLabel(text, active) {
  return `Aussprache von „${text}“ ${active ? "stoppen" : "abspielen"}`;
}

/** Updates visual and accessible state without replacing or refocusing a button. */
export function setPronunciationButtonState(button, options = {}) {
  const text = options.text ?? button?.dataset?.pronunciationText ?? "";
  const active = options.active === true;
  const disabled = options.disabled === true;
  button.setAttribute("aria-label", getLabel(text, active));
  button.setAttribute("aria-pressed", String(active));
  button.setAttribute("title", getLabel(text, active));
  button.disabled = disabled;
  return button;
}

/** Builds a reusable native control with no vocabulary or learning-mode logic. */
export function createPronunciationButton(documentRoot, options = {}) {
  const text = typeof options.text === "string" ? options.text.trim() : "";
  const button = documentRoot.createElement("button");
  button.type = "button";
  button.className = options.compact
    ? "pronunciation-button pronunciation-button--compact"
    : "pronunciation-button";
  button.dataset.pronunciationAction = "toggle";
  button.dataset.pronunciationId = String(options.id ?? "");
  button.dataset.pronunciationText = text;
  button.dataset.pronunciationRole = String(options.role ?? "");
  button.append(createIcon(documentRoot));
  return setPronunciationButtonState(button, {
    text,
    active: options.active,
    disabled: options.disabled,
  });
}
