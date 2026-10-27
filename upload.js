// upload.js — /upload?slot=<folder> (trends/pages.mjs): the operator's page for a long story, which the owner posts from
// the Instagram app (the API takes 10 cards). Signed in and an operator (public.pd_is_operator — supabase/schema.sql)
// first; only then is the post read: the cards to save on the phone in order, the caption to copy.
import * as auth from "/auth.js";

const root = document.getElementById("upload");
const show = (name) => { for (const s of root.querySelectorAll("[data-u]")) s.hidden = s.dataset.u !== name; };
const $ = (id) => document.getElementById(id), say = (t) => { $("msg").textContent = t; };

async function gate() {
  if (!auth.enabled) return show("off");
  const who = auth.user();
  if (!who) {
    root.querySelector("[data-login]").href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    return show("out");
  }
  for (const b of root.querySelectorAll("[data-who]")) b.textContent = who.email;
  const r = await auth.rpc("pd_is_operator");
  if (r.ok && r.data === true) { show("tool"); return tool(); }
  // signed out meanwhile (a revoked session), not an operator, or the check itself failed
  if (r.code === "signed_out") return gate();
  root.querySelector("[data-why]").textContent = r.ok ? "" : `확인하지 못했어요 (${r.status || "연결 끊김"}). 잠시 뒤 다시 열어 주세요.`;
  root.querySelector("[data-out]").onclick = async () => { await auth.signOut(); location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; };
  show("no");
}

async function tool() {
  const slot = new URLSearchParams(location.search).get("slot") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}(?:-\d+)?$/.test(slot)) { $("title").textContent = "주소에 게시물 폴더가 없어요"; $("lead").textContent = "예: /upload?slot=2026-10-28 — GitHub 이슈의 링크로 열어 주세요."; return; }
  const base = `/social/out/${slot}/`;
  let post;
  try { const r = await fetch(`${base}post.json`, { cache: "no-store" }); if (!r.ok) throw new Error(r.status); post = await r.json(); }
  catch { $("title").textContent = `${slot} 게시물을 찾지 못했어요`; $("lead").textContent = "사이트 배포가 끝나면(1~2분) 다시 열어 주세요."; return; }
  const n = post.images.length;
  $("title").textContent = `${slot} · 카드 ${n}장`;
  $("lead").textContent = post.published ? `이미 올라갔어요: ${post.published.permalink ?? post.published.media_id}` : n > 10 ? "인스타그램 API는 10장까지라 앱에서 직접 올려요(앱은 20장까지)." : "10장 이하라 자동으로 올라가는 게시물이에요.";
  $("save").textContent = `카드 ${n}장 저장`;
  $("cap").textContent = post.caption;
  $("grid").append(...post.images.map((f, i) => {
    const a = Object.assign(document.createElement("a"), { href: base + f, target: "_blank", rel: "noopener" });
    a.append(Object.assign(document.createElement("img"), { src: base + f, alt: `${i + 1}장`, loading: "lazy" }), Object.assign(document.createElement("span"), { textContent: i + 1 }));
    return a;
  }));

  $("copy").disabled = false;
  $("copy").onclick = async () => {
    try { await navigator.clipboard.writeText(post.caption); say("캡션을 복사했어요."); }
    catch { const r = document.createRange(); r.selectNodeContents($("cap")); getSelection().removeAllRanges(); getSelection().addRange(r); say("복사가 막혀 캡션을 선택해 뒀어요 — 길게 눌러 복사해 주세요."); }
  };

  // the cards are fetched now, so the tap that shares them keeps its user activation (a share after a slow fetch is refused)
  say("카드를 받는 중…");
  let files = null;
  try {
    files = await Promise.all(post.images.map(async (f, i) => new File([await (await fetch(base + f)).blob()], `${slot}-${String(i + 1).padStart(2, "0")}.png`, { type: "image/png" })));
  } catch { files = null; }
  const share = files && navigator.canShare?.({ files });
  $("save").disabled = false;
  say(share ? "준비됐어요." : "이 브라우저는 한 번에 저장을 못 해요 — 버튼을 누르면 한 장씩 내려받아요.");
  $("save").onclick = async () => {
    if (share) {
      // iPhone: the share sheet's "이미지 n개 저장" puts them in Photos in this order
      try { await navigator.share({ files }); say("저장했으면 인스타그램 앱에서 1장부터 순서대로 골라 주세요."); return; }
      catch (e) { if (e.name === "AbortError") return say(""); }
    }
    // no file sharing (desktop, some Android browsers): one download per card, in order
    for (const [i, f] of post.images.entries()) {
      const a = Object.assign(document.createElement("a"), { href: base + f, download: `${slot}-${String(i + 1).padStart(2, "0")}.png` });
      document.body.append(a); a.click(); a.remove();
      await new Promise((r) => setTimeout(r, 300));
    }
    say(`${n}장을 내려받았어요.`);
  };
}

if (root) {
  gate();
  // signed in or out in another tab: start over (a token refresh announces too — the same person changes nothing)
  const was = auth.user()?.id ?? null;
  auth.onChange((u) => { if ((u?.id ?? null) !== was) location.reload(); });
}
