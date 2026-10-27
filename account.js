// account.js — on every page (trends/site.mjs → FOOTER): briefings saved to read again and, when signing in is on, the
// account (2026-10-26). Saved briefings live in this browser (localStorage "pd.saved"); signed in, they live in the
// account too and follow it to any device (public.pd_saved_* — supabase/schema.sql). What it draws: the 저장 button
// under a briefing's title and under the home page's story, the count and the sign-in link in the menus
// ([data-acct] — the top bar), the /saved page with the account (로그아웃 · 탈퇴),
// and, for a signed-in person, a line when the terms have changed since they agreed.
import * as auth from "/auth.js";

const KEY = "pd.saved", GONE = "pd.saved.gone", EVENT = "pd:saved";
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) ?? "null") ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };
const changed = () => dispatchEvent(new Event(EVENT));

/** the saved briefings, newest first: {slot, title, day, at, s} — s: the account has it too */
export const list = () => (Array.isArray(read(KEY, [])) ? read(KEY, []) : []).filter((x) => x && typeof x.slot === "string" && typeof x.title === "string");
export const has = (slot) => list().some((x) => x.slot === slot);
const keep = (items) => { write(KEY, items); changed(); };

/** save or unsave a briefing ({slot, title, day}) → saved now? Signed in, the account follows; a call that fails is
 *  made again at the next sync (an unsave is remembered in "pd.saved.gone"). */
export async function toggle(item) {
  const items = list(), i = items.findIndex((x) => x.slot === item.slot);
  if (i >= 0) {
    const [gone] = items.splice(i, 1);
    keep(items);
    if (auth.user() && gone.s) { const r = await auth.rpc("pd_saved_del", { p_slot: gone.slot }); if (!r.ok) write(GONE, [...new Set([...read(GONE, []), gone.slot])]); }
    return false;
  }
  const x = { slot: item.slot, title: String(item.title).slice(0, 200), day: item.day ?? null, at: Date.now() };
  keep([x, ...items]);
  if (auth.user() && consented()) { const r = await auth.rpc("pd_saved_put", { p_slot: x.slot, p_title: x.title, p_day: x.day }); if (r.ok) keep(list().map((y) => (y.slot === x.slot ? { ...y, s: 1 } : y))); }
  return true;
}

// ---------- the account's list and this browser's, brought together ----------
// Unsaves that did not reach the account go first; then what only this browser has goes up, what was in the account
// before but is not now was removed on another device, and what only the account has comes down. A change made here
// while that ran wins: the merge is dropped and done again.
let syncing = null;
export function sync() {
  if (!auth.user() || !consented()) return Promise.resolve();
  return (syncing ??= (async () => {
    for (const slot of read(GONE, [])) { const r = await auth.rpc("pd_saved_del", { p_slot: slot }); if (r.ok) write(GONE, read(GONE, []).filter((x) => x !== slot)); }
    const r = await auth.rpc("pd_saved_list");
    if (!r.ok || !Array.isArray(r.data)) return false;
    const before = JSON.stringify(list()), remote = new Map(r.data.map((x) => [x.slot, x])), out = [];
    for (const x of list()) {
      if (remote.has(x.slot)) { out.push({ ...x, s: 1 }); remote.delete(x.slot); }
      else if (!x.s) { const p = await auth.rpc("pd_saved_put", { p_slot: x.slot, p_title: x.title, p_day: x.day }); out.push(p.ok ? { ...x, s: 1 } : x); }
    }
    for (const x of remote.values()) out.push({ slot: x.slot, title: x.title, day: x.day, at: Date.parse(x.saved_at) || 0, s: 1 });
    out.sort((a, b) => b.at - a.at);
    if (JSON.stringify(list()) !== before) return true;   // changed meanwhile — again
    keep(out);
    return false;
  })().then((again) => { syncing = null; if (again) return sync(); }, () => { syncing = null; }));
}
// signed out: what belongs to the account leaves this browser (a shared computer keeps no one's list)
const forget = () => { keep(list().filter((x) => !x.s)); write(GONE, []); };

// ---------- the terms agreed to (trends/legal.mjs → POLICY_VERSION) ----------
// Asked once a tab (sessionStorage "pd.cv"); until agreed, nothing goes to the account and a line offers the consents
const consented = () => { try { return sessionStorage.getItem("pd.cv") === auth.policy; } catch { return true; } };
async function checkConsent() {
  if (!auth.user() || consented()) return true;
  const r = await auth.rpc("pd_consented", { p_version: auth.policy });
  if (r.ok && r.data === false) { notice(); return false; }
  if (r.ok) try { sessionStorage.setItem("pd.cv", auth.policy); } catch {}
  return r.ok;
}
function notice() {
  if (document.querySelector(".acct-notice") || location.pathname === "/login") return;
  const n = document.createElement("div");
  n.className = "acct-notice"; n.setAttribute("role", "status");
  n.innerHTML = `<span>이용약관 · 개인정보 처리방침이 바뀌었어요. 다시 동의하면 저장한 리서치가 계정과 이어져요.</span><a href="/login?consent=1&amp;next=${encodeURIComponent(location.pathname + location.search)}">확인하기</a>`;
  document.body.append(n);
}

// ---------- what the menus say ----------
const BOOK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v16l-5-3.5L7 20z"/></svg>';
function paintMenus() {
  const n = list().length, me = auth.user();
  for (const a of document.querySelectorAll('[data-acct="saved"]')) {
    const c = a.querySelector(".n"); if (c) c.textContent = n ? String(n) : "";
    if (a.classList.contains("ic-only")) a.setAttribute("aria-label", n ? `저장한 리서치 ${n}개` : "저장한 리서치");
  }
  for (const a of document.querySelectorAll('[data-acct="login"]')) {
    a.href = me ? "/saved#account" : `/login?next=${encodeURIComponent(location.pathname + location.hash)}`;
    if (a.classList.contains("ic-only")) a.setAttribute("aria-label", me ? `계정 · ${me.email}` : "로그인");
    else a.textContent = me ? "계정" : "로그인";
    a.classList.toggle("on", Boolean(me));
  }
}

// ---------- the 저장 button ----------
let toastTimer = 0;
function toast(text, link) {
  let t = document.querySelector(".pd-toast");
  if (!t) { t = document.createElement("div"); t.className = "pd-toast"; t.setAttribute("role", "status"); document.body.append(t); }
  t.innerHTML = ""; t.append(Object.assign(document.createElement("span"), { textContent: text }));
  if (link) t.append(Object.assign(document.createElement("a"), { href: "/saved", textContent: "저장한 리서치 보기" }));
  t.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 3200);
}
function saveButton(item) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "save-btn";
  const paint = () => {
    const on = has(item.slot);
    b.setAttribute("aria-pressed", String(on)); b.title = on ? "저장 취소" : "나중에 다시 읽게 저장";
    b.innerHTML = `${BOOK}<span>${on ? "저장됨" : "저장"}</span>`;
  };
  b.addEventListener("click", async (e) => {
    e.preventDefault(); e.stopPropagation();
    const on = await toggle(item);
    toast(on ? (auth.user() ? "저장했어요 · 어느 기기에서나" : "저장했어요") : "저장을 취소했어요", on);
  });
  addEventListener(EVENT, paint); paint();
  return b;
}
const slotOf = (href) => (String(href).match(/^\/briefs\/([0-9A-Za-z][0-9A-Za-z-]{0,40})$/) ?? [])[1] ?? null;
const text = (el) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
function placeButtons() {
  // a briefing's own page (not a draft waiting to be posted: it may yet go): under the title
  const art = document.querySelector(".art-head");
  const slot = slotOf(location.pathname);
  if (art && slot && !document.querySelector('meta[name="robots"][content*="noindex"]')) {
    const item = { slot, title: text(art.querySelector("h1")), day: slot.slice(0, 10) };
    // (next to 링크 복사 when the piece has it — social/briefs.mjs → .act-row)
    const under = () => { const row = art.querySelector(".act-row") ?? Object.assign(document.createElement("div"), { className: "save-row" }); row.prepend(saveButton(item)); if (!row.isConnected) art.append(row); };
    under();
  }
  // the home page's story: the briefing it comes from
  const st = document.querySelector("#story .st-head"), link = st?.querySelector('.st-t a[href^="/briefs/"]');
  const s2 = link && slotOf(link.getAttribute("href"));
  if (st && s2) {
    const row = document.createElement("div"); row.className = "save-row";
    row.append(saveButton({ slot: s2, title: text(link), day: st.querySelector(".st-k time")?.getAttribute("datetime") ?? s2.slice(0, 10) }));
    const lede = st.querySelector(".st-lede");
    if (lede) lede.after(row); else st.append(row);
  }
}

// ---------- /saved ----------
const md = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? ""); return m ? `${+m[2]}월 ${+m[3]}일` : ""; };
function savedPage() {
  const root = document.getElementById("saved-root");
  if (!root) return;
  const ul = root.querySelector("#sv-list"), empty = root.querySelector("#sv-empty"), acct = root.querySelector("#account");
  const draw = () => {
    const items = list();
    ul.replaceChildren(...items.map((x) => {
      const li = document.createElement("li"); li.className = "sv-item";
      const a = document.createElement("a"); a.href = `/briefs/${x.slot}`;
      a.append(Object.assign(document.createElement("span"), { className: "t", textContent: x.title }), Object.assign(document.createElement("span"), { className: "d", textContent: md(x.day) }));
      const del = document.createElement("button"); del.type = "button"; del.className = "sv-x"; del.setAttribute("aria-label", `저장 취소: ${x.title}`); del.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      del.addEventListener("click", async () => { await toggle(x); toast("저장을 취소했어요"); });
      li.append(a, del); return li;
    }));
    empty.hidden = items.length > 0; ul.hidden = !items.length;
    if (!acct) return;
    const me = auth.user();
    acct.querySelector("[data-in]").hidden = !me; acct.querySelector("[data-out-only]").hidden = Boolean(me);
    acct.querySelectorAll("[data-user]").forEach((b) => { b.textContent = me?.email ?? ""; });
  };
  addEventListener(EVENT, draw); auth.onChange(draw); draw();
  if (!acct) return;
  for (const b of acct.querySelectorAll("[data-out]")) b.addEventListener("click", async () => { await auth.signOut(); toast("로그아웃했어요"); });
  // 탈퇴: typing the address turns the button on — the account, its saved list and its consents go at once
  const del = acct.querySelector("#del"), mail = acct.querySelector("#del-email"), err = acct.querySelector("#del-err");
  mail?.addEventListener("input", () => { del.disabled = mail.value.trim().toLowerCase() !== (auth.user()?.email ?? "").toLowerCase(); err.hidden = true; });
  del?.addEventListener("click", async () => {
    del.disabled = true; del.textContent = "탈퇴하는 중…";
    const r = await auth.rpc("pd_delete_me");
    if (r.ok) {
      await auth.signOut();
      acct.querySelector("[data-out-only] b").textContent = "탈퇴했어요";
      acct.querySelector("[data-out-only] small").textContent = "계정과 저장 목록, 동의 기록을 지웠어요.";
      toast("탈퇴했어요"); return;
    }
    del.disabled = false; del.textContent = "탈퇴하기";
    err.textContent = r.status === 0 ? "로그인 서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요." : "탈퇴하지 못했어요. 다시 로그인한 뒤 시도해 주세요."; err.hidden = false;
  });
  if (location.hash === "#account") acct.scrollIntoView({ block: "start" });
}

// ---------- start ----------
placeButtons(); savedPage(); paintMenus();
addEventListener(EVENT, paintMenus);
addEventListener("DOMContentLoaded", paintMenus);   // what the page's own scripts drew after this one (the sidebar)
addEventListener("storage", (e) => { if (e.key === KEY) changed(); });
if (auth.enabled) {
  let was = auth.user()?.id ?? null;
  auth.onChange((u) => {
    paintMenus();
    if (!u && was) forget();
    else if (u && u.id !== was) checkConsent().then((ok) => ok && sync());
    was = u?.id ?? null;
  });
  if (auth.user()) checkConsent().then((ok) => ok && sync());
}
