/* Service Worker placeholder for WebTorrent streaming.
 *
 * WebTorrent's client-side code injects its own request interception logic
 * into the active service worker at runtime. This file just needs to handle
 * the install and activate lifecycle events so the browser accepts the
 * registration.
 */

self.addEventListener('install', () => {
  // Activate immediately without waiting for existing clients to close
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of all pages immediately
  event.waitUntil(self.clients.claim());
});
