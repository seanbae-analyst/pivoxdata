// glossary.mjs — the words the radar uses, explained for someone who has never written code or read a paper.
// build.mjs renders them as the "용어 풀이" section and turns the first mention of each in a card into a tappable
// word that shows the same explanation (one source, so the two never disagree; terms.js shows it).
//
// It grows with the briefings (2026-10-26): each briefing may add up to three words of its own (social/story.mjs asks
// Claude for them and checks them — social/claude.mjs → checkTerms), and once its post is on Instagram they join the
// glossary here, with a link to the briefing they came from. A draft's words wait until it is posted, and a rejected
// one's never come. The fixed words come first and are never replaced by a briefing's.
// Two groups: the AX and IT words the stories use, and the words of the evidence data (downloads, papers, models).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc } from "./site.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const GROUPS = { ax: "AX·IT 용어", data: "근거 데이터 용어" };

// `match`: the spellings that count as a mention in card text, longest first where one contains another.
const GLOSSARY = [
  { id: "ax", group: "ax", term: "AX (AI 전환)", match: ["AX"], def: "AI Transformation. 회사가 일하는 방식과 서비스에 AI를 들여 바꾸는 일이에요. 디지털 전환(DX)의 AI판이라고 보면 돼요." },
  { id: "domain", group: "ax", term: "IT 영역", match: ["IT 영역"], def: "IT 컨설팅에서 일을 나누는 큰 칸이에요. 이 사이트는 ERP·백오피스, CRM·고객, 클라우드·인프라, 데이터·분석, 업무 도구, 보안·규제, AI 에이전트 일곱 가지로 나눠요." },
  { id: "method", group: "ax", term: "도입 방식", match: ["도입 방식"], def: "AI를 어떻게 들였는지예요. 인수, 전사 배포, 기존 시스템에 내장, 인프라 확장, 파트너십, 정책·규제처럼 나눠 봐요. 들이는 방식에 따라 프로젝트에서 확인할 점이 달라져요." },
  { id: "agent", group: "ax", term: "AI 에이전트", match: ["AI 에이전트"], def: "사람이 단계마다 시키지 않아도 여러 단계의 일을 이어서 처리하는 AI예요. 문의를 읽고, 시스템에서 정보를 찾고, 답장 초안까지 쓰는 식이에요." },
  { id: "erp", group: "ax", term: "ERP", match: ["ERP"], def: "Enterprise Resource Planning. 회사의 재무·회계·구매·재고·인사 같은 살림을 한 시스템에서 관리하는 소프트웨어예요(예: SAP, Oracle, Workday). IT 컨설팅에서 가장 큰 사업 영역 중 하나예요." },
  { id: "crm", group: "ax", term: "CRM", match: ["CRM"], def: "Customer Relationship Management. 고객 정보·영업·마케팅·상담 이력을 관리하는 소프트웨어예요(예: Salesforce)." },
  { id: "official", group: "ax", term: "공식 발표", match: ["공식 발표"], def: "회사·정부·기관이 자기 사이트(뉴스룸, 보도자료 페이지)에 직접 낸 글이에요. 이 사이트는 언론 보도나 루머 없이 이것만 써요." },
  { id: "ramp", group: "ax", term: "Ramp AI Index", match: ["Ramp"], def: "미국 기업 7만여 곳의 법인카드·송금 기록으로, AI 도구에 돈을 낸 회사가 몇 %인지 매달 세는 지표예요. 무료 도구나 개인 결제는 안 잡혀요. 미국 연준(FRED)에도 올라와요." },
  { id: "pp", group: "ax", term: "%p (퍼센트포인트)", match: [], def: "퍼센트끼리의 차이예요. 30%가 33%가 되면 +3%p라고 써요(+10%가 아니라). 비율이 얼마나 움직였는지 말할 때 써요." },
  { id: "change", group: "ax", term: "최근 변화", match: [], def: "날마다 어제와 견줘 달라진 일을 모은 목록이에요. 순위가 바뀌거나 새 모델이 들어온 작은 일도, 1위가 바뀌거나 다운로드가 평소의 1.4배를 넘는 큰 일도 여기 쌓여요." },
  { id: "download", group: "data", term: "다운로드", match: [], def: "개발자가 코드 부품(패키지)을 내려받은 횟수예요. 사람 수가 아니라 횟수라서, 자동으로 도는 빌드 서버가 하루에 수천 번 받기도 해요. 그래서 크기보다 평소와 견준 변화를 봐요." },
  { id: "package", group: "data", term: "패키지 · SDK", match: ["SDK"], def: "다른 사람이 만들어 둔 코드 묶음이에요. 개발자는 처음부터 다 짜지 않고 이걸 내려받아 써요. SDK는 회사가 자기 서비스를 쓰라고 내놓은 패키지예요(예: OpenAI SDK)." },
  { id: "npm", group: "data", term: "npm", match: ["npm"], def: "자바스크립트(웹·앱) 개발자들이 패키지를 내려받는 곳이에요. 하루 다운로드 수를 누구나 볼 수 있어요." },
  { id: "pypi", group: "data", term: "PyPI", match: ["PyPI"], def: "파이썬(AI·데이터) 개발자들이 패키지를 내려받는 곳이에요. npm의 파이썬판이라고 보면 돼요." },
  { id: "control", group: "data", term: "대조군 (인기 패키지)", match: ["대조군", "인기 패키지"], def: "비교 기준으로 삼는, AI와 상관없는 인기 패키지 다섯 개예요(npm은 react·lodash 등, PyPI는 requests·numpy 등). 이들이 함께 오르면 계절이나 집계 탓이라고 보고 그만큼 빼요." },
  { id: "growth", group: "data", term: "4주 성장 · 더 늘어난 폭", match: ["4주 성장", "더 늘어난 폭"], def: "4주 성장은 최근 4주 평균을 그 전 4주와 비교한 증가율이에요. 더 늘어난 폭은 거기서 대조군의 4주 성장을 뺀 값 — 시장 전체가 오른 몫을 빼고도 남는 성장이에요." },
  { id: "provider", group: "data", term: "Vercel AI SDK 공급자", match: ["Vercel AI SDK"], def: "앱에 AI 모델을 붙일 때 많이 쓰는 도구예요. 회사마다(OpenAI·Anthropic·Google…) 연결 부품을 따로 내려받기 때문에, 그 비중으로 개발자들이 어느 회사 모델을 고르는지 가늠해요." },
  { id: "arxiv", group: "data", term: "arXiv", match: ["arXiv"], def: "연구자들이 논문을 심사 전에 먼저 공개하는 사이트예요. 논문 요약(초록)에 어떤 말이 얼마나 자주 나오는지 세요." },
  { id: "abstract", group: "data", term: "초록", match: ["초록"], def: "논문 맨 앞의 짧은 요약이에요. 그 논문이 무엇을 다루는지가 담겨 있어서, 여기 나온 말로 연구 주제의 흐름을 봐요." },
  { id: "hf", group: "data", term: "Hugging Face", match: ["Hugging Face"], def: "누구나 쓸 수 있는 AI 모델(오픈 모델)을 올리고 내려받는 곳이에요. AI 모델의 앱스토어 같은 곳이에요." },
  { id: "trending", group: "data", term: "트렌딩", match: ["트렌딩"], def: "Hugging Face가 매기는 '요즘 뜨는' 순위예요. 최근 좋아요와 다운로드가 빨리 늘어나는 모델이 위로 올라가요." },
  { id: "capex", group: "data", term: "설비투자", match: ["설비투자"], def: "회사가 서버·칩·데이터센터·건물 같은 설비에 쓴 돈이에요. 빅테크가 AI에 얼마나 돈을 쏟는지 가장 크게 드러나는 숫자예요(물류창고 같은 다른 설비도 섞여 있어요)." },
  { id: "sec", group: "data", term: "SEC 공시", match: ["공시"], def: "미국 상장사가 미국 금융당국(SEC)에 내는 실적 보고서예요. 설비투자 숫자를 여기서 가져와요." },
];

// two spellings are the same word when they differ only in case, spaces, brackets, hyphens and middle dots
export const termKey = (t) => String(t ?? "").normalize("NFKC").toLowerCase().replace(/[\s·()\-–—_/]/g, "");
// a briefing word's id (#g-…, data-term): a hash of its spelling (FNV-1a), so it is stable, short, ASCII and never
// one of the fixed words' ids
const idOf = (term) => { let h = 0x811c9dc5; for (const c of termKey(term)) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return `b-${h.toString(36)}`; };

// ---------- the briefings' words ----------
// every word a posted briefing added (social/out/<slot>/story.json → article.terms, post.json → published), oldest
// first, each once (the first briefing to explain a word keeps it), none that a fixed word already covers
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
export function briefingTerms() {
  const OUT = path.join(ROOT, "social", "out");
  const fixed = new Set(GLOSSARY.flatMap((g) => [g.term, ...g.match]).map(termKey)), seen = new Set(), out = [];
  const posts = (fs.existsSync(OUT) ? fs.readdirSync(OUT) : []).map((slot) => ({ slot, st: read(path.join(OUT, slot, "story.json")), post: read(path.join(OUT, slot, "post.json")) }))
    .filter((b) => b.st?.article?.terms?.length && b.post?.published && !b.post?.rejected)
    .sort((a, b) => a.st.date.localeCompare(b.st.date) || a.slot.localeCompare(b.slot, "en", { numeric: true }));
  for (const { slot, st } of posts) for (const t of st.article.terms) {
    const k = termKey(t.term);
    if (!k || fixed.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push({ id: idOf(t.term), group: "ax", term: String(t.term), match: [String(t.term)], def: String(t.def), from: { slot, date: st.date, title: st.article.title } });
  }
  return out;
}
// every word the glossary explains now — the fixed ones and the posted briefings' — for story.mjs, so a new briefing
// adds only words that aren't there yet
export const knownTerms = () => [...GLOSSARY, ...briefingTerms()].flatMap((g) => [g.term, ...g.match]);
// the whole glossary: the fixed words, then the briefings' (oldest first, so a word keeps its place)
export const allTerms = () => [...GLOSSARY, ...briefingTerms()];

// ---------- tappable words ----------
const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "(?: |&nbsp;)");
// longest spelling first, so "Vercel AI SDK" is explained as itself before "SDK" gets a chance. A Latin spelling
// matches as a whole word only ("AX" not inside "TAX"); Hangul ones anywhere, since particles stick to them
const termsOf = (list) => list.flatMap((g) => g.match.map((m) => ({ id: g.id, m, re: new RegExp(/^[A-Za-z0-9]/.test(m) ? `(?<![A-Za-z0-9])${rx(m)}(?![A-Za-z0-9])` : rx(m)) })))
  .sort((a, b) => b.m.length - a.m.length);
let TERMS = null;

// wrap the first mention of each term in `html` (text between tags only) as a tappable word; `used` is shared by the
// parts of one card (or one briefing) so a word is explained once there. `list`: the words to look for (default: the
// whole glossary)
export function termify(html, used = new Set(), list = null) {
  if (!html) return html;
  const terms = list ? termsOf(list) : (TERMS ??= termsOf(allTerms()));
  let parts = String(html).split(/(<[^>]+>)/);
  for (const t of terms) {
    if (used.has(t.id)) continue;
    for (let i = 0; i < parts.length; i += 2) {
      // never inside a link or a heading (a tap there means something else)
      if (parts.slice(0, i).reverse().find((p) => /^<\/?(a|h[1-6]|button)\b/i.test(p))?.match(/^<(a|h[1-6]|button)\b/i)) continue;
      const m = parts[i].match(t.re);
      if (!m) continue;
      const a = parts[i].slice(0, m.index), b = parts[i].slice(m.index + m[0].length);
      // the button (word included) sits in a tag slot, so a later, shorter term ("SDK") can't match inside it
      parts.splice(i, 1, a, `<button type="button" class="term" data-term="${t.id}">${m[0]}</button>`, b);
      used.add(t.id);
      break;
    }
  }
  return parts.join("");
}

// one entry; a briefing's word says where it came from
const entry = (g, first) => `<div class="gl" id="g-${g.id}"${first ? ` data-g="${esc(GROUPS[g.group])}"` : ""}><dt>${esc(g.term)}</dt><dd>${esc(g.def)}</dd>${g.from ? `<dd class="gl-from"><a href="/briefs/${esc(g.from.slot)}">${+g.from.date.slice(5, 7)}/${+g.from.date.slice(8, 10)} 리서치에서 처음 나온 말</a></dd>` : ""}</div>`;
// the "용어 풀이" section: one list per group, under its name (on a phone's pages the first word of a group carries
// the name instead, data-g)
export const glossaryHtml = () => {
  const all = allTerms();
  return Object.entries(GROUPS).map(([id, name]) => {
    const list = all.filter((g) => g.group === id);
    return list.length ? `<section class="gl-g" aria-label="${esc(name)}"><h3 class="gl-h">${esc(name)}<span>${list.length}</span></h3><dl>${list.map((g, i) => entry(g, i === 0)).join("")}</dl></section>` : "";
  }).join("");
};
// a briefing's own hidden copy of the words it uses (terms.js reads the explanation from the page)
export const termsSource = (ids) => {
  const all = allTerms().filter((g) => ids.has(g.id));
  return all.length ? `<dl class="terms-src" hidden>${all.map((g) => `<div class="gl" id="g-${g.id}"><dt>${esc(g.term)}</dt><dd>${esc(g.def)}</dd></div>`).join("")}</dl>` : "";
};
