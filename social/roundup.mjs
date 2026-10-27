// roundup.mjs — once a month, "N월 AX 정리": the previous month's briefings told as one piece, web only.
// Runs every day; acts in the first days of a month when last month had at least MIN public briefings (posts that are
// on Instagram — a draft's briefing is not public, briefs.mjs) and no roundup yet. Claude writes it from those
// briefings only (titles, ledes, section headings, takeaways, sources), checked like every briefing (claude.mjs →
// checkArticle: every number must appear in them, no advice or forecast words, …); each section names the briefings
// it draws on ([n] → links). Without Claude, or after two failed tries, the roundup is the list of the month's
// briefings (their own titles, ledes and takeaways, already public).
// Writes social/roundups/<YYYY-MM>.json; social/briefs.mjs renders it at /briefs/roundup-<YYYY-MM>.
//
// Usage: node social/roundup.mjs   (before social/briefs.mjs)
import fs from "node:fs";
import path from "node:path";
import { ask, pickRoute, ClaudeUnavailable, STYLE, plain, allowNumbers, checkArticle, ARTICLE } from "./claude.mjs";
import { THEMES, INDUSTRIES, SERIES, tagPrompt, pickTags, companyId, seriesOf } from "./tags.mjs";
import { ROOT, OUT, read, write, parse } from "./util.mjs";
import { compareSlots } from "./slot.mjs";

const MIN = 2;
const I = read(path.join(ROOT, "trends", "data", "insights.json"));
const today = I.built_at, DIR = path.join(ROOT, "social", "roundups");
const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1);
const month = d.toISOString().slice(0, 7), label = `${+month.slice(5)}월`;
const file = path.join(DIR, `${month}.json`);
if (fs.existsSync(file)) { console.log(`roundup ${month}: already written`); process.exit(0); }

const briefs = (fs.existsSync(OUT) ? fs.readdirSync(OUT) : []).sort(compareSlots)
  .map((slot) => ({ slot, st: read(path.join(OUT, slot, "story.json")), published: Boolean(read(path.join(OUT, slot, "post.json"))?.published) }))
  .filter((b) => b.published && b.st?.article?.sections?.length && b.st.date?.startsWith(month));
if (briefs.length < MIN) { console.log(`roundup ${month}: ${briefs.length} public briefing(s), needs ${MIN}`); process.exit(0); }

const textOf = (b) => { const a = b.st.article; return [a.title, a.lede, ...a.sections.map((x) => x.heading), ...(a.takeaways ?? [])].map(plain).join("\n"); };
const ctx = { allowed: allowNumbers(briefs.map(textOf), { dates: [month, today, ...briefs.map((b) => b.st.date)] }), refs: { max: briefs.length, each: true, what: "브리핑" } };

const SYSTEM = `너는 'AX 트렌드 레이더'의 에디터다. AX(기업의 AI 전환)와 IT 컨설팅 관점으로, 지난달 브리핑들을 한 편의 '월간 정리'로 엮는다. 독자는 AI 도입에 관심 있는 직장인·기업 실무자·IT 컨설턴트다.
규칙:
- 주어진 브리핑에 적힌 것만 쓴다. 숫자는 브리핑에 적힌 그대로(+·− 부호까지, 반올림·계산 금지). 새 사실을 더하지 않는다.
- 한 달을 관통하는 흐름 2~4개를 찾아 섹션으로 나누고, 섹션마다 근거가 된 브리핑 번호를 refs에 적는다.
${STYLE}
- 해석은 해석임이 드러나게. 앞으로를 단정하지 않고("~할 거예요", "~할 것으로 보여요" 금지), 무엇을 사라·하라고 하지 않는다. "추천", "전망", "예상" 같은 말을 쓰지 않는다.
- 쉬운 존댓말(~요). 조사·띄어쓰기를 바르게, 한 문단 2~4문장, 문단 사이는 빈 줄.
출력은 JSON 하나만, 다른 글 없이:
{"title":"제목","lede":"리드 2~3문장","sections":[{"heading":"소제목","body":"문단\\n\\n문단","refs":[브리핑 번호]}],"takeaways":["핵심 한 줄"],"themes":["주제"],"industries":["업종"]}
${tagPrompt()}`;

async function fromClaude(route) {
  const facts = briefs.map((b, i) => `[${i + 1}] ${b.st.date} · ${SERIES[b.st.series ?? seriesOf(b.st)]?.name ?? b.st.format_name}\n${textOf(b)}\n출처: ${[...new Set((b.st.sources ?? []).map((x) => x.source))].join(", ") || "데이터"}`).join("\n\n");
  const messages = [{ role: "user", content: `${label}(${month}) 브리핑 ${briefs.length}편:\n\n${facts}\n\n'${label} AX 정리'를 JSON으로.` }];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await ask(route, SYSTEM, messages);
    if (res.refusal) return null;
    let a = null, problems;
    try { a = parse(res.text); problems = checkArticle(a, ctx); } catch (e) { problems = [`JSON으로 읽을 수 없음: ${e.message}`]; }
    if (!problems.length) return a;
    console.log(`roundup attempt ${attempt} rejected: ${problems.join(" / ")}`);
    messages.push({ role: "assistant", content: res.text }, { role: "user", content: `다음 문제를 고쳐서 JSON 전체를 다시 써 줘:\n- ${problems.join("\n- ")}` });
  }
  return null;
}

let article = null;
const route = pickRoute();
if (route) { try { article = await fromClaude(route); } catch (e) { if (!(e instanceof ClaudeUnavailable)) throw e; console.log(`roundup: ${e.message}`); } }
// the list: the month's briefings in the shape every article has (at most ARTICLE.sections[1] of them, the newest;
// 2–6 summary lines). Its words are the briefings' own, already public — checked here only to say so in the log
const listed = briefs.slice(-ARTICLE.sections[1]), points = listed.flatMap((b) => b.st.article.takeaways ?? []);
const fallback = {
  title: `${label} AX 정리 — 리서치 ${briefs.length}편`, lede: `${label}에 올린 리서치를 한곳에 모았어요.`,
  sections: listed.map((b) => ({ heading: plain(b.st.article.title), body: plain(b.st.article.lede), refs: [briefs.indexOf(b) + 1] })),
  takeaways: (points.length >= ARTICLE.takeaways[0] ? points : listed.map((b) => b.st.article.title)).slice(0, 5).map(plain),
};
if (!article) { const notes = checkArticle(fallback, ctx); if (notes.length) console.log(`roundup (list) — quoted from the briefings as published: ${notes.join(" / ")}`); }
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
write(file, out);
console.log(`roundup ${month}: wrote social/roundups/${month}.json (${out.source}, ${briefs.length} briefings)`);
