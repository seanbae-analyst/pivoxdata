// callback.js — /auth/callback (trends/pages.mjs): where the e-mail link lands. The one place a session is made
// (auth.js → complete). Then the consent: given on /login in this browser by this address within the hour, it is
// written now; a link opened on another device (or a later version of the terms) asks for it here. Whose account it
// is stays on screen with a way out (로그아웃) — a link someone else forwarded signs in to their account.
import * as auth from "/auth.js";
import { steps, consent, say } from "/acc-ui.js";

const root = document.getElementById("cb");
if (root && auth.enabled) {
  const $ = (s) => root.querySelector(s), go = steps(root);
  const FAIL = {
    expired: ["링크가 만료됐거나 이미 쓰였어요", "로그인 링크는 한 번만, 짧은 시간 동안만 쓸 수 있어요. 새 링크를 받아 주세요."],
    other_browser: ["로그인을 요청한 브라우저에서 열어 주세요", "이 링크는 로그인을 요청한 브라우저에서만 열려요. 그 브라우저에서 메일을 열거나, 여기서 새 링크를 받아 주세요."],
    network: ["로그인 서버에 연결하지 못했어요", "인터넷 연결을 확인하고 잠시 뒤 다시 시도해 주세요. 링크가 아직 유효하면 메일의 버튼을 다시 눌러도 돼요."],
    failed: ["로그인하지 못했어요", "링크가 맞지 않아요. 새 링크를 받아 주세요."],
  };
  for (const b of root.querySelectorAll("[data-out]")) b.addEventListener("click", async () => { await auth.signOut(); location.replace("/"); });
  const r = await auth.complete();
  if (r.failure) {
    const [t, d] = FAIL[r.failure] ?? FAIL.failed, f = root.querySelector('[data-s="failed"]');
    f.querySelector("[data-t]").textContent = t; f.querySelector("[data-d]").textContent = d;
    go("failed");
  } else {
    const email = r.user.email, next = auth.takeNext();
    root.querySelectorAll("[data-user]").forEach((b) => { b.textContent = email; });
    for (const a of root.querySelectorAll("[data-next]")) a.href = next;
    const record = () => auth.rpc("pd_consent", { p_version: auth.policy });
    const done = () => { try { sessionStorage.setItem("pd.cv", auth.policy); } catch {} go("done"); };
    let ok = false;
    if (auth.pendingConsent(email)) { ok = (await record()).ok; if (ok) auth.setPendingConsent(null); }
    if (!ok) { const c = await auth.rpc("pd_consented", { p_version: auth.policy }); ok = c.ok && c.data === true; }
    if (ok) done();
    else {
      const cs = root.querySelector('[data-s="consent"]'), btn = $("#agree");
      consent(cs, (all) => { btn.disabled = !all; cs.querySelector("[data-need]").hidden = all; say($("#cs-err")); });
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const w = await record();
        if (w.ok) { auth.setPendingConsent(null); done(); return; }
        btn.disabled = false;
        say($("#cs-err"), w.status === 0 ? "로그인 서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요." : "동의를 기록하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      });
      go("consent");
    }
  }
}
