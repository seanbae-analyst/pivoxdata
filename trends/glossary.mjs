// glossary.mjs — the words the radar uses, explained for someone who has never written code or read a paper.
// build.mjs renders them as the "용어 풀이" section and turns the first mention of each in a card into a tappable
// word that shows the same explanation (one source, so the two never disagree).
//
// `match`: the spellings that count as a mention in card text, longest first where one contains another.
export const GLOSSARY = [
  { id: "download", term: "다운로드", match: [], def: "개발자가 코드 부품(패키지)을 내려받은 횟수예요. 사람 수가 아니라 횟수라서, 자동으로 도는 빌드 서버가 하루에 수천 번 받기도 해요. 그래서 크기보다 평소와 견준 변화를 봐요." },
  { id: "package", term: "패키지 · SDK", match: ["SDK"], def: "다른 사람이 만들어 둔 코드 묶음이에요. 개발자는 처음부터 다 짜지 않고 이걸 내려받아 써요. SDK는 회사가 자기 서비스를 쓰라고 내놓은 패키지예요(예: OpenAI SDK)." },
  { id: "npm", term: "npm", match: ["npm"], def: "자바스크립트(웹·앱) 개발자들이 패키지를 내려받는 곳이에요. 하루 다운로드 수를 누구나 볼 수 있어요." },
  { id: "pypi", term: "PyPI", match: ["PyPI"], def: "파이썬(AI·데이터) 개발자들이 패키지를 내려받는 곳이에요. npm의 파이썬판이라고 보면 돼요." },
  { id: "control", term: "대조군 (인기 패키지)", match: ["대조군", "인기 패키지"], def: "비교 기준으로 삼는, AI와 상관없는 인기 패키지 다섯 개예요(npm은 react·lodash 등, PyPI는 requests·numpy 등). 이들이 함께 오르면 계절이나 집계 탓이라고 보고 그만큼 빼요." },
  { id: "growth", term: "4주 성장 · 더 늘어난 폭", match: ["4주 성장", "더 늘어난 폭"], def: "4주 성장은 최근 4주 평균을 그 전 4주와 비교한 증가율이에요. 더 늘어난 폭은 거기서 대조군의 4주 성장을 뺀 값 — 시장 전체가 오른 몫을 빼고도 남는 성장이에요." },
  { id: "pp", term: "%p (퍼센트포인트)", match: [], def: "퍼센트끼리의 차이예요. 30%가 33%가 되면 +3%p라고 써요(+10%가 아니라). 비율이 얼마나 움직였는지 말할 때 써요." },
  { id: "provider", term: "Vercel AI SDK 공급자", match: ["Vercel AI SDK"], def: "앱에 AI 모델을 붙일 때 많이 쓰는 도구예요. 회사마다(OpenAI·Anthropic·Google…) 연결 부품을 따로 내려받기 때문에, 그 비중으로 개발자들이 어느 회사 모델을 고르는지 가늠해요." },
  { id: "arxiv", term: "arXiv", match: ["arXiv"], def: "연구자들이 논문을 심사 전에 먼저 공개하는 사이트예요. 논문 요약(초록)에 어떤 말이 얼마나 자주 나오는지 세요." },
  { id: "abstract", term: "초록", match: ["초록"], def: "논문 맨 앞의 짧은 요약이에요. 그 논문이 무엇을 다루는지가 담겨 있어서, 여기 나온 말로 연구 주제의 흐름을 봐요." },
  { id: "hf", term: "Hugging Face", match: ["Hugging Face"], def: "누구나 쓸 수 있는 AI 모델(오픈 모델)을 올리고 내려받는 곳이에요. AI 모델의 앱스토어 같은 곳이에요." },
  { id: "trending", term: "트렌딩", match: ["트렌딩"], def: "Hugging Face가 매기는 '요즘 뜨는' 순위예요. 최근 좋아요와 다운로드가 빨리 늘어나는 모델이 위로 올라가요." },
  { id: "capex", term: "설비투자", match: ["설비투자"], def: "회사가 서버·칩·데이터센터·건물 같은 설비에 쓴 돈이에요. 빅테크가 AI에 얼마나 돈을 쏟는지 가장 크게 드러나는 숫자예요(물류창고 같은 다른 설비도 섞여 있어요)." },
  { id: "sec", term: "SEC 공시", match: ["공시"], def: "미국 상장사가 미국 금융당국(SEC)에 내는 실적 보고서예요. 설비투자 숫자를 여기서 가져와요." },
  { id: "change", term: "빅 케이스 · 작은 변화", match: [], def: "빅 케이스는 평소와 크게 다른 일(1위가 바뀜, 다운로드가 평소의 1.4배 이상 등)이고, 작은 변화는 어제와 달라진 작은 일(순위 변동, 새로 들어온 모델 등)이에요." },
];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "(?: |&nbsp;)");
// longest spelling first, so "Vercel AI SDK" is explained as itself before "SDK" gets a chance
const TERMS = GLOSSARY.flatMap((g) => g.match.map((m) => ({ id: g.id, m, re: new RegExp(rx(m)) }))).sort((a, b) => b.m.length - a.m.length);

// wrap the first mention of each term in `html` (text between tags only) as a tappable word; `used` is shared by the
// parts of one card so a word is explained once per card
export function termify(html, used = new Set()) {
  if (!html) return html;
  let parts = String(html).split(/(<[^>]+>)/);
  for (const t of TERMS) {
    if (used.has(t.id)) continue;
    for (let i = 0; i < parts.length; i += 2) {
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

export const glossaryHtml = () => GLOSSARY.map((g) => `<div class="gl" id="g-${g.id}"><dt>${esc(g.term)}</dt><dd>${esc(g.def)}</dd></div>`).join("");
