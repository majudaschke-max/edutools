import http from "node:http";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  ["", "text/plain; charset=utf-8"],
]);

function safeRequestPath(rawUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(rawUrl, "http://localhost").pathname);
  } catch {
    return null;
  }
  if (pathname.includes("\0")) return null;
  const relative = pathname.replace(/^\/+/, "");
  const normalized = path.posix.normalize(relative);
  if (normalized === ".." || normalized.startsWith("../")) return null;
  return normalized;
}

async function resolveRequestFile(root, requestUrl) {
  const relative = safeRequestPath(requestUrl);
  if (relative === null) return null;
  let target = path.join(root, relative || "index.html");
  try {
    const metadata = await stat(target);
    if (metadata.isDirectory()) target = path.join(target, "index.html");
    const fileMetadata = await stat(target);
    return fileMetadata.isFile() ? target : null;
  } catch {
    return null;
  }
}

export function createStaticServer(options) {
  const root = path.resolve(options.root);
  return http.createServer(async (request, response) => {
    const method = request.method ?? "GET";
    if (!new Set(["GET", "HEAD"]).has(method)) {
      response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD" });
      response.end(method === "HEAD" ? undefined : "Methode nicht erlaubt.");
      return;
    }
    let target = await resolveRequestFile(root, request.url ?? "/");
    let statusCode = 200;
    if (!target) {
      target = path.join(root, "404.html");
      statusCode = 404;
    }
    try {
      const body = await readFile(target);
      const contentType = MIME_TYPES.get(path.extname(target).toLowerCase()) ?? "application/octet-stream";
      response.writeHead(statusCode, {
        "Content-Type": contentType,
        "Content-Length": body.byteLength,
        "X-Content-Type-Options": "nosniff",
      });
      response.end(method === "HEAD" ? undefined : body);
    } catch {
      const body = Buffer.from("Seite nicht gefunden.");
      response.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Length": body.byteLength,
        "X-Content-Type-Options": "nosniff",
      });
      response.end(method === "HEAD" ? undefined : body);
    }
  });
}

export async function listenStaticServer(server, options = {}) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, options.host ?? "127.0.0.1", resolve);
  });
  const address = server.address();
  return Object.freeze({
    host: typeof address === "object" ? address.address : options.host,
    port: typeof address === "object" ? address.port : options.port,
    url: `http://127.0.0.1:${typeof address === "object" ? address.port : options.port}`,
  });
}

export async function closeStaticServer(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
