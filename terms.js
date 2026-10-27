// terms.js — tappable words. A word the glossary explains is a .term button (trends/glossary.mjs → termify); a tap
// shows its explanation. The explanation is read from the page itself — the glossary section on the home page, or on a
// briefing a hidden list of the words it uses (social/briefs.mjs) — so there is one text for each word, the glossary's.
// On a wide screen it floats beside the word; on a phone it comes up as a sheet from the bottom (2026-10-26: a window of
// its own, not a box squeezed beside a word), and so does an entry of the glossary's phone pages, which show the words
// only — a tap opens one. On a briefing, "용어 풀이에서 보기" goes to the home page's glossary.
(() => {
  const home = Boolean(document.getElementById("glossary"));
  const phone = () => matchMedia("(max-width: 640px)").matches;
  const make = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text != null ? { textContent: text } : {});
  // what a glossary entry (#g-<id>) says: its word, its explanation, and the briefing it came from (if one added it)
  const entry = (g) => ({ term: g.querySelector("dt")?.textContent ?? "", def: g.querySelector("dd:not(.gl-from)")?.textContent ?? "", from: g.querySelector(".gl-from a"), id: g.id.replace(/^g-/, "") });

  // ---------- beside the word (wide screens) ----------
  const tip = make("div", "termtip");
  tip.id = "termtip"; tip.hidden = true; tip.setAttribute("role", "tooltip");
  document.body.append(tip);
  let tipFor = null;
  const hide = () => { if (!tipFor) return; tipFor.setAttribute("aria-expanded", "false"); tipFor.removeAttribute("aria-describedby"); tip.hidden = true; tipFor = null; };
  const float = (t, e) => {
    const a = make("a", null, "용어 풀이에서 보기");
    a.href = `${home ? "" : "/"}#g-${e.id}`;
    tip.replaceChildren(make("b", null, e.term), make("span", null, e.def), document.createElement("br"), a);
    tip.hidden = false; tipFor = t; t.setAttribute("aria-expanded", "true"); t.setAttribute("aria-describedby", "termtip");
    const r = t.getBoundingClientRect(), w = tip.offsetWidth, x = Math.max(16, Math.min(r.left + scrollX, scrollX + innerWidth - w - 16));
    const below = r.bottom + tip.offsetHeight + 10 < innerHeight;
    tip.style.left = `${x}px`;
    tip.style.top = `${(below ? r.bottom + 8 : r.top - tip.offsetHeight - 8) + scrollY}px`;
  };

  // ---------- a sheet from the bottom (phones) ----------
  const sheet = make("div", "sheet"), inner = make("div", "sheet-in");
  sheet.hidden = true; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-labelledby", "sheet-t");
  sheet.append(inner); document.body.append(sheet);
  let sheetFrom = null;
  const shut = () => { if (sheet.hidden) return; sheet.hidden = true; sheetFrom?.focus?.({ preventScroll: true }); sheetFrom = null; };
  const up = (from, e) => {
    const t = make("p", "sheet-t", e.term), x = make("button", "sheet-x", "닫기"), links = [];
    t.id = "sheet-t"; x.type = "button"; x.addEventListener("click", shut);
    if (e.from) { const a = make("a", "sheet-a", e.from.textContent); a.href = e.from.getAttribute("href"); links.push(a); }
    if (!home || !from.closest("#glossary, .pg .gl-list")) { const a = make("a", "sheet-a", "용어 풀이에서 보기"); a.href = `${home ? "" : "/"}#g-${e.id}`; a.addEventListener("click", shut); links.push(a); }
    inner.replaceChildren(make("p", "sheet-k", "용어 풀이"), t, make("p", "sheet-d", e.def), ...links.flatMap((a, i) => (i ? [document.createElement("br"), a] : [a])), x);
    sheetFrom = from; sheet.hidden = false; x.focus({ preventScroll: true });
  };
  sheet.addEventListener("click", (ev) => { if (ev.target === sheet) shut(); });

  document.addEventListener("click", (ev) => {
    // an entry of the glossary's phone pages (the word only): its explanation in a sheet
    const gl = ev.target.closest(".pg .gl");
    if (gl && !ev.target.closest("a")) { ev.preventDefault(); up(gl, entry(gl)); return; }
    const t = ev.target.closest(".term");
    if (!t) { if (!ev.target.closest(".termtip")) hide(); return; }
    if (tipFor === t) { hide(); return; }
    hide();
    const g = document.getElementById(`g-${t.dataset.term}`);
    if (!g) return;
    if (phone()) up(t, entry(g)); else float(t, entry(g));
  });
  // the glossary's phone entries are buttons for the keyboard too
  const keyable = () => document.querySelectorAll(".pg .gl").forEach((g) => { if (!g.hasAttribute("tabindex")) { g.tabIndex = 0; g.setAttribute("role", "button"); } });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") { if (!sheet.hidden) { ev.preventDefault(); shut(); } else if (tipFor) { const t = tipFor; hide(); t.focus(); } return; }
    const g = ev.target.closest?.(".pg .gl");
    if (g && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); up(g, entry(g)); }
  });
  addEventListener("resize", hide);
  if (document.readyState === "complete") keyable(); else addEventListener("load", keyable);
  setTimeout(keyable, 1500); // the phone pages are laid out a moment after load
  // on the home page the word's entry lights up for a moment where the link lands
  tip.addEventListener("click", (ev) => {
    const a = ev.target.closest("a");
    if (!a || !home) return;
    const g = document.getElementById(a.hash.slice(1));
    hide();
    if (g) { g.classList.remove("flash"); void g.offsetWidth; g.classList.add("flash"); setTimeout(() => g.classList.remove("flash"), 2400); }
  });
})();
