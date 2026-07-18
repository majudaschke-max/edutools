import assert from "node:assert/strict";

import {
  createRouter,
  getCurrentRoute,
  navigateTo,
  startRouter,
} from "../src/core/router.js";

class FakeWindow {
  constructor(initialHash = "") {
    this.listeners = new Map();
    this.entries = [initialHash];
    this.entryIndex = 0;
    this.replaceCount = 0;

    const fakeWindow = this;
    this.location = {
      pathname: "/apps/vocabulary-trainer/src/",
      search: "",
      get hash() {
        return fakeWindow.entries[fakeWindow.entryIndex];
      },
      set hash(value) {
        fakeWindow.pushHash(value);
      },
      replace(value) {
        fakeWindow.replaceHash(value);
      },
    };

    this.history = {
      state: null,
      get length() {
        return fakeWindow.entries.length;
      },
      replaceState(state, _title, url) {
        this.state = state;
        fakeWindow.replaceCount += 1;
        fakeWindow.replaceHash(FakeWindow.extractHash(url));
      },
      back() {
        fakeWindow.go(-1);
      },
      forward() {
        fakeWindow.go(1);
      },
    };
  }

  static extractHash(value) {
    const stringValue = String(value);
    const hashIndex = stringValue.indexOf("#");
    return hashIndex === -1 ? "" : stringValue.slice(hashIndex);
  }

  static normalizeHash(value) {
    const stringValue = String(value);
    return stringValue === "" || stringValue.startsWith("#")
      ? stringValue
      : `#${stringValue}`;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(type) {
    [...(this.listeners.get(type) ?? [])].forEach((listener) => {
      listener({ type });
    });
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size ?? 0;
  }

  pushHash(value) {
    const hash = FakeWindow.normalizeHash(value);

    if (hash === this.location.hash) {
      return;
    }

    this.entries.splice(this.entryIndex + 1);
    this.entries.push(hash);
    this.entryIndex += 1;
    this.dispatchEvent("hashchange");
  }

  replaceHash(value) {
    this.entries[this.entryIndex] = FakeWindow.normalizeHash(value);
  }

  go(offset) {
    const nextIndex = this.entryIndex + offset;

    if (nextIndex < 0 || nextIndex >= this.entries.length) {
      return;
    }

    this.entryIndex = nextIndex;
    this.dispatchEvent("hashchange");
  }
}

const tests = [];

function test(name, callback) {
  tests.push({ name, callback });
}

test("ohne Hash wird Dashboard per replace zur Default-Route", () => {
  const windowObject = new FakeWindow();
  const calls = [];

  createRouter(
    { dashboard: ({ route }) => calls.push(route) },
    { defaultRoute: "#/dashboard", window: windowObject },
  );
  const stop = startRouter();

  assert.equal(windowObject.location.hash, "#/dashboard");
  assert.equal(windowObject.replaceCount, 1);
  assert.equal(windowObject.history.length, 1);
  assert.equal(getCurrentRoute(), "/dashboard");
  assert.deepEqual(calls, ["/dashboard"]);
  stop();
});

test("direkte Hash-URL wird beim Start aufgerufen", () => {
  const windowObject = new FakeWindow("#/learn");
  const calls = [];

  createRouter(
    { "/dashboard": () => calls.push("dashboard"), "#/learn": () => calls.push("learn") },
    { window: windowObject },
  );
  startRouter();

  assert.equal(getCurrentRoute(), "/learn");
  assert.equal(windowObject.replaceCount, 0);
  assert.deepEqual(calls, ["learn"]);
});

test("Hash-Query bleibt in der URL und wird getrennt an den Handler übergeben", () => {
  const windowObject = new FakeWindow("#/course-builder?course=course-1&unit=unit-2");
  const calls = [];
  createRouter({
    "/course-builder": (context) => calls.push(context),
  }, { window: windowObject });
  startRouter();
  assert.equal(getCurrentRoute(), "/course-builder");
  assert.equal(calls[0].query.course, "course-1");
  assert.equal(calls[0].query.unit, "unit-2");
  assert.equal(windowObject.location.hash, "#/course-builder?course=course-1&unit=unit-2");
});

test("navigateTo normalisiert die Route und ruft Handler sowie onRouteChange", () => {
  const windowObject = new FakeWindow();
  const handlerCalls = [];
  const routeChanges = [];

  createRouter(
    {
      "/dashboard": () => handlerCalls.push("dashboard"),
      "/learn": ({ source }) => handlerCalls.push(`learn:${source}`),
    },
    {
      window: windowObject,
      onRouteChange: (route, context) => {
        routeChanges.push(`${route}:${context.isKnownRoute}`);
      },
    },
  );
  startRouter();
  navigateTo("#/learn");

  assert.equal(windowObject.location.hash, "#/learn");
  assert.equal(getCurrentRoute(), "/learn");
  assert.deepEqual(handlerCalls, ["dashboard", "learn:navigate"]);
  assert.deepEqual(routeChanges, ["/dashboard:true", "/learn:true"]);
});

test("unbekannte Route wird an onNotFound übergeben", () => {
  const windowObject = new FakeWindow("#/unknown");
  const notFoundCalls = [];
  const routeChanges = [];

  createRouter(
    { "/dashboard": () => {} },
    {
      window: windowObject,
      onNotFound: (route, context) => {
        notFoundCalls.push({ route, isKnownRoute: context.isKnownRoute });
      },
      onRouteChange: (route) => routeChanges.push(route),
    },
  );
  startRouter();

  assert.deepEqual(notFoundCalls, [{ route: "/unknown", isKnownRoute: false }]);
  assert.deepEqual(routeChanges, ["/unknown"]);
  assert.equal(getCurrentRoute(), "/unknown");
});

test("Back und Forward folgen nativen hashchange-Ereignissen", () => {
  const windowObject = new FakeWindow();
  const calls = [];

  createRouter(
    {
      "/dashboard": () => calls.push("dashboard"),
      "/learn": () => calls.push("learn"),
      "/marked": () => calls.push("marked"),
    },
    { window: windowObject },
  );
  startRouter();
  navigateTo("/learn");
  navigateTo("/marked");
  windowObject.history.back();
  assert.equal(getCurrentRoute(), "/learn");
  windowObject.history.forward();
  assert.equal(getCurrentRoute(), "/marked");

  assert.deepEqual(calls, ["dashboard", "learn", "marked", "learn", "marked"]);
});

test("Navigation zur aktuellen Route dispatcht bewusst erneut", () => {
  const windowObject = new FakeWindow("#/learn");
  const contexts = [];

  createRouter(
    { "/learn": (context) => contexts.push(context) },
    { window: windowObject },
  );
  startRouter();
  navigateTo("learn");

  assert.equal(windowObject.history.length, 1);
  assert.equal(contexts.length, 2);
  assert.equal(contexts[0].repeated, false);
  assert.equal(contexts[1].repeated, true);
  assert.equal(contexts[1].source, "navigate");
});

test("startRouter ist idempotent und Stop entfernt den Listener", () => {
  const windowObject = new FakeWindow("#/dashboard");
  const calls = [];

  createRouter(
    {
      "/dashboard": () => calls.push("dashboard"),
      "/learn": () => calls.push("learn"),
    },
    { window: windowObject },
  );
  const firstStop = startRouter();
  const secondStop = startRouter();

  assert.equal(firstStop, secondStop);
  assert.equal(windowObject.listenerCount("hashchange"), 1);
  assert.deepEqual(calls, ["dashboard"]);

  firstStop();
  firstStop();
  assert.equal(windowObject.listenerCount("hashchange"), 0);

  windowObject.location.hash = "#/learn";
  assert.deepEqual(calls, ["dashboard"]);
  assert.equal(getCurrentRoute(), "/dashboard");
});

let failures = 0;

for (const { name, callback } of tests) {
  try {
    await callback();
    console.log(`✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`✗ ${name}`);
    console.error(error);
  }
}

console.log(`\n${tests.length - failures}/${tests.length} Router-Tests bestanden.`);

if (failures > 0) {
  process.exitCode = 1;
}
