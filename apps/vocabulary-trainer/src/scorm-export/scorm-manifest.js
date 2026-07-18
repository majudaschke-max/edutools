function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function scormIdentifiers(packageId) {
  const token = String(packageId).replace(/[^A-Za-z0-9_.-]/g, "-");
  return Object.freeze({
    manifest: `MANIFEST-${token}`,
    organization: `ORG-${token}`,
    item: `ITEM-${token}`,
    resource: `RES-${token}`,
  });
}

export function createScorm12Manifest(options) {
  const identifiers = scormIdentifiers(options.packageId);
  const files = [...new Set(options.files)].sort();
  const fileXml = files.map((file) => `      <file href="${xml(file)}"/>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${xml(identifiers.manifest)}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="${xml(identifiers.organization)}">
    <organization identifier="${xml(identifiers.organization)}">
      <title>${xml(options.organizationTitle)}</title>
      <item identifier="${xml(identifiers.item)}" identifierref="${xml(identifiers.resource)}">
        <title>${xml(options.title)}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="${xml(identifiers.resource)}" type="webcontent" adlcp:scormtype="sco" href="index.html">
${fileXml}
    </resource>
  </resources>
</manifest>
`;
}

export function inspectScorm12Manifest(source) {
  const text = String(source);
  const files = [...text.matchAll(/<file\s+href="([^"]+)"\s*\/>/g)].map((match) => match[1]);
  return Object.freeze({
    hasXmlDeclaration: /^<\?xml version="1\.0" encoding="UTF-8"\?>/.test(text),
    organizationCount: (text.match(/<organization\s/g) ?? []).length,
    itemCount: (text.match(/<item\s/g) ?? []).length,
    resourceCount: (text.match(/<resource\s/g) ?? []).length,
    defaultOrganization: text.match(/<organizations\s+default="([^"]+)"/)?.[1] ?? null,
    organizationIdentifier: text.match(/<organization\s+identifier="([^"]+)"/)?.[1] ?? null,
    itemIdentifierRef: text.match(/<item[^>]*\sidentifierref="([^"]+)"/)?.[1] ?? null,
    resourceIdentifier: text.match(/<resource\s+identifier="([^"]+)"/)?.[1] ?? null,
    startFile: text.match(/<resource[^>]*\shref="([^"]+)"/)?.[1] ?? null,
    scormType: text.match(/adlcp:scormtype="([^"]+)"/)?.[1] ?? null,
    files,
    source: text,
  });
}
