#!/usr/bin/env node

const baseUrl = process.env.VERIFY_BASE_URL;
const adminEmail = process.env.VERIFY_ADMIN_EMAIL;
const adminPassword = process.env.VERIFY_ADMIN_PASSWORD;

if (!baseUrl) throw new Error('VERIFY_BASE_URL is required.');
if (!adminEmail || !adminPassword) throw new Error('VERIFY_ADMIN_EMAIL and VERIFY_ADMIN_PASSWORD are required.');

const origin = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
const serviceDate = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

function parseCookieHeader(headers) {
  const raw = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  const values = raw.map((header) => header.split(';', 1)[0]?.trim()).filter(Boolean);
  if (values.length > 0) return values.join('; ');
  return (headers.get('set-cookie') ?? '')
    .split(/,(?=[^;]+=[^;]+)/)
    .map((part) => part.split(';', 1)[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

async function jsonOrThrow(response, label) {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${label} failed with ${response.status}: ${body.slice(0, 500)}`);
  }
  return response.json();
}

const loginResponse = await fetch(`${origin}/api/auth/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'user-agent': 'kajovo-housekeeping-verify/1.0' },
  body: JSON.stringify({ email: adminEmail, password: adminPassword }),
});
const login = await jsonOrThrow(loginResponse, 'Admin login');
if (login.actor_type !== 'admin') throw new Error(`Unexpected login payload: ${JSON.stringify(login)}`);
const cookie = parseCookieHeader(loginResponse.headers);
if (!cookie.includes('kajovo_session=')) throw new Error('Admin login did not issue a session cookie.');

const response = await fetch(`${origin}/api/v1/housekeeping/rooms?date=${encodeURIComponent(serviceDate)}`, {
  headers: { cookie, 'user-agent': 'kajovo-housekeeping-verify/1.0' },
});
const overview = await jsonOrThrow(response, 'Housekeeping rooms overview');
if (overview.date !== serviceDate || overview.occupancy_date !== serviceDate || !Array.isArray(overview.rooms) || overview.rooms.length === 0) {
  throw new Error('Unexpected housekeeping overview contract.');
}
const invalid = overview.rooms.find((room) =>
  typeof room.room_id !== 'string' ||
  !/^\d{3}$/.test(room.room_number) ||
  typeof room.operational_state !== 'string' ||
  typeof room.ready_for_arrival !== 'boolean' ||
  !['free', 'arrived', 'departing', 'staying'].includes(room.occupancy_state) ||
  ['departures', 'arrivals', 'stays'].some((group) => !Array.isArray(room[group]) || room[group].some((stay) =>
    typeof stay.reservation_id !== 'string' || !Array.isArray(stay.amenities) ||
    stay.amenities.some((item) => !['dog', 'cot'].includes(item.kind) || !['red', 'green'].includes(item.state) || !Number.isInteger(item.version)))) ||
  typeof room.arrival_today !== 'boolean' ||
  typeof room.departure_today !== 'boolean'
);
if (invalid) throw new Error('Invalid room/reservation/amenity contract.');

console.log(JSON.stringify({
  ok: true,
  baseUrl: origin,
  date: serviceDate,
  roomCount: overview.rooms.length,
  housekeepingStatusIsCurrent: overview.housekeeping_status_is_current,
}, null, 2));
