// viz.mjs — the ways an insight can be drawn, as plain SVG strings (no browser needed). Shared by the site
// (trends/build.mjs) and the Instagram cards (social/build.mjs); VIZ_CSS colours both the same way.
//
// Every insight carries `viz`: the data shapes it can be drawn from, in order of preference —
//   { kind: "series", values, formats? }                      a line over time
//   { kind: "versus", fromText, toText, from, to, fromLabel, toLabel }   before → after
//   { kind: "share",  parts: [{ name, value }], focus }        parts of a whole (focus = the part that matters)
//   { kind: "rank",   items: [{ name, value, label }] }        an ordered list, biggest first
// FORMATS lists the drawings for each shape. The site draws every card with its first option; the Instagram cards
// rotate through the rest, so the same insight looks different from one post to the next.

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); // safe in attributes too
const num = (v) => (Number.isFinite(v) ? v : 0);
const cut = (s, n) => (String(s).length > n ? String(s).slice(0, Math.max(1, n - 1)) + "…" : String(s));
const f1 = (v) => v.toFixed(1);

export const FORMATS = {
  series: ["area", "line", "columns"],
  versus: ["slope", "bars2", "arrow"],
  share: ["donut", "waffle", "stack"],
  rank: ["hbars", "dots", "podium"],
};
// formats whose labels need room: drawn at their own aspect ratio, never stretched
export const FITTED = new Set(["slope", "bars2", "arrow", "donut", "waffle", "stack", "hbars", "dots", "podium"]);

// every (shape, format) pair an insight can be drawn with, in preference order
export const options = (viz) => (viz ?? []).flatMap((v, i) => (v.formats ?? FORMATS[v.kind]).map((format) => ({ i, kind: v.kind, format })));

// site: w 300, h 64 (lines) or 300×110 (labelled); Instagram: w 900 and big = true
export function draw(v, format, { w = 300, h, big = false } = {}) {
  const fit = FITTED.has(format);
  h ??= fit ? 110 : 64;
  const fs = big ? 34 : 12.5, sw = big ? 5 : 2; // label size and stroke width, in SVG units
  const svg = (inner) => `<svg class="viz${fit ? " fit" : ""}" viewBox="0 0 ${w} ${h}"${fit ? "" : ` preserveAspectRatio="none"`} aria-hidden="true">${inner}</svg>`;
  const t = (x, y, s, cls = "", anchor = "start", size = fs) => `<text x="${f1(x)}" y="${f1(y)}"${cls ? ` class="${cls}"` : ""}${anchor === "start" ? "" : ` text-anchor="${anchor}"`} font-size="${f1(size)}">${esc(s)}</text>`;

  switch (format) {
    case "area": case "line": case "columns": {
      const vals = (v.values ?? []).filter((x) => x != null);
      if (vals.length < 2) return "";
      if (format === "columns") {
        const lo = Math.min(0, ...vals), hi = Math.max(...vals), Y = (x) => h - 2 - ((x - lo) / (hi - lo || 1)) * (h - 6), bw = w / vals.length;
        return svg(vals.map((x, i) => `<rect x="${f1(i * bw + bw * 0.15)}" y="${f1(Math.min(Y(x), Y(0)))}" width="${f1(bw * 0.7)}" height="${f1(Math.max(1, Math.abs(Y(0) - Y(x))))}" class="${i === vals.length - 1 ? "hi" : "dim"}"/>`).join(""));
      }
      const lo = Math.min(...vals), hi = Math.max(...vals), Y = (x) => h - 4 - ((x - lo) / (hi - lo || 1)) * (h - 10), X = (i) => (i * w) / (vals.length - 1);
      const d = vals.map((x, i) => `${i ? "L" : "M"}${f1(X(i))},${f1(Y(x))}`).join("");
      return svg(format === "area"
        ? `<path class="a" d="${d}L${w},${h}L0,${h}Z"/><path class="l" d="${d}"/>`
        : `<path class="l thin" d="${d}"/><path class="l end" d="M${f1(w - 0.01)},${f1(Y(vals.at(-1)))}h0.01"/>`);
    }

    case "slope": { // two points joined by a line, values at both ends, labels underneath
      const lo = Math.min(0, num(v.from), num(v.to)), hi = Math.max(num(v.from), num(v.to)) || 1;
      const Y = (x) => h - fs * 2 - ((x - lo) / (hi - lo || 1)) * (h - fs * 3.6), x0 = w * 0.3, x1 = w * 0.7;
      return svg(`<line x1="${x0}" y1="${f1(Y(v.from))}" x2="${x1}" y2="${f1(Y(v.to))}" class="sl" stroke-width="${sw}"/>`
        + `<circle cx="${x0}" cy="${f1(Y(v.from))}" r="${big ? 11 : 4}" class="dim"/><circle cx="${x1}" cy="${f1(Y(v.to))}" r="${big ? 14 : 5}" class="hi"/>`
        + t(x0 - fs * 0.8, Y(v.from) + fs * 0.35, v.fromText, "m", "end") + t(x1 + fs * 0.8, Y(v.to) + fs * 0.35, v.toText, "v")
        + t(x0, h - fs * 0.4, v.fromLabel, "m", "middle", fs * 0.85) + t(x1, h - fs * 0.4, v.toLabel, "m", "middle", fs * 0.85));
    }
    case "bars2": { // before / after as two bars
      const hi = Math.max(num(v.from), num(v.to)) || 1, bh = h * 0.24, lw = w * 0.28, room = w - lw - w * 0.24;
      const bar = (y, val, txt, label, cls) => { const len = Math.max(3, (num(val) / hi) * room);
        return t(lw - fs * 0.6, y + bh * 0.7, label, "m", "end", fs * 0.85) + `<rect x="${lw}" y="${f1(y)}" width="${f1(len)}" height="${f1(bh)}" rx="${f1(bh / 5)}" class="${cls}"/>` + t(lw + len + fs * 0.5, y + bh * 0.7, txt, cls === "hi" ? "v" : "m"); };
      return svg(bar(h * 0.14, v.from, v.fromText, v.fromLabel, "dim") + bar(h * 0.56, v.to, v.toText, v.toLabel, "hi"));
    }
    case "arrow": { // two big numbers either side of an arrow
      const y = h * 0.56, ah = fs * 0.6, ay = y - fs * 0.55;
      return svg(t(w * 0.22, y, v.fromText, "m", "middle", fs * 1.7) + t(w * 0.76, y, v.toText, "v", "middle", fs * 2.1)
        + `<path d="M${f1(w * 0.43)},${f1(ay)}H${f1(w * 0.55)}M${f1(w * 0.55 - ah)},${f1(ay - ah)}L${f1(w * 0.55)},${f1(ay)}L${f1(w * 0.55 - ah)},${f1(ay + ah)}" class="sl" stroke-width="${sw}"/>`
        + t(w * 0.22, h - fs * 0.4, v.fromLabel, "m", "middle", fs * 0.85) + t(w * 0.76, h - fs * 0.4, v.toLabel, "m", "middle", fs * 0.85));
    }

    case "donut": {
      const tot = v.parts.reduce((s, p) => s + num(p.value), 0) || 1, r = h * 0.34, cx = h / 2, cy = h / 2, C = 2 * Math.PI * r, fi = v.focus ?? 0, f = v.parts[fi];
      let off = 0;
      const segs = v.parts.map((p, i) => { const len = (num(p.value) / tot) * C, gap = Math.min(len * 0.3, big ? 6 : 2);
        const s = `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" class="seg ${i === fi ? "hi" : i % 2 ? "dim2" : "dim"}" stroke-width="${f1(h * 0.18)}" stroke-dasharray="${f1(Math.max(0, len - gap))} ${f1(C - len + gap)}" stroke-dashoffset="${f1(-off)}" transform="rotate(-90 ${f1(cx)} ${f1(cy)})"/>`;
        off += len; return s; }).join("");
      const tx = h * 1.12;
      return svg(segs + t(tx, h * 0.42, `${(num(f.value) / tot * 100).toFixed(1)}%`, "v", "start", fs * 1.9) + t(tx, h * 0.42 + fs * 1.5, cut(f.name, 24)) + t(tx, h * 0.42 + fs * 2.8, `${v.parts.length}개로 나눈 비중`, "m", "start", fs * 0.85));
    }
    case "waffle": { // 100 squares, the focus part's share filled
      const tot = v.parts.reduce((s, p) => s + num(p.value), 0) || 1, f = v.parts[v.focus ?? 0], n = Math.round((num(f.value) / tot) * 100);
      const cell = h / 10, sq = cell * 0.8;
      let sqs = ""; for (let i = 0; i < 100; i++) sqs += `<rect x="${f1((i % 10) * cell)}" y="${f1((9 - Math.floor(i / 10)) * cell)}" width="${f1(sq)}" height="${f1(sq)}" rx="${f1(sq / 5)}" class="${i < n ? "hi" : "dim2"}"/>`;
      const tx = h * 1.1;
      return svg(sqs + t(tx, h * 0.42, `100칸 중 ${n}칸`, "v", "start", fs * 1.5) + t(tx, h * 0.42 + fs * 1.5, cut(f.name, 24)) + t(tx, h * 0.42 + fs * 2.8, `${(num(f.value) / tot * 100).toFixed(1)}%`, "m", "start", fs * 0.85));
    }
    case "stack": { // one bar split into its parts, the wide ones labelled underneath
      const tot = v.parts.reduce((s, p) => s + num(p.value), 0) || 1, bh = h * 0.36, fi = v.focus ?? 0;
      let x = 0; const segs = [], labels = [];
      v.parts.forEach((p, i) => { const pw = (num(p.value) / tot) * w;
        segs.push(`<rect x="${f1(x)}" y="0" width="${f1(Math.max(0, pw - (big ? 4 : 1.5)))}" height="${f1(bh)}" class="${i === fi ? "hi" : i % 2 ? "dim2" : "dim"}"/>`);
        if (pw >= w * 0.17) labels.push(t(x, bh + fs * 1.4, cut(p.name, Math.floor(pw / (fs * 0.62))), i === fi ? "v" : "m", "start", fs * 0.9) + t(x, bh + fs * 2.6, `${(num(p.value) / tot * 100).toFixed(1)}%`, "m", "start", fs * 0.85));
        x += pw; });
      return svg(segs.join("") + labels.join(""));
    }

    case "hbars": case "dots": {
      // lengths run from the smallest value (or zero), so a negative entry is the shortest, never a long bar
      const it = v.items.slice(0, 5), vals = it.map((x) => num(x.value)), lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), rh = h / it.length, lw = w * 0.4, room = w - lw - w * 0.22;
      return svg(it.map((x, i) => { const y = i * rh, len = Math.max(3, ((vals[i] - lo) / (hi - lo || 1)) * room), cy = y + rh * 0.5, c = i ? "m" : "v";
        const mark = format === "hbars"
          ? `<rect x="${f1(lw)}" y="${f1(y + rh * 0.22)}" width="${f1(len)}" height="${f1(rh * 0.56)}" rx="${f1(rh * 0.12)}" class="${i ? "dim" : "hi"}"/>`
          : `<line x1="${f1(lw)}" y1="${f1(cy)}" x2="${f1(lw + len)}" y2="${f1(cy)}" class="grid" stroke-width="${big ? 2 : 1}"/><circle cx="${f1(lw + len)}" cy="${f1(cy)}" r="${f1(Math.min(rh * 0.24, big ? 16 : 6))}" class="${i ? "dim" : "hi"}"/>`;
        return t(lw - fs * 0.6, cy + fs * 0.35, cut(x.name, Math.floor((lw - fs) / (fs * 0.58))), c, "end", fs * 0.92) + mark + t(lw + len + fs * 0.7, cy + fs * 0.35, x.label, c, "start", fs * 0.92); }).join(""));
    }
    case "podium": { // the top three on steps: 2nd · 1st · 3rd
      const it = v.items.slice(0, 3), cw = w / 3, top = fs * 3.4, steps = [1, 0.7, 0.48];
      return svg([1, 0, 2].filter((i) => it[i]).map((i) => { const k = [1, 0, 2].indexOf(i), ph = (h - top) * steps[i], x = k * cw + cw * 0.1, y = h - ph, mid = x + cw * 0.4, c = i ? "m" : "v";
        return `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(cw * 0.8)}" height="${f1(ph)}" rx="${f1(cw * 0.05)}" class="${i ? "dim" : "hi"}"/>`
          + t(mid, y - fs * 1.6, cut(it[i].name, Math.floor(cw / (fs * 0.6))), c, "middle", fs * 0.9) + t(mid, y - fs * 0.45, it[i].label, c, "middle", fs * 0.9)
          + t(mid, y + Math.min(ph * 0.6, fs * 2), String(i + 1), "rk", "middle", fs * 1.3); }).join(""));
    }
    default: return "";
  }
}

// colours for every drawing above; the page and the cards both include it, so they stay alike
export const VIZ_CSS = `.viz{display:block;width:100%}
.viz .a{fill:var(--bronze-soft)}
.viz .l{fill:none;stroke:var(--bronze-hi);stroke-width:2;vector-effect:non-scaling-stroke}
.viz .l.thin{stroke-width:1.5} .viz .l.end{stroke-width:7;stroke-linecap:round}
.viz rect,.viz circle{fill:var(--bronze-line)}
.viz .hi{fill:var(--bronze-hi)} .viz .dim{fill:var(--bronze-line)} .viz .dim2{fill:rgba(184,149,106,.22)}
.viz .seg,.viz .seg.hi,.viz .seg.dim,.viz .seg.dim2{fill:none} .viz .seg.hi{stroke:var(--bronze-hi)} .viz .seg.dim{stroke:var(--bronze-line)} .viz .seg.dim2{stroke:rgba(184,149,106,.22)}
.viz .sl{fill:none;stroke:var(--bronze-hi);stroke-linecap:round;stroke-linejoin:round}
.viz .grid{stroke:var(--line)}
.viz text{fill:var(--ink-2);font-variant-numeric:tabular-nums} .viz .v{fill:var(--bronze-hi);font-weight:700} .viz .m{fill:var(--mut)} .viz .rk{fill:var(--bg);font-weight:800}`;
