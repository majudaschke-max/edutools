import { getCurrentUnitId, isUnitAvailable } from "../core/course.js";

function formatUnitTitle(unitId) {
  const unitNumber = unitId?.match?.(/^unit-(\d+)$/)?.[1];
  return unitNumber ? `Lernpaket ${unitNumber}` : String(unitId ?? "Unbekannte Lernpaket");
}

function createUnitContent(documentRoot, unit, statusText, emptyMessage = "") {
  const content = documentRoot.createElement("span");
  content.className = "unit-choice__content";

  const title = documentRoot.createElement("span");
  title.className = "shell-list__primary";
  title.textContent = unit.title;

  const status = documentRoot.createElement("span");
  status.className = "shell-list__status";
  status.textContent = statusText;
  content.append(title, status);

  if (emptyMessage) {
    const description = documentRoot.createElement("span");
    description.className = "shell-list__secondary unit-choice__description";
    description.textContent = emptyMessage;
    content.append(description);
  }
  return content;
}

/** Renders available Lernpakete as native controls and unavailable Lernpakete as status. */
export function renderUnits(documentRoot, courseConfig, vocabularyData) {
  const list = documentRoot.querySelector("[data-units-list]");
  if (!list) {
    throw new Error("App-Ziel fehlt: [data-units-list]");
  }

  const currentUnitId = getCurrentUnitId(courseConfig);
  const configuredUnits = courseConfig.availableUnits.map((unitId, index) => {
    const contentUnit = vocabularyData.units.find((unit) => unit.id === unitId);
    return contentUnit ?? {
      id: unitId,
      order: index + 1,
      title: formatUnitTitle(unitId),
      hasContent: false,
    };
  });
  const configuredUnitIds = new Set(courseConfig.availableUnits);
  const lockedUnits = courseConfig.showLockedUnits
    ? vocabularyData.units.filter((unit) => !configuredUnitIds.has(unit.id))
    : [];
  const visibleUnits = [...configuredUnits, ...lockedUnits]
    .sort((first, second) => first.order - second.order);

  list.replaceChildren();
  visibleUnits.forEach((unit) => {
    const available = isUnitAvailable(courseConfig, unit.id);
    const hasContent = unit.hasContent !== false && (unit.words?.length ?? 0) > 0;
    const item = documentRoot.createElement("li");
    item.className = "shell-list__item";

    if (available && hasContent) {
      const current = unit.id === currentUnitId;
      const control = documentRoot.createElement("button");
      control.type = "button";
      control.className = "unit-choice";
      control.dataset.unitSelect = unit.id;
      control.setAttribute("aria-pressed", String(current));
      control.setAttribute("aria-label", `${unit.title} ${current ? "öffnen" : "als aktuelles Lernpaket auswählen"}`);
      control.append(createUnitContent(documentRoot, unit, current ? "Aktuell" : "Verfügbar"));
      item.classList?.add?.("shell-list__item--interactive");
      item.append(control);
    } else if (!hasContent && available) {
      item.append(createUnitContent(
        documentRoot,
        unit,
        unit.id === currentUnitId ? "Aktuell · leer" : "Leer",
        "Dieses Lernpaket enthält noch keine Wörter.",
      ));
    } else {
      item.append(createUnitContent(documentRoot, unit, "Gesperrt"));
    }
    list.append(item);
  });
}
