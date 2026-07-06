import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { authRouter, requireAuth } from './auth.js';
import { spacesRouter, sweepExpired } from './spaces.js';
import { vapidPublicKey, saveSubscription, removeSubscription } from './push.js';

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRouter);
app.use('/api/spaces', spacesRouter);

app.get('/api/push/key', (req, res) => res.json({ key: vapidPublicKey }));
app.post('/api/push/subscribe', requireAuth, (req, res) => {
  const sub = req.body?.subscription;
  if (!sub?.endpoint || !sub?.keys) return res.status(400).json({ error: 'Invalid subscription.' });
  saveSubscription(req.user.id, sub);
  res.json({ ok: true });
});
app.post('/api/push/unsubscribe', requireAuth, (req, res) => {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== 'string') return res.status(400).json({ error: 'Invalid endpoint.' });
  removeSubscription(req.user.id, endpoint);
  res.json({ ok: true });
});
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Serve the built frontend; fall back to index.html for client-side routes.
const webDist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.use((req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

setInterval(sweepExpired, 15 * 60 * 1000).unref();
sweepExpired();
setInterval(() => {
  db.prepare('DELETE FROM auth_tokens WHERE expires_at < unixepoch()').run();
}, 24 * 3600 * 1000).unref();

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Learning Space Manager listening on http://localhost:${port}`));
