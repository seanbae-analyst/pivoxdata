// legal.mjs — the facts the privacy policy (/privacy) and the terms (/terms) say, in one place (the way PivoxMap's
// lib/legal.ts does). Not legal advice: a draft to be checked, like PivoxMap's. Change a sentence here and raise
// POLICY_VERSION (the pages show it as 시행일). A policy describes what is done, not what might be: signing in, and
// what it would add here, comes with its own piece of work.
// (its own escaper: site.mjs imports this file, so this one does not import site.mjs back)
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const POLICY_VERSION = "2026-10-26";

// who runs the site and how to reach them, for §8 of the policy and 문의 in the terms. Empty until the owner publishes
// them (PivoxMap waits for the business registration the same way) — the pages then say so.
export const OPERATOR = { name: "", contact: "" };

// processing entrusted abroad (개인정보 보호법 §28-8 ②: who, contact, country, items, purpose, how long)
export function transfers() {
  return [
    { to: "Vercel Inc.", contact: "privacy@vercel.com", country: "미국 등 (전송망)", items: "접속 기록 (IP 주소, 브라우저 정보, 요청 주소)", purpose: "웹 화면 제공", retention: "Vercel 보관 정책에 따름" },
    { to: "OneSignal, Inc.", contact: "privacy@onesignal.com", country: "미국", items: "새 브리핑 알림을 켠 경우 푸시 구독 정보 (구독 식별자, 브라우저 · 운영체제 종류, 언어, 시간대)", purpose: "새 브리핑 알림 발송", retention: "알림을 끌 때까지 (그 뒤 기록은 OneSignal 보관 정책에 따름)" },
  ];
}
export const TRANSFER_WHEN = "서비스를 이용할 때마다 네트워크로 전송합니다.";

const p = (t) => `<p>${t}</p>`;
const ul = (items) => `<ul>${items.filter(Boolean).map((x) => `<li>${x}</li>`).join("")}</ul>`;
const operatorLine = () => {
  const pending = "게시 준비 중";
  return p(`운영자: ${esc(OPERATOR.name || pending)} · 연락처: ${esc(OPERATOR.contact || pending)}`);
};
const section = (n, title, body) => `<section class="lg-s" id="s${n}"><h2><span>${n}</span>${title}</h2>${body}</section>`;
const table = (rows) => `<div class="tbl"><table><thead><tr><th>받는 자 · 연락처</th><th>국가</th><th>이전 항목</th><th>목적 (위탁 업무)</th><th>보유 · 이용 기간</th></tr></thead><tbody>${rows.map((t) => `<tr><td><b>${esc(t.to)}</b><small>${esc(t.contact)}</small></td><td>${esc(t.country)}</td><td>${esc(t.items)}</td><td>${esc(t.purpose)}</td><td>${esc(t.retention)}</td></tr>`).join("")}</tbody></table></div>`;

// ---------- /privacy ----------
export function privacyBody() {
  return [
    section(1, "처리하는 개인정보와 목적", ul([
      "<b>읽기</b>: 개인정보를 받지 않습니다. 저장한 브리핑과 화면 설정은 이용자의 브라우저 저장소에만 남습니다(6절).",
      "<b>새 브리핑 알림 (선택)</b>: 알림을 켜면 알림 발송 서비스 OneSignal이 이 브라우저의 푸시 구독 정보(구독 식별자, 브라우저 · 운영체제 종류, 언어, 시간대)를 받습니다 — 새 브리핑 알림 발송.",
      "<b>접속 기록</b>: 웹 호스팅(Vercel)이 요청을 처리하면서 IP 주소, 브라우저 정보, 요청 주소가 기록될 수 있습니다 — 화면 제공과 보안.",
    ])),
    section(2, "보유 기간과 파기", ul([
      "알림 구독 정보: 알림을 끄거나 브라우저의 사이트 데이터를 지우면 더 이상 보내지 않으며, 구독 기록은 OneSignal의 보관 정책에 따릅니다.",
      "접속 기록: Vercel의 보관 정책에 따릅니다.",
      "브라우저 저장소의 값은 이용자의 기기에만 있어, 사이트 데이터를 지우면 함께 지워집니다.",
    ])),
    section(3, "제3자 제공", p("운영자는 이용자의 개인정보를 제3자에게 제공하지 않습니다.")),
    section(4, "처리 위탁과 국외 이전", p("서비스 운영을 위해 아래 업체에 처리를 맡기며, 이 업체들의 서버 또는 회사가 국외에 있어 개인정보가 국외로 이전됩니다.") + table(transfers())
      + p(`이전 시기 · 방법: ${TRANSFER_WHEN}`)
      + p("거부 방법과 효과: 새 브리핑 알림을 켜지 않으면 OneSignal로 이전되지 않습니다.")),
    section(5, "이용자의 권리와 행사 방법", p("이용자는 개인정보 열람 · 정정 · 삭제 · 처리정지를 요구할 수 있습니다.") + ul([
      "알림 끄기: 브라우저의 사이트 설정에서 알림 권한을 끄면 됩니다.",
      "저장한 브리핑: <a href=\"/saved\">저장한 브리핑</a> 화면에서 지울 수 있습니다.",
      "그 밖의 요구: 8절의 연락처로 요청하면 지체 없이 처리합니다.",
    ])),
    section(6, "브라우저 저장소와 외부 자원", p("광고 · 추적 쿠키를 쓰지 않습니다. 브라우저 저장소(localStorage)에 처음 화면을 본 표시, 저장한 브리핑, 설치 안내를 닫은 시각을 둡니다. 알림을 켜면 OneSignal이 구독 상태를 브라우저에 저장합니다.")
      + p("글꼴(Pretendard)은 jsDelivr 전송망에서 받아 오며, 이때 브라우저가 IP 주소 등을 그 전송망에 보냅니다.")),
    section(7, "안전성 확보 조치", ul([
      "모든 전송 구간은 HTTPS로 암호화합니다.",
    ])),
    section(8, "개인정보 보호책임자 · 문의", operatorLine()),
    section(9, "변경", p("이 방침을 바꾸면 시행 전에 이 화면에 알립니다.")),
  ].join("\n");
}

// ---------- /terms ----------
export function termsBody() {
  let n = 0;
  const s = (title, body) => section(++n, title, body);
  return [
    s("서비스", p("AX 트렌드 레이더(PivoxData)는 기업의 AI 전환(AX)에 관한 공식 발표와 공개 데이터를 모아, IT 컨설팅 관점에서 정리한 리서치를 무료로 제공합니다.")),
    s("내용의 성격", p("글과 카드는 회사 · 정부 · 기관이 공개한 발표와 공개 데이터를 정리한 정보입니다. 특정 제품 · 서비스의 도입이나 투자를 권하지 않으며, 지난 사실만 다룹니다. 숫자와 인용은 출처의 것이고 원문이 바뀌거나 틀릴 수 있으니, 중요한 판단 전에는 원문을 확인하십시오.")),
    s("출처와 저작권", p("각 글은 출처를 밝히고 발표 원문으로 연결합니다. 발표 원문은 저장하거나 게재하지 않습니다. 이 사이트의 글 · 카드 · 차트를 인용할 때는 출처(AX 트렌드 레이더, data.pivoxquant.com)를 밝혀 주십시오.")),
    s("알림", p("새 브리핑 알림은 선택이며, 브라우저 설정에서 언제든 끌 수 있습니다.")),
    s("금지 행위", p("서비스 운영을 방해하는 행위, 자동화된 대량 요청을 해서는 안 됩니다.")),
    s("변경과 중단", p("무료 서비스이며, 내용과 기능은 예고 없이 바뀌거나 중단될 수 있습니다.")),
    s("책임의 한계", p("운영자는 이 서비스의 정보를 바탕으로 이용자가 내린 판단의 결과에 책임지지 않습니다. 다만 운영자의 고의나 중대한 과실로 생긴 손해는 그렇지 않습니다.")),
    s("문의", operatorLine()),
    s("약관의 변경", p("약관을 바꾸면 시행 전에 이 화면에 알립니다.")),
  ].join("\n");
}
