// sw.js — makes the site installable as an app and readable offline: pages come from the network first (they change
// every day) and fall back to the last copy seen; so do styles and scripts (a stale stylesheet would not match a new page),
// while icons and fonts are cached. Push alerts: OneSignal's worker,
// imported here so one service worker covers both (the page script registers this file, social/briefs.mjs).
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
const CACHE = "ax-radar-v3";
const SHELL = ["/", "/briefs", "/ui.css", "/research.css", "/pager.js", "/favicon.svg", "/icons/icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  const fresh = () => fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; });
  if (req.mode === "navigate") { e.respondWith(fresh().catch(() => caches.match(req).then((r) => r || caches.match("/briefs")))); return; }
  if (/\.(css|m?js)$/.test(url.pathname)) { e.respondWith(fresh().catch(() => caches.match(req))); return; }
  if (/\.(svg|png|woff2?)$/.test(url.pathname)) e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
});
