import { inspectScorm12Manifest } from "./scorm-manifest.js";

const decoder = new TextDecoder("utf-8", { fatal: true });
const TEXT_FILE = /\.(?:html|css|js|json|xml|svg)$/iu;
const ROOT_REQUIRED = Object.freeze(["imsmanifest.xml", "index.html"]);

function cleanReference(reference) {
  return String(reference).split(/[?#]/u)[0];
}

function resolveReference(fromFile, reference) {
  const result = String(fromFile).split("/").slice(0, -1);
  for (const segment of cleanReference(reference).split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (result.length === 0) throw new Error(`Dateireferenz verlässt das SCORM-Paket: ${reference}`);
      result.pop();
    } else result.push(segment);
  }
  return result.join("/");
}

function assertRelativePackageReference(reference, context, options = {}) {
  const value = String(reference).trim();
  if (!value) throw new Error(`${context} enthält eine leere Dateireferenz.`);
  if (value.startsWith("#") && options.allowFragment) return "fragment";
  if (
    value.startsWith("/")
    || value.startsWith("\\")
    || value.startsWith("//")
    || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)
    || value.includes("\\")
    || (options.noParentSegments && cleanReference(value).split("/").includes(".."))
  ) throw new Error(`${context} ist nicht paketrelativ: ${value}`);
  if (/\b(?:local(?:host)|127[.]0[.]0[.]1)\b/iu.test(value) || /[?&]id=/iu.test(value)) {
    throw new Error(`${context} enthält eine unzulässige LMS- oder Entwicklungsreferenz: ${value}`);
  }
  if (options.noQueryOrHash && /[?#]/u.test(value)) {
    throw new Error(`${context} darf weder Query noch Hash enthalten: ${value}`);
  }
  return value;
}

function extractStaticReferences(path, source) {
  if (path.endsWith(".html")) {
    return [...source.matchAll(/(?:src|href)="([^"]+)"/gu)].map((match) => match[1]);
  }
  if (path.endsWith(".css")) {
    return [...source.matchAll(/(?:@import\s+url|url)\(["']?([^"')]+)["']?\)/gu)].map((match) => match[1]);
  }
  if (path.endsWith(".js")) {
    return [...source.matchAll(/(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/gu)].map((match) => match[1]);
  }
  if (path.endsWith(".json")) {
    let value;
    try { value = JSON.parse(source); } catch { return []; }
    const references = [];
    const visit = (candidate) => {
      if (Array.isArray(candidate)) candidate.forEach(visit);
      else if (candidate && typeof candidate === "object") {
        for (const [key, child] of Object.entries(candidate)) {
          if (key === "file" && typeof child === "string") references.push(child);
          else visit(child);
        }
      }
    };
    visit(value);
    return references;
  }
  return [];
}

export function validateScormManifestSource(source, physicalFiles) {
  const inspected = inspectScorm12Manifest(source);
  if (!inspected.hasXmlDeclaration || !source.includes("<schema>ADL SCORM</schema>") || !source.includes("<schemaversion>1.2</schemaversion>")) {
    throw new Error("imsmanifest.xml enthält keine gültigen SCORM-1.2-Metadaten.");
  }
  if (inspected.organizationCount !== 1 || inspected.itemCount !== 1 || inspected.resourceCount !== 1) {
    throw new Error("imsmanifest.xml benötigt genau eine Organization, ein Item und eine SCO-Ressource.");
  }
  if (!inspected.defaultOrganization || inspected.defaultOrganization !== inspected.organizationIdentifier) {
    throw new Error("imsmanifest.xml verweist nicht auf die deklarierte Standard-Organization.");
  }
  if (!inspected.itemIdentifierRef || inspected.itemIdentifierRef !== inspected.resourceIdentifier) {
    throw new Error("imsmanifest.xml identifierref stimmt nicht mit der SCO-Ressource überein.");
  }
  assertRelativePackageReference(inspected.startFile, "SCORM-Startressource", { noQueryOrHash: true, noParentSegments: true });
  if (inspected.startFile !== "index.html" || inspected.scormType !== "sco") {
    throw new Error("SCORM-Startressource muss die relative Datei index.html sein.");
  }
  const files = [...physicalFiles].sort();
  const declared = inspected.files.map((file) => (
    assertRelativePackageReference(file, "SCORM-Manifestdatei", { noQueryOrHash: true, noParentSegments: true })
  ));
  if (declared.join("\n") !== [...declared].sort().join("\n")) {
    throw new Error("SCORM-Manifestdateien müssen sortiert sein.");
  }
  if (declared.join("\n") !== files.join("\n")) {
    throw new Error("imsmanifest.xml bildet den Paketdateibaum nicht vollständig ab.");
  }
  if (!files.includes(inspected.startFile)) throw new Error("Die SCORM-Startdatei fehlt im Paket.");
  return inspected;
}

/** Browser-safe package validation used before download and after ZIP inspection. */
export function validateScormPackageEntries(entries) {
  if (!Array.isArray(entries)) throw new TypeError("SCORM-Paketdateien fehlen.");
  const paths = entries.map((entry) => entry?.path);
  if (paths.some((path) => typeof path !== "string" || !path)) throw new Error("SCORM-Paket enthält einen ungültigen Dateipfad.");
  if (new Set(paths).size !== paths.length) throw new Error("SCORM-Paket enthält doppelte Dateipfade.");
  for (const required of ROOT_REQUIRED) {
    if (!paths.includes(required)) throw new Error(`SCORM-Pflichtdatei fehlt im ZIP-Root: ${required}`);
  }
  const byPath = new Map(entries.map((entry) => [entry.path, entry.data]));
  const manifest = decoder.decode(byPath.get("imsmanifest.xml"));
  const inspected = validateScormManifestSource(manifest, paths);

  for (const entry of entries) {
    if (!TEXT_FILE.test(entry.path)) continue;
    const source = decoder.decode(entry.data);
    const withoutStandardNamespaces = source
      .replaceAll("http://www.w3.org/2000/svg", "")
      .replaceAll("http://www.w3.org/2001/XMLSchema-instance", "")
      .replaceAll("http://www.imsproject.org/xsd/imscp_rootv1p1p2", "")
      .replaceAll("http://www.adlnet.org/xsd/adlcp_rootv1p2", "");
    if (/file:\/\/|\/(?:Users|home)\/|\b(?:local(?:host)|127[.]0[.]0[.]1)\b/iu.test(withoutStandardNamespaces)) {
      throw new Error(`SCORM-Paket enthält einen lokalen Maschinen- oder Entwicklungsverweis: ${entry.path}`);
    }
    if (/https?:\/\//iu.test(withoutStandardNamespaces) || /[?&]id=/iu.test(withoutStandardNamespaces)) {
      throw new Error(`SCORM-Paket enthält eine externe oder LMS-spezifische URL: ${entry.path}`);
    }
    if (/\b(?:window\.)?(?:top|parent)\.location\b|\bwindow\.opener\.location\b/iu.test(source)) {
      throw new Error(`SCORM-Paket darf das LMS-Fenster nicht navigieren: ${entry.path}`);
    }
    for (const reference of extractStaticReferences(entry.path, source)) {
      const checked = assertRelativePackageReference(reference, `Dateireferenz in ${entry.path}`, { allowFragment: true });
      if (checked === "fragment") continue;
      // Runtime JSON paths are consumed by the app entry document and are
      // therefore package-root-relative even when the JSON itself lives in
      // `runtime/`.
      const resolved = resolveReference(entry.path.endsWith(".json") ? "index.html" : entry.path, checked);
      if (!byPath.has(resolved)) throw new Error(`SCORM-Dateireferenz fehlt im Paket: ${entry.path} -> ${reference}`);
    }
  }
  return Object.freeze({ paths: Object.freeze([...paths]), manifest: inspected });
}
