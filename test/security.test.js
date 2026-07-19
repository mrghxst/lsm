import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'lsm-security-test-'));
process.env.DATA_DIR = dataDir;
delete process.env.PUBLIC_ORIGIN;

const { db } = await import('../server/db.js');
const { app } = await import('../server/index.js');

const adminId = Number(db.prepare(`
  INSERT INTO users (username, pin_hash, is_admin) VALUES ('SecurityAdmin', 'hash', 1)
`).run().lastInsertRowid);
db.prepare(`
  INSERT INTO invite_codes (code, created_by) VALUES ('VALID2', ?)
`).run(adminId);

const server = await new Promise((resolve) => {
  const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
});
const base = `http://127.0.0.1:${server.address().port}`;

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test('responses carry production security headers and hide Express', async () => {
  const response = await fetch(`${base}/api/push/key`, {
    headers: { 'X-Forwarded-Proto': 'https' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
  const csp = response.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
});

test('cross-origin mutations and malformed JSON get safe JSON errors', async () => {
  const crossOrigin = await fetch(`${base}/api/auth/logout`, {
    method: 'POST',
    headers: { Origin: 'https://attacker.example' },
  });
  assert.equal(crossOrigin.status, 403);
  assert.deepEqual(await crossOrigin.json(), { error: 'Cross-origin request blocked.' });

  const malformed = await fetch(`${base}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });
  assert.equal(malformed.status, 400);
  assert.match(malformed.headers.get('content-type'), /^application\/json/);
  assert.deepEqual(await malformed.json(), { error: 'Invalid JSON body.' });
});

test('valid invites still register and invalid invite abuse is throttled before account creation', async () => {
  const valid = await fetch(`${base}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'InvitedUser', pin: '483729', inviteCode: 'VALID2' }),
  });
  assert.equal(valid.status, 200);
  assert.equal((await valid.json()).created, true);

  const invalidBody = JSON.stringify({ username: 'InviteProbe', pin: '483729', inviteCode: 'BAD222' });
  for (let attempt = 1; attempt <= 10; attempt++) {
    const response = await fetch(`${base}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: invalidBody,
    });
    assert.equal(response.status, 403);
  }
  const throttled = await fetch(`${base}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: invalidBody,
  });
  assert.equal(throttled.status, 429);
  assert.equal(db.prepare("SELECT 1 FROM users WHERE username = 'InviteProbe'").get(), undefined);
});
