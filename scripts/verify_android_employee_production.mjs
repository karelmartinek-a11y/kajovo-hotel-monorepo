#!/usr/bin/env node

import { randomBytes, randomUUID } from 'node:crypto';

const origin = (process.env.VERIFY_BASE_URL ?? '').replace(/\/$/, '');
const adminEmail = process.env.VERIFY_ADMIN_EMAIL;
const adminPassword = process.env.VERIFY_ADMIN_PASSWORD;
const confirmation = process.env.VERIFY_CONFIRM_MUTATIONS;
const runId = process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`;
if (!origin || !adminEmail || !adminPassword) {
  throw new Error('VERIFY_BASE_URL, VERIFY_ADMIN_EMAIL and VERIFY_ADMIN_PASSWORD are required.');
}
if (confirmation !== 'room-203-and-one-admin-chat') {
  throw new Error('Set VERIFY_CONFIRM_MUTATIONS to the exact production acceptance choice before running.');
}

const testEmail = `android.acceptance.${runId}.${randomBytes(4).toString('hex')}@kajovohotel.local`;
const testPassword = randomBytes(32).toString('base64url');
const messageBody = `[TEST Android 2.1.0] Produkční ověření chatu, běh ${runId}. Prosím ignorujte.`;
const clientMessageId = randomUUID();
const stableMessagePrefix = '[TEST Android 2.1.0] Produkční ověření chatu';

function cookieHeader(headers) {
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  const cookies = values.map((value) => value.split(';', 1)[0]?.trim()).filter(Boolean);
  const raw = cookies.length ? cookies : (headers.get('set-cookie') ?? '').split(/,(?=[^;]+=[^;]+)/).map((v) => v.split(';', 1)[0]?.trim()).filter(Boolean);
  return raw.join('; ');
}

function csrfFrom(cookies) {
  const token = cookies.split(';').map((part) => part.trim()).find((part) => part.startsWith('kajovo_csrf='));
  return token ? decodeURIComponent(token.slice('kajovo_csrf='.length)) : '';
}

async function call(session, path, { method = 'GET', body } = {}) {
  const headers = { 'user-agent': 'kajovo-android-production-acceptance/1.0' };
  if (session) headers.cookie = session.cookies;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (session && method !== 'GET' && method !== 'HEAD') headers['x-csrf-token'] = session.csrf;
  const response = await fetch(`${origin}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  const raw = await response.text();
  let payload = null;
  if (raw) {
    try { payload = JSON.parse(raw); } catch { payload = null; }
  }
  if (!response.ok) throw new Error(`${method} ${path} returned HTTP ${response.status}.`);
  return payload;
}

async function login(path, credentials, actorType) {
  const response = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'kajovo-android-production-acceptance/1.0' },
    body: JSON.stringify({ ...credentials, web_activity_session: true }),
    redirect: 'manual',
  });
  const raw = await response.text();
  let payload = null;
  try { payload = JSON.parse(raw); } catch { /* handled by the status and contract checks below */ }
  if (!response.ok || payload?.actor_type !== actorType) throw new Error(`${actorType} login failed with HTTP ${response.status}.`);
  const cookies = cookieHeader(response.headers);
  const csrf = csrfFrom(cookies);
  if (!cookies.includes('kajovo_session=') || !csrf) throw new Error(`${actorType} login did not issue a CSRF-protected session.`);
  return { cookies, csrf };
}

let adminSession;
let employeeId;
let employeeSession;
let roomId;
let originalRoomStatus;
let roomUpdateAttempted = false;
let roomRestored = false;
let employeeDeleted = false;
let administratorChatMessageVisible = false;
let sentMessageId = null;
let conversationId = null;
const roomNumber = '203';
let reusedPriorMessage = false;

async function setRoomStatus(status, note) {
  await call(employeeSession, `/api/v1/housekeeping/rooms/${encodeURIComponent(roomId)}?date=${encodeURIComponent(serviceDate)}`, {
    method: 'PATCH', body: { status, ...(note ? { note } : {}) },
  });
  const overview = await call(employeeSession, `/api/v1/housekeeping/rooms?date=${encodeURIComponent(serviceDate)}`);
  const room = overview.rooms.find((item) => item.room_id === roomId);
  if (room?.housekeeping_status_key !== status) throw new Error(`Room ${roomNumber} status did not verify as ${status}.`);
}

const serviceDate = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

try {
  adminSession = await login('/api/auth/admin/login', { email: adminEmail, password: adminPassword }, 'admin');
  const created = await call(adminSession, '/api/v1/users', {
    method: 'POST',
    body: {
      first_name: 'Android',
      last_name: 'Acceptance Test',
      email: testEmail,
      roles: ['pokojská'],
      phone: '+420111222333',
      note: `android-production-acceptance run=${runId}`,
      password: testPassword,
    },
  });
  if (created?.id) employeeId = created.id;
  if (!employeeId || created.email?.toLowerCase() !== testEmail.toLowerCase()) throw new Error('Test employee account creation did not verify.');
  employeeSession = await login('/api/auth/login', { email: testEmail, password: testPassword }, 'portal');

  const overview = await call(employeeSession, `/api/v1/housekeeping/rooms?date=${encodeURIComponent(serviceDate)}`);
  const room = overview?.rooms?.find((item) => item.room_number === roomNumber);
  if (!room?.room_id) throw new Error('Room 203 is missing from the production housekeeping overview.');
  roomId = room.room_id;
  originalRoomStatus = room.housekeeping_status_key;
  if (!['clean', 'dirty', 'stay_no_linen', 'stay_with_linen', 'do_not_disturb', 'technical_issue'].includes(originalRoomStatus)) {
    throw new Error('Room 203 has no recognized status to restore; no status mutation was made.');
  }

  const probeStatus = originalRoomStatus === 'clean' ? 'dirty' : 'clean';
  roomUpdateAttempted = true;
  await setRoomStatus(probeStatus);
  await setRoomStatus(originalRoomStatus);
  roomRestored = true;

  const directory = await call(employeeSession, '/api/v1/chat/directory');
  const adminRecipient = directory.find((participant) => participant.email?.toLowerCase() === adminEmail.toLowerCase());
  if (!adminRecipient?.id || adminRecipient.is_active !== true) throw new Error('Administrator was not present as an active chat recipient.');

  const previousAdminConversations = await call(adminSession, '/api/v1/chat/conversations');
  const priorAcceptanceConversation = previousAdminConversations.find((conversation) =>
    conversation.last_message?.body?.startsWith(stableMessagePrefix),
  );

  if (priorAcceptanceConversation) {
    reusedPriorMessage = true;
    sentMessageId = priorAcceptanceConversation.last_message.id;
    conversationId = priorAcceptanceConversation.id;
  } else {
    const sent = await call(employeeSession, '/api/v1/chat/messages', {
      method: 'POST',
      body: { recipient_id: adminRecipient.id, body: messageBody, client_message_id: clientMessageId },
    });
    if (!sent?.id || !sent?.conversation_id || sent.body !== messageBody || sent.is_mine !== true) {
      throw new Error('The labeled administrator chat message did not verify as sent.');
    }
    sentMessageId = sent.id;
    conversationId = sent.conversation_id;
  }

  const conversations = await call(adminSession, '/api/v1/chat/conversations');
  administratorChatMessageVisible = conversations.some((conversation) =>
    conversation.id === conversationId &&
    conversation.last_message?.id === sentMessageId && conversation.last_message?.body?.startsWith(stableMessagePrefix),
  );
  if (!administratorChatMessageVisible) throw new Error('Administrator chat did not show the test message after sending.');
} finally {
  let cleanupError = null;
  if (roomUpdateAttempted && !roomRestored && originalRoomStatus && employeeSession && roomId) {
    try {
      await setRoomStatus(originalRoomStatus);
      roomRestored = true;
    } catch {
      cleanupError = new Error('CRITICAL: Room 203 status restoration could not be verified.');
    }
  }
  if (adminSession && employeeId) {
    try {
      const response = await fetch(`${origin}/api/v1/users/${encodeURIComponent(employeeId)}`, {
        method: 'DELETE',
        headers: {
          cookie: adminSession.cookies,
          'x-csrf-token': adminSession.csrf,
          'user-agent': 'kajovo-android-production-acceptance/1.0',
        },
      });
      if (response.status !== 204) throw new Error(`HTTP ${response.status}`);
      employeeDeleted = true;
    } catch {
      cleanupError ??= new Error('Test employee account cleanup failed; remove it in User Management.');
    }
  }
  if (cleanupError) throw cleanupError;
}

console.log(JSON.stringify({
  ok: true,
  run_id: runId,
  room: roomNumber,
  room_status_changed_and_restored: roomRestored,
  room_original_status: originalRoomStatus,
  room_probe_status: originalRoomStatus === 'clean' ? 'dirty' : 'clean',
  administrator_chat_message_visible: administratorChatMessageVisible,
  message_id: sentMessageId,
  conversation_id: conversationId,
  reused_prior_labeled_message: reusedPriorMessage,
  test_employee_deleted_after_verification: employeeDeleted,
}, null, 2));
