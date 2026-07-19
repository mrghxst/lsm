import test from 'node:test';
import assert from 'node:assert/strict';

const { orientMenuForDay } = await import('../server/orient-menu.js');

test('Orient Catering is closed on Sunday and open for lunch every other day', () => {
  const sunday = orientMenuForDay(7);
  assert.equal(sunday.status, 'closed');
  assert.deepEqual(sunday.meals, []);

  for (let dayCode = 1; dayCode <= 6; dayCode++) {
    const day = orientMenuForDay(dayCode);
    assert.equal(day.status, 'open');
    assert.ok(day.meals.length > 0);
  }
});
