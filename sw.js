// sw.js — makes the site installable as an app and readable offline: pages come from the network first (they change
// every day) and fall back to the last copy seen; so do styles and scripts (a stale stylesheet would not match a new page),
// while icons and fonts are cached. Push alerts: OneSignal's worker,
// imported here so one service worker covers both (the page script registers this file, social/briefs.mjs).
// A page is kept under its address without the query — a visit from Instagram carries ?fbclid=…, and each would otherwise
// be one more full copy — only when the answer was a plain success, and at most PAGES of them (the oldest go first).
// an ad blocker or an office network that blocks OneSignal must not take offline reading down with it
try { importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js"); } catch {}
const CACHE = "ax-radar-v5", PAGES = 40;
const SHELL = ["/", "/briefs", "/ui.css", "/research.css", "/pager.js", "/terms.js", "/favicon.svg", "/icons/icon-192.png"];
// one file that fails to arrive must not stop the install (the rest still makes the app work offline)
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
const keep = (key, res) => { if (res.ok && res.type === "basic" && !res.redirected) caches.open(CACHE).then((c) => c.put(key, res)); };
// pages are the cached addresses without a file extension; past PAGES, the oldest copies go
const trim = () => caches.open(CACHE).then(async (c) => {
  const pages = (await c.keys()).filter((r) => !/\.[a-z0-9]+$/i.test(new URL(r.url).pathname) && !SHELL.includes(new URL(r.url).pathname));
  await Promise.all(pages.slice(0, Math.max(0, pages.length - PAGES)).map((r) => c.delete(r)));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (req.mode === "navigate") {
    const key = url.origin + url.pathname;
    e.respondWith(fetch(req).then((res) => { keep(key, res.clone()); trim(); return res; })
      .catch(() => caches.match(key).then((r) => r || caches.match("/briefs"))));
    return;
  }
  if (/\.(css|m?js)$/.test(url.pathname)) { e.respondWith(fetch(req).then((res) => { keep(req, res.clone()); return res; }).catch(() => caches.match(req))); return; }
  if (/\.(svg|png|woff2?)$/.test(url.pathname)) e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => { keep(req, res.clone()); return res; })));
});
