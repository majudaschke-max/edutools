let activeRouter = null;

function normalizeRoute(route) {
  if (typeof route !== "string" || route.trim().length === 0) {
    throw new TypeError("Die Route muss ein nicht leerer String sein.");
  }

  const withoutHash = route.trim().replace(/^#/, "").split("?")[0];
  const withLeadingSlash = withoutHash.startsWith("/")
    ? withoutHash
    : `/${withoutHash}`;

  return withLeadingSlash.length > 1
    ? withLeadingSlash.replace(/\/+$/, "")
    : withLeadingSlash;
}

function normalizeLocation(route) {
  if (typeof route !== "string" || route.trim().length === 0) {
    throw new TypeError("Die Route muss ein nicht leerer String sein.");
  }
  const withoutHash = route.trim().replace(/^#/, "");
  const queryIndex = withoutHash.indexOf("?");
  const path = normalizeRoute(queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash);
  const search = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "";
  return search ? `${path}?${search}` : path;
}

function parseLocation(location) {
  const normalized = normalizeLocation(location);
  const queryIndex = normalized.indexOf("?");
  const route = queryIndex >= 0 ? normalized.slice(0, queryIndex) : normalized;
  const search = queryIndex >= 0 ? normalized.slice(queryIndex + 1) : "";
  const query = {};
  new URLSearchParams(search).forEach((value, key) => {
    query[key] = value;
  });
  return { normalized, route, search, query: Object.freeze(query) };
}

function createRouteTable(routes) {
  if (routes === null || typeof routes !== "object" || Array.isArray(routes)) {
    throw new TypeError("routes muss ein Objekt mit Routen und Handlern sein.");
  }

  const routeTable = new Map();

  Object.entries(routes).forEach(([route, definition]) => {
    const normalizedRoute = normalizeRoute(route);
    let handler = null;

    if (typeof definition === "function") {
      handler = definition;
    } else if (definition?.handler && typeof definition.handler === "function") {
      handler = definition.handler;
    } else if (definition !== null && definition !== undefined) {
      throw new TypeError(
        `Die Route "${normalizedRoute}" benötigt einen Funktions-Handler.`,
      );
    }

    if (routeTable.has(normalizedRoute)) {
      throw new TypeError(`Die Route "${normalizedRoute}" ist mehrfach definiert.`);
    }

    routeTable.set(normalizedRoute, handler);
  });

  return routeTable;
}

function getRouteFromHash(windowObject) {
  const hash = windowObject.location?.hash ?? "";

  if (hash === "" || hash === "#") {
    return null;
  }

  return normalizeLocation(hash);
}

function toHash(route) {
  return `#${normalizeLocation(route)}`;
}

function replaceHash(windowObject, hash) {
  if (typeof windowObject.history?.replaceState === "function") {
    const pathname = windowObject.location?.pathname ?? "";
    const search = windowObject.location?.search ?? "";
    windowObject.history.replaceState(
      windowObject.history.state ?? null,
      "",
      `${pathname}${search}${hash}`,
    );
    return;
  }

  if (typeof windowObject.location?.replace === "function") {
    windowObject.location.replace(hash);
    return;
  }

  windowObject.location.hash = hash;
}

function requireActiveRouter() {
  if (!activeRouter) {
    throw new Error("Es wurde noch kein Router erstellt.");
  }

  return activeRouter;
}

/**
 * Creates and activates a UI-neutral hash router.
 *
 * Routes are supplied as an object whose keys are paths and whose values are
 * handler functions (or objects containing a `handler` function).
 *
 * @param {Record<string, Function|{handler: Function}|null>} routes Route map.
 * @param {object} [options] Router configuration.
 * @param {string} [options.defaultRoute="/dashboard"] Route used without a hash.
 * @param {Function} [options.onNotFound] Callback for unknown routes.
 * @param {Function} [options.onRouteChange] Callback after every dispatch.
 * @param {Window|object} [options.window] Browser window or compatible test fake.
 * @returns {{navigateTo: Function, getCurrentRoute: Function, start: Function, stop: Function}}
 * The created router instance.
 */
export function createRouter(routes, options = {}) {
  const routeTable = createRouteTable(routes);
  const defaultRoute = normalizeRoute(options.defaultRoute ?? "/dashboard");
  const windowObject = options.window ?? globalThis.window;

  if (
    !windowObject?.location
    || typeof windowObject.addEventListener !== "function"
    || typeof windowObject.removeEventListener !== "function"
  ) {
    throw new TypeError("Für den Router wird ein kompatibles window-Objekt benötigt.");
  }

  if (options.onNotFound != null && typeof options.onNotFound !== "function") {
    throw new TypeError("onNotFound muss eine Funktion sein.");
  }

  if (options.onRouteChange != null && typeof options.onRouteChange !== "function") {
    throw new TypeError("onRouteChange muss eine Funktion sein.");
  }

  let currentRoute = null;
  let currentLocation = null;
  let started = false;
  let navigationInProgress = false;

  function dispatch(route, source) {
    const parsed = parseLocation(route);
    const normalizedRoute = parsed.route;
    const previousRoute = currentRoute;
    const handler = routeTable.get(normalizedRoute);
    const isKnownRoute = routeTable.has(normalizedRoute);
    const context = Object.freeze({
      route: normalizedRoute,
      previousRoute,
      source,
      isKnownRoute,
      repeated: currentLocation === parsed.normalized,
      search: parsed.search,
      query: parsed.query,
    });

    currentRoute = normalizedRoute;
    currentLocation = parsed.normalized;

    if (isKnownRoute) {
      handler?.(context);
    } else {
      options.onNotFound?.(normalizedRoute, context);
    }

    options.onRouteChange?.(normalizedRoute, context);
    return normalizedRoute;
  }

  function handleHashChange() {
    if (navigationInProgress) {
      return;
    }

    const location = getRouteFromHash(windowObject) ?? defaultRoute;

    // navigate() dispatches synchronously. A later native hashchange for the
    // same target must not render the route a second time.
    if (location !== currentLocation) {
      dispatch(location, "hashchange");
    }
  }

  function navigate(route, navigationOptions = {}) {
    const targetLocation = normalizeLocation(route);
    const normalizedRoute = normalizeRoute(targetLocation);
    const targetHash = toHash(targetLocation);
    const locationRoute = getRouteFromHash(windowObject);

    if (locationRoute === targetLocation) {
      return dispatch(targetLocation, "navigate");
    }

    if (navigationOptions.replace === true) {
      replaceHash(windowObject, targetHash);
    } else {
      navigationInProgress = true;

      try {
        windowObject.location.hash = targetHash;
      } finally {
        navigationInProgress = false;
      }
    }

    // Browser hashchange is asynchronous, while a test fake may emit it
    // synchronously. Dispatch exactly once in both environments.
    if (currentLocation !== targetLocation) {
      dispatch(targetLocation, "navigate");
    }

    return normalizedRoute;
  }

  function getRoute() {
    const location = getRouteFromHash(windowObject);
    return currentRoute ?? (location ? parseLocation(location).route : defaultRoute);
  }

  function stop() {
    if (!started) {
      return;
    }

    windowObject.removeEventListener("hashchange", handleHashChange);
    started = false;
  }

  function start() {
    if (started) {
      return stop;
    }

    windowObject.addEventListener("hashchange", handleHashChange);
    started = true;

    const initialRoute = getRouteFromHash(windowObject);

    if (initialRoute === null) {
      replaceHash(windowObject, toHash(defaultRoute));
      dispatch(defaultRoute, "start");
    } else {
      dispatch(initialRoute, "start");
    }

    return stop;
  }

  const router = Object.freeze({
    navigateTo: navigate,
    getCurrentRoute: getRoute,
    start,
    stop,
  });

  activeRouter?.stop();
  activeRouter = router;
  return router;
}

/**
 * Navigates the active router to a route and optionally replaces history.
 *
 * @param {string} route Route path or hash, for example `#/learn`.
 * @param {{replace?: boolean}} [options] Navigation behavior.
 * @returns {string} Normalized route path.
 */
export function navigateTo(route, options = {}) {
  return requireActiveRouter().navigateTo(route, options);
}

/**
 * Returns the normalized path of the active router.
 *
 * @returns {string|null} Current route, or `null` before a router exists.
 */
export function getCurrentRoute() {
  return activeRouter?.getCurrentRoute() ?? null;
}

/**
 * Starts the active router once and returns its stable stop function.
 *
 * @returns {Function} Function that removes the hashchange listener.
 */
export function startRouter() {
  return requireActiveRouter().start();
}
