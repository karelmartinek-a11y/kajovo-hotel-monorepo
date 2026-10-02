const BASE = '/api/v1/admin/voice-core';
export async function request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const csrf = document.cookie.split('; ').find(value => value.startsWith('kajovo_csrf='))?.split('=').slice(1).join('=') ?? '';
  const response = await fetch(`${BASE}${path}`, {method, credentials: 'include', cache: 'no-store', signal,
    headers: {'Content-Type': 'application/json', ...(method === 'GET' ? {} : {'x-csrf-token': decodeURIComponent(csrf)})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  if (!response.ok) {
    let category = response.status === 401 || response.status === 403 ? 'unauthorized' : 'request_failed';
    try {const payload = await response.json(); if (typeof payload.detail?.code === 'string') category = payload.detail.code;} catch { /* Never surface raw server error bodies. */ }
    throw {category};
  }
  return response.json() as Promise<T>;
}
