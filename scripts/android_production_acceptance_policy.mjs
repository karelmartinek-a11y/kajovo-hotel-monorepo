const statuses = new Set(['clean', 'dirty', 'stay_no_linen', 'stay_with_linen', 'do_not_disturb', 'technical_issue']);

export function parseRestorePlan(encoded) {
  let plan;
  try { plan = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); }
  catch { throw new Error('Persisted room restore plan is invalid JSON.'); }
  if (plan?.room_number !== '203' || !plan.room_id || !/^\d{4}-\d{2}-\d{2}$/.test(plan.service_date) ||
      !statuses.has(plan.original_status) || !statuses.has(plan.probe_status) || plan.original_status === plan.probe_status) {
    throw new Error('Persisted room restore plan failed validation; do not perform an automatic room write.');
  }
  return plan;
}

export function isSafeToRestore(room) {
  return room?.occupancy_state === 'free' &&
    ['arrivals', 'departures', 'stays'].every((key) => Array.isArray(room[key]) && room[key].length === 0);
}

export function ownsCurrentProbeStatus(plan, room, probeUpdateVerified) {
  return probeUpdateVerified === true &&
    room?.housekeeping_status_key === plan.probe_status &&
    isSafeToRestore(room);
}
