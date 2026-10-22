// parse.mjs — file -> {rows, columns, encoding} for the Node CLI (CSV via Papa, Excel via SheetJS).
// The browser does the same job in check.html with the same decoder (encoding.mjs).
import fs from "fs";
import Papa from "papaparse";
// SheetJS ESM build only exposes readFile on the default export, not as a named
// export — importing the namespace leaves XLSX.readFile undefined. We read the bytes
// ourselves and use XLSX.read, which works the same on every SheetJS version.
import XLSX from "xlsx";
import { decodeBytes } from "./encoding.mjs";

export const norm = (c) => String(c).trim().toLowerCase().replace(/\s+/g, "_");

// Excel's built-in short-date format (number format 14) is locale-dependent — a Korean
// Excel shows it as 2026-10-22 — but SheetJS renders it as US "m/d/yy" ("10/22/26"), a
// two-digit-year string no one can parse safely. dateNF overrides ONLY that format, so a
// date cell becomes ISO; cells with their own format (yyyy"년" m"월" d"일", hh:mm…) keep it.
export const XLSX_READ_OPTS = { cellDates: true, dateNF: "yyyy-mm-dd" };

export function parseFile(path) {
  const bytes = fs.readFileSync(path);
  if (/\.xlsx?$/i.test(path)) {
    const wb = XLSX.read(bytes, { type: "buffer", ...XLSX_READ_OPTS });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
    return { rows, columns: Object.keys(rows[0] || {}), encoding: "xlsx" };
  }
  const { text, encoding } = decodeBytes(bytes);
  const res = Papa.parse(text, { header: true, dynamicTyping: false, skipEmptyLines: true });
  return { rows: res.data, columns: res.meta.fields, encoding };
}
