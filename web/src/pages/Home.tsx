import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { getRecents } from '../recents';
import { PALETTE } from '../colors';

export function Home() {
  const { user, loading, signIn, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next');

  const [username, setUsername] = useState(() => localStorage.getItem('lsm.lastName') ?? '');
  const [pin, setPin] = useState('');
  const [color, setColor] = useState(
    () => localStorage.getItem('lsm.lastColor') ?? PALETTE[Math.floor(Math.random() * PALETTE.length)],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const recents = useMemo(getRecents, [user]);

  async function submitSignIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(username.trim(), pin, color);
      localStorage.setItem('lsm.lastName', username.trim());
      localStorage.setItem('lsm.lastColor', color);
      if (next) navigate(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  function submitJoin(e: FormEvent) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code) navigate(`/s/${code}`);
  }

  if (loading) {
    return <div className="screen-center">Loading…</div>;
  }

  if (!user) {
    return (
      <div className="app">
        <div className="hero">
          <div className="hero-icon">🪑</div>
          <h1>Learning Space Manager</h1>
          <p className="tagline">Reserve tables together — see who's coming and when.</p>
        </div>
        <form className="card stack" onSubmit={submitSignIn}>
          <label className="field">
            <span>Your name</span>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. Anna"
              autoComplete="username"
              maxLength={20}
              required
            />
          </label>
          <label className="field">
            <span>PIN (4–8 digits)</span>
            <input
              className="input"
              type="password"
              inputMode="numeric"
              pattern="\d{4,8}"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              autoComplete="current-password"
              maxLength={8}
              required
            />
          </label>
          <div className="field">
            <span>Your color</span>
            <div className="swatches">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`swatch${c === color ? ' active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? '…' : "Let's go"}
          </button>
          <p className="hint">New name? An account is created automatically. Same name + PIN signs you back in.</p>
        </form>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="page-head">
        <h1>Learning Space Manager</h1>
        <p className="tagline">
          Hi <span className="person-dot inline-dot" style={{ background: user.color }} />
          {user.username}!{' '}
          <button className="link-btn" onClick={() => void signOut()}>
            Sign out
          </button>
        </p>
      </header>

      <div className="stack">
        <Link to="/new" className="btn btn-primary btn-link">
          ➕ Create a space
        </Link>

        <form className="card stack" onSubmit={submitJoin}>
          <label className="field">
            <span>Join with a code</span>
            <input
              className="input input-code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="e.g. K3XF7Q"
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect="off"
            />
          </label>
          <button className="btn btn-secondary" disabled={!joinCode.trim()}>
            Open space
          </button>
        </form>

        {recents.length > 0 && (
          <div className="card stack">
            <h2 className="section-title">Recent spaces</h2>
            {recents.map((r) => (
              <Link key={r.code} to={`/s/${r.code}`} className="recent-row">
                <span className="recent-name">{r.name}</span>
                <span className="recent-code">{r.code}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
