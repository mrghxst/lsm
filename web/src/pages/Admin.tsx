import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../AuthContext';

interface AdminUser {
  id: number;
  username: string;
  color: string;
  isAdmin: boolean;
  createdAt: number;
  groups: number;
}

interface AdminSpace {
  code: string;
  name: string;
  status: 'idle' | 'open';
  ownerName: string;
  openedByName: string | null;
  memberCount: number;
  totalSeats: number;
  peopleCount: number;
  createdAt: number;
}

interface Overview {
  users: AdminUser[];
  spaces: AdminSpace[];
}

function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString();
}

export function Admin() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api<Overview>('/api/admin/overview')
      .then(setData)
      .catch((e) => setError(e instanceof ApiError && e.status === 403 ? 'Admins only.' : e.message));
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate('/?next=/admin', { replace: true });
    if (user) refresh();
  }, [loading, user, navigate, refresh]);

  async function deleteSpace(s: AdminSpace) {
    if (!window.confirm(`Delete “${s.name}” (${s.code}) forever? The code stops working for its ${s.memberCount} member(s).`)) return;
    try {
      await api(`/api/spaces/${s.code}`, { method: 'DELETE' });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    }
  }

  async function deleteUser(u: AdminUser) {
    if (!window.confirm(`Delete user “${u.username}”? Their seats, guest reservations and memberships are removed — and any spaces they own are deleted entirely.`)) return;
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'DELETE' });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    }
  }

  if (!user || (!data && !error)) {
    return <div className="screen-center">Loading…</div>;
  }

  return (
    <div className="app">
      <header className="top-bar">
        <Link to="/" className="icon-btn" aria-label="Back">
          ←
        </Link>
        <h1 className="top-title">Admin</h1>
      </header>

      {error && <p className="error">{error}</p>}

      {data && (
        <div className="stack">
          <div className="card stack">
            <h2 className="section-title">
              Spaces ({data.spaces.filter((s) => s.status === 'open').length} active / {data.spaces.length})
            </h2>
            {data.spaces.length === 0 && <p className="hint">No spaces yet.</p>}
            {data.spaces.map((s) => (
              <div key={s.code} className="occupant-row admin-row">
                <span className={`group-status ${s.status}`} />
                <span className="group-main">
                  <Link to={`/s/${s.code}`} className="recent-name admin-link">
                    {s.name}
                  </Link>
                  <span className="group-sub">
                    {s.code} · by {s.ownerName} · {s.memberCount} {s.memberCount === 1 ? 'member' : 'members'}
                    {s.status === 'open'
                      ? ` · open (${s.openedByName}): ${s.peopleCount}/${s.totalSeats} seats`
                      : ` · created ${formatDate(s.createdAt)}`}
                  </span>
                </span>
                <button className="occupant-btn danger" title="Delete space" onClick={() => void deleteSpace(s)}>
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="card stack">
            <h2 className="section-title">Users ({data.users.length})</h2>
            {data.users.map((u) => (
              <div key={u.id} className="occupant-row admin-row">
                <span className="person-dot" style={{ background: u.color }} />
                <span className="group-main">
                  <span className="recent-name">
                    {u.username}
                    {u.isAdmin && <span className="badge-admin"> admin</span>}
                  </span>
                  <span className="group-sub">
                    joined {formatDate(u.createdAt)} · {u.groups} {u.groups === 1 ? 'space' : 'spaces'}
                  </span>
                </span>
                {!u.isAdmin && (
                  <button className="occupant-btn danger" title="Delete user" onClick={() => void deleteUser(u)}>
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
