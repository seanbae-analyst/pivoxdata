// cardfig.js — the insight cards' figures, drawn in the browser at the size they get, so a phone page can give a chart
// all the room it has and every label stays at reading size. Each <figure class="fig" data-fig='…'> carries its data
// (trends/build.mjs writes it); what it shows is said in its <figcaption>:
//   { type: "line", unit, points: [[when, value], …], ticks: [[index, text], …], mark: { i, text } }   a value over time
//   { type: "bars", items: [{ name, v, label }], focus, ref: { v, label } }                              compare, one highlighted
//   { type: "dumbbell", unit, from, to, items: [{ name, a, b, aText, bText }], focus }                 before → after per item
// Marks follow one spec: 2px lines, dots of 8px and more with a ring in the page colour, bars at most 18px thick with a
// 4px rounded end and a square base, hairline grid; the one item the card is about in bronze, the rest in gray; text
// in the text colours, never the bar's. The server-drawn picture inside stays for readers without JavaScript.
import { niceTicks } from "/charts.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); // safe in attributes too
const r1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ctx = document.createElement("canvas").getContext("2d");
const width = (s, px, weight = 500) => { ctx.font = `${weight} ${px}px ${getComputedStyle(document.body).fontFamily}`; return ctx.measureText(String(s)).width * 1.04; }; // a little wide: before the web font arrives the canvas measures the fallback face
const text = (x, y, s, cls, anchor = "start") => `<text x="${r1(x)}" y="${r1(y)}" class="${cls}"${anchor === "start" ? "" : ` text-anchor="${anchor}"`}>${esc(s)}</text>`;
const unitOf = (u) => (t) => (t === 0 ? "0" : `${t}${u ?? ""}`);
// a bar from the baseline x0 to x1, its far end rounded (4px), its base square
const bar = (x0, x1, y, h, cls) => {
  const r = Math.min(4, h / 2, Math.abs(x1 - x0)), s = x1 >= x0 ? 1 : -1, xe = x1 - s * r;
  return `<path class="${cls}" d="M${r1(x0)},${r1(y)}H${r1(xe)}A${r},${r} 0 0 ${s > 0 ? 1 : 0} ${r1(x1)},${r1(y + r)}V${r1(y + h - r)}A${r},${r} 0 0 ${s > 0 ? 1 : 0} ${r1(xe)},${r1(y + h)}H${r1(x0)}Z"/>`;
};
const svg = (W, H, alt, inner) => `<svg class="cf" viewBox="0 0 ${r1(W)} ${r1(H)}" width="${r1(W)}" height="${r1(H)}" role="img" aria-label="${esc(alt ?? "")}">${inner}</svg>`;

// the axis a set of values gets: from 0 (or the lowest value below it) to a round number above the highest; a set that is
// all zero still gets a scale, so nothing divides by zero
const scale = (vals, n) => { const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), t = niceTicks(lo, hi > lo ? hi : lo + 1, n);
  return { ticks: t, bot: t[0], top: t.at(-1), span: t.at(-1) - t[0] || 1 }; };

function line(f, W, H) {
  // a missing value drops its point; the mark and the ticks count points, so they go with it
  const pts = (f.points ?? []).filter((p) => Number.isFinite(p?.[1])); if (!pts.length) return null;
  if (pts.length !== f.points.length) f = { ...f, points: pts, mark: null, ticks: null };
  const n = pts.length, vals = pts.map((p) => p[1]), fmt = (v) => `${v.toFixed(1)}${f.unit ?? ""}`;
  H ??= Math.round(clamp(W * 0.5, 150, 220));
  const { ticks, bot, span } = scale(vals, H < 180 ? 3 : 4), tk = unitOf(f.unit);
  const m = { l: Math.max(...ticks.map((t) => width(tk(t), 11.5))) + 8, r: width(fmt(vals.at(-1)), 13, 700) + 14, t: 14, b: 24 };
  // one point stands at the right end, where the newest value always is
  const iw = W - m.l - m.r, ih = H - m.t - m.b, X = (i) => m.l + (n > 1 ? i / (n - 1) : 1) * iw, Y = (v) => m.t + ih - ((v - bot) / span) * ih;
  let g = ticks.map((t) => `<line class="${t === 0 ? "base" : "gl"}" x1="${r1(m.l)}" x2="${r1(m.l + iw)}" y1="${r1(Y(t))}" y2="${r1(Y(t))}"/>` + text(m.l - 8, Y(t) + 4, tk(t), "tk", "end")).join("");
  for (const [i, s] of f.ticks ?? []) { const x = X(i), w = width(s, 11.5); g += text(clamp(x, m.l + w / 2, m.l + iw - w / 2), H - 6, s, "tk", "middle"); }
  const d = vals.map((v, i) => `${i ? "L" : "M"}${r1(X(i))},${r1(Y(v))}`).join("");
  g += `<path class="area" d="${d}L${r1(X(n - 1))},${r1(Y(0))}L${r1(X(0))},${r1(Y(0))}Z"/><path class="ln" d="${d}"/>`;
  if (f.mark && f.mark.i >= 0 && f.mark.i < n - 1) { // the comparison the text makes ("1년 전"), labelled on the clear side of the line
    const { i } = f.mark, x = X(i), y = Y(vals[i]), up = vals[Math.min(n - 1, i + 1)] >= vals[Math.max(0, i - 1)], s = `${f.mark.text} ${fmt(vals[i])}`, w = width(s, 12, 600);
    const lx = up ? Math.max(m.l + w, x - 8) : Math.min(m.l + iw - w, x + 8);
    g += `<circle class="dot-o" cx="${r1(x)}" cy="${r1(y)}" r="4"/>` + text(lx, Math.max(m.t + 10, y - 11), s, "lab", up ? "end" : "start");
  }
  const ex = X(n - 1), ey = Y(vals.at(-1));
  g += `<circle class="dot" cx="${r1(ex)}" cy="${r1(ey)}" r="5"/>` + text(ex + 9, Math.max(m.t + 6, ey + 4.5), fmt(vals.at(-1)), "val hi");
  g += `<g class="probe" hidden></g><rect class="hit" x="${r1(m.l)}" y="0" width="${r1(iw)}" height="${r1(H)}"/>`;
  return { h: H, svg: svg(W, H, f.alt, g), geo: { X, Y, n, m, ih, fmt }, f };
}

// tap a line chart: the month and value under the finger (tap again to clear)
function probe(plot, f, geo) {
  const el = plot.querySelector("svg"), g = el?.querySelector(".probe"); if (!g) return;
  let on = -1;
  el.querySelector(".hit").addEventListener("click", (e) => {
    const r = el.getBoundingClientRect(), x = e.clientX - r.left, i = Math.round(clamp((x - geo.m.l) / (r.width - geo.m.l - geo.m.r), 0, 1) * (geo.n - 1));
    if (i === on) { g.setAttribute("hidden", ""); on = -1; return; }
    on = i;
    const v = f.points[i][1], px = geo.X(i), py = geo.Y(v), s = `${f.points[i][0]} · ${geo.fmt(v)}`, w = width(s, 12, 600) + 16;
    const bx = clamp(px - w / 2, 0, r.width - w);
    g.innerHTML = `<line x1="${r1(px)}" x2="${r1(px)}" y1="${r1(geo.m.t)}" y2="${r1(geo.m.t + geo.ih)}"/><circle cx="${r1(px)}" cy="${r1(py)}" r="5"/>`
      + `<rect x="${r1(bx)}" y="0" width="${r1(w)}" height="20" rx="4"/>` + text(bx + w / 2, 14, s, "pt", "middle");
    g.removeAttribute("hidden");
  });
}

function bars(f, W, H) {
  const it = (f.items ?? []).filter((x) => Number.isFinite(x?.v)), n = it.length, ref = f.ref, refH = ref ? 22 : 0;
  if (!n) return null;
  const nameW = Math.min(W * 0.42, Math.max(...it.map((x) => width(x.name, 13, 600))) + 12);
  const valW = Math.max(...it.map((x) => width(x.label, 13, 700))) + 10;
  const rowH = H ? clamp((H - refH) / n, 24, 56) : 32, bh = clamp(rowH * 0.46, 10, 18), h = refH + rowH * n;
  const vals = it.map((x) => x.v), lo = Math.min(0, ...vals), hi = Math.max(0, ...vals, ref?.v ?? 0), room = W - nameW - valW;
  const X = (v) => nameW + ((v - lo) / (hi - lo || 1)) * room;
  let g = `<line class="base" x1="${r1(X(0))}" x2="${r1(X(0))}" y1="${refH}" y2="${r1(h)}"/>`;
  if (ref) { // the reference (e.g. the average) behind the bars, broken where a value label sits on it
    const x = X(ref.v), w = width(ref.label, 11.5), cuts = [];
    it.forEach((r, i) => { const lx = Math.max(X(r.v), X(0)) + 8, lw = width(r.label, 13, 700), cy = refH + i * rowH + rowH / 2;
      if (x > lx - 4 && x < lx + lw + 4) cuts.push([cy - 10, cy + 8]); });
    let y0 = refH - 4, d = "";
    for (const [a, b] of cuts) { if (a > y0) d += `M${r1(x)},${r1(y0)}V${r1(a)}`; y0 = b; }
    if (h > y0) d += `M${r1(x)},${r1(y0)}V${r1(h)}`;
    g += `<path class="ref" d="${d}"/>` + text(clamp(x, nameW + w / 2, W - w / 2), 12, ref.label, "reft", "middle");
  }
  it.forEach((x, i) => {
    const y = refH + i * rowH + (rowH - bh) / 2, cy = refH + i * rowH + rowH / 2, hi = i === (f.focus ?? 0) ? " hi" : "", x1 = X(x.v);
    g += text(nameW - 10, cy + 4.5, x.name, `nm${hi}`, "end") + bar(X(0), x1 === X(0) ? X(0) + 1 : x1, y, bh, `bar${hi}`)
      + text(Math.max(x1, X(0)) + 8, cy + 4.5, x.label, `val${hi}`);
  });
  return { h, svg: svg(W, h, f.alt, g) };
}

function dumbbell(f, W, H) {
  const it = (f.items ?? []).filter((x) => Number.isFinite(x?.a) && Number.isFinite(x?.b)), n = it.length, legH = 26, axH = 22, tk = unitOf(f.unit);
  if (!n) return null;
  const nameW = Math.min(W * 0.34, Math.max(...it.map((x) => width(x.name, 13, 600))) + 12);
  const right = (x) => (Math.abs(x.b - x.a) < 3 ? `${x.bText} · ${f.from} ${x.aText}` : x.bText); // close dots: say both on the right
  const valW = Math.max(...it.map((x) => width(right(x), 13, 700))) + 12;
  const rowH = H ? clamp((H - legH - axH) / n, 34, 64) : 40, h = legH + rowH * n + axH;
  const { ticks, bot, span } = scale(it.flatMap((x) => [x.a, x.b]), 4), room = W - nameW - valW - 6;
  const X = (v) => nameW + 6 + ((v - bot) / span) * room;
  // the key: hollow = before, filled = now
  let g = `<circle class="from" cx="${r1(nameW + 12)}" cy="10" r="5"/>` + text(nameW + 22, 14, f.from, "sub")
    + `<circle class="to" cx="${r1(nameW + 34 + width(f.from, 11.5))}" cy="10" r="5"/>` + text(nameW + 44 + width(f.from, 11.5), 14, f.to, "sub");
  g += ticks.map((t) => `<line class="gl" x1="${r1(X(t))}" x2="${r1(X(t))}" y1="${legH}" y2="${r1(h - axH)}"/>` + text(X(t), h - 6, tk(t), "tk", "middle")).join("");
  it.forEach((x, i) => {
    const cy = legH + i * rowH + rowH / 2, hi = i === (f.focus ?? 0) ? " hi" : "", xa = X(x.a), xb = X(x.b), far = Math.max(xa, xb), near = Math.min(xa, xb);
    g += text(nameW - 10, cy + 4.5, x.name, `nm${hi}`, "end") + `<line class="conn" x1="${r1(xa)}" x2="${r1(xb)}" y1="${r1(cy)}" y2="${r1(cy)}"/>`
      + `<circle class="from" cx="${r1(xa)}" cy="${r1(cy)}" r="5"/><circle class="to${hi}" cx="${r1(xb)}" cy="${r1(cy)}" r="6"/>`
      + text(far + 12, cy + 4.5, right(x), `val${hi}`);
    const aw = width(x.aText, 11.5); // the before value on the left of the pair, when there is room for it
    if (Math.abs(x.b - x.a) >= 3 && near - 10 - aw > nameW + 2) g += text(near - 10, cy + 4, x.aText, "sub", "end");
  });
  return { h, svg: svg(W, h, f.alt, g) };
}

const TYPES = { line, bars, dumbbell };

// draw one figure into its .plot at width W (its box) and height H (null: the figure's own natural height); returns the height used
export function drawFig(fig, H = null) {
  const plot = fig.querySelector(".plot"), W = plot?.clientWidth; if (!W) return 0;
  let f; try { f = JSON.parse(fig.dataset.fig); } catch { return 0; }
  const draw = TYPES[f.type]; if (!draw) return 0;
  const out = draw(f, W, H); if (!out) return 0; // nothing to draw: the server-drawn picture stays
  plot.innerHTML = out.svg; fig.classList.add("drawn");
  if (f.type === "line") probe(plot, out.f, out.geo);
  return out.h;
}
export const drawAll = (root = document) => { for (const fig of root.querySelectorAll("figure.fig[data-fig]")) drawFig(fig); };
