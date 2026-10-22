// ecos.mjs — minimal Bank of Korea ECOS Open API client.
// The public sample key returns at most 10 rows per call, so a range is read in 10-period windows.
// Set ECOS_KEY to a personal key to lift that limit (the windowing still works with it).

const KEY = process.env.ECOS_KEY || "sample";
const PER = KEY === "sample" ? 10 : 1000;
export const URL_TEMPLATE = "https://ecos.bok.or.kr/api/StatisticSearch/{키}/json/kr/{시작행}/{끝행}/{표}/{주기}/{시작}/{끝}/{항목…}";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 5) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i >= tries - 1) throw new Error(`${url.replace(KEY, "{key}")}: ${e.message}`);
      await sleep(800 * 2 ** i);
    }
  }
}

// periods: "199806" style for M, "1998" for A
function step(p, cycle, n) {
  if (cycle === "A") return String(+p + n);
  let y = +p.slice(0, 4), m = +p.slice(4) - 1 + n;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  return `${y}${String(m + 1).padStart(2, "0")}`;
}
export function nowPeriod(cycle) {
  const d = new Date();
  return cycle === "A" ? String(d.getFullYear()) : `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Returns [[period, number], ...] for every period ECOS has between start and today.
export async function series({ table, items, cycle, start }) {
  const end = nowPeriod(cycle), out = [];
  for (let from = start; from <= end; from = step(from, cycle, PER)) {
    let to = step(from, cycle, PER - 1); if (to > end) to = end;
    const url = `https://ecos.bok.or.kr/api/StatisticSearch/${KEY}/json/kr/1/${PER}/${table}/${cycle}/${from}/${to}/${items.join("/")}`;
    const j = await getJson(url);
    if (j.RESULT) { if (j.RESULT.CODE === "INFO-200") continue; throw new Error(`${table} ${from}-${to}: ${j.RESULT.CODE} ${j.RESULT.MESSAGE}`); }
    for (const r of j.StatisticSearch.row) out.push([r.TIME, r.DATA_VALUE === null || r.DATA_VALUE === "" ? null : Number(r.DATA_VALUE)]);
    await sleep(120);
  }
  return out;
}

// The agency ECOS names as the compiler of a table (e.g. "금융투자협회(02-2003-9000)").
export async function orgName(table) {
  const j = await getJson(`https://ecos.bok.or.kr/api/StatisticTableList/${KEY}/json/kr/1/10/${table}`);
  return j.StatisticTableList?.row?.[0]?.ORG_NAME ?? null;
}
