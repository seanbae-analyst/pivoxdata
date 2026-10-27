// toc.js — a long page's contents beside it (2026-10-26, the owner: "… 사이드바"; 2026-10-27 "뉴스처럼 다 바꿔줘": the
// pages turned sideways on a phone are gone, and with them pager.js — this is what is left of it). Used by a research
// piece (social/briefs.mjs): on a wide screen (1200px and up) docked to the left of the text, following the reading;
// between 641 and 1199px a 목차 button in the top bar opens it; on a phone there is none — the piece reads top to bottom.
//   toc([{ id, title | name, group, count, pages: [[node, …]] | items: [node, …], sub(node) → { label, note } }, …])
// A chapter is found on the page by its id, else by its first node; sub() lists entries under it (each item or page).
const el = (tag, cls) => Object.assign(document.createElement(tag), cls ? { className: cls } : {});

// beside the text (html.toc-docked) and it follows the reading. An entry is a link — to #chapter or to its node's id
// (given one if it has none) — so on the pages turn() turns to it, and on the long page it scrolls there (opening a
// tab panel or a <details> the target is in). Its text is the page's own (textContent); nothing is fetched.
export function toc(chapters) {
  const root = document.documentElement, has = (nodes) => nodes?.some(Boolean);
  chapters = chapters.filter((c) => c.pages?.some(has) || c.items?.length);
  if (!chapters.length) return;
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
  // (the site's own links are the top bar's — not repeated here)
  body.append(page, nav);
  aside.append(head, body);
  document.body.classList.add("has-toc");

  // ---------- open and close (the drawer) ----------
  // a 목차 button in the top bar, for the windows between a phone (no contents panel) and a docked sidebar
  let opener = null;
  const navBtn = el("button", "nav-toc"); navBtn.type = "button"; navBtn.textContent = "목차"; navBtn.setAttribute("aria-controls", "toc");
  document.querySelector(".topbar .nav")?.append(navBtn);
  const openers = [navBtn];
  const behind = () => [document.querySelector(".wrap")].filter(Boolean);
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
    const dock = wide.matches && Boolean(main);
    if (dock) { close(false); main.before(aside); scrim.remove(); }
    else { document.body.append(scrim, aside); }
    root.classList.toggle("toc-docked", dock);
  };
  place();
  {
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
