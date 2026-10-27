// caption.mjs — writes the day's Instagram caption into social/out/<slot>/post.json.
//
// The body is the story's caption (story.mjs wrote it with the slides, and checked it); without a story (e.g.
// `npm run social`, which skips story.mjs) Claude writes it from the cards, and without Claude a template does. Either
// way this code checks it again before anything is posted, with the same checks as the cards (claude.mjs →
// checkCaption): every number must appear in what the carousel was made from, no advice or forecast words, no stock
// phrases, no notes to us, our words rather than an announcement's, at most CAPTION_MAX characters. A body that still
// fails means no draft today (util.mjs → dropDraft) rather than a caption nobody checked.
// The link to the briefing, the source line, the downloads note and the hashtags are added by code, never by the model.
//
// Usage: node social/caption.mjs   (after social/render.mjs)
import fs from "node:fs";
import path from "node:path";
import { slidesFor } from "./pick.mjs";
import { ask, pickRoute, ClaudeUnavailable, STYLE, plain, allowNumbers, copyChecker, checkCaption } from "./claude.mjs";
import { ROOT, OUT, read, write, isMain, dropDraft } from "./util.mjs";
import { parseSlot } from "./slot.mjs";

// for a post without a story only (the story's caption is written with the slides, story.mjs)
const SYSTEM = `너는 IT 컨설팅 리서치 팀의 AX(기업의 AI 전환) 에디터다. 'AX 트렌드 레이더'의 인스타그램 캡션 본문을 쓴다.
독자는 IT 컨설턴트, 기업의 IT·DX 담당자, AI 도입을 검토하는 실무자다. 카드에 담긴 숫자(미국 기업의 AI 결제 도입률 — Ramp AI Index, 회사·정부의 공식 AX 발표 수)를 짧게 정리한다.
규칙:
${STYLE}
- 첫 줄은 카드가 말하는 가장 중요한 사실 하나를 숫자와 함께 한 문장으로. 이어서 카드 순서대로 한두 줄씩, 전체 4~8줄. 줄마다 하나의 사실.
- 숫자는 주어진 카드 데이터에 적힌 그대로만 쓴다(+·− 부호까지). 반올림·환산·새 계산 금지. 데이터에 없는 숫자(연도·순위 포함)를 만들지 않는다.
- 일어난 일만 말한다. 앞으로 어떻게 될지("~할 거예요", "~할 것으로 보여요"), 무엇을 사거나 팔지, 어떤 기술을 써야 할지 말하지 않는다. "추천", "전망", "예상", "매수", "급등" 같은 말을 쓰지 않는다.
- Ramp AI Index는 미국 기업, 유료 결제 기준이라는 점을 흐리지 않는다. 전문 용어(%p 등)는 처음 나올 때 괄호로 짧게 풀어 준다. 쉬운 존댓말(~요).
- 해시태그, 링크, 출처 줄, 면책 문구는 쓰지 않는다(코드가 붙인다). 이모지와 줄 앞 번호는 쓰지 않는다.
- 카드에 없는 사실(회사·제품 소개, 배경 설명, 이유 추측)을 덧붙이지 않는다. 용어 풀이만 예외.
- 캡션 본문만 출력한다. 구분선(---), 설명, 메모, "이렇게 썼어요" 같은 덧말을 붙이지 않는다. 출력한 글이 그대로 게시된다.`;

async function main() {
  const I = read(path.join(ROOT, "trends", "data", "insights.json"));
  const plan = read(path.join(ROOT, "social", "plan.json"), { mode: "roundup" });
  if (plan.post === false) { console.log(`social/plan.json says no draft today (${plan.why}) — no caption`); return; }
  const slot = plan.slot ?? I.built_at, date = parseSlot(slot)?.date ?? I.built_at, dir = path.join(OUT, slot);
  const postFile = path.join(dir, "post.json"), prev = read(postFile, {});
  if (prev.published) { console.log(`social/out/${slot} was already published (${prev.published.permalink}) — caption left as is`); return; }
  const slides = slidesFor(I, plan).map((x) => ({ ...x, big: plain(x.big), bl: plain(x.bl), title: plain(x.title), easy: plain(x.easy ?? ""), body: plain(x.body), src: plain(x.src) }));
  const story = read(path.join(dir, "story.json"));
  const news = plan.mode === "news" ? plan.news ?? [] : [];
  // what the caption may cite: what the carousel was made from — the cards, the facts the story was written from, the
  // announcements — as story.mjs allows it
  const ctx = {
    // story.original_numbers: figures the story took from an announcement's own page (story.mjs read it; the page itself
    // is never stored), already checked against it there
    allowed: allowNumbers([slides.flatMap((x) => [x.big, x.bl, x.title, x.easy, x.body, x.src]), story ? (I.facts ?? []).map((f) => f.text) : [], news.map((n) => `${n.title} ${n.summary}`), story?.original_numbers ?? []], { dates: [date, I.built_at, ...news.map((n) => n.date)] }),
    copied: copyChecker(news.map((n) => `${n.title} ${n.summary}`)),
  };
  const check = (body) => checkCaption(body, ctx);

  // ---------- Claude (no story) ----------
  async function fromClaude(route) {
    const data = slides.map((x, i) => ({ card: i + 1, 분야: x.k, 큰숫자: x.big, 큰숫자설명: x.bl, 제목: x.title, 쉽게말하면: x.easy, 내용: x.body, 출처: x.src }));
    const why = plan.mode === "event" ? `빅 케이스(${plan.event.kind}): 1번 카드. 나머지 카드는 같은 주제의 맥락.`
      : plan.mode === "digest" ? `작은 변화 모음: 지난 한 주 동안 잡힌 작은 변화 ${slides.length}가지. 하나하나는 크지 않으니 크게 부풀리지 말 것.`
      : "묶음: 빅 케이스 없이 요즘 AX 숫자를 모은 게시물.";
    const messages = [{ role: "user", content: `${date} 게시물 — ${why}\n카드 데이터:\n${JSON.stringify(data, null, 1)}\n\n캡션 본문을 써 줘.` }];
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await ask(route, SYSTEM, messages);
      if (res.refusal) return { body: null, why: `refusal (${res.refusal})` };
      const problems = check(res.text);
      if (!problems.length) return { body: res.text, attempts: attempt };
      console.log(`caption attempt ${attempt} rejected: ${problems.join(" / ")}`);
      messages.push({ role: "assistant", content: res.text }, { role: "user", content: `다음 문제를 고쳐서 본문 전체를 다시 써 줘:\n- ${problems.join("\n- ")}` });
    }
    return { body: null, why: "checks failed twice" };
  }
  // ---------- template (no story, no Claude): only the cards' own sentences ----------
  // (no line numbers: a "2." that is not in the data would fail the number check)
  const template = () => !slides.length ? ""
    : plan.mode === "digest" ? [`지난 한 주 작게 바뀐 것 ${slides.length}가지`, "", ...slides.map((x) => `· ${x.title} (${x.big})`)].join("\n")
    : plan.mode === "event" ? [slides[0].title, slides[0].body, "", ...slides.slice(1).map((x) => `· ${x.title} (${x.big}, ${x.bl})`)].join("\n")
    : [`${slides[0].big} — ${slides[0].title}`, "", ...slides.map((x) => `· ${x.title} (${x.big}, ${x.bl})`)].join("\n");

  let result;
  if (story) {
    // the story's caption passed story.mjs's checks with the slides; checked again on its own here
    const body = plain(story.caption), problems = check(body);
    if (problems.length) return dropDraft(plan, `the story's caption failed the caption checks: ${problems.join(" / ")}`);
    result = { body, why: story.note, via: story.via, from: story.source };
  } else {
    result = { body: null, why: "no CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY" };
    const route = pickRoute();
    if (route) {
      try { result = { ...(await fromClaude(route)), via: route }; } catch (e) {
        // a Claude that can't be reached falls back to the template caption; any other error is a bug and stops the job
        if (e instanceof ClaudeUnavailable) result = { body: null, why: e.message };
        else throw e;
      }
    }
    if (!result.body) {
      const body = template(), problems = check(body);
      if (problems.length) return dropDraft(plan, `no caption from Claude (${result.why}), and the template caption failed the checks: ${problems.join(" / ")}`);
      console.log(`template caption used — ${result.why}`);
      result = { ...result, body, from: "template" };
    }
  }
  const source = result.from === "template" || result.from === "cards" ? "template" : "claude";

  // the footer names the sources this post actually used: the announcements for a news post, the Ramp AI Index (its
  // licence asks for the citation) for an AX post, and the official announcements behind the IT-domain cards
  const usesDomains = slides.some((x) => String(x.id).startsWith("dom-"));
  const sourcesLine = plan.mode === "news"
    ? `출처(공식 발표): ${[...new Set((story?.sources ?? []).map((x) => x.source))].join(" · ") || "각 회사·기관 뉴스룸"} — 원문 링크는 리서치 글에`
    : `출처: Ramp AI Index (Ramp Economics Lab) · FRED, 세인트루이스 연방준비은행 — 미국 기업 결제 데이터${usesDomains ? " · 회사·정부 공식 발표" : ""}`;
  const tags = plan.mode === "news" ? "#AX #AI전환 #AI뉴스 #기업AI #IT컨설팅 #디지털전환 #인공지능" : "#AX #AI전환 #기업AI #IT컨설팅 #디지털전환 #인공지능 #AI트렌드";
  // the long version of this post is its briefing page (social/briefs.mjs), at the post's folder name
  const caption = [result.body, "", `자세한 풀이: data.pivoxquant.com/briefs/${slot}`, sourcesLine, "", tags].join("\n");

  const images = fs.readdirSync(dir).filter((f) => /^\d+\.png$/.test(f)).sort();
  if (images.length < 3) throw new Error(`social/out/${slot}: ${images.length} slides — run social/render.mjs first`);
  const post = { date, ...(slot !== date ? { slot } : {}), images, image_base: `https://data.pivoxquant.com/social/out/${slot}/`, caption, caption_source: source, caption_via: source === "claude" ? result.via : null, story: story ? { format: story.format, format_name: story.format_name, source: story.source, slides: story.slides.length } : null, caption_note: result.why ?? null, mode: plan.mode ?? "roundup", event: plan.event ? { key: plan.event.key, kind: plan.event.kind, headline: plain(plan.event.headline) } : null, insights: slides.map((x) => x.id), checked: { numbers_allowed: ctx.allowed.size, problems: [] } };
  write(postFile, post);
  console.log(`wrote social/out/${slot}/post.json (${source} caption, ${caption.length} chars, ${images.length} images)`);
}
if (isMain(import.meta.url)) await main();
