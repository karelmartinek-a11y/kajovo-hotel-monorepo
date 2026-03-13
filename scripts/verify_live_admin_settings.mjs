#!/usr/bin/env node

const baseUrl = process.env.VERIFY_BASE_URL;
const adminEmail = process.env.VERIFY_ADMIN_EMAIL;
const adminPassword = process.env.VERIFY_ADMIN_PASSWORD;
const smtpTestRecipient = process.env.VERIFY_SMTP_TEST_RECIPIENT || adminEmail;
const runSmtpTest = String(process.env.VERIFY_RUN_SMTP_TEST || '').toLowerCase() === 'true';

if (!baseUrl) {
  throw new Error('VERIFY_BASE_URL is required.');
}
if (!adminEmail || !adminPassword) {
  throw new Error('VERIFY_ADMIN_EMAIL and VERIFY_ADMIN_PASSWORD are required.');
}

const normalizeBaseUrl = (value) => value.endsWith('/') ? value.slice(0, -1) : value;
const origin = normalizeBaseUrl(baseUrl);

const parseCookieParts = (headers) => {
  const raw = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  if (raw.length > 0) {
    return raw
      .map((header) => header.split(';', 1)[0]?.trim())
      .filter(Boolean);
  }
  const fallback = headers.get('set-cookie');
  if (!fallback) {
    return [];
  }
  return fallback
    .split(/,(?=[^;]+=[^;]+)/)
    .map((part) => part.split(';', 1)[0]?.trim())
    .filter(Boolean);
};

const parseCookieHeader = (headers) => parseCookieParts(headers).join('; ');

const findCookie = (headers, name) => {
  const prefix = `${name}=`;
  return parseCookieParts(headers).find((part) => part.startsWith(prefix))?.slice(prefix.length) ?? '';
};

const readJson = async (response, label, { allowError = false } = {}) => {
  const raw = await response.text();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = raw;
  }
  if (!response.ok && !allowError) {
    throw new Error(`${label} failed with ${response.status}: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`);
  }
  return parsed;
};

const pageResponse = await fetch(`${origin}/admin/login`, {
  redirect: 'follow',
  headers: { 'user-agent': 'kajovo-live-settings-check/1.0' },
});
if (!pageResponse.ok) {
  throw new Error(`GET /admin/login failed with ${pageResponse.status}`);
}

const loginResponse = await fetch(`${origin}/api/auth/admin/login`, {
  method: 'POST',
  redirect: 'manual',
  headers: {
    'content-type': 'application/json',
    'user-agent': 'kajovo-live-settings-check/1.0',
  },
  body: JSON.stringify({ email: adminEmail, password: adminPassword }),
});
const loginPayload = await readJson(loginResponse, 'POST /api/auth/admin/login');

const cookieHeader = parseCookieHeader(loginResponse.headers);
const csrfToken = findCookie(loginResponse.headers, 'kajovo_csrf');
if (!cookieHeader.includes('kajovo_session=')) {
  throw new Error('Admin login did not issue kajovo_session cookie.');
}

const authHeaders = {
  cookie: cookieHeader,
  'user-agent': 'kajovo-live-settings-check/1.0',
  ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
};

const statusResponse = await fetch(`${origin}/api/v1/admin/settings/smtp/status`, {
  headers: authHeaders,
});
const statusPayload = await readJson(statusResponse, 'GET /api/v1/admin/settings/smtp/status');

const settingsResponse = await fetch(`${origin}/api/v1/admin/settings/smtp`, {
  headers: authHeaders,
});
const settingsPayload = await readJson(settingsResponse, 'GET /api/v1/admin/settings/smtp');

let smtpTest = null;
if (runSmtpTest) {
  const smtpTestResponse = await fetch(`${origin}/api/v1/admin/settings/smtp/test-email`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ recipient: smtpTestRecipient }),
  });
  smtpTest = {
    status: smtpTestResponse.status,
    payload: await readJson(smtpTestResponse, 'POST /api/v1/admin/settings/smtp/test-email', { allowError: true }),
  };
}

console.log(JSON.stringify({
  ok: true,
  baseUrl: origin,
  login: {
    email: loginPayload.email,
    actor_type: loginPayload.actor_type,
  },
  smtp_status: statusPayload,
  smtp_settings: settingsPayload,
  smtp_test: smtpTest,
}, null, 2));
