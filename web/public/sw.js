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
