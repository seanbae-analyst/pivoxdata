// auth.js — signing in (2026-10-26, "랜딩 먼저 나오고 로그인 넘어가게 — pivoxmap처럼"): Supabase Auth's e-mail link,
// without a library — the handful of calls this site makes. The project and its publishable key (public by design,
// like OneSignal's app id) come from <meta name="pd-auth"> (trends/site.mjs → AUTH); without it there is no signing
// in anywhere: no menu, no login step after the landing, no login part in the privacy policy.
// A session is made in one place only, /auth/callback, from what the e-mail link brings back: a token_hash (the e-mail
// template in supabase/README.md — opens on any device) or a PKCE code (Supabase's default template — only in the
// browser that asked). An #access_token in an address is never taken: anyone can send a link that carries their own
// session, and whoever opens it would be signed in to that account (PivoxMap's 2026-09-11 security review).
// The session lives in this browser's localStorage, like supabase-js, and is refreshed shortly before it runs out.
// The saved briefings and the consent go through public.pd_* functions (supabase/schema.sql), each of which reads and
// writes only the caller's own rows.
const [BASE, KEY] = (document.querySelector('meta[name="pd-auth"]')?.content ?? "").trim().split(/\s+/);
export const enabled = Boolean(BASE && KEY);
export const policy = document.querySelector('meta[name="pd-policy"]')?.content ?? "";
export const CALLBACK = "/auth/callback";
const SESSION = "pd.session", VERIFIER = "pd.pkce", PENDING = "pd.consent", NEXT = "pd.next", EVENT = "pd:auth";

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) ?? "null"); } catch { return null; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };
const announce = () => dispatchEvent(new Event(EVENT));

// one call to the project: the publishable key always, the person's token when signed in. Never throws — a network
// failure is status 0 (supabase-js reports it the same way, as an error without a status)
async function call(path, { body, token } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body ?? {}) });
  } catch { return { ok: false, status: 0, code: "network" }; }
  let data = null;
  try { const t = await res.text(); data = t ? JSON.parse(t) : null; } catch { /* not JSON */ }
  return res.ok ? { ok: true, status: res.status, data } : { ok: false, status: res.status, code: String(data?.error_code ?? data?.code ?? data?.error ?? ""), data };
}

// what is kept of a session: the two tokens, when the access token runs out, and who it is
function keep(s) {
  if (!s?.access_token || !s?.refresh_token || !s.user?.id) return null;
  const v = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at ?? Math.floor(Date.now() / 1000) + (s.expires_in ?? 3600), user: { id: s.user.id, email: s.user.email ?? "" } };
  write(SESSION, v); announce();
  return v;
}

/** who is signed in in this browser ({id, email}), or null — read without waiting (a menu draws from it) */
export const user = () => (enabled ? read(SESSION)?.user ?? null : null);

let refreshing = null;
/** the session, refreshed first when it runs out within a minute; null when signed out. A refresh token that was used up
 *  or revoked (signed out elsewhere, the account deleted) signs out here too; a network failure keeps the session. */
export async function session() {
  if (!enabled) return null;
  const s = read(SESSION);
  if (!s) return null;
  if (s.expires_at * 1000 - Date.now() > 60_000) return s;
  refreshing ??= call("/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: s.refresh_token } }).then((r) => {
    refreshing = null;
    if (r.ok) return keep(r.data);
    if (r.status >= 400 && r.status < 500 && read(SESSION)?.refresh_token === s.refresh_token) { write(SESSION, null); announce(); }
    return null;
  });
  return refreshing;
}

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** send the sign-in link. Supabase makes the account the first time an address asks. `next`: where the callback goes
 *  afterwards (kept in this browser — a link opened on another device goes home). → {ok} or {ok:false, why} with why
 *  "rate" (asked too often), "network" or "failed". */
export async function sendLink(email, next) {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const r = await call(`/auth/v1/otp?redirect_to=${encodeURIComponent(location.origin + CALLBACK)}`,
    { body: { email, create_user: true, data: {}, code_challenge: challenge, code_challenge_method: "s256" } });
  if (r.ok) {
    // only once the link has gone: a failed resend must not replace what the earlier, still good, link needs
    write(VERIFIER, { v: verifier, at: Date.now() });
    write(NEXT, safeNext(next, "") || null);
    return { ok: true };
  }
  return { ok: false, why: r.status === 429 || /rate_limit/.test(r.code) ? "rate" : r.status === 0 ? "network" : "failed" };
}

/** /auth/callback: turn what the link brought into a session. The address is cleaned first, so nothing of the link stays
 *  in the history. → {user} or {failure} with failure "expired", "other_browser", "network" or "failed". */
export async function complete() {
  const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.slice(1));
  const th = q.get("token_hash"), type = q.get("type"), code = q.get("code"), err = q.get("error_code") ?? h.get("error_code");
  history.replaceState(null, "", location.pathname);
  let r;
  if (th && ["email", "magiclink", "signup"].includes(type)) r = await call("/auth/v1/verify", { body: { type, token_hash: th } });
  else if (code) {
    const v = read(VERIFIER);
    if (!v) return { failure: "other_browser" };
    r = await call("/auth/v1/token?grant_type=pkce", { body: { auth_code: code, code_verifier: v.v } });
    if (r.ok) write(VERIFIER, null);
  } else return { failure: err === "otp_expired" ? "expired" : "failed" };
  if (r.ok && keep(r.data)) return { user: user() };
  return { failure: r.code === "otp_expired" ? "expired" : /flow_state|code_verifier/.test(r.code) ? "other_browser" : r.status === 0 ? "network" : "failed" };
}

/** sign out in this browser (the server forgets this session too, when it can be reached) */
export async function signOut() {
  const s = read(SESSION);
  write(SESSION, null); announce();
  if (s) await call("/auth/v1/logout?scope=local", { token: s.access_token });
}

/** call one of the public.pd_* functions as the signed-in person; an access token the server no longer takes is
 *  refreshed once and the call tried again */
export async function rpc(fn, args = {}) {
  let s = await session();
  if (!s) return { ok: false, status: 401, code: "signed_out" };
  let r = await call(`/rest/v1/rpc/${fn}`, { body: args, token: s.access_token });
  if (r.status === 401) {
    write(SESSION, { ...s, expires_at: 0 });
    s = await session();
    if (s) r = await call(`/rest/v1/rpc/${fn}`, { body: args, token: s.access_token });
  }
  return r;
}

/** run `cb(user)` whenever signing in or out happens — in this tab or another one */
export function onChange(cb) {
  addEventListener(EVENT, () => cb(user()));
  addEventListener("storage", (e) => { if (e.key === SESSION || e.key === null) cb(user()); });
}

// ---------- consent given on /login, recorded by the callback ----------
// Who agreed (the address) and when are kept too, for an hour (a link's life): on a shared browser the person before
// must not have their consent written to the next person's account. A link opened on another device has none of
// this, so the callback asks there.
export const setPendingConsent = (email) => write(PENDING, email ? { v: policy, email: email.trim().toLowerCase(), at: Date.now() } : null);
export function pendingConsent(email) {
  const p = read(PENDING), age = Date.now() - (p?.at ?? 0);
  return Boolean(p && email && p.v === policy && p.email === email.trim().toLowerCase() && age >= 0 && age <= 3600e3);
}
/** where to go after signing in, kept by sendLink; read once */
export function takeNext() { const n = read(NEXT); write(NEXT, null); return safeNext(n, "/"); }

/** a path on this site only — not `//elsewhere`, not `/\elsewhere`, not the sign-in pages themselves (a `next` that is
 *  someone's /auth/callback link would sign this browser in to their account) */
export function safeNext(n, fallback = "/") {
  const off = (p) => typeof p !== "string" || !p.startsWith("/") || p.startsWith("//") || p.includes("\\");
  if (off(n)) return fallback;
  try {
    const u = new URL(n, "https://same.invalid"), out = u.pathname + u.search + u.hash;
    let path = u.pathname; try { path = decodeURIComponent(path); } catch { /* keep it as it is */ }
    return u.origin === "https://same.invalid" && !off(out) && !/^\/(auth\/callback|login)(\/|$)/i.test(path) ? out : fallback;
  } catch { return fallback; }
}
