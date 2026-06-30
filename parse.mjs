// parse.mjs — file -> {rows, columns} for the Node CLI (CSV via Papa, Excel via SheetJS).
// The browser does the same job with the CDN builds of these libraries.
import fs from "fs";
import Papa from "papaparse";
import * as XLSX from "xlsx";

export const norm = (c) => String(c).trim().toLowerCase().replace(/\s+/g, "_");

export function parseFile(path) {
  if (path.endsWith(".xlsx") || path.endsWith(".xls")) {
    const wb = XLSX.readFile(path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
    return { rows, columns: Object.keys(rows[0] || {}) };
  }
  const text = fs.readFileSync(path, "utf8");
  const res = Papa.parse(text, { header: true, dynamicTyping: false, skipEmptyLines: true });
  return { rows: res.data, columns: res.meta.fields };
}
