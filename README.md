# 🪑 Learning Space Manager

A tiny mobile-first webapp for coordinating shared study tables at university.

The first person to arrive reserves some tables and creates a **space** in the app
(room name + number of tables + seats per table). They share the link/code with the
group. Everyone else taps a table and says roughly when they'll arrive. The person
on site sees live how many people are actually coming — and can **give back** the
tables nobody needs.

## Features

- **No-friction accounts** — name + PIN, auto-registered on first sign-in
- **Live sync** — every phone updates instantly via Server-Sent Events
- **Top-down table view** — seats fill up as people claim them (amber = coming, green = arrived)
- **Smart summary** — "3 here · 2 coming (next ~09:30) · 2 of 5 tables needed" plus a hint when tables can be given back
- **Share codes** — 6-character codes / shareable links per space
- **Auto-expiry** — spaces close themselves after 16 hours (one study day)

## Local development

```bash
npm install
npm --prefix web install
npm run dev        # server on :3000, Vite dev server on :5173
```

Open http://localhost:5173. The SQLite database is created at `data/lsm.sqlite`.

## Deployment (Docker Compose + nginx)

On the server:

```bash
git clone <this repo> lsm && cd lsm
docker compose up -d --build
```

The app listens on `127.0.0.1:3000` (not exposed publicly). The SQLite database is
persisted in `./data/` on the host.

Then wire up nginx: copy `nginx.example.conf` to
`/etc/nginx/sites-available/lsm.conf`, set your domain, enable it, and get a
certificate:

```bash
sudo ln -s /etc/nginx/sites-available/lsm.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d lsm.example.com
```

The `proxy_buffering off` / `proxy_read_timeout 1h` lines in the example config are
required — without them the live updates (SSE) stall behind nginx.

### Updating

```bash
git pull
docker compose up -d --build
```

## How it works

| Piece | Tech |
|---|---|
| Backend | Node.js + Express (ES modules) |
| Database | SQLite (`better-sqlite3`), single file in `data/` |
| Realtime | Server-Sent Events, one channel per space |
| Auth | Username + PIN (bcrypt), HTTP-only cookie sessions (90 days) |
| Frontend | React 18 + TypeScript + Vite |

### API overview

```
POST   /api/auth/session                       register-or-login {username, pin}
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/spaces                             {name, tableCount, seatsPerTable} → {code}
GET    /api/spaces/:code                       full space state
GET    /api/spaces/:code/events                SSE live updates
POST   /api/spaces/:code/tables/:id/claims     {eta: 'now' | 'HH:MM'} join/move
PATCH  /api/spaces/:code/claims/mine           {eta} or {status: 'arrived'}
DELETE /api/spaces/:code/claims/mine           leave
PATCH  /api/spaces/:code/tables/:id            {released: bool} (owner)
PATCH  /api/spaces/:code                       {status: 'closed'} (owner)
```
