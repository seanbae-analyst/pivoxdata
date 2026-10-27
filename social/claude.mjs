// claude.mjs — the two ways social/ reaches Claude, shared by story.mjs (the storyline), caption.mjs and roundup.mjs:
//  • CLAUDE_CODE_OAUTH_TOKEN — a Claude subscription token from `claude setup-token`, used through the Claude Code
//    CLI (`claude -p`): nothing to pay beyond the subscription (it shares its usage limits);
//  • ANTHROPIC_API_KEY — an API key, used through the SDK and billed per use.
// `pickRoute()` says which is set up; `ask(route, system, messages)` returns { text, model } or { refusal }, and throws
// ClaudeUnavailable when Claude can't be reached (missing CLI, bad token, API error) so callers can fall back.
//
// Below that, the checks every published word goes through — one set of pure functions for the cards and their
// caption (story.mjs, caption.mjs), the web briefing (story.mjs) and the monthly roundup (roundup.mjs), so no rule is
// looser in one place than in another. Importing this file reads nothing and starts nothing (the SDK loads only when
// the API route is used), so the checks can be run on their own.
import os from "node:os";
import { spawnSync } from "node:child_process";
import { NEWS, AX, DOMAINS, METHODS } from "../trends/series.mjs";

export const MODEL = "claude-opus-5-5";
export class ClaudeUnavailable extends Error {}

export const pickRoute = () => (process.env.CLAUDE_CODE_OAUTH_TOKEN ? "Claude Code" : process.env.ANTHROPIC_API_KEY ? "API" : null);

export async function ask(route, system, messages) {
  return route === "Claude Code" ? viaClaudeCode(system, messages) : viaApi(system, messages);
}

async function viaApi(system, messages) {
  let Anthropic;
  try { ({ default: Anthropic } = await import("@anthropic-ai/sdk")); } catch (e) { throw new ClaudeUnavailable(`API: @anthropic-ai/sdk not installed (${e.code ?? e.message})`); }
  try {
    const res = await new Anthropic().beta.messages.create({
      model: MODEL, max_tokens: 16000, system, messages,
      output_config: { effort: "medium" },
      // if a safety classifier declines, the API re-runs the request on Anthropic's recommended fallback model
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    });
    if (res.stop_reason === "refusal") return { refusal: res.stop_details?.category ?? "unknown" };
    return { text: res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim(), model: res.model };
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw new ClaudeUnavailable(`API error ${e.status}: ${e.message}`);
    throw e;
  }
}

function viaClaudeCode(system, messages) {
  // `claude -p` takes one prompt, so a retry carries the earlier draft inside it. No tools, no saved session, and it
  // runs outside the repository so it never picks up project files as context.
  const prompt = messages.map((m) => (m.role === "user" ? m.content : `(직전에 네가 쓴 답)\n${m.content}`)).join("\n\n");
  const r = spawnSync("claude", ["-p", "--output-format", "json", "--model", MODEL, "--system-prompt", system, "--tools", "", "--no-session-persistence"],
    // a token copied from a terminal often carries a line break; any whitespace in it makes the header invalid
    { input: prompt, encoding: "utf8", cwd: os.tmpdir(), timeout: 600_000, maxBuffer: 1 << 24,
      env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: (process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "").replace(/\s+/g, "") } });
  if (r.error) throw new ClaudeUnavailable(`Claude Code: ${r.error.code === "ENOENT" ? "claude CLI not installed" : r.error.message}`);
  let out;
  try { out = JSON.parse(r.stdout); } catch { throw new ClaudeUnavailable(`Claude Code: exit ${r.status}: ${(r.stderr || r.stdout).trim().slice(0, 300)}`); }
  if (out.is_error) throw new ClaudeUnavailable(`Claude Code: ${String(out.result ?? out.terminal_reason ?? "error").slice(0, 300)}`);
  if (out.stop_reason === "refusal") return { refusal: "claude code" };
  return { text: String(out.result ?? "").trim(), model: Object.keys(out.modelUsage ?? {})[0] ?? MODEL };
}

// ---------- what a reader sees ----------
// Compatibility forms folded (NFKC: full-width digits are digits, a no-break space is a space) and every invisible
// character that could hide a word from the checks removed — format characters (soft hyphen, zero-width spaces and
// joiners, word joiner, BOM, bidi controls: 전\u00AD망 reads 전망) and the Hangul fillers. The cards' no-break
// hyphen becomes a plain one, so a model id in a caption can be copied and searched. Used for the checks and for
// every text that leaves the repository (caption, briefing pages, RSS, push alerts).
const INVISIBLE = /[\p{Cf}\u115F\u1160\u3164\uFFA0]/gu;
export const plain = (t) => String(t ?? "").replace(INVISIBLE, "").normalize("NFKC").replace(INVISIBLE, "").replace(/[\u2010\u2011]/g, "-");

// ---------- words ----------
// No advice or forecast words. BUY·SELL·HOLD only as whole words and 보장 not inside 사회보장·보장성, so a name
// ("… Holdings", "stakeholder", "한국사회보장정보원") in an announcement's title doesn't sink the post. A forecast is
// mostly the future tense — a verb in -ㄹ (오를, 상승할, 늘어날) before 것/거 ("오를 겁니다", "상승할 것으로
// 보여요", "늘어날 거예요", "커질 것 같아요"), "-ㄹ 듯해요", "-ㄹ 가능성이 높아요" — plus 내다보다 and a target
// price (목표 주가, 목표가를/목표가 10만 원; not 목표가 in "도입 목표가 분명한가", which is a goal). Reported speech
// ("출시할 것이라고 밝혔어요") is the announcement's own plan and stays allowed.
const RIEUL = Array.from({ length: 399 }, (_, i) => String.fromCharCode(0xac00 + i * 28 + 8)).join(""); // 갈 날 … 힐: syllables ending in ㄹ
const FORECAST = `[가-힣]*[${RIEUL}]\\s?(?:것으로\\s?(?:보|예상|전망|기대|관측|점쳐|내다)|(?:것|거)\\s?(?:이다|입니다|이에요|예요|에요|이야|야)(?![가-힣])|겁니다|것\\s?같|듯(?:해|합|하다|싶)|가능성이\\s?(?:높|크|커))`;
export const BANNED = new RegExp(`(추천|조언|매수|매도|사세요|사야|팔아|파세요|오를\\s?것|내릴\\s?것|오를지|급등|폭등|폭락|전망|예상|예측|${FORECAST}|내다(?:봤|보[았고며는면]|본|볼)|목표\\s?주가|목표\\s?가격|목표가(?=[를는은가로와도]|\\s?(?:상향|하향|제시|[0-9$₩]))|무조건|(?<!사회)보장(?!성)|대박|(?<![A-Za-z])(?:BUY|SELL|HOLD)(?![A-Za-z]))`, "gi");
// whatever comes back is posted as is, so a note to us must not ride along: "--- 둘째 줄은 제가 덧붙였어요",
// "참고: 숫자 표기를 수정했어요", "(메모: …)", "요청하신 대로 …", "제가 줄였어요"
export const META = /(덧붙였|카드 데이터|팩트 목록|빼도 돼|본문만|캡션 본문|JSON|(?:^|\n|\()\s*(?:참고|메모|노트|편집자\s?주|수정\s?사항|NB|Note)\s*[:：]|(?:요청|지적|말씀)하신|제가\s?[^\n]{0,20}?(?:수정|고쳤|고친|바꿨|바꾼|덧붙|추가했|뺐|줄였|다듬))/i;
// the AI-written tells a reader spots at once: stock phrases, and the same hedge closing every paragraph
export const CLICHE = /(눈여겨볼 만|주목할 만|시사하는 바|시사점|새로운 시대|패러다임|게임 ?체인저|본격화|가속화|의미심장|혁신적인 변화|하는 모습이에요|모습을 보여|흐름으로 볼 수 있어요|알아볼게요|살펴볼게요|함께 살펴)/g;
export const hedges = (t) => (String(t).match(/(?:볼|읽을)\s?수\s?있(?:어요|습니다|겠어요|겠습니다|죠|지요)/g) ?? []).length;
export const STYLE = `- 기자처럼 쓴다: 구체적인 사실을 먼저, 짧은 평서문으로. 꾸밈말과 상투어를 쓰지 않는다("눈여겨볼 만해요", "주목할 만해요", "시사점", "새로운 시대", "패러다임", "게임 체인저", "본격화", "가속화", "~하는 모습이에요", "살펴볼게요" 같은 말 금지).
- 해석은 꼭 필요한 곳에만 짧게 한다. 문단마다 "~로 볼 수 있어요"로 끝내지 않는다(글 전체에서 두세 번 이하). 같은 맺음말을 되풀이하지 않는다.`;

// ---------- numbers ----------
// Every number in a text as written, read after plain() so full-width digits count: commas dropped, and its sign when
// it has one — a + or − at the start, after a space or an opening bracket ("1년 새 +12.1%p", "(−11%)"), never the
// hyphen in 2026-10-25 or gpt-4. `bare`: no sign, and no magnitude, unit or currency next to it ("10조", "3천억", "5배",
// "7%", "$3", "2 billion" are not bare). `small`: bare and 1–10 — a count of the post's own ("3가지", "1위", "2장",
// "10월"), allowed anywhere; a figure must come from the sources.
const UNIT = /^\s?(?:조|억|만|천|백만|천만|%|퍼센트|포인트|배|원|달러|엔|위안|유로|파운드|×|x(?![a-z])|billion|million|thousand|trillion|bn|mn|[kmbt](?![a-z])|[gmkt]w(?![a-z]))/i;
const CURRENCY = /[$₩€£¥]\s?$/;
export function numbersIn(text) {
  const s = plain(text), out = [];
  for (const m of s.matchAll(/([+\-−]?)(\d+(?:[.,]\d+)*)/g)) {
    const before = s.slice(0, m.index), sign = m[1] && !/[\p{L}\p{N}]$/u.test(before) ? (m[1] === "+" ? "+" : "-") : "";
    const v = m[2].replace(/,/g, "").replace(/^0+(?=\d)/, "");
    const bare = !sign && !UNIT.test(s.slice(m.index + m[0].length)) && !CURRENCY.test(before);
    out.push({ n: sign + v, v, sign, bare, small: bare && /^(?:[1-9]|10)$/.test(v) });
  }
  return out;
}
// what the sources allow: every number in them, and the same without its sign (an unsigned "0.4%p 줄었어요" may cite
// "−0.4%p"); a signed number in a text needs that very sign in a source. Dates (the post's, an announcement's) allow
// their numbers bare only — "25일", "2026년", not "25조"
export const allowNumbers = (texts, { dates = [] } = {}) => {
  const ok = new Set(), bare = new Set();
  for (const x of numbersIn([texts].flat(Infinity).map((t) => plain(t)).join("\n"))) { ok.add(x.v); if (x.sign) ok.add(x.n); }
  for (const x of numbersIn(dates.join("\n"))) bare.add(x.v);
  return Object.assign(ok, { bare });
};
export const unknownNumbers = (text, ok) => [...new Set(numbersIn(text).filter((x) => !x.small && !ok.has(x.sign ? x.n : x.v) && !(x.bare && ok.bare?.has(x.v))).map((x) => x.n))];

// ---------- our words, not theirs ----------
// no COPY characters in a row (spaces and punctuation aside, any case) taken from an announcement — checked at every
// position, on everything a news post publishes (cards, caption, the briefing's title, lede, sections and summary)
export const COPY = 24;
const squash = (t) => plain(t).toLowerCase().replace(/[\s"'“”‘’.,·:;!?()「」『』\[\]-]/g, "");
export function copyChecker(sources = []) {
  const seen = new Set();
  for (const src of sources) { const t = squash(src); for (let k = 0; k + COPY <= t.length; k++) seen.add(t.slice(k, k + COPY)); }
  return (text) => { if (!seen.size) return null; const t = squash(text); for (let k = 0; k + COPY <= t.length; k++) if (seen.has(t.slice(k, k + COPY))) return t.slice(k, k + COPY); return null; };
}

// ---------- the checks ----------
// ctx: { allowed: allowNumbers(…sources), copied: copyChecker(announcements) — both from what the post was given }

// numbers from the sources only, no advice or forecast words, no notes to us, no stock phrases, at most three hedges
export function checkWords(text, { allowed } = {}) {
  const t = plain(text), p = [];
  const bad = allowed ? unknownNumbers(t, allowed) : [];
  if (bad.length) p.push(`팩트에 없는 숫자: ${bad.join(", ")} — 팩트에 적힌 숫자를 부호까지 그대로만 쓸 것(반올림·계산 금지)`);
  const words = [...new Set(t.match(BANNED) ?? [])];
  if (words.length) p.push(`쓰면 안 되는 말: ${words.join(", ")} — 지난 일만 말하고 앞으로를 내다보거나 권하지 말 것`);
  const stock = [...new Set(t.match(CLICHE) ?? [])];
  if (stock.length) p.push(`상투어: ${stock.join(", ")} — 구체적인 말로 바꿀 것`);
  if (hedges(t) > 3) p.push(`"~볼 수 있어요"가 ${hedges(t)}번 — 세 번 이하로, 같은 맺음말 반복 금지`);
  if (META.test(t)) p.push("게시물이 아닌 메모가 섞임 — 게시될 글만 쓸 것");
  return p;
}
const copies = (parts, { copied } = {}) => parts.flatMap(([where, text]) => { const hit = copied?.(text); return hit ? [`${where}: 발표문 문장을 그대로 옮김("${hit}…") — 우리 말로 바꿔 쓸 것`] : []; });
// typography a reader notices at once: double spaces, a space before punctuation, unmatched brackets
const typo = (where, t) => [
  ...(/[^\S\n]{2,}/.test(t) ? [`${where}: 띄어쓰기가 두 칸인 곳이 있음`] : []),
  ...(/[^\S\n][.,!?)]/.test(t) ? [`${where}: 문장부호·닫는 괄호 앞에 빈칸`] : []),
  ...((t.match(/\(/g) ?? []).length !== (t.match(/\)/g) ?? []).length ? [`${where}: 괄호 짝이 맞지 않음`] : []),
];

// the caption's body (the source line, link and hashtags are added by code)
export const CAPTION_MAX = 1200;
const captionShape = (t) => [
  ...(!t.trim() || t.length > CAPTION_MAX ? [`캡션은 1~${CAPTION_MAX}자 (지금 ${t.length}자)`] : []),
  ...(/#|https?:\/\//.test(t) ? ["해시태그·링크는 코드가 붙이니 캡션에 쓰지 말 것"] : []),
  ...(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/m.test(t) ? ["캡션이 아닌 메모·구분선이 섞임: 게시될 본문만 쓸 것"] : []),
];
export const checkCaption = (body, ctx = {}) => { const t = plain(body); return [...checkWords(t, ctx), ...captionShape(t), ...copies([["캡션", t]], ctx)]; };

// the cards (social/build.mjs draws them 1080 px wide): a long line wraps again where nobody chose, so each line as the
// writer broke it has a limit — title 18 (aim 14), body 28 (aim 22). The rest are one line each, sized like them from
// the card's CSS: a list item is about a body line wide (34 px type in an 832 px column vs 38 px in 896), a number's
// label is 30 px type across the card (~30 a line, 34 with a body line's slack), and a kicker must stay on its one
// line beside the page number (~26 at 30 px)
export const LINE = { title: 18, body: 28, item: 28, label: 34, kicker: 24 };
export const slideText = (s) => [s.kicker, s.title, s.body, s.number, s.label, ...(s.items ?? [])].filter(Boolean).join("\n");
const KINDS = new Set(["cover", "text", "number", "list", "quiz", "answer", "end", "case", "meaning"]);
// at most three names in a row joined by "·" ("NVIDIA · OpenAI · SAP · Salesforce" → "NVIDIA 등 4곳"): a name is an
// official source or AX vendor we know, or a capitalised Latin word (Uber, Braze); IT words in capitals (ERP·CRM·HR)
// and places (유럽·북유럽·아프리카) are not names
const ORGS = [...new Set([...NEWS.sources.map((x) => x.name), ...AX.series.filter((x) => x.group === "vendor").map((x) => x.name)])];
const named = (seg) => ORGS.some((o) => seg.includes(o)) || /(?<![A-Za-z])[A-Z][a-z][A-Za-z0-9]*/.test(seg);
const nameRun = (line) => plain(line).split("·").filter(named).length;
// `numbers`: how many big-number slides a post may have — the story carries the post, a number backs it up (2026-10-26:
// two at most, one in a post of announcements). How many slides: 4 to 10 — the ten a carousel posted through the API
// may have. A post of announcements is longer (2026-10-27 owner: "10장 이상으로 앞으로 스토리라인으로 구성해줘 … 내가
// 직접 올리던지"): 11 to 20 cards, the twenty the Instagram app takes, each case over two cards — the owner posts it
// from the app (publish.mjs → API_MAX)
export const SLIDES = { min: 4, max: 10, news: [11, 20] };
export function checkSlides(slides, { refs = 0, numbers = refs ? 1 : 2 } = {}) {
  const p = [], [min, max] = refs ? SLIDES.news : [SLIDES.min, SLIDES.max];
  if (!Array.isArray(slides) || slides.length < min || slides.length > max) return [`장 수는 ${min}~${max}장 (지금 ${Array.isArray(slides) ? slides.length : 0})${refs ? " — 표지 → 배경 → 사례마다 사례 장과 의미 장 → 공통 흐름 → 확인할 점 → 정리" : ""}`];
  if (slides[0]?.kind !== "cover") p.push("첫 장은 kind=cover");
  const big = slides.filter((s) => s?.kind === "number").length;
  if (big > numbers) p.push(`큰 숫자 장(kind=number)이 ${big}장 — ${numbers}장까지만, 나머지 숫자는 문장 속에 (이야기가 먼저, 숫자는 근거)`);
  slides.forEach((s, i) => {
    const at = `${i + 1}장`, lines = (t) => plain(t).split("\n"), long = (t, n) => lines(t).some((l) => l.length > n);
    if (!KINDS.has(s?.kind)) p.push(`${at}: kind는 ${[...KINDS].join("/")} 중 하나`);
    if (!s?.title || plain(s.title).length > 70) p.push(`${at}: 제목은 1~70자`);
    if (String(s?.title ?? "").split("\n").length > 2) p.push(`${at}: 제목 줄바꿈은 한 번까지`);
    if (long(s?.title, LINE.title)) p.push(`${at}: 제목 한 줄이 ${LINE.title}자를 넘음 — 14자 안쪽에서 끊을 것`);
    // the cards stay short; the long explanation is the web briefing (article)
    if (plain(s?.body).length > 140) p.push(`${at}: 본문은 140자 이하로 짧게 (지금 ${plain(s.body).length}자) — 자세한 설명은 웹 브리핑에`);
    if (long(s?.body, LINE.body)) p.push(`${at}: 본문 한 줄이 ${LINE.body}자를 넘음 — 22자 안쪽, 뜻 덩어리마다 "\\n"`);
    const items = Array.isArray(s?.items) ? s.items : [];
    if (items.length > 6) p.push(`${at}: 항목은 6개 이하`);
    if (items.some((x) => plain(x).replace(/\n/g, " ").length > LINE.item)) p.push(`${at}: 항목은 한 줄씩 ${LINE.item}자 이하`);
    if (plain(s?.label).replace(/\n/g, " ").length > LINE.label) p.push(`${at}: 숫자 설명(label)은 ${LINE.label}자 이하`);
    if (/\n/.test(s?.kicker ?? "") || plain(s?.kicker).length > LINE.kicker) p.push(`${at}: 머리말(kicker)은 한 줄 ${LINE.kicker}자 이하`);
    const t = slideText(s ?? {});
    p.push(...typo(at, t));
    if (lines(t).some((l) => nameRun(l) > 3)) p.push(`${at}: 회사·기관 이름을 "·"로 세 곳 넘게 이음 — "OO 등 N곳"처럼 줄일 것`);
    if (["case", "meaning"].includes(s?.kind) && (!refs || !Array.isArray(s.refs) || s.refs.length !== 1)) p.push(`${at}: ${s.kind} 장은 AX 사례 게시물에서, refs에 발표 번호 하나`);
    // a news post: each slide says which announcements it tells (code prints their source and date)
    if (refs) {
      const r = s?.refs ?? [];
      if (!Array.isArray(r) || r.some((n) => !Number.isInteger(n) || n < 1 || n > refs)) p.push(`${at}: refs는 발표 번호(1~${refs}) 목록`);
      // the cover, the summing-up and the checks to ask (a list) tell no one announcement
      else if (!["cover", "end", "list"].includes(s.kind) && !r.length) p.push(`${at}: 어떤 발표를 말하는지 refs에 번호를 적을 것`);
    }
  });
  return p;
}
// the whole post: its cards and its caption — the word checks over both together (three hedges in the whole post),
// our-words checks slide by slide
export function checkStory(st, ctx = {}) {
  const slides = Array.isArray(st?.slides) ? st.slides : [], caption = plain(st?.caption);
  const cases = ctx.refs ? (Array.isArray(st?.cases) ? st.cases : []) : [];
  return [
    ...checkSlides(st?.slides, ctx),
    ...(ctx.refs ? checkCases(cases, slides, ctx) : []),
    ...checkWords([...slides.map(slideText), ...cases.map(caseText), caption].join("\n"), ctx),
    ...captionShape(caption),
    // a case box by box: joined, "Microsoft" + "Microsoft Sovereign Cloud" would read as one run of 24 characters
    ...copies([...slides.map((s, i) => [`${i + 1}장`, slideText(s)]), ...cases.flatMap((c, i) => ["who", "what", "where", "how", "check"].map((k) => [`사례 ${i + 1} ${k}`, plain(c?.[k])])), ["캡션", caption]], ctx),
  ];
}

// ---------- a case: an announcement read the way an IT consultant reads it (2026-10-26) ----------
// who brought what in, where (which work, which system) and how — with the IT domain and the way it went in, each
// from a fixed list (trends/series.mjs → DOMAINS, METHODS), and one question to ask of one's own project. The cards
// print it as a small table (build.mjs), the briefing as the head of the case's section (briefs.mjs), so it is short
// noun phrases, never invented: a box the announcement doesn't fill says so.
// three to seven cases, each told over two cards (a case card, then what it means): with the cover, the background,
// the common thread, the checks and the summing-up, 11 cards on a quiet day and up to 19 on a busy one — within the 20
// the app takes (2026-10-27 owner: "최소 10장 이상 … 최대 20장까지 사건 많은 날은")
export const CASE = { who: 30, what: 30, where: 30, how: 30, check: 60, count: [3, 7] };
export const NOT_SAID = "발표에 없음";
export const DOMAIN_NAMES = DOMAINS.map((d) => d.name), METHOD_NAMES = METHODS.map((m) => m.name);
export const caseText = (c) => [c?.who, c?.what, c?.where, c?.how, c?.check].filter(Boolean).join("\n");
const LABEL = { who: "누가", what: "무엇을", where: "어디에", how: "어떻게" };
export function checkCases(cases, slides = [], { refs = 0 } = {}) {
  const p = [];
  if (cases.length < CASE.count[0] || cases.length > CASE.count[1]) p.push(`cases는 사례 ${CASE.count.join("~")}건 (지금 ${cases.length})`);
  const seen = new Set();
  cases.forEach((c, i) => {
    const at = `사례 ${i + 1}`;
    if (!Number.isInteger(c?.ref) || c.ref < 1 || c.ref > refs) p.push(`${at}: ref는 발표 번호(1~${refs})`);
    else if (seen.has(c.ref)) p.push(`${at}: 발표 ${c.ref}의 사례가 두 번`);
    else seen.add(c.ref);
    for (const k of Object.keys(LABEL)) {
      const v = plain(c?.[k]).trim();
      if (!v || v.length > CASE[k]) p.push(`${at}: ${k}(${LABEL[k]})는 1~${CASE[k]}자 명사구 — 발표·원문에 없으면 "${NOT_SAID}"`);
      else if (/\n/.test(v) || /[.!]$/.test(v) || /(?:어요|에요|습니다|했다|한다)$/.test(v)) p.push(`${at}: ${k}(${LABEL[k]})는 문장이 아닌 짧은 명사구로`);
    }
    if (!DOMAIN_NAMES.includes(plain(c?.domain).trim())) p.push(`${at}: domain은 ${DOMAIN_NAMES.join("/")} 중 하나`);
    if (!METHOD_NAMES.includes(plain(c?.method).trim())) p.push(`${at}: method는 ${METHOD_NAMES.join("/")} 중 하나`);
    const q = plain(c?.check).trim();
    if (q.length < 8 || q.length > CASE.check || !/\?$/.test(q)) p.push(`${at}: check는 확인할 점 질문 하나(8~${CASE.check}자, ?로 끝남)`);
    if ([c?.who, c?.what, c?.where, c?.how].every((v) => plain(v).trim() === NOT_SAID)) p.push(`${at}: 네 칸이 모두 "${NOT_SAID}" — 이 발표는 사례로 고르지 말 것`);
  });
  // a case is told on a card of its own, and a case card tells a case; right after it comes a card of what it means
  // (kind=meaning, the same announcement) — the case is the event, the meaning card the step after it (2026-10-27)
  const told = new Map(slides.filter((s) => s?.kind === "case" && s.refs?.length === 1).map((s) => [s.refs[0], s]));
  for (const c of cases) if (Number.isInteger(c?.ref) && !told.has(c.ref)) p.push(`발표 ${c.ref}의 사례 장(kind=case)이 없음`);
  for (const r of told.keys()) if (!cases.some((c) => c?.ref === r)) p.push(`case 장(발표 ${r})의 사례가 cases에 없음`);
  slides.forEach((s, i) => {
    const r = s?.refs?.[0], next = slides[i + 1], prev = slides[i - 1];
    if (s?.kind === "case" && told.get(r) === s && !(next?.kind === "meaning" && next.refs?.length === 1 && next.refs[0] === r)) p.push(`${i + 1}장: 사례 장(발표 ${r}) 바로 다음에 그 사례의 의미 장(kind=meaning, refs [${r}])`);
    if (s?.kind === "meaning" && !(prev?.kind === "case" && prev.refs?.[0] === r)) p.push(`${i + 1}장: 의미 장(kind=meaning)은 같은 발표의 사례 장 바로 다음에만`);
  });
  return p;
}

// ---------- words a briefing explains (the glossary grows with the briefings, 2026-10-26) ----------
// 0–3 terms a reader outside IT may not know, each used in the briefing, not explained already (trends/glossary.mjs:
// the fixed list and the earlier briefings' terms), explained in a sentence or two of plain words — what the word
// means, not what this week's announcement said (no figures)
export const TERM = { max: 3, term: 30, def: [12, 140] };
export const termKey = (t) => plain(t).toLowerCase().replace(/[\s·()\-]/g, "");
export function checkTerms(terms, { text = "", known = [] } = {}, ctx = {}) {
  const p = [], list = terms ?? [];
  if (!Array.isArray(list) || list.length > TERM.max) return [`terms는 0~${TERM.max}개`];
  const body = termKey(text), had = new Set(known.map(termKey)), seen = new Set();
  list.forEach((x, i) => {
    const at = `용어 ${i + 1}`, t = plain(x?.term).trim(), d = plain(x?.def).trim(), k = termKey(t);
    if (!t || t.length > TERM.term) p.push(`${at}: term은 1~${TERM.term}자`);
    else if (!body.includes(k)) p.push(`${at}: '${t}'는 글에 나오지 않음 — 글에 쓴 말 그대로 고를 것`);
    else if (had.has(k)) p.push(`${at}: '${t}'는 이미 용어 풀이에 있음 — 다른 말을 고르거나 빼기`);
    else if (seen.has(k)) p.push(`${at}: '${t}'가 두 번`);
    seen.add(k);
    if (d.length < TERM.def[0] || d.length > TERM.def[1]) p.push(`${at}: def는 ${TERM.def.join("~")}자`);
    if (numbersIn(d).some((n) => !n.small)) p.push(`${at}: 풀이에 숫자를 넣지 말 것 — 말의 뜻만`);
    if (!/(?:요|다)\.?$/.test(d)) p.push(`${at}: 풀이는 ~요로 끝나는 문장으로`);
  });
  p.push(...checkWords(list.map((x) => `${x?.term ?? ""}\n${x?.def ?? ""}`).join("\n"), ctx), ...copies(list.map((x, i) => [`용어 ${i + 1}`, plain(x?.def)]), ctx));
  return p;
}

// the web briefing (story.json → article) and the monthly roundup: a title, a lede, 2–8 sections (the briefing aims at
// 3–8, a roundup at 2–4 flows — and the fallbacks made from slides or from a month's briefings have at least 2), a
// summary of 2–6 lines. `refs`: { max, each, what } — which numbers a section may cite, and whether every section must
// sections: a briefing of announcements has one per case (up to seven), the common thread and the IT consulting view
export const ARTICLE = { title: 80, lede: 400, heading: 60, body: 1400, sections: [2, 10], takeaways: [2, 6] };
export function checkArticle(a, { refs = { max: 0 }, ...ctx } = {}) {
  const p = [], sections = Array.isArray(a?.sections) ? a.sections : [], takeaways = Array.isArray(a?.takeaways) ? a.takeaways : [];
  if (!a?.title || plain(a.title).length > ARTICLE.title) p.push(`제목은 1~${ARTICLE.title}자`);
  if (!a?.lede || plain(a.lede).length > ARTICLE.lede) p.push(`리드는 1~${ARTICLE.lede}자`);
  if (sections.length < ARTICLE.sections[0] || sections.length > ARTICLE.sections[1]) p.push(`섹션은 ${ARTICLE.sections.join("~")}개 (지금 ${sections.length})`);
  sections.forEach((x, i) => {
    if (!x?.heading || plain(x.heading).length > ARTICLE.heading) p.push(`섹션 ${i + 1}: 소제목은 1~${ARTICLE.heading}자`);
    if (!x?.body || plain(x.body).length > ARTICLE.body) p.push(`섹션 ${i + 1}: 본문은 1~${ARTICLE.body}자`);
    const r = x?.refs ?? [];
    if (!Array.isArray(r) || r.some((n) => !Number.isInteger(n) || n < 1 || n > refs.max) || (refs.each && !r.length)) p.push(`섹션 ${i + 1}: refs에 ${refs.what ?? "발표"} 번호${refs.max ? `(1~${refs.max})` : "를 적지 말 것"}`);
  });
  if (refs.some && !sections.some((x) => x?.refs?.length)) p.push(`어떤 ${refs.what ?? "발표"}를 다루는지 섹션 refs에 번호를 적을 것`);
  if (takeaways.length < ARTICLE.takeaways[0] || takeaways.length > ARTICLE.takeaways[1]) p.push(`정리는 ${ARTICLE.takeaways.join("~")}줄`);
  const parts = [["제목", a?.title], ["리드", a?.lede], ...sections.map((x, i) => [`섹션 ${i + 1}`, `${x?.heading ?? ""}\n${x?.body ?? ""}`]), ...takeaways.map((t, i) => [`정리 ${i + 1}`, t])];
  const all = parts.map(([, t]) => plain(t)).join("\n");
  p.push(...checkWords(all, ctx), ...copies(parts.map(([w, t]) => [w, plain(t)]), ctx));
  if (/[^\S\n]{2,}/.test(all) || /[^\S\n][.,!?)]/.test(all)) p.push("두 칸 띄어쓰기나 문장부호 앞 빈칸");
  return p;
}
