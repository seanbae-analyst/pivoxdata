// fetch.mjs — download every trends series into trends/data/*.json, with provenance.
// Usage: node trends/fetch.mjs              (all sources)
//        node trends/fetch.mjs npm pypi     (some sources: npm · pypi · arxiv · hf · sec · ax)
// Re-running is cheap: npm and arXiv re-read only recent periods and keep the rest, PyPI keeps days that
// pypistats no longer serves (it only has ~180), and Hugging Face adds one dated snapshot per day.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NPM, PYPI, NPM_CONTROL, PYPI_CONTROL, ARXIV_DOMAINS, HF, SEC, AX } from "./series.mjs";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");
const only = process.argv.slice(2);
const want = (s) => !only.length || only.includes(s);
const today = new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { return d; } };
const write = (f, doc) => fs.writeFileSync(path.join(DIR, f), JSON.stringify(doc) + "\n");
const UA = { "User-Agent": "pivoxdata-trends/1.0 (+https://github.com/seanbae-analyst/pivoxdata)" };

// GitHub's runners share IP addresses, so a source can say "too many requests" (429) to a run that sent only a
// few: wait as long as it asks (Retry-After), else back off up to two minutes, before giving up
async function get(url, as = "json", tries = 8) {
  for (let i = 0; ; i++) {
    let wait = Math.min(120_000, 2000 * 2 ** i);
    try {
      const res = await fetch(url, { headers: url.includes("sec.gov") ? { "User-Agent": SEC.ua } : UA });
      if (res.status === 404) return null;
      if (!res.ok) {
        const after = Number(res.headers.get("retry-after"));
        if (res.status === 429 && after > 0) wait = Math.min(300_000, after * 1000 + 1000);
        throw new Error(`HTTP ${res.status}`);
      }
      return as === "json" ? await res.json() : await res.text();
    } catch (e) {
      if (i >= tries - 1) throw new Error(`${url}: ${e.message}`);
      console.log(`      ${e.message} — retrying in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
    }
  }
}
const addDays = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

// ---------- npm: daily downloads, read in ≤ 365-day windows (the API's limit) ----------
if (want("npm")) {
  const doc = read("npm.json", { packages: {} });
  for (const p of [...NPM, ...NPM_CONTROL]) {
    const old = doc.packages[p.pkg]?.days ?? [];
    // keep everything older than 30 days; re-read the last 30 (the newest day can be revised once)
    const keep = old.filter(([d]) => d < addDays(today, -30));
    let from = keep.length ? addDays(keep.at(-1)[0], 1) : "2023-01-01";
    const days = [...keep];
    while (from < today) {
      const to = [addDays(from, 364), addDays(today, -1)].sort()[0];
      const j = await get(`https://api.npmjs.org/downloads/range/${from}:${to}/${p.pkg.replace("/", "%2F")}`);
      for (const r of j?.downloads ?? []) days.push([r.day, r.downloads]);
      from = addDays(to, 1);
      await sleep(1000);
    }
    // the point API's last-week total, kept as an independent second reading for verify.mjs
    const wk = await get(`https://api.npmjs.org/downloads/point/last-week/${p.pkg.replace("/", "%2F")}`);
    doc.packages[p.pkg] = { ...p, days, last_week: wk ? { start: wk.start, end: wk.end, downloads: wk.downloads } : null };
    console.log(`npm   ${p.pkg.padEnd(28)} ${days.length} days → ${days.at(-1)?.[0]}`);
    await sleep(1000); // npm rate-limits per IP; 44 requests a day spread over a minute is plenty
  }
  write("npm.json", { source: { site: "npm registry download counts API", url: "https://api.npmjs.org/downloads/range/{start}:{end}/{package}", docs: "https://github.com/npm/registry/blob/main/docs/download-counts.md" }, fetched_at: today, ...doc, packages: doc.packages });
}

// ---------- PyPI via pypistats: daily downloads without mirrors (~180 days served) ----------
if (want("pypi")) {
  const doc = read("pypi.json", { packages: {} });
  for (const p of [...PYPI, ...PYPI_CONTROL]) {
    const j = await get(`https://pypistats.org/api/packages/${p.pkg}/overall?mirrors=false`);
    const fresh = (j?.data ?? []).filter((r) => r.category === "without_mirrors").map((r) => [r.date, r.downloads]);
    const seen = new Map((doc.packages[p.pkg]?.days ?? []).map(([d, v]) => [d, v]));
    for (const [d, v] of fresh) seen.set(d, v); // pypistats wins for the days it still serves
    const days = [...seen.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const recent = await get(`https://pypistats.org/api/packages/${p.pkg}/recent?mirrors=false`);
    doc.packages[p.pkg] = { ...p, days, recent: recent?.data ?? null };
    console.log(`pypi  ${p.pkg.padEnd(28)} ${days.length} days → ${days.at(-1)?.[0]}`);
    await sleep(1200); // pypistats rate-limits by IP; the data changes once a day anyway
  }
  write("pypi.json", { source: { site: "pypistats.org (PyPI BigQuery public dataset, without known mirrors)", url: "https://pypistats.org/api/packages/{package}/overall?mirrors=false", licence: "PyPI BigQuery data: CC BY 4.0 (docs.pypi.org/api/bigquery)" }, fetched_at: today, packages: doc.packages });
}

// ---------- arXiv: monthly counts per field, one query per month × phrase, ≥ 3 s apart (arXiv API terms) ----------
if (want("arxiv")) {
  const old = read("arxiv.json", {});
  // the file used to hold the AI field only; it becomes domains.ai
  const doc = old.domains ? old : { domains: old.total ? { ai: { total: old.total, terms: old.terms } } : {} };
  const now = new Date(), lastFull = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)); // end of last month
  const monthsFrom = (start) => { const out = []; for (let y = +start.slice(0, 4), m = +start.slice(4); y * 12 + m <= lastFull.getUTCFullYear() * 12 + lastFull.getUTCMonth() + 1; m++) { if (m > 12) { m = 1; y++; } out.push(`${y}${String(m).padStart(2, "0")}`); } return out; };
  const count = async (q, ym) => {
    const last = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(4), 0)).getUTCDate();
    // max_results=1, not 0: the API answers 0 with an internal error
    const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(`${q} AND submittedDate:[${ym}010000 TO ${ym}${last}2359]`)}&max_results=1`;
    for (let i = 0; i < 4; i++) {
      const xml = await get(url, "text"); await sleep(3100);
      const n = +(xml.match(/<opensearch:totalResults[^>]*>(\d+)</)?.[1] ?? NaN);
      if (!/arxiv\.org\/api\/errors/.test(xml) && Number.isFinite(n)) return n;
      await sleep(5000 * (i + 1));
    }
    throw new Error(`arXiv kept failing for ${q} ${ym}`);
  };
  const save = () => write("arxiv.json", {
    source: { site: "arXiv API", url: "https://export.arxiv.org/api/query", licence: "metadata CC0 1.0 (info.arxiv.org/help/license)" }, fetched_at: today,
    domains: Object.fromEntries(ARXIV_DOMAINS.map((f) => { const d = doc.domains[f.id] ?? { total: {}, terms: {} }; const months = monthsFrom(f.start).filter((m) => d.total[m] != null && f.terms.every((t) => d.terms[t.id]?.[m] != null));
      return [f.id, { name: f.name, scope: f.scope, months, total: d.total, terms: d.terms, queries: Object.fromEntries(f.terms.map((t) => [t.id, t.q])) }]; })),
  });
  // newest month first across all fields, so a cut-short run still has every field's recent months
  const allMonths = [...new Set(ARXIV_DOMAINS.flatMap((f) => monthsFrom(f.start)))].sort().reverse();
  const recent = new Set(allMonths.slice(0, 2)); // late listings still land in the last two months: re-count them
  for (const ym of allMonths) {
    for (const f of ARXIV_DOMAINS) {
      if (ym < f.start) continue;
      const d = (doc.domains[f.id] ??= { total: {}, terms: {} });
      if (d.total[ym] == null || recent.has(ym)) d.total[ym] = await count(f.scope, ym);
      for (const t of f.terms) { d.terms[t.id] ??= {}; if (d.terms[t.id][ym] == null || recent.has(ym)) d.terms[t.id][ym] = await count(`${f.scope} AND abs:${t.q}`, ym); }
    }
    console.log(`arxiv ${ym} ${ARXIV_DOMAINS.filter((f) => ym >= f.start).map((f) => `${f.id} ${doc.domains[f.id].total[ym]}`).join(" · ")}`);
    save();
  }
  save();
}

// ---------- Hugging Face: one snapshot a day of the top-downloaded and trending models ----------
if (want("hf")) {
  const pick = (m) => ({ id: m.id, author: m.author ?? m.id.split("/")[0], downloads: m.downloads ?? 0, likes: m.likes ?? 0, task: m.pipeline_tag ?? null, created: (m.createdAt ?? "").slice(0, 10), trending: m.trendingScore ?? null });
  const top = await get(`https://huggingface.co/api/models?sort=downloads&direction=-1&limit=${HF.top}`);
  const trending = await get(`https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=${HF.trending}`);
  const tasks = {};
  for (const t of HF.tasks) tasks[t] = (await get(`https://huggingface.co/api/models?pipeline_tag=${t}&sort=trendingScore&direction=-1&limit=10`)).map(pick);
  const doc = read("hf.json", { snapshots: [] });
  const snaps = doc.snapshots.filter((s) => s.date !== today);
  snaps.push({ date: today, top: top.map(pick), trending: trending.map(pick), tasks });
  write("hf.json", { source: { site: "Hugging Face Hub API", url: "https://huggingface.co/api/models?sort={downloads|trendingScore}", note: "downloads = last 30 days, as the Hub reports it" }, fetched_at: today, snapshots: snaps.slice(-60) });
  console.log(`hf    snapshot ${today}: top ${top.length}, trending ${trending.length} (${snaps.length} snapshots kept)`);
}

// ---------- SEC: capex per calendar quarter, derived from year-to-date filings ----------
if (want("sec")) {
  const days = (a, b) => (new Date(b) - new Date(a)) / 864e5 + 1;
  // a fiscal quarter is named by the calendar quarter its last month falls in (Oracle's Jun–Aug quarter → Q3)
  const cq = (end) => `${end.slice(0, 4)}Q${Math.ceil(+end.slice(5, 7) / 3)}`;
  const out = {};
  for (const c of SEC.companies) {
    const j = await get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${c.cik}.json`, "json");
    // one value per (start, end): the latest filing wins (restatements); a later concept fills only what is missing
    const facts = new Map(), annual = [];
    for (const concept of SEC.concepts) {
      for (const f of j.facts["us-gaap"]?.[concept]?.units?.USD ?? []) {
        if (!f.start || !/^10-[QK]/.test(f.form)) continue;
        const k = `${f.start}|${f.end}`, prev = facts.get(k);
        if (!prev || (prev.concept === concept && f.filed > prev.filed)) facts.set(k, { start: f.start, end: f.end, val: f.val, filed: f.filed, form: f.form, concept });
      }
    }
    const all = [...facts.values()];
    // two readings per quarter where the filings allow: the 3-month figure as filed, and the year-to-date figure
    // minus the same year's previous cumulative one. The page uses the filed figure first.
    const direct = {}, diff = {};
    for (const f of all) {
      const d = days(f.start, f.end);
      if (d >= 80 && d <= 100) { direct[f.end] = f.val; continue; }
      // the fiscal-year figure from the annual report only (10-Qs also carry trailing-twelve-month sums)
      if (d > 340 && d < 380 && f.form.startsWith("10-K")) annual.push({ start: f.start, end: f.end, val: f.val });
      const prev = all.filter((g) => g.start === f.start && g.end < f.end).sort((a, b) => (a.end < b.end ? 1 : -1))[0];
      if (prev && d - days(prev.start, prev.end) >= 80 && d - days(prev.start, prev.end) <= 100) diff[f.end] = f.val - prev.val;
    }
    const ends = [...new Set([...Object.keys(direct), ...Object.keys(diff)])].sort();
    const quarters = ends.map((end) => ({ q: cq(end), end, val: direct[end] ?? diff[end], filed3m: direct[end] ?? null, ytdDiff: diff[end] ?? null }));
    out[c.id] = { ...c, entity: j.entityName, quarters, annual: annual.sort((a, b) => (a.end < b.end ? -1 : 1)) };
    console.log(`sec   ${c.name.padEnd(10)} ${quarters.length} quarters → ${quarters.at(-1)?.q} (${quarters.at(-1)?.end})`);
    await sleep(250); // SEC fair access: ≤ 10 requests per second
  }
  write("sec.json", { source: { site: "SEC EDGAR XBRL companyfacts", url: "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json", concepts: SEC.concepts, note: "US government data. Quarters derived from year-to-date 10-Q/10-K figures." }, fetched_at: today, companies: out });
}

// ---------- AX: Ramp AI Index from FRED, monthly, whole history each time (14 small CSVs) ----------
if (want("ax")) {
  const out = {};
  for (const x of AX.series) {
    const csv = await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${x.id}`, "text");
    const months = {};
    for (const line of (csv ?? "").trim().split("\n").slice(1)) {
      const [d, v] = line.split(",");
      if (v && v !== "." && !Number.isNaN(+v)) months[d.slice(0, 7)] = Math.round(+v * 100) / 100;
    }
    out[x.id] = { ...x, months };
    const k = Object.keys(months);
    console.log(`ax    ${x.id.padEnd(20)} ${k.length} months → ${k.at(-1)}`);
    await sleep(500);
  }
  write("ax.json", { source: { site: "Ramp AI Index (Ramp Economics Lab) via FRED, Federal Reserve Bank of St. Louis", url: "https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}", note: "Share of US businesses on Ramp paying for AI products, % per month. Copyrighted: citation required." }, fetched_at: today, series: out });
}
