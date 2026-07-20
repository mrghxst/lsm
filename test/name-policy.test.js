import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isBlockedName } from '../server/name-policy.js';

test('blocks configured joke names regardless of case or common evasions', () => {
  for (const name of [
    'Diddy',
    'D.I.D.D.Y',
    'D1ddy',
    'Dіddy', // Cyrillic i
    'JEFFREY EPSTEIN',
    'Epstein69',
    'Ben Dover',
    'Harvey Weinstein',
  ]) {
    assert.equal(isBlockedName(name), true, `${name} should be blocked`);
  }
});

test('blocks clear profanity without rejecting legitimate names containing the same letters', () => {
  for (const name of ['fuck', 'f.u.c.k', 'Fuck Face', 'shithead', 'Fuck3r', 'D1ckhead', 'Wanker']) {
    assert.equal(isBlockedName(name), true, `${name} should be blocked`);
  }
  for (const name of [
    'Arsema',
    'Anuska',
    'Cassandra',
    'Dick',
    'Dick Johnson',
    'Dickson',
    'Peniston',
    'Sean',
    'Sussex',
    'Titus',
  ]) {
    assert.equal(isBlockedName(name), false, `${name} should be allowed`);
  }
});

test('hot-reloads an optional external blocklist', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lsm-name-policy-'));
  const path = join(directory, 'extra.json');
  const previous = process.env.NAME_BLOCKLIST_FILE;
  try {
    writeFileSync(path, JSON.stringify({ blockedNames: ['Professor Chaos'] }));
    process.env.NAME_BLOCKLIST_FILE = path;
    assert.equal(isBlockedName('professor chaos'), true);

    // A different-size write reliably changes mtime even on coarse filesystems.
    writeFileSync(path, JSON.stringify({ blockedNames: ['Captain Underpants'] }, null, 2));
    assert.equal(isBlockedName('Captain Underpants'), true);
    assert.equal(isBlockedName('Professor Chaos'), false);
  } finally {
    if (previous === undefined) delete process.env.NAME_BLOCKLIST_FILE;
    else process.env.NAME_BLOCKLIST_FILE = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
