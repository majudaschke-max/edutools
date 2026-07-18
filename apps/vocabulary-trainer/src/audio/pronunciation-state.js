export const PRONUNCIATION_STATUSES = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  SPEAKING: "speaking",
  STOPPED: "stopped",
  ERROR: "error",
  UNSUPPORTED: "unsupported",
});

const VALID_STATUSES = new Set(Object.values(PRONUNCIATION_STATUSES));

/** Creates the transient state shared by the pronunciation service and UI. */
export function createPronunciationState(supported = false) {
  return {
    supported: supported === true,
    voicesLoaded: false,
    activeId: null,
    status: supported
      ? PRONUNCIATION_STATUSES.IDLE
      : PRONUNCIATION_STATUSES.UNSUPPORTED,
    lastError: null,
  };
}

/** Applies one validated state patch and returns the same state object. */
export function updatePronunciationState(state, patch = {}) {
  if (!state || typeof state !== "object") {
    throw new TypeError("Ein Aussprachezustand ist erforderlich.");
  }

  if (patch.status !== undefined && !VALID_STATUSES.has(patch.status)) {
    throw new TypeError(`Unbekannter Aussprache-Status: ${patch.status}`);
  }

  Object.assign(state, patch);
  return state;
}

/** Returns a defensive snapshot for subscribers and UI consumers. */
export function getPronunciationStateSnapshot(state) {
  return Object.freeze({ ...state });
}
