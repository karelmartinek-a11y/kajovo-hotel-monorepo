#!/usr/bin/env node

const baseUrl = process.env.VERIFY_BASE_URL;
const adminEmail = process.env.VERIFY_ADMIN_EMAIL;
const adminPassword = process.env.VERIFY_ADMIN_PASSWORD;
const deploySha = process.env.VERIFY_DEPLOY_SHA ?? 'unknown';
const runId = process.env.GITHUB_RUN_ID ?? 'local';

if (!baseUrl) {
  throw new Error('VERIFY_BASE_URL is required.');
}
if (!adminEmail || !adminPassword) {
  throw new Error('VERIFY_ADMIN_EMAIL and VERIFY_ADMIN_PASSWORD are required.');
}

const normalizeBaseUrl = (value) => (value.endsWith('/') ? value.slice(0, -1) : value);
const origin = normalizeBaseUrl(baseUrl);
const smokeId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const testEmail = `deploy.users.${smokeId}@kajovohotel.local`;

const assertStatus = async (response, expected, label) => {
  if (response.status !== expected) {
    const body = await response.text();
    throw new Error(`${label} failed with ${response.status}, expected ${expected}: ${body.slice(0, 500)}`);
  }
};

const assertJsonOk = async (response, label) => {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${label} failed with ${response.status}: ${body.slice(0, 500)}`);
  }
  return response.json();
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

  const fallback = headers.get('set-cookie');
  if (!fallback) {
    return '';
  }

  return fallback
    .split(/,(?=[^;]+=[^;]+)/)
    .map((part) => part.split(';', 1)[0]?.trim())
    .filter(Boolean)
    .join('; ');
};

const readCookieValue = (cookieHeader, name) => {
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return decodeURIComponent(trimmed.slice(name.length + 1));
    }
  }
  return '';
};

const createSession = async () => {
  const loginResponse = await fetch(`${origin}/api/auth/admin/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'kajovo-live-users-smoke/1.0',
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
};

const requestJson = async (session, path, { method = 'GET', payload } = {}) => {
  const headers = {
    cookie: session.cookieHeader,
    'user-agent': 'kajovo-live-users-smoke/1.0',
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
  return { response, payload: parsed };
};

let createdUserId = null;
let session = null;

try {
  session = await createSession();

  const createPayload = {
    first_name: 'Deploy',
    last_name: 'Smoke',
    email: testEmail,
    roles: ['recepce'],
    phone: '+420111222333',
    note: `live-users-smoke create sha=${deploySha} run=${runId}`,
    password: 'DeploySmokePass123',
  };
  const created = await requestJson(session, '/api/v1/users', {
    method: 'POST',
    payload: createPayload,
  });
  await assertStatus(created.response, 201, 'POST /api/v1/users');
  if (!created.payload || created.payload.email !== testEmail) {
    throw new Error(`Unexpected create user payload: ${JSON.stringify(created.payload)}`);
  }
  createdUserId = created.payload.id;

  const detail = await requestJson(session, `/api/v1/users/${createdUserId}`);
  await assertStatus(detail.response, 200, 'GET /api/v1/users/{id}');
  if (!detail.payload || detail.payload.email !== testEmail) {
    throw new Error(`Unexpected detail payload: ${JSON.stringify(detail.payload)}`);
  }

  const updated = await requestJson(session, `/api/v1/users/${createdUserId}`, {
    method: 'PATCH',
    payload: {
      first_name: 'Deploy',
      last_name: 'Smoke Updated',
      email: testEmail,
      roles: ['recepce', 'snidane'],
      phone: '+420111222334',
      note: `live-users-smoke update sha=${deploySha} run=${runId}`,
    },
  });
  await assertStatus(updated.response, 200, 'PATCH /api/v1/users/{id}');
  if (!updated.payload?.roles?.includes('recepce') || !updated.payload?.roles?.includes('snídaně')) {
    throw new Error(`Updated user does not contain expected roles: ${JSON.stringify(updated.payload)}`);
  }

  const resetLink = await requestJson(session, `/api/v1/users/${createdUserId}/password/reset-link`, {
    method: 'POST',
  });
  if (resetLink.response.status === 200) {
    if (!resetLink.payload?.ok || !resetLink.payload.connected || !resetLink.payload.send_attempted) {
      throw new Error(`Reset-link success payload is not a real send success: ${JSON.stringify(resetLink.payload)}`);
    }
  } else if (resetLink.response.status === 503) {
    const detailText = String(resetLink.payload?.detail ?? '');
    if (!detailText.toLowerCase().includes('smtp')) {
      throw new Error(`Reset-link failure is not a transparent SMTP error: ${JSON.stringify(resetLink.payload)}`);
    }
  } else {
    throw new Error(`Unexpected reset-link status ${resetLink.response.status}: ${JSON.stringify(resetLink.payload)}`);
  }

  const disabled = await requestJson(session, `/api/v1/users/${createdUserId}/active`, {
    method: 'PATCH',
    payload: { is_active: false },
  });
  await assertStatus(disabled.response, 200, 'PATCH /api/v1/users/{id}/active false');
  if (disabled.payload?.is_active !== false) {
    throw new Error(`User was not deactivated: ${JSON.stringify(disabled.payload)}`);
  }

  const reactivated = await requestJson(session, `/api/v1/users/${createdUserId}/active`, {
    method: 'PATCH',
    payload: { is_active: true },
  });
  await assertStatus(reactivated.response, 200, 'PATCH /api/v1/users/{id}/active true');
  if (reactivated.payload?.is_active !== true) {
    throw new Error(`User was not reactivated: ${JSON.stringify(reactivated.payload)}`);
  }

  const deleted = await fetch(`${origin}/api/v1/users/${createdUserId}`, {
    method: 'DELETE',
    headers: {
      cookie: session.cookieHeader,
      'x-csrf-token': session.csrfToken,
      'user-agent': 'kajovo-live-users-smoke/1.0',
    },
  });
  await assertStatus(deleted, 204, 'DELETE /api/v1/users/{id}');
  createdUserId = null;

  const afterDelete = await requestJson(session, `/api/v1/users/${detail.payload.id}`);
  await assertStatus(afterDelete.response, 404, 'GET /api/v1/users/{id} after delete');

  console.log(JSON.stringify({
    ok: true,
    baseUrl: origin,
    smoke: 'admin-users',
    email: testEmail,
    sha: deploySha,
    run_id: runId,
    reset_link_status: resetLink.response.status,
  }, null, 2));
} finally {
  if (session && createdUserId !== null) {
    try {
      await fetch(`${origin}/api/v1/users/${createdUserId}`, {
        method: 'DELETE',
        headers: {
          cookie: session.cookieHeader,
          'x-csrf-token': session.csrfToken,
          'user-agent': 'kajovo-live-users-smoke/1.0',
        },
      });
    } catch {
      // Cleanup best-effort only.
    }
  }
}
