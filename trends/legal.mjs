// legal.mjs — the facts the privacy policy (/privacy), the terms (/terms) and the sign-in consent (/login) all say, in
// one place (the way PivoxMap's lib/legal.ts does). Not legal advice: a draft to be checked, like PivoxMap's.
// Change a sentence here and raise POLICY_VERSION — signed-in people are asked to agree again (auth.js → policy).
// The login parts are there only when signing in is on (site.mjs → AUTH): a policy describes what is done, not what
// might be.
// (its own escaper: site.mjs imports this file, so this one does not import site.mjs back)
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const POLICY_VERSION = "2026-10-27";

// who runs the site and how to reach them, for §8 of the policy and §9 of the terms. Empty until the owner publishes
// them (PivoxMap waits for the business registration the same way) — the pages then say so.
export const OPERATOR = { name: "", contact: "" };

// processing entrusted abroad (개인정보 보호법 §28-8 ②: who, contact, country, items, purpose, how long). `login`: only
// when signing in is on; `mail`: only when the sign-in e-mails go out through Brevo (supabase/README.md → SMTP).
export function transfers(auth) {
  const list = [
    { to: "Vercel Inc.", contact: "privacy@vercel.com", country: "미국 등 (전송망)", items: "접속 기록 (IP 주소, 브라우저 정보, 요청 주소)", purpose: "웹 화면 제공", retention: "Vercel 보관 정책에 따름" },
    { to: "OneSignal, Inc.", contact: "privacy@onesignal.com", country: "미국", items: "새 리서치 알림을 켠 경우 푸시 구독 정보 (구독 식별자, 브라우저 · 운영체제 종류, 언어, 시간대)", purpose: "새 리서치 알림 발송", retention: "알림을 끌 때까지 (그 뒤 기록은 OneSignal 보관 정책에 따름)" },
  ];
  if (!auth.on) return list;
  list.push({ to: "Supabase, Inc.", contact: "privacy@supabase.io", country: auth.region || "미국", items: "이메일 주소, 사용자 식별자, 로그인 기록, 약관 동의 기록, 저장한 리서치 목록", purpose: "회원 인증 · 로그인 메일 생성 · 저장 목록 보관", retention: "탈퇴할 때까지", login: true });
  if (auth.mail === "brevo") list.push({ to: "Sendinblue SAS (Brevo)", contact: "dpo@brevo.com", country: "프랑스 (EU)", items: "이메일 주소, 로그인 링크 메일 내용", purpose: "로그인 메일 발송", retention: "발송 기록은 Brevo 보관 정책에 따름", login: true });
  return list;
}
export const TRANSFER_WHEN = "서비스를 이용할 때마다 네트워크로 전송합니다.";

const p = (t) => `<p>${t}</p>`;
const ul = (items) => `<ul>${items.filter(Boolean).map((x) => `<li>${x}</li>`).join("")}</ul>`;
const operatorLine = (auth) => {
  const pending = "게시 준비 중";
  return p(`운영자: ${esc(OPERATOR.name || pending)} · 연락처: ${esc(OPERATOR.contact || pending)}${OPERATOR.contact ? "" : auth.on ? " — 그 전까지 탈퇴는 로그인한 뒤 계정 화면에서 바로 할 수 있습니다." : ""}`);
};
const section = (n, title, body) => `<section class="lg-s" id="s${n}"><h2><span>${n}</span>${title}</h2>${body}</section>`;
const table = (rows) => `<div class="tbl"><table><thead><tr><th>받는 자 · 연락처</th><th>국가</th><th>이전 항목</th><th>목적 (위탁 업무)</th><th>보유 · 이용 기간</th></tr></thead><tbody>${rows.map((t) => `<tr><td><b>${esc(t.to)}</b><small>${esc(t.contact)}</small></td><td>${esc(t.country)}</td><td>${esc(t.items)}</td><td>${esc(t.purpose)}</td><td>${esc(t.retention)}</td></tr>`).join("")}</tbody></table></div>`;

// ---------- /privacy ----------
export function privacyBody(auth) {
  const L = auth.on;
  return [
    section(1, "처리하는 개인정보와 목적", ul([
      "<b>로그인하지 않고 읽기</b>: 개인정보를 받지 않습니다. 저장한 리서치와 화면 설정은 이용자의 브라우저 저장소에만 남습니다(6절).",
      "<b>새 리서치 알림 (선택)</b>: 알림을 켜면 알림 발송 서비스 OneSignal이 이 브라우저의 푸시 구독 정보(구독 식별자, 브라우저 · 운영체제 종류, 언어, 시간대)를 받습니다 — 새 리서치 알림 발송.",
      L && "<b>로그인 (선택)</b>: 이메일 주소, 사용자 식별자, 로그인 기록, 약관 동의 기록, 저장한 리서치 목록(주소 · 제목 · 날짜) — 회원 식별, 로그인 링크 발송, 저장한 리서치를 여러 기기에서 이어 보기. 비밀번호는 받지 않습니다.",
      "<b>접속 기록</b>: 웹 호스팅(Vercel)이 요청을 처리하면서 IP 주소, 브라우저 정보, 요청 주소가 기록될 수 있습니다 — 화면 제공과 보안.",
    ]) + (L ? p("로그인은 선택입니다. 로그인하지 않아도 모든 글을 볼 수 있고, 로그인할 때 수집 · 이용과 국외 이전에 따로 동의를 받습니다.") : "")),
    section(2, "보유 기간과 파기", ul([
      L && "회원 정보(이메일 · 동의 기록 · 저장 목록)는 탈퇴하면 지체 없이 지웁니다.",
      "알림 구독 정보: 알림을 끄거나 브라우저의 사이트 데이터를 지우면 더 이상 보내지 않으며, 구독 기록은 OneSignal의 보관 정책에 따릅니다.",
      "접속 기록: Vercel의 보관 정책에 따릅니다.",
      "파기는 데이터베이스에서 지우는 방식으로 합니다. 브라우저 저장소의 값은 이용자의 기기에만 있어, 사이트 데이터를 지우면 함께 지워집니다.",
    ])),
    section(3, "제3자 제공", p("운영자는 이용자의 개인정보를 제3자에게 제공하지 않습니다.")),
    section(4, "처리 위탁과 국외 이전", p("서비스 운영을 위해 아래 업체에 처리를 맡기며, 이 업체들의 서버 또는 회사가 국외에 있어 개인정보가 국외로 이전됩니다.") + table(transfers(auth))
      + p(`이전 시기 · 방법: ${TRANSFER_WHEN}`)
      + p(`거부 방법과 효과: 새 리서치 알림을 켜지 않으면 OneSignal로 이전되지 않습니다.${L ? " 로그인할 때 국외 이전 동의를 따로 받으며, 동의하지 않으면 로그인할 수 없고 로그인 없이도 모든 글을 볼 수 있습니다. 이미 동의했다면 탈퇴로 거부할 수 있습니다." : ""}`)),
    section(5, "이용자의 권리와 행사 방법", p("이용자는 개인정보 열람 · 정정 · 삭제 · 처리정지를 요구할 수 있습니다.") + ul([
      L && "탈퇴(삭제): 로그인한 뒤 <a href=\"/saved#account\">저장한 리서치</a> 화면의 계정에서 바로 할 수 있습니다.",
      "알림 끄기: 브라우저의 사이트 설정에서 알림 권한을 끄면 됩니다.",
      "저장한 리서치: <a href=\"/saved\">저장한 리서치</a> 화면에서 지울 수 있습니다.",
      "그 밖의 요구: 8절의 연락처로 요청하면 지체 없이 처리합니다.",
    ])),
    section(6, "브라우저 저장소와 외부 자원", p("광고 · 추적 쿠키를 쓰지 않습니다. 브라우저 저장소(localStorage)에 처음 화면을 본 표시, 저장한 리서치, 설치 안내를 닫은 시각" + (L ? ", 로그인 세션, 로그인 전 동의 표시(1시간), 로그인 뒤 돌아갈 화면 주소, 로그인 링크 확인용 값" : "") + "을 둡니다. 알림을 켜면 OneSignal이 구독 상태를 브라우저에 저장합니다.")
      + p("글꼴(Pretendard)은 jsDelivr 전송망에서 받아 오며, 이때 브라우저가 IP 주소 등을 그 전송망에 보냅니다.")),
    section(7, "안전성 확보 조치", ul([
      "모든 전송 구간은 HTTPS로 암호화합니다.",
      L && "회원 자료에는 행 수준 보안을 켜, 로그인한 이용자가 자기 자료만 읽고 쓸 수 있습니다.",
      L && "비밀번호를 받지 않습니다. 로그인 링크는 한 번만 쓸 수 있고 짧은 시간 동안만 유효합니다.",
    ])),
    section(8, "개인정보 보호책임자 · 문의", operatorLine(auth)),
    section(9, "변경", p(`이 방침을 바꾸면 시행 전에 이 화면에 알립니다.${L ? " 로그인한 이용자에게는 바뀐 내용에 다시 동의를 받습니다." : ""}`)),
  ].join("\n");
}

// ---------- /terms ----------
export function termsBody(auth) {
  const L = auth.on;
  let n = 0;
  const s = (title, body) => section(++n, title, body);
  return [
    s("서비스", p("AX 트렌드 레이더(PivoxData)는 기업의 AI 전환(AX)에 관한 공식 발표와 공개 데이터를 모아, IT 컨설팅 관점에서 정리한 리서치를 무료로 제공합니다.")),
    s("내용의 성격", p("글과 카드는 회사 · 정부 · 기관이 공개한 발표와 공개 데이터를 정리한 정보입니다. 특정 제품 · 서비스의 도입이나 투자를 권하지 않으며, 지난 사실만 다룹니다. 숫자와 인용은 출처의 것이고 원문이 바뀌거나 틀릴 수 있으니, 중요한 판단 전에는 원문을 확인하십시오.")),
    s("출처와 저작권", p("각 글은 출처를 밝히고 발표 원문으로 연결합니다. 발표 원문은 저장하거나 게재하지 않습니다. 이 사이트의 글 · 카드 · 차트를 인용할 때는 출처(AX 트렌드 레이더, data.pivoxquant.com)를 밝혀 주십시오.")),
    L && s("계정", p("로그인 없이도 모든 글을 볼 수 있습니다. 로그인하면 저장한 리서치를 여러 기기에서 이어 봅니다. 로그인은 이메일로 받은 링크로 하며, 링크와 메일 계정의 관리는 이용자에게 책임이 있습니다. 언제든 계정 화면에서 탈퇴할 수 있습니다.")),
    s("알림", p("새 리서치 알림은 선택이며, 브라우저 설정에서 언제든 끌 수 있습니다.")),
    s("금지 행위", p(`서비스 운영을 방해하는 행위, 자동화된 대량 요청${L ? ", 다른 사람의 계정에 접근하는 행위" : ""}를 해서는 안 됩니다.`)),
    s("변경과 중단", p(`무료 서비스이며, 내용과 기능은 예고 없이 바뀌거나 중단될 수 있습니다.${L ? " 계정 기능을 중단할 때는 미리 알리고, 저장한 목록을 지웁니다." : ""}`)),
    s("책임의 한계", p("운영자는 이 서비스의 정보를 바탕으로 이용자가 내린 판단의 결과에 책임지지 않습니다. 다만 운영자의 고의나 중대한 과실로 생긴 손해는 그렇지 않습니다.")),
    s("문의", operatorLine(auth)),
    s("약관의 변경", p(`약관을 바꾸면 시행 전에 이 화면에 알립니다.${L ? " 로그인한 이용자에게는 바뀐 내용에 다시 동의를 받습니다." : ""}`)),
  ].filter(Boolean).join("\n");
}

// ---------- the three required consents at sign-in (/login, and /auth/callback when the link was opened elsewhere) ----------
export function consentHtml(auth) {
  const list = transfers(auth).filter((t) => t.login);
  const row = (key, title, desc) => `<label class="cs-row"><input type="checkbox" data-c="${key}" /><span><b>${title}</b><small>${desc}</small></span></label>`;
  return `<fieldset class="cs"><legend class="sr">필수 동의</legend>
  ${row("all", "아래 필수 항목에 모두 동의합니다", "세 가지에 한 번에 동의합니다").replace('class="cs-row"', 'class="cs-row all"')}
  ${row("terms", "[필수] 이용약관에 동의합니다", 'AX 트렌드 레이더 이용 조건 · <a href="/terms" target="_blank">전문 보기</a>')}
  ${row("privacy", "[필수] 개인정보 수집 · 이용에 동의합니다", '이메일 주소 · 사용자 식별자 · 저장 목록 — 회원 식별, 로그인 링크 발송, 저장 목록 이어 보기 · 탈퇴할 때까지 · <a href="/privacy" target="_blank">처리방침</a>')}
  ${row("overseas", "[필수] 개인정보 국외 이전에 동의합니다", "받는 곳 · 나라 · 항목 · 목적 · 보유 기간은 아래 '국외 이전 내용 보기'에 있습니다")}
</fieldset>
<details class="cs-more"><summary>국외 이전 내용 보기 (${list.length}곳)</summary><ul>${list.map((t) => `<li><b>${esc(t.to)}</b> · ${esc(t.country)} · 연락처 ${esc(t.contact)}<br />항목: ${esc(t.items)} · 목적: ${esc(t.purpose)} · 보유: ${esc(t.retention)}</li>`).join("")}</ul>
<p>${TRANSFER_WHEN} 동의하지 않으면 로그인할 수 없고, 로그인 없이도 모든 글을 볼 수 있습니다.</p></details>`;
}
