import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from './db.js';

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

// Single register-or-login flow: unknown name creates an account,
// known name requires the matching PIN.
authRouter.post('/session', (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const pin = String(req.body?.pin ?? '');
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
    setSessionCookie(req, res, existing.id);
    return res.json({ user: { id: existing.id, username: existing.username }, created: false });
  }

  const info = db.prepare('INSERT INTO users (username, pin_hash) VALUES (?, ?)').run(username, bcrypt.hashSync(pin, 10));
  setSessionCookie(req, res, info.lastInsertRowid);
  res.json({ user: { id: info.lastInsertRowid, username }, created: true });
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
  res.json({ user: { id: user.id, username: user.username } });
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
