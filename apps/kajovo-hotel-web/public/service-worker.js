self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Nová zpráva', body: event.data.text() };
  }
  const url = typeof payload.url === 'string' && /^\/(?:admin\/)?chat\/\d+$/.test(payload.url)
    ? payload.url
    : '/chat';
  event.waitUntil(self.registration.showNotification(payload.title || 'Nová zpráva', {
    body: payload.body || '',
    tag: `kajovo-chat-${url}`,
    data: { url },
    renotify: true,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  const target = typeof url === 'string' && /^\/(?:admin\/)?chat(?:\/\d+)?$/.test(url) ? url : '/chat';
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client && 'navigate' in client) {
        await client.navigate(target);
        return client.focus();
      }
    }
    return clients.openWindow(target);
  })());
});
