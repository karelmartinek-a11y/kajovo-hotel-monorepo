
async function transport<T>(base: string, path: string, method = 'GET', body?: unknown, signal?: AbortSignal, extraHeaders?: Record<string,string>): Promise<T> {
  const csrf = document.cookie.split('; ').find(value => value.startsWith('kajovo_csrf='))?.split('=').slice(1).join('=') ?? '';
  const response = await fetch(`${base}${path}`, {method, credentials: 'include', cache: 'no-store', signal,
    headers: {...(body instanceof Blob ? {} : {'Content-Type': 'application/json'}), ...extraHeaders, ...(method === 'GET' ? {} : {'x-csrf-token': decodeURIComponent(csrf)})},
    ...(body === undefined ? {} : {body: body instanceof Blob ? body : JSON.stringify(body)})});
  if (!response.ok) {
    let category = response.status === 401 || response.status === 403 ? 'unauthorized' : 'request_failed';
    try {const payload = await response.json(); if (typeof payload.detail?.code === 'string') category = payload.detail.code;} catch { /* Never surface raw server error bodies. */ }
    throw {category};
  }
  if(response.headers.get('Content-Type')?.includes('application/x-tar')) return response as T;
  return response.json() as Promise<T>;
}

export const request = <T,>(path:string,method='GET',body?:unknown,signal?:AbortSignal,headers?:Record<string,string>) => transport<T>('/api/v1/admin/voice-core',path,method,body,signal,headers);
export const memoryRequest = <T,>(path:string,method='GET',body?:unknown,signal?:AbortSignal,headers?:Record<string,string>) => transport<T>('/api/v1/admin/voice-memory',path,method,body,signal,{...(method==='GET'?{}:{'x-dagmar-operation-id':crypto.randomUUID()}),...headers});
