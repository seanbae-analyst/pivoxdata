// login.js — /login (trends/pages.mjs): the address → the three required consents → "check your inbox", one step at a
// time (PivoxMap's /login, 2026-10-15 flow). The address goes to the sign-in service (Supabase — abroad) only after the
// consents: sending it is already a transfer abroad. While the inbox screen waits, the link opened in another window
// of this browser signs in there (/auth/callback) and this screen follows ("이 창에서 계속").
// A person already signed in: on to where they were going — or, when the terms changed since they agreed, the
// consents again (?consent=1 from account.js) with 로그아웃 instead of 이전.
import * as auth from "/auth.js";
import { steps, consent, say, entered } from "/acc-ui.js";

const root = document.getElementById("login");
if (root && auth.enabled) {
  const $ = (s) => root.querySelector(s), go = steps(root);
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const params = new URLSearchParams(location.search), next = auth.safeNext(params.get("next"), "/");
  for (const a of root.querySelectorAll("[data-browse], [data-next]")) { a.href = next; a.addEventListener("click", entered); }
  const cs = root.querySelector('[data-s="consent"]'), sendBtn = $("#send"), resendBtn = $("#resend");
  let email = "", until = 0, timer = 0, policyMode = false;

  // ---------- 1. the address ----------
  const input = $("#email"), bad = (on) => { $("#email-err").hidden = !on; input.toggleAttribute("aria-invalid", on); };
  input.addEventListener("input", () => bad(false));
  $("#f-email").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!EMAIL.test(v)) { bad(true); input.focus(); return; }
    email = v;
    root.querySelectorAll("[data-email]").forEach((b) => { b.textContent = v; });
    go("consent");
  });

  // ---------- 2. the consents, then the link ----------
  const agreed = consent(cs, (ok) => { sendBtn.disabled = !ok; cs.querySelector("[data-need]").hidden = ok; say($("#send-err")); });
  cs.querySelector("[data-back]").addEventListener("click", async () => {
    if (!policyMode) { go("email", true); return; }
    await auth.signOut(); location.replace("/");
  });
  // Supabase sends to one address at most once a minute (429): the resend waits that out, and shows how long
  const cool = () => {
    until = Date.now() + 60_000; clearInterval(timer);
    const tick = () => { const s = Math.ceil((until - Date.now()) / 1000); resendBtn.disabled = s > 0; resendBtn.textContent = s > 0 ? `다시 보내기 (${s}초 뒤)` : "다시 보내기"; if (s <= 0) clearInterval(timer); };
    tick(); timer = setInterval(tick, 1000);
  };
  const WHY = {
    rate: "짧은 시간에 로그인 메일을 여러 번 요청했어요. 몇 분 뒤 다시 시도해 주세요.",
    network: "로그인 서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    failed: "로그인 메일을 보내지 못했어요. 주소를 확인하고 다시 시도해 주세요.",
  };
  const send = async (again) => {
    if (!agreed()) return;
    if (!again && Date.now() < until) { go("mail"); return; }   // the same link is on its way — the inbox screen again
    const btn = again ? resendBtn : sendBtn, label = btn.textContent;
    btn.disabled = true; btn.textContent = "보내는 중…";
    const r = await auth.sendLink(email, next);
    btn.textContent = label; btn.disabled = false;
    if (r.ok) {
      auth.setPendingConsent(email);
      cool(); $("#resent").hidden = !again; say($("#mail-err"));
      if (!again) go("mail");
      return;
    }
    if (r.why === "rate" && again) cool();
    say(again ? $("#mail-err") : $("#send-err"), WHY[r.why] ?? WHY.failed);
  };
  sendBtn.addEventListener("click", () => (policyMode ? agree() : send(false)));
  resendBtn.addEventListener("click", () => send(true));
  root.querySelector("[data-change]").addEventListener("click", () => { $("#resent").hidden = true; go("email", true); input.focus(); });

  // ---------- 3. waiting: signed in in another window of this browser ----------
  const signedIn = (u) => { root.querySelectorAll("[data-user]").forEach((b) => { b.textContent = u.email; }); go("done"); };
  auth.onChange((u) => { if (u && !root.querySelector('[data-s="mail"]').hidden) signedIn(u); });

  // ---------- already signed in ----------
  const agree = async () => {
    sendBtn.disabled = true;
    const r = await auth.rpc("pd_consent", { p_version: auth.policy });
    if (r.ok) { try { sessionStorage.setItem("pd.cv", auth.policy); } catch {} entered(); location.replace(next); return; }
    sendBtn.disabled = false;
    say($("#send-err"), r.status === 0 ? WHY.network : "동의를 기록하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
  };
  const me = auth.user();
  if (me) {
    const r = await auth.rpc("pd_consented", { p_version: auth.policy });
    if (r.ok && r.data === false) {
      // the terms changed since this person agreed: the same three consents, then on
      policyMode = true;
      cs.querySelector("[data-t]").textContent = "바뀐 약관을 확인해 주세요";
      cs.querySelector("[data-d]").textContent = `이용약관과 개인정보 처리방침이 ${auth.policy}에 바뀌었어요. 계속 쓰려면 다시 동의해 주세요. 동의하지 않으면 로그아웃해요.`;
      cs.querySelector(".acc-guide span").textContent = "필수 항목 세 가지에 다시 동의하면 이어져요.";
      cs.querySelector("[data-back]").textContent = "로그아웃";
      sendBtn.textContent = "동의하고 계속";
      go("consent");
    } else if (!params.has("consent")) location.replace(params.has("next") ? next : "/saved#account");
    else location.replace(next);
  }
}
