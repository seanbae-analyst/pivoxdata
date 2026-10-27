// publish.mjs — posts one carousel to Instagram through the official Instagram Graph API
// (Content Publishing: one container per image → a CAROUSEL container → media_publish).
// Run by trends.yml right after a draft passes its checks (automatic posting), or by social-publish.yml after the
// owner's /approve, for a hand-made post (Run workflow, or "auto_publish": true) — never twice for one post:
//  • a post.json with `published` is left alone, one with `rejected` is refused;
//  • before anything is created, the account's recent media are read: a post already up with this caption (or this
//    slot's /briefs/<slot> link) — say, published by a run whose push of post.json failed — is recorded as published
//    instead of being posted again.
//  • a carousel of more than API_MAX cards (a long story, 2026-10-27) can't go through the API: the owner posts it from
//    the app (data.pivoxquant.com/upload?slot=<slot>), and /approve then records it — found among the recent media by
//    its caption — or says it isn't up yet (exit 3).
// Worst case before the first container: 10 minutes for the images to appear on the site (one deadline for all of
// them); then up to 5 minutes for the image containers (processed together) and 150 s for the carousel — about 18
// minutes, under the 30-minute timeout of the jobs that run it.
//
// Usage: node social/publish.mjs social/out/<slot>/post.json [--dry-run]
//        node social/publish.mjs social/out/<slot>/post.json --reject    (the owner's /reject: post.json → rejected)
//        node social/publish.mjs --queued    (the "auto_publish": true posts not yet up or rejected, oldest slot first)
// Env:   IG_USER_ID, IG_ACCESS_TOKEN               (GitHub secrets; see social/README.md)
//        IG_GRAPH_HOST   default graph.instagram.com  (graph.facebook.com for a token from Facebook Login)
//        IG_API_VERSION  default v23.0
import fs from "node:fs";
import path from "node:path";
import { OUT, read, write } from "./util.mjs";
import { isSlot, compareSlots } from "./slot.mjs";

const args = process.argv.slice(2), flag = (f) => args.includes(f), file = args.find((a) => !a.startsWith("--"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// the most cards a carousel posted through the API may have (Content Publishing: "limited to 10 images, videos, or a
// mix"); the Instagram app takes 20
const API_MAX = 10;
const manual = (post) => (post?.images?.length ?? 0) > API_MAX;

if (flag("--queued")) {
  const queued = (fs.existsSync(OUT) ? fs.readdirSync(OUT) : []).filter(isSlot).sort(compareSlots)
    .filter((slot) => { const p = read(path.join(OUT, slot, "post.json")); return p?.auto_publish === true && !p.published && !p.rejected && !manual(p); });
  for (const slot of queued) console.log(`social/out/${slot}/post.json`);
  process.exit(0);
}
if (!file) { console.error("usage: node social/publish.mjs social/out/<slot>/post.json [--dry-run | --reject]  ·  node social/publish.mjs --queued"); process.exit(2); }
const post = read(file);
if (!post) { console.error(`${file}: not found`); process.exit(2); }
const slot = post.slot ?? post.date, save = () => write(file, post);

// the owner's /reject: written down, so briefs.mjs drops the draft's page and nothing posts it later
if (flag("--reject")) {
  if (post.published) { console.log(`already published: ${post.published.permalink ?? post.published.media_id} — nothing to reject`); process.exit(0); }
  post.rejected = post.rejected ?? { at: new Date().toISOString() };
  save();
  console.log(`rejected: ${slot}`);
  process.exit(0);
}
if (post.published) { console.log(`already published: ${post.published.permalink ?? post.published.media_id}`); process.exit(0); }
if (post.rejected) { console.error(`${slot} was rejected (${post.rejected.at}) — remove "rejected" from its post.json to post it`); process.exit(1); }

const urls = post.images.map((f) => post.image_base + f);
const { IG_USER_ID: user, IG_ACCESS_TOKEN: token } = process.env;
const base = `https://${process.env.IG_GRAPH_HOST || "graph.instagram.com"}/${process.env.IG_API_VERSION || "v23.0"}`;
const dry = flag("--dry-run") || !user || !token;

async function graph(pathname, params, method = "POST") {
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = method === "POST" ? await fetch(`${base}/${pathname}`, { method, body }) : await fetch(`${base}/${pathname}?${body}`);
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(`${method} ${pathname}: ${res.status} ${JSON.stringify(j.error ?? j)}`);
  return j;
}

// 0. already up? (a run that posted it but could not push post.json, a second /approve, two jobs at once)
if (user && token) {
  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim(), link = `/briefs/${slot}`;
  const ours = (c) => norm(c) === norm(post.caption) || (post.caption.includes(link) && new RegExp(`${link.replace(/[-/]/g, "\\$&")}(?![\\w-])`).test(c ?? ""));
  const { data = [] } = await graph(`${user}/media`, { fields: "id,caption,permalink,timestamp", limit: "25" }, "GET");
  const up = data.find((m) => ours(m.caption));
  if (up) {
    console.log(`already on Instagram: ${up.permalink ?? up.id} (${up.timestamp}) — recorded, not posted again`);
    if (!dry) { post.published = { at: up.timestamp ?? new Date().toISOString(), media_id: up.id, permalink: up.permalink ?? null, found: "recent media" }; save(); }
    process.exit(0);
  }
}

// a long story: the owner posts it from the app; nothing to do here until it is up
if (manual(post)) {
  console.log(`manual: ${post.images.length} cards — more than the ${API_MAX} the API takes. Post it from the Instagram app (https://data.pivoxquant.com/upload?slot=${slot}), then /approve records it.${user && token ? " Not among the account's recent media yet." : ""}`);
  process.exit(3);
}

// 1. the images must be live on the site first (Vercel deploys the commit that added them) — one deadline for all
let missing = urls;
for (let i = 0; i < 40 && missing.length; i++) {
  if (i) await sleep(15000);
  missing = (await Promise.all(missing.map(async (u) => ((await fetch(u, { method: "HEAD" }).catch(() => ({}))).ok ? null : u)))).filter(Boolean);
}
if (missing.length) throw new Error(`image(s) not reachable after 10 minutes: ${missing.join(", ")}`);
console.log(`${urls.length} images reachable`);
if (dry) { console.log(`dry run${!user || !token ? " (IG_USER_ID / IG_ACCESS_TOKEN not set)" : ""} — would post:\n${urls.join("\n")}\n\n${post.caption}`); process.exit(0); }

// containers are processed by Instagram; ERROR or EXPIRED is final
const ready = async (ids, seconds) => {
  let waiting = ids;
  for (let t = 0; waiting.length; t += 5) {
    const states = await Promise.all(waiting.map(async (id) => [id, (await graph(id, { fields: "status_code" }, "GET")).status_code]));
    const bad = states.find(([, s]) => s === "ERROR" || s === "EXPIRED");
    if (bad) throw new Error(`container ${bad[0]}: ${bad[1]}`);
    waiting = states.filter(([, s]) => s !== "FINISHED").map(([id]) => id);
    if (!waiting.length) return;
    if (t >= seconds) throw new Error(`container(s) ${waiting.join(", ")} not ready after ${seconds} s`);
    await sleep(5000);
  }
};

// 2. a container per image (processed together), then the carousel, then publish
const children = [];
for (const u of urls) children.push((await graph(`${user}/media`, { image_url: u, is_carousel_item: "true" })).id);
await ready(children, 300);
const { id: carousel } = await graph(`${user}/media`, { media_type: "CAROUSEL", children: children.join(","), caption: post.caption });
await ready([carousel], 150);
const { id: media } = await graph(`${user}/media_publish`, { creation_id: carousel });
// it is live now: write that down before anything else can fail, or a failed link lookup leaves no record and the
// next /approve posts the same carousel a second time
post.published = { at: new Date().toISOString(), media_id: media, permalink: null };
save();
for (let i = 0; i < 3 && !post.published.permalink; i++) {
  try { post.published.permalink = (await graph(media, { fields: "permalink" }, "GET")).permalink ?? null; }
  catch (e) { console.warn(`permalink lookup failed (${i + 1}/3): ${e.message}`); await sleep(5000); }
}
save();
console.log(`published: ${post.published.permalink ?? `media ${media} (link lookup failed — the post is up)`}`);
