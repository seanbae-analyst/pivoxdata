// experiment/run.mjs — the "so what" experiment harness.
//
// Claim under test: an LLM asked to analyze a CSV does not error on dirty data —
// it returns confident numbers computed on top of the defects. The SAME questions
// on the DataReady-cleaned file return different (correct) numbers.
//
// This script is the reproducible part: it produces dirty.csv, clean.csv, the
// exact prompts, and the deterministic ground truth. The LLM calls themselves are
// made with the Claude CLI (see PROTOCOL in SO_WHAT.md) and their raw transcripts
// are committed under results/ — nothing in the write-up is retyped by hand.
//
// Cleaning options mirror what a user gets from the web UI's recommended set:
// dedupe / ISO dates / clear placeholders & sentinels / drop empty cols / trim /
// unify each spelling cluster to its most common form (the UI's one-click pick) /
// mask PII (governance choice). Missing values stay missing — the tool refuses
// to impute, and the experiment keeps that honest.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseFile } from "../parse.mjs";
import { scoreDataset } from "../scorer.mjs";
import { fixDataset } from "../fixer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

// ---- load the dirty file (the shipped demo sample, untouched) ----
const src = path.join(root, "samples/sales_pipeline.csv");
const { rows, columns } = parseFile(src);
const before = scoreDataset(rows, columns);

// ---- user-choice knobs, derived the same way the UI derives its defaults ----
const unify = {};
for (const col of columns) {
  const clusters = before.columnStats[col]?.variantClusters || [];
  for (const c of clusters) unify[col] = { ...(unify[col] || {}), [c.key]: c.forms[0].raw }; // most common form
}
const res = fixDataset(rows, columns, {
  dedupe: true, dateTarget: "ISO", clearPlaceholders: true, clearSentinels: true,
  dropEmptyCols: true, trim: true, dropEmptyRows: true, piiMode: "mask", unify,
});
const after = scoreDataset(res.rows, res.columns);

// ---- write both CSVs (RFC-4180 quoting) ----
const q = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCSV = (rs, cs) => [cs.map(q).join(","), ...rs.map((r) => cs.map((c) => q(r[c])).join(","))].join("\n");
fs.writeFileSync(path.join(here, "dirty.csv"), toCSV(rows, columns));
fs.writeFileSync(path.join(here, "clean.csv"), toCSV(res.rows, res.columns));

// ---- deterministic ground truth, computed from the cleaned data ----
const cRows = res.rows;
const sum = (rs) => rs.reduce((s, r) => s + (Number(String(r.amount_usd).trim()) || 0), 0);
const dirtySum = sum(rows);
const cleanSum = sum(cRows);
const isoDates = cRows.map((r) => String(r.close_date).trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
const norm = (s) => String(s ?? "").trim().toLowerCase();
const apac = cRows.filter((r) => norm(r.region) === "apac").length;
const globex = cRows.filter((r) => norm(r.account) === "globex").length;
const emailsDirty = rows.filter((r) => /@/.test(String(r.owner_email))).length;
const emailsClean = cRows.filter((r) => /^[^*]+@/.test(String(r.owner_email))).length; // unmasked only

const truth = {
  protocol: { model: "claude-sonnet-5 (Claude CLI, single run each)", cleanedWith: "fixDataset recommended set + most-common unify + PII mask" },
  fixes_applied: res.fixes.map((f) => f.message),
  skipped: res.skipped.map((s) => s.reason),
  score_before: before.score, score_after: after.score,
  q1_deal_count: { dirty_rows: rows.length, clean_rows: cRows.length },
  q2_total_pipeline_usd: { dirty_sum: dirtySum, clean_sum: cleanSum, inflation: dirtySum - cleanSum },
  q3_earliest_close_date: { clean: isoDates[0], dirty_contains_placeholder: rows.some((r) => /^1900-01-01|^01\/01\/1900/.test(String(r.close_date))) },
  q4_apac_deals: { clean: apac, dirty_spellings: [...new Set(rows.map((r) => String(r.region)).filter((v) => norm(v) === "apac"))] },
  q5_globex_deals: { clean: globex, dirty_spellings: [...new Set(rows.map((r) => String(r.account)).filter((v) => norm(v) === "globex"))] },
  pii_exposure: { raw_emails_in_dirty_prompt: emailsDirty, raw_emails_in_clean_prompt: emailsClean },
};
fs.writeFileSync(path.join(here, "ground_truth.json"), JSON.stringify(truth, null, 2));

// ---- the identical question set for both runs ----
const QUESTIONS = `You are a data analyst. Answer using ONLY the CSV below — no outside knowledge.
Give exact numbers. Answer as a numbered list; one short caveat sentence per answer is allowed.

1. How many deals are in this dataset?
2. What is the total pipeline value (sum of amount_usd), in USD?
3. What is the earliest close_date in the data?
4. How many deals are in the APAC region?
5. How many deals belong to the account "Globex"?

CSV:
`;
fs.writeFileSync(path.join(here, "prompt_dirty.txt"), QUESTIONS + toCSV(rows, columns));
fs.writeFileSync(path.join(here, "prompt_clean.txt"), QUESTIONS + toCSV(res.rows, res.columns));

console.log("wrote dirty.csv, clean.csv, ground_truth.json, prompt_dirty.txt, prompt_clean.txt");
console.log(`score ${before.score} → ${after.score}, rows ${rows.length} → ${cRows.length}`);
console.log(`sums: dirty ${dirtySum} vs clean ${cleanSum} (inflation ${dirtySum - cleanSum})`);
console.log(`earliest clean date ${isoDates[0]}, apac ${apac}, globex ${globex}, emails ${emailsDirty} → ${emailsClean}`);
