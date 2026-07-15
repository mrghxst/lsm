import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'lsm-push-test-'));
process.env.DATA_DIR = dataDir;

const { db } = await import('../server/db.js');
const { saveSubscription, removeSubscription } = await import('../server/push.js');

after(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test('an existing browser push endpoint follows the newly signed-in user', () => {
  const insert = db.prepare('INSERT INTO users (username, pin_hash) VALUES (?, ?)');
  const first = Number(insert.run('First user', 'hash').lastInsertRowid);
  const second = Number(insert.run('Second user', 'hash').lastInsertRowid);
  const subscription = { endpoint: 'https://push.example/device', keys: { auth: 'a', p256dh: 'b' } };

  saveSubscription(first, subscription);
  saveSubscription(second, subscription);

  const owner = db.prepare('SELECT user_id FROM push_subscriptions WHERE endpoint = ?').get(subscription.endpoint);
  assert.equal(owner.user_id, second);
});

test('unsubscribing one endpoint leaves the same users other devices alone', () => {
  const userId = Number(db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get().id);
  saveSubscription(userId, { endpoint: 'https://push.example/phone', keys: {} });
  saveSubscription(userId, { endpoint: 'https://push.example/laptop', keys: {} });

  removeSubscription(userId, 'https://push.example/phone');

  const endpoints = db.prepare('SELECT endpoint FROM push_subscriptions WHERE user_id = ? ORDER BY endpoint').all(userId);
  assert.deepEqual(endpoints.map((row) => row.endpoint), ['https://push.example/laptop']);
});
