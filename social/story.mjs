// story.mjs — the post as a story: a format picked by code, a storyline written by Claude from the day's facts only.
//
// 1. plan.mjs said what the post is about (a big case, the week's small changes, the week's announcements, or a
//    roundup).
// 2. This picks a format for it — breaking news, monthly report, industry deep dive, A vs B, quiz, timeline,
//    explainer, checklist — avoiding the formats of the last two posts (an industry deep dive also avoids the last
//    industries covered).
// 3. Claude writes the slides (as many as the story needs) and the caption from trends/data/insights.json → facts.
//    Every story runs 사건 → 의미 → 실무 체크 (what happened → what it means for an IT area → what to check in a
//    project), with at most two big-number slides (one in a post of announcements): numbers back the story up.
//    A post of announcements is told as cases, the way an IT consultant reads one (2026-10-26): who brought what in,
//    where and how, in which IT domain and by which way (trends/series.mjs → DOMAINS, METHODS), and what to check.
//    For that Claude reads each announcement's own page as well as its title and summary (original.mjs — read at
//    run time, never stored); the checks treat that text as a source like the title.
// 4. Code checks every slide and the caption (claude.mjs → checkStory): each number must be one of the facts' numbers,
//    no advice or forecast words, no notes to us, line widths, our words rather than an announcement's. One retry
//    with the problems listed. If Claude is unavailable or fails twice, a plainer story is assembled from the day's
//    cards or announcements — and it goes through the very same checks: if it fails them too, there is no draft today
//    (util.mjs → dropDraft: the folder and the posted.json entry go, the run carries on with the site).
// Writes social/out/<slot>/story.json for build.mjs (slides) and caption.mjs (caption), with the web briefing
// (article) that briefs.mjs publishes once the post is on Instagram. The cards are the summary; the briefing is the
// full story — each case with its table and a few paragraphs, the common thread, the IT-consulting view, and the
// words a reader may not know (article.terms: they join the site's glossary once the post is up, trends/glossary.mjs).
//
// Usage: node social/story.mjs   (after social/plan.mjs)
import fs from "node:fs";
import path from "node:path";
import { slidesFor } from "./pick.mjs";
import { ask, pickRoute, ClaudeUnavailable, STYLE, plain, numbersIn, allowNumbers, unknownNumbers, copyChecker, checkStory, checkArticle, checkTerms, slideText, caseText, DOMAIN_NAMES, METHOD_NAMES, NOT_SAID } from "./claude.mjs";
import { readOriginals } from "./original.mjs";
import { knownTerms } from "../trends/glossary.mjs";
import { THEMES, INDUSTRIES, tagPrompt, pickTags, companyId, seriesOf } from "./tags.mjs";
import { ROOT, OUT, read, write, parse, isMain, dropDraft } from "./util.mjs";
import { isSlot, parseSlot, compareSlots } from "./slot.mjs";

// ---------- formats ----------
// every format tells 사건 → 의미 → 실무 체크; a big-number slide (kind=number) only where the number is the news
export const FORMATS = {
  breaking: { name: "속보", how: "표지: 무슨 일이 일어났나(사건, 한 문장) → 그 숫자 하나(kind=number, 한 장) → 전과 견주면 무엇이 달라졌나 → 어느 IT 영역·업무에서 체감되는 일인가(의미) → 도입 프로젝트에서 확인할 점(실무 체크, kind=list) → 정리" },
  monthly: { name: "월간 AX 리포트", how: "표지: 이번 달 이야기 한 문장(사건) → 무엇이 움직였나: 전체 도입률과 1년 변화, 가장 빨리 바뀐 업종(큰 숫자 장은 두 장까지, 나머지 숫자는 문장 속에) → 왜 그렇게 읽히나: 회사 규모별·기업이 돈을 내는 AI(의미) → 같은 달 IT 영역별 공식 발표와 이어 보기 → IT 컨설팅 관점에서 확인할 점 2~4개(실무 체크, kind=list) → 정리" },
  deepdive: { name: "업종 딥다이브", how: "지정된 한 업종: 표지 질문 → 그 업종에서 일어난 일(사건, 숫자 한 장) → 다른 업종·전체 평균과 견주면 무슨 뜻인가(의미) → 그 업종의 IT 프로젝트에서 확인할 점 2~3개(실무 체크, kind=list) → 정리" },
  timeline: { name: "타임라인", how: "처음 잰 때 → 1년 전 → 지금: 흐름이 꺾이거나 빨라진 지점(사건) → 그동안 무엇이 달라졌나(의미) → 지금 도입을 검토하는 팀이 확인할 점(실무 체크, kind=list) → 정리" },
  versus: { name: "A vs B", how: "두 쪽을 소개(사건) → 기업 결제와 개발자 쪽에서 보이는 차이(의미, 숫자는 문장 속에) → 고르는 팀이 확인할 점(실무 체크) → 정리" },
  quiz: { name: "퀴즈", how: "질문 장(보기 3개, kind=quiz, 정답은 다음 장) → 정답 장(kind=answer, 숫자와 해설: 그 숫자가 실무에 뜻하는 것까지) → 이를 2~3번 → 정리" },
  explainer: { name: "개념 풀이", how: "AX가 뭔지 쉬운 말로 → DX와 다른 점 → 지금 어디까지 왔나(숫자 한 장) → 업종·규모별로 다른 속도(의미) → 기업이 먼저 확인할 것(실무 체크, kind=list) → 정리" },
  checklist: { name: "체크리스트", how: "업종 평균 숫자로 우리 회사를 점검하는 질문 4~6개, 한 장에 하나씩, 질문마다 근거 숫자는 문장 속에 → 정리" },
  weekly: { name: "이번 주 정리", how: "이번 주 이야기 한 문장 → 작은 변화 하나씩(무엇이 바뀌었나 → 무슨 뜻인가) → 실무에서 확인할 점(kind=list) → 정리" },
  // a long story (2026-10-27 owner: "스토리라인 좀더 길게" → "10장 이상으로"): a case over two cards, what happened then
  // what it means — 11 to 20 cards, posted by the owner from the app (the API takes 10)
  newsweek: { name: "이번 주 AX 사건", how: "표지: 이번 주 사례들을 꿰는 질문이나 반전 한 문장 → 배경(kind=text): 이번 주에 무슨 일이 있었나, 왜 이 발표들을 함께 읽나 → 사례 3~7건을 중요한 순서로, 사례마다 두 장: 사례 장(kind=case — 사건: 누가 무엇을 들였나, 발표에 적힌 일) → 바로 다음 의미 장(kind=meaning — 그래서 무엇이 달라지나: 그 IT 영역의 도입 프로젝트에 무슨 뜻인가) → 사례들에 공통으로 보이는 흐름(kind=text) → 도입 프로젝트에서 확인할 점(kind=list, 질문 3~5개) → 정리(kind=end). 모두 11~20장" },
  newstheme: { name: "AX 사건 묶어 보기", how: "표지 → 배경(kind=text): 이번 주 발표들이 어느 IT 영역에서 나왔나 → 사례 3~7건을 IT 영역(ERP·백오피스, CRM·고객, 클라우드·인프라, 데이터·분석, 업무 도구, 보안·규제, AI 에이전트)별로 놓고, 사례마다 두 장: 사례 장(kind=case — 사건) → 바로 다음 의미 장(kind=meaning — 그 영역 프로젝트에 무슨 뜻인가) → 영역을 가로질러 보이는 흐름(kind=text) → 그 영역 실무자·IT 컨설턴트가 확인할 점(kind=list, 질문 3~5개) → 정리(kind=end). 모두 11~20장" },
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
// characters of each announcement's page put in front of Claude (up to 8 announcements: ~20k characters in all)
const PAGE_BRIEF = 2500;
const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
export function srcLine(ns) {
  if (ns.length <= 2) return ns.map((n) => `${n.source} ${KIND_LABEL[n.kind] ?? "발표"} · ${md(n.date)}`).join(" / ");
  const names = [...new Set(ns.map((n) => n.source))];
  return `${names.slice(0, 3).join(" · ")}${names.length > 3 ? ` 외 ${names.length - 3}곳` : ""} 발표 ${ns.length}건`;
}

// ---------- Claude ----------
const SYSTEM = `너는 IT 컨설팅 리서치 팀의 AX(기업의 AI 전환) 에디터다. 'AX 트렌드 레이더'의 인스타그램 카드뉴스를 쓴다.
독자는 IT 컨설턴트, 기업의 IT·DX 담당자, AI 도입을 검토하는 실무자다. 데이터와 공식 발표에서 읽히는 일을 하나의 이야기로 엮고,
그것이 기업의 IT 프로젝트에서 무엇을 뜻하는지까지 연결한다. 인스타그램 카드는 요약본이다 — 자세한 이야기는 웹 브리핑이 따로 맡는다.

규칙:
${STYLE}
- 이야기의 흐름은 사건 → 의미 → 실무 체크다. 표지에서 질문이나 반전으로 시작해, 무슨 일이 있었는지 보여 주고(사건), 그것이 어느 IT 영역(ERP·백오피스, CRM·고객, 클라우드·인프라, 데이터·분석, 업무 도구, 보안·규제, AI 에이전트)의 어떤 일인지 짚고(의미), 도입 프로젝트에서 무엇을 확인할지(데이터 준비, 기존 시스템 연동, 보안·거버넌스, 비용, 조직의 변화 관리 중 해당하는 것)로 맺는다(실무 체크). 확인할 점은 질문이나 점검 항목으로 쓰고, 팩트에 없는 사례·수치·효과는 지어내지 않는다.
- 게시물 하나에 이야기 하나. 장마다 한 걸음씩 나아가고, 마지막 장에서 정리한다. 장 수는 이야기에 맞게 정한다(4~10장, 공식 발표로 쓰는 AX 사건 게시물은 11~20장 — 긴 이야기).
- 숫자는 이야기를 받치는 근거다. 큰 숫자 장(kind=number)은 게시물 전체에서 두 장까지(공식 발표로 쓰는 AX 사건 게시물은 한 장까지)이고, 나머지 숫자는 문장 속에 넣는다. 숫자를 늘어놓는 장을 만들지 않는다.
- 카드는 짧고 간단하게: 장마다 제목(한 문장)과 본문 1~2문장(140자 이하). 핵심만 남기고, 배경·자세한 해설은 웹 브리핑에 맡긴다.
- 숫자는 주어진 팩트·발표에 적힌 그대로만 쓴다(+·− 부호까지). 반올림·환산·새 계산(차이, 배수 등) 금지. 거기 없는 숫자는 쓰지 않는다.
- 팩트에 없는 사실(회사 소개, 사례, 이유, 업종별 AI 활용 예)을 사실처럼 쓰지 않는다. 해석은 "~라는 뜻이에요", "~로 읽혀요"처럼 해석임이 드러나게 쓴다.
- 앞으로 어떻게 될지 단정하지 않는다("~할 거예요", "~할 것으로 보여요" 금지). 무엇을 사거나 팔라고 하지 않는다. "추천", "전망", "예상", "급등" 같은 말을 쓰지 않는다.
- 쉬운 존댓말(~요). 전문 용어(SDK, %p, Ramp AI Index 등)는 처음 나올 때 짧게 풀어 준다.
- Ramp AI Index는 미국 기업, 유료 결제 기준이라는 점을, 다운로드는 사용자 수가 아니라 설치 횟수라는 점을 필요한 곳에서 한 번씩 밝힌다.
- 문법: 조사는 앞말의 받침에 맞춘다. 숫자·영어 뒤에서도 읽는 소리 기준이다(Anthropic은, OpenAI는, 12.1%p는, 3위로, SDK를). 띄어쓰기는 표준어 규정대로, 문장 끝은 ~요/~예요/~이에요로 맞춘다(받침 없으면 ~예요, 있으면 ~이에요).
- 줄바꿈: 카드는 좁다. 본문은 한 줄을 22자 안쪽으로, 한 뜻 덩어리마다 줄을 바꾼다("\n"). 제목은 한 줄 14자 안쪽, 길면 뜻이 나뉘는 곳에서 한 번만 "\n". 단어·숫자 중간이나 조사 앞에서 끊지 않는다. 목록 항목(items)·숫자 설명(label)은 한 줄 22자 안쪽, 머리말(kicker)은 짧게. 회사·기관 이름을 "·"로 길게 잇지 않는다(세 곳이 넘으면 "OO 등 5곳"처럼).
- 캡션은 게시물 내용을 4~8줄로 짧게 요약한 본문만. 해시태그·링크·출처 줄은 쓰지 않는다(코드가 붙인다).

출력은 JSON 하나만, 다른 글 없이:
{"slides":[{"kind":"cover|text|number|list|quiz|answer|case|meaning|end","refs":[발표 번호(AX 사건 게시물만)],"kicker":"짧은 머리말(선택)","title":"제목","body":"본문(선택)","number":"강조할 숫자(number·answer 장, 팩트 숫자 그대로)","label":"숫자 설명(선택)","items":["목록 항목(list·quiz·end 장, 선택)"]}],"cases":[사례(AX 사건 게시물만)],"caption":"캡션 본문"}`;

const NEWS_RULES = `
이번 게시물은 공식 발표(회사 뉴스룸·정부 보도자료·리서치)로 쓰는 'AX 사건'이다. 발표 하나하나를 IT 컨설팅의 도입 사례처럼 읽는다:
누가(도입한 곳) 무엇을(어떤 AI·솔루션) 어디에(어느 업무·시스템) 어떻게(어떤 방식으로) 들였고, 우리 회사의 도입 프로젝트에 비추면 무엇을 확인해야 하는가.
추가 규칙:
- 사실은 발표의 제목·요약·원문 발췌에 적힌 것만 쓴다. 원문 발췌는 그 발표의 공식 페이지에서 방금 읽은 글이다(읽지 못한 발표는 제목·요약만 있다). 적혀 있지 않은 것(배경, 금액, 고객 수, 다른 회사 이야기, 도입 효과)을 더하지 않는다. 원문 발췌에 다른 발표의 제목이나 메뉴 글이 섞여 있으면 무시한다.
- 누가 말했는지 밝힌다: "OO는 ~했다고 발표했어요", "과학기술정보통신부는 ~라고 밝혔어요". 회사의 자평(최고, 혁신적, 업계 최초 등)은 그 회사의 말로만 옮긴다. 발표한 회사를 평가하거나 응원하지 않는다.
- 발표문 문장을 그대로 옮기지 않고 우리 말로 짧게 바꿔 쓴다(제목·요약·원문 어디서든 24자 넘게 같으면 거절된다). 영어도 번역해 풀어 쓴다. 회사·제품 이름은 원래 표기 그대로.
- 금액·수치는 발표에 적힌 숫자 그대로 쓴다(예: $1 billion은 "$1 billion"으로, 원화·다른 단위로 바꾸지 않는다).
- 사례 3~7건을 고른다 — 사건 많은 날은 많이: 사례로 읽을 만한 발표(네 칸 중 하나라도 발표에 있는 것)는 모두 사례로, 최대 7건(사례마다 카드 두 장, 모두 20장 안). 조용한 날은 3건(11장): 기업이 AI를 실제 업무·시스템에 들인 일, 기업 간 인수·제휴, 정부 정책·규제를 소비자 제품 소식이나 행사보다 앞에 둔다.
- 고른 발표마다 "cases"에 사례 하나를 쓴다:
  {"ref":발표 번호,"who":"누가 — 도입한 곳(발표한 곳과 다르면 'Uber (OpenAI 발표)'처럼)","what":"무엇을 — AI·솔루션의 이름이나 종류","where":"어디에 — 어느 업무·시스템·조직","how":"어떻게 — 도입 범위와 방식(전 직원 배포, 기존 CRM에 연결, 지분 인수 등)","domain":"IT 영역 하나: ${DOMAIN_NAMES.join("/")}","method":"도입 방식 하나: ${METHOD_NAMES.join("/")}","check":"이 사례를 우리 회사 프로젝트에 비춰 볼 때 확인할 점, 질문 하나(?로 끝남, 60자 이하)"}
  who·what·where·how는 30자 이하의 짧은 명사구다(문장 아님). 발표·원문에 없는 칸은 "${NOT_SAID}"이라고 쓴다 — 짐작으로 채우지 않는다. 네 칸이 다 비는 발표는 사례로 고르지 않는다.
- 사례 하나는 카드 두 장으로 이어서 말한다(사건 → 의미):
  · 사례 장 kind=case(refs에 그 발표 번호 하나): 제목은 '누가 무엇을' 한 문장(한 줄 14자 안쪽), 본문은 발표에 적힌 일 — 누가 무엇을 했다고 밝혔나 1~2문장. 어디에·어떻게·IT 영역·도입 방식은 코드가 cases에서 꺼내 카드에 표로 찍으니 본문에서 되풀이하지 않는다.
  · 바로 다음 의미 장 kind=meaning(refs에 같은 발표 번호 하나): 제목은 그래서 무엇이 달라지나 한 문장, 본문은 그 일이 그 IT 영역의 도입 프로젝트에서 뜻하는 것 2문장(해석임이 드러나게). 그 사례의 확인할 점(cases의 check)은 코드가 카드 아래에 찍으니 본문에서 되풀이하지 않는다.
  두 장의 머리말(kicker)은 코드가 붙이니 비워 둔다.
- 표지 다음에 이번 주 이야기의 배경 장 하나(kind=text, refs에 사례 발표들): 이번 주 발표들이 어디서 나왔고 왜 함께 읽는지.
- 사례 장들 다음에: 사례들에 공통으로 보이는 흐름(kind=text, refs에 해당 발표들) → 도입 프로젝트에서 확인할 점(kind=list, items에 질문 3~5개) → 정리(kind=end). 큰 숫자 장은 한 장까지. 모두 11~20장.
- 사건을 말하는 장마다 "refs"에 그 발표 번호를 적는다(예: [2]). 표지, 확인할 점(kind=list), 마지막 장은 비워도 된다. 출처 줄은 코드가 붙인다.
- 캡션은 카드의 이야기 순서대로 8~16줄(사례가 많으면 사례마다 한 줄로): 첫 줄은 이번 주 이야기 한 문장, 사례마다 두 줄(누가 무엇을 어디에 → 그래서 무엇이 달라지나), 공통 흐름 한 줄, 마지막 줄은 확인할 점 하나.`;

// ---------- proofreading: a second read that may fix only grammar, spacing and line breaks ----------
const PROOF = `너는 한국어 교정자다. 인스타그램 카드뉴스 JSON을 받아 같은 구조의 JSON으로 돌려준다.
고치는 것: 맞춤법, 띄어쓰기, 조사(앞말 받침에 맞게 — 숫자·영어는 읽는 소리 기준), 어색한 문장, 문장 끝(~요 존댓말 통일), 줄바꿈("\\n": 본문은 한 줄 22자 안쪽·한 뜻 덩어리마다, 제목은 한 줄 14자 안쪽에서 뜻이 나뉘는 곳에 한 번만, 단어·숫자 중간이나 조사 앞에서 끊지 않기).
고치지 않는 것: 숫자(한 글자도, 부호까지), 사실, 장 수와 순서, kind, refs, cases(그대로 돌려준다), 내용의 뜻. 새 내용을 더하지 않는다.
출력은 JSON 하나만, 다른 글 없이.`;

// ---------- the web version: the full story, for the site's "AX 브리핑" (social/briefs.mjs) ----------
// `known`: the words the site's glossary already explains, so the briefing adds only new ones
const articleRules = (news, known) => `
이번에는 같은 이야기를 웹사이트 'AX 브리핑' 글로 풀어서 쓴다. 인스타그램 카드는 요약본이고 브리핑이 본편이다 — 카드에서 한두 줄로 지나간 것을 여기서 충분히 설명한다: 배경, ${news ? "무엇을 어디에 어떻게 들였는지, " : ""}숫자가 뜻하는 것, 기업·실무자가 확인할 점. 휴대폰에서 한 화면씩 넘겨 읽는 글이니 문단은 짧게.
- 구성: 제목, 리드(2~3문장 — 이번 이야기를 한 번에), 섹션 3~10개(소제목 + 본문 2~4문단, 문단 사이는 빈 줄), 정리(핵심 3~5줄).
- 흐름은 카드와 같다: 사건 → 의미 → 실무 체크. 카드의 같은 문장을 반복하지 말고 더 설명한다.
${news ? `- 사례마다 섹션 하나(refs에 그 발표 번호 하나, 카드의 사례 순서대로). 첫 문단은 무엇을 발표했나(원문에 근거한 배경), 둘째 문단은 어디에·어떻게 — 도입 범위와 방식, 어떤 업무·시스템과 이어지는지(원문에 있는 만큼), 셋째 문단은 그 IT 영역의 도입 프로젝트에서 뜻하는 것(카드의 의미 장을 더 풀어서), 넷째 문단은 우리 프로젝트에 비춰 확인할 점과 그 이유. 사례 표(누가·무엇을·어디에·어떻게)는 코드가 cases로 섹션 머리에 붙이니, 본문은 표를 되풀이하지 말고 문장으로 풀어 쓴다. 원문에 없는 칸은 "발표에 없다"고 밝혀도 된다.
- 사례 섹션들 다음에 공통 흐름 섹션 하나(refs에 해당 발표들).
` : ""}- 마지막 섹션은 소제목 "IT 컨설팅 관점": 이 흐름이 ERP·CRM·클라우드·데이터·보안 같은 IT 영역의 도입 프로젝트에서 뜻하는 것을 한 문단으로 쓰고, 이어서 확인할 점 3~5개를 한 줄에 하나씩 "· "로 시작하는 목록 문단으로 쓴다(데이터 준비, 기존 시스템 연동, 거버넌스·보안, 비용, 변화 관리 중 해당하는 것 — 팩트와 발표에 근거해서, 질문 형태로).
- 사실·숫자·말투 규칙은 카드와 같다. 해석은 해석임이 드러나게. 한 문단은 2~4문장, 줄바꿈은 문단 사이와 목록 줄에만.
- 용어: 글에 쓴 말 가운데 IT 실무자가 아닌 독자에게 낯설 말 0~3개를 골라 "terms"에 쉬운 풀이를 단다(1~2문장, ~요로 끝, 140자 이하, 숫자 없이 말의 뜻만 — 이번 발표 내용이 아니라 그 말이 무엇인지). 글에 쓴 표기 그대로 고르고, 이미 풀이가 있는 아래 말은 고르지 않는다.
  이미 있는 말: ${known.join(", ")}
출력은 JSON 하나만, 다른 글 없이:
{"title":"제목","lede":"리드","sections":[{"heading":"소제목","body":"문단\\n\\n문단","refs":[발표 번호(AX 사건만)]}],"takeaways":["핵심 한 줄"],"terms":[{"term":"말","def":"쉬운 풀이"}],"themes":["주제"],"industries":["업종"]}
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
  // each announcement's own page (original.mjs): read now, given to Claude, used by the checks as a source — and never
  // written anywhere. A page that can't be read leaves that announcement with its title and summary.
  const ORIG = NEWS.length ? await readOriginals(NEWS) : [];
  if (NEWS.length) console.log(`originals: ${ORIG.filter((o) => o.ok).length}/${NEWS.length} read — ${ORIG.map((o, i) => `[${i + 1}] ${o.ok ? `${o.chars} chars` : o.why}`).join(" · ")}`);
  const titles = NEWS.map((n) => `${n.title} ${n.summary}`), pages = ORIG.filter((o) => o.ok).map((o) => o.text);
  const dates = { dates: [date, I.built_at, ...NEWS.map((n) => n.date)] };
  const ctx = {
    allowed: allowNumbers([facts, cards.map((x) => [x.big, x.bl, x.title, x.easy, x.body]), titles, pages], dates),
    copied: copyChecker([...titles, ...pages]),
    refs: NEWS.length,
  };
  // the same without the pages: a figure only a page has is written down (story.json → original_numbers, numbers
  // only) so caption.mjs, which checks the caption again without the pages, allows it
  const withoutPages = allowNumbers([facts, cards.map((x) => [x.big, x.bl, x.title, x.easy, x.body]), titles], dates);
  const check = (st) => checkStory(st, ctx);
  const articleCtx = { ...ctx, refs: { max: NEWS.length, some: NEWS.length > 0, what: "발표" } };
  // the words the site's glossary already explains (the fixed list and the earlier briefings' terms)
  const known = knownTerms();

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
      ...(NEWS.length ? ["공식 발표 (이것만 사실로 쓸 수 있음, 번호는 refs·cases의 ref에):", ...NEWS.map((n, i) => [
        `[${i + 1}] ${n.source}(${KIND_LABEL[n.kind] ?? "발표"}, ${n.date}${n.domains?.length ? `, 코드가 본 IT 영역: ${n.domains.join("·")}` : ""}${n.method ? `, 코드가 본 도입 방식: ${n.method}` : ""}) — ${n.title}`,
        `    요약: ${n.summary || "(요약 없음)"}`,
        ORIG[i]?.ok ? `    원문 발췌(공식 페이지, 게시하지 않음 — 사실 확인용):\n${ORIG[i].text.slice(0, PAGE_BRIEF).split("\n").map((l) => `      ${l}`).join("\n")}` : `    원문: 읽지 못함(${ORIG[i]?.why ?? "—"}) — 제목·요약만 쓸 것`,
      ].join("\n")), ""] : []),
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
      if (!problems.length) return { story, attempts: attempt };
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
    if (story.cases) out.cases = story.cases; // the cases are not the proofreader's: they go back as they were
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
  // a case card carries its case (build.mjs draws where and how as a small table) and its kicker is code's: the IT
  // domain and the way it went in
  const caseOf = new Map((story.cases ?? []).map((c) => [c.ref, { ...Object.fromEntries(["who", "what", "where", "how", "domain", "method", "check"].map((k) => [k, plain(c[k]).trim()])), ref: c.ref }]));
  // the card after it, what the case means, carries the same case (build.mjs prints its question to ask under it)
  for (const sl of story.slides) if (sl.kind === "case" && caseOf.has(sl.refs?.[0])) { const c = caseOf.get(sl.refs[0]); sl.case = c; sl.kicker = `${c.domain} · ${c.method}`; }
  for (const sl of story.slides) if (sl.kind === "meaning" && caseOf.has(sl.refs?.[0])) { const c = caseOf.get(sl.refs[0]); sl.case = c; sl.kicker = `${c.domain} · 무슨 뜻인가`; }
  const used = [...new Set(story.slides.flatMap((sl) => sl.refs ?? []))].sort((a, b) => a - b);
  if (NEWS.length) story.sources = used.map((r) => ({ source: NEWS[r - 1].source, kind: NEWS[r - 1].kind, date: NEWS[r - 1].date, title: NEWS[r - 1].title, link: NEWS[r - 1].link, id: NEWS[r - 1].id, original: Boolean(ORIG[r - 1]?.ok) }));
  if (caseOf.size) story.cases = [...caseOf.values()].map((c) => ({ ...c, source: NEWS[c.ref - 1].source, date: NEWS[c.ref - 1].date, link: NEWS[c.ref - 1].link }));

  // ---------- the web briefing ----------
  // the whole text of a briefing, for the terms check (a term must be one the briefing uses)
  const articleText = (a) => [a?.title, a?.lede, ...(a?.sections ?? []).flatMap((x) => [x?.heading, x?.body]), ...(a?.takeaways ?? [])].map(plain).join("\n");
  // every case has its section: one whose refs are that announcement alone
  const caseSections = (a) => [...caseOf.keys()].filter((r) => !(a?.sections ?? []).some((x) => x?.refs?.length === 1 && x.refs[0] === r)).map((r) => `발표 ${r}의 사례 섹션이 없음 — refs에 [${r}] 하나만 둔 섹션으로 풀어 쓸 것`);
  async function articleFromClaude(route, st) {
    const messages = [{ role: "user", content: `${brief()}\n\n카드 스토리(이 흐름을 따라 더 풀어 쓸 것):\n${JSON.stringify(st.slides.map(({ src, case: c, ...x }) => x))}${st.cases?.length ? `\n\n사례(cases — 섹션 머리에 표로 붙는다):\n${JSON.stringify(st.cases.map(({ source, date, link, ...c }) => c))}` : ""}\n\n웹 브리핑 JSON만.` }];
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await ask(route, (NEWS.length ? SYSTEM + NEWS_RULES : SYSTEM) + articleRules(NEWS.length > 0, known), messages);
      if (res.refusal) return null;
      let a = null, problems;
      try { a = parse(res.text); problems = [...checkArticle(a, articleCtx), ...caseSections(a), ...checkTerms(a.terms, { text: articleText(a), known }, ctx)]; } catch (e) { problems = [`JSON으로 읽을 수 없음: ${e.message}`]; }
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
    const sections = [];
    for (const x of rest) {
      const body = [x.number ? `${x.number} — ${x.label ?? ""}` : "", flat(x.body ?? ""), ...(x.items ?? []).map((i) => `· ${flat(i)}`)].filter(Boolean).join("\n\n");
      // what a case means goes on in its case's section (one section per case)
      if (x.kind === "meaning" && sections.at(-1)?.refs?.[0] === x.refs?.[0]) sections.at(-1).body += `\n\n${body}`;
      else sections.push({ heading: flat(x.title), body, refs: x.refs ?? [] });
    }
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
  // the briefing's new words, as checked (the fallback made from the slides has none); they join the glossary once the
  // post is up (trends/glossary.mjs)
  story.article.terms = (by === "claude" ? article.terms ?? [] : []).map((x) => ({ term: plain(x.term).trim(), def: plain(x.def).trim() }));
  // a case's section opens with the case (briefs.mjs: a small table)
  for (const x of story.article.sections) if (x.refs?.length === 1 && caseOf.has(x.refs[0])) x.case = caseOf.get(x.refs[0]);
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
  // figures the post took from an announcement's page only (numbers, not the page's text): caption.mjs allows them
  const everything = [...story.slides.map(slideText), ...(story.cases ?? []).map(caseText), story.caption, articleText(story.article), ...story.article.terms.map((x) => x.def)].map(plain).join("\n");
  const original_numbers = unknownNumbers(everything, withoutPages);
  // no model name in what is committed (CLAUDE.md): which route wrote it is enough
  write(path.join(dir, "story.json"), { date, mode: plan.mode, topic: plan.event?.topic ?? null, format, format_name: FORMATS[format].name, industry, source, via: result.story ? route : null, proofread: Boolean(result.proofread), note: result.why ?? null, ...(NEWS.length ? { originals: ORIG.filter((o) => o.ok).length, original_numbers } : {}), ...story });
  console.log(`wrote social/out/${slot}/story.json (${FORMATS[format].name}, ${story.slides.length} slides, ${source}${result.story ? ` via ${route}` : ""})`);
}
if (isMain(import.meta.url)) await main();
