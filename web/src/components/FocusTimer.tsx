import { useEffect, useState } from 'react';
import type { FocusTimer } from '../types';

export interface TimerActions {
  startTimer(minutes: number): void;
  joinTimer(timerId: number): void;
  leaveTimer(timerId: number): void;
  cancelTimer(timerId: number): void;
}

const PRESETS = [45, 60, 90];

// Ring geometry: r=66 in a 160×160 viewBox leaves room for the 10px stroke.
const R = 66;
const CIRC = 2 * Math.PI * R;

function useNowSeconds(active: boolean) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now() / 1000);
    const id = window.setInterval(() => setNow(Date.now() / 1000), 500);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function fmt(totalS: number) {
  const s = Math.max(0, Math.ceil(totalS));
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, '0');
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${sec}`;
  return `${m}:${sec}`;
}

export function FocusTimerCard({
  timer,
  userId,
  canManage,
  actions,
}: {
  timer: FocusTimer | null;
  userId: number;
  canManage: boolean;
  actions: TimerActions;
}) {
  const now = useNowSeconds(timer !== null);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState('');

  if (!timer) {
    const customMin = Number(custom);
    const customOk = Number.isInteger(customMin) && customMin >= 5 && customMin <= 240;
    const startCustom = () => {
      actions.startTimer(customMin);
      setCustom('');
      setCustomOpen(false);
    };
    return (
      <div className="card stack timer-card">
        <h2 className="section-title">⏱️ Focus together</h2>
        <p className="hint timer-hint">Start a round — everyone here gets invited to focus with you.</p>
        <div className="timer-presets">
          {PRESETS.map((m) => (
            <button key={m} className="chip timer-preset" onClick={() => actions.startTimer(m)}>
              {m}
              <small>min</small>
            </button>
          ))}
          <button
            className={`chip timer-preset${customOpen ? ' active' : ''}`}
            title="Custom length"
            onClick={() => setCustomOpen(!customOpen)}
          >
            ✎<small>own</small>
          </button>
        </div>
        {customOpen && (
          <div className="vote-add-row">
            <input
              className="input"
              type="number"
              min={5}
              max={240}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customOk) {
                  e.preventDefault();
                  startCustom();
                }
              }}
              placeholder="Minutes (5–240)"
            />
            <button className="btn btn-primary btn-compact" disabled={!customOk} onClick={startCustom}>
              Start
            </button>
          </div>
        )}
      </div>
    );
  }

  const remaining = timer.endsAt - now;
  const finished = remaining <= 0;
  const joined = timer.participants.some((p) => p.userId === userId);
  const joinOpen = !finished && now < timer.joinUntil;
  const frac = finished ? 0 : Math.min(1, remaining / timer.durationS);
  const totalMin = Math.round(timer.durationS / 60);
  const canStop = finished || canManage || timer.startedBy === userId;

  return (
    <div className="card stack timer-card">
      <div className="timer-head">
        <h2 className="section-title">{finished ? '☕ Break time!' : '⏱️ Focus round'}</h2>
        {canStop && (
          <button
            className="occupant-btn danger"
            title={finished ? 'Dismiss' : 'Stop the timer for everyone'}
            onClick={() => {
              if (finished || window.confirm('Stop the timer for everyone?')) actions.cancelTimer(timer.id);
            }}
          >
            ✕
          </button>
        )}
      </div>

      <div className="timer-ring-wrap">
        <svg className="timer-ring" viewBox="0 0 160 160">
          <circle className="timer-ring-track" cx="80" cy="80" r={R} />
          <circle
            className={`timer-ring-fill${joinOpen ? ' joinable' : ''}`}
            cx="80"
            cy="80"
            r={R}
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - frac)}
            transform="rotate(-90 80 80)"
          />
        </svg>
        <div className="timer-center">
          {finished ? <span className="timer-emoji">🎉</span> : <span className="timer-time">{fmt(remaining)}</span>}
          <span className="timer-sub">
            {finished
              ? `${totalMin} min done`
              : joinOpen
                ? `join open ${fmt(timer.joinUntil - now)}`
                : `of ${totalMin} min`}
          </span>
        </div>
      </div>

      <div className="timer-people">
        {timer.participants.map((p) => (
          <span key={p.userId} className="timer-person">
            <span className="person-dot" style={{ background: p.color }} />
            {p.username}
          </span>
        ))}
      </div>

      {finished ? (
        <p className="hint timer-hint">
          Nice work{joined ? ' — stretch your legs' : ''}! Anyone can start the next round.
        </p>
      ) : joined ? (
        <div className="timer-foot">
          <span className="timer-in">You're in ✓</span>
          <button className="btn btn-secondary btn-compact" onClick={() => actions.leaveTimer(timer.id)}>
            Leave
          </button>
        </div>
      ) : joinOpen ? (
        <button className="btn btn-primary" onClick={() => actions.joinTimer(timer.id)}>
          🔥 Join this round
        </button>
      ) : (
        <p className="hint timer-hint">Join window closed — catch the next round!</p>
      )}
    </div>
  );
}
