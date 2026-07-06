import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from './db.js';
import { requireAuth } from './auth.js';
import { subscribe, broadcast } from './events.js';

export const spacesRouter = Router();
spacesRouter.use(requireAuth);

// No 0/O/1/I/L to keep codes easy to read out loud.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function newCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

function getSpaceRow(code) {
  return db.prepare('SELECT * FROM spaces WHERE code = ?').get(String(code).toUpperCase());
}

export function getSpaceState(code) {
  const space = db.prepare(`
    SELECT s.*, u.username AS owner_name FROM spaces s
    JOIN users u ON u.id = s.owner_id
    WHERE s.code = ?
  `).get(String(code).toUpperCase());
  if (!space) return null;

  const tables = db.prepare('SELECT * FROM tables WHERE space_id = ? ORDER BY id').all(space.id);
  const claims = db.prepare(`
    SELECT c.*, u.username FROM claims c
    JOIN users u ON u.id = c.user_id
    JOIN tables t ON t.id = c.table_id
    WHERE t.space_id = ?
    ORDER BY c.created_at, c.id
  `).all(space.id);

  return {
    space: {
      code: space.code,
      name: space.name,
      ownerId: space.owner_id,
      ownerName: space.owner_name,
      seatsPerTable: space.seats_per_table,
      status: space.status,
      createdAt: space.created_at,
    },
    tables: tables.map((t) => ({
      id: t.id,
      label: t.label,
      released: !!t.released,
      claims: claims
        .filter((c) => c.table_id === t.id)
        .map((c) => ({ userId: c.user_id, username: c.username, eta: c.eta, status: c.status })),
    })),
  };
}

function normalizeEta(value) {
  const eta = String(value ?? '').trim().toLowerCase();
  if (eta === 'now') return 'now';
  const m = /^(\d{1,2}):(\d{2})$/.exec(eta);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function requireOpenSpace(req, res) {
  const space = getSpaceRow(req.params.code);
  if (!space) {
    res.status(404).json({ error: 'Space not found.' });
    return null;
  }
  if (space.status !== 'open') {
    res.status(410).json({ error: 'This space has ended.' });
    return null;
  }
  return space;
}

function sendUpdate(space, res) {
  const state = getSpaceState(space.code);
  broadcast(space.id, state);
  res.json(state);
}

spacesRouter.post('/', (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const tableCount = Number(req.body?.tableCount);
  const seatsPerTable = Number(req.body?.seatsPerTable);
  if (!name || name.length > 60) return res.status(400).json({ error: 'Give the space a name (max 60 characters).' });
  if (!Number.isInteger(tableCount) || tableCount < 1 || tableCount > 20) {
    return res.status(400).json({ error: 'Number of tables must be between 1 and 20.' });
  }
  if (!Number.isInteger(seatsPerTable) || seatsPerTable < 1 || seatsPerTable > 8) {
    return res.status(400).json({ error: 'Seats per table must be between 1 and 8.' });
  }

  const create = db.transaction(() => {
    let code = newCode();
    while (getSpaceRow(code)) code = newCode();
    const info = db
      .prepare('INSERT INTO spaces (code, name, owner_id, seats_per_table) VALUES (?, ?, ?, ?)')
      .run(code, name, req.user.id, seatsPerTable);
    const insertTable = db.prepare('INSERT INTO tables (space_id, label) VALUES (?, ?)');
    for (let i = 1; i <= tableCount; i++) insertTable.run(info.lastInsertRowid, `T${i}`);
    return code;
  });
  res.json({ code: create() });
});

spacesRouter.get('/:code', (req, res) => {
  const state = getSpaceState(req.params.code);
  if (!state) return res.status(404).json({ error: 'Space not found.' });
  res.json(state);
});

spacesRouter.get('/:code/events', (req, res) => {
  const space = getSpaceRow(req.params.code);
  if (!space) return res.status(404).end();
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(`data: ${JSON.stringify(getSpaceState(space.code))}\n\n`);
  const unsubscribe = subscribe(space.id, res);
  req.on('close', unsubscribe);
});

// Join a table (or move here from another table in the same space).
spacesRouter.post('/:code/tables/:tableId/claims', (req, res) => {
  const space = requireOpenSpace(req, res);
  if (!space) return;
  const eta = normalizeEta(req.body?.eta);
  if (!eta) return res.status(400).json({ error: 'Invalid arrival time.' });
  const table = db.prepare('SELECT * FROM tables WHERE id = ? AND space_id = ?').get(req.params.tableId, space.id);
  if (!table) return res.status(404).json({ error: 'Table not found.' });
  if (table.released) return res.status(409).json({ error: 'This table has been given back.' });

  const join = db.transaction(() => {
    db.prepare('DELETE FROM claims WHERE user_id = ? AND table_id IN (SELECT id FROM tables WHERE space_id = ?)')
      .run(req.user.id, space.id);
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM claims WHERE table_id = ?').get(table.id);
    if (n >= space.seats_per_table) {
      const err = new Error('This table is already full.');
      err.status = 409;
      throw err;
    }
    const status = eta === 'now' ? 'arrived' : 'coming';
    db.prepare('INSERT INTO claims (table_id, user_id, eta, status) VALUES (?, ?, ?, ?)').run(table.id, req.user.id, eta, status);
  });
  try {
    join();
  } catch (e) {
    return res.status(e.status ?? 500).json({ error: e.message });
  }
  sendUpdate(space, res);
});

// Update my claim: change ETA and/or mark arrived.
spacesRouter.patch('/:code/claims/mine', (req, res) => {
  const space = requireOpenSpace(req, res);
  if (!space) return;
  const claim = db.prepare(`
    SELECT c.* FROM claims c
    JOIN tables t ON t.id = c.table_id
    WHERE c.user_id = ? AND t.space_id = ?
  `).get(req.user.id, space.id);
  if (!claim) return res.status(404).json({ error: 'You have no seat in this space.' });

  let eta = claim.eta;
  let status = claim.status;
  if (req.body?.eta !== undefined) {
    eta = normalizeEta(req.body.eta);
    if (!eta) return res.status(400).json({ error: 'Invalid arrival time.' });
    status = 'coming';
  }
  if (req.body?.status !== undefined) {
    if (!['coming', 'arrived'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid status.' });
    status = req.body.status;
    if (status === 'arrived') eta = 'now';
  }
  db.prepare('UPDATE claims SET eta = ?, status = ? WHERE id = ?').run(eta, status, claim.id);
  sendUpdate(space, res);
});

// Leave the space.
spacesRouter.delete('/:code/claims/mine', (req, res) => {
  const space = requireOpenSpace(req, res);
  if (!space) return;
  db.prepare('DELETE FROM claims WHERE user_id = ? AND table_id IN (SELECT id FROM tables WHERE space_id = ?)')
    .run(req.user.id, space.id);
  sendUpdate(space, res);
});

// Owner: give a table back / take it back again.
spacesRouter.patch('/:code/tables/:tableId', (req, res) => {
  const space = requireOpenSpace(req, res);
  if (!space) return;
  if (space.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the space owner can do that.' });
  const table = db.prepare('SELECT * FROM tables WHERE id = ? AND space_id = ?').get(req.params.tableId, space.id);
  if (!table) return res.status(404).json({ error: 'Table not found.' });
  const released = req.body?.released;
  if (typeof released !== 'boolean') return res.status(400).json({ error: 'released must be true or false.' });
  if (released) {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM claims WHERE table_id = ?').get(table.id);
    if (n > 0) return res.status(409).json({ error: 'People are on this table — it cannot be given back.' });
  }
  db.prepare('UPDATE tables SET released = ? WHERE id = ?').run(released ? 1 : 0, table.id);
  sendUpdate(space, res);
});

// Owner: end the space for everyone.
spacesRouter.patch('/:code', (req, res) => {
  const space = requireOpenSpace(req, res);
  if (!space) return;
  if (space.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the space owner can do that.' });
  if (req.body?.status !== 'closed') return res.status(400).json({ error: 'Only closing is supported.' });
  db.prepare("UPDATE spaces SET status = 'closed' WHERE id = ?").run(space.id);
  sendUpdate(space, res);
});

// Spaces are for one study day: auto-close after 16 hours.
export function sweepExpired() {
  const stale = db.prepare("SELECT id, code FROM spaces WHERE status = 'open' AND created_at < unixepoch() - 16 * 3600").all();
  if (stale.length === 0) return;
  const close = db.prepare("UPDATE spaces SET status = 'closed' WHERE id = ?");
  for (const s of stale) {
    close.run(s.id);
    broadcast(s.id, getSpaceState(s.code));
  }
}
