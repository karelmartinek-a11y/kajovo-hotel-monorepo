import assert from 'node:assert/strict';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {hasExposedAuthorization} from './mcp_authorization_guard.mjs';

test('Realtime session echoes exact redaction markers without exposing credentials', () => {
  for (const type of ['session.created', 'session.updated']) {
    assert.equal(hasExposedAuthorization({type, session: {tools: [{
      authorization: '<redacted>', headers: {Authorization: '<redacted>'},
    }]}}), false);
  }
});

test('nested raw credentials and redaction-looking credentials fail closed', () => {
  for (const credential of ['canary-private-token', 'Bearer canary-private-token',
    '<redacted>canary', 'canary<redacted>', ' <redacted>', '<REDACTED>']) {
    assert.equal(hasExposedAuthorization({session: {tools: [{authorization: credential}]}}), true);
    assert.equal(hasExposedAuthorization({session: {tools: [{headers: {Authorization: credential}}]}}), true);
  }
  assert.equal(hasExposedAuthorization({authorization: '<redacted>', item: {authorization: 'canary'}}), true);
});

test('missing and empty authorization are safe', () => {
  for (const value of [null, {}, {authorization: ''}, {tools: [{name: 'search_devices'}]}]) {
    assert.equal(hasExposedAuthorization(value), false);
  }
});

test('the exact browser-injected function preserves recursive credential checks', () => {
  const window = {};
  runInNewContext(`window.__voiceAuthorizationGuard = ${hasExposedAuthorization.toString()};`, {window});
  assert.equal(window.__voiceAuthorizationGuard({session: {tools: [{headers: {Authorization: '<redacted>'}}]}}), false);
  assert.equal(window.__voiceAuthorizationGuard({session: {tools: [{headers: {Authorization: 'canary'}}]}}), true);
});
