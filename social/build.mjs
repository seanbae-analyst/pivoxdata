// build.mjs — the day's Instagram carousel as one HTML page of 1080×1350 slides, drawn from
// trends/data/insights.json (the same objects the dashboard at / shows) and social/plan.json (plan.mjs: a big case,
// the week's small changes, or a roundup). render.mjs screenshots each slide.
//
// No two posts look alike: each insight can be drawn several ways (trends/viz.mjs — a line, columns, before → after,
// a donut, a waffle, a ranking …) and each slide has three layouts (number first, chart first, headline first).
// The choice avoids whatever the last two drafts used for the same insight, and the cover alternates too. What was
// chosen is written to social/out/<date>/design.json, which is how the next draft knows.
//
// Usage: node social/build.mjs   (after social/plan.mjs)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { slidesFor } from "./pick.mjs";
import { draw, options, FITTED, VIZ_CSS } from "../trends/viz.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const I = JSON.parse(fs.readFileSync(path.join(ROOT, "trends", "data", "insights.json"), "utf8"));
const planFile = path.join(ROOT, "social", "plan.json");
const plan = fs.existsSync(planFile) ? JSON.parse(fs.readFileSync(planFile, "utf8")) : { mode: "roundup", date: I.built_at };
if (plan.post === false) { console.log(`social/plan.json says no draft today (${plan.why}) — nothing to build`); process.exit(0); }
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const slides = slidesFor(I, plan);
// story.mjs's storyline, when there is one: text-first slides in the order the story goes (otherwise the card layouts)
const slot = plan.slot ?? I.built_at; // the post's folder (plan.mjs: <date>, or <date>-2 for a second post that day)
const storyFile = path.join(ROOT, "social", "out", slot, "story.json");
const story = fs.existsSync(storyFile) ? JSON.parse(fs.readFileSync(storyFile, "utf8")) : null;
if (!story && slides.length < 2) throw new Error(`only ${slides.length} insights — not enough for a carousel`);
const date = I.built_at, [y, m, d] = date.split("-");

// ---------- what the last drafts looked like ----------
const OUT = path.join(ROOT, "social", "out");
const history = (fs.existsSync(OUT) ? fs.readdirSync(OUT) : []).filter((f) => f < slot && fs.existsSync(path.join(OUT, f, "design.json"))).sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(OUT, f, "design.json"), "utf8")));
const recent = history.slice(-2), n = history.length;
const LAYOUTS = ["number", "chart", "headline"];
const COVERS = plan.mode === "event" ? ["hero", "alert"] : ["list", "grid"]; // digest and roundup share the list/grid covers
const lastCover = history.filter((h) => h.mode === plan.mode).at(-1)?.cover;
const cover = COVERS.find((c) => c !== lastCover) ?? COVERS[0];

const usedHere = new Set(), lastFormats = new Set(recent.at(-1)?.slides.map((s) => s.format) ?? []);
const design = slides.map((x, i) => {
  const opts = options(x.viz), before = recent.flatMap((h) => h.slides.filter((s) => s.id === x.id).map((s) => s.format));
  const o = opts.find((o) => !before.includes(o.format) && !usedHere.has(o.format) && !lastFormats.has(o.format))
    ?? opts.find((o) => !before.includes(o.format) && !usedHere.has(o.format)) ?? opts.find((o) => !usedHere.has(o.format)) ?? opts[0];
  if (o) usedHere.add(o.format);
  return { id: x.id, kind: o?.kind ?? null, format: o?.format ?? null, layout: LAYOUTS[(n + i) % LAYOUTS.length], o };
});

// ---------- slides ----------
const foot = `<div class="foot"><span>data.pivoxquant.com</span><span>AX 트렌드 레이더</span></div>`;
const H = { number: [300, 220], chart: [600, 520], headline: [280, 200] }; // drawing height: [labelled, line]
const chart = (x, s) => s.o ? `<div class="sp">${draw(x.viz[s.o.i], s.format, { w: 896, h: H[s.layout][FITTED.has(s.format) ? 0 : 1], big: true })}</div>` : `<div class="sp"></div>`;
const kick = (x, i) => `<div class="kick">${String(i + 1).padStart(2, "0")} · ${esc(x.k)}</div>`;

const slideHtml = (x, i) => {
  const s = design[i];
  if (s.layout === "chart") return `<section class="slide l-chart">
  ${kick(x, i)}
  <h2>${esc(x.title)}</h2>
  ${x.easy ? `<p class="easy-s">${esc(x.easy)}</p>` : ""}
  ${chart(x, s)}
  <div class="row"><div class="big">${esc(x.big)}</div><div class="bl">${esc(x.bl)}</div></div>
  <div class="src">${esc(x.src)}</div>
  ${foot}
</section>`;
  if (s.layout === "headline") return `<section class="slide l-headline">
  ${kick(x, i)}
  <h2>${esc(x.title)}</h2>
  <div class="row"><div class="big">${esc(x.big)}</div><div class="bl">${esc(x.bl)}</div></div>
  ${x.easy ? `<p class="easy"><span>쉽게 말하면</span>${esc(x.easy)}</p>` : `<p>${esc(x.body)}</p>`}
  ${chart(x, s)}
  <div class="src">${esc(x.src)}</div>
  ${foot}
</section>`;
  return `<section class="slide l-number">
  ${kick(x, i)}
  <div class="big">${esc(x.big)}</div>
  <div class="bl">${esc(x.bl)}</div>
  <h2>${esc(x.title)}</h2>
  ${x.easy ? `<p class="easy"><span>쉽게 말하면</span>${esc(x.easy)}</p>` : `<p>${esc(x.body)}</p>`}
  ${chart(x, s)}
  <div class="src">${esc(x.src)}</div>
  ${foot}
</section>`;
};

const when = `${+y}년 ${+m}월 ${+d}일`, lead = slides[0];
// the hero cover also draws the case, in a different way from its own slide
const heroO = lead && options(lead.viz).find((o) => o.format !== design[0].format);
const heroViz = heroO ? `<div class="sp">${draw(lead.viz[heroO.i], heroO.format, { w: 896, h: FITTED.has(heroO.format) ? 300 : 220, big: true })}</div>` : "";
const covers = story ? {} : { // a story brings its own cover
  hero: `<section class="slide cover c-hero">
  <div class="kick">빅 케이스 · ${esc(plan.event?.kind ?? "")} · ${when}</div>
  <div class="big">${esc(lead.big)}</div>
  <div class="bl">${esc(lead.bl)}</div>
  <h1>${esc(lead.title)}</h1>
  ${heroViz}
  <div class="next">넘겨서 자세히 →</div>
  ${foot}
</section>`,
  alert: `<section class="slide cover c-alert">
  <div class="kick">AX 트렌드 레이더 · ${when}</div>
  <div class="tag">${esc(plan.event?.kind ?? "빅 케이스")}</div>
  <h1>${esc(lead.title)}</h1>
  <div class="big">${esc(lead.big)}</div>
  <div class="bl">${esc(lead.bl)}</div>
  ${foot}
</section>`,
  list: `<section class="slide cover c-list">
  <div class="kick">AX 트렌드 레이더 · ${when}</div>
  <h1>${plan.mode === "digest" ? `지난 한 주<br>작게 바뀐 것<br>${slides.length}가지` : plan.mode === "race" ? "AI 분야별<br>누가<br>앞서나" : "요즘<br>기사보다 먼저<br>움직인 숫자"}</h1>
  <ol>${slides.slice(0, 3).map((x) => `<li><b>${esc(x.big)}</b><span>${esc(x.title)}</span></li>`).join("")}</ol>
  ${foot}
</section>`,
  grid: `<section class="slide cover c-grid">
  <div class="kick">AX 트렌드 레이더 · ${when}</div>
  <h1>${plan.mode === "digest" ? "숫자로 보는<br>지난 한 주의 작은 변화" : plan.mode === "race" ? "개발자가 실제로 받는 숫자로 본<br>분야별 1위" : "숫자 넷으로 보는<br>요즘 AI 기술"}</h1>
  <div class="tiles">${slides.slice(0, 4).map((x) => `<div class="tile"><div class="tk">${esc(x.k)}</div><div class="tb">${esc(x.big)}</div><div class="tl">${esc(x.bl)}</div></div>`).join("")}</div>
  ${foot}
</section>`,
};


// ---------- story slides ----------
function storySlides(st) {
  // a number, a closing bracket or % stays on the same line as the particle after it ("36.2%로", "(1년 전 3.5%)로")
  const N = st.slides.length, e = (t) => esc(String(t ?? "").replace(/\u200b/g, "").replace(/([\d%)])(?=[가-힣])/g, "$1\u2060"));
  // each line the writer broke on is its own block: when the text grows enough that one has to wrap, it splits evenly
  const lines = (t) => String(t ?? "").split("\n").map((l) => `<span class="ln">${e(l)}</span>`).join("");
  return st.slides.map((s, i) => {
    const kick = `<div class="kick"><span>${e(s.kicker || (i ? "" : `AX 트렌드 레이더 · ${when}`))}</span><span class="pg">${i + 1} / ${N}</span></div>`;
    const num = s.number ? `<div class="num"><b>${e(s.number)}</b>${s.label ? `<span>${e(s.label)}</span>` : ""}</div>` : "";
    const items = (s.items ?? []).length ? `<ol${s.items.length >= 5 ? ' class="many"' : ""}>${s.items.map((x) => `<li>${e(x)}</li>`).join("")}</ol>` : "";
    const body = s.body ? `<p class="txt">${lines(s.body)}</p>` : "";
    const inner = s.kind === "cover" ? `${kick}<div class="badge">${e(story.format_name ?? "")}</div><h2>${lines(s.title)}</h2>${body}${num}`
      : s.kind === "quiz" ? `${kick}<h2>${lines(s.title)}</h2>${body}${items}<div class="hint">다음 장에 정답 →</div>`
      : s.kind === "end" ? `${kick}<h2>${lines(s.title)}</h2>${body}${items}<div class="more">자세한 풀이는 웹에서 · data.pivoxquant.com/briefs</div>`
      : s.kind === "number" || s.kind === "answer" ? `${kick}${num}<h2>${lines(s.title)}</h2>${body}${items}`
      : `${kick}<h2>${lines(s.title)}</h2>${body}${items}`;
    // a news slide's source and date come from the announcement (story.mjs prints them), never from the model
    const src = s.src ? `<div class="srcl">${e(s.src)}</div>` : "";
    return `<section class="slide st ${e(s.kind)}">${inner}${src}${foot}</section>`;
  }).join("\n");
}

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=1080" />
<meta name="robots" content="noindex" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<title>Instagram 카드 ${date}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
<style>
  /* PivoxQuant's look (frontend/CLAUDE.md, 2026-10-11): Vantablack + ivory + bronze, Pretendard only, 14px card
     corners, no bronze glow, no wide letter-spacing. A big case is told apart by the bronze band on its cover. */
  :root{--bg:#050505;--onyx:#111111;--surface:rgba(245,240,232,.04);--line:rgba(245,240,232,.08);--ink:#f5f0e8;--ink-2:rgba(245,240,232,.82);--mut:rgba(245,240,232,.65);--dim:rgba(245,240,232,.5);--bronze:#b8956a;--bronze-hi:#b8956a;--bronze-soft:rgba(184,149,106,.12);--bronze-line:rgba(184,149,106,.42);--r-card:14px;--r-cta:10px}
  *{box-sizing:border-box} html,body{margin:0;background:#222}
  body{font-family:"Pretendard Variable",Pretendard,system-ui,sans-serif;color:var(--ink);word-break:keep-all}
  .slide{width:1080px;height:1350px;background:var(--bg);padding:96px 92px 0;position:relative;display:flex;flex-direction:column;margin:0 0 24px;overflow:hidden}
  .kick{font-size:30px;font-weight:600;color:var(--bronze-hi);letter-spacing:-.01em}
  .big{font-size:200px;font-weight:800;letter-spacing:-.05em;line-height:1;margin-top:64px;font-variant-numeric:tabular-nums}
  .bl{font-size:32px;color:var(--mut);margin-top:18px}
  h1,h2,.c-list li span{text-wrap:balance} p,li{text-wrap:pretty}
  h1{font-size:104px;line-height:1.12;letter-spacing:-.04em;margin:80px 0 0;font-weight:800}
  h2{font-size:52px;line-height:1.3;letter-spacing:-.03em;margin:64px 0 0;font-weight:700}
  p{font-size:32px;line-height:1.6;color:var(--ink-2);margin:28px 0 0}
  /* the plain-words box: what the number means, for someone who has never seen npm or arXiv */
  .easy{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-card);padding:26px 30px;color:var(--ink);font-size:33px;line-height:1.55}
  .easy span{display:block;font-size:24px;font-weight:700;color:var(--bronze-hi);margin-bottom:6px}
  .easy-s{font-size:30px;color:var(--ink-2);margin-top:22px}
  .sp{margin-top:auto;margin-bottom:28px}
  .sp .viz:not(.fit){height:260px}
  .src{font-size:24px;color:var(--dim);margin-bottom:28px}
  .foot{height:96px;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;font-size:24px;color:var(--mut);margin-top:auto;flex:none}
  ${VIZ_CSS.replace(/\n/g, "\n  ")}
  .viz .l{stroke-width:5} .viz .l.thin{stroke-width:4} .viz .l.end{stroke-width:22}
  /* chart first: the title on top, the drawing takes the middle, the number sits underneath */
  .l-chart h2{margin-top:40px;font-size:58px}
  .l-chart .sp{margin:auto 0}
  .l-chart .sp .viz:not(.fit){height:520px}
  .l-chart .row,.l-headline .row{display:flex;align-items:baseline;gap:28px;margin-bottom:24px}
  .l-chart .big,.l-headline .big{font-size:120px;margin-top:0;flex:none}
  .l-chart .bl,.l-headline .bl{margin-top:0}
  /* headline first: the sentence is the hero */
  .l-headline h2{font-size:76px;line-height:1.22;letter-spacing:-.04em;margin:48px 0 40px;font-weight:800}
  .l-headline .sp .viz:not(.fit){height:200px}
  /* covers */
  .c-list ol{list-style:none;padding:0;margin:96px 0 0;display:grid;gap:34px}
  .c-list li{display:grid;grid-template-columns:260px 1fr;gap:28px;align-items:baseline}
  .c-list li b{font-size:60px;font-weight:800;color:var(--bronze-hi);letter-spacing:-.03em;font-variant-numeric:tabular-nums}
  .c-list li span{font-size:34px;line-height:1.4;color:var(--ink-2)}
  .c-grid h1{font-size:84px}
  .c-grid .tiles{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:72px}
  .c-grid .tile{border:1px solid var(--bronze-line);border-radius:var(--r-card);padding:30px 30px 34px;background:var(--bronze-soft)}
  .c-grid .tk{font-size:26px;color:var(--bronze-hi);font-weight:600} .c-grid .tb{font-size:84px;font-weight:800;letter-spacing:-.04em;margin-top:14px;font-variant-numeric:tabular-nums}
  .c-grid .tl{font-size:24px;color:var(--mut);margin-top:10px;line-height:1.4}
  .c-hero .big{font-size:260px;margin-top:110px;color:var(--bronze-hi)}
  .c-hero h1{font-size:68px;line-height:1.25;margin-top:56px}
  .c-hero .sp{margin:auto 0 0} .c-hero .sp .viz:not(.fit){height:220px}
  .c-hero .next{font-size:30px;color:var(--mut);margin:28px 0 36px}
  .c-alert{border-top:14px solid var(--bronze)}
  .c-alert .tag{display:inline-block;align-self:flex-start;margin-top:120px;font-size:44px;font-weight:800;padding:14px 30px;border-radius:var(--r-cta);background:var(--bronze);color:var(--bg)}
  .c-alert h1{font-size:92px;line-height:1.16;margin-top:56px}
  .c-alert .big{font-size:150px;margin-top:auto;color:var(--bronze-hi)} .c-alert .bl{margin-bottom:56px}

  /* story slides: words first — a headline, a few sentences, at most one number. Every size is scaled by --k, which
     fit() in the page sets per slide so the words fill the slide instead of leaving an empty bottom half. */
  .st{--k:1} .st.mid>:nth-child(2){margin-top:auto} .st .ln{display:block;text-wrap:balance} .st .txt .ln+.ln{margin-top:.28em}
  .st .kick{display:flex;justify-content:space-between;gap:calc(var(--k)*20px)} .st .kick .pg{color:var(--dim);font-weight:500}
  .st h2{font-size:calc(var(--k)*64px);line-height:1.28;letter-spacing:-.03em;margin:calc(var(--k)*52px) 0 0;font-weight:800;white-space:pre-line}
  .st .txt{font-size:calc(var(--k)*38px);line-height:1.7;color:var(--ink-2);margin:calc(var(--k)*36px) 0 0;white-space:pre-line}
  .st .num{display:flex;flex-wrap:wrap;align-items:baseline;gap:calc(var(--k)*24px);margin-top:calc(var(--k)*48px)} .st .num b{font-size:calc(var(--k)*150px);font-weight:800;letter-spacing:-.05em;line-height:1;color:var(--bronze-hi);font-variant-numeric:tabular-nums} .st .num span{flex:1 1 calc(var(--k)*300px);font-size:calc(var(--k)*30px);color:var(--mut);line-height:1.4}
  .st ol{list-style:none;padding:0;margin:calc(var(--k)*44px) 0 0;display:grid;gap:calc(var(--k)*20px);counter-reset:i}
  .st ol li{counter-increment:i;display:grid;grid-template-columns:calc(var(--k)*64px) 1fr;gap:calc(var(--k)*20px);align-items:start;font-size:calc(var(--k)*34px);line-height:1.5;color:var(--ink-2);padding:calc(var(--k)*22px) calc(var(--k)*26px);background:var(--surface);border-radius:var(--r-card);border:calc(var(--k)*1px) solid var(--line)}
  .st ol li::before{content:counter(i);width:calc(var(--k)*52px);height:calc(var(--k)*52px);border-radius:50%;background:var(--bronze-soft);color:var(--bronze-hi);display:grid;place-items:center;font-weight:800;font-size:calc(var(--k)*28px)}
  .st.quiz ol li::before{content:counter(i, upper-alpha)}
  .st ol.many{gap:calc(var(--k)*14px);margin-top:calc(var(--k)*34px)} .st ol.many li{font-size:calc(var(--k)*30px);padding:calc(var(--k)*16px) calc(var(--k)*22px)} .st ol.many li::before{width:calc(var(--k)*44px);height:calc(var(--k)*44px);font-size:calc(var(--k)*24px)}
  .st .hint{font-size:calc(var(--k)*28px);color:var(--bronze-hi);font-weight:700;margin-top:auto;margin-bottom:calc(var(--k)*36px)}
  .st.cover h2{font-size:calc(var(--k)*92px);line-height:1.16;margin-top:calc(var(--k)*110px)} .st.cover .txt{font-size:calc(var(--k)*40px)}
  .st.cover .badge{align-self:flex-start;margin-top:calc(var(--k)*72px);font-size:calc(var(--k)*30px);font-weight:700;padding:calc(var(--k)*12px) calc(var(--k)*24px);border-radius:var(--r-cta);background:var(--bronze);color:var(--bg)}
  .st.answer .num b{font-size:calc(var(--k)*180px)} .st.end{background:var(--onyx)}
  .st .more{margin-top:auto;padding-top:28px;margin-bottom:26px;font-size:26px;font-weight:600;color:var(--bronze-hi)} .st .more+.foot{margin-top:0}
  .st .srcl{margin-top:auto;padding-top:28px;margin-bottom:26px;font-size:25px;line-height:1.4;color:var(--bronze-hi);font-weight:600}
  .st .srcl+.foot{margin-top:0}
</style>
</head>
<body data-date="${slot}">
${story ? storySlides(story) : `${covers[cover]}\n${slides.map(slideHtml).join("\n")}`}
<script>
  // grow each story slide's words (--k, 0.7–1.6×) until they fill it — no empty bottom half. Whatever space is still
  // left at 1.6× goes above and below the content. render.mjs calls this after the fonts load, since the measurement
  // depends on them.
  window.fit = () => {
    const search = (lo, hi, ok) => { if (ok(hi)) return hi; for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; } return lo; };
    for (const s of document.querySelectorAll(".slide.st")) {
      s.classList.remove("mid");
      const set = (k) => s.style.setProperty("--k", k);
      const height = (k) => { set(k); s.style.height = "auto"; const h = s.offsetHeight; s.style.height = ""; return h; };
      const k = search(0.7, 1.6, (k) => height(k) <= 1350 - 48);
      set(k.toFixed(3));
      if (1350 - height(k) > 120) s.classList.add("mid");
      set(k.toFixed(3));
    }
  };
  document.fonts.ready.then(window.fit);
</script>
</body>
</html>
`;
const file = path.join(ROOT, "social", "cards.html");
const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
if (html !== before) { fs.writeFileSync(file, html); console.log(story ? `wrote social/cards.html (story: ${story.format}, ${story.slides.length} slides)` : `wrote social/cards.html (${slides.length + 1} slides, ${plan.mode}, cover ${cover}: ${design.map((s) => `${s.id}=${s.format}/${s.layout}`).join(" ")})`); }
else console.log("same  social/cards.html");
fs.mkdirSync(path.join(OUT, slot), { recursive: true });
fs.writeFileSync(path.join(OUT, slot, "design.json"), JSON.stringify(story
  ? { date, mode: plan.mode, key: plan.event?.key ?? null, format: story.format, industry: story.industry ?? null, slides: [] }
  : { date, mode: plan.mode, key: plan.event?.key ?? null, cover, slides: design.map(({ o, ...s }) => s) }, null, 1) + "\n");
