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
import { NEWS, AX } from "../trends/series.mjs";

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
const KINDS = new Set(["cover", "text", "number", "list", "quiz", "answer", "end"]);
// at most three names in a row joined by "·" ("NVIDIA · OpenAI · SAP · Salesforce" → "NVIDIA 등 4곳"): a name is an
// official source or AX vendor we know, or a capitalised Latin word (Uber, Braze); IT words in capitals (ERP·CRM·HR)
// and places (유럽·북유럽·아프리카) are not names
const ORGS = [...new Set([...NEWS.sources.map((x) => x.name), ...AX.series.filter((x) => x.group === "vendor").map((x) => x.name)])];
const named = (seg) => ORGS.some((o) => seg.includes(o)) || /(?<![A-Za-z])[A-Z][a-z][A-Za-z0-9]*/.test(seg);
const nameRun = (line) => plain(line).split("·").filter(named).length;
export function checkSlides(slides, { refs = 0 } = {}) {
  const p = [];
  if (!Array.isArray(slides) || slides.length < 4 || slides.length > 10) return [`장 수는 4~10장 (지금 ${Array.isArray(slides) ? slides.length : 0})`];
  if (slides[0]?.kind !== "cover") p.push("첫 장은 kind=cover");
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
    // a news post: each slide says which announcements it tells (code prints their source and date)
    if (refs) {
      const r = s?.refs ?? [];
      if (!Array.isArray(r) || r.some((n) => !Number.isInteger(n) || n < 1 || n > refs)) p.push(`${at}: refs는 발표 번호(1~${refs}) 목록`);
      else if (!["cover", "end"].includes(s.kind) && !r.length) p.push(`${at}: 어떤 발표를 말하는지 refs에 번호를 적을 것`);
    }
  });
  return p;
}
// the whole post: its cards and its caption — the word checks over both together (three hedges in the whole post),
// our-words checks slide by slide
export function checkStory(st, ctx = {}) {
  const slides = Array.isArray(st?.slides) ? st.slides : [], caption = plain(st?.caption);
  return [
    ...checkSlides(st?.slides, ctx),
    ...checkWords([...slides.map(slideText), caption].join("\n"), ctx),
    ...captionShape(caption),
    ...copies([...slides.map((s, i) => [`${i + 1}장`, slideText(s)]), ["캡션", caption]], ctx),
  ];
}

// the web briefing (story.json → article) and the monthly roundup: a title, a lede, 2–8 sections (the briefing aims at
// 3–8, a roundup at 2–4 flows — and the fallbacks made from slides or from a month's briefings have at least 2), a
// summary of 2–6 lines. `refs`: { max, each, what } — which numbers a section may cite, and whether every section must
export const ARTICLE = { title: 80, lede: 400, heading: 60, body: 1400, sections: [2, 8], takeaways: [2, 6] };
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
