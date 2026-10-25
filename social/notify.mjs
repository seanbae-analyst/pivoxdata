// notify.mjs — "새 AX 브리핑" push alerts through OneSignal, to the readers who chose that topic on the site
// (/briefs → 알림 받기: AX 사건 / 월간 리포트 / 그 밖의 브리핑, stored as OneSignal tags).
// A briefing is announced once (social/notified.json), only when it is public: a post's briefing after the post is
// on Instagram (post.json → published), a monthly roundup once written; and only if it is from the last few days, so
// a backlog is never sent at once. Before sending, waits until the briefing's page is live on the site.
// Without ONESIGNAL_REST_KEY it only says what it would send.
//
// Usage: node social/notify.mjs [--dry-run]   (after the post is published)
// Env:   ONESIGNAL_REST_KEY (GitHub secret), ONESIGNAL_APP_ID (defaults to the site's app)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SERIES, seriesOf } from "./tags.mjs";

import { APP_ID } from "./notify-config.mjs";
// which alert topic a series belongs to (the site's checkboxes)
export const TOPIC = { news: "news", monthly: "monthly", roundup: "monthly", breaking: "other", tools: "other", weekly: "other", flow: "other" };
const RECENT_DAYS = 3;
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const plain = (t) => String(t ?? "").replace(/​/g, "").replace(/‑/g, "-").replace(/ /g, " ");
const SITE = "https://data.pivoxquant.com";
const LOG = path.join(ROOT, "social", "notified.json");
const sent = read(LOG) ?? [];
const dry = process.argv.includes("--dry-run") || !process.env.ONESIGNAL_REST_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10), ago = (d) => (new Date(today) - new Date(d)) / 864e5;

const OUT = path.join(ROOT, "social", "out"), RU = path.join(ROOT, "social", "roundups");
const due = [
  ...(fs.existsSync(OUT) ? fs.readdirSync(OUT) : []).map((slot) => ({ slot, st: read(path.join(OUT, slot, "story.json")), public: Boolean(read(path.join(OUT, slot, "post.json"))?.published) })),
  ...(fs.existsSync(RU) ? fs.readdirSync(RU).filter((f) => f.endsWith(".json")) : []).map((f) => ({ slot: `roundup-${f.slice(0, -5)}`, st: read(path.join(RU, f)), public: true })),
].filter((b) => b.st?.article && b.public && !sent.includes(b.slot) && ago(b.st.date) <= RECENT_DAYS)
  .sort((a, b) => a.st.date.localeCompare(b.st.date));
if (!due.length) { console.log("notify: nothing new to announce"); process.exit(0); }

async function send(body) {
  // keys made in the current dashboard use "Key …"; older REST keys use "Basic …"
  for (const scheme of ["Key", "Basic"]) {
    const res = await fetch("https://api.onesignal.com/notifications?c=push", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `${scheme} ${process.env.ONESIGNAL_REST_KEY.trim()}` }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) continue;
    if (!res.ok || j.errors?.length) throw new Error(`OneSignal ${res.status}: ${JSON.stringify(j.errors ?? j).slice(0, 300)}`);
    return j;
  }
  throw new Error("OneSignal refused the key (401/403) — check ONESIGNAL_REST_KEY");
}

for (const b of due) {
  const series = b.st.series ?? seriesOf(b.st), topic = TOPIC[series] ?? "other", url = `${SITE}/briefs/${b.slot}?source=push`;
  const heading = `새 AX 브리핑 · ${SERIES[series]?.name ?? "브리핑"}`, content = plain(b.st.article.title).slice(0, 120);
  if (dry) { console.log(`notify (dry run${process.env.ONESIGNAL_REST_KEY ? "" : ", no ONESIGNAL_REST_KEY"}): [${topic}] ${heading} — ${content} → ${url}`); continue; }
  // the page must be live before anyone taps the alert (the site deploys the commit that added it)
  let live = false;
  for (let i = 0; i < 40 && !live; i++) { live = (await fetch(`${SITE}/briefs/${b.slot}`, { method: "HEAD" }).catch(() => ({}))).ok; if (!live) await sleep(15000); }
  if (!live) { console.log(`notify: ${b.slot} page not live after 10 minutes — next run`); continue; }
  const j = await send({ app_id: APP_ID, target_channel: "push", headings: { en: heading, ko: heading }, contents: { en: content, ko: content }, url,
    filters: [{ field: "tag", key: topic, relation: "=", value: "1" }], web_push_topic: `brief-${b.slot}` });
  sent.push(b.slot);
  fs.writeFileSync(LOG, JSON.stringify(sent, null, 1) + "\n");
  console.log(`notify: sent [${topic}] ${b.slot} (${j.id ?? "ok"}${j.recipients != null ? `, ${j.recipients} recipients` : ""})`);
}
