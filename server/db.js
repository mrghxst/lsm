import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'lsm.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pin_hash TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS spaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  seats_per_table INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  released INTEGER NOT NULL DEFAULT 0,
  capacity INTEGER NOT NULL DEFAULT 2,
  x REAL NOT NULL DEFAULT 0.5,
  y REAL NOT NULL DEFAULT 0.5,
  rot INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  eta TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'coming' CHECK (status IN ('coming', 'arrived')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (table_id, user_id)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_tables_space ON tables(space_id);
CREATE INDEX IF NOT EXISTS idx_claims_table ON claims(table_id);
CREATE INDEX IF NOT EXISTS idx_tokens_expiry ON auth_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
`);

// Default arrangement for n tables: a centered grid, coordinates are
// fractions (0..1) of the room, measured at the table's center.
export function gridPositions(n) {
  const cols = n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  return Array.from({ length: n }, (_, i) => ({
    x: ((i % cols) + 0.5) / cols,
    y: (Math.floor(i / cols) + 0.5) / rows,
  }));
}

// Migrations for databases created by earlier versions.
function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

if (!hasColumn('users', 'color')) {
  db.exec("ALTER TABLE users ADD COLUMN color TEXT NOT NULL DEFAULT ''");
}

if (!hasColumn('tables', 'capacity')) {
  db.exec('ALTER TABLE tables ADD COLUMN capacity INTEGER NOT NULL DEFAULT 2');
  db.exec(`UPDATE tables SET capacity = COALESCE(
    (SELECT seats_per_table FROM spaces WHERE spaces.id = tables.space_id), 2)`);
}

if (!hasColumn('tables', 'x')) {
  db.exec(`
    ALTER TABLE tables ADD COLUMN x REAL NOT NULL DEFAULT 0.5;
    ALTER TABLE tables ADD COLUMN y REAL NOT NULL DEFAULT 0.5;
    ALTER TABLE tables ADD COLUMN rot INTEGER NOT NULL DEFAULT 0;
  `);
  const spaces = db.prepare('SELECT id FROM spaces').all();
  const setPos = db.prepare('UPDATE tables SET x = ?, y = ? WHERE id = ?');
  for (const s of spaces) {
    const tables = db.prepare('SELECT id FROM tables WHERE space_id = ? ORDER BY id').all(s.id);
    const positions = gridPositions(tables.length);
    tables.forEach((t, i) => setPos.run(positions[i].x, positions[i].y, t.id));
  }
}
