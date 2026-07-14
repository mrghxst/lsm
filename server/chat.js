import { Router } from 'express';
import { db } from './db.js';
import { broadcast } from './events.js';
import { getSpaceState } from './spaces.js';
import { notifySpaceUsers } from './push.js';
import { colorFor } from './colors.js';

// Room chat: a tiny session-scoped channel for the people actually at the
// tables today — the alternative to spamming the big WhatsApp group. Only
// someone with a seat (coming or arrived) may write; everyone viewing the
// space can read. The log dies with the session.
const MAX_LEN = 500;
const KEEP = 200; // stored per space; the state ships the last 100

export function chatForState(spaceId) {
  return {
    messages: db.prepare(`
      SELECT m.id, m.user_id, m.body, m.created_at, u.username, u.color
      FROM chat_messages m JOIN users u ON u.id = m.user_id
      WHERE m.space_id = ? ORDER BY m.id DESC LIMIT 100
    `).all(spaceId).reverse().map((m) => ({
      id: m.id,
      userId: m.user_id,
      username: m.username,
      color: colorFor({ id: m.user_id, color: m.color }),
      body: m.body,
      createdAt: m.created_at,
    })),
    muted: db.prepare('SELECT user_id FROM chat_mutes WHERE space_id = ?').all(spaceId).map((r) => r.user_id),
  };
}

export function clearChat(spaceId) {
  db.prepare('DELETE FROM chat_messages WHERE space_id = ?').run(spaceId);
}

// ---------------------------------------------------------------------------
// Routes, mounted at /api/spaces/:code/chat (auth comes from the parent
// router). Mutations answer with the full space state and broadcast it,
// like everything else — that is what makes the chat live over SSE.

export const chatRouter = Router({ mergeParams: true });

function requireOpenSpace(req, res) {
  const space = db.prepare('SELECT * FROM spaces WHERE code = ?').get(String(req.params.code).toUpperCase());
  if (!space) {
    res.status(404).json({ error: 'Space not found.' });
    return null;
  }
  if (space.status !== 'open') {
    res.status(409).json({ error: 'No active session right now.' });
    return null;
  }
  return space;
}

function sendUpdate(space, res) {
  const state = getSpaceState(space.code);
  broadcast(space.id, state);
  res.json(state);
}

chatRouter.post('/', (req, res) => {
  const space = requireOpenSpace(req, res);
  if (!space) return;
  const seated = db.prepare(`
    SELECT 1 FROM claims c JOIN tables t ON t.id = c.table_id
    WHERE t.space_id = ? AND c.user_id = ? AND c.guest_name IS NULL LIMIT 1
  `).get(space.id, req.user.id);
  if (!seated) return res.status(403).json({ error: 'Grab a seat to chat with the room.' });
  const body = String(req.body?.text ?? '').trim();
  if (!body || body.length > MAX_LEN) {
    return res.status(400).json({ error: `Say something (max ${MAX_LEN} characters).` });
  }
  db.transaction(() => {
    db.prepare('INSERT INTO chat_messages (space_id, user_id, body) VALUES (?, ?, ?)').run(space.id, req.user.id, body);
    db.prepare(`
      DELETE FROM chat_messages WHERE space_id = ? AND id NOT IN
        (SELECT id FROM chat_messages WHERE space_id = ? ORDER BY id DESC LIMIT ?)
    `).run(space.id, space.id, KEEP);
  })();

  // Push to everyone with a seat today except the sender; per-space chat
  // preferences are applied by notifySpaceUsers.
  const recipients = db.prepare(`
    SELECT DISTINCT c.user_id FROM claims c JOIN tables t ON t.id = c.table_id WHERE t.space_id = ?
  `).all(space.id).map((r) => r.user_id).filter((id) => id !== req.user.id);
  notifySpaceUsers(space.id, recipients, 'chat', {
    title: space.name,
    body: `${req.user.username}: ${body.length > 120 ? `${body.slice(0, 119)}…` : body}`,
    url: `/s/${space.code}`,
    tag: `lsm-chat-${space.code}`,
  });
  sendUpdate(space, res);
});

// Mute is personal and sticky: no pushes and (client-side) no unread badge,
// until switched back on.
chatRouter.post('/mute', (req, res) => {
  const space = requireOpenSpace(req, res);
  if (!space) return;
  if (typeof req.body?.muted !== 'boolean') return res.status(400).json({ error: 'muted must be true or false.' });
  addChatPreference(space.id, req.user.id, !req.body.muted);
  sendUpdate(space, res);
});

function addChatPreference(spaceId, userId, enabled) {
  db.transaction(() => {
    db.prepare('UPDATE space_members SET notify_chat = ? WHERE space_id = ? AND user_id = ?')
      .run(enabled ? 1 : 0, spaceId, userId);
    if (enabled) db.prepare('DELETE FROM chat_mutes WHERE space_id = ? AND user_id = ?').run(spaceId, userId);
    else db.prepare('INSERT OR IGNORE INTO chat_mutes (space_id, user_id) VALUES (?, ?)').run(spaceId, userId);
  })();
}
