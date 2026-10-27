// pages.mjs — the pages around signing in (2026-10-26), written whole by site.mjs → writePages with the site's frame:
// /login (address → the three consents → check your inbox), /auth/callback (where the e-mail link lands), /saved (the
// saved briefings and, once signed in, the account), /privacy and /terms (trends/legal.mjs). The scripts that bring
// them to life are login.js, callback.js and account.js; what a page shows before they run is already the right first
// screen. Without AUTH there is no signing in: /login says so and /callback is not needed (it is still written, so an
// old link lands somewhere that explains).
import { POLICY_VERSION, privacyBody, termsBody, consentHtml, transfers } from "./legal.mjs";

const svg = (d, cls = "") => `<svg class="ic${cls ? ` ${cls}` : ""}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
export const ICON = {
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  bookmark: "M7 4h10v16l-5-3.5L7 20z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0",
};

const guide = (t) => `<p class="acc-guide"><b>지금 할 일</b><span>${t}</span></p>`;

function login(auth) {
  if (!auth.on) return `<div class="acc"><section class="acc-step">
  <h1>로그인</h1>
  <p class="acc-lede">아직 로그인을 열지 않았어요. 로그인 없이 모든 글을 볼 수 있어요.</p>
  <a class="btn block lg" href="/">둘러보기</a>
</section></div>`;
  const supabase = transfers(auth).find((t) => t.to.startsWith("Supabase"));
  const mail = auth.mail === "brevo";
  return `<div class="acc" id="login">
<section class="acc-step" data-s="email">
  ${guide("메일 주소를 적으세요. 비밀번호 대신 로그인 링크를 보내요.")}
  <h1>로그인</h1>
  <p class="acc-lede">처음 쓰는 주소면 이 메일로 계정이 만들어져요.</p>
  <form id="f-email" novalidate>
    <label class="acc-label" for="email">메일 주소</label>
    <div class="acc-in">${svg(ICON.mail)}<input id="email" type="email" autocomplete="email" inputmode="email" placeholder="name@company.co.kr" required aria-describedby="email-err" /></div>
    <p class="acc-err" id="email-err" role="alert" hidden>메일 주소 형식이 아니에요. 다시 확인해 주세요.</p>
    <button class="btn block lg" type="submit">다음</button>
  </form>
  <div class="acc-or"><span>또는</span></div>
  <a class="btn ghost block lg" href="/" data-browse>로그인 없이 둘러보기</a>
  <p class="acc-fine center">로그인하지 않아도 모든 글을 볼 수 있어요.</p>
  <details class="acc-faq"><summary>로그인하면 무엇이 달라지나요</summary>
    <table class="acc-cmp"><thead><tr><th></th><th>로그인 없이</th><th>로그인</th></tr></thead><tbody>
      <tr><td>리서치 · 사례 · 용어 풀이 읽기</td><td>${svg(ICON.check, "yes")}<span class="sr">됨</span></td><td>${svg(ICON.check, "yes")}<span class="sr">됨</span></td></tr>
      <tr><td>새 리서치 알림</td><td>${svg(ICON.check, "yes")}<span class="sr">됨</span></td><td>${svg(ICON.check, "yes")}<span class="sr">됨</span></td></tr>
      <tr><td>리서치 저장</td><td>이 기기만</td><td>어느 기기에서나</td></tr>
    </tbody></table>
  </details>
  <details class="acc-faq"><summary>로그인하면 저장되는 것</summary><ul>
    <li><b>메일 주소</b> — 로그인 서비스(Supabase, ${supabase.country})에 저장돼요.</li>
    <li><b>저장한 리서치</b> — 주소 · 제목 · 날짜만. 어느 기기에서 로그인해도 같은 목록을 봐요.</li>
    ${mail ? "<li><b>로그인 메일</b> — Brevo(프랑스)를 통해 보내요.</li>" : ""}
    <li><b>탈퇴</b> — 로그인한 뒤 <a href="/saved#account">저장한 리서치</a> 화면의 계정에서 바로 해요. 자세한 내용은 <a href="/privacy">개인정보 처리방침</a>.</li>
  </ul></details>
</section>
<section class="acc-step" data-s="consent" hidden>
  ${guide("필수 항목 세 가지에 동의하면 바로 로그인 링크를 보내요.")}
  <h1 data-t>시작하기 전에 확인해 주세요</h1>
  <p class="acc-lede" data-d>링크를 보낼 주소 · <b data-email></b></p>
  ${consentHtml(auth)}
  <p class="acc-fine" data-need>필수 항목 세 가지에 모두 동의해야 링크를 보낼 수 있어요.</p>
  <p class="acc-err" id="send-err" role="alert" hidden></p>
  <div class="acc-row"><button class="btn ghost lg" type="button" data-back>이전</button><button class="btn lg grow" type="button" id="send" disabled>동의하고 로그인 링크 받기</button></div>
</section>
<section class="acc-step" data-s="mail" role="status" hidden>
  <span class="acc-ico">${svg(ICON.mail)}</span>
  <h1>메일의 코드를 넣어 주세요</h1>
  <p class="acc-lede">로그인 메일을 보냈어요. 메일에 있는 숫자 코드를 여기에 넣으면 이 화면에서 바로 로그인돼요 — 휴대폰 앱에서도요.</p>
  <form class="acc-form" id="f-code" novalidate>
    <label class="acc-label" for="code">로그인 코드</label>
    <div class="acc-in"><input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="10" placeholder="숫자 코드" required style="font-size:22px;letter-spacing:.18em" /></div>
    <p class="acc-err" id="code-err" role="alert" hidden></p>
    <button class="btn lg" type="submit" id="code-go" style="width:100%">로그인</button>
  </form>
  <p class="acc-fine">메일의 버튼을 눌러도 돼요. 그러면 그 메일 앱이 연 창에서 로그인돼요.</p>
  <div class="acc-card"><span>보낸 주소 <b data-email></b></span><button class="btn ghost sm" type="button" data-change>메일 바꾸기</button></div>
  <p class="acc-fine">메일이 안 보이면 스팸함을 확인하세요. <button class="acc-link" type="button" id="resend">다시 보내기</button></p>
  <p class="acc-fine" id="resent" hidden>다시 보냈어요. 가장 최근 메일의 코드를 넣어 주세요 — 앞 메일의 코드와 링크는 쓰지 못할 수 있어요.</p>
  <p class="acc-err" id="mail-err" role="alert" hidden></p>
</section>
<section class="acc-step" data-s="done" role="status" hidden>
  <span class="acc-ico ok">${svg(ICON.check)}</span>
  <h1>로그인했어요</h1>
  <p class="acc-lede">메일에서 연 창에서 이어져요. 이 창은 닫아도 돼요.</p>
  <div class="acc-card"><span>로그인한 계정 <b data-user></b></span></div>
  <a class="btn ghost lg" href="/" data-next>이 창에서 계속</a>
</section>
</div>
<script type="module" src="/login.js"></script>`;
}

function callback(auth) {
  if (!auth.on) return `<div class="acc"><section class="acc-step">
  <h1>로그인</h1>
  <p class="acc-lede">아직 로그인을 열지 않았어요. 로그인 없이 모든 글을 볼 수 있어요.</p>
  <a class="btn block lg" href="/">둘러보기</a>
</section></div>`;
  return `<div class="acc" id="cb">
<section class="acc-step" data-s="wait" role="status">
  <span class="acc-ico">${svg(ICON.mail)}</span>
  <h1>로그인하는 중이에요</h1>
  <p class="acc-lede">링크를 확인하고 있어요. 잠깐만 기다려 주세요.</p>
</section>
<section class="acc-step" data-s="consent" hidden>
  ${guide("이 기기에서는 동의를 한 번 더 받아요. 필수 항목 세 가지에 동의하면 이어져요.")}
  <h1 data-t>시작하기 전에 확인해 주세요</h1>
  <p class="acc-lede" data-d><b data-user></b> 계정으로 로그인했어요. 계속하려면 필수 항목에 동의해 주세요.</p>
  ${consentHtml(auth)}
  <p class="acc-fine" data-need>필수 항목 세 가지에 모두 동의해야 이어 갈 수 있어요. 동의하지 않으면 로그아웃해요.</p>
  <p class="acc-err" id="cs-err" role="alert" hidden></p>
  <div class="acc-row"><button class="btn ghost lg" type="button" data-out>로그아웃</button><button class="btn lg grow" type="button" id="agree" disabled>동의하고 계속</button></div>
</section>
<section class="acc-step" data-s="done" role="status" hidden>
  <span class="acc-ico ok">${svg(ICON.check)}</span>
  <h1>로그인했어요</h1>
  <p class="acc-lede"><b data-user></b> 계정이에요. 저장한 리서치를 어느 기기에서나 이어 봐요.</p>
  <a class="btn block lg" href="/" data-next>계속하기</a>
  <p class="acc-fine">내 계정이 아니면 <button class="acc-link" type="button" data-out>로그아웃</button>하세요. 로그인을 요청했던 창은 닫아도 돼요.</p>
</section>
<section class="acc-step" data-s="failed" role="alert" hidden>
  <h1 data-t>로그인하지 못했어요</h1>
  <p class="acc-lede" data-d>링크가 맞지 않아요. 새 링크를 받아 주세요.</p>
  <a class="btn block lg" href="/login">링크 다시 받기</a>
  <a class="btn ghost block lg" href="/">둘러보기</a>
</section>
</div>
<script type="module" src="/callback.js"></script>`;
}

const saved = (auth) => `<div class="sv" id="saved-root">
<header class="sv-head">
  <div class="kicker"><b>내 리서치</b>${auth.on ? "이 기기 · 로그인하면 어느 기기에서나" : "이 기기의 브라우저에 저장"}</div>
  <h1 class="page">저장한 리서치</h1>
  <p class="lede" id="sv-note">${auth.on ? "리서치 글에서 저장을 누르면 여기에 모여요. 로그인하면 다른 기기에서도 같은 목록을 봐요." : "리서치 글에서 저장을 누르면 여기에 모여요. 이 기기의 브라우저에만 저장돼요."}</p>
</header>
<ul class="list sv-list" id="sv-list"></ul>
<div class="sv-empty" id="sv-empty" hidden>
  <span class="acc-ico">${svg(ICON.bookmark)}</span>
  <p><b>아직 저장한 리서치가 없어요.</b></p>
  <p>리서치 제목 아래 <b>저장</b>을 누르면 여기에 모여요.</p>
  <a class="btn ghost" href="/briefs">리서치 보기</a>
</div>
${auth.on ? `<section class="sv-acct" id="account" aria-labelledby="h-acct">
  <h2 id="h-acct">계정</h2>
  <div data-in hidden>
    <p class="sv-who">${svg(ICON.user)}<span><b data-user></b><small>로그인한 계정 · 저장한 리서치가 어느 기기에서나 이어져요</small></span></p>
    <div class="acc-row"><button class="btn ghost" type="button" data-out>로그아웃</button></div>
    <details class="sv-del"><summary>탈퇴</summary>
      <p>탈퇴하면 계정과 저장한 목록, 동의 기록을 지체 없이 지워요. 되돌릴 수 없어요.</p>
      <label class="acc-label" for="del-email">확인을 위해 메일 주소를 적어 주세요</label>
      <div class="acc-in"><input id="del-email" type="email" autocomplete="off" inputmode="email" /></div>
      <p class="acc-err" id="del-err" role="alert" hidden></p>
      <button class="btn danger" type="button" id="del" disabled>탈퇴하기</button>
    </details>
  </div>
  <div data-out-only hidden>
    <p class="sv-who">${svg(ICON.user)}<span><b>로그인하지 않았어요</b><small>로그인하면 이 목록을 다른 기기에서도 이어 봐요</small></span></p>
    <a class="btn" href="/login?next=/saved">로그인</a>
  </div>
</section>` : ""}
</div>`;

// /upload (2026-10-27): the operator's page for a long story — more cards than the 10 the Instagram API takes, so the
// owner posts it from the app. Only for an operator (owner: "운영자니깐 … 로그인했을 때만 폰으로 업로드 가능하게"): signed in,
// and public.pd_is_operator() says yes (supabase/schema.sql → pivoxdata.operators — the address is never in this public
// code). upload.js checks first and only then reads the post. The cards and the caption are public files all the same
// (Instagram fetches the images by URL): this keeps the tool to the operator, not the cards secret.
const UPLOAD_CSS = `<style>
  .up{max-width:720px;margin:0 auto;padding:24px 0 56px}
  .up .k{font-size:13.5px;font-weight:600;color:var(--bronze-hi);margin:0}
  .up h1{font-size:clamp(24px,5vw,32px);letter-spacing:-.03em;line-height:1.2;margin:8px 0 10px}
  .up .lead{color:var(--ink-2);margin:0 0 20px}
  .up ol.steps{margin:0 0 24px;padding-left:20px;color:var(--ink-2);line-height:1.7}
  .up .acts{display:grid;gap:10px;margin:0 0 12px}
  .up .acts button{font:inherit;font-weight:700;font-size:16px;padding:15px 18px;border-radius:12px;border:0;cursor:pointer}
  .up .save{background:var(--bronze);color:#050505}
  .up .copy{background:var(--surface-2);color:var(--ink)}
  .up .acts button:disabled{opacity:.5;cursor:default}
  .up .msg{min-height:1.5em;font-size:14px;color:var(--mut);margin:0 0 24px}
  .up .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 28px}
  .up .grid a{position:relative;display:block}
  .up .grid img{width:100%;aspect-ratio:1080/1350;object-fit:cover;display:block;border-radius:6px;background:var(--surface)}
  .up .grid span{position:absolute;left:6px;top:6px;font-size:12px;font-weight:700;color:var(--ink);background:rgba(5,5,5,.7);padding:1px 6px;border-radius:4px}
  .up pre{white-space:pre-wrap;word-break:keep-all;font:inherit;font-size:14.5px;line-height:1.7;color:var(--ink-2);border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:16px 0;margin:0}
  .up h2{font-size:16px;margin:0 0 10px}
  .up .who{color:var(--mut);font-size:14px;margin:0 0 20px}
  @media(min-width:641px){.up .grid{grid-template-columns:repeat(5,minmax(0,1fr))}.up .acts{grid-template-columns:1fr 1fr}}
</style>`;
function upload(auth) {
  return `${UPLOAD_CSS}
<div class="up" id="upload">
<section data-u="wait" role="status"><p class="k">인스타그램 직접 올리기</p><h1>확인하는 중…</h1></section>
<section data-u="off" hidden><p class="k">인스타그램 직접 올리기</p><h1>운영자 전용 화면이에요</h1><p class="lead">로그인이 꺼져 있어 열 수 없어요.</p></section>
<section data-u="out" hidden>
  <p class="k">인스타그램 직접 올리기</p>
  <h1>운영자 전용 화면이에요</h1>
  <p class="lead">운영자 계정으로 로그인하면 카드를 저장하고 캡션을 복사할 수 있어요.</p>
  <div class="acts"><a class="btn lg" href="/login" data-login>로그인</a></div>
</section>
<section data-u="no" hidden>
  <p class="k">인스타그램 직접 올리기</p>
  <h1>운영자 계정이 아니에요</h1>
  <p class="lead">지금 로그인한 계정 <b data-who></b>은 이 화면을 쓸 수 없어요. 운영자 계정으로 다시 로그인해 주세요.</p>
  <p class="msg" data-why role="alert"></p>
  <div class="acts"><button class="copy" type="button" data-out>로그아웃하고 다시 로그인</button></div>
</section>
<section data-u="tool" hidden>
  <p class="k">인스타그램 직접 올리기</p>
  <h1 id="title">카드를 불러오는 중…</h1>
  <p class="who">운영자 <b data-who></b></p>
  <p class="lead" id="lead"></p>
  <ol class="steps">
    <li><b>카드 저장</b> — 사진 앱에 1장부터 순서대로 저장돼요.</li>
    <li><b>캡션 복사</b></li>
    <li>인스타그램 앱 → 새 게시물 → 여러 장 선택에서 <b>1장부터 순서대로</b> 고르고, 캡션을 붙여 넣어 공유해요.</li>
    <li>올린 뒤 GitHub 이슈에 <code>/approve</code> — 기록하고 리서치 글을 공개해요.</li>
  </ol>
  <div class="acts">
    <button class="save" id="save" type="button" disabled>카드 저장</button>
    <button class="copy" id="copy" type="button" disabled>캡션 복사</button>
  </div>
  <p class="msg" id="msg" role="status" aria-live="polite"></p>
  <div class="grid" id="grid"></div>
  <h2>캡션</h2>
  <pre id="cap"></pre>
</section>
</div>
<script type="module" src="/upload.js"></script>`;
}

const legal = (title, lede, other, body) => `<article class="legal">
<header>
  <div class="kicker"><b>AX 트렌드 레이더</b>시행일 ${POLICY_VERSION}</div>
  <h1 class="page">${title}</h1>
  <p class="lede">${lede}</p>
  <p class="meta"><a href="${other.href}">${other.label}</a> · 법률 자문을 거치기 전의 초안이에요.</p>
</header>
${body}
</article>`;

// the pages, for writePages: file, address, title and description, the page body, and how much of the frame it gets
// (`bare`: the top bar and the policy links only — no tab bar, no install bar)
export function accountPages(auth) {
  return [
    { file: "login.html", path: "/login", title: "로그인", desc: "AX 트렌드 레이더 로그인 — 메일로 받은 링크로 들어와요.", body: login(auth), bare: true, noindex: true },
    { file: "auth/callback.html", path: "/auth/callback", title: "로그인 확인", desc: "로그인 링크를 확인해요.", body: callback(auth), bare: true, noindex: true },
    { file: "upload.html", path: "/upload", title: "직접 올리기", desc: "운영자 전용 — 긴 이야기 카드를 인스타그램 앱으로 올려요.", body: upload(auth), bare: true, noindex: true },
    { file: "saved.html", path: "/saved", title: "저장한 리서치", desc: "저장한 리서치 목록이에요.", body: saved(auth), noindex: true },
    { file: "privacy.html", path: "/privacy", title: "개인정보 처리방침", desc: "AX 트렌드 레이더가 처리하는 개인정보와 그 목적, 보유 기간, 국외 이전을 적었어요.",
      body: legal("개인정보 처리방침", "무엇을 받고, 왜 받고, 언제 지우는지 적었어요. 로그인하지 않고 읽기만 하면 개인정보를 받지 않아요.", { href: "/terms", label: "이용약관" }, privacyBody(auth)) },
    { file: "terms.html", path: "/terms", title: "이용약관", desc: "AX 트렌드 레이더 이용 조건이에요.",
      body: legal("이용약관", "AX 트렌드 레이더를 쓰는 조건이에요. 무료이고, 공식 발표와 공개 데이터를 정리해요.", { href: "/privacy", label: "개인정보 처리방침" }, termsBody(auth)) },
  ];
}
