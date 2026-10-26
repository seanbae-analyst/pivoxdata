// commit.mjs — commits and pushes what a workflow step changed, safely while other runs push too.
//
//   node social/commit.mjs -m "<message>" <path>…   stage <paths> (new, changed or removed), commit if anything
//                                                     changed, push — "nothing to commit" is not an error
//   node social/commit.mjs --briefs -m "<message>"  rebuild the briefing pages (social/briefs.mjs) on the newest
//                                                     branch and push them — after a post goes up or is rejected
//
// Pushing: up to 5 tries, each after `git pull --rebase` (another run may have pushed meanwhile); a rebase conflict
// stops with an error. --briefs starts each try from the newest branch instead (fetch + reset) and generates the pages
// again, so generated files never conflict — commit the post's own post.json first, then run this.
// Credentials: the workflows check out without keeping any (persist-credentials: false), so the npm packages and the
// Claude Code CLI that run in the same job never see a token in .git/config. The token is given to the commit step
// only (GITHUB_TOKEN) and reaches git through its environment config — never on a command line or in an error message.
// The branch is PUSH_BRANCH, else the run's own (GITHUB_REF_NAME), else main.
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2), mi = args.indexOf("-m"), message = mi >= 0 ? args[mi + 1] : null;
const briefs = args.includes("--briefs"), paths = args.filter((a, i) => !a.startsWith("-") && i !== mi + 1);
if (!message || (!briefs && !paths.length)) { console.error('usage: node social/commit.mjs -m "<message>" <path>…  |  node social/commit.mjs --briefs -m "<message>"'); process.exit(2); }
const branch = process.env.PUSH_BRANCH || process.env.GITHUB_REF_NAME || "main";
const bot = { name: "pivoxdata-bot", email: "41898282+github-actions[bot]@users.noreply.github.com" };
const env = { ...process.env, GIT_AUTHOR_NAME: bot.name, GIT_AUTHOR_EMAIL: bot.email, GIT_COMMITTER_NAME: bot.name, GIT_COMMITTER_EMAIL: bot.email };
if (process.env.GITHUB_TOKEN) Object.assign(env, { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
  GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${process.env.GITHUB_TOKEN}`).toString("base64")}` });
const git = (...a) => spawnSync("git", a, { env, encoding: "utf8" });
const must = (...a) => { const r = git(...a); if (r.status) throw new Error(`git ${a[0]} failed: ${(r.stderr || r.stdout).trim()}`); return r.stdout; };
const wait = (s) => spawnSync("sleep", [String(s)]);

// stage and commit; false when there was nothing to commit
function commit(list) {
  // a path that is neither on disk nor tracked (social/request.json on a day without a request) is skipped
  const real = list.filter((p) => fs.existsSync(p) || git("ls-files", "--error-unmatch", "--", p).status === 0);
  if (real.length) must("add", "-A", "--", ...real);
  if (git("diff", "--cached", "--quiet").status === 0) { console.log("nothing to commit"); return false; }
  must("commit", "-q", "-m", message);
  return true;
}

if (!briefs) {
  if (!commit(paths)) process.exit(0);
  for (let i = 1; i <= 5; i++) {
    const pull = git("pull", "-q", "--rebase", "origin", branch);
    if (pull.status) {
      // a conflict leaves a rebase in progress (abort works); a network error does not — that one is worth a retry
      if (git("rebase", "--abort").status === 0) { console.error(`git pull --rebase: conflict with ${branch} — nothing pushed\n${pull.stderr.trim()}`); process.exit(1); }
      console.warn(`git pull --rebase failed (${i}/5): ${pull.stderr.trim()}`);
    } else if (git("push", "-q", "origin", `HEAD:${branch}`).status === 0) { console.log(`pushed to ${branch}: ${message}`); process.exit(0); }
    else console.warn(`git push failed (${i}/5) — trying again`);
    wait(5 * i);
  }
  console.error(`could not push to ${branch} after 5 tries`);
  process.exit(1);
}

// --briefs: the pages from the newest branch, generated again on every try
for (let i = 1; i <= 5; i++) {
  must("fetch", "-q", "origin", branch);
  must("reset", "-q", "--hard", `origin/${branch}`);
  const run = spawnSync(process.execPath, ["social/briefs.mjs"], { stdio: "inherit" });
  if (run.status) { console.error("social/briefs.mjs failed — nothing pushed"); process.exit(1); }
  if (!commit(["briefs", "index.html", "map.html", "404.html", "saved.html", "privacy.html", "terms.html", "sitemap.xml", "robots.txt"])) process.exit(0);
  if (git("push", "-q", "origin", `HEAD:${branch}`).status === 0) { console.log(`pushed to ${branch}: ${message}`); process.exit(0); }
  console.warn(`git push failed (${i}/5) — generating the pages again on the newest ${branch}`);
  wait(5 * i);
}
console.error(`could not push the briefing pages to ${branch} after 5 tries`);
process.exit(1);
