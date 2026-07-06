import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from './db.js';
import { colorFor, isValidColor } from './colors.js';

const TOKEN_TTL_SECONDS = 90 * 24 * 3600;

export const authRouter = Router();

function setSessionCookie(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  db.prepare('INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  res.cookie('lsm_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: '/',
    maxAge: TOKEN_TTL_SECONDS * 1000,
  });
}

function publicUser(user) {
  return { id: user.id, username: user.username, color: colorFor(user), isAdmin: !!user.is_admin };
}

// Grant admin at sign-in time too, so ADMIN_USERNAME works even when the
// account is registered after the server started.
function applyAdminGrant(user) {
  const adminName = process.env.ADMIN_USERNAME?.trim();
  if (adminName && !user.is_admin && user.username.toLowerCase() === adminName.toLowerCase()) {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
    user.is_admin = 1;
  }
}

// Single register-or-login flow: unknown name creates an account,
// known name requires the matching PIN.
authRouter.post('/session', (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const pin = String(req.body?.pin ?? '');
  const color = req.body?.color;
  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: 'Name must be 2–20 characters.' });
  }
  if (!/^\d{4,8}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be 4–8 digits.' });
  }

  const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (existing) {
    if (!bcrypt.compareSync(pin, existing.pin_hash)) {
      return res.status(401).json({ error: 'Wrong PIN for this name (or the name is taken by someone else).' });
    }
    // Returning user picked a different color on the sign-in screen: honor it.
    if (isValidColor(color) && color !== existing.color) {
      db.prepare('UPDATE users SET color = ? WHERE id = ?').run(color, existing.id);
      existing.color = color;
    }
    applyAdminGrant(existing);
    setSessionCookie(req, res, existing.id);
    return res.json({ user: publicUser(existing), created: false });
  }

  const info = db.prepare('INSERT INTO users (username, pin_hash, color) VALUES (?, ?, ?)').run(
    username,
    bcrypt.hashSync(pin, 10),
    isValidColor(color) ? color : '',
  );
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  applyAdminGrant(user);
  setSessionCookie(req, res, user.id);
  res.json({ user: publicUser(user), created: true });
});

authRouter.post('/logout', (req, res) => {
  const token = req.cookies?.lsm_session;
  if (token) db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(token);
  res.clearCookie('lsm_session', { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  res.json({ user: publicUser(user) });
});

export function getSessionUser(req) {
  const token = req.cookies?.lsm_session;
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.* FROM auth_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.token = ? AND t.expires_at > unixepoch()
  `).get(token);
  return row ?? null;
}

export function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Admins only.' });
  next();
}
