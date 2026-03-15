#!/usr/bin/env node

const baseUrl = process.env.VERIFY_BASE_URL;
const adminEmail = process.env.VERIFY_ADMIN_EMAIL;
const adminPassword = process.env.VERIFY_ADMIN_PASSWORD;

if (!baseUrl) {
  throw new Error('VERIFY_BASE_URL is required.');
}
if (!adminEmail || !adminPassword) {
  throw new Error('VERIFY_ADMIN_EMAIL and VERIFY_ADMIN_PASSWORD are required.');
}

const normalizeBaseUrl = (value) => value.endsWith('/') ? value.slice(0, -1) : value;
const origin = normalizeBaseUrl(baseUrl);

const assertOk = async (response, label) => {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${label} failed with ${response.status}: ${body.slice(0, 500)}`);
  }
};

const parseCookieHeader = (headers) => {
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
};

const pageResponse = await fetch(`${origin}/admin/login`, {
  redirect: 'follow',
  headers: {
    'user-agent': 'kajovo-deploy-verify/1.0',
  },
});
await assertOk(pageResponse, 'GET /admin/login');
const pageBody = await pageResponse.text();
if (!pageBody.includes('<div id="root"></div>') || !pageBody.includes('/admin/assets/')) {
  throw new Error('Admin login page does not expose the expected SPA shell.');
}

const loginResponse = await fetch(`${origin}/api/auth/admin/login`, {
  method: 'POST',
  redirect: 'manual',
  headers: {
    'content-type': 'application/json',
    'user-agent': 'kajovo-deploy-verify/1.0',
  },
  body: JSON.stringify({ email: adminEmail, password: adminPassword }),
});
await assertOk(loginResponse, 'POST /api/auth/admin/login');
const loginPayload = await loginResponse.json();
if (loginPayload.email !== adminEmail || loginPayload.actor_type !== 'admin') {
  throw new Error(`Unexpected admin login payload: ${JSON.stringify(loginPayload)}`);
}

const cookieHeader = parseCookieHeader(loginResponse.headers);
if (!cookieHeader.includes('kajovo_session=')) {
  throw new Error('Admin login did not issue kajovo_session cookie.');
}

const meResponse = await fetch(`${origin}/api/auth/me`, {
  headers: {
    cookie: cookieHeader,
    'user-agent': 'kajovo-deploy-verify/1.0',
  },
});
await assertOk(meResponse, 'GET /api/auth/me');
const mePayload = await meResponse.json();
if (mePayload.email !== adminEmail || mePayload.actor_type !== 'admin') {
  throw new Error(`Unexpected /api/auth/me payload: ${JSON.stringify(mePayload)}`);
}

console.log(JSON.stringify({
  ok: true,
  baseUrl: origin,
  email: adminEmail,
  actor_type: mePayload.actor_type,
}, null, 2));
