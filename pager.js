// pager.js — phones: a long page becomes pages turned sideways, like the Instagram carousel, instead of one long scroll.
// The page lists its chapters:
//   pager([{ id, name, pages: [[node, …], …] }, { id, name, lead, head, items, list }, …], { tab, fit }) → { refresh }
//   • pages — fixed pages, each the nodes moved onto it
//   • items — a list split over as many pages as it needs: each page takes what fits on this screen (measured), in a
//     fresh list() element under a copy of head; lead (nodes) opens the chapter's first page instead of the head
// One way to move around, at the bottom (the site's tab bar) — the top only says where you are: the name, the chapter
// and the page in it, with bars. Links to #<chapter id> or to anything on a page turn to that page; tab(chapter id)
// says which bottom-tab-bar item is current, and fit(page)
// may adjust a fixed page once it is laid out on this screen (e.g. fold a paragraph that does not fit).
// The same chapters make the page's sidebar (2026-10-26, the owner: "너무 넘기기만 하는 거 아니냐 … 사이드바"): its
// contents as a side panel, one tap to a chapter, a case or a card instead of swiping through everything before it —
// on every screen, long page or pages (sidebar() below). A chapter says how it reads there: title (its long name),
// group (a heading above it), count, and sub(node) → { label, note } for its entries (each item, or each fixed page).
// It runs only when <html> has the class "paged": an inline script in <head> sets it on phones before the first paint
// (so the long page never flashes) and takes it back if the pager has not started in 4 s — then, and whenever the pager
// gives up, document gets an "unpaged" event so the page's long-layout scripts can still run; "?scroll=1" keeps the long
// page. The address follows the page: a card's own id (#c-ax-industry), else the chapter (#news) with the page in it kept
// in history.state, so a shared link or the back button lands on the same page.
// refresh() lays the pages out again after a chapter's items changed (the research list's search and filters change
// which pieces are shown); on the long page it does nothing.
const el = (tag, cls) => Object.assign(document.createElement(tag), cls ? { className: cls } : {});

export function pager(chapters, { tab, fit, back = null } = {}) {
  const root = document.documentElement, has = (nodes) => nodes?.some(Boolean);
  chapters = chapters.filter((c) => c.pages?.some(has) || c.items?.length);
  const none = { refresh() {} };
  if (!root.classList.contains("paged")) { if (chapters.length) sidebar(chapters); return none; } // the long page: the sidebar only
  if (!chapters.length) { root.classList.remove("paged"); document.dispatchEvent(new Event("unpaged")); return none; }
  // screens (2026-10-26, "이쁜 앱처럼"): chapters that name a screen are shown a screen at a time, like an app — the first
  // screen is home; a link, a tile or the sidebar opens another one over it (it comes in from the side, the address and
  // the browser's back follow), and ‹ in the top bar goes back. A swipe stays inside the screen.
  const screenOf = (c) => c.screen ?? "";
  const screened = chapters.some((c) => c.screen), HOME = screenOf(chapters[0]);
  const titleOf = (s) => { const c = chapters.find((x) => screenOf(x) === s); return c?.screenTitle ?? c?.title ?? c?.name ?? ""; };
  let screen = HOME, depth = history.state?.pgr?.d ?? 0;

  const shell = el("div", "pgr"), top = el("div", "pgr-top"), lead = el("div", "pgr-lead"), where = el("button", "pgr-where"), bars = el("div", "pgr-bars"), track = el("div", "pgr-track");
  // the top bar's left: the site's name on a first screen; ‹ and where it goes back to everywhere else
  const brand = document.querySelector(".topbar .brand")?.cloneNode(true) ?? null;
  const backBtn = el("button", "pgr-back"), backName = el("span");
  backBtn.type = "button"; backBtn.setAttribute("aria-label", "뒤로");
  backBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>'; backBtn.append(backName);
  lead.append(...[brand, backBtn].filter(Boolean));
  const setLead = () => {
    const inner = screened ? screen !== HOME : Boolean(back);
    if (brand) brand.hidden = inner; backBtn.hidden = !inner;
    backName.textContent = screened ? titleOf(screen) : back?.label ?? "";
  };
  // where you are is also the way to the sidebar (its contents, one tap to anywhere)
  const here = el("span"); where.type = "button"; where.title = "목차"; where.setAttribute("aria-controls", "toc"); where.setAttribute("aria-haspopup", "dialog"); where.append(here);
  where.insertAdjacentHTML("beforeend", '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>');
  top.append(lead, where); bars.setAttribute("aria-hidden", "true"); here.setAttribute("aria-live", "polite");
  shell.append(top, bars, track);
  // before the tab bar, so the keyboard reaches the page first and the menu after it
  const tabbar = document.querySelector(".tabbar"); if (tabbar) tabbar.before(shell); else document.body.append(shell);

  let pages = [], curPage = null, curCh = null, want = null; // want: the page a turn is heading to (a re-measure keeps it)
  const add = (c, nodes) => { const p = el("section", "pg"); p.dataset.screen = screenOf(c); p.append(...nodes.filter(Boolean)); track.append(p); pages.push({ c, p }); return p; };
  const copy = (n) => { if (!n) return null; const h = n.cloneNode(true); h.removeAttribute("id"); h.querySelectorAll("[id]").forEach((x) => x.removeAttribute("id")); return h; };
  const mine = (c) => pages.filter((x) => x.c === c);
  const vis = () => (screened ? pages.filter((x) => screenOf(x.c) === screen) : pages); // the pages a swipe moves between
  const at = () => { const v = vis(); return v[Math.max(0, Math.min(v.length - 1, Math.round(track.scrollLeft / (track.clientWidth || 1))))]; };
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  // a turn to the next page or two slides; a jump further (a chapter name, a link) lands at once instead of flicking past pages
  const go = (x, smooth) => {
    const v = vis(), i = v.indexOf(x); if (i < 0) return;
    want = x;
    const instant = !smooth || Math.abs(i - v.indexOf(at())) > 2 || reduce();
    track.scrollTo({ left: i * track.clientWidth, behavior: instant ? "instant" : "smooth" });
    if (instant) paint();
  };
  // another screen: its pages only, and it comes in from the side — over the one before it (push: the browser's back
  // returns), in place of it (replace: the tab bar, a link that arrived with the address), or back to it (back)
  const show = (s, how) => {
    if (!screened || s === screen) return;
    screen = s; curPage = null;
    for (const y of pages) y.p.hidden = screenOf(y.c) !== screen;
    if (how === "push") { depth += 1; history.pushState({ ...(history.state ?? {}), pgr: { s, d: depth } }, "", location.href); }
    if (s === HOME) depth = 0; // home is a root: ‹ is not shown there, and a later screen's ‹ counts from it
    track.classList.remove("in", "out"); void track.offsetWidth;
    if (how !== "replace") track.classList.add(how === "push" ? "in" : "out");
    setLead();
  };

  function render() {
    const was = want ?? curPage, keep = was && { c: was.c, k: mine(was.c).indexOf(was) };
    track.replaceChildren(); pages = []; curPage = null;
    for (const c of chapters) {
      for (const nodes of c.pages ?? []) if (has(nodes)) { const p = add(c, nodes); fit?.(p); } // (fit?.(add(…)) would skip add without fit)
      if (!c.items?.length) continue;
      let p, list, first = true;
      const open = () => { list = c.list(); p = add(c, [...(first && c.lead ? c.lead : [copy(c.head)]), list]); first = false; };
      open();
      // fill the page until the next item would make it scroll, then start the next page with that item; an item may be
      // a few nodes that stay together (a group's heading and its first entry)
      for (const it of c.items) { const unit = [it].flat(); list.append(...unit); if (list.children.length > unit.length && p.scrollHeight > p.clientHeight + 1) { open(); list.append(...unit); } }
    }
    // measured with every page laid out; then only this screen's pages stay
    if (screened) for (const y of pages) y.p.hidden = screenOf(y.c) !== screen;
    for (const c of chapters) mine(c).forEach((x, k, all) => { x.p.setAttribute("role", "group"); x.p.setAttribute("aria-roledescription", "페이지"); x.p.setAttribute("aria-label", `${c.title ?? c.name} ${k + 1}/${all.length}`); });
    const target = keep ? mine(keep.c)[Math.min(keep.k, mine(keep.c).length - 1)] : vis()[0];
    go(target ?? vis()[0], false);
  }

  function paint() {
    const v = vis(), x = at(); if (!x) return;
    if (x === want) want = null;
    if (x === curPage) return; curPage = x;
    const { c, p } = x, ch = mine(c), kc = ch.indexOf(x);
    // only the page in view is there for the keyboard and screen readers; the others wait off to the side
    pages.forEach((y) => { y.p.inert = y !== x; });
    // the bars and the count: a screen's pages (screens), else the chapter's
    const list = screened ? v : ch, k = list.indexOf(x);
    bars.innerHTML = list.length > 1 ? list.map((_, j) => `<i${j === k ? ' class="on"' : j < k ? ' class="done"' : ""}></i>`).join("") : "";
    // (the chapter's name, unless the top bar already says it: a screen's title, or the page's ‹ label)
    const named = !screened && c.name !== back?.label;
    here.replaceChildren(...(named ? [c.name, " "] : []), ...(list.length > 1 ? [Object.assign(el("b"), { textContent: k + 1 }), `/${list.length}`] : []));
    side.mark(c.id, p);
    // the address follows the page (shareable, and the back button returns here), without a jump: the first page has
    // the plain address, a card its own id, any other page its chapter
    const own = kc > 0 && p.querySelector(":scope>[id]")?.id, first = (screened ? screen === HOME : true) && x === pages[0];
    const hash = first ? "" : `#${own || c.id}`;
    history.replaceState({ ...(history.state ?? {}), pgr: { s: screen, c: c.id, k: kc, d: depth } }, "", (hash || location.pathname + location.search));
    if (c === curCh) return;
    curCh = c;
    if (tab) { const t = tab(c.id); document.querySelectorAll(".tabbar a").forEach((y) => y.toggleAttribute("aria-current", y.dataset.tab === t)); }
  }

  // #chapter → its first page; #anything-on-a-page → that page, scrolled to it (on another screen: that screen first)
  const turn = (hash, smooth, how = "push") => {
    const id = decodeURIComponent((hash ?? "").slice(1)); if (!id) return false;
    const c = chapters.find((x) => x.id === id), t = c ? null : document.getElementById(id), p = t?.closest(".pg");
    const x = c ? pages.find((y) => y.c === c) : pages.find((y) => y.p === p);
    if (!x) return false;
    if (screened && screenOf(x.c) !== screen) { show(screenOf(x.c), how); go(x, false); } else go(x, smooth);
    if (t && t !== p) p.scrollTop += t.getBoundingClientRect().top - p.getBoundingClientRect().top - 12;
    return true;
  };
  const home = (how) => { if (screened) show(HOME, how); go(vis()[0], !screened); };
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.("a[href]"); if (!a || a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || u.pathname !== location.pathname || u.search !== location.search) return;
    // the tab bar switches screens in place; anything else opens one over this one
    const how = a.closest(".tabbar") ? "replace" : "push";
    if (!u.hash) { e.preventDefault(); home(how === "replace" ? "replace" : "back"); return; } // this page's own address: back to its first page
    if (turn(u.hash, true, how)) e.preventDefault();
  }, true);
  // ‹ — a screen goes back to the one it was opened from (the browser's back, so both agree), or home; a page with
  // `back` returns where the reader came from on this site, else to back.href
  backBtn.addEventListener("click", () => {
    if (screened) { if (depth > 0) history.back(); else home("back"); return; }
    let same = false; try { same = new URL(document.referrer).origin === location.origin; } catch {}
    if (same && history.length > 1) history.back(); else location.href = back.href;
  });
  addEventListener("popstate", (e) => {
    // an entry this page wrote carries pgr; one without it is a new #fragment (typed, or a link nobody turned) — the
    // hashchange that follows turns to it
    if (!screened || !e.state?.pgr) return;
    const st = e.state.pgr; depth = st.d ?? 0;
    const s = st?.s ?? HOME, c = st?.c && chapters.find((x) => x.id === st.c), ch = c ? mine(c) : null;
    if (s !== screen) show(s, "back");
    go(ch?.[Math.min(st.k ?? 0, ch.length - 1)] ?? vis()[0], false);
  });
  addEventListener("hashchange", () => turn(location.hash, true, "replace"));
  addEventListener("keydown", (e) => {
    // Alt+← is the browser's back, Shift+← selects text; a chart or a tab list that handles the arrows keeps them
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || root.classList.contains("toc-open") || e.target.closest?.("input,textarea,select,[contenteditable]")) return;
    // counted from the page a turn is already heading to, so two quick presses move two pages
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const v = vis(), i = v.indexOf(want ?? at()) + (e.key === "ArrowRight" ? 1 : -1); go(v[Math.max(0, Math.min(v.length - 1, i))], true); }
  });
  track.addEventListener("pointerdown", () => { want = null; }, { passive: true }); // the reader took over
  track.addEventListener("scroll", () => {
    requestAnimationFrame(paint);
    // a floating explanation (index.html's term tips) would stay behind on the old page
    const tip = document.getElementById("termtip"); if (tip && !tip.hidden) document.body.click();
  }, { passive: true, capture: true });
  track.addEventListener("animationend", () => track.classList.remove("in", "out"));

  // the sidebar: its entries are links to #chapter or #node, which turn() above already follows
  const side = sidebar(chapters, { shell, where });
  setLead();

  // pages are measured on this screen: measure again when it changes size or the web font arrives
  const arrived = location.hash, was = history.state?.pgr; // read before the first paint rewrites the address
  let size = "";
  const resized = () => { const s = `${track.clientWidth}x${track.clientHeight}`; if (s !== size) { size = s; render(); } };
  addEventListener("resize", resized);
  render(); size = `${track.clientWidth}x${track.clientHeight}`;
  // back (or a reload) on a list's later page: that page again — its address names only the chapter; otherwise the address
  const backTo = was && chapters.find((x) => x.id === was.c), mineBack = backTo && mine(backTo);
  if (mineBack?.length && (!arrived || arrived === `#${backTo.id}`)) {
    if (screened && was.s && was.s !== screen) show(was.s, "replace");
    go(mineBack[Math.min(was.k, mineBack.length - 1)], false);
  } else turn(arrived, false, "replace");
  document.fonts?.ready.then(() => { render(); });
  root.classList.add("pgr-ready");
  return { refresh: () => render() };
}

// ---------- the sidebar: the page's contents as a side panel ----------
// Built from the same chapters. On a phone it opens from the left: the tab bar's 목차, or a tap on where you are (the
// pages' top bar); between 641 and 1199px a 목차 button in the top bar opens it; wider, the long page keeps it docked
// beside the text (html.toc-docked) and it follows the reading. An entry is a link — to #chapter or to its node's id
// (given one if it has none) — so on the pages turn() turns to it, and on the long page it scrolls there (opening a
// tab panel or a <details> the target is in). Its text is the page's own (textContent); nothing is fetched.
function sidebar(chapters, { shell = null, where = null } = {}) {
  const root = document.documentElement, paged = Boolean(shell), has = (nodes) => nodes?.some(Boolean);
  const aside = el("aside", "toc"), scrim = el("div", "toc-scrim"), body = el("div", "toc-body");
  aside.id = "toc"; aside.tabIndex = -1; aside.setAttribute("aria-labelledby", "toc-title");
  const head = el("div", "toc-head"), title = el("p", "toc-title"), x = el("button", "toc-x");
  title.id = "toc-title"; title.textContent = "목차";
  x.type = "button"; x.setAttribute("aria-label", "목차 닫기"); x.textContent = "×";
  head.append(title, x);
  // the page it is the contents of: the title without the site's name
  const page = el("p", "toc-page"); page.textContent = document.title.split(" · ")[0].split(" — ")[0];
  const nav = el("nav", "toc-list"); nav.setAttribute("aria-label", "이 페이지");
  const text = (n) => (n?.textContent ?? "").replace(/\s+/g, " ").trim();
  const nodesOf = (c) => [...(c.lead ?? []), ...(c.pages ?? []).flat(), c.head, ...(c.items ?? []).flat()].filter(Boolean);
  // a long page's anchor for a chapter: the element of that id, else its first node that is on the page
  const anchorOf = (c) => document.getElementById(c.id) ?? nodesOf(c).find((n) => n.isConnected);
  let group, ul;
  const entries = [];
  for (const c of chapters) {
    if (c.toc === false) continue;
    if (!ul || (c.group ?? null) !== group) {
      group = c.group ?? null;
      if (group) nav.append(Object.assign(el("p", "toc-g"), { textContent: group }));
      ul = el("ul"); nav.append(ul);
    }
    const li = el("li"), a = el("a", "toc-c"), n = c.count ?? (c.items ? c.items.length : c.pages.filter(has).length);
    a.href = `#${c.id}`; a.dataset.c = c.id;
    a.append(Object.assign(el("span", "t"), { textContent: c.title ?? c.name }), ...(n > 1 ? [Object.assign(el("span", "n"), { textContent: n })] : []));
    li.append(a); ul.append(li);
    entries.push({ c, a, subs: [] });
    if (!c.sub) continue;
    // its entries: each item, or each fixed page's first node — at most subMax, the rest counted
    const units = c.items ? c.items.map((it) => [it].flat().find(Boolean)) : c.pages.map((p) => p.find(Boolean));
    const max = c.subMax ?? 12, sl = el("ul", "toc-subs");
    units.forEach((node, k) => {
      const s = node && c.sub(node, k);
      if (!s?.label || k >= max) return;
      node.id ||= `toc-${c.id}-${k + 1}`;
      const sa = el("a", "toc-s"); sa.href = `#${node.id}`; sa.dataset.node = node.id;
      sa.append(Object.assign(el("span", "t"), { textContent: s.label }), ...(s.note ? [Object.assign(el("small"), { textContent: s.note })] : []));
      const sli = el("li"); sli.append(sa); sl.append(sli);
      entries.at(-1).subs.push({ a: sa, node });
    });
    if (units.length > max) sl.append(Object.assign(el("li", "toc-more"), { textContent: `… 외 ${units.length - max}개` }));
    if (sl.children.length) li.append(sl);
  }
  // the site: the top bar's links (one list for both) and the app
  const site = el("nav", "toc-site"); site.setAttribute("aria-label", "사이트");
  site.append(Object.assign(el("p", "toc-g"), { textContent: "사이트" }));
  for (const l of document.querySelectorAll(".topbar .nav a")) site.append(Object.assign(el("a"), { href: l.getAttribute("href"), textContent: l.textContent }));
  site.append(Object.assign(el("a"), { href: "/#more", textContent: "방법·검산" }), Object.assign(el("a"), { href: "/briefs#alerts", textContent: "앱 설치 · 새 리서치 알림" }));
  body.append(page, nav, site);
  aside.append(head, body);
  document.body.classList.add("has-toc");

  // ---------- open and close (the drawer) ----------
  const tabBtn = document.querySelector('.tabbar [data-tab="toc"]');
  let navBtn = null, opener = null;
  if (!paged) { // a 목차 button in the top bar, for the windows between a phone and a docked sidebar
    navBtn = el("button", "nav-toc"); navBtn.type = "button"; navBtn.textContent = "목차"; navBtn.setAttribute("aria-controls", "toc");
    document.querySelector(".topbar .nav")?.append(navBtn);
  }
  const openers = [tabBtn, navBtn, where].filter(Boolean);
  const behind = () => [shell, document.querySelector(".tabbar"), document.querySelector(".wrap")].filter(Boolean);
  const isOpen = () => root.classList.contains("toc-open");
  const open = (from) => {
    if (root.classList.contains("toc-docked")) return;
    opener = from ?? document.activeElement;
    root.classList.add("toc-open"); aside.setAttribute("role", "dialog"); aside.setAttribute("aria-modal", "true");
    for (const b of behind()) if (!b.contains(aside)) b.inert = true;
    openers.forEach((b) => b.setAttribute("aria-expanded", "true"));
    (aside.querySelector("[aria-current]") ?? x).focus({ preventScroll: true });
    aside.querySelector("[aria-current]")?.scrollIntoView({ block: "center" });
  };
  const close = (refocus = true) => {
    if (!isOpen()) return;
    root.classList.remove("toc-open"); aside.removeAttribute("role"); aside.removeAttribute("aria-modal");
    for (const b of behind()) b.inert = false;
    openers.forEach((b) => b.setAttribute("aria-expanded", "false"));
    if (refocus) opener?.focus?.({ preventScroll: true });
  };
  for (const b of openers) { b.setAttribute("aria-expanded", "false"); b.addEventListener("click", (e) => { e.preventDefault(); isOpen() ? close() : open(b); }); }
  x.addEventListener("click", () => close());
  scrim.addEventListener("click", () => close());
  addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen()) { e.preventDefault(); close(); } });

  // ---------- going there ----------
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  aside.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]"); if (!a) return;
    const u = new URL(a.href, location.href);
    if (u.pathname !== location.pathname || !u.hash) { close(false); return; } // another page: just go
    if (paged) { close(false); return; } // the pages: turn() follows the link (pager's own click handler)
    // the long page: scroll to the target, first opening the tab panel or the <details> it is in
    e.preventDefault();
    const id = decodeURIComponent(u.hash.slice(1)), c = chapters.find((y) => y.id === id), t = c ? anchorOf(c) : document.getElementById(id);
    if (!t) return;
    const panel = t.closest('[role="tabpanel"]');
    if (panel?.hidden) document.querySelector(`[role="tab"][aria-controls="${panel.id}"]`)?.click();
    const d = t.closest("details"); if (d) d.open = true;
    close(false);
    t.scrollIntoView({ block: "start", behavior: reduce() ? "auto" : "smooth" });
    history.replaceState(history.state, "", `#${id}`);
  });

  // ---------- where you are ----------
  const mark = (cid, pageEl) => {
    for (const en of entries) {
      en.a.toggleAttribute("aria-current", en.c.id === cid);
      for (const s of en.subs) s.a.toggleAttribute("aria-current", en.c.id === cid && Boolean(pageEl) && pageEl.contains(s.node));
    }
  };

  // ---------- docked beside a long page on a wide screen ----------
  const main = document.querySelector(".wrap>main"), wide = matchMedia("(min-width: 1200px)");
  const place = () => {
    const dock = !paged && wide.matches && Boolean(main);
    if (dock) { close(false); main.before(aside); scrim.remove(); }
    else { document.body.append(scrim, aside); }
    root.classList.toggle("toc-docked", dock);
  };
  place();
  if (!paged) {
    wide.addEventListener?.("change", place);
    // the long page: the chapter being read is the last whose anchor has passed the top fifth of the window
    let ticking = false;
    const spy = () => {
      ticking = false;
      const line = innerHeight * 0.2; let on = null;
      for (const en of entries) { const t = anchorOf(en.c), r = t?.getBoundingClientRect(); if (r && (r.width || r.height) && r.top <= line) on = en.c.id; }
      mark(on ?? entries[0]?.c.id, null);
      for (const en of entries) for (const s of en.subs) { const r = s.node.getBoundingClientRect(); s.a.toggleAttribute("aria-current", en.c.id === on && (r.width || r.height) > 0 && r.top <= line && r.bottom > 0); }
    };
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(spy); } }, { passive: true });
    spy();
  }
  return { mark, open, close };
}
