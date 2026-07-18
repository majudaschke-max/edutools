const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;
const FIXED_DOS_DATE = 0x0021;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let value = n;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  CRC_TABLE[n] = value >>> 0;
}

function bytes(value) {
  if (typeof value === "string") return encoder.encode(value);
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  throw new TypeError("ZIP-Daten müssen Text, ArrayBuffer oder Bytes sein.");
}

function concatenate(parts) {
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function header(size) {
  const value = new Uint8Array(size);
  return { value, view: new DataView(value.buffer) };
}

export function crc32(input) {
  const inputBytes = bytes(input);
  let crc = 0xffffffff;
  for (const byte of inputBytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function validateZipEntryPath(rawPath) {
  const value = String(rawPath);
  if (!value || value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) {
    throw new Error(`Unsicherer ZIP-Pfad: ${value}`);
  }
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Unsicherer ZIP-Pfad: ${value}`);
  }
  if (/(^|\/)(?:\.DS_Store|Thumbs\.db)$/.test(value)) {
    throw new Error(`Verbotener ZIP-Eintrag: ${value}`);
  }
  return value;
}

/** Deterministic, dependency-free ZIP STORE encoder shared by Browser and CLI. */
export function createStoredZipBytes(entries) {
  const normalized = entries.map((entry) => ({
    path: validateZipEntryPath(entry.path),
    data: bytes(entry.data),
  })).sort((left, right) => left.path.localeCompare(right.path));
  if (normalized.length > 0xffff) throw new Error("ZIP enthält zu viele Einträge.");
  if (new Set(normalized.map((entry) => entry.path)).size !== normalized.length) {
    throw new Error("ZIP-Einträge müssen eindeutig sein.");
  }

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of normalized) {
    const name = encoder.encode(entry.path);
    const checksum = crc32(entry.data);
    const local = header(30);
    local.view.setUint32(0, LOCAL_SIGNATURE, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, UTF8_FLAG, true);
    local.view.setUint16(8, STORE_METHOD, true);
    local.view.setUint16(10, 0, true);
    local.view.setUint16(12, FIXED_DOS_DATE, true);
    local.view.setUint32(14, checksum, true);
    local.view.setUint32(18, entry.data.byteLength, true);
    local.view.setUint32(22, entry.data.byteLength, true);
    local.view.setUint16(26, name.byteLength, true);
    local.view.setUint16(28, 0, true);
    localParts.push(local.value, name, entry.data);

    const central = header(46);
    central.view.setUint32(0, CENTRAL_SIGNATURE, true);
    central.view.setUint16(4, 20, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(8, UTF8_FLAG, true);
    central.view.setUint16(10, STORE_METHOD, true);
    central.view.setUint16(12, 0, true);
    central.view.setUint16(14, FIXED_DOS_DATE, true);
    central.view.setUint32(16, checksum, true);
    central.view.setUint32(20, entry.data.byteLength, true);
    central.view.setUint32(24, entry.data.byteLength, true);
    central.view.setUint16(28, name.byteLength, true);
    central.view.setUint16(30, 0, true);
    central.view.setUint16(32, 0, true);
    central.view.setUint16(34, 0, true);
    central.view.setUint16(36, 0, true);
    central.view.setUint32(38, 0, true);
    central.view.setUint32(42, offset, true);
    centralParts.push(central.value, name);
    offset += local.value.byteLength + name.byteLength + entry.data.byteLength;
  }

  const centralDirectory = concatenate(centralParts);
  const end = header(22);
  end.view.setUint32(0, END_SIGNATURE, true);
  end.view.setUint16(4, 0, true);
  end.view.setUint16(6, 0, true);
  end.view.setUint16(8, normalized.length, true);
  end.view.setUint16(10, normalized.length, true);
  end.view.setUint32(12, centralDirectory.byteLength, true);
  end.view.setUint32(16, offset, true);
  end.view.setUint16(20, 0, true);
  return concatenate([...localParts, centralDirectory, end.value]);
}

function findEnd(input, view) {
  const minimum = Math.max(0, input.byteLength - 65557);
  for (let offset = input.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === END_SIGNATURE) return offset;
  }
  throw new Error("ZIP-Endverzeichnis fehlt.");
}

export function inspectStoredZipBytes(input) {
  const inputBytes = bytes(input);
  const view = new DataView(inputBytes.buffer, inputBytes.byteOffset, inputBytes.byteLength);
  const endOffset = findEnd(inputBytes, view);
  const count = view.getUint16(endOffset + 10, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  if (centralOffset + centralSize !== endOffset) {
    throw new Error("ZIP-Central-Directory ist inkonsistent.");
  }
  const entries = [];
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
      throw new Error("ZIP-Central-Directory-Eintrag fehlt.");
    }
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const checksum = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(inputBytes.slice(cursor + 46, cursor + 46 + nameLength));
    validateZipEntryPath(name);
    if (!(flags & UTF8_FLAG) || method !== STORE_METHOD || compressedSize !== size) {
      throw new Error(`Nicht unterstützter ZIP-Eintrag: ${name}`);
    }
    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
      throw new Error(`Lokaler ZIP-Header fehlt: ${name}`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const localName = decoder.decode(inputBytes.slice(localOffset + 30, localOffset + 30 + localNameLength));
    if (localName !== name) throw new Error(`ZIP-Dateiname ist inkonsistent: ${name}`);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const data = inputBytes.slice(dataOffset, dataOffset + size);
    if (data.byteLength !== size || crc32(data) !== checksum) {
      throw new Error(`ZIP-CRC oder Größe stimmt nicht: ${name}`);
    }
    entries.push(Object.freeze({ path: name, size, crc32: checksum, data }));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) {
    throw new Error("ZIP enthält doppelte Einträge.");
  }
  return Object.freeze({ entries: Object.freeze(entries), bytes: inputBytes.byteLength });
}
