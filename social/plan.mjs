// plan.mjs — decides whether today gets an Instagram draft, and about what. Writes social/plan.json (not committed)
// for build.mjs and caption.mjs, and prints post=true|false for the workflow.
//
//  • A big case (trends/data/insights.json → events, found by trends/build.mjs) is drafted when it is new: its key
//    has never been drafted, and its subject (a package, a phrase, a leader) not in the last SUBJECT_DAYS days.
//    The highest score wins; at most one draft a day.
//  • If nothing big has happened for QUIET_DAYS, a roundup of the radar is drafted instead, so the account
//    doesn't go silent.
// Every draft is logged in social/posted.json (committed with the draft), whether the owner later approves it or not.
//
// Usage: node social/plan.mjs            (after trends/build.mjs)
//        node social/plan.mjs --dry-run  (print the decision, change nothing)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SUBJECT_DAYS = 21, QUIET_DAYS = 14;
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const I = JSON.parse(fs.readFileSync(path.join(ROOT, "trends", "data", "insights.json"), "utf8"));
const LOG = path.join(ROOT, "social", "posted.json");
const log = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, "utf8")) : [];
const today = I.built_at, days = (a, b) => (new Date(a) - new Date(b)) / 864e5;

const fresh = (I.events ?? []).filter((e) => !log.some((p) => p.key === e.key) && !log.some((p) => p.subject === e.subject && days(today, p.date) < SUBJECT_DAYS));
const last = log.at(-1);
let plan;
if (last?.date === today) plan = { post: false, why: `already drafted today (${last.key})` };
else if (fresh.length) plan = { post: true, mode: "event", date: today, event: fresh[0], why: `big case: ${fresh[0].headline}` };
else if (!last || days(today, last.date) >= QUIET_DAYS) plan = { post: true, mode: "roundup", date: today, why: last ? `nothing big for ${days(today, last.date)} days` : "first draft" };
else plan = { post: false, why: `no new big case (${(I.events ?? []).length} found, all drafted or cooling down)` };

console.log(`${plan.post ? "draft" : "skip "} — ${plan.why}`);
if (!process.argv.includes("--dry-run")) {
  fs.writeFileSync(path.join(ROOT, "social", "plan.json"), JSON.stringify(plan, null, 1) + "\n");
  if (plan.post) {
    log.push({ date: today, mode: plan.mode, key: plan.event?.key ?? `roundup:${today}`, subject: plan.event?.subject ?? "roundup" });
    fs.writeFileSync(LOG, JSON.stringify(log, null, 1) + "\n");
  }
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `post=${plan.post}\ndate=${today}\n`);
}
