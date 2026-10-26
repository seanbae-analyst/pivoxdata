// welcome.js — the landing on "/" (2026-10-26, "랜딩패이지 먼저 나오고 로그인 넘어가야 이쁠것같은데 pivoxmap처럼"):
// PivoxMap's cover — one wordmark on black — then what this is, then 시작하기: the sign-in when it is on (auth.js),
// otherwise straight into the app. Shown on the first visit only (trends/site.mjs → WELCOME_HEAD decides before the
// first paint); leaving it any way — 시작하기, 둘러보기, a case, a policy link — remembers that ("pd.entered"), so "/"
// opens on the app from then on. Behind it the app is already laid out (the phone's pages, the long page), kept out of
// reach (inert) until it goes.
import * as auth from "/auth.js";

const html = document.documentElement, w = document.getElementById("welcome");
if (w && html.classList.contains("welcome")) {
  const cover = w.querySelector('[data-w="cover"]'), about = w.querySelector('[data-w="about"]');
  const behind = [...document.body.children].filter((x) => x !== w && x.tagName !== "SCRIPT");
  for (const x of behind) x.inert = true;
  const entered = () => { try { localStorage.setItem("pd.entered", "1"); } catch { /* storage blocked */ } };
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // this week's cases, from the story below (the same words, the same links)
  const fill = () => {
    // (on a phone the cases are already laid out as cards, out of #story — so found by their own class)
    const box = w.querySelector(".wl-sample"), beats = [...document.querySelectorAll(".beats>li")];
    if (!box || box.childElementCount || !beats.length) return;
    const when = document.querySelector(".st-k time")?.textContent.trim();
    const head = document.createElement("p"); head.className = "wl-sk";
    head.append(Object.assign(document.createElement("b"), { textContent: "이번 주 사례" }), Object.assign(document.createElement("span"), { textContent: when ?? "" }));
    const ol = document.createElement("ol");
    for (const li of beats.slice(0, 3)) {
      const src = li.querySelector("a")?.getAttribute("href") ?? "#story", item = document.createElement("li"), a = document.createElement("a");
      a.href = src;
      for (const [sel, tag, cls] of [[".bk", "small"], ["b", "b"], ["small", "span", "src"]]) {
        const t = li.querySelector(sel)?.textContent.trim();
        if (t) a.append(Object.assign(document.createElement(tag), { textContent: t }, cls ? { className: cls } : {}));
      }
      item.append(a); ol.append(item);
    }
    box.append(head, ol);
    if (beats.length > 3) box.append(Object.assign(document.createElement("p"), { className: "wl-more", textContent: `외 ${beats.length - 3}건 · 사례마다 IT 영역과 도입 방식을 함께 적어요` }));
  };

  // the cover → what this is: a tap, Enter · Space · → · ↓, or the wheel
  const toAbout = () => {
    if (!about.hidden) return;
    fill();
    cover.hidden = true; about.hidden = false;
    if (!still()) about.classList.add("in");
    about.querySelector("h1")?.focus({ preventScroll: true });
  };
  cover.addEventListener("click", (e) => { if (!e.target.closest("a")) toAbout(); });
  addEventListener("keydown", (e) => {
    if (cover.hidden || e.altKey || e.ctrlKey || e.metaKey || e.target.closest?.("a, input")) return;
    if (["Enter", " ", "ArrowRight", "ArrowDown", "PageDown"].includes(e.key)) { e.preventDefault(); toAbout(); }
  });
  addEventListener("wheel", (e) => { if (!cover.hidden && e.deltaY > 30) toAbout(); }, { passive: true });

  // into the app; the long page skips its own cover this time (it was just seen)
  const leave = (then) => {
    entered();
    for (const x of behind) x.inert = false;
    const done = () => {
      html.classList.remove("welcome"); w.remove();
      if (!html.classList.contains("paged")) { document.getElementById("cover")?.setAttribute("hidden", ""); scrollTo({ top: 0 }); }
      then?.();
    };
    if (still()) done(); else { w.classList.add("out"); setTimeout(done, 260); }
  };
  const start = w.querySelector("[data-w-start]"), enter = w.querySelector("[data-w-enter]"), login = w.querySelector("[data-w-login]");
  if (auth.enabled && !auth.user()) {
    // 시작하기 → the sign-in (PivoxMap's /start → login); 로그인 없이 둘러보기 → the app
    login.hidden = false;
    enter.addEventListener("click", () => leave());
  } else {
    // no signing in (or already signed in): 시작하기 is the way in, and the second button opens on this week's story
    const b = Object.assign(document.createElement("button"), { type: "button", className: start.className, textContent: start.textContent });
    start.replaceWith(b);
    b.addEventListener("click", () => leave());
    enter.textContent = "이번 주 사례부터 보기";
    enter.addEventListener("click", () => leave(() => {
      if (html.classList.contains("paged")) location.hash = "#story";
      else document.getElementById("story")?.scrollIntoView({ block: "start" });
    }));
  }
  // any link out of it (시작하기 to the sign-in, a case, the policy) counts as through the door
  w.addEventListener("click", (e) => { if (e.target.closest("a[href]")) entered(); });
}
