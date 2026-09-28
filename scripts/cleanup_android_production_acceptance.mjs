#!/usr/bin/env node

const origin = (process.env.VERIFY_BASE_URL ?? '').replace(/\/$/, '');
const restorePlanValue = process.env.VERIFY_ROOM_RESTORE_PLAN ?? '';
const employeeId = process.env.VERIFY_TEST_EMPLOYEE_ID ?? '';

if (!restorePlanValue && !employeeId) {
  console.log('No production mutations were recorded; cleanup is a no-op.');
  process.exit(0);
}

const adminEmail = process.env.VERIFY_ADMIN_EMAIL;
const adminPassword = process.env.VERIFY_ADMIN_PASSWORD;
if (!origin || !adminEmail || !adminPassword) {
  throw new Error('Cleanup needs the production URL and protected administrator credentials.');
}

function cookieHeader(headers) {
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  const cookies = values.map((value) => value.split(';', 1)[0]?.trim()).filter(Boolean);
  const raw = cookies.length ? cookies : (headers.get('set-cookie') ?? '').split(/,(?=[^;]+=[^;]+)/).map((value) => value.split(';', 1)[0]?.trim()).filter(Boolean);
  return raw.join('; ');
}

function csrfFrom(cookies) {
  const token = cookies.split(';').map((part) => part.trim()).find((part) => part.startsWith('kajovo_csrf='));
  return token ? decodeURIComponent(token.slice('kajovo_csrf='.length)) : '';
}

async function request(path, { method = 'GET', session, body } = {}) {
  const headers = { 'user-agent': 'kajovo-android-production-acceptance-cleanup/1.0' };
  if (session) headers.cookie = session.cookies;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (session && method !== 'GET' && method !== 'HEAD') headers['x-csrf-token'] = session.csrf;
  const response = await fetch(`${origin}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  const raw = await response.text();
  let payload = null;
  if (raw) {
    try { payload = JSON.parse(raw); } catch { payload = null; }
  }
  return { response, payload };
}

async function login() {
  const { response, payload } = await request('/api/auth/admin/login', {
    method: 'POST',
    body: { email: adminEmail, password: adminPassword, web_activity_session: true },
  });
  if (!response.ok || payload?.actor_type !== 'admin') throw new Error(`Administrator cleanup login failed with HTTP ${response.status}.`);
  const cookies = cookieHeader(response.headers);
  const csrf = csrfFrom(cookies);
  if (!cookies.includes('kajovo_session=') || !csrf) throw new Error('Cleanup login did not issue a CSRF-protected session.');
  return { cookies, csrf };
}

function parseRestorePlan(encoded) {
  let plan;
  try { plan = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); }
  catch { throw new Error('Persisted room restore plan is invalid JSON.'); }
  const statuses = new Set(['clean', 'dirty', 'stay_no_linen', 'stay_with_linen', 'do_not_disturb', 'technical_issue']);
  if (plan?.room_number !== '203' || !plan.room_id || !/^\d{4}-\d{2}-\d{2}$/.test(plan.service_date) ||
      !statuses.has(plan.original_status) || !statuses.has(plan.probe_status) || plan.original_status === plan.probe_status) {
    throw new Error('Persisted room restore plan failed validation; do not perform an automatic room write.');
  }
  return plan;
}

function isSafeToRestore(room) {
  return room?.occupancy_state === 'free' &&
    ['arrivals', 'departures', 'stays'].every((key) => Array.isArray(room[key]) && room[key].length === 0);
}

const session = await login();
let roomResult = 'not-needed';
const cleanupErrors = [];
if (restorePlanValue) {
  try {
    const plan = parseRestorePlan(restorePlanValue);
    const path = `/api/v1/housekeeping/rooms?date=${encodeURIComponent(plan.service_date)}`;
    const first = await request(path, { session });
    if (!first.response.ok) throw new Error(`Could not read room ${plan.room_number} during cleanup (HTTP ${first.response.status}).`);
    const room = first.payload?.rooms?.find((item) => item.room_id === plan.room_id);
    if (!room) throw new Error(`Room ${plan.room_number} was missing during cleanup; inspect its status manually.`);
    if (room.housekeeping_status_key === plan.original_status) {
      roomResult = 'already-restored';
    } else if (room.housekeeping_status_key === plan.probe_status && isSafeToRestore(room)) {
      const changed = await request(`/api/v1/housekeeping/rooms/${encodeURIComponent(plan.room_id)}?date=${encodeURIComponent(plan.service_date)}`, {
        method: 'PATCH', session, body: { status: plan.original_status, expected_status: plan.probe_status },
      });
      if (!changed.response.ok) throw new Error(`Could not restore room ${plan.room_number} (HTTP ${changed.response.status}).`);
      const verified = await request(path, { session });
      const restored = verified.payload?.rooms?.find((item) => item.room_id === plan.room_id);
      if (!verified.response.ok || restored?.housekeeping_status_key !== plan.original_status) {
        throw new Error(`Room ${plan.room_number} restoration did not verify; inspect its status manually.`);
      }
      roomResult = 'restored-and-verified';
    } else {
      throw new Error(`Room ${plan.room_number} changed concurrently or is no longer free; current status was preserved. Manual review is required.`);
    }
  } catch (error) {
    roomResult = 'manual-review-required';
    cleanupErrors.push(error instanceof Error ? error.message : 'Room cleanup failed.');
  }
}

let employeeResult = 'not-needed';
if (employeeId) {
  if (!/^\d+$/.test(employeeId)) throw new Error('Persisted temporary employee ID is invalid; remove the account manually.');
  const { response } = await request(`/api/v1/users/${encodeURIComponent(employeeId)}`, { method: 'DELETE', session });
  if (response.status !== 204 && response.status !== 404) {
    cleanupErrors.push(`Temporary employee cleanup returned HTTP ${response.status}; remove the account in User Management.`);
    employeeResult = 'manual-review-required';
  } else {
    employeeResult = response.status === 204 ? 'deleted' : 'already-absent';
  }
}

console.log(JSON.stringify({ room_cleanup: roomResult, temporary_employee: employeeResult }, null, 2));
if (cleanupErrors.length) throw new Error(cleanupErrors.join(' '));
