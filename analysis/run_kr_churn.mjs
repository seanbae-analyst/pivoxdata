// analysis/run_kr_churn.mjs — 서울 상가 연간 churn: 2025-03-31 vs 2026-03-31 스냅샷 diff.
// 같은 entity key(상가업소번호)로 두 분기를 대조: 사라진 등재 = "소멸", 새 등재 = "신규".
// ⚠️ 스냅샷 diff는 실제 개폐업 + 공단 DB 정비가 섞인 "등재 기준" 변화다 — 메모에 명시.
// 재현: 두 분기 zip에서 서울 CSV를 kr_data/seoul_sanga_202503.csv / _202603.csv 로 추출 후
//   node --max-old-space-size=8192 analysis/run_kr_churn.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseFile } from "../parse.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => {
  const { rows } = parseFile(path.join(here, "../kr_data", f));
  const m = new Map();
  for (const r of rows) {
    const id = String(r["상가업소번호"] ?? "").trim();
    if (id) m.set(id, { cat: String(r["상권업종대분류명"] ?? "").trim(), gu: String(r["시군구명"] ?? "").trim() });
  }
  return m;
};
const prev = load("seoul_sanga_202503.csv");
const cur = load("seoul_sanga_202603.csv");

let survived = 0;
const gone = new Map(), born = new Map(), goneGu = new Map(), bornGu = new Map();
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
for (const [id, v] of prev) {
  if (cur.has(id)) survived++;
  else { bump(gone, v.cat); bump(goneGu, v.gu); }
}
for (const [id, v] of cur) if (!prev.has(id)) { bump(born, v.cat); bump(bornGu, v.gu); }

const goneN = prev.size - survived, bornN = cur.size - survived;
const catStat = new Map();
for (const [, v] of prev) { const s = catStat.get(v.cat) || { prev: 0 }; s.prev++; catStat.set(v.cat, s); }
const byCat = [...catStat.entries()].filter(([, s]) => s.prev >= 5000).map(([k, s]) => ({
  cat: k, prev: s.prev,
  gone_pct: +(((gone.get(k) || 0) / s.prev) * 100).toFixed(1),
})).sort((a, b) => b.gone_pct - a.gone_pct);

const guStat = new Map();
for (const [, v] of prev) { const s = guStat.get(v.gu) || { prev: 0 }; s.prev++; guStat.set(v.gu, s); }
const byGu = [...guStat.entries()].filter(([, s]) => s.prev >= 5000).map(([k, s]) => ({
  gu: k, prev: s.prev, gone_pct: +(((goneGu.get(k) || 0) / s.prev) * 100).toFixed(1),
})).sort((a, b) => b.gone_pct - a.gone_pct);

const f = {
  caveat: "등재 기준 diff — 실제 개폐업 + 공단 DB 정비 혼재. 상가업소번호 재부여 가능성 미확인.",
  prev_20250331: prev.size, cur_20260331: cur.size,
  survived, gone: goneN, born: bornN,
  gone_rate_pct: +((goneN / prev.size) * 100).toFixed(1),
  born_rate_pct: +((bornN / prev.size) * 100).toFixed(1),
  net_pct: +(((cur.size - prev.size) / prev.size) * 100).toFixed(1),
  churn_by_category: byCat,
  churn_by_gu_top5: byGu.slice(0, 5), churn_by_gu_bottom3: byGu.slice(-3),
};
fs.writeFileSync(path.join(here, "findings_kr_churn.json"), JSON.stringify(f, null, 2));
console.log(JSON.stringify(f, null, 2));
