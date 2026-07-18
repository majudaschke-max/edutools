import { loadJsonResource } from "../core/utils.js";
import { subscribeLearningSessionCompleted } from "./learning-session-events.js";
import { createScorm12ApiAdapter, waitForScorm12Api } from "./scorm12-api-adapter.js";
import { createScorm12Session } from "./scorm12-session.js";
import { createStandaloneDelivery } from "./standalone-delivery.js";

function renderUnavailableNotice(appRoot) {
  if (appRoot.querySelector("[data-delivery-notice]")) return;
  const section = appRoot.ownerDocument.createElement("section");
  section.className = "card feedback feedback--info";
  section.dataset.deliveryNotice = "";
  section.setAttribute("role", "status");
  section.setAttribute("aria-labelledby", "delivery-notice-title");
  section.innerHTML = `
    <h2 id="delivery-notice-title" class="content-title">Lernpaket-Verbindung</h2>
    <p>Die Verbindung zum Lernpaket-System ist nicht verfügbar. Dein Lernstand wird nur in diesem Browser gespeichert.</p>
    <button class="button button--secondary" type="button" data-delivery-notice-close>Hinweis schließen</button>`;
  section.querySelector("[data-delivery-notice-close]")?.addEventListener("click", () => section.remove(), { once: true });
  appRoot.prepend(section);
}

async function loadScormDeliveryProfile(deploymentProfile) {
  const file = deploymentProfile.delivery?.file;
  if (!file) throw new TypeError("SCORM-Delivery-Profil fehlt.");
  const raw = await loadJsonResource(file, "SCORM-Delivery-Profil");
  if (
    raw?.schemaVersion !== 1
    || raw.deliveryType !== "scorm12"
    || raw.packageId !== deploymentProfile.delivery.packageId
    || !new Set(["none", "first-completed-session"]).has(raw.completionPolicy)
  ) throw new TypeError("SCORM-Delivery-Profil ist ungültig.");
  return Object.freeze({ ...raw });
}

export async function createDeliveryRuntime(options) {
  const { appRoot, deploymentProfile } = options;
  if (deploymentProfile.delivery?.type !== "scorm12") return createStandaloneDelivery();

  let deliveryProfile;
  try {
    deliveryProfile = await loadScormDeliveryProfile(deploymentProfile);
  } catch (error) {
    renderUnavailableNotice(appRoot);
    console.error("SCORM-Delivery-Profil konnte nicht geladen werden; die App verwendet ausschließlich lokalen Lernstand.", error);
    return Object.freeze({ type: "scorm12", available: false, destroy() {} });
  }
  const windowObject = options.window ?? appRoot.ownerDocument.defaultView ?? globalThis.window;
  const api = await waitForScorm12Api(windowObject, { maxDepth: 10 });
  if (!api) {
    renderUnavailableNotice(appRoot);
    console.error("SCORM-1.2-API wurde nicht gefunden; die App verwendet ausschließlich lokalen Lernstand.");
    return Object.freeze({ type: "scorm12", available: false, destroy() {} });
  }

  const adapter = createScorm12ApiAdapter(api);
  const session = createScorm12Session({
    adapter,
    completionPolicy: deliveryProfile.completionPolicy,
  });
  const initialized = session.initialize();
  if (!initialized.ok) {
    renderUnavailableNotice(appRoot);
    return Object.freeze({ type: "scorm12", available: false, destroy() {} });
  }

  const unsubscribe = subscribeLearningSessionCompleted(() => session.completeLearningSession());
  const handleVisibility = () => {
    if (appRoot.ownerDocument.visibilityState === "hidden") session.commit();
  };
  const handlePageHide = (event) => {
    if (!event.persisted) session.suspendAndFinish();
  };
  appRoot.ownerDocument.addEventListener("visibilitychange", handleVisibility);
  windowObject?.addEventListener?.("pagehide", handlePageHide);

  return Object.freeze({
    type: "scorm12",
    available: true,
    destroy() {
      unsubscribe();
      appRoot.ownerDocument.removeEventListener("visibilitychange", handleVisibility);
      windowObject?.removeEventListener?.("pagehide", handlePageHide);
    },
  });
}
