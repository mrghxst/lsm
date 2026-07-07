self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Present so the app counts as installable; the app itself is online-only.
self.addEventListener('fetch', () => {});

self.addEventListener('push', (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    /* ignore malformed payloads */
  }
  e.waitUntil(
    self.registration.showNotification(data.title || 'Learning Space Manager', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag,
      // Same-tag notifications silently replace the one in the tray unless
      // renotify is set — without it only the first push of the day makes a
      // sound. (Chrome rejects renotify without a tag, hence the guard.)
      renotify: !!data.tag,
      data: { url: data.url || '/' },
    }),
  );
});

// Push services rotate/expire subscriptions from time to time. When that
// happens the server's next send gets a 410 and it forgets the endpoint —
// without this handler the user silently stops getting notifications until
// they toggle them off and on again. Re-subscribe and tell the server
// (the session cookie rides along on same-origin fetches).
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil(
    fetch('/api/push/key')
      .then((r) => r.json())
      .then(({ key }) =>
        self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        }),
      )
      .then((sub) =>
        fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        }),
      )
      .catch(() => {
        // signed out or permission revoked — the user re-enables manually
      }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
