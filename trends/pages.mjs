// pages.mjs — the pages written whole by site.mjs → writePages with the site's frame (2026-10-26): /saved (the briefings
// saved in this browser — account.js fills it), /privacy and /terms (trends/legal.mjs). What a page shows before its
// script runs is already the right first screen. Signing in, which would add to these, is its own piece of work.
import { POLICY_VERSION, privacyBody, termsBody } from "./legal.mjs";

const svg = (d, cls = "") => `<svg class="ic${cls ? ` ${cls}` : ""}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
export const ICON = {
  bookmark: "M7 4h10v16l-5-3.5L7 20z",
};

const saved = () => `<div class="sv" id="saved-root">
<header class="sv-head">
  <div class="kicker"><b>내 브리핑</b>이 기기의 브라우저에 저장</div>
  <h1 class="page">저장한 브리핑</h1>
  <p class="lede" id="sv-note">브리핑에서 저장을 누르면 여기에 모여요. 이 기기의 브라우저에만 저장돼요.</p>
</header>
<ul class="list sv-list" id="sv-list"></ul>
<div class="sv-empty" id="sv-empty" hidden>
  <span class="sv-ico">${svg(ICON.bookmark)}</span>
  <p><b>아직 저장한 브리핑이 없어요.</b></p>
  <p>브리핑 제목 아래 <b>저장</b>을 누르면 여기에 모여요.</p>
  <a class="btn ghost" href="/briefs">브리핑 보기</a>
</div>
</div>`;

const legal = (title, lede, other, body) => `<article class="legal">
<header>
  <div class="kicker"><b>AX 트렌드 레이더</b>시행일 ${POLICY_VERSION}</div>
  <h1 class="page">${title}</h1>
  <p class="lede">${lede}</p>
  <p class="meta"><a href="${other.href}">${other.label}</a> · 법률 자문을 거치기 전의 초안이에요.</p>
</header>
${body}
</article>`;

// the pages, for writePages: file, address, title and description, the page body
export function accountPages() {
  return [
    { file: "saved.html", path: "/saved", title: "저장한 브리핑", desc: "저장한 브리핑 목록이에요.", body: saved(), noindex: true },
    { file: "privacy.html", path: "/privacy", title: "개인정보 처리방침", desc: "AX 트렌드 레이더가 처리하는 개인정보와 그 목적, 보유 기간, 국외 이전을 적었어요.",
      body: legal("개인정보 처리방침", "무엇을 받고, 왜 받고, 언제 지우는지 적었어요. 읽기만 하면 개인정보를 받지 않아요.", { href: "/terms", label: "이용약관" }, privacyBody()) },
    { file: "terms.html", path: "/terms", title: "이용약관", desc: "AX 트렌드 레이더 이용 조건이에요.",
      body: legal("이용약관", "AX 트렌드 레이더를 쓰는 조건이에요. 무료이고, 공식 발표와 공개 데이터를 정리해요.", { href: "/privacy", label: "개인정보 처리방침" }, termsBody()) },
  ];
}
