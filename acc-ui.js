// acc-ui.js — what /login and /auth/callback share (trends/pages.mjs): one step on screen at a time, slid in like the
// app's screens (forward from the right, back from the left), and the three required consents (trends/legal.mjs →
// consentHtml): "모두 동의" ticks all three, and the button they guard comes on only when all three are ticked.

/** → go(name, back): show the step whose data-s is `name` */
export function steps(root) {
  const all = [...root.querySelectorAll(".acc-step")];
  return (name, back = false) => {
    const next = all.find((s) => s.dataset.s === name);
    if (!next || !next.hidden) return;
    for (const s of all) s.hidden = s !== next;
    next.classList.remove("in", "out"); void next.offsetWidth; next.classList.add(back ? "out" : "in");
    scrollTo({ top: 0 });
    const h = next.querySelector("h1");
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  };
}

/** wire one consent block; `changed(allTicked)` runs on every tick. → () => allTicked */
export function consent(scope, changed) {
  const box = (k) => scope.querySelector(`[data-c="${k}"]`), keys = ["terms", "privacy", "overseas"];
  const agreed = () => keys.every((k) => box(k).checked);
  box("all").addEventListener("change", (e) => { for (const k of keys) box(k).checked = e.target.checked; changed(agreed()); });
  for (const k of keys) box(k).addEventListener("change", () => { box("all").checked = agreed(); changed(agreed()); });
  return agreed;
}

/** set a message line (hidden when there is none) */
export const say = (el, text) => { if (!el) return; el.textContent = text ?? ""; el.hidden = !text; };

/** the person has been through the front door: "/" opens straight on the app from now on (index.html → #welcome) */
export const entered = () => { try { localStorage.setItem("pd.entered", "1"); } catch { /* storage blocked */ } };
