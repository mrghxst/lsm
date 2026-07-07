import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from './db.js';
import { requireAuth, requireAdmin } from './auth.js';
import { colorFor } from './colors.js';
import { deleteSpace } from './spaces.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

// Same no-lookalike alphabet as the space share codes.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function newInviteCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

adminRouter.get('/overview', (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.color, u.is_admin, u.created_at,
      (SELECT COUNT(*) FROM space_members m WHERE m.user_id = u.id) AS groups
    FROM users u ORDER BY u.id
  `).all();
  const spaces = db.prepare(`
    SELECT s.*, o.username AS owner_name, op.username AS opened_by_name,
      (SELECT COUNT(*) FROM space_members m WHERE m.space_id = s.id) AS member_count,
      (SELECT COALESCE(SUM(t.capacity), 0) FROM tables t WHERE t.space_id = s.id AND t.released = 0) AS total_seats,
      (SELECT COUNT(*) FROM claims c JOIN tables t ON t.id = c.table_id WHERE t.space_id = s.id) AS people_count
    FROM spaces s
    JOIN users o ON o.id = s.owner_id
    LEFT JOIN users op ON op.id = s.opened_by
    ORDER BY (s.status = 'open') DESC, s.created_at DESC
  `).all();
  const invites = db.prepare(`
    SELECT i.code, i.created_at, i.used_at, u.username AS used_by_name
    FROM invite_codes i
    LEFT JOIN users u ON u.id = i.used_by
    ORDER BY (i.used_at IS NULL) DESC, i.created_at DESC
  `).all();
  res.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      color: colorFor(u),
      isAdmin: !!u.is_admin,
      createdAt: u.created_at,
      groups: u.groups,
    })),
    spaces: spaces.map((s) => ({
      code: s.code,
      name: s.name,
      status: s.status,
      ownerName: s.owner_name,
      openedByName: s.opened_by_name,
      memberCount: s.member_count,
      totalSeats: s.total_seats,
      peopleCount: s.people_count,
      createdAt: s.created_at,
    })),
    invites: invites.map((i) => ({
      code: i.code,
      createdAt: i.created_at,
      usedAt: i.used_at,
      usedByName: i.used_by_name,
    })),
  });
});

// Mint a one-time registration code to hand to a new member.
adminRouter.post('/invites', (req, res) => {
  let code = newInviteCode();
  while (db.prepare('SELECT 1 FROM invite_codes WHERE code = ?').get(code)) code = newInviteCode();
  db.prepare('INSERT INTO invite_codes (code, created_by) VALUES (?, ?)').run(code, req.user.id);
  res.json({ code });
});

// Revoke a code nobody has used yet.
adminRouter.delete('/invites/:code', (req, res) => {
  const info = db
    .prepare('DELETE FROM invite_codes WHERE code = ? AND used_at IS NULL')
    .run(String(req.params.code).toUpperCase());
  if (info.changes === 0) return res.status(404).json({ error: 'Code not found (or already used).' });
  res.json({ ok: true });
});

// Delete a user account (e.g. an offensive name). Their claims, guest
// reservations, memberships, sessions tokens and push subscriptions go with
// them; groups they own are deleted entirely.
adminRouter.delete('/users/:id', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.is_admin) return res.status(400).json({ error: 'Admin accounts cannot be deleted.' });

  const owned = db.prepare('SELECT * FROM spaces WHERE owner_id = ?').all(target.id);
  for (const space of owned) deleteSpace(space);
  db.transaction(() => {
    db.prepare('UPDATE spaces SET opened_by = NULL WHERE opened_by = ?').run(target.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  })();
  res.json({ ok: true });
});
