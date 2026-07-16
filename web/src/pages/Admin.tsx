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

interface AdminInvite {
  code: string;
  createdAt: number;
  usedAt: number | null;
  usedByName: string | null;
}

interface Overview {
  users: AdminUser[];
  spaces: AdminSpace[];
  invites: AdminInvite[];
}

function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString();
}

export function Admin() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState<string | null>(null);

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

  async function generateInvite() {
    try {
      await api<{ code: string }>('/api/admin/invites', { method: 'POST' });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create a code.');
    }
  }

  async function revokeInvite(code: string) {
    try {
      await api(`/api/admin/invites/${code}`, { method: 'DELETE' });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revoke the code.');
    }
  }

  function inviteUrl(code: string) {
    const url = new URL('/', window.location.origin);
    url.searchParams.set('invite', code);
    return url.toString();
  }

  async function copyInvite(code: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(code));
      setCopiedInvite(code);
      window.setTimeout(() => setCopiedInvite((current) => (current === code ? null : current)), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not copy the invite link.');
    }
  }

  async function shareInvite(code: string) {
    const url = inviteUrl(code);
    if (!navigator.share) return copyInvite(code);
    try {
      await navigator.share({ title: 'Learning Space Manager invite', text: 'Use this link to create your account.', url });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Could not share the invite link.');
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
            <h2 className="section-title">Invite codes</h2>
            <p className="hint">New people need one of these one-time codes to create an account.</p>
            {data.invites.length === 0 && <p className="hint">No codes yet — generate one to invite someone.</p>}
            {data.invites.map((i) => (
              <div key={i.code} className={`occupant-row admin-row${i.usedAt ? ' invite-used' : ''}`}>
                <span className="group-main">
                  <span className="recent-name invite-code">{i.code}</span>
                  <span className="group-sub">
                    {i.usedAt
                      ? `used by ${i.usedByName ?? 'a deleted account'} · ${formatDate(i.usedAt)}`
                      : `created ${formatDate(i.createdAt)} · unused`}
                  </span>
                </span>
                {!i.usedAt && (
                  <span className="admin-invite-actions">
                    <button className="btn btn-secondary btn-compact" onClick={() => void copyInvite(i.code)}>
                      {copiedInvite === i.code ? 'Copied!' : 'Copy link'}
                    </button>
                    <button className="btn btn-secondary btn-compact" onClick={() => void shareInvite(i.code)}>
                      Share
                    </button>
                    <button className="occupant-btn danger" title="Revoke code" onClick={() => void revokeInvite(i.code)}>
                    ✕
                    </button>
                  </span>
                )}
              </div>
            ))}
            <button className="btn btn-secondary" onClick={() => void generateInvite()}>
              + Generate invite code
            </button>
          </div>

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
