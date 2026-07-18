const TERMINAL_STATUSES = new Set(["completed", "passed", "failed"]);

export function createScorm12Session(options) {
  const { adapter, completionPolicy } = options;
  let status = "";
  let completionReported = false;

  function initialize() {
    if (!adapter.initialize()) return { ok: false, reason: "initialize" };
    status = adapter.getValue("cmi.core.lesson_status").trim().toLowerCase();
    if (
      completionPolicy === "first-completed-session"
      && (!status || status === "not attempted")
      && adapter.setValue("cmi.core.lesson_status", "incomplete")
    ) {
      status = "incomplete";
      adapter.commit();
    }
    return { ok: true, status };
  }

  function completeLearningSession() {
    if (
      completionPolicy !== "first-completed-session"
      || completionReported
      || !adapter.isInitialized()
      || TERMINAL_STATUSES.has(status)
    ) return false;
    completionReported = true;
    if (!adapter.setValue("cmi.core.lesson_status", "completed")) return false;
    status = "completed";
    adapter.commit();
    return true;
  }

  function suspendAndFinish() {
    if (!adapter.isInitialized() || adapter.isFinished()) return false;
    adapter.setValue("cmi.core.exit", "suspend");
    adapter.commit();
    return adapter.finish();
  }

  return Object.freeze({
    initialize,
    completeLearningSession,
    commit: () => adapter.isInitialized() && !adapter.isFinished() && adapter.commit(),
    suspendAndFinish,
    getStatus: () => status,
  });
}

