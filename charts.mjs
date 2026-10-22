// charts.mjs — the lab's two chart shapes (lines over months, bars over months), shared by research pages.
// Same conventions as the first net-buying page: inline SVG, tooltip on hover/tap, ← → keys move the
// month, an aria-live line repeats the tooltip for screen readers, redraw on resize. No dependencies.
//
//   lines(box, {months, series:[{name, color, values}], fmt, yfmt, live, label, marks})
//   bars(box,  {months, values, color, fmt, yfmt, live, label, marks, tipExtra})
// months: ["199901", ...]; values: numbers or null (gap). marks: [{at:"202605", text:"…"}] direct labels.

const NS = "http://www.w3.org/2000/svg";
const el = (n, a = {}, p) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
export const lbl = (t) => t.slice(0, 4) + "." + t.slice(4);

export function niceTicks(lo, hi, n) {
  const span = hi - lo || 1;
  const step = [1, 2, 2.5, 5, 10].map((m) => m * Math.pow(10, Math.floor(Math.log10(span / n)))).find((s) => span / s <= n) || span / n;
  const out = []; for (let v = Math.floor(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(6));
  if (out[out.length - 1] < hi) out.push(+(out[out.length - 1] + step).toFixed(6));
  return out;
}

function frame(box, { label, narrow, H, m }) {
  box.innerHTML = "";
  const W = box.clientWidth;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", tabindex: "0", "aria-label": label }, box);
  const tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true; box.appendChild(tip);
  return { W, svg, tip, iw: W - m.l - m.r, ih: H - m.t - m.b };
}

function axes(svg, { W, H, m, iw, ticks, Y, yfmt, months, X, narrow, zeroLine }) {
  ticks.forEach((t) => {
    el("line", { x1: m.l, x2: m.l + iw, y1: Y(t), y2: Y(t), stroke: t === 0 && zeroLine ? "#55524c" : "#1d1c1a", "stroke-width": 1 }, svg);
    el("text", { x: m.l - 8, y: Y(t) + 4, "text-anchor": "end" }, svg).textContent = yfmt(t);
  });
  const years = months.filter((t) => t.endsWith("01")).map((t) => +t.slice(0, 4));
  const span = years.length, every = span > 20 ? (narrow ? 5 : 2) : span > 10 ? (narrow ? 3 : 1) : 1;
  months.forEach((t, i) => { if (t.endsWith("01") && +t.slice(0, 4) % every === 0) el("text", { x: X(i), y: H - 8, "text-anchor": "middle" }, svg).textContent = t.slice(0, 4); });
}

function interact(svg, { n, W, H, iw, m, X, show, hide, pick }) {
  let cur = n - 1;
  svg.addEventListener("pointermove", (e) => { const b = svg.getBoundingClientRect(); const x = (e.clientX - b.left) * W / b.width; cur = pick(x); show(cur, x, (e.clientY - b.top) * H / b.height); });
  svg.addEventListener("pointerleave", hide);
  svg.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    cur = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : Math.max(0, Math.min(n - 1, cur + (e.key === "ArrowLeft" ? -1 : 1)));
    show(cur);
  });
  svg.addEventListener("focus", () => show(cur)); svg.addEventListener("blur", hide);
}

function placeTip(tip, x, y, W) { tip.style.left = Math.min(Math.max(0, x + 12), W - tip.offsetWidth) + "px"; tip.style.top = Math.max(0, y - 10) + "px"; }

export function lines(box, o) {
  const draw = () => {
    const narrow = box.clientWidth < 560, H = o.height?.(narrow) ?? (narrow ? 250 : 320);
    const endW = o.endLabels === false ? 12 : narrow ? 56 : 110;
    const m = { t: 18, r: endW, b: 28, l: narrow ? 44 : 54 };
    const { W, svg, tip, iw, ih } = frame(box, { label: o.label, narrow, H, m });
    const n = o.months.length, all = o.series.flatMap((s) => s.values).filter((v) => v != null);
    const lo = Math.min(o.min ?? Infinity, ...all), hi = Math.max(...all);
    const ticks = niceTicks(lo, hi, narrow ? 4 : 5), y0 = Math.min(lo, ticks[0]), y1 = Math.max(hi, ticks[ticks.length - 1]);
    const Y = (v) => m.t + ih - (v - y0) / (y1 - y0) * ih, X = (i) => m.l + i * iw / Math.max(1, n - 1);
    axes(svg, { W, H, m, iw, ticks, Y, yfmt: o.yfmt, months: o.months, X, narrow, zeroLine: y0 < 0 });
    (o.bands || []).forEach((b) => { const i0 = o.months.indexOf(b.from), i1 = o.months.indexOf(b.to); if (i0 < 0 || i1 < 0) return;
      el("rect", { x: X(i0), y: m.t, width: Math.max(2, X(i1) - X(i0)), height: ih, fill: "#f2eee6", "fill-opacity": 0.05 }, svg);
      if (b.text) el("text", { x: X(i0) + 4, y: m.t + 12, class: "note-t" }, svg).textContent = b.text; });
    o.series.forEach((s) => {
      let d = "", pen = false;
      s.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? "L" : "M") + X(i).toFixed(1) + "," + Y(v).toFixed(1); pen = true; });
      el("path", { d, fill: "none", stroke: s.color, "stroke-width": s.width ?? 2, "stroke-linejoin": "round", "stroke-dasharray": s.dash || "" }, svg);
    });
    (o.marks || []).forEach((mk) => {
      const i = o.months.indexOf(mk.at); if (i < 0) return; const s = o.series[mk.series ?? 0], v = s.values[i]; if (v == null) return;
      el("circle", { cx: X(i), cy: Y(v), r: 3.5, fill: s.color, stroke: "#050505", "stroke-width": 2 }, svg);
      const right = i > n * 0.8;
      el("text", { x: X(i) + (right ? -8 : 8), y: Y(v) + (mk.dy ?? -8), "text-anchor": right ? "end" : "start", class: "lab" }, svg).textContent = mk.text;
    });
    if (o.endLabels !== false) {
      const ends = o.series.map((s) => ({ s, v: s.values[n - 1] })).filter((e) => e.v != null).map((e) => ({ ...e, y: Y(e.v) })).sort((a, b) => a.y - b.y);
      for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 16) ends[i].y = ends[i - 1].y + 16;
      ends.forEach(({ s, v, y }) => { el("circle", { cx: X(n - 1), cy: Y(v), r: 4, fill: s.color, stroke: "#050505", "stroke-width": 2 }, svg);
        el("text", { x: X(n - 1) + 8, y: y + 4, class: "lab" }, svg).textContent = (narrow || o.series.length === 1 ? "" : s.name + " ") + o.fmt(v); });
    }
    const ln = el("line", { y1: m.t, y2: m.t + ih, stroke: "#55524c", visibility: "hidden" }, svg);
    const dots = o.series.map((s) => el("circle", { r: 4, fill: s.color, stroke: "#050505", "stroke-width": 2, visibility: "hidden" }, svg));
    const live = o.live && document.getElementById(o.live);
    const show = (i, px, py) => {
      ln.setAttribute("x1", X(i)); ln.setAttribute("x2", X(i)); ln.setAttribute("visibility", "visible");
      dots.forEach((d, k) => { const v = o.series[k].values[i]; d.setAttribute("visibility", v == null ? "hidden" : "visible"); if (v != null) { d.setAttribute("cx", X(i)); d.setAttribute("cy", Y(v)); } });
      const rows = o.series.map((s) => [s.name, s.values[i], s.color]);
      tip.innerHTML = `<b>${lbl(o.months[i])}</b>` + rows.map(([nm, v, c]) => `<div class="r"><span><span class="sw" style="background:${c}"></span>${nm}</span><span>${v == null ? "—" : o.fmt(v)}</span></div>`).join("") + (o.tipExtra ? o.tipExtra(i) : "");
      tip.hidden = false; placeTip(tip, px ?? X(i), py ?? m.t, W);
      if (live) live.textContent = `${lbl(o.months[i])} · ` + rows.map(([nm, v]) => `${nm} ${v == null ? "값 없음" : o.fmt(v)}`).join(" · ");
    };
    const hide = () => { ln.setAttribute("visibility", "hidden"); dots.forEach((d) => d.setAttribute("visibility", "hidden")); tip.hidden = true; };
    interact(svg, { n, W, H, iw, m, X, show, hide, pick: (x) => Math.max(0, Math.min(n - 1, Math.round((x - m.l) / iw * (n - 1)))) });
  };
  draw(); let t; addEventListener("resize", () => { clearTimeout(t); t = setTimeout(draw, 120); });
}

export function bars(box, o) {
  const draw = () => {
    const narrow = box.clientWidth < 560, H = o.height?.(narrow) ?? (narrow ? 240 : 300);
    const m = { t: 24, r: 8, b: 28, l: narrow ? 44 : 54 };
    const { W, svg, tip, iw, ih } = frame(box, { label: o.label, narrow, H, m });
    const n = o.months.length, bw = iw / n, vals = o.values;
    const nums = vals.filter((v) => v != null), lo = Math.min(0, ...nums), hi = Math.max(0, ...nums);
    const ticks = niceTicks(lo, hi, narrow ? 4 : 5), y0 = Math.min(lo, ticks[0]), y1 = Math.max(hi, ticks[ticks.length - 1]);
    const Y = (v) => m.t + ih - (v - y0) / (y1 - y0) * ih, X = (i) => m.l + i * bw;
    axes(svg, { W, H, m, iw, ticks, Y, yfmt: o.yfmt, months: o.months, X: (i) => X(i) + bw / 2, narrow, zeroLine: true });
    const g = el("g", {}, svg), gap = bw > 3 ? Math.min(1, bw * 0.25) : 0, rects = [];
    vals.forEach((v, i) => { if (v == null) { rects.push(null); return; } const y = Math.min(Y(0), Y(v)), h = Math.max(1, Math.abs(Y(v) - Y(0)));
      rects.push(el("rect", { x: X(i) + gap / 2, y, width: Math.max(0.6, bw - gap), height: h, fill: typeof o.color === "function" ? o.color(v, i) : o.color, rx: Math.min(2, bw / 3) }, g)); });
    (o.marks || []).forEach((mk) => { const i = o.months.indexOf(mk.at); if (i < 0 || vals[i] == null) return; const v = vals[i];
      el("text", { x: X(i) + bw / 2, y: v >= 0 ? Y(v) - 7 : Y(v) + 15, "text-anchor": i > n * 0.85 ? "end" : i < n * 0.1 ? "start" : "middle", class: "lab" }, svg).textContent = mk.text; });
    const hl = el("rect", { y: m.t, height: ih, fill: "#f2eee6", "fill-opacity": 0.06, width: bw, visibility: "hidden" }, svg);
    const live = o.live && document.getElementById(o.live);
    const show = (i, px, py) => {
      hl.setAttribute("x", X(i)); hl.setAttribute("visibility", "visible"); rects.forEach((r, j) => r && r.setAttribute("fill-opacity", j === i ? 1 : 0.55));
      tip.innerHTML = `<b>${lbl(o.months[i])}</b><div class="r"><span>${o.name}</span><span>${vals[i] == null ? "—" : o.fmt(vals[i])}</span></div>` + (o.tipExtra ? o.tipExtra(i) : "");
      tip.hidden = false; placeTip(tip, px ?? X(i), py ?? Y(Math.max(0, vals[i] ?? 0)), W);
      if (live) live.textContent = `${lbl(o.months[i])} ${o.name} ${vals[i] == null ? "값 없음" : o.fmt(vals[i])}`;
    };
    const hide = () => { hl.setAttribute("visibility", "hidden"); rects.forEach((r) => r && r.setAttribute("fill-opacity", 1)); tip.hidden = true; };
    interact(svg, { n, W, H, iw, m, X, show, hide, pick: (x) => Math.max(0, Math.min(n - 1, Math.floor((x - m.l) / bw))) });
  };
  draw(); let t; addEventListener("resize", () => { clearTimeout(t); t = setTimeout(draw, 120); });
}

// CSV of what a chart shows, built in the browser (the data is already on the page).
export function csvButton(btn, filename, header, rows) {
  btn.addEventListener("click", () => {
    const body = [header, ...rows].map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" }));
    a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}
