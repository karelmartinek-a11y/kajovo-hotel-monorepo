const MIN_REFRESH_INTERVAL_MS = 30_000;

function csrfToken(): string | null {
  const value = document.cookie.split('; ').find((item) => item.startsWith('kajovo_csrf='))?.split('=')[1];
  return value ? decodeURIComponent(value) : null;
}

export function attachWebActivity(onExpired: () => void): () => void {
  let lastSent = 0;
  let lastInteraction = 0;
  let sending = false;
  let pending: number | null = null;
  let disposed = false;

  const send = async (): Promise<void> => {
    if (disposed || sending || document.hidden) return;
    const token = csrfToken();
    if (!token) return;
    sending = true;
    const interactionAtSend = lastInteraction;
    try {
      const response = await fetch('/api/auth/activity', {
        method: 'POST', credentials: 'include', headers: { 'x-csrf-token': token },
      });
      if (response.status === 401 || response.status === 403) {
        onExpired();
      } else if (response.ok) {
        lastSent = Date.now();
      }
    } catch {
      // Connectivity may return; the next interaction retries without extending expiry locally.
    } finally {
      sending = false;
      if (!disposed && lastInteraction > interactionAtSend && pending === null) {
        pending = window.setTimeout(() => { pending = null; void send(); }, MIN_REFRESH_INTERVAL_MS);
      }
    }
  };

  const activity = (): void => {
    if (document.hidden) return;
    lastInteraction = Date.now();
    if (lastInteraction - lastSent >= MIN_REFRESH_INTERVAL_MS) {
      void send();
    } else if (pending === null) {
      pending = window.setTimeout(() => { pending = null; void send(); }, MIN_REFRESH_INTERVAL_MS - (lastInteraction - lastSent));
    }
  };
  const visible = (): void => { if (!document.hidden) activity(); };
  const pagehide = (): void => {
    if (lastInteraction <= lastSent) return;
    const token = csrfToken();
    if (token) void fetch('/api/auth/activity', {
      method: 'POST', credentials: 'include', keepalive: true, headers: { 'x-csrf-token': token },
    });
  };
  const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'focus', 'pageshow'];
  events.forEach((event) => window.addEventListener(event, activity, { passive: true }));
  window.addEventListener('pagehide', pagehide);
  document.addEventListener('visibilitychange', visible);
  const expiryCheck = window.setInterval(() => {
    void fetch('/api/auth/me', { credentials: 'include' })
      .then((response) => { if (response.status === 401) onExpired(); })
      .catch(() => {});
  }, 60_000);
  activity();
  return () => {
    disposed = true;
    events.forEach((event) => window.removeEventListener(event, activity));
    window.removeEventListener('pagehide', pagehide);
    document.removeEventListener('visibilitychange', visible);
    window.clearInterval(expiryCheck);
    if (pending !== null) window.clearTimeout(pending);
  };
}
