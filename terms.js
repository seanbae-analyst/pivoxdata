// terms.js — tappable words. A word the glossary explains is a .term button (trends/glossary.mjs → termify); a tap
// shows its explanation in one floating box. The explanation is read from the page itself — the glossary section on the
// home page, or on a briefing a hidden list of the words it uses (social/briefs.mjs) — so there is one text for each
// word, the glossary's. On a briefing, "용어 풀이에서 보기" goes to the home page's glossary.
(() => {
  const tip = Object.assign(document.createElement("div"), { className: "termtip", id: "termtip", hidden: true });
  tip.setAttribute("role", "tooltip");
  document.body.append(tip);
  const home = Boolean(document.getElementById("glossary"));
  let tipFor = null;
  const hide = () => { if (!tipFor) return; tipFor.setAttribute("aria-expanded", "false"); tipFor.removeAttribute("aria-describedby"); tip.hidden = true; tipFor = null; };
  document.addEventListener("click", (e) => {
    const t = e.target.closest(".term");
    if (!t) { if (!e.target.closest(".termtip")) hide(); return; }
    if (tipFor === t) { hide(); return; }
    hide();
    const g = document.getElementById(`g-${t.dataset.term}`);
    if (!g) return;
    const b = document.createElement("b"), s = document.createElement("span"), a = document.createElement("a");
    b.textContent = g.querySelector("dt").textContent;
    s.textContent = g.querySelector("dd").textContent;
    a.href = `${home ? "" : "/"}#g-${t.dataset.term}`;
    a.textContent = "용어 풀이에서 보기";
    tip.replaceChildren(b, s, document.createElement("br"), a);
    tip.hidden = false; tipFor = t; t.setAttribute("aria-expanded", "true"); t.setAttribute("aria-describedby", "termtip");
    const r = t.getBoundingClientRect(), w = tip.offsetWidth, x = Math.max(16, Math.min(r.left + scrollX, scrollX + innerWidth - w - 16));
    const below = r.bottom + tip.offsetHeight + 10 < innerHeight;
    tip.style.left = `${x}px`;
    tip.style.top = `${(below ? r.bottom + 8 : r.top - tip.offsetHeight - 8) + scrollY}px`;
  });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && tipFor) { const t = tipFor; hide(); t.focus(); } });
  addEventListener("resize", hide);
  // on the home page the word's entry lights up for a moment where the link lands
  tip.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a || !home) return;
    const g = document.getElementById(a.hash.slice(1));
    hide();
    if (g) { g.classList.remove("flash"); void g.offsetWidth; g.classList.add("flash"); setTimeout(() => g.classList.remove("flash"), 2400); }
  });
})();
