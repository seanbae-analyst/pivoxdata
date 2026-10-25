// story.mjs — the post as a story: a format picked by code, a storyline written by Claude from the day's facts only.
//
// 1. plan.mjs said what the post is about (a big case, the week's small changes, the races, or a roundup).
// 2. This picks a format for it — breaking news, monthly report, industry deep dive, A vs B, tool guide, quiz,
//    timeline, explainer, checklist — avoiding the formats of the last two posts (an industry deep dive also avoids
//    the last industries covered).
// 3. Claude writes the slides (as many as the story needs) and the caption from trends/data/insights.json → facts.
// 4. Code checks every slide and the caption: each number must be one of the facts' numbers, no advice or forecast
//    words, no notes to us. One retry with the problems listed; if Claude is unavailable or fails twice, a plainer
//    story is assembled from the day's cards, so a post is never lost.
// Writes social/out/<date>/story.json for build.mjs (slides) and caption.mjs (caption).
//
// Usage: node social/story.mjs   (after social/plan.mjs)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { slidesFor } from "./pick.mjs";
import { ask, pickRoute, ClaudeUnavailable, BANNED, META, numbersIn } from "./claude.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f, empty) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : empty);
const I = read(path.join(ROOT, "trends", "data", "insights.json"));
const plan = read(path.join(ROOT, "social", "plan.json"), { mode: "roundup" });
if (plan.post === false) { console.log(`social/plan.json says no draft today (${plan.why}) — no story`); process.exit(0); }
const date = I.built_at, OUT = path.join(ROOT, "social", "out"), dir = path.join(OUT, date);
const plain = (t) => String(t ?? "").replace(/​/g, "").replace(/‑/g, "-").replace(/ /g, " ");

// ---------- formats ----------
export const FORMATS = {
  breaking: { name: "속보", how: "무슨 일이 일어났나(한 문장) → 핵심 숫자 → 전과 비교해 얼마나 달라졌나 → 왜 눈여겨볼 만한가 → 기업·실무 입장에서 어떤 의미인가 → 한 줄 정리" },
  monthly: { name: "월간 AX 리포트", how: "이번 달 한 줄 요약 → 전체 도입률과 1년 변화 → 업종별(높은 곳·낮은 곳) → 가장 빨리 바뀐 업종 → 회사 규모별 → 기업이 돈을 내는 AI → 개발 현장 숫자와의 연결 → 정리" },
  deepdive: { name: "업종 딥다이브", how: "지정된 한 업종에 집중: 표지 질문 → 지금 도입률 → 1년·처음 잰 때와 비교 → 다른 업종·전체 평균과의 거리 → 이 숫자가 그 업종 실무자에게 뜻하는 것 → 점검 질문 2~3개 → 정리" },
  timeline: { name: "타임라인", how: "처음 잰 때 → 1년 전 → 지금, 흐름이 꺾이거나 빨라진 지점 → 무엇이 달라졌나 → 정리" },
  versus: { name: "A vs B", how: "두 쪽을 소개 → 기업 결제 숫자 → 개발자 숫자 → 1년 전과 비교 → 같은 점과 다른 점 → 정리" },
  guide: { name: "도구 가이드", how: "기업이 AI를 만들 때 고르는 도구를 분야별로: 분야가 뭔지 쉽게 → 1위와 몫 → 크게 움직인 곳 → 분야 여러 개 → 고를 때 숫자로 볼 점 → 정리" },
  quiz: { name: "퀴즈", how: "질문 장(보기 3개, kind=quiz, 정답은 다음 장) → 정답 장(kind=answer, 숫자와 해설) → 이를 2~3번 → 정리" },
  explainer: { name: "개념 풀이", how: "AX가 뭔지 쉬운 말로 → DX와 다른 점 → 지금 어디까지 왔나(숫자) → 업종·규모별로 다른 속도 → 기업이 먼저 보는 것 → 정리" },
  checklist: { name: "체크리스트", how: "업종 평균 숫자로 우리 회사를 점검하는 질문 4~6개, 한 장에 하나씩, 질문마다 근거 숫자 → 정리" },
  weekly: { name: "이번 주 정리", how: "이번 주 한 줄 요약 → 작은 변화 하나씩(무엇이·얼마나·왜 볼 만한가) → 정리" },
};
const candidates = plan.mode === "event"
  ? (/^ax:month/.test(plan.event.key) ? ["monthly", "deepdive", "timeline"] : plan.event.kind === "1위 교체" ? ["breaking", "versus"] : ["breaking"])
  : plan.mode === "digest" ? ["weekly", "checklist"] : plan.mode === "race" ? ["guide", "versus", "quiz"] : ["explainer", "quiz", "timeline", "checklist"];
const history = (fs.existsSync(OUT) ? fs.readdirSync(OUT) : []).filter((f) => f < date && fs.existsSync(path.join(OUT, f, "design.json"))).sort()
  .map((f) => read(path.join(OUT, f, "design.json"), {}));
const recentFormats = history.slice(-2).map((h) => h.format);
const format = candidates.find((c) => !recentFormats.includes(c)) ?? candidates[0];
// a deep dive takes the industry that moved most among those not covered lately
const axFacts = I.facts.filter((f) => f.group === "ax" && /기업 중 AI 도구에 돈을 내는 비율/.test(f.text) && !/(대기업|중견기업|중소기업)/.test(f.text));
const moved = (f) => +((f.text.match(/1년 새 ([+−-][\d.]+)%p/) ?? [])[1] ?? "0").replace("−", "-");
const coveredInds = history.filter((h) => h.industry).slice(-4).map((h) => h.industry);
const industry = format === "deepdive" ? [...axFacts].sort((a, b) => moved(b) - moved(a)).map((f) => f.text.split(" 기업 중")[0]).find((n) => !coveredInds.includes(n)) ?? null : null;

// ---------- checks ----------
const facts = I.facts.map((f) => plain(f.text));
const cards = slidesFor(I, plan).map((x) => ({ ...x, title: plain(x.title), easy: plain(x.easy), body: plain(x.body), big: plain(x.big), bl: plain(x.bl) }));
const allowed = new Set([...facts, ...cards.flatMap((x) => [x.big, x.bl, x.title, x.easy, x.body]), date].flatMap(numbersIn));
for (let n = 1; n <= 10; n++) allowed.add(String(n)); // slide counts and list numbering ("3가지", "1.")
const textOf = (s) => [s.kicker, s.title, s.body, s.number, s.label, ...(s.items ?? [])].filter(Boolean).join("\n");
const KINDS = new Set(["cover", "text", "number", "list", "quiz", "answer", "end"]);
function check(story) {
  const p = [];
  if (!Array.isArray(story?.slides) || story.slides.length < 4 || story.slides.length > 12) p.push(`장 수는 4~12장 (지금 ${story?.slides?.length ?? 0})`);
  else {
    if (story.slides[0].kind !== "cover") p.push("첫 장은 kind=cover");
    story.slides.forEach((s, i) => {
      if (!KINDS.has(s.kind)) p.push(`${i + 1}장: kind는 ${[...KINDS].join("/")} 중 하나`);
      if (!s.title || plain(s.title).length > 70) p.push(`${i + 1}장: 제목은 1~70자`);
      if (plain(s.body).length > 300) p.push(`${i + 1}장: 본문은 300자 이하 (지금 ${plain(s.body).length}자)`);
      if ((s.items ?? []).length > 6 || (s.items ?? []).some((x) => plain(x).length > 90)) p.push(`${i + 1}장: 항목은 6개 이하, 각 90자 이하`);
    });
  }
  const all = [...(story?.slides ?? []).map(textOf), story?.caption ?? ""].map(plain).join("\n");
  const bad = [...new Set(numbersIn(all).filter((n) => !allowed.has(n)))];
  if (bad.length) p.push(`팩트에 없는 숫자: ${bad.join(", ")} — 팩트에 적힌 숫자를 그대로만 쓸 것(반올림·계산 금지)`);
  const words = [...new Set(all.match(BANNED) ?? [])];
  if (words.length) p.push(`쓰면 안 되는 말: ${words.join(", ")}`);
  if (META.test(all) || /^\s*(-{3,}|\*{3,})\s*$/m.test(story?.caption ?? "")) p.push("게시물이 아닌 메모가 섞임");
  if (!story?.caption || plain(story.caption).length > 1400) p.push("caption은 1~1400자");
  if (/#|https?:\/\//.test(story?.caption ?? "")) p.push("캡션에 해시태그·링크 쓰지 말 것(코드가 붙임)");
  return p;
}

// ---------- Claude ----------
const SYSTEM = `너는 'AX 트렌드 레이더'의 인스타그램 카드뉴스 에디터다. AX(기업의 AI 전환)와 IT 컨설팅 관점으로, 데이터에서 읽히는 흐름을 하나의 스토리로 엮는다.
독자는 AI 도입에 관심 있는 직장인·기업 실무자·IT 컨설턴트다.

규칙:
- 게시물 하나에 이야기 하나. 표지에서 질문이나 반전으로 시작해, 장마다 한 걸음씩 나아가고, 마지막 장에서 정리한다. 장 수는 이야기에 맞게 정한다(4~12장).
- 시각화보다 글로 설명한다. 장마다 제목(한 문장)과 본문(2~4문장, 300자 이하)을 충분히 쓴다.
- 숫자는 주어진 팩트에 적힌 그대로만 쓴다. 반올림·환산·새 계산(차이, 배수 등) 금지. 팩트에 없는 숫자는 쓰지 않는다.
- 팩트에 없는 사실(회사 소개, 사례, 이유, 업종별 AI 활용 예)을 사실처럼 쓰지 않는다. 해석은 "~로 볼 수 있어요", "~를 뜻해요"처럼 해석임이 드러나게 쓴다.
- 앞으로 어떻게 될지 단정하지 않는다. 무엇을 사거나 팔라고 하지 않는다. "추천", "전망", "예상", "급등" 같은 말을 쓰지 않는다.
- 쉬운 존댓말(~요). 전문 용어(SDK, %p, Ramp AI Index 등)는 처음 나올 때 짧게 풀어 준다.
- Ramp AI Index는 미국 기업, 유료 결제 기준이라는 점을, 다운로드는 사용자 수가 아니라 설치 횟수라는 점을 필요한 곳에서 한 번씩 밝힌다.
- 캡션은 게시물 내용을 5~10줄로 요약한 본문만. 해시태그·링크·출처 줄은 쓰지 않는다(코드가 붙인다).

출력은 JSON 하나만, 다른 글 없이:
{"slides":[{"kind":"cover|text|number|list|quiz|answer|end","kicker":"짧은 머리말(선택)","title":"제목","body":"본문(선택)","number":"강조할 숫자(number·answer 장, 팩트 숫자 그대로)","label":"숫자 설명(선택)","items":["목록 항목(list·quiz·end 장, 선택)"]}],"caption":"캡션 본문"}`;

function brief() {
  const what = plan.mode === "event" ? `오늘의 빅 케이스(${plan.event.kind}): ${plain(plan.event.headline)}`
    : plan.mode === "digest" ? `지난 한 주의 작은 변화 ${plan.items.length}가지: ${plan.items.map((c) => plain(c.headline)).join(" / ")}`
    : plan.mode === "race" ? "분야별로 기업·개발자가 실제로 고르는 AI 도구(누가 앞서나)" : "요즘 AX 흐름 정리 (특별한 사건 없는 날)";
  return [
    `날짜: ${date}`,
    `이번 게시물: ${what}`,
    `형식: ${FORMATS[format].name} — ${FORMATS[format].how}`,
    ...(industry ? [`딥다이브 업종: ${industry}`] : []),
    "",
    "팩트 (이 숫자들만 쓸 수 있음):",
    ...facts.map((f) => `- ${f}`),
    ...(cards.length ? ["", "오늘 카드에 쓰인 문장:", ...cards.map((x) => `- ${x.title} (${x.big}, ${x.bl}). ${x.easy}`)] : []),
  ].join("\n");
}
const parse = (t) => { const m = String(t).match(/\{[\s\S]*\}/); if (!m) throw new SyntaxError("no JSON"); return JSON.parse(m[0]); };

async function fromClaude(route) {
  const messages = [{ role: "user", content: `${brief()}\n\n이 형식으로 스토리를 써 줘. JSON만.` }];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await ask(route, SYSTEM, messages);
    if (res.refusal) return { story: null, why: `refusal (${res.refusal})` };
    let story = null, problems;
    try { story = parse(res.text); problems = check(story); } catch (e) { problems = [`JSON으로 읽을 수 없음: ${e.message}`]; }
    if (!problems.length) return { story, model: res.model, attempts: attempt };
    console.log(`story attempt ${attempt} rejected: ${problems.join(" / ")}`);
    messages.push({ role: "assistant", content: res.text }, { role: "user", content: `다음 문제를 고쳐서 JSON 전체를 다시 써 줘:\n- ${problems.join("\n- ")}` });
  }
  return { story: null, why: "checks failed twice" };
}

// ---------- fallback: a plain story from the day's cards ----------
function fromCards() {
  const [lead, ...rest] = cards;
  const slides = [
    { kind: "cover", kicker: FORMATS[format].name, title: lead.title, body: lead.easy || lead.body },
    ...cards.map((x) => ({ kind: "number", kicker: x.k ? plain(x.k) : "", number: x.big, label: x.bl, title: x.title, body: [x.easy, x.body].filter(Boolean).join(" ").slice(0, 300) })),
    { kind: "end", title: "정리", items: cards.map((x) => `${x.title} (${x.big})`).slice(0, 6) },
  ];
  const caption = [lead.title, lead.easy || lead.body, "", ...rest.map((x) => `· ${x.title} (${x.big})`)].join("\n");
  return { slides, caption };
}

let result = { story: null, why: "no CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY" };
const route = pickRoute();
if (route) {
  try { result = await fromClaude(route); } catch (e) {
    if (e instanceof ClaudeUnavailable) result = { story: null, why: e.message };
    else throw e;
  }
}
const story = result.story ?? fromCards();
const source = result.story ? "claude" : "cards";
const left = check(story);
if (left.length && source === "claude") throw new Error(`story failed its own checks: ${left.join(" / ")}`);
if (!result.story) console.log(`story from the cards — ${result.why}`);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "story.json"), JSON.stringify({ date, mode: plan.mode, format, format_name: FORMATS[format].name, industry, source, via: result.story ? route : null, model: result.model ?? null, note: result.why ?? null, ...story }, null, 1) + "\n");
console.log(`wrote social/out/${date}/story.json (${FORMATS[format].name}, ${story.slides.length} slides, ${source}${result.story ? ` via ${route}` : ""})`);
