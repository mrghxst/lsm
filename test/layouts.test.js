import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutSummary, parseLayout, snapshotLayout } from '../server/layouts.js';

test('snapshotLayout keeps active tables and clears session-only state', () => {
  const saved = snapshotLayout([
    { label: 'T1', capacity: 3, x: 0.4, y: 0.5, rot: 0, released: 0, stolen: 0 },
    { label: 'T2', capacity: 2, x: 0.6, y: 0.5, rot: 90, released: 1, stolen: 0 },
  ]);
  assert.deepEqual(parseLayout(saved), [
    { label: 'T1', capacity: 3, x: 0.4, y: 0.5, rot: 0 },
  ]);
  assert.deepEqual(layoutSummary(saved), { tableCount: 1, totalSeats: 3 });
});

test('parseLayout safely rejects malformed saved tables', () => {
  assert.deepEqual(parseLayout('not json'), []);
  assert.deepEqual(parseLayout([{ label: 'Bad', capacity: 99, x: 0.5, y: 0.5, rot: 0 }]), []);
});
