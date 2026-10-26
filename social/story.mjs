// story.mjs — the post as a story: a format picked by code, a storyline written by Claude from the day's facts only.
//
// 1. plan.mjs said what the post is about (a big case, the week's small changes, the week's announcements, or a
//    roundup).
// 2. This picks a format for it — breaking news, monthly report, industry deep dive, A vs B, quiz, timeline,
//    explainer, checklist — avoiding the formats of the last two posts (an industry deep dive also avoids the last
//    industries covered).
// 3. Claude writes the slides (as many as the story needs) and the caption from trends/data/insights.json → facts.
// 4. Code checks every slide and the caption (claude.mjs → checkStory): each number must be one of the facts' numbers,
//    no advice or forecast words, no notes to us, line widths, our words rather than an announcement's. One retry
//    with the problems listed. If Claude is unavailable or fails twice, a plainer story is assembled from the day's
//    cards or announcements — and it goes through the very same checks: if it fails them too, there is no draft today
//    (util.mjs → dropDraft: the folder and the posted.json entry go, the run carries on with the site).
// Writes social/out/<slot>/story.json for build.mjs (slides) and caption.mjs (caption), with the web briefing
// (article) that briefs.mjs publishes once the post is on Instagram.
//
// Usage: node social/story.mjs   (after social/plan.mjs)
import fs from "node:fs";
import path from "node:path";
import { slidesFor } from "./pick.mjs";
import { ask, pickRoute, ClaudeUnavailable, STYLE, plain, numbersIn, allowNumbers, copyChecker, checkStory, checkArticle, slideText } from "./claude.mjs";
import { THEMES, INDUSTRIES, tagPrompt, pickTags, companyId, seriesOf } from "./tags.mjs";
import { ROOT, OUT, read, write, parse, isMain, dropDraft } from "./util.mjs";
import { isSlot, parseSlot, compareSlots } from "./slot.mjs";

// ---------- formats ----------
export const FORMATS = {
  breaking: { name: "속보", how: "무슨 일이 일어났나(한 문장) → 핵심 숫자 → 전과 비교해 얼마나 달라졌나 → 왜 눈여겨볼 만한가 → 기업·실무 입장에서 어떤 의미인가 → 한 줄 정리" },
  monthly: { name: "월간 AX 리포트", how: "이번 달 한 줄 요약 → 전체 도입률과 1년 변화 → 업종별(높은 곳·낮은 곳) → 가장 빨리 바뀐 업종 → 회사 규모별 → 기업이 돈을 내는 AI → IT 영역별 공식 발표 → IT 컨설팅 관점에서 확인할 점(2~4개) → 정리" },
  deepdive: { name: "업종 딥다이브", how: "지정된 한 업종에 집중: 표지 질문 → 지금 도입률 → 1년·처음 잰 때와 비교 → 다른 업종·전체 평균과의 거리 → 이 숫자가 그 업종 실무자에게 뜻하는 것 → 점검 질문 2~3개 → 정리" },
  timeline: { name: "타임라인", how: "처음 잰 때 → 1년 전 → 지금, 흐름이 꺾이거나 빨라진 지점 → 무엇이 달라졌나 → 정리" },
  versus: { name: "A vs B", how: "두 쪽을 소개 → 기업 결제 숫자 → 개발자 숫자 → 1년 전과 비교 → 같은 점과 다른 점 → 정리" },
  quiz: { name: "퀴즈", how: "질문 장(보기 3개, kind=quiz, 정답은 다음 장) → 정답 장(kind=answer, 숫자와 해설) → 이를 2~3번 → 정리" },
  explainer: { name: "개념 풀이", how: "AX가 뭔지 쉬운 말로 → DX와 다른 점 → 지금 어디까지 왔나(숫자) → 업종·규모별로 다른 속도 → 기업이 먼저 보는 것 → 정리" },
  checklist: { name: "체크리스트", how: "업종 평균 숫자로 우리 회사를 점검하는 질문 4~6개, 한 장에 하나씩, 질문마다 근거 숫자 → 정리" },
  weekly: { name: "이번 주 정리", how: "이번 주 한 줄 요약 → 작은 변화 하나씩(무엇이·얼마나·왜 볼 만한가) → 정리" },
  newsweek: { name: "이번 주 AX 사건", how: "표지: 이번 주 AX를 한 문장으로 → 발표 3~5건을 중요한 순서로 한 장에 하나씩(누가·무엇을 발표했나 → 어느 IT 영역의 일이고 기업 IT 프로젝트에 무슨 뜻인가) → 여러 발표에 공통으로 보이는 흐름 → IT 컨설팅 관점에서 확인할 점 → 정리" },
  newstheme: { name: "AX 사건 묶어 보기", how: "표지 → 발표들을 IT 영역(ERP·백오피스, CRM·고객, 클라우드·인프라, 데이터·분석, 업무 도구, 보안·규제, AI 에이전트) 2~3개로 묶어 영역마다 한두 장, 영역 안의 발표 내용 → 그 영역 실무자·IT 컨설턴트가 확인할 점 → 정리" },
};
const candidatesFor = (plan) => plan.mode === "event"
  ? (/^ax:month/.test(plan.event.key) ? ["monthly", "deepdive", "timeline"] : plan.event.kind === "1위 교체" ? ["breaking", "versus"] : ["breaking"])
  : plan.mode === "news" ? ["newstheme", "newsweek"] // grouped by IT domain first
  : plan.mode === "digest" ? ["weekly", "checklist"] : ["explainer", "quiz", "timeline", "checklist"];

// industries by how far their AI adoption moved in a year, most first — for the deep dive. Read from the AX card's own
// data (trends/build.mjs → "ax-industry-up": its figure, else its ranking: name and 1-year change in %p); the facts'
// sentences ("제조 기업 중 … 1년 새 +17.4%p") only when the card isn't there
export function industriesByMove(I) {
  const card = I.topics?.find((t) => t.id === "ax")?.insights?.find((x) => x.id === "ax-industry-up");
  const rows = card?.fig?.items?.map((x) => [x.name, x.v]) ?? card?.viz?.find((v) => v.kind === "rank")?.items?.map((x) => [x.name, x.value]);
  if (rows?.length) return [...rows].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const ax = (I.facts ?? []).filter((f) => f.group === "ax" && /기업 중 AI 도구에 돈을 내는 비율/.test(f.text) && !/(대기업|중견기업|중소기업)/.test(f.text));
  const moved = (f) => +((f.text.match(/1년 새 ([+−-][\d.]+)%p/) ?? [])[1] ?? "0").replace("−", "-");
  return [...ax].sort((a, b) => moved(b) - moved(a)).map((f) => f.text.split(" 기업 중")[0]);
}

// a news slide's source line, printed by code from the announcements it tells (never by the model): one or two with
// their dates; more (a summing-up slide) as names and a count — at most three names, the rest "외 N곳", like the cards
const KIND_LABEL = { company: "공식 발표", government: "보도자료", research: "리서치" };
const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
export function srcLine(ns) {
  if (ns.length <= 2) return ns.map((n) => `${n.source} ${KIND_LABEL[n.kind] ?? "발표"} · ${md(n.date)}`).join(" / ");
  const names = [...new Set(ns.map((n) => n.source))];
  return `${names.slice(0, 3).join(" · ")}${names.length > 3 ? ` 외 ${names.length - 3}곳` : ""} 발표 ${ns.length}건`;
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
- 숫자는 주어진 팩트에 적힌 그대로만 쓴다(+·− 부호까지). 반올림·환산·새 계산(차이, 배수 등) 금지. 팩트에 없는 숫자는 쓰지 않는다.
- 팩트에 없는 사실(회사 소개, 사례, 이유, 업종별 AI 활용 예)을 사실처럼 쓰지 않는다. 해석은 "~라는 뜻이에요", "~로 읽혀요"처럼 해석임이 드러나게 쓴다.
- 앞으로 어떻게 될지 단정하지 않는다("~할 거예요", "~할 것으로 보여요" 금지). 무엇을 사거나 팔라고 하지 않는다. "추천", "전망", "예상", "급등" 같은 말을 쓰지 않는다.
- 쉬운 존댓말(~요). 전문 용어(SDK, %p, Ramp AI Index 등)는 처음 나올 때 짧게 풀어 준다.
- Ramp AI Index는 미국 기업, 유료 결제 기준이라는 점을, 다운로드는 사용자 수가 아니라 설치 횟수라는 점을 필요한 곳에서 한 번씩 밝힌다.
- 문법: 조사는 앞말의 받침에 맞춘다. 숫자·영어 뒤에서도 읽는 소리 기준이다(Anthropic은, OpenAI는, 12.1%p는, 3위로, SDK를). 띄어쓰기는 표준어 규정대로, 문장 끝은 ~요/~예요/~이에요로 맞춘다(받침 없으면 ~예요, 있으면 ~이에요).
- 줄바꿈: 카드는 좁다. 본문은 한 줄을 22자 안쪽으로, 한 뜻 덩어리마다 줄을 바꾼다("\n"). 제목은 한 줄 14자 안쪽, 길면 뜻이 나뉘는 곳에서 한 번만 "\n". 단어·숫자 중간이나 조사 앞에서 끊지 않는다. 목록 항목(items)·숫자 설명(label)은 한 줄 22자 안쪽, 머리말(kicker)은 짧게. 회사·기관 이름을 "·"로 길게 잇지 않는다(세 곳이 넘으면 "OO 등 5곳"처럼).
- 캡션은 게시물 내용을 4~8줄로 짧게 요약한 본문만. 해시태그·링크·출처 줄은 쓰지 않는다(코드가 붙인다).

출력은 JSON 하나만, 다른 글 없이:
{"slides":[{"kind":"cover|text|number|list|quiz|answer|end","refs":[발표 번호(AX 사건 게시물만)],"kicker":"짧은 머리말(선택)","title":"제목","body":"본문(선택)","number":"강조할 숫자(number·answer 장, 팩트 숫자 그대로)","label":"숫자 설명(선택)","items":["목록 항목(list·quiz·end 장, 선택)"]}],"caption":"캡션 본문"}`;

const NEWS_RULES = `
이번 게시물은 공식 발표(회사 뉴스룸·정부 보도자료·리서치)를 모은 'AX 사건'이다. 추가 규칙:
- 발표에 적힌 것만 쓴다. 발표의 제목·요약에 없는 사실(배경, 금액, 고객 수, 다른 회사 이야기)을 더하지 않는다.
- 누가 말했는지 밝힌다: "OO는 ~했다고 발표했어요", "과학기술정보통신부는 ~라고 밝혔어요". 회사의 자평(최고, 혁신적, 업계 최초 등)은 그 회사의 말로만 옮긴다.
- 기업 AX 관점의 의미는 필요한 곳에만 짧게, 해석임이 드러나게 쓴다. 발표한 회사를 평가하거나 응원하지 않는다.
- 발표문 문장을 그대로 옮기지 않고 우리 말로 짧게 바꿔 쓴다(24자 넘게 같으면 거절된다). 영어 제목도 번역해 풀어 쓴다. 회사·제품 이름은 원래 표기 그대로.
- 금액·수치는 발표에 적힌 숫자 그대로 쓴다(예: $1 billion은 "$1 billion"으로, 원화·다른 단위로 바꾸지 않는다).
- 발표 3~5건을 고른다. 기업의 AI 도입·전환, 기업 간 협력·인수, 정부 정책·규제를 소비자 제품 소식보다 앞에 둔다.
- 사건을 말하는 장마다 "refs"에 그 발표 번호를 적는다(예: [2]). 표지와 마지막 장은 비워도 된다. 출처 줄은 코드가 붙인다.
- 캡션은 이번 주 사건을 회사·기관 이름과 함께 4~8줄로.`;

// ---------- proofreading: a second read that may fix only grammar, spacing and line breaks ----------
const PROOF = `너는 한국어 교정자다. 인스타그램 카드뉴스 JSON을 받아 같은 구조의 JSON으로 돌려준다.
고치는 것: 맞춤법, 띄어쓰기, 조사(앞말 받침에 맞게 — 숫자·영어는 읽는 소리 기준), 어색한 문장, 문장 끝(~요 존댓말 통일), 줄바꿈("\\n": 본문은 한 줄 22자 안쪽·한 뜻 덩어리마다, 제목은 한 줄 14자 안쪽에서 뜻이 나뉘는 곳에 한 번만, 단어·숫자 중간이나 조사 앞에서 끊지 않기).
고치지 않는 것: 숫자(한 글자도, 부호까지), 사실, 장 수와 순서, kind, refs, 내용의 뜻. 새 내용을 더하지 않는다.
출력은 JSON 하나만, 다른 글 없이.`;

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

async function main() {
  const I = read(path.join(ROOT, "trends", "data", "insights.json"));
  const plan = read(path.join(ROOT, "social", "plan.json"), { mode: "roundup" });
  if (plan.post === false) { console.log(`social/plan.json says no draft today (${plan.why}) — no story`); return; }
  // the post's folder and its date (the date in Korea it was made for — plan.mjs); the data's own date is I.built_at
  const slot = plan.slot ?? I.built_at, date = parseSlot(slot)?.date ?? I.built_at, dir = path.join(OUT, slot);

  const candidates = candidatesFor(plan);
  const history = (fs.existsSync(OUT) ? fs.readdirSync(OUT) : []).filter((f) => isSlot(f) && compareSlots(f, slot) < 0 && fs.existsSync(path.join(OUT, f, "design.json")))
    .sort(compareSlots).map((f) => read(path.join(OUT, f, "design.json"), {}));
  const recentFormats = history.slice(-2).map((h) => h.format);
  const format = candidates.find((c) => !recentFormats.includes(c)) ?? candidates[0];
  // a deep dive takes the industry that moved most among those not covered lately
  const coveredInds = history.filter((h) => h.industry).slice(-4).map((h) => h.industry);
  const industry = format === "deepdive" ? industriesByMove(I).find((n) => !coveredInds.includes(n)) ?? null : null;

  // ---------- what the post may say ----------
  const facts = I.facts.map((f) => plain(f.text));
  const cards = slidesFor(I, plan).map((x) => ({ ...x, title: plain(x.title), easy: plain(x.easy), body: plain(x.body), big: plain(x.big), bl: plain(x.bl) }));
  // a news post: the official announcements plan.mjs picked, numbered [1]…[n] for Claude; each news slide names the
  // ones it tells (refs) and code — not Claude — prints their source and date on it
  const NEWS = plan.mode === "news" ? plan.news ?? [] : [];
  const ctx = {
    allowed: allowNumbers([facts, cards.map((x) => [x.big, x.bl, x.title, x.easy, x.body]), NEWS.map((n) => `${n.title} ${n.summary}`)], { dates: [date, I.built_at, ...NEWS.map((n) => n.date)] }),
    copied: copyChecker(NEWS.map((n) => `${n.title} ${n.summary}`)),
    refs: NEWS.length,
  };
  const check = (st) => checkStory(st, ctx);
  const articleCtx = { ...ctx, refs: { max: NEWS.length, some: NEWS.length > 0, what: "발표" } };

  function brief() {
    const what = plan.mode === "event" ? `오늘의 빅 케이스(${plan.event.kind}): ${plain(plan.event.headline)}`
      : plan.mode === "digest" ? `지난 한 주의 작은 변화 ${plan.items.length}가지: ${plan.items.map((c) => plain(c.headline)).join(" / ")}`
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

  // the figures (not the small counts — "3가지", "1위") must stay exactly as they were, sign included, each as often
  const numbersOf = (st) => numbersIn([...st.slides.map(slideText), st.caption].map(plain).join("\n")).filter((x) => !x.small).map((x) => x.n).sort().join(" ");
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

  // ---------- fallbacks (no Claude, or it failed): checked like Claude's story, or no draft ----------
  // a plain story from the day's cards
  function fromCards() {
    const [lead, ...rest] = cards;
    if (!lead) return { slides: [], caption: "" };
    const slides = [
      { kind: "cover", kicker: FORMATS[format].name, title: lead.title, body: lead.easy || lead.body },
      ...cards.map((x) => ({ kind: "number", kicker: x.k ? plain(x.k) : "", number: x.big, label: x.bl, title: x.title, body: (x.easy || x.body || "").slice(0, 140) })),
      { kind: "end", title: "정리", items: cards.map((x) => `${x.title} (${x.big})`).slice(0, 6) },
    ];
    const caption = [lead.title, lead.easy || lead.body, "", ...rest.map((x) => `· ${x.title} (${x.big})`)].join("\n");
    return { slides, caption };
  }
  // a news post: the announcements as published, one per slide
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
  const source = result.story ? "claude" : "cards";
  const left = check(story);
  if (left.length) {
    // Claude's story passed these very checks a moment ago, so this is a bug; a fallback that fails means no post
    if (source === "claude") throw new Error(`story failed its own checks: ${left.join(" / ")}`);
    return dropDraft(plan, `Claude's story was not available (${result.why}), and the plain story made from the ${NEWS.length ? "announcements" : "cards"} failed the checks: ${left.slice(0, 5).join(" / ")}${left.length > 5 ? ` … ${left.length} problems` : ""}`);
  }
  if (!result.story) console.log(`story from the cards — ${result.why}`);
  // the source line on each news slide is printed from the announcement itself, never written by the model
  for (const sl of story.slides) if (sl.refs?.length) sl.src = `출처 · ${srcLine(sl.refs.map((r) => NEWS[r - 1]))}`;
  const used = [...new Set(story.slides.flatMap((sl) => sl.refs ?? []))].sort((a, b) => a - b);
  if (NEWS.length) story.sources = used.map((r) => ({ source: NEWS[r - 1].source, kind: NEWS[r - 1].kind, date: NEWS[r - 1].date, title: NEWS[r - 1].title, link: NEWS[r - 1].link, id: NEWS[r - 1].id }));

  // ---------- the web briefing ----------
  async function articleFromClaude(route, st) {
    const messages = [{ role: "user", content: `${brief()}\n\n카드 스토리(이 흐름을 따라 더 풀어 쓸 것):\n${JSON.stringify(st.slides.map(({ src, ...x }) => x))}\n\n웹 브리핑 JSON만.` }];
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await ask(route, (NEWS.length ? SYSTEM + NEWS_RULES : SYSTEM) + ARTICLE_RULES, messages);
      if (res.refusal) return null;
      let a = null, problems;
      try { a = parse(res.text); problems = checkArticle(a, articleCtx); } catch (e) { problems = [`JSON으로 읽을 수 없음: ${e.message}`]; }
      if (!problems.length) return a;
      console.log(`article attempt ${attempt} rejected: ${problems.join(" / ")}`);
      messages.push({ role: "assistant", content: res.text }, { role: "user", content: `다음 문제를 고쳐서 JSON 전체를 다시 써 줘:\n- ${problems.join("\n- ")}` });
    }
    return null;
  }
  // no Claude, or it failed: the story's own slides (already checked), one section each
  const flat = (t) => plain(t).replace(/\n/g, " ");
  const articleFromSlides = (st) => {
    const [cover, ...rest] = st.slides, end = rest.at(-1)?.kind === "end" ? rest.pop() : null;
    const sections = rest.map((x) => ({ heading: flat(x.title), body: [x.number ? `${x.number} — ${x.label ?? ""}` : "", flat(x.body ?? ""), ...(x.items ?? []).map((i) => `· ${flat(i)}`)].filter(Boolean).join("\n\n"), refs: x.refs ?? [] }));
    const takeaways = end?.items?.length ? end.items.map(flat) : end?.body ? plain(end.body).split("\n").filter(Boolean) : sections.map((x) => x.heading).slice(0, 6);
    return { title: flat(cover.title), lede: flat(cover.body || rest.find((x) => x.body)?.body || cover.title), sections, takeaways };
  };
  let article = null, by = "slides";
  if (route && result.story) {
    try { article = await articleFromClaude(route, story); if (article) by = "claude"; } catch (e) { if (!(e instanceof ClaudeUnavailable)) throw e; console.log(`article: ${e.message}`); }
  }
  if (!article) {
    // the briefing is where the caption's link goes, so a post can't go without one that passes the same checks
    const fallback = articleFromSlides(story), bad = checkArticle(fallback, articleCtx);
    if (bad.length) return dropDraft(plan, `the web briefing made from the slides failed the checks: ${bad.slice(0, 5).join(" / ")}`);
    article = fallback;
  }
  story.article = { ...article, source: by };
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

  // only the announcements the post told count as used; the others stay available for next week
  if (NEWS.length) {
    const LOG = path.join(ROOT, "social", "posted.json"), log = read(LOG, []), e = log.findLast((x) => (x.slot ?? x.date) === slot && x.mode === "news");
    if (e) { e.news = story.sources.map((x) => x.id); write(LOG, log); }
  }
  fs.mkdirSync(dir, { recursive: true });
  write(path.join(dir, "story.json"), { date, mode: plan.mode, topic: plan.event?.topic ?? null, format, format_name: FORMATS[format].name, industry, source, via: result.story ? route : null, model: result.model ?? null, proofread: Boolean(result.proofread), note: result.why ?? null, ...story });
  console.log(`wrote social/out/${slot}/story.json (${FORMATS[format].name}, ${story.slides.length} slides, ${source}${result.story ? ` via ${route}` : ""})`);
}
if (isMain(import.meta.url)) await main();
