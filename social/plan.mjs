// plan.mjs — decides whether today gets an Instagram draft, and about what. Writes social/plan.json (not committed)
// for build.mjs and caption.mjs, and prints post=true|false for the workflow.
//
// It drafts from trends/data/changes.json (every change trends/build.mjs found, 60 days):
//  • event   — a big case found in the last BIG_DAYS days that was never drafted, whose subject (a package, a phrase,
//              a leader) wasn't drafted in the last SUBJECT_DAYS days. The highest score wins.
//  • digest  — no big case, DIGEST_DAYS since the last draft, and at least DIGEST_MIN small changes since then:
//              the best DIGEST_MAX of them (one per subject) in one carousel.
//  • roundup — nothing at all for QUIET_DAYS: the radar's strongest cards, so the account doesn't go silent.
// At most one draft a day. Every draft is logged in social/posted.json (committed with it), approved or not.
//
// Usage: node social/plan.mjs            (after trends/build.mjs)
//        node social/plan.mjs --dry-run  (print the decision, change nothing)
//        node social/plan.mjs --force    (draft even when the rules say not today — for testing the pipeline; the
//                                         best there is: a new big case, else the waiting small changes, else a roundup)
//        node social/plan.mjs --race     (a "누가 앞서나" carousel now: the races that moved most — POST_KIND=race)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BIG_DAYS = 3, SUBJECT_DAYS = 21, DIGEST_DAYS = 7, DIGEST_MIN = 3, DIGEST_MAX = 5, QUIET_DAYS = 14;
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f, empty) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : empty);
const I = read(path.join(ROOT, "trends", "data", "insights.json"));
const changes = read(path.join(ROOT, "trends", "data", "changes.json"), { log: [] }).log;
const LOG = path.join(ROOT, "social", "posted.json");
const log = read(LOG, []);
const today = I.built_at, days = (a, b) => (new Date(a) - new Date(b)) / 864e5;

const posted = new Set(log.flatMap((p) => [p.key, ...(p.keys ?? [])]));
const cool = (c) => !log.some((p) => [p.subject, ...(p.subjects ?? [])].includes(c.subject) && days(today, p.date) < SUBJECT_DAYS);
const unposted = changes.filter((c) => !posted.has(c.key) && cool(c));
const last = log.at(-1), since = last ? days(today, last.date) : Infinity;

const big = unposted.filter((c) => c.tier === "big" && days(today, c.date) <= BIG_DAYS).sort((a, b) => b.score - a.score);
const smalls = unposted.filter((c) => c.tier === "small" && (!last || c.date > last.date)).sort((a, b) => b.score - a.score)
  .filter((c, i, a) => a.findIndex((x) => x.subject === c.subject) === i).slice(0, DIGEST_MAX);

const force = process.argv.includes("--force") || process.env.FORCE_DRAFT === "true" || process.env.POST_KIND === "test";
const raceNow = process.argv.includes("--race") || process.env.POST_KIND === "race";
let plan;
if (raceNow) plan = { post: true, mode: "race", date: today, why: "races requested" };
else if (force) plan = big.length ? { post: true, mode: "event", date: today, event: big[0], why: `forced; big case: ${big[0].headline}` }
  : smalls.length ? { post: true, mode: "digest", date: today, items: smalls, why: `forced; ${smalls.length} small change(s)` }
  : { post: true, mode: "roundup", date: today, why: "forced; nothing new, so a roundup" };
else if (last?.date === today) plan = { post: false, why: `already drafted today (${last.key})` };
else if (big.length) plan = { post: true, mode: "event", date: today, event: big[0], why: `big case: ${big[0].headline}` };
else if (since >= DIGEST_DAYS && smalls.length >= DIGEST_MIN) plan = { post: true, mode: "digest", date: today, items: smalls, why: `${smalls.length} small changes since ${last?.date ?? "the start"}` };
else if (since >= QUIET_DAYS) plan = { post: true, mode: "roundup", date: today, why: last ? `nothing to draft for ${since} days` : "first draft" };
else plan = { post: false, why: `no new big case; ${smalls.length} small change(s) waiting, digest after ${DIGEST_DAYS} days with ${DIGEST_MIN}+ (last draft ${last?.date ?? "never"})` };

console.log(`${plan.post ? "draft" : "skip "} — ${plan.why}`);
if (!process.argv.includes("--dry-run")) {
  fs.writeFileSync(path.join(ROOT, "social", "plan.json"), JSON.stringify(plan, null, 1) + "\n");
  if (plan.post) {
    const entry = { date: today, mode: plan.mode, key: plan.event?.key ?? `${plan.mode}:${today}`, subject: plan.event?.subject ?? plan.mode };
    if (plan.items) Object.assign(entry, { keys: plan.items.map((c) => c.key), subjects: plan.items.map((c) => c.subject) });
    log.push(entry);
    fs.writeFileSync(LOG, JSON.stringify(log, null, 1) + "\n");
  }
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `post=${plan.post}\ndate=${today}\n`);
}
