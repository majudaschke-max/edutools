import { createStaticServer, listenStaticServer, closeStaticServer } from "./static-server.js";

async function expectResponse(baseUrl, pathname, expected) {
  const response = await fetch(`${baseUrl}${pathname}`);
  if (response.status !== expected.status) {
    throw new Error(`Smoke-Test ${pathname}: erwartet ${expected.status}, erhalten ${response.status}.`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (expected.type && !contentType.startsWith(expected.type)) {
    throw new Error(`Smoke-Test ${pathname}: unerwarteter Content-Type „${contentType}".`);
  }
  const text = await response.text();
  if (expected.contains && !text.includes(expected.contains)) {
    throw new Error(`Smoke-Test ${pathname}: erwarteter Inhalt fehlt.`);
  }
  return { pathname, status: response.status, contentType };
}

export async function runReleaseSmokeTests(releaseRoot, deployment) {
  const server = createStaticServer({ root: releaseRoot });
  const address = await listenStaticServer(server);
  const author = deployment.entries.find((entry) => entry.profile.mode === "author");
  const learner = deployment.entries.find((entry) => entry.profile.mode === "learner");
  const mounted = (entry, file = "") => `/${entry.mountPath ? `${entry.mountPath}/` : ""}${file}`;
  try {
    const checks = [
      ["/", { status: 200, type: "text/html", contains: "data-vocabulary-app" }],
      [mounted(learner, "runtime/deployment-profile.json"), { status: 200, type: "application/json", contains: learner.profile.deploymentId }],
      [mounted(learner, "data/course.json"), { status: 200, type: "application/json", contains: learner.course.id }],
      [mounted(learner, "design-system/css/tokens.css"), { status: 200, type: "text/css" }],
      [mounted(learner, "design-system/css/brand-core.css"), { status: 200, type: "text/css" }],
      [mounted(learner, "design-system/css/themes/vocabulary.css"), { status: 200, type: "text/css" }],
      [mounted(learner, "app.js"), { status: 200, type: "text/javascript" }],
      [mounted(author), { status: 200, type: "text/html", contains: "data-course-builder-content" }],
      [mounted(author, "runtime/deployment-profile.json"), { status: 200, type: "application/json", contains: author.profile.deploymentId }],
      ["/.nojekyll", { status: 200, type: "text/plain" }],
      ["/release-manifest.json", { status: 200, type: "application/json", contains: deployment.deploymentSetId }],
      ["/does-not-exist", { status: 404, type: "text/html", contains: "Seite nicht gefunden" }],
    ];
    const results = [];
    for (const [pathname, expected] of checks) {
      results.push(await expectResponse(address.url, pathname, expected));
    }
    return Object.freeze({ url: address.url, checks: Object.freeze(results) });
  } finally {
    await closeStaticServer(server);
  }
}
