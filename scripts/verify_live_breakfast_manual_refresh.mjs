#!/usr/bin/env node

const baseUrl = process.env.VERIFY_BASE_URL;
const adminEmail = process.env.VERIFY_ADMIN_EMAIL;
const adminPassword = process.env.VERIFY_ADMIN_PASSWORD;
const timeZone = 'Europe/Prague';

if (!baseUrl) {
  throw new Error('VERIFY_BASE_URL is required.');
}
if (!adminEmail || !adminPassword) {
  throw new Error('VERIFY_ADMIN_EMAIL and VERIFY_ADMIN_PASSWORD are required.');
}

const normalizeBaseUrl = (value) => (value.endsWith('/') ? value.slice(0, -1) : value);
const origin = normalizeBaseUrl(baseUrl);

function pragueDate() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function parseCookieHeader(headers) {
  const values = [];
  const raw = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  for (const header of raw) {
    const first = header.split(';', 1)[0]?.trim();
    if (first) {
      values.push(first);
    }
  }
  if (values.length > 0) {
    return values.join('; ');
  }

  const setCookieHeader = headers.get('set-cookie');
  if (!setCookieHeader) {
    return '';
  }

  return setCookieHeader
    .split(/,(?=[^;]+=[^;]+)/)
    .map((part) => part.split(';', 1)[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

function readCookieValue(cookieHeader, name) {
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return decodeURIComponent(trimmed.slice(name.length + 1));
    }
  }
  return '';
}

async function assertJsonOk(response, label) {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${label} failed with ${response.status}: ${body.slice(0, 500)}`);
  }
  return response.json();
}

async function createSession() {
  const loginResponse = await fetch(`${origin}/api/auth/admin/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'kajovo-manual-refresh-e2e/1.0',
    },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  const loginPayload = await assertJsonOk(loginResponse, 'POST /api/auth/admin/login');
  if (loginPayload.email !== adminEmail || loginPayload.actor_type !== 'admin') {
    throw new Error(`Unexpected admin login payload: ${JSON.stringify(loginPayload)}`);
  }

  const cookieHeader = parseCookieHeader(loginResponse.headers);
  const csrfToken = readCookieValue(cookieHeader, 'kajovo_csrf');
  if (!cookieHeader.includes('kajovo_session=')) {
    throw new Error('Admin login did not issue kajovo_session cookie.');
  }
  if (!csrfToken) {
    throw new Error('Admin login did not issue kajovo_csrf cookie.');
  }

  return { cookieHeader, csrfToken };
}

async function requestJson(session, path, { method = 'GET', payload } = {}) {
  const headers = {
    cookie: session.cookieHeader,
    'user-agent': 'kajovo-manual-refresh-e2e/1.0',
  };
  if (payload !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (method !== 'GET' && method !== 'HEAD') {
    headers['x-csrf-token'] = session.csrfToken;
  }
  const response = await fetch(`${origin}${path}`, {
    method,
    headers,
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });
  const raw = await response.text();
  let parsed = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { raw };
    }
  }
  return { response, payload: parsed, raw };
}

async function pollJob(session, jobId, timeoutMs = 180000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const job = await requestJson(session, `/api/v1/breakfast/manual-refresh/${jobId}`);
    if (job.response.status !== 200) {
      throw new Error(`Job poll failed with ${job.response.status}: ${JSON.stringify(job.payload)}`);
    }
    const status = String(job.payload?.status ?? '');
    if (['succeeded', 'failed', 'cancelled'].includes(status)) {
      return job.payload;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`Manual refresh job ${jobId} did not finish within timeout`);
}

const serviceDate = pragueDate();
const session = await createSession();

const beforeSummary = await requestJson(session, `/api/v1/breakfast/daily-summary?service_date=${encodeURIComponent(serviceDate)}`);
if (beforeSummary.response.status !== 200) {
  throw new Error(`Before summary failed with ${beforeSummary.response.status}: ${JSON.stringify(beforeSummary.payload)}`);
}
const beforeStamp = String(beforeSummary.payload?.source_imported_at ?? '');

const syncSettings = await requestJson(session, '/api/v1/admin/settings/breakfast-sync');
if (syncSettings.response.status !== 200) {
  throw new Error(`Breakfast sync settings failed with ${syncSettings.response.status}: ${JSON.stringify(syncSettings.payload)}`);
}
if (syncSettings.payload?.provider !== 'better_hotel_api') {
  throw new Error(`Unexpected breakfast sync provider: ${JSON.stringify(syncSettings.payload)}`);
}

const startResponse = await requestJson(session, '/api/v1/breakfast/manual-refresh', {
  method: 'POST',
  payload: { service_date: serviceDate },
});
if (startResponse.response.status !== 202) {
  throw new Error(`Manual refresh start failed with ${startResponse.response.status}: ${JSON.stringify(startResponse.payload)}`);
}
if (!startResponse.payload?.id) {
  throw new Error(`Manual refresh start did not return a job id: ${JSON.stringify(startResponse.payload)}`);
}

const job = await pollJob(session, startResponse.payload.id);
if (job.status !== 'succeeded') {
  throw new Error(`Manual refresh job did not succeed: ${JSON.stringify(job)}`);
}

const afterSummary = await requestJson(session, `/api/v1/breakfast/daily-summary?service_date=${encodeURIComponent(serviceDate)}`);
if (afterSummary.response.status !== 200) {
  throw new Error(`After summary failed with ${afterSummary.response.status}: ${JSON.stringify(afterSummary.payload)}`);
}
const afterStamp = String(afterSummary.payload?.source_imported_at ?? '');
if (!afterStamp) {
  throw new Error('Po ruční aktualizaci chybí source_imported_at.');
}
if (beforeStamp && afterStamp === beforeStamp) {
  throw new Error(`Ruční aktualizace nepromítla nový import: ${beforeStamp}`);
}

console.log(JSON.stringify({
  ok: true,
  baseUrl: origin,
  service_date: serviceDate,
  before_source_imported_at: beforeStamp,
  after_source_imported_at: afterStamp,
  job_status: job.status,
  imported_count: job.imported_count,
  sync_provider: syncSettings.payload?.provider,
  total_orders: afterSummary.payload?.total_orders,
  total_guests: afterSummary.payload?.total_guests,
}, null, 2));
