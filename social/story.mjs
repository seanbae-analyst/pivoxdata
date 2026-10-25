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
import { ask, pickRoute, ClaudeUnavailable, BANNED, META, numbersIn, CLICHE, hedges, STYLE } from "./claude.mjs";
import { THEMES, INDUSTRIES, tagPrompt, pickTags, companyId, seriesOf } from "./tags.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f, empty) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : empty);
const I = read(path.join(ROOT, "trends", "data", "insights.json"));
const plan = read(path.join(ROOT, "social", "plan.json"), { mode: "roundup" });
if (plan.post === false) { console.log(`social/plan.json says no draft today (${plan.why}) — no story`); process.exit(0); }
const date = I.built_at, slot = plan.slot ?? date, OUT = path.join(ROOT, "social", "out"), dir = path.join(OUT, slot);
const plain = (t) => String(t ?? "").replace(/​/g, "").replace(/‑/g, "-").replace(/ /g, " ");

// ---------- formats ----------
export const FORMATS = {
  breaking: { name: "속보", how: "무슨 일이 일어났나(한 문장) → 핵심 숫자 → 전과 비교해 얼마나 달라졌나 → 왜 눈여겨볼 만한가 → 기업·실무 입장에서 어떤 의미인가 → 한 줄 정리" },
  monthly: { name: "월간 AX 리포트", how: "이번 달 한 줄 요약 → 전체 도입률과 1년 변화 → 업종별(높은 곳·낮은 곳) → 가장 빨리 바뀐 업종 → 회사 규모별 → 기업이 돈을 내는 AI → IT 영역별 공식 발표 → IT 컨설팅 관점에서 확인할 점(2~4개) → 정리" },
  deepdive: { name: "업종 딥다이브", how: "지정된 한 업종에 집중: 표지 질문 → 지금 도입률 → 1년·처음 잰 때와 비교 → 다른 업종·전체 평균과의 거리 → 이 숫자가 그 업종 실무자에게 뜻하는 것 → 점검 질문 2~3개 → 정리" },
  timeline: { name: "타임라인", how: "처음 잰 때 → 1년 전 → 지금, 흐름이 꺾이거나 빨라진 지점 → 무엇이 달라졌나 → 정리" },
  versus: { name: "A vs B", how: "두 쪽을 소개 → 기업 결제 숫자 → 개발자 숫자 → 1년 전과 비교 → 같은 점과 다른 점 → 정리" },
  guide: { name: "도구 가이드", how: "기업이 AI를 만들 때 고르는 도구를 분야별로: 분야가 뭔지 쉽게 → 1위와 몫 → 크게 움직인 곳 → 분야 여러 개 → 고를 때 숫자로 볼 점 → 정리" },
  quiz: { name: "퀴즈", how: "질문 장(보기 3개, kind=quiz, 정답은 다음 장) → 정답 장(kind=answer, 숫자와 해설) → 이를 2~3번 → 정리" },
  explainer: { name: "개념 풀이", how: "AX가 뭔지 쉬운 말로 → DX와 다른 점 → 지금 어디까지 왔나(숫자) → 업종·규모별로 다른 속도 → 기업이 먼저 보는 것 → 정리" },
  checklist: { name: "체크리스트", how: "업종 평균 숫자로 우리 회사를 점검하는 질문 4~6개, 한 장에 하나씩, 질문마다 근거 숫자 → 정리" },
  weekly: { name: "이번 주 정리", how: "이번 주 한 줄 요약 → 작은 변화 하나씩(무엇이·얼마나·왜 볼 만한가) → 정리" },
  newsweek: { name: "이번 주 AX 사건", how: "표지: 이번 주 AX를 한 문장으로 → 발표 3~5건을 중요한 순서로 한 장에 하나씩(누가·무엇을 발표했나 → 어느 IT 영역의 일이고 기업 IT 프로젝트에 무슨 뜻인가) → 여러 발표에 공통으로 보이는 흐름 → IT 컨설팅 관점에서 확인할 점 → 정리" },
  newstheme: { name: "AX 사건 묶어 보기", how: "표지 → 발표들을 IT 영역(ERP·백오피스, CRM·고객, 클라우드·인프라, 데이터·분석, 업무 도구, 보안·규제, AI 에이전트) 2~3개로 묶어 영역마다 한두 장, 영역 안의 발표 내용 → 그 영역 실무자·IT 컨설턴트가 확인할 점 → 정리" },
};
const candidates = plan.mode === "event"
  ? (/^ax:month/.test(plan.event.key) ? ["monthly", "deepdive", "timeline"] : plan.event.kind === "1위 교체" ? ["breaking", "versus"] : ["breaking"])
  : plan.mode === "news" ? ["newstheme", "newsweek"] // grouped by IT domain first
  : plan.mode === "digest" ? ["weekly", "checklist"] : plan.mode === "race" ? ["guide", "versus", "quiz"] : ["explainer", "quiz", "timeline", "checklist"];
const history = (fs.existsSync(OUT) ? fs.readdirSync(OUT) : []).filter((f) => f < slot && fs.existsSync(path.join(OUT, f, "design.json"))).sort()
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
// a news post: the official announcements plan.mjs picked, numbered [1]…[n] for Claude; each news slide names the ones
// it tells (refs) and code — not Claude — prints their source and date on it
const NEWS = plan.mode === "news" ? plan.news ?? [] : [];
const newsText = NEWS.map((n) => `${n.title} ${n.summary}`);
for (const n of [...newsText, ...NEWS.map((x) => x.date)].flatMap(numbersIn)) allowed.add(n);
const squash = (t) => plain(t).replace(/[\s"'“”‘’.,·:;!?()「」『』｢｣\[\]-]/g, "");
const SRC = newsText.map(squash).join("|");
const KIND_LABEL = { company: "공식 발표", government: "보도자료", research: "리서치" };
const srcLine = (refs) => { // one or two: each with its date; more (a summing-up slide): the names and the count
  const ns = refs.map((r) => NEWS[r - 1]);
  return ns.length > 2 ? `${[...new Set(ns.map((n) => n.source))].join(" · ")} 발표 ${ns.length}건`
    : ns.map((n) => `${n.source} ${KIND_LABEL[n.kind] ?? "발표"} · ${+n.date.slice(5, 7)}/${+n.date.slice(8)}`).join(" / ");
};
const textOf = (s) => [s.kicker, s.title, s.body, s.number, s.label, ...(s.items ?? [])].filter(Boolean).join("\n");
const KINDS = new Set(["cover", "text", "number", "list", "quiz", "answer", "end"]);
function check(story) {
  const p = [];
  if (!Array.isArray(story?.slides) || story.slides.length < 4 || story.slides.length > 10) p.push(`장 수는 4~10장 (지금 ${story?.slides?.length ?? 0})`);
  else {
    if (story.slides[0].kind !== "cover") p.push("첫 장은 kind=cover");
    story.slides.forEach((s, i) => {
      if (!KINDS.has(s.kind)) p.push(`${i + 1}장: kind는 ${[...KINDS].join("/")} 중 하나`);
      if (!s.title || plain(s.title).length > 70) p.push(`${i + 1}장: 제목은 1~70자`);
      // the cards stay short; the long explanation is the web briefing (article, below)
      if (plain(s.body).length > 140) p.push(`${i + 1}장: 본문은 140자 이하로 짧게 (지금 ${plain(s.body).length}자) — 자세한 설명은 웹 브리핑에`);
      if ((s.items ?? []).length > 6 || (s.items ?? []).some((x) => plain(x).length > 70)) p.push(`${i + 1}장: 항목은 6개 이하, 각 70자 이하`);
    });
  }
  const all = [...(story?.slides ?? []).map(textOf), story?.caption ?? ""].map(plain).join("\n");
  const bad = [...new Set(numbersIn(all).filter((n) => !allowed.has(n)))];
  if (bad.length) p.push(`팩트에 없는 숫자: ${bad.join(", ")} — 팩트에 적힌 숫자를 그대로만 쓸 것(반올림·계산 금지)`);
  const words = [...new Set(all.match(BANNED) ?? [])];
  if (words.length) p.push(`쓰면 안 되는 말: ${words.join(", ")}`);
  const stock = [...new Set(all.match(CLICHE) ?? [])];
  if (stock.length) p.push(`상투어: ${stock.join(", ")} — 구체적인 말로 바꿀 것`);
  if (hedges(all) > 3) p.push(`"~볼 수 있어요"가 ${hedges(all)}번 — 세 번 이하로, 같은 맺음말 반복 금지`);
  if (META.test(all) || /^\s*(-{3,}|\*{3,})\s*$/m.test(story?.caption ?? "")) p.push("게시물이 아닌 메모가 섞임");
  if (!story?.caption || plain(story.caption).length > 1400) p.push("caption은 1~1400자");
  if (/#|https?:\/\//.test(story?.caption ?? "")) p.push("캡션에 해시태그·링크 쓰지 말 것(코드가 붙임)");
  if (NEWS.length) (story?.slides ?? []).forEach((sl, i) => {
    const refs = sl.refs ?? [];
    if (!Array.isArray(refs) || refs.some((r) => !Number.isInteger(r) || r < 1 || r > NEWS.length)) p.push(`${i + 1}장: refs는 발표 번호(1~${NEWS.length}) 목록`);
    else if (!["cover", "end"].includes(sl.kind) && !refs.length) p.push(`${i + 1}장: 어떤 발표를 말하는지 refs에 번호를 적을 것`);
    // our words, not theirs: no 24 characters in a row copied from an announcement
    const t = squash(textOf(sl));
    for (let k = 0; k + 24 <= t.length; k += 4) if (SRC.includes(t.slice(k, k + 24))) { p.push(`${i + 1}장: 발표문 문장을 그대로 옮김 — 우리 말로 바꿔 쓸 것`); break; }
  });
  // typography a reader notices at once: double spaces, a space before punctuation, unmatched brackets, a title
  // broken into more than two lines
  (story?.slides ?? []).forEach((sl, i) => {
    const t = textOf(sl);
    if (/[^\S\n]{2,}/.test(t)) p.push(`${i + 1}장: 띄어쓰기가 두 칸인 곳이 있음`);
    if (/[^\S\n][.,!?)]/.test(t)) p.push(`${i + 1}장: 문장부호·닫는 괄호 앞에 빈칸`);
    if ((t.match(/\(/g) ?? []).length !== (t.match(/\)/g) ?? []).length) p.push(`${i + 1}장: 괄호 짝이 맞지 않음`);
    if (String(sl.title ?? "").split("\n").length > 2) p.push(`${i + 1}장: 제목 줄바꿈은 한 번까지`);
  });
  return p;
}

// ---------- Claude ----------
const SYSTEM = `너는 IT 컨설팅 리서치 팀의 AX(기업의 AI 전환) 에디터다. 'AX 트렌드 레이더'의 인스타그램 카드뉴스를 쓴다.
독자는 IT 컨설턴트, 기업의 IT·DX 담당자, AI 도입을 검토하는 실무자다. 데이터와 공식 발표에서 읽히는 흐름을 하나의 스토리로 엮고,
그것이 기업의 IT 프로젝트에서 무엇을 뜻하는지까지 연결한다.

규칙:
${STYLE}
- IT 컨설팅 관점으로 연결한다: 그 일이 어느 IT 영역(ERP·백오피스, CRM·고객, 클라우드·인프라, 데이터·분석, 업무 도구, 보안·규제, AI 에이전트)의 이야기인지, 도입 프로젝트에서 무엇을 확인해야 하는지(데이터 준비, 기존 시스템 연동, 보안·거버넌스, 비용, 조직의 변화 관리). 확인할 점은 질문이나 점검 항목으로 쓰고, 팩트에 없는 사례·수치·효과는 지어내지 않는다.
- 게시물 하나에 이야기 하나. 표지에서 질문이나 반전으로 시작해, 장마다 한 걸음씩 나아가고, 마지막 장에서 정리한다. 장 수는 이야기에 맞게 정한다(4~10장).
- 카드는 짧고 간단하게: 장마다 제목(한 문장)과 본문 1~2문장(140자 이하). 핵심만 남기고, 배경·자세한 해설은 따로 쓰는 웹 브리핑에 맡긴다.
- 숫자는 주어진 팩트에 적힌 그대로만 쓴다. 반올림·환산·새 계산(차이, 배수 등) 금지. 팩트에 없는 숫자는 쓰지 않는다.
- 팩트에 없는 사실(회사 소개, 사례, 이유, 업종별 AI 활용 예)을 사실처럼 쓰지 않는다. 해석은 "~라는 뜻이에요", "~로 읽혀요"처럼 해석임이 드러나게 쓴다.
- 앞으로 어떻게 될지 단정하지 않는다. 무엇을 사거나 팔라고 하지 않는다. "추천", "전망", "예상", "급등" 같은 말을 쓰지 않는다.
- 쉬운 존댓말(~요). 전문 용어(SDK, %p, Ramp AI Index 등)는 처음 나올 때 짧게 풀어 준다.
- Ramp AI Index는 미국 기업, 유료 결제 기준이라는 점을, 다운로드는 사용자 수가 아니라 설치 횟수라는 점을 필요한 곳에서 한 번씩 밝힌다.
- 문법: 조사는 앞말의 받침에 맞춘다. 숫자·영어 뒤에서도 읽는 소리 기준이다(Anthropic은, OpenAI는, 12.1%p는, 3위로, SDK를). 띄어쓰기는 표준어 규정대로, 문장 끝은 ~요/~예요/~이에요로 맞춘다(받침 없으면 ~예요, 있으면 ~이에요).
- 줄바꿈: 본문은 한 문장이나 한 뜻 덩어리마다 줄을 바꾼다("\n"). 한 줄은 한 호흡(대략 40자 안쪽)으로. 단어·숫자 중간이나 조사 앞에서 끊지 않는다. 제목이 20자를 넘으면 뜻이 나뉘는 곳에서 한 번만 "\n"으로 끊는다.
- 캡션은 게시물 내용을 4~8줄로 짧게 요약한 본문만. 해시태그·링크·출처 줄은 쓰지 않는다(코드가 붙인다).

출력은 JSON 하나만, 다른 글 없이:
{"slides":[{"kind":"cover|text|number|list|quiz|answer|end","refs":[발표 번호(AX 사건 게시물만)],"kicker":"짧은 머리말(선택)","title":"제목","body":"본문(선택)","number":"강조할 숫자(number·answer 장, 팩트 숫자 그대로)","label":"숫자 설명(선택)","items":["목록 항목(list·quiz·end 장, 선택)"]}],"caption":"캡션 본문"}`;

const NEWS_RULES = `
이번 게시물은 공식 발표(회사 뉴스룸·정부 보도자료·리서치)를 모은 'AX 사건'이다. 추가 규칙:
- 발표에 적힌 것만 쓴다. 발표의 제목·요약에 없는 사실(배경, 금액, 고객 수, 다른 회사 이야기)을 더하지 않는다.
- 누가 말했는지 밝힌다: "OO는 ~했다고 발표했어요", "과학기술정보통신부는 ~라고 밝혔어요". 회사의 자평(최고, 혁신적, 업계 최초 등)은 그 회사의 말로만 옮긴다.
- 기업 AX 관점의 의미는 필요한 곳에만 짧게, 해석임이 드러나게 쓴다. 발표한 회사를 평가하거나 응원하지 않는다.
- 발표문 문장을 그대로 옮기지 않고 우리 말로 짧게 바꿔 쓴다. 영어 제목도 번역해 풀어 쓴다. 회사·제품 이름은 원래 표기 그대로.
- 금액·수치는 발표에 적힌 숫자 그대로 쓴다(예: $1 billion은 "$1 billion"으로, 원화·다른 단위로 바꾸지 않는다).
- 발표 3~5건을 고른다. 기업의 AI 도입·전환, 기업 간 협력·인수, 정부 정책·규제를 소비자 제품 소식보다 앞에 둔다.
- 사건을 말하는 장마다 "refs"에 그 발표 번호를 적는다(예: [2]). 표지와 마지막 장은 비워도 된다. 출처 줄은 코드가 붙인다.
- 캡션은 이번 주 사건을 회사·기관 이름과 함께 4~8줄로.`;

function brief() {
  const what = plan.mode === "event" ? `오늘의 빅 케이스(${plan.event.kind}): ${plain(plan.event.headline)}`
    : plan.mode === "digest" ? `지난 한 주의 작은 변화 ${plan.items.length}가지: ${plan.items.map((c) => plain(c.headline)).join(" / ")}`
    : plan.mode === "race" ? "분야별로 기업·개발자가 실제로 고르는 AI 도구(누가 앞서나)"
    : plan.mode === "news" ? `이번 주 AX 사건 — 회사·정부의 공식 발표 ${NEWS.length}건 중에서` : "요즘 AX 흐름 정리 (특별한 사건 없는 날)";
  return [
    `날짜: ${date}`,
    `이번 게시물: ${what}`,
    `형식: ${FORMATS[format].name} — ${FORMATS[format].how}`,
    ...(industry ? [`딥다이브 업종: ${industry}`] : []),
    "",
    ...(NEWS.length ? ["공식 발표 (이것만 사실로 쓸 수 있음, 번호는 refs에):", ...NEWS.map((n, i) => `[${i + 1}] ${n.source}(${KIND_LABEL[n.kind] ?? "발표"}, ${n.date}${n.domains?.length ? `, IT 영역: ${n.domains.join("·")}` : ""}) — ${n.title}\n    요약: ${n.summary || "(요약 없음 — 제목만 쓸 것)"}`), ""] : []),
    "팩트 (이 숫자들만 쓸 수 있음):",
    ...facts.map((f) => `- ${f}`),
    ...(cards.length ? ["", "오늘 카드에 쓰인 문장:", ...cards.map((x) => `- ${x.title} (${x.big}, ${x.bl}). ${x.easy}`)] : []),
  ].join("\n");
}
const parse = (t) => { const m = String(t).match(/\{[\s\S]*\}/); if (!m) throw new SyntaxError("no JSON"); return JSON.parse(m[0]); };

async function fromClaude(route) {
  const messages = [{ role: "user", content: `${brief()}\n\n이 형식으로 스토리를 써 줘. JSON만.` }];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await ask(route, NEWS.length ? SYSTEM + NEWS_RULES : SYSTEM, messages);
    if (res.refusal) return { story: null, why: `refusal (${res.refusal})` };
    let story = null, problems;
    try { story = parse(res.text); problems = check(story); } catch (e) { problems = [`JSON으로 읽을 수 없음: ${e.message}`]; }
    if (!problems.length) return { story, model: res.model, attempts: attempt };
    console.log(`story attempt ${attempt} rejected: ${problems.join(" / ")}`);
    messages.push({ role: "assistant", content: res.text }, { role: "user", content: `다음 문제를 고쳐서 JSON 전체를 다시 써 줘:\n- ${problems.join("\n- ")}` });
  }
  return { story: null, why: "checks failed twice" };
}

// ---------- proofreading: a second read that may fix only grammar, spacing and line breaks ----------
const PROOF = `너는 한국어 교정자다. 인스타그램 카드뉴스 JSON을 받아 같은 구조의 JSON으로 돌려준다.
고치는 것: 맞춤법, 띄어쓰기, 조사(앞말 받침에 맞게 — 숫자·영어는 읽는 소리 기준), 어색한 문장, 문장 끝(~요 존댓말 통일), 줄바꿈("\\n": 본문은 한 문장·한 뜻 덩어리마다, 제목은 20자를 넘을 때 뜻이 나뉘는 곳에서 한 번만, 단어·숫자 중간이나 조사 앞에서 끊지 않기).
고치지 않는 것: 숫자(한 글자도), 사실, 장 수와 순서, kind, refs, 내용의 뜻. 새 내용을 더하지 않는다.
출력은 JSON 하나만, 다른 글 없이.`;
// the figures (not the 1–10 used for counts and wording like "1위") must stay exactly as they were, each as often
const numbersOf = (st) => numbersIn([...st.slides.map(textOf), st.caption].map(plain).join("\n")).filter((n) => !/^([1-9]|10)$/.test(n)).sort().join(" ");
async function proofread(route, story) {
  const res = await ask(route, PROOF, [{ role: "user", content: JSON.stringify({ slides: story.slides, caption: story.caption }) }]);
  if (res.refusal) return null;
  let out;
  try { out = parse(res.text); } catch { return null; }
  // the proofreader must leave every number and the slide order exactly as they were
  if (out?.slides?.length !== story.slides.length || out.slides.some((x, i) => x.kind !== story.slides[i].kind || JSON.stringify(x.refs ?? []) !== JSON.stringify(story.slides[i].refs ?? [])) || numbersOf(out) !== numbersOf(story) || check(out).length) {
    console.log(`proofread discarded: ${check(out ?? {}).join(" / ") || "numbers or slide order changed"}`);
    return null;
  }
  return out;
}

// ---------- fallback: a plain story from the day's cards ----------
function fromCards() {
  const [lead, ...rest] = cards;
  const slides = [
    { kind: "cover", kicker: FORMATS[format].name, title: lead.title, body: lead.easy || lead.body },
    ...cards.map((x) => ({ kind: "number", kicker: x.k ? plain(x.k) : "", number: x.big, label: x.bl, title: x.title, body: (x.easy || x.body || "").slice(0, 140) })),
    { kind: "end", title: "정리", items: cards.map((x) => `${x.title} (${x.big})`).slice(0, 6) },
  ];
  const caption = [lead.title, lead.easy || lead.body, "", ...rest.map((x) => `· ${x.title} (${x.big})`)].join("\n");
  return { slides, caption };
}

// ---------- fallback for a news post: the announcements as published, one per slide ----------
function fromNews() {
  const top = NEWS.slice(0, 5);
  const slides = [
    { kind: "cover", kicker: FORMATS[format].name, title: `이번 주 AX 사건 ${top.length}가지`, body: "회사와 정부가 직접 낸 발표만 모았어요." },
    ...top.map((n, i) => ({ kind: "text", refs: [i + 1], kicker: n.source, title: n.title.slice(0, 70), body: n.summary.slice(0, 140) })),
    { kind: "end", title: "정리", items: top.map((n) => `${n.source}: ${n.title}`.slice(0, 70)) },
  ];
  return { slides, caption: [`이번 주 AX 사건 ${top.length}가지 — 공식 발표만`, "", ...top.map((n) => `· ${n.source}: ${n.title}`)].join("\n") };
}

let result = { story: null, why: "no CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY" };
const route = pickRoute();
if (route) {
  try {
    result = await fromClaude(route);
    if (result.story) {
      const fixed = await proofread(route, result.story);
      if (fixed) result = { ...result, story: fixed, proofread: true };
    }
  } catch (e) {
    if (e instanceof ClaudeUnavailable) result = { story: null, why: e.message };
    else throw e;
  }
}
const story = result.story ?? (NEWS.length ? fromNews() : fromCards());
// the source line on each news slide is printed from the announcement itself, never written by the model
const used = [...new Set(story.slides.flatMap((sl) => sl.refs ?? []))].sort((a, b) => a - b);
for (const sl of story.slides) if (sl.refs?.length) sl.src = `출처 · ${srcLine(sl.refs)}`;
if (NEWS.length) {
  story.sources = used.map((r) => ({ source: NEWS[r - 1].source, kind: NEWS[r - 1].kind, date: NEWS[r - 1].date, title: NEWS[r - 1].title, link: NEWS[r - 1].link, id: NEWS[r - 1].id }));
  // only the announcements the post told count as used; the others stay available for next week
  const LOG = path.join(ROOT, "social", "posted.json"), log = read(LOG, []), e = log.findLast((x) => (x.slot ?? x.date) === slot && x.mode === "news");
  if (e) { e.news = story.sources.map((x) => x.id); fs.writeFileSync(LOG, JSON.stringify(log, null, 1) + "\n"); }
}
const source = result.story ? "claude" : "cards";
const left = check(story);
if (left.length && source === "claude") throw new Error(`story failed its own checks: ${left.join(" / ")}`);
if (!result.story) console.log(`story from the cards — ${result.why}`);
// ---------- the web version: the same story explained at more length, for the site's "AX 브리핑" (social/briefs.mjs) ----------
const ARTICLE_RULES = `
이번에는 같은 이야기를 웹사이트 'AX 브리핑' 글로 더 풀어서 쓴다. 카드보다 자세하게 — 배경, 숫자가 뜻하는 것, 기업·실무자가 읽을 점까지.
- 구성: 제목, 리드(2~3문장), 섹션 3~8개(소제목 + 본문 2~4문단, 문단 사이는 빈 줄), 정리(핵심 3~5줄).
- 마지막 섹션은 소제목 "IT 컨설팅 관점"으로: 이 흐름이 ERP·CRM·클라우드·데이터·보안 같은 IT 영역의 도입 프로젝트에서 뜻하는 것과, 실무자·컨설턴트가 확인할 점(데이터 준비, 기존 시스템 연동, 거버넌스·보안, 비용, 변화 관리 중 해당하는 것)을 팩트와 발표에 근거해 쓴다.
- 사실·숫자·말투 규칙은 카드와 같다. 해석은 해석임이 드러나게. 한 문단은 2~4문장, 줄바꿈은 문단 사이에만.
- 카드 스토리의 흐름을 따르되 같은 문장을 반복하지 말고 더 설명한다.
출력은 JSON 하나만, 다른 글 없이:
{"title":"제목","lede":"리드","sections":[{"heading":"소제목","body":"문단\\n\\n문단","refs":[발표 번호(AX 사건만)]}],"takeaways":["핵심 한 줄"],"themes":["주제"],"industries":["업종"]}
${tagPrompt()}`;
function checkArticle(a) {
  const p = [];
  if (!a?.title || plain(a.title).length > 80) p.push("제목은 1~80자");
  if (!a?.lede || plain(a.lede).length > 400) p.push("리드는 1~400자");
  if (!Array.isArray(a?.sections) || a.sections.length < 3 || a.sections.length > 8) p.push(`섹션은 3~8개 (지금 ${a?.sections?.length ?? 0})`);
  (a?.sections ?? []).forEach((x, i) => {
    if (!x.heading || plain(x.heading).length > 60) p.push(`섹션 ${i + 1}: 소제목은 1~60자`);
    if (!x.body || plain(x.body).length > 1400) p.push(`섹션 ${i + 1}: 본문은 1~1400자`);
    const refs = x.refs ?? [];
    if (!Array.isArray(refs) || refs.some((r) => !Number.isInteger(r) || r < 1 || r > NEWS.length)) p.push(`섹션 ${i + 1}: refs는 발표 번호 목록`);
    if (NEWS.length) { const t = squash(`${x.heading} ${x.body}`); for (let k = 0; k + 24 <= t.length; k += 4) if (SRC.includes(t.slice(k, k + 24))) { p.push(`섹션 ${i + 1}: 발표문 문장을 그대로 옮김`); break; } }
  });
  if (NEWS.length && !(a?.sections ?? []).some((x) => x.refs?.length)) p.push("어떤 발표를 다루는지 섹션 refs에 번호를 적을 것");
  if (!Array.isArray(a?.takeaways) || a.takeaways.length < 2 || a.takeaways.length > 6) p.push("정리는 2~6줄");
  const all = plain([a?.title, a?.lede, ...(a?.sections ?? []).flatMap((x) => [x.heading, x.body]), ...(a?.takeaways ?? [])].join("\n"));
  const bad = [...new Set(numbersIn(all).filter((n) => !allowed.has(n)))];
  if (bad.length) p.push(`팩트에 없는 숫자: ${bad.join(", ")}`);
  const words = [...new Set(all.match(BANNED) ?? [])];
  if (words.length) p.push(`쓰면 안 되는 말: ${words.join(", ")}`);
  if (META.test(all)) p.push("글이 아닌 메모가 섞임");
  const stock = [...new Set(all.match(CLICHE) ?? [])];
  if (stock.length) p.push(`상투어: ${stock.join(", ")} — 구체적인 말로 바꿀 것`);
  if (hedges(all) > 3) p.push(`"~볼 수 있어요"가 ${hedges(all)}번 — 세 번 이하로`);
  if (/[^\S\n]{2,}/.test(all) || /[^\S\n][.,!?)]/.test(all)) p.push("두 칸 띄어쓰기나 문장부호 앞 빈칸");
  return p;
}
async function articleFromClaude(route, st) {
  const messages = [{ role: "user", content: `${brief()}\n\n카드 스토리(이 흐름을 따라 더 풀어 쓸 것):\n${JSON.stringify(st.slides.map(({ src, ...x }) => x))}\n\n웹 브리핑 JSON만.` }];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await ask(route, (NEWS.length ? SYSTEM + NEWS_RULES : SYSTEM) + ARTICLE_RULES, messages);
    if (res.refusal) return null;
    let a = null, problems;
    try { a = parse(res.text); problems = checkArticle(a); } catch (e) { problems = [`JSON으로 읽을 수 없음: ${e.message}`]; }
    if (!problems.length) return a;
    console.log(`article attempt ${attempt} rejected: ${problems.join(" / ")}`);
    messages.push({ role: "assistant", content: res.text }, { role: "user", content: `다음 문제를 고쳐서 JSON 전체를 다시 써 줘:\n- ${problems.join("\n- ")}` });
  }
  return null;
}
// no Claude, or it failed: the story's own slides, one section each
const articleFromSlides = (st) => {
  const [cover, ...rest] = st.slides, end = rest.at(-1)?.kind === "end" ? rest.pop() : null;
  return { title: plain(cover.title).replace(/\n/g, " "), lede: plain(cover.body ?? "").replace(/\n/g, " "),
    sections: rest.map((x) => ({ heading: plain(x.title).replace(/\n/g, " "), body: [x.number ? `${x.number} — ${x.label ?? ""}` : "", plain(x.body ?? "").replace(/\n/g, " "), ...(x.items ?? []).map((i) => `· ${i}`)].filter(Boolean).join("\n\n"), refs: x.refs ?? [] })),
    takeaways: end?.items ?? [] };
};
let article = null;
if (route && result.story) {
  try { article = await articleFromClaude(route, story); } catch (e) { if (!(e instanceof ClaudeUnavailable)) throw e; console.log(`article: ${e.message}`); }
}
story.article = { ...(article ?? articleFromSlides(story)), source: article ? "claude" : "slides" };
// how the archive files it (social/tags.mjs): a series, themes and industries from the fixed lists, and the companies
// whose announcements the post used
story.article.tags = {
  themes: pickTags(story.article.themes, THEMES, 3),
  industries: pickTags(story.article.industries, INDUSTRIES, 3),
  companies: [...new Map((story.sources ?? []).map((x) => [companyId(x.source), { id: companyId(x.source), name: x.source }])).values()],
};
delete story.article.themes; delete story.article.industries;
story.series = seriesOf({ mode: plan.mode, format, topic: plan.event?.topic ?? null });
// each section's sources, from the announcements themselves (with their links), like the slides' source lines
if (NEWS.length) for (const x of story.article.sections) x.sources = (x.refs ?? []).map((r) => ({ source: NEWS[r - 1].source, kind: NEWS[r - 1].kind, date: NEWS[r - 1].date, title: NEWS[r - 1].title, link: NEWS[r - 1].link }));
console.log(`article: ${story.article.sections.length} sections (${story.article.source})`);

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "story.json"), JSON.stringify({ date, mode: plan.mode, topic: plan.event?.topic ?? null, format, format_name: FORMATS[format].name, industry, source, via: result.story ? route : null, model: result.model ?? null, proofread: Boolean(result.proofread), note: result.why ?? null, ...story }, null, 1) + "\n");
console.log(`wrote social/out/${slot}/story.json (${FORMATS[format].name}, ${story.slides.length} slides, ${source}${result.story ? ` via ${route}` : ""})`);
