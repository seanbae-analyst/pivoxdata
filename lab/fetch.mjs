// fetch.mjs — download every lab series from ECOS into lab/data/*.json, with provenance.
// Usage: node lab/fetch.mjs            (all series)
//        node lab/fetch.mjs credit      (one series by id)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SERIES, ANNUAL, TABLES } from "./series.mjs";
import { series, orgName, URL_TEMPLATE } from "./ecos.mjs";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");
const only = process.argv.slice(2);
const today = new Date().toISOString().slice(0, 10);
const orgs = {};

for (const s of [...SERIES, ...ANNUAL]) {
  if (only.length && !only.includes(s.id)) continue;
  const rows = await series(s);
  orgs[s.table] ??= await orgName(s.table);
  const t = TABLES[s.table];
  const doc = {
    id: s.id, label: s.label ?? null, kind: s.kind ?? null, unit: s.unit ?? null,
    source: { site: "한국은행 ECOS", table: s.table, table_name: t.name, compiled_by: t.agency, ecos_org_name: orgs[s.table], items: s.items, cycle: s.cycle, url_template: URL_TEMPLATE },
    fetched_at: today, first: rows[0]?.[0] ?? null, last: rows.at(-1)?.[0] ?? null, n: rows.length, rows,
  };
  fs.writeFileSync(path.join(DIR, `${s.id}.json`), JSON.stringify(doc) + "\n");
  console.log(`${s.id.padEnd(22)} ${String(rows.length).padStart(4)} rows  ${doc.first}–${doc.last}`);
}
