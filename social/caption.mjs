// caption.mjs — writes the day's Instagram caption into social/out/<date>/post.json.
//
// Claude writes the body from the draft's insights (a big case and its context, the week's small changes, or a
// roundup — social/plan.mjs);
// this code then checks it before anything is posted:
//  • every number in the body must appear in the insights the carousel shows (no invented or rounded figures);
//  • no advice or forecast words (추천·매수·전망 …) — the site never tells anyone what to buy or what will happen.
// One retry with the problems listed; if it still fails, or no way to reach Claude is set up, a template caption
// built only from the insights is used instead.
//
// Two ways to reach Claude, tried in this order:
//  • CLAUDE_CODE_OAUTH_TOKEN — a Claude subscription token from `claude setup-token`, used through the Claude Code
//    CLI (`claude -p`), so captions cost nothing beyond the subscription (they share its usage limits);
//  • ANTHROPIC_API_KEY — an API key from console.anthropic.com, used through the SDK and billed per use. The source line, link, disclaimer and hashtags are added by code, never
// by the model.
//
// When story.mjs wrote a storyline (social/out/<date>/story.json), its caption is used — checked again here against
// the facts it was written from. Otherwise the caption is written from the cards, as below.
//
// Usage: node social/caption.mjs   (after social/render.mjs)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { slidesFor } from "./pick.mjs";
import { ask, pickRoute, ClaudeUnavailable, BANNED, META, numbersIn } from "./claude.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const I = JSON.parse(fs.readFileSync(path.join(ROOT, "trends", "data", "insights.json"), "utf8"));
const planFile = path.join(ROOT, "social", "plan.json");
const plan = fs.existsSync(planFile) ? JSON.parse(fs.readFileSync(planFile, "utf8")) : { mode: "roundup" };
const date = I.built_at, slot = plan.slot ?? date, dir = path.join(ROOT, "social", "out", slot);
if (plan.post === false) { console.log(`social/plan.json says no draft today (${plan.why}) — no caption`); process.exit(0); }
// the insights carry line-break characters for the cards (no-break spaces and hyphens, zero-width breaks);
// the caption gets plain text so a model id can be copied and searched
const plain = (t) => String(t).replace(/\u200b/g, "").replace(/\u2011/g, "-").replace(/\u00a0/g, " ");
const slides = slidesFor(I, plan).map((x) => ({ ...x, big: plain(x.big), bl: plain(x.bl), title: plain(x.title), easy: plain(x.easy ?? ""), body: plain(x.body), src: plain(x.src) }));
const storyFile = path.join(dir, "story.json"), story = fs.existsSync(storyFile) ? JSON.parse(fs.readFileSync(storyFile, "utf8")) : null;

// ---------- the checks ----------
const allowed = new Set([...slides.flatMap((x) => [x.big, x.bl, x.title, x.easy ?? "", x.body, x.src]), ...(story ? (I.facts ?? []).map((f) => plain(f.text)) : []),
  ...(plan.news ?? []).flatMap((n) => [n.title, n.summary, n.date]), date].flatMap(numbersIn));
if (story) for (let n = 1; n <= 10; n++) allowed.add(String(n)); // as story.mjs allows: counts and list numbering
export function check(body) {
  const problems = [];
  const bad = [...new Set(numbersIn(body).filter((n) => !allowed.has(n)))];
  if (bad.length) problems.push(`데이터에 없는 숫자: ${bad.join(", ")}`);
  const words = [...new Set(body.match(BANNED) ?? [])];
  if (words.length) problems.push(`쓰면 안 되는 말: ${words.join(", ")}`);
  if (body.length > 1200) problems.push(`너무 김: ${body.length}자 (1200자 이하)`);
  if (/#|https?:\/\//.test(body)) problems.push("해시태그·링크는 코드가 붙이니 본문에 쓰지 말 것");
  // whatever comes back is posted as is, so a note to us ("--- 둘째 줄은 제가 덧붙였어요") must not ride along
  if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/m.test(body) || META.test(body)) problems.push("캡션이 아닌 메모·구분선이 섞임: 게시될 본문만 쓸 것");
  return problems;
}

// ---------- Claude ----------
const SYSTEM = `너는 한국어 데이터 연구 사이트의 인스타그램 담당이다. AI 기술 신호(개발자 다운로드, 논문 키워드, 오픈 모델, 빅테크 설비투자)를 매일 재고, 평소와 크게 다른 일(빅 케이스)이 생길 때 카드 뉴스로 올린다. 작은 변화는 일주일치를 모아 올리고, 아무 일도 오래 없으면 요즘 숫자를 묶어 올린다.
캡션 본문만 쓴다. 규칙:
- 빅 케이스면 첫 줄은 그 일을 숫자 하나로 말하는 짧은 한 문장, 이어서 왜 눈에 띄는지(평소·대조군·1년 전과 비교한 숫자). 작은 변화 모음이면 첫 줄은 "지난 한 주 작게 바뀐 것"을 한 문장으로, 이어서 카드마다 한두 줄. 요즘 숫자 묶음이면 첫 줄은 가장 눈에 띄는 숫자 하나로 시작.
- 이어서 카드 순서대로 한두 줄씩, 전체 6~10줄. 줄마다 하나의 사실.
- 숫자는 주어진 데이터에 적힌 그대로만 쓴다. 반올림·환산·새 계산 금지. 데이터에 없는 숫자(연도·순위 포함)를 만들지 않는다.
- 일어난 일만 말한다. 앞으로 어떻게 될지, 무엇을 사거나 팔지, 어떤 기술을 써야 할지 말하지 않는다. "추천", "전망", "예상", "매수", "급등" 같은 말을 쓰지 않는다.
- 다운로드는 사용자 수가 아니라 설치 횟수라는 점을 흐리지 않는다.
- 코드나 논문을 모르는 사람도 읽게 쓴다. 카드의 "쉽게말하면" 문장을 바탕으로, npm·PyPI·arXiv·Hugging Face·대조군·%p 같은 말은 처음 나올 때 괄호로 짧게 풀어 준다(예: npm(자바스크립트 개발자들이 코드 부품을 내려받는 곳)). 존댓말(~요)로.
- 해시태그, 링크, 출처 줄, 면책 문구는 쓰지 않는다(코드가 붙인다). 이모지와 줄 앞 번호는 쓰지 않는다.
- 카드에 없는 사실(회사·제품 소개, 배경 설명, 이유 추측)을 덧붙이지 않는다. 용어 풀이만 예외.
- 담백하고 정확한 말투. 과장 금지.
- 캡션 본문만 출력한다. 구분선(---), 설명, 메모, "이렇게 썼어요" 같은 덧말을 붙이지 않는다. 출력한 글이 그대로 게시된다.`;

async function fromClaude(route) {
  const data = slides.map((x, i) => ({ card: i + 1, 분야: x.k, 큰숫자: x.big, 큰숫자설명: x.bl, 제목: x.title, 쉽게말하면: x.easy, 내용: x.body, 출처: x.src }));
  const why = plan.mode === "event" ? `빅 케이스(${plan.event.kind}): 1번 카드. 나머지 카드는 같은 주제의 맥락.`
    : plan.mode === "race" ? `누가 앞서나: AI 분야마다 경쟁하는 도구들 중 개발자가 실제로 가장 많이 내려받는 1위와 그 변화. 카드마다 분야 이름과 1위, 크게 움직인 곳을 한두 줄로. 다운로드 몫은 그 분야 안에서의 비율이고 사용자 수가 아니라는 점을 한 번 말할 것.`
    : plan.mode === "digest" ? `작은 변화 모음: 지난 한 주 동안 잡힌 작은 변화 ${slides.length}가지. 하나하나는 크지 않으니 크게 부풀리지 말 것.`
    : "묶음: 빅 케이스 없이 요즘 숫자를 모은 게시물.";
  const messages = [{ role: "user", content: `${date} 게시물 — ${why}\n카드 데이터:\n${JSON.stringify(data, null, 1)}\n\n캡션 본문을 써 줘.` }];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await ask(route, SYSTEM, messages);
    if (res.refusal) return { body: null, why: `refusal (${res.refusal})` };
    const problems = check(res.text);
    if (!problems.length) return { body: res.text, model: res.model, attempts: attempt };
    console.log(`caption attempt ${attempt} rejected: ${problems.join(" / ")}`);
    messages.push({ role: "assistant", content: res.text }, { role: "user", content: `다음 문제를 고쳐서 본문 전체를 다시 써 줘:\n- ${problems.join("\n- ")}` });
  }
  return { body: null, why: "checks failed twice" };
}

// ---------- template fallback: only the insights' own sentences ----------
// (no line numbers: a "2." that is not in the data would fail the number check)
const template = () => plan.mode === "news"
  ? ["이번 주 AX 사건 — 회사·정부의 공식 발표만", "", ...(story?.sources ?? []).map((x) => `· ${x.source}: ${plain(x.title)}`)].join("\n")
  : plan.mode === "race"
  ? ["AI 분야별로 누가 앞서나 — 개발자가 실제로 내려받는 숫자로", "", ...slides.map((x) => `· ${x.title} (${x.big})`)].join("\n")
  : plan.mode === "digest"
  ? [`지난 한 주 작게 바뀐 것 ${slides.length}가지`, "", ...slides.map((x) => `· ${x.title} (${x.big})`)].join("\n")
  : plan.mode === "event"
  ? [slides[0].title, slides[0].body, "", ...slides.slice(1).map((x) => `· ${x.title} (${x.big}, ${x.bl})`)].join("\n")
  : [`${slides[0].big} — ${slides[0].title}`, "", ...slides.map((x) => `· ${x.title} (${x.big}, ${x.bl})`)].join("\n");

let result = { body: null, why: "no CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY" };
const route = pickRoute();
if (story?.caption && !check(plain(story.caption)).length) result = { body: plain(story.caption), model: story.model, why: story.note, via: story.via, from: story.source };
else if (route && plan.mode !== "news") { // a news post's caption comes with its story (written from the announcements)
  try { result = { ...(await fromClaude(route)), via: route }; } catch (e) {
    // a Claude that can't be reached falls back to the template caption; any other error is a bug and stops the job
    if (e instanceof ClaudeUnavailable) result = { body: null, why: e.message };
    else throw e;
  }
}
const source = result.body ? (result.from === "cards" ? "template" : "claude") : "template";
const body = result.body ?? template();
const problems = check(body);
if (problems.length) throw new Error(`caption failed its own checks (${source}): ${problems.join(" / ")}`);
if (!result.body) console.log(`template caption used — ${result.why}`);

// the footer names the sources this post actually used: the announcements for a news post, the Ramp AI Index (its
// licence asks for the citation) for an AX post, the download and paper counts otherwise
const isAX = plan.mode === "event" && plan.event?.topic === "ax";
const usesDownloads = !isAX && plan.mode !== "news";
const sourcesLine = plan.mode === "news"
  ? `출처(공식 발표): ${[...new Set((story?.sources ?? []).map((x) => x.source))].join(" · ") || "각 회사·기관 뉴스룸"}\n원문 링크는 data.pivoxquant.com 에서`
  : isAX ? "출처: Ramp AI Index (Ramp Economics Lab) · FRED, 세인트루이스 연방준비은행 — 미국 기업 결제 데이터"
  : "출처: npm · PyPI(CC BY 4.0) · arXiv(CC0) · Hugging Face · SEC 공시 — 매일 같은 방식으로 계산";
const tags = plan.mode === "news" ? "#AX #AI전환 #AI뉴스 #기업AI #IT컨설팅 #디지털전환 #인공지능"
  : isAX ? "#AX #AI전환 #기업AI #IT컨설팅 #디지털전환 #인공지능 #AI트렌드"
  : "#AX #AI #인공지능 #개발자 #기술트렌드 #LLM #IT컨설팅";
const caption = [body, "", sourcesLine, ...(plan.mode === "news" ? [] : ["자세히: data.pivoxquant.com"]), ...(usesDownloads ? ["다운로드 수는 사용자 수가 아니라 설치 횟수예요."] : []), "", tags].join("\n");

const images = fs.readdirSync(dir).filter((f) => /^\d+\.png$/.test(f)).sort();
if (images.length < 3) throw new Error(`social/out/${slot}: ${images.length} slides — run social/render.mjs first`);
const postFile = path.join(dir, "post.json");
const prev = fs.existsSync(postFile) ? JSON.parse(fs.readFileSync(postFile, "utf8")) : {};
if (prev.published) { console.log(`social/out/${slot} was already published (${prev.published.permalink}) — caption left as is`); process.exit(0); }
const post = { date, ...(slot !== date ? { slot } : {}), images, image_base: `https://data.pivoxquant.com/social/out/${slot}/`, caption, caption_source: source, caption_via: source === "claude" ? result.via : null, story: story ? { format: story.format, format_name: story.format_name, source: story.source, slides: story.slides.length } : null, caption_model: result.model ?? null, caption_note: result.why ?? null, mode: plan.mode ?? "roundup", event: plan.event ? { key: plan.event.key, kind: plan.event.kind, headline: plain(plan.event.headline) } : null, insights: slides.map((x) => x.id), checked: { numbers_allowed: allowed.size, problems: [] } };
fs.writeFileSync(postFile, JSON.stringify(post, null, 1) + "\n");
console.log(`wrote social/out/${slot}/post.json (${source} caption, ${caption.length} chars, ${images.length} images)`);
