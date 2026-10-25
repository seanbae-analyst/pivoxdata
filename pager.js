// pager.js — phones: a long page becomes pages turned sideways, like the Instagram carousel, instead of one long scroll.
// The page lists its chapters:
//   pager([{ id, name, pages: [[node, …], …] }, { id, name, lead, head, items, list }, …], { tab, fit })
//   • pages — fixed pages, each the nodes moved onto it
//   • items — a list split over as many pages as it needs: each page takes what fits on this screen (measured), in a
//     fresh list() element under a copy of head; lead (nodes) opens the chapter's first page instead of the head
// The chapter names on top jump to a chapter and the bars under them show the page within it. Links to #<chapter id>
// or to anything on a page turn to that page; tab(chapter id) says which bottom-tab-bar item is current, and fit(page)
// may adjust a fixed page once it is laid out on this screen (e.g. fold a paragraph that does not fit).
// It runs only when <html> has the class "paged": an inline script in <head> sets it on phones before the first paint
// (so the long page never flashes) and takes it back if the pager has not started in 4 s; "?scroll=1" keeps the long page.
const el = (tag, cls) => Object.assign(document.createElement(tag), cls ? { className: cls } : {});

export function pager(chapters, { tab, fit } = {}) {
  const root = document.documentElement, has = (nodes) => nodes?.some(Boolean);
  chapters = chapters.filter((c) => c.pages?.some(has) || c.items?.length);
  if (!root.classList.contains("paged")) return;
  if (!chapters.length) { root.classList.remove("paged"); return; }
  const shell = el("div", "pgr"), nav = el("nav", "pgr-ch"), bars = el("div", "pgr-bars"), track = el("div", "pgr-track");
  nav.setAttribute("aria-label", "차례");
  for (const c of chapters) { const a = Object.assign(el("a"), { href: `#${c.id}`, textContent: c.name }); a.dataset.ch = c.id; nav.append(a); }
  bars.setAttribute("aria-hidden", "true");
  shell.append(nav, bars, track);
  document.body.append(shell);

  let pages = [], cur = -1, curCh = null, want = null; // want: the page a turn is heading to (a re-measure keeps it)
  const add = (c, nodes) => { const p = el("section", "pg"); p.append(...nodes.filter(Boolean)); track.append(p); pages.push({ c, p }); return p; };
  const copy = (n) => { if (!n) return null; const h = n.cloneNode(true); h.removeAttribute("id"); h.querySelectorAll("[id]").forEach((x) => x.removeAttribute("id")); return h; };
  const mine = (c) => pages.filter((x) => x.c === c);
  const at = () => Math.max(0, Math.min(pages.length - 1, Math.round(track.scrollLeft / (track.clientWidth || 1))));
  // a turn to the next page or two slides; a jump further (a chapter name, a link) lands at once instead of flicking past pages
  const go = (i, smooth) => (want = pages[i]) && track.scrollTo({ left: i * track.clientWidth, behavior: smooth && Math.abs(i - at()) <= 2 && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant" });

  function render() {
    const was = want ?? pages[cur], keep = was && { c: was.c, k: mine(was.c).indexOf(was) };
    track.replaceChildren(); pages = []; cur = -1;
    for (const c of chapters) {
      for (const nodes of c.pages ?? []) if (has(nodes)) { const p = add(c, nodes); fit?.(p); } // (fit?.(add(…)) would skip add without fit)
      if (!c.items?.length) continue;
      let p, list, first = true;
      const open = () => { list = c.list(); p = add(c, [...(first && c.lead ? c.lead : [copy(c.head)]), list]); first = false; };
      open();
      // fill the page until the next item would make it scroll, then start the next page with that item
      for (const it of c.items) { list.append(it); if (list.children.length > 1 && p.scrollHeight > p.clientHeight + 1) { open(); list.append(it); } }
    }
    for (const c of chapters) mine(c).forEach((x, k, all) => { x.p.setAttribute("role", "group"); x.p.setAttribute("aria-roledescription", "페이지"); x.p.setAttribute("aria-label", `${c.name} ${k + 1}/${all.length}`); });
    const i = keep ? pages.indexOf(mine(keep.c)[Math.min(keep.k, mine(keep.c).length - 1)]) : 0;
    go(Math.max(0, i), false); paint();
  }

  function paint() {
    const i = at(); if (pages[i] === want) want = null;
    if (i === cur || !pages[i]) return; cur = i;
    const { c } = pages[i], list = mine(c), k = list.indexOf(pages[i]);
    bars.innerHTML = list.map((_, j) => `<i${j === k ? ' class="on"' : j < k ? ' class="done"' : ""}></i>`).join("");
    if (c === curCh) return;
    curCh = c;
    for (const a of nav.children) a.toggleAttribute("aria-current", a.dataset.ch === c.id);
    const a = nav.querySelector(`[data-ch="${c.id}"]`);
    if (a.offsetLeft < nav.scrollLeft || a.offsetLeft + a.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollTo({ left: a.offsetLeft - 16, behavior: "smooth" });
    // the address follows the chapter (shareable), without a jump
    history.replaceState(history.state, "", c === chapters[0] ? location.pathname + location.search : `#${c.id}`);
    if (tab) { const t = tab(c.id); document.querySelectorAll(".tabbar a").forEach((x) => x.toggleAttribute("aria-current", x.dataset.tab === t)); }
  }

  // #chapter → its first page; #anything-on-a-page → that page, scrolled to it
  const turn = (hash, smooth) => {
    const id = decodeURIComponent((hash ?? "").slice(1)); if (!id) return false;
    const c = chapters.find((x) => x.id === id), t = c ? null : document.getElementById(id), p = t?.closest(".pg");
    const i = c ? pages.findIndex((x) => x.c === c) : pages.findIndex((x) => x.p === p);
    if (i < 0) return false;
    go(i, smooth);
    if (t && t !== p) p.scrollTop += t.getBoundingClientRect().top - p.getBoundingClientRect().top - 12;
    return true;
  };
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.("a[href]"); if (!a || a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || u.pathname !== location.pathname || u.search !== location.search) return;
    if (!u.hash) { e.preventDefault(); go(0, true); return; } // this page's own address (the tab bar): back to the first page
    if (turn(u.hash, true)) e.preventDefault();
  }, true);
  addEventListener("hashchange", () => turn(location.hash, true));
  addEventListener("keydown", (e) => {
    if (e.target.closest?.("input,textarea,select,[contenteditable]")) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); go(Math.max(0, Math.min(pages.length - 1, at() + (e.key === "ArrowRight" ? 1 : -1))), true); }
  });
  track.addEventListener("pointerdown", () => { want = null; }, { passive: true }); // the reader took over
  track.addEventListener("scroll", () => {
    requestAnimationFrame(paint);
    // a floating explanation (index.html's term tips) would stay behind on the old page
    const tip = document.getElementById("termtip"); if (tip && !tip.hidden) document.body.click();
  }, { passive: true, capture: true });

  // pages are measured on this screen: measure again when it changes size or the web font arrives
  const arrived = location.hash; // read before the first paint rewrites the address
  let size = "";
  const resized = () => { const s = `${track.clientWidth}x${track.clientHeight}`; if (s !== size) { size = s; render(); } };
  addEventListener("resize", resized);
  render(); size = `${track.clientWidth}x${track.clientHeight}`;
  turn(arrived, false);
  document.fonts?.ready.then(() => { render(); });
  root.classList.add("pgr-ready");
}
