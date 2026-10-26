// account.js — on every page (trends/site.mjs → FOOTER): briefings saved to read again (2026-10-26). They live in this
// browser (localStorage "pd.saved"); signing in, which would carry them to other devices, is its own piece of work
// (owner, 2026-10-26: "로그인페이지만 따로해"). What it draws: the 저장 button under a briefing's title (on a phone, a
// round icon in the top bar) and under the home page's story, the count in the menus ([data-acct="saved"] — the top
// bar, the phone's sidebar, the home screen), and the /saved page.

const KEY = "pd.saved", EVENT = "pd:saved";
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) ?? "null") ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };
const changed = () => dispatchEvent(new Event(EVENT));

/** the saved briefings, newest first: {slot, title, day, at} */
export const list = () => (Array.isArray(read(KEY, [])) ? read(KEY, []) : []).filter((x) => x && typeof x.slot === "string" && typeof x.title === "string");
export const has = (slot) => list().some((x) => x.slot === slot);
const keep = (items) => { write(KEY, items); changed(); };

/** save or unsave a briefing ({slot, title, day}) → saved now? */
export function toggle(item) {
  const items = list(), i = items.findIndex((x) => x.slot === item.slot);
  if (i >= 0) { items.splice(i, 1); keep(items); return false; }
  keep([{ slot: item.slot, title: String(item.title).slice(0, 200), day: item.day ?? null, at: Date.now() }, ...items]);
  return true;
}

// ---------- what the menus say ----------
const BOOK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v16l-5-3.5L7 20z"/></svg>';
function paintMenus() {
  const n = list().length;
  for (const a of document.querySelectorAll('[data-acct="saved"]')) {
    const c = a.querySelector(".n"); if (c) c.textContent = n ? String(n) : "";
    if (a.classList.contains("ic-only")) a.setAttribute("aria-label", n ? `저장한 브리핑 ${n}개` : "저장한 브리핑");
  }
}

// ---------- the 저장 button ----------
let toastTimer = 0;
function toast(text, link) {
  let t = document.querySelector(".pd-toast");
  if (!t) { t = document.createElement("div"); t.className = "pd-toast"; t.setAttribute("role", "status"); document.body.append(t); }
  t.innerHTML = ""; t.append(Object.assign(document.createElement("span"), { textContent: text }));
  if (link) t.append(Object.assign(document.createElement("a"), { href: "/saved", textContent: "저장한 브리핑 보기" }));
  t.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 3200);
}
// `icon`: the round icon of a phone's top bar (its words go to the screen reader)
function saveButton(item, icon = false) {
  const b = document.createElement("button");
  b.type = "button"; b.className = icon ? "save-ic" : "save-btn";
  const paint = () => {
    const on = has(item.slot);
    b.setAttribute("aria-pressed", String(on)); b.title = on ? "저장 취소" : "나중에 다시 읽게 저장";
    b.innerHTML = icon ? BOOK : `${BOOK}<span>${on ? "저장됨" : "저장"}</span>`;
    if (icon) b.setAttribute("aria-label", on ? "저장됨 — 누르면 저장 취소" : "저장");
  };
  b.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    const on = toggle(item);
    toast(on ? "저장했어요" : "저장을 취소했어요", on);
  });
  addEventListener(EVENT, paint); paint();
  return b;
}
const slotOf = (href) => (String(href).match(/^\/briefs\/([0-9A-Za-z][0-9A-Za-z-]{0,40})$/) ?? [])[1] ?? null;
const text = (el) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
function placeButtons() {
  const paged = () => document.documentElement.classList.contains("paged");
  // a briefing's own page (not a draft waiting to be posted: it may yet go). On a phone its pages are already laid out
  // (the page's pager runs first) and the button is a round icon in the top bar, there on every page of the piece and
  // costing the title page no room; a phone whose pages never started (unpaged) gets it under the title instead.
  const art = document.querySelector(".art-head");
  const slot = slotOf(location.pathname);
  if (art && slot && !document.querySelector('meta[name="robots"][content*="noindex"]')) {
    const item = { slot, title: text(art.querySelector("h1")), day: slot.slice(0, 10) };
    const under = () => { const row = document.createElement("div"); row.className = "save-row"; row.append(saveButton(item)); art.append(row); };
    const where = paged() && document.querySelector(".pgr-top .pgr-where");
    if (where) {
      const b = saveButton(item, true);
      where.before(b);
      document.addEventListener("unpaged", () => { b.remove(); under(); }, { once: true });
    } else under();
  }
  // the home page's story: the briefing it comes from — on the long page only (a phone's story page has no room to
  // spare, and its cases lead to the briefing, which has the button)
  const st = document.querySelector("#story .st-head"), link = st?.querySelector('.st-t a[href^="/briefs/"]');
  const s2 = link && slotOf(link.getAttribute("href"));
  if (st && s2 && !paged()) {
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
  const ul = root.querySelector("#sv-list"), empty = root.querySelector("#sv-empty");
  const draw = () => {
    const items = list();
    ul.replaceChildren(...items.map((x) => {
      const li = document.createElement("li"); li.className = "sv-item";
      const a = document.createElement("a"); a.href = `/briefs/${x.slot}`;
      a.append(Object.assign(document.createElement("span"), { className: "t", textContent: x.title }), Object.assign(document.createElement("span"), { className: "d", textContent: md(x.day) }));
      const del = document.createElement("button"); del.type = "button"; del.className = "sv-x"; del.setAttribute("aria-label", `저장 취소: ${x.title}`); del.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      del.addEventListener("click", () => { toggle(x); toast("저장을 취소했어요"); });
      li.append(a, del); return li;
    }));
    empty.hidden = items.length > 0; ul.hidden = !items.length;
  };
  addEventListener(EVENT, draw); draw();
}

// ---------- start ----------
placeButtons(); savedPage(); paintMenus();
addEventListener(EVENT, paintMenus);
addEventListener("DOMContentLoaded", paintMenus);   // what the page's own scripts drew after this one (the home screen, the sidebar)
addEventListener("storage", (e) => { if (e.key === KEY) changed(); });
