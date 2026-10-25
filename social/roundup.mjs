// roundup.mjs — once a month, "N월 AX 정리": the previous month's briefings told as one piece, web only.
// Runs every day; acts in the first days of a month when last month had at least MIN briefings and no roundup yet.
// Claude writes it from those briefings only (titles, ledes, section headings, takeaways, sources) — every number must
// appear in them, the same banned words and checks as the posts; each section names the briefings it draws on
// ([n] → links). Without Claude, or after two failed tries, the roundup is the list of the month's briefings.
// Writes social/roundups/<YYYY-MM>.json; social/briefs.mjs renders it at /briefs/roundup-<YYYY-MM>.
//
// Usage: node social/roundup.mjs   (before social/briefs.mjs)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ask, pickRoute, ClaudeUnavailable, BANNED, META, numbersIn } from "./claude.mjs";
import { THEMES, INDUSTRIES, SERIES, tagPrompt, pickTags, companyId, seriesOf } from "./tags.mjs";

const MIN = 2;
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const I = read(path.join(ROOT, "trends", "data", "insights.json"));
const today = I.built_at, OUT = path.join(ROOT, "social", "out"), DIR = path.join(ROOT, "social", "roundups");
const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1);
const month = d.toISOString().slice(0, 7), label = `${+month.slice(5)}월`;
const file = path.join(DIR, `${month}.json`);
if (fs.existsSync(file)) { console.log(`roundup ${month}: already written`); process.exit(0); }

const plain = (t) => String(t ?? "").replace(/​/g, "").replace(/‑/g, "-").replace(/ /g, " ");
const briefs = (fs.existsSync(OUT) ? fs.readdirSync(OUT) : []).sort()
  .map((slot) => ({ slot, st: read(path.join(OUT, slot, "story.json")) }))
  .filter((b) => b.st?.article?.sections?.length && b.st.date?.startsWith(month));
if (briefs.length < MIN) { console.log(`roundup ${month}: ${briefs.length} briefing(s), needs ${MIN}`); process.exit(0); }

const textOf = (b) => { const a = b.st.article; return [a.title, a.lede, ...a.sections.map((x) => x.heading), ...(a.takeaways ?? [])].map(plain).join("\n"); };
const allowed = new Set([...briefs.map(textOf), month, today].flatMap(numbersIn));
for (let n = 1; n <= 12; n++) allowed.add(String(n));

const SYSTEM = `너는 'AX 트렌드 레이더'의 에디터다. AX(기업의 AI 전환)와 IT 컨설팅 관점으로, 지난달 브리핑들을 한 편의 '월간 정리'로 엮는다. 독자는 AI 도입에 관심 있는 직장인·기업 실무자·IT 컨설턴트다.
규칙:
- 주어진 브리핑에 적힌 것만 쓴다. 숫자는 브리핑에 적힌 그대로(반올림·계산 금지). 새 사실을 더하지 않는다.
- 한 달을 관통하는 흐름 2~4개를 찾아 섹션으로 나누고, 섹션마다 근거가 된 브리핑 번호를 refs에 적는다.
- 해석은 "~로 볼 수 있어요"처럼 해석임이 드러나게. 앞으로를 단정하지 않고, 무엇을 사라·하라고 하지 않는다. "추천", "전망", "예상" 같은 말을 쓰지 않는다.
- 쉬운 존댓말(~요). 조사·띄어쓰기를 바르게, 한 문단 2~4문장, 문단 사이는 빈 줄.
출력은 JSON 하나만, 다른 글 없이:
{"title":"제목","lede":"리드 2~3문장","sections":[{"heading":"소제목","body":"문단\\n\\n문단","refs":[브리핑 번호]}],"takeaways":["핵심 한 줄"],"themes":["주제"],"industries":["업종"]}
${tagPrompt()}`;

function check(a) {
  const p = [];
  if (!a?.title || plain(a.title).length > 80) p.push("제목은 1~80자");
  if (!a?.lede || plain(a.lede).length > 400) p.push("리드는 1~400자");
  if (!Array.isArray(a?.sections) || a.sections.length < 2 || a.sections.length > 6) p.push("섹션은 2~6개");
  (a?.sections ?? []).forEach((x, i) => {
    if (!x.heading || !x.body || plain(x.body).length > 1400) p.push(`섹션 ${i + 1}: 소제목과 본문(1400자 이하)`);
    if (!Array.isArray(x.refs) || !x.refs.length || x.refs.some((r) => !Number.isInteger(r) || r < 1 || r > briefs.length)) p.push(`섹션 ${i + 1}: refs에 브리핑 번호(1~${briefs.length})`);
  });
  if (!Array.isArray(a?.takeaways) || a.takeaways.length < 2 || a.takeaways.length > 6) p.push("정리는 2~6줄");
  const all = plain([a?.title, a?.lede, ...(a?.sections ?? []).flatMap((x) => [x.heading, x.body]), ...(a?.takeaways ?? [])].join("\n"));
  const bad = [...new Set(numbersIn(all).filter((n) => !allowed.has(n)))];
  if (bad.length) p.push(`브리핑에 없는 숫자: ${bad.join(", ")}`);
  const words = [...new Set(all.match(BANNED) ?? [])];
  if (words.length) p.push(`쓰면 안 되는 말: ${words.join(", ")}`);
  if (META.test(all)) p.push("글이 아닌 메모가 섞임");
  return p;
}

const parse = (t) => { const m = String(t).match(/\{[\s\S]*\}/); if (!m) throw new SyntaxError("no JSON"); return JSON.parse(m[0]); };
async function fromClaude(route) {
  const facts = briefs.map((b, i) => `[${i + 1}] ${b.st.date} · ${SERIES[b.st.series ?? seriesOf(b.st)]?.name ?? b.st.format_name}\n${textOf(b)}\n출처: ${[...new Set((b.st.sources ?? []).map((x) => x.source))].join(", ") || "데이터"}`).join("\n\n");
  const messages = [{ role: "user", content: `${label}(${month}) 브리핑 ${briefs.length}편:\n\n${facts}\n\n'${label} AX 정리'를 JSON으로.` }];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await ask(route, SYSTEM, messages);
    if (res.refusal) return null;
    let a = null, problems;
    try { a = parse(res.text); problems = check(a); } catch (e) { problems = [`JSON으로 읽을 수 없음: ${e.message}`]; }
    if (!problems.length) return a;
    console.log(`roundup attempt ${attempt} rejected: ${problems.join(" / ")}`);
    messages.push({ role: "assistant", content: res.text }, { role: "user", content: `다음 문제를 고쳐서 JSON 전체를 다시 써 줘:\n- ${problems.join("\n- ")}` });
  }
  return null;
}

let article = null;
const route = pickRoute();
if (route) { try { article = await fromClaude(route); } catch (e) { if (!(e instanceof ClaudeUnavailable)) throw e; console.log(`roundup: ${e.message}`); } }
const fallback = {
  title: `${label} AX 정리 — 브리핑 ${briefs.length}편`, lede: `${label}에 올린 브리핑을 한곳에 모았어요.`,
  sections: briefs.map((b, i) => ({ heading: plain(b.st.article.title), body: plain(b.st.article.lede), refs: [i + 1] })),
  takeaways: briefs.flatMap((b) => b.st.article.takeaways ?? []).slice(0, 5),
};
const a = article ?? fallback;
const used = briefs.flatMap((b) => b.st.sources ?? []);
const out = {
  date: today, month, mode: "roundup-month", series: "roundup", format_name: SERIES.roundup.name, source: article ? "claude" : "list",
  article: {
    title: a.title, lede: a.lede, takeaways: a.takeaways, source: article ? "claude" : "list",
    // each section links to the briefings it draws on (code, from the refs)
    sections: a.sections.map((x) => ({ heading: x.heading, body: x.body, briefs: (x.refs ?? []).map((r) => briefs[r - 1].slot) })),
    tags: {
      themes: article ? pickTags(a.themes, THEMES, 3) : [...new Set(briefs.flatMap((b) => b.st.article.tags?.themes ?? []))].slice(0, 4),
      industries: pickTags(a.industries, INDUSTRIES, 3),
      companies: [...new Map(used.map((x) => [companyId(x.source), { id: companyId(x.source), name: x.source }])).values()],
    },
  },
  briefs: briefs.map((b) => b.slot),
};
fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
console.log(`roundup ${month}: wrote social/roundups/${month}.json (${out.source}, ${briefs.length} briefings)`);
