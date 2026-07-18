const DEFAULT_INTERVAL_MS = 250;

/** Creates a target-time based timer that corrects itself after delayed ticks. */
export function createSpeedTimer(options = {}) {
  const durationMs = Math.max(0, Number(options.durationMs) || 0);
  const now = options.nowFn ?? Date.now;
  const schedule = options.setIntervalFn ?? globalThis.setInterval?.bind(globalThis);
  const clearSchedule = options.clearIntervalFn ?? globalThis.clearInterval?.bind(globalThis);
  const intervalMs = Math.max(1, Number(options.intervalMs) || DEFAULT_INTERVAL_MS);
  let remainingMs = durationMs;
  let endsAt = null;
  let intervalId = null;
  let running = false;
  let paused = false;
  let expiredNotified = false;

  function readNow() {
    const value = Number(now());
    if (!Number.isFinite(value)) throw new TypeError("Die Zeitfunktion muss Millisekunden liefern.");
    return value;
  }

  function getRemainingMs() {
    if (running && endsAt !== null) {
      remainingMs = Math.max(0, endsAt - readNow());
    }
    return remainingMs;
  }

  function clearTicking() {
    if (intervalId !== null && clearSchedule) clearSchedule(intervalId);
    intervalId = null;
  }

  function notifyTick() {
    const current = getRemainingMs();
    options.onTick?.(current, endsAt);
    if (current <= 0 && !expiredNotified) {
      expiredNotified = true;
      running = false;
      paused = false;
      endsAt = null;
      clearTicking();
      options.onExpire?.();
    }
    return current;
  }

  function beginTicking() {
    if (schedule) intervalId = schedule(notifyTick, intervalMs);
  }

  function start() {
    if (running || paused || expiredNotified || durationMs <= 0) return false;
    remainingMs = durationMs;
    endsAt = readNow() + remainingMs;
    running = true;
    notifyTick();
    if (running) beginTicking();
    return true;
  }

  function pause() {
    if (!running) return false;
    remainingMs = getRemainingMs();
    running = false;
    paused = true;
    endsAt = null;
    clearTicking();
    options.onTick?.(remainingMs, endsAt);
    return true;
  }

  function resume() {
    if (!paused || remainingMs <= 0 || expiredNotified) return false;
    endsAt = readNow() + remainingMs;
    paused = false;
    running = true;
    notifyTick();
    if (running) beginTicking();
    return true;
  }

  function stop() {
    if (running) remainingMs = getRemainingMs();
    const changed = running || paused || intervalId !== null;
    running = false;
    paused = false;
    endsAt = null;
    clearTicking();
    return changed;
  }

  return Object.freeze({
    getEndsAt: () => endsAt,
    getRemainingMs,
    isExpired: () => getRemainingMs() <= 0,
    isPaused: () => paused,
    isRunning: () => running,
    pause,
    resume,
    start,
    stop,
    tick: notifyTick,
  });
}
