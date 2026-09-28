import assert from 'node:assert/strict';
import test from 'node:test';

import { ownsCurrentProbeStatus, parseRestorePlan } from './android_production_acceptance_policy.mjs';

const plan = {
  room_number: '203',
  room_id: 'room-203',
  service_date: '2026-09-29',
  original_status: 'dirty',
  probe_status: 'clean',
};

function room(status = 'clean', occupancy = 'free') {
  return { housekeeping_status_key: status, occupancy_state: occupancy, arrivals: [], departures: [], stays: [] };
}

test('restore plan validation only accepts the authorized room and distinct known statuses', () => {
  assert.deepEqual(parseRestorePlan(Buffer.from(JSON.stringify(plan)).toString('base64url')), plan);
  assert.throws(() => parseRestorePlan(Buffer.from(JSON.stringify({ ...plan, room_number: '204' })).toString('base64url')));
  assert.throws(() => parseRestorePlan(Buffer.from(JSON.stringify({ ...plan, probe_status: 'dirty' })).toString('base64url')));
});

test('cleanup preserves a matching probe status when the write outcome was not verified', () => {
  assert.equal(ownsCurrentProbeStatus(plan, room(), false), false);
});

test('cleanup restores only a verified probe status while the room remains free and event-free', () => {
  assert.equal(ownsCurrentProbeStatus(plan, room(), true), true);
  assert.equal(ownsCurrentProbeStatus(plan, room('dirty'), true), false);
  assert.equal(ownsCurrentProbeStatus(plan, room('clean', 'arrived'), true), false);
});
