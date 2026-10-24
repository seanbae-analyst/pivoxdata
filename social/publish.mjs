// publish.mjs — posts one week's carousel to Instagram through the official Instagram Graph API
// (Content Publishing: one container per image → a CAROUSEL container → media_publish).
// Run only after a person approves (see .github/workflows/social-publish.yml); never on a schedule.
//
// Usage: node social/publish.mjs social/out/<date>/post.json [--dry-run]
// Env:   IG_USER_ID, IG_ACCESS_TOKEN               (GitHub secrets; see social/README.md)
//        IG_GRAPH_HOST   default graph.instagram.com  (graph.facebook.com for a token from Facebook Login)
//        IG_API_VERSION  default v23.0
import fs from "node:fs";

const [file, flag] = process.argv.slice(2);
if (!file) { console.error("usage: node social/publish.mjs social/out/<date>/post.json [--dry-run]"); process.exit(2); }
const post = JSON.parse(fs.readFileSync(file, "utf8"));
if (post.published) { console.log(`already published: ${post.published.permalink}`); process.exit(0); }

const urls = post.images.map((f) => post.image_base + f);
const { IG_USER_ID: user, IG_ACCESS_TOKEN: token } = process.env;
const base = `https://${process.env.IG_GRAPH_HOST || "graph.instagram.com"}/${process.env.IG_API_VERSION || "v23.0"}`;
const dry = flag === "--dry-run" || !user || !token;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. the images must be live on the site first (Vercel deploys the commit that added them)
for (const u of urls) {
  let ok = false;
  for (let i = 0; i < 40 && !ok; i++) { ok = (await fetch(u, { method: "HEAD" })).ok; if (!ok) await sleep(15000); }
  if (!ok) throw new Error(`image not reachable after 10 minutes: ${u}`);
}
console.log(`${urls.length} images reachable`);
if (dry) { console.log(`dry run${!user || !token ? " (IG_USER_ID / IG_ACCESS_TOKEN not set)" : ""} — would post:\n${urls.join("\n")}\n\n${post.caption}`); process.exit(0); }

async function graph(pathname, params, method = "POST") {
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = method === "POST" ? await fetch(`${base}/${pathname}`, { method, body }) : await fetch(`${base}/${pathname}?${body}`);
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(`${method} ${pathname}: ${res.status} ${JSON.stringify(j.error ?? j)}`);
  return j;
}
const ready = async (id) => {
  for (let i = 0; i < 30; i++) {
    const { status_code } = await graph(id, { fields: "status_code" }, "GET");
    if (status_code === "FINISHED") return;
    if (status_code === "ERROR" || status_code === "EXPIRED") throw new Error(`container ${id}: ${status_code}`);
    await sleep(5000);
  }
  throw new Error(`container ${id} not ready after 150 s`);
};

// 2. a container per image, then the carousel, then publish
const children = [];
for (const u of urls) { const { id } = await graph(`${user}/media`, { image_url: u, is_carousel_item: "true" }); await ready(id); children.push(id); }
const { id: carousel } = await graph(`${user}/media`, { media_type: "CAROUSEL", children: children.join(","), caption: post.caption });
await ready(carousel);
const { id: media } = await graph(`${user}/media_publish`, { creation_id: carousel });
const { permalink } = await graph(media, { fields: "permalink" }, "GET");

post.published = { at: new Date().toISOString(), media_id: media, permalink };
fs.writeFileSync(file, JSON.stringify(post, null, 1) + "\n");
console.log(`published: ${permalink}`);
