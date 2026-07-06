import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { rememberSpace } from '../recents';
import { Stepper } from '../components/Stepper';

export function CreateSpace() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [tableCount, setTableCount] = useState(4);
  const [defaultCapacity, setDefaultCapacity] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate('/?next=/new', { replace: true });
  }, [loading, user, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { code } = await api<{ code: string }>('/api/spaces', {
        method: 'POST',
        body: { name: name.trim(), tableCount, defaultCapacity },
      });
      rememberSpace(code, name.trim());
      navigate(`/s/${code}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the space.');
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="top-bar">
        <Link to="/" className="icon-btn" aria-label="Back">
          ←
        </Link>
        <h1 className="top-title">New space</h1>
      </header>

      <form className="stack" onSubmit={submit}>
        <label className="field card">
          <span>Where are you?</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Library 2nd floor, window row"
            maxLength={60}
            required
          />
        </label>

        <div className="card stack">
          <Stepper label="Tables reserved" value={tableCount} min={1} max={20} onChange={setTableCount} />
          <Stepper label="Seats per table" value={defaultCapacity} min={1} max={8} onChange={setDefaultCapacity} />
          <p className="hint">
            Room for {tableCount * defaultCapacity} people. Afterwards you can adjust each table individually — seats,
            position, rotation.
          </p>
        </div>

        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={busy || !name.trim()}>
          {busy ? 'Creating…' : 'Create space'}
        </button>
      </form>
    </div>
  );
}
