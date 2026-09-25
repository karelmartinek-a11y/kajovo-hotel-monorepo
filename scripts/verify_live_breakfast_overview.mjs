#!/usr/bin/env node

const baseUrl = process.env.VERIFY_BASE_URL?.replace(/\/$/, '');
const email = process.env.VERIFY_ADMIN_EMAIL;
const password = process.env.VERIFY_ADMIN_PASSWORD;
if (!baseUrl || !email || !password) throw new Error('Verification URL and admin credentials are required.');

const date = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const login = await fetch(`${baseUrl}/api/auth/admin/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (!login.ok) throw new Error(`Admin login failed: ${login.status}`);
const cookies = (login.headers.getSetCookie?.() ?? [login.headers.get('set-cookie') ?? ''])
  .flatMap((header) => header.split(/,(?=[^;]+=[^;]+)/))
  .map((header) => header.split(';', 1)[0]?.trim()).filter(Boolean).join('; ');
if (!cookies.includes('kajovo_session=')) throw new Error('Admin session cookie missing.');

async function read(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { cookie: cookies } });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

const [breakfast, rooms, settings] = await Promise.all([
  read(`/api/v1/breakfast/daily-overview?service_date=${date}`),
  read(`/api/v1/housekeeping/rooms?date=${date}`),
  read('/api/v1/admin/settings/breakfast-sync'),
]);
if (!Array.isArray(breakfast.orders) || breakfast.summary?.service_date !== date) throw new Error('Breakfast overview contract invalid.');
if (!Array.isArray(rooms.rooms) || rooms.date !== date) throw new Error('Rooms overview contract invalid.');
if (settings.provider !== 'better_hotel_api' || !settings.scheduler_enabled) throw new Error('Automatic Better Hotel sync is inactive.');
for (const order of breakfast.orders) {
  if (!('guest_names' in order && 'country_code' in order && 'note' in order)) throw new Error('Breakfast guest or note fields missing.');
}
for (const room of rooms.rooms) {
  for (const stay of [...room.arrivals, ...room.departures, ...room.stays]) {
    if (!('housekeeping_note' in stay)) throw new Error('Housekeeping note field missing.');
  }
}
console.log(JSON.stringify({ ok: true, date, breakfast_orders: breakfast.orders.length, rooms: rooms.rooms.length, scheduler_interval_seconds: settings.scheduler_interval_seconds }));
