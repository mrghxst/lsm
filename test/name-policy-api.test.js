import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'lsm-name-policy-api-'));
process.env.DATA_DIR = dataDir;

const { db } = await import('../server/db.js');
const { app } = await import('../server/index.js');

const server = await new Promise((resolve) => {
  const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
});
const base = `http://127.0.0.1:${server.address().port}`;

async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: {
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

test('registration and guest reservations enforce the same name policy', async () => {
  const rejectedRegistration = await request('/api/auth/session', {
    method: 'POST',
    body: JSON.stringify({ username: 'D1ddy', pin: '1234' }),
  });
  assert.equal(rejectedRegistration.response.status, 400);
  assert.match(rejectedRegistration.body.error, /not allowed/i);

  const registered = await request('/api/auth/session', {
    method: 'POST',
    body: JSON.stringify({ username: 'Owner', pin: '1234' }),
  });
  assert.equal(registered.response.status, 200);
  const cookie = registered.response.headers.get('set-cookie').split(';', 1)[0];

  const created = await request('/api/spaces', {
    method: 'POST',
    headers: { Cookie: cookie },
    body: JSON.stringify({ name: 'Policy test', tableCount: 1, defaultCapacity: 2 }),
  });
  assert.equal(created.response.status, 200);
  const table = db.prepare(`
    SELECT t.id FROM tables t JOIN spaces s ON s.id = t.space_id WHERE s.code = ?
  `).get(created.body.code);

  const rejectedGuest = await request(`/api/spaces/${created.body.code}/tables/${table.id}/guests`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: JSON.stringify({ name: 'JEFFREY EPSTEIN', eta: 'now' }),
  });
  assert.equal(rejectedGuest.response.status, 400);
  assert.match(rejectedGuest.body.error, /not allowed/i);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM claims').get().n, 0);

  const acceptedGuest = await request(`/api/spaces/${created.body.code}/tables/${table.id}/guests`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: JSON.stringify({ name: 'Cassandra', eta: 'now' }),
  });
  assert.equal(acceptedGuest.response.status, 200);
  assert.equal(db.prepare('SELECT guest_name FROM claims').get().guest_name, 'Cassandra');
});
