self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = {}; }
  const title = String(data.title || 'KenadHR update');
  const options = {
    body: String(data.body || 'You have a new notification.').slice(0, 220),
    icon: '/assets/logo.png',
    badge: '/assets/logo.png',
    tag: data.tag || 'kenadhr-notification',
    renotify: true,
    silent: false,
    vibrate: [100, 60, 100],
    data: { url: data.url || '/pages/staff-portal.html#overview' }
  };
  event.waitUntil((async () => {
    if (self.navigator?.setAppBadge) await self.navigator.setAppBadge(1);
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || '/pages/staff-portal.html#overview', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const matchingWindow = windows.find((client) => client.url.startsWith(self.location.origin));
    if (matchingWindow) return matchingWindow.focus().then(() => matchingWindow.navigate(destination));
    return self.clients.openWindow(destination);
  })());
});
