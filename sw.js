/*
 * Temporary self-destructing service worker.
 *
 * Training Arc no longer uses a service worker (data now lives in
 * Supabase, not a local cache), but any browser/device that installed
 * the old one will keep running it indefinitely, serving a stale
 * cached shell, until it is explicitly unregistered. This file exists
 * only to reach those already-installed workers, clear their caches
 * and unregister itself, then it can be deleted from the repo once
 * enough time has passed for active devices to have picked it up.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll())
      .then((clients) => {
        clients.forEach((client) => client.navigate(client.url));
      })
  );
});
