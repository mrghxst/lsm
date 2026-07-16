import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'lsm-admin-blocklist-api-'));
process.env.DATA_DIR = dataDir;

const { db } = await import('../server/db.js');
const { app } = await import('../server/index.js');
const { isBlockedName } = await import('../server/name-policy.js');

const adminId = Number(db.prepare(`
  INSERT INTO users (username, pin_hash, is_admin) VALUES ('Admin', 'hash', 1)
`).run().lastInsertRowid);
const token = 'admin-blocklist-token';
db.prepare(`
  INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, unixepoch() + 3600)
`).run(token, adminId);

const server = await new Promise((resolve) => {
  const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
});
const base = `http://127.0.0.1:${server.address().port}`;

async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: {
      Cookie: `lsm_session=${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  return { response, body: await response.json() };
}

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test('admins can add, list, enforce, and remove live blocklist rules', async () => {
  const added = await request('/api/admin/blocklist', {
    method: 'POST',
    body: JSON.stringify({ value: 'Professor Chaos', matchType: 'exact' }),
  });
  assert.equal(added.response.status, 201);
  assert.equal(added.body.value, 'Professor Chaos');
  assert.equal(added.body.matchType, 'exact');
  assert.equal(isBlockedName('PROFESSOR.CHAOS'), true);
  assert.equal(isBlockedName('Professor Chaos Junior'), false);

  const contains = await request('/api/admin/blocklist', {
    method: 'POST',
    body: JSON.stringify({ value: 'underpants', matchType: 'contains' }),
  });
  assert.equal(contains.response.status, 201);
  assert.equal(isBlockedName('Captain Underpants'), true);

  const duplicate = await request('/api/admin/blocklist', {
    method: 'POST',
    body: JSON.stringify({ value: 'PROFESSOR CHAOS', matchType: 'exact' }),
  });
  assert.equal(duplicate.response.status, 409);

  const tooBroad = await request('/api/admin/blocklist', {
    method: 'POST',
    body: JSON.stringify({ value: 'x', matchType: 'contains' }),
  });
  assert.equal(tooBroad.response.status, 400);

  const protectedDuplicate = await request('/api/admin/blocklist', {
    method: 'POST',
    body: JSON.stringify({ value: 'Diddy', matchType: 'exact' }),
  });
  assert.equal(protectedDuplicate.response.status, 409);
  assert.match(protectedDuplicate.body.error, /protected safety list/i);

  const overview = await request('/api/admin/overview');
  assert.equal(overview.response.status, 200);
  assert.deepEqual(
    overview.body.blockedNames.map((rule) => rule.value).sort(),
    ['Professor Chaos', 'underpants'].sort(),
  );

  const removed = await request(`/api/admin/blocklist/${added.body.id}`, { method: 'DELETE' });
  assert.equal(removed.response.status, 200);
  assert.equal(isBlockedName('Professor Chaos'), false);
  assert.equal(isBlockedName('Diddy'), true, 'protected built-in rules remain active');
});
