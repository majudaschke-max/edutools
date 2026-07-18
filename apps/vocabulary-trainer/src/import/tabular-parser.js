export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
const DELIMITERS = ["\t", ";", ","];

function byteLength(text) {
  return typeof TextEncoder === "function"
    ? new TextEncoder().encode(text).length
    : unescape(encodeURIComponent(text)).length;
}

function countDelimiter(text, delimiter) {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && text[index] === delimiter) count += 1;
    else if (!quoted && (text[index] === "\n" || text[index] === "\r")) break;
  }
  return count;
}

export function detectDelimiter(text) {
  const counts = DELIMITERS.map((delimiter) => ({ delimiter, count: countDelimiter(text, delimiter) }));
  counts.sort((left, right) => right.count - left.count);
  return counts[0].count > 0 ? counts[0].delimiter : null;
}

function parseRows(text, delimiter) {
  const rows = [];
  const lineNumbers = [];
  let row = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let rowStart = 1;

  function finishRow() {
    row.push(field);
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
      lineNumbers.push(rowStart);
    }
    row = [];
    field = "";
    rowStart = line + 1;
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else {
        field += character;
        if (character === "\n") line += 1;
      }
      continue;
    }
    if (character === '"' && field.length === 0) quoted = true;
    else if (character === delimiter) {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      finishRow();
      line += 1;
    } else if (character === "\r") {
      if (text[index + 1] === "\n") index += 1;
      finishRow();
      line += 1;
    } else field += character;
  }
  if (field.length > 0 || row.length > 0) finishRow();
  return { rows, lineNumbers, incompleteQuote: quoted };
}

export function parseTabularText(value, options = {}) {
  const text = typeof value === "string" ? value.replace(/^\uFEFF/, "") : "";
  const errors = [];
  const warnings = [];
  if (!text.trim()) errors.push("Die Importquelle enthält keine Tabellenwerte.");
  if (byteLength(text) > (options.maxBytes ?? MAX_IMPORT_BYTES)) {
    errors.push("Die Datei ist größer als 2 MB.");
  }
  const delimiter = options.delimiter ?? detectDelimiter(text);
  if (!delimiter || !DELIMITERS.includes(delimiter)) {
    errors.push("Es wurde kein unterstütztes Trennzeichen erkannt.");
    return { headers: [], rows: [], rowNumbers: [], detectedDelimiter: null, warnings, errors };
  }
  const parsed = parseRows(text, delimiter);
  if (parsed.incompleteQuote) errors.push("Eine zitierte Tabellenzeile ist nicht vollständig abgeschlossen.");
  const hasHeaders = options.hasHeaders !== false;
  const dataRowCount = Math.max(0, parsed.rows.length - (hasHeaders ? 1 : 0));
  if (dataRowCount > (options.maxRows ?? MAX_IMPORT_ROWS)) {
    errors.push(`Der Import darf höchstens ${options.maxRows ?? MAX_IMPORT_ROWS} Datenzeilen enthalten.`);
  }
  const width = Math.max(0, ...parsed.rows.map((row) => row.length));
  const headers = hasHeaders
    ? (parsed.rows[0] ?? []).map((header, index) => header.trim() || `Spalte ${index + 1}`)
    : Array.from({ length: width }, (_, index) => `Spalte ${index + 1}`);
  const rows = hasHeaders ? parsed.rows.slice(1) : parsed.rows;
  const rowNumbers = hasHeaders ? parsed.lineNumbers.slice(1) : parsed.lineNumbers;
  if (rows.some((row) => row.length !== width)) warnings.push("Einige Zeilen besitzen unterschiedlich viele Spalten.");
  return { headers, rows, rowNumbers, detectedDelimiter: delimiter, warnings, errors };
}
