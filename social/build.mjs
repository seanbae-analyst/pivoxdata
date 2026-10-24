// build.mjs — the week's Instagram carousel as one HTML page of 1080×1350 slides, drawn from
// trends/data/insights.json (the same objects the dashboard at / shows). render.mjs screenshots each slide.
//
// Usage: node social/build.mjs   (after trends/build.mjs)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { picked } from "./pick.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const I = JSON.parse(fs.readFileSync(path.join(ROOT, "trends", "data", "insights.json"), "utf8"));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const slides = picked(I.insights);
if (slides.length < 3) throw new Error(`only ${slides.length} insights — not enough for a carousel`);
const date = I.built_at, [y, m, d] = date.split("-");
const foot = `<div class="foot"><span>data.pivoxquant.com</span><span>투자 권유 아님</span></div>`;

const cover = `<section class="slide cover">
  <div class="kick">AI 기술 신호 레이더 · ${+y}년 ${+m}월 ${+d}일</div>
  <h1>이번 주<br>기사보다 먼저<br>움직인 숫자</h1>
  <ol>${slides.slice(0, 3).map((x) => `<li><b>${esc(x.big)}</b><span>${esc(x.title)}</span></li>`).join("")}</ol>
  ${foot}
</section>`;

const body = slides.map((x, i) => `<section class="slide">
  <div class="kick">${String(i + 1).padStart(2, "0")} · ${esc(x.k)}</div>
  <div class="big">${esc(x.big)}</div>
  <div class="bl">${esc(x.bl)}</div>
  <h2>${esc(x.title)}</h2>
  <p>${esc(x.body)}</p>
  <div class="sp">${x.svg}</div>
  <div class="src">${esc(x.src)}</div>
  ${foot}
</section>`).join("\n");

const outro = `<section class="slide outro">
  <div class="kick">어떻게 쟀나</div>
  <h2>매주 같은 방식으로,<br>평소보다 빨리 커지는 것을 먼저</h2>
  <ul>
    <li>개발자 다운로드: npm · PyPI(CC BY 4.0) — 대조군(react·numpy 등)보다 얼마나 더 컸는지로 줄을 세웁니다</li>
    <li>연구: arXiv 논문 초록(CC0)</li>
    <li>오픈 모델: Hugging Face 다운로드</li>
    <li>자본: 미국 SEC 공시의 설비투자</li>
  </ul>
  <p>다운로드 수는 사용자 수가 아닙니다. 지난 숫자만 말하고, 예측하거나 투자를 권하지 않습니다.</p>
  <div class="url">data.pivoxquant.com</div>
  ${foot}
</section>`;

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
  :root{--bg:#050505;--surface:#0d0d0d;--line:rgba(255,255,255,.1);--ink:#ededed;--ink-2:#cfcfcf;--mut:#9b9b9b;--dim:#6c6c6c;--bronze:#b8956a;--bronze-hi:#cdab80;--bronze-soft:rgba(184,149,106,.14);--bronze-line:rgba(184,149,106,.45)}
  *{box-sizing:border-box} html,body{margin:0;background:#222}
  body{font-family:"Pretendard Variable",Pretendard,system-ui,sans-serif;color:var(--ink);word-break:keep-all}
  .slide{width:1080px;height:1350px;background:radial-gradient(1200px 700px at 85% -10%,rgba(184,149,106,.16),transparent 60%),var(--bg);padding:96px 92px 0;position:relative;display:flex;flex-direction:column;margin:0 0 24px;overflow:hidden}
  .kick{font-size:30px;font-weight:600;color:var(--bronze-hi);letter-spacing:-.01em}
  .big{font-size:200px;font-weight:800;letter-spacing:-.05em;line-height:1;margin-top:64px;font-variant-numeric:tabular-nums}
  .bl{font-size:32px;color:var(--mut);margin-top:18px}
  h1,h2,.cover li span{text-wrap:balance} p,li{text-wrap:pretty}
  h1{font-size:104px;line-height:1.12;letter-spacing:-.04em;margin:80px 0 0;font-weight:800}
  h2{font-size:52px;line-height:1.3;letter-spacing:-.03em;margin:64px 0 0;font-weight:700}
  p{font-size:32px;line-height:1.6;color:var(--ink-2);margin:28px 0 0}
  .sp{margin-top:auto;margin-bottom:28px}
  .sp svg{width:100%;height:220px;display:block}
  .sp .l{fill:none;stroke:var(--bronze-hi);stroke-width:5;vector-effect:non-scaling-stroke}
  .sp .a{fill:var(--bronze-soft)} .sp rect{fill:var(--bronze-line)} .sp rect.hi{fill:var(--bronze-hi)}
  .src{font-size:24px;color:var(--dim);margin-bottom:28px}
  .foot{height:96px;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;font-size:24px;color:var(--mut);margin-top:auto}
  .cover ol{list-style:none;padding:0;margin:96px 0 0;display:grid;gap:34px}
  .cover li{display:grid;grid-template-columns:260px 1fr;gap:28px;align-items:baseline}
  .cover li b{font-size:60px;font-weight:800;color:var(--bronze-hi);letter-spacing:-.03em;font-variant-numeric:tabular-nums}
  .cover li span{font-size:34px;line-height:1.4;color:var(--ink-2)}
  .outro ul{margin:56px 0 0;padding-left:36px;font-size:32px;line-height:1.6;color:var(--ink-2)} .outro li{margin-bottom:14px}
  .outro .url{font-size:48px;font-weight:700;color:var(--bronze-hi);margin-top:auto;margin-bottom:48px}
</style>
</head>
<body data-date="${date}">
${cover}
${body}
${outro}
</body>
</html>
`;
const file = path.join(ROOT, "social", "cards.html");
const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
if (html !== before) { fs.writeFileSync(file, html); console.log(`wrote social/cards.html (${slides.length + 2} slides, ${date})`); } else console.log("same  social/cards.html");
