// plan.mjs — decides whether today gets an Instagram draft, and about what. Writes social/plan.json (not committed)
// for story.mjs, build.mjs and caption.mjs, and prints post=true|false for the workflow.
//
// It drafts from trends/data/changes.json (every change trends/build.mjs found, 60 days):
//  • event   — a big case found in the last BIG_DAYS days that was never drafted, whose subject (a package, a phrase,
//              a leader) wasn't drafted in the last SUBJECT_DAYS days. The highest score wins.
//  • news    — no big case, NEWS_GAP days since the last news post, and at least NEWS_MIN official announcements
//              (trends/data/insights.json → news) from the last NEWS_WINDOW days that no post used: "이번 주 AX 사건".
//  • digest  — no big case, DIGEST_DAYS since the last draft, and at least DIGEST_MIN small changes since then:
//              the best DIGEST_MAX of them (one per subject) in one carousel.
//  • roundup — nothing at all for QUIET_DAYS: the radar's strongest cards, so the account doesn't go silent.
// At most one draft a day. Every draft is logged in social/posted.json (committed with it), approved or not; a draft
// that is dropped later in the run (story.mjs / caption.mjs: its fallback failed the checks) takes its entry back out.
// Instagram carries AX only (2026-10-25): the "누가 앞서나" race carousel is no longer made — a request for it is
// turned down here, with the reason.
//
// Usage: node social/plan.mjs            (after trends/build.mjs)
//        node social/plan.mjs --dry-run  (print the decision, change nothing)
//        node social/plan.mjs --force    (draft even when the rules say not today — for testing the pipeline; the
//                                         best there is: a new big case, else the waiting small changes, else a roundup)
//        node social/plan.mjs --news     (this week's AX news now — POST_KIND=news)
import fs from "node:fs";
import path from "node:path";
import { ROOT, OUT, read, write, isMain, kstToday } from "./util.mjs";
import { nextSlot } from "./slot.mjs";

export const BIG_DAYS = 3, SUBJECT_DAYS = 21, DIGEST_DAYS = 7, DIGEST_MIN = 3, DIGEST_MAX = 5, QUIET_DAYS = 14;
// NEWS_GAP: days between news posts — 1 = every day there are NEWS_MIN unused announcements (owner, 2026-10-26:
// "당분간은 업로드 많이할거임"; it was 6, once a week)
export const NEWS_GAP = 1, NEWS_WINDOW = 7, NEWS_MIN = 3, NEWS_MAX = 8;
// AX only (2026-10-25): Instagram carries the AX cases (Ramp AI Index) and the weekly official-announcement post;
// tool races and developer-side changes (downloads, papers, models, capex) stay in the site's evidence section
export const AX_TOPICS = new Set(["ax"]);

function main() {
  const I = read(path.join(ROOT, "trends", "data", "insights.json"));
  const changes = read(path.join(ROOT, "trends", "data", "changes.json"), { log: [] }).log;
  const LOG = path.join(ROOT, "social", "posted.json"), log = read(LOG, []);
  // the data's date (comparisons with changes, announcements and earlier drafts all use it) — the post's own date,
  // which names its folder, is the date in Korea (kstToday)
  const today = I.built_at, days = (a, b) => (new Date(a) - new Date(b)) / 864e5;

  const posted = new Set(log.flatMap((p) => [p.key, ...(p.keys ?? [])]));
  const cool = (c) => !log.some((p) => [p.subject, ...(p.subjects ?? [])].includes(c.subject) && days(today, p.date) < SUBJECT_DAYS);
  const unposted = changes.filter((c) => !posted.has(c.key) && cool(c) && AX_TOPICS.has(c.topic));
  const last = log.at(-1), since = last ? days(today, last.date) : Infinity;

  const big = unposted.filter((c) => c.tier === "big" && days(today, c.date) <= BIG_DAYS).sort((a, b) => b.score - a.score);
  const smalls = unposted.filter((c) => c.tier === "small" && (!last || c.date > last.date)).sort((a, b) => b.score - a.score)
    .filter((c, i, a) => a.findIndex((x) => x.subject === c.subject) === i).slice(0, DIGEST_MAX);

  // official announcements no post used yet, best first (trends/build.mjs ranks them); the story picks from these
  const usedNews = new Set(log.flatMap((p) => p.news ?? []));
  const lastNews = log.filter((p) => p.mode === "news").at(-1);
  const news = (I.news ?? []).filter((n) => !usedNews.has(n.id) && days(today, n.date) <= NEWS_WINDOW && n.score >= 3).slice(0, NEWS_MAX);
  const newsDue = news.length >= NEWS_MIN && (!lastNews || days(today, lastNews.date) >= NEWS_GAP);

  const kind = process.env.POST_KIND ?? "";
  const force = process.argv.includes("--force") || process.env.FORCE_DRAFT === "true" || kind === "test";
  const newsNow = process.argv.includes("--news") || kind === "news";
  let plan;
  if (process.argv.includes("--race") || kind === "race") plan = { post: false, why: "a \"누가 앞서나\" (race) post was requested, but Instagram carries AX only since 2026-10-25 — request ignored (the races stay on the site)" };
  else if (kind && !["news", "test"].includes(kind)) plan = { post: false, why: `unknown posting request "${kind}" — use "news" or "test"` };
  else if (newsNow) plan = news.length ? { post: true, mode: "news", date: today, news, why: `news requested; ${news.length} announcement(s)` } : { post: false, why: `news requested, but no unused official announcement from the last ${NEWS_WINDOW} days` };
  else if (force) plan = big.length ? { post: true, mode: "event", date: today, event: big[0], why: `forced; big case: ${big[0].headline}` }
    : smalls.length ? { post: true, mode: "digest", date: today, items: smalls, why: `forced; ${smalls.length} small change(s)` }
    : { post: true, mode: "roundup", date: today, why: "forced; nothing new, so a roundup" };
  else if (last?.date === today) plan = { post: false, why: `already drafted today (${last.key})` };
  else if (big.length) plan = { post: true, mode: "event", date: today, event: big[0], why: `big case: ${big[0].headline}` };
  else if (newsDue) plan = { post: true, mode: "news", date: today, news, why: `${news.length} official announcement(s) this week` };
  else if (since >= DIGEST_DAYS && smalls.length >= DIGEST_MIN) plan = { post: true, mode: "digest", date: today, items: smalls, why: `${smalls.length} small changes since ${last?.date ?? "the start"}` };
  else if (since >= QUIET_DAYS) plan = { post: true, mode: "roundup", date: today, why: last ? `nothing to draft for ${since} days` : "first draft" };
  else plan = { post: false, why: `no new big case; ${smalls.length} small change(s) waiting, digest after ${DIGEST_DAYS} days with ${DIGEST_MIN}+ (last draft ${last?.date ?? "never"})` };

  // the post's folder: social/out/<date in Korea>, or <date>-2, -3 … when that day already has a folder (a manual run
  // after the daily one), so a second post never overwrites the first one's images or caption — published or not: a
  // draft still waiting for /approve keeps its folder, or the approval issue would post cards nobody reviewed
  if (plan.post) plan.slot = nextSlot(kstToday(), (s) => fs.existsSync(path.join(OUT, s)));
  console.log(`${plan.post ? "draft" : "skip "} — ${plan.why}${plan.slot ? ` (folder ${plan.slot})` : ""}`);
  if (process.argv.includes("--dry-run")) return;
  write(path.join(ROOT, "social", "plan.json"), plan);
  if (plan.post) {
    const entry = { date: today, ...(plan.slot !== today ? { slot: plan.slot } : {}), mode: plan.mode, key: plan.event?.key ?? `${plan.mode}:${today}`, subject: plan.event?.subject ?? plan.mode };
    if (plan.items) Object.assign(entry, { keys: plan.items.map((c) => c.key), subjects: plan.items.map((c) => c.subject) });
    if (plan.news) entry.news = plan.news.map((n) => n.id); // story.mjs narrows this to the ones the post used
    log.push(entry);
    write(LOG, log);
  }
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `post=${plan.post}\nslot=${plan.slot ?? ""}\n`);
}
if (isMain(import.meta.url)) main();
