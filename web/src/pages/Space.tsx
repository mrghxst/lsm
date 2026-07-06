import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../AuthContext';
import { rememberSpace } from '../recents';
import { disablePush, enablePush, getPushEnabled, iosNeedsInstall, pushSupported } from '../push';
import type { SpaceState } from '../types';
import { SummaryBar } from '../components/SummaryBar';
import { Room } from '../components/Room';
import { PeopleList } from '../components/PeopleList';
import { ClaimSheet } from '../components/ClaimSheet';

export function Space() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [state, setState] = useState<SpaceState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pushOn, setPushOn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate(`/?next=/s/${code}`, { replace: true });
  }, [loading, user, code, navigate]);

  useEffect(() => {
    getPushEnabled().then(setPushOn).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api<SpaceState>(`/api/spaces/${code}`)
      .then((s) => {
        if (!cancelled) setState(s);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError && e.status === 404 ? 'This space does not exist.' : e.message);
      });
    const es = new EventSource(`/api/spaces/${code}/events`);
    es.onmessage = (e) => {
      setState(JSON.parse(e.data));
      setConnected(true);
    };
    es.onerror = () => setConnected(false);
    return () => {
      cancelled = true;
      es.close();
    };
  }, [user, code]);

  useEffect(() => {
    if (state && state.space.status === 'open') rememberSpace(state.space.code, state.space.name);
  }, [state]);

  const mutate = useCallback(
    async (path: string, options: { method: string; body?: unknown }, { close = true } = {}) => {
      try {
        const s = await api<SpaceState>(path, options);
        setState(s);
        if (close) setSelectedId(null);
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Something went wrong.');
        if (e instanceof ApiError && e.status === 410) {
          setState((prev) => (prev ? { ...prev, space: { ...prev.space, status: 'closed' } } : prev));
        }
      }
    },
    [showToast],
  );

  async function share() {
    const url = window.location.origin + `/s/${code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: state?.space.name ?? 'Learning Space', url });
      } else {
        await navigator.clipboard.writeText(url);
        showToast('Link copied — send it to your group!');
      }
    } catch {
      // user dismissed the share sheet
    }
  }

  async function toggleNotifications() {
    if (!pushSupported()) {
      showToast('Notifications are not supported in this browser.');
      return;
    }
    if (iosNeedsInstall()) {
      showToast('On iPhone: first add this app to your Home Screen (Share → Add to Home Screen), then enable notifications from the installed app.');
      return;
    }
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
        showToast('Notifications are off.');
      } else {
        await enablePush();
        setPushOn(true);
        showToast("You'll be notified when people join, arrive or leave.");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not change notifications.');
    }
  }

  if (error) {
    return (
      <div className="app screen-center stack">
        <p className="error">{error}</p>
        <Link to="/" className="btn btn-secondary btn-link">
          Back to start
        </Link>
      </div>
    );
  }

  if (!user || !state) {
    return <div className="screen-center">Loading…</div>;
  }

  const { space, tables } = state;

  if (space.status === 'closed') {
    return (
      <div className="app screen-center stack">
        <div className="hero-icon">🌙</div>
        <h1>This space has ended</h1>
        <p className="tagline">“{space.name}” is no longer active.</p>
        <Link to="/" className="btn btn-primary btn-link">
          Back to start
        </Link>
      </div>
    );
  }

  const isOwner = space.ownerId === user.id;
  const selectedTable = tables.find((t) => t.id === selectedId) ?? null;

  const actions = {
    join: (tableId: number, eta: string) =>
      mutate(`/api/spaces/${code}/tables/${tableId}/claims`, { method: 'POST', body: { eta } }),
    updateEta: (eta: string) => mutate(`/api/spaces/${code}/claims/mine`, { method: 'PATCH', body: { eta } }),
    markArrived: () => mutate(`/api/spaces/${code}/claims/mine`, { method: 'PATCH', body: { status: 'arrived' } }),
    leave: () => mutate(`/api/spaces/${code}/claims/mine`, { method: 'DELETE' }),
    setReleased: (tableId: number, released: boolean) =>
      mutate(`/api/spaces/${code}/tables/${tableId}`, { method: 'PATCH', body: { released } }, { close: false }),
    setCapacity: (tableId: number, capacity: number) =>
      mutate(`/api/spaces/${code}/tables/${tableId}`, { method: 'PATCH', body: { capacity } }, { close: false }),
    rotate: (tableId: number) => {
      const t = tables.find((table) => table.id === tableId);
      if (!t) return;
      void mutate(
        `/api/spaces/${code}/tables/${tableId}`,
        { method: 'PATCH', body: { rot: t.rot === 0 ? 90 : 0 } },
        { close: false },
      );
    },
    move: (tableId: number, x: number, y: number) =>
      mutate(`/api/spaces/${code}/tables/${tableId}`, { method: 'PATCH', body: { x, y } }, { close: false }),
  };

  return (
    <div className="app">
      <header className="top-bar">
        <Link to="/" className="icon-btn" aria-label="Back">
          ←
        </Link>
        <div className="top-title-group">
          <h1 className="top-title">{space.name}</h1>
          <span className="top-sub">
            Code {space.code} · by {space.ownerName}
            <span className={`live-dot ${connected ? 'on' : 'off'}`} title={connected ? 'Live' : 'Reconnecting…'} />
          </span>
        </div>
        <button
          className={`icon-btn${pushOn ? ' icon-btn-active' : ''}`}
          onClick={() => void toggleNotifications()}
          aria-label="Notifications"
        >
          {pushOn ? '🔔' : '🔕'}
        </button>
        <button className="icon-btn" onClick={() => void share()} aria-label="Share">
          📤
        </button>
      </header>

      <SummaryBar state={state} />

      <Room
        tables={tables}
        currentUserId={user.id}
        canArrange={isOwner}
        onTap={(id) => setSelectedId(id)}
        onMove={actions.move}
      />
      {isOwner && <p className="hint room-hint">Tap a table to set it up — drag to move it around.</p>}

      <PeopleList tables={tables} />

      {isOwner && (
        <button
          className="btn btn-danger end-space"
          onClick={() => {
            if (window.confirm('End this space for everyone?')) {
              void mutate(`/api/spaces/${code}`, { method: 'PATCH', body: { status: 'closed' } });
            }
          }}
        >
          End space
        </button>
      )}

      {selectedTable && (
        <ClaimSheet
          state={state}
          table={selectedTable}
          userId={user.id}
          onClose={() => setSelectedId(null)}
          actions={actions}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
