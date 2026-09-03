/*
 * Service worker for Move Well.
 *
 * This file lives at the project root rather than in js/, even though
 * every other script belongs in js/. A service worker's default scope
 * is the folder it is served from, and GitHub Pages does not let this
 * project send a Service-Worker-Allowed header, so this is the one
 * script that has to sit next to index.html to be able to control the
 * whole app.
 */

const CACHE_VERSION = "v12";
const CACHE_NAME = "steady-strong-" + CACHE_VERSION;

// The workout data module is the single source of truth for which
// photos exist, so it is imported here rather than keeping a second,
// hand-maintained copy of the file list that could drift out of sync.
importScripts("./js/workouts.js");

function collectWorkoutAssetUrls() {
  const urls = new Set();
  WORKOUTS.forEach((workout) => {
    urls.add(workout.cover);
    workout.exercises.forEach((ex) => {
      urls.add(ex.photo);
    });
  });
  return Array.from(urls);
}

const APP_SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/workouts.js",
  "./js/main.js",
  "./manifest.webmanifest",
  "./assets/icons/favicon.ico",
  "./assets/icons/favicon-16x16.png",
  "./assets/icons/favicon-32x32.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/fonts/nunito-latin-400-normal.woff2",
  "./assets/fonts/nunito-latin-600-normal.woff2",
  "./assets/fonts/nunito-latin-700-normal.woff2",
  "./assets/fonts/nunito-latin-800-normal.woff2",
].concat(collectWorkoutAssetUrls());

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  // Navigations (opening the app, reloading) fall back to the cached
  // shell page if the network is unavailable, so the app still opens
  // offline instead of showing the browser's own error page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
