// util.mjs — what every social/ script shares: where the repository is, reading and writing its JSON files, the JSON in
// a reply from Claude, which story formats are told from the AX numbers, whether a file was started or imported, the
// date a post is for, and dropping a draft that can't be posted.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const OUT = path.join(ROOT, "social", "out");

// a JSON file, or `empty` when it isn't there. One that is there but broken stops the run with its name — read as
// "nothing yet", a broken notified.json would send every alert again and a broken story.json would drop a briefing
export function read(file, empty = null) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch (e) { if (e.code === "ENOENT") return empty; throw e; }
  try { return JSON.parse(text); } catch (e) { throw new Error(`${path.relative(ROOT, file)}: ${e.message}`); }
}
export const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 1) + "\n");

// the JSON object in a reply from Claude (a sentence around it is tolerated, nothing else)
export const parse = (t) => { const m = String(t).match(/\{[\s\S]*\}/); if (!m) throw new SyntaxError("no JSON"); return JSON.parse(m[0]); };

// the formats of the monthly AX report (story.mjs picks one of them for a new month of the Ramp AI Index): an event
// told in one of them files under the series "월간 AX 리포트" (tags.mjs), and its briefing cites the Ramp AI Index
// (briefs.mjs). The quiet-day and weekly formats (explainer, checklist, quiz, weekly) are told from the same AX facts
// but are not the monthly report — briefs.mjs tells them apart by the post's mode, not by this list.
export const AX_FORMATS = new Set(["monthly", "deepdive", "timeline"]);

// true when this file is the script node was started with (not an import), so its exports can be used in tests
export const isMain = (url) => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(url)); } catch { return false; } };

// the calendar date in Korea (UTC+9, no daylight saving) — the day a post is for and its folder's name. The daily run
// (10:17 KST) has the same date in UTC; a run between midnight and 9 a.m. KST would otherwise be named after the day
// before. Data dates (trends/data → built_at, a change's or an announcement's date) stay as the data has them.
export const kstToday = (now = new Date()) => new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10);

// no post today after all (a fallback story or caption failed the checks): the draft's folder goes, the posted.json
// entry plan.mjs made goes (the subject and the announcements stay available for the next run), and plan.json says
// why — build, render and caption then do nothing, and the workflow neither commits nor posts a draft. Only a draft
// made in this run can go: a folder with a post.json (published, or waiting for /approve) is never touched.
export function dropDraft(plan, why) {
  const dir = path.join(OUT, plan.slot);
  if (fs.existsSync(path.join(dir, "post.json"))) throw new Error(`social/out/${plan.slot} already has a post.json — not dropping it (${why})`);
  fs.rmSync(dir, { recursive: true, force: true });
  const LOG = path.join(ROOT, "social", "posted.json"), log = read(LOG, []);
  const i = log.findLastIndex((x) => (x.slot ?? x.date) === plan.slot);
  if (i >= 0) { log.splice(i, 1); write(LOG, log); }
  write(path.join(ROOT, "social", "plan.json"), { post: false, dropped: true, slot: plan.slot, mode: plan.mode, why });
  console.log(`no draft today — ${why}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 오늘은 인스타그램 초안을 만들지 않았어요\n\n${why}\n`);
}
