// signals.mjs — how the radar reads a series. Shared by verify.mjs (which checks the readings) and build.mjs
// (which writes them into the page), so what is checked is exactly what is shown.
//
// Two data problems decide the method (both measured 2026-10-24, see the page's checks):
//  • npm sometimes reports a day as 0 and later days as lumps (counting delays). A week's level is therefore the
//    MEDIAN of its non-zero weekday counts, not a sum — one missing or doubled day does not move a median.
//  • A whole source can shift at once (PyPI halved across every package from 2026-08-25). When the median package
//    moves by more than 30% in one week, that week is a break, and growth is only compared after the last break.

import { addDays } from "./dates.mjs";

const BREAK = 0.3;                 // source-wide week-on-week move treated as a counting change, not a trend
export const MIN_LEVEL = 20000;    // a package needs ≥ 20k downloads on a typical weekday to enter rankings

export const median = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

// days [[YYYY-MM-DD, n], ...] → complete Monday–Sunday weeks from `start` up to `until` (a Sunday) →
// [{week: Monday, level, zeros}]; a week before the package's first day has no level
function weekly(days, until, start = days[0][0]) {
  const by = new Map(days);
  const wd = new Date(start + "T00:00:00Z").getUTCDay(), mon = addDays(start, (8 - wd) % 7); // first Monday on/after start
  const out = [];
  for (let m = mon; addDays(m, 6) <= until; m = addDays(m, 7)) {
    const wk = [0, 1, 2, 3, 4].map((i) => by.get(addDays(m, i)));
    const zeros = [0, 1, 2, 3, 4, 5, 6].filter((i) => by.get(addDays(m, i)) === 0).length;
    const nz = wk.filter((v) => v > 0);
    // weeks touching 20 Dec – 10 Jan: every package dips and rebounds, so they are left out of break detection
    const md = (d) => d.slice(5), sun = addDays(m, 6), holiday = md(m) >= "12-14" || md(sun) <= "01-16";
    out.push({ week: m, level: nz.length >= 3 ? median(nz) : null, zeros, holiday });
  }
  return out;
}

// the last Sunday such that every series has data through it
function lastSunday(series) {
  const last = series.map((days) => days.at(-1)[0]).sort()[0];
  const wd = new Date(last + "T00:00:00Z").getUTCDay();
  return addDays(last, -wd); // getUTCDay: Sunday = 0
}

// Breaks are looked for in the CONTROL packages only: at week i, the median control's mean level over weeks i..i+3
// against weeks i-4..i-1. A holiday dip that rebounds the next week averages out; a counting change persists.
// Within a run of flagged weeks the largest move is the break.
export function breaks(controlWeeks) {
  const W = Object.values(controlWeeks), n = W[0].length, flagged = [];
  // mean level of a window, holiday weeks left out; null unless ≥ 2 ordinary weeks remain
  const win = (w, a, b) => { const v = w.slice(Math.max(0, a), b).filter((x) => !x.holiday).map((x) => x.level); return v.length >= 2 && v.every((x) => x) ? mean(v) : null; };
  for (let i = 4; i + 4 <= n; i++) {
    if (W[0][i].holiday) continue;
    const r = median(W.map((w) => { const a = win(w, i, i + 4), b = win(w, i - 4, i); return a && b ? a / b : null; }));
    if (r != null && Math.abs(Math.log(r)) > Math.log(1 + BREAK)) flagged.push({ i, week: W[0][i].week, ratio: r });
  }
  const out = [];
  for (const f of flagged) { const last = out.at(-1); if (last && f.i - last.i <= 4) { if (Math.abs(Math.log(f.ratio)) > Math.abs(Math.log(last.ratio))) out[out.length - 1] = f; } else out.push(f); }
  return out;
}

// every package of a source on one calendar of weeks, from the earliest first day of any of them to the last Sunday all
// have, so week i is the same week for each: everything below indexes them together (a break's week, the last 4 or 8
// weeks), and pypistats serves a package added later only ~180 days. Trailing weeks not finished counting are dropped.
export function weekTable(daysByPkg) {
  const D = Object.values(daysByPkg), until = lastSunday(D), start = D.map((d) => d[0][0]).sort()[0];
  return { until, W: trimEnd(Object.fromEntries(Object.entries(daysByPkg).map(([k, d]) => [k, weekly(d, until, start)]))) };
}

// drop trailing weeks the source has not finished counting (most packages without a weekly level)
function trimEnd(weeksByPkg) {
  const W = Object.values(weeksByPkg); let n = W[0].length;
  while (n > 0 && W.filter((w) => w[n - 1].level == null).length > W.length / 2) n--;
  return Object.fromEntries(Object.entries(weeksByPkg).map(([k, w]) => [k, w.slice(0, n)]));
}

// growth readings for one package's weeks, using only weeks from index `from` on
export function readings(w, from = 0) {
  const lv = w.map((x) => x.level), n = lv.length, ok = (a, b) => a >= from && lv.slice(a, b).every((v) => v != null);
  const avg = (a, b) => mean(lv.slice(a, b));
  const g = (end) => (ok(end - 8, end) ? avg(end - 4, end) / avg(end - 8, end - 4) - 1 : null);
  const g4 = g(n), g4prev = g(n - 4);
  return {
    level: ok(n - 4, n) ? avg(n - 4, n) : null,
    g4,                                                                   // last 4 weeks vs the 4 before
    accel: g4 != null && g4prev != null ? g4 - g4prev : null,             // is that growth speeding up?
    yoy: ok(n - 56, n) ? avg(n - 4, n) / avg(n - 56, n - 52) - 1 : null,  // vs the same 4 weeks a year earlier
    surge: ok(n - 13, n) ? lv[n - 1] / median(lv.slice(n - 13, n - 1)) - 1 : null, // last week vs the 12 before
  };
}

// a group's shares of the 4-week level, `back` weeks before the latest
export function shares(weeksByPkg, back = 0) {
  const lv = Object.fromEntries(Object.entries(weeksByPkg).map(([k, w]) => { const n = w.length - back; const a = w.slice(n - 4, n).map((x) => x.level); return [k, a.every((v) => v != null) ? mean(a) : null]; }));
  const tot = Object.values(lv).reduce((s, v) => s + (v ?? 0), 0);
  return Object.fromEntries(Object.entries(lv).map(([k, v]) => [k, v == null || !tot ? null : v / tot]));
}
