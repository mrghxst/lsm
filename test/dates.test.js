import test from 'node:test';
import assert from 'node:assert/strict';
import { zurichDate } from '../server/dates.js';

test('zurichDate returns the current Zurich calendar day', () => {
  assert.equal(zurichDate(0, new Date('2026-07-14T22:30:00Z')), '2026-07-15');
});

test('tomorrow advances one calendar day across the short DST day', () => {
  const lateSaturday = new Date('2026-03-28T22:30:00Z'); // 23:30 in Zurich
  assert.equal(zurichDate(0, lateSaturday), '2026-03-28');
  assert.equal(zurichDate(1, lateSaturday), '2026-03-29');
});

test('tomorrow advances one calendar day across the long DST day', () => {
  const earlySunday = new Date('2026-10-24T22:30:00Z'); // 00:30 in Zurich
  assert.equal(zurichDate(0, earlySunday), '2026-10-25');
  assert.equal(zurichDate(1, earlySunday), '2026-10-26');
});
