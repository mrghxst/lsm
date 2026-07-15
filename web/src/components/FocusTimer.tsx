import { useEffect, useState } from 'react';
import type { FocusTimer } from '../types';
import { formatClock } from '../util';

export interface TimerActions {
  startTimer(minutes: number): void;
  joinTimer(timerId: number): void;
  leaveTimer(timerId: number): void;
  cancelTimer(timerId: number): void;
}

const PRESETS = [45, 60, 90];
const MIN_MINUTES = 5;
const MAX_MINUTES = 240;

// How many minutes a round must run to end at the given wall-clock time.
// A time earlier than now means (early) tomorrow — useful around midnight;
// anything beyond the 4 h cap comes back too large and fails validation.
function minutesUntil(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const target = new Date();
  target.setHours(Number(m[1]), Number(m[2]), 0, 0);
  let mins = Math.round((target.getTime() - Date.now()) / 60_000);
  if (mins <= 0) mins += 24 * 60;
  return mins;
}

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
  const [untilOpen, setUntilOpen] = useState(false);
  const [until, setUntil] = useState('');

  if (!timer) {
    const customMin = Number(custom);
    const customOk = Number.isInteger(customMin) && customMin >= MIN_MINUTES && customMin <= MAX_MINUTES;
    const startCustom = () => {
      actions.startTimer(customMin);
      setCustom('');
      setCustomOpen(false);
    };
    const untilMin = until ? minutesUntil(until) : null;
    const untilOk = untilMin !== null && untilMin >= MIN_MINUTES && untilMin <= MAX_MINUTES;
    const startUntil = () => {
      if (untilMin === null) return;
      actions.startTimer(untilMin);
      setUntil('');
      setUntilOpen(false);
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
            onClick={() => {
              setCustomOpen(!customOpen);
              setUntilOpen(false);
            }}
          >
            ✎<small>own</small>
          </button>
          <button
            className={`chip timer-preset${untilOpen ? ' active' : ''}`}
            title="Run until a set time"
            onClick={() => {
              setUntilOpen(!untilOpen);
              setCustomOpen(false);
            }}
          >
            🕐<small>until</small>
          </button>
        </div>
        {customOpen && (
          <div className="vote-add-row">
            <input
              className="input"
              type="number"
              min={MIN_MINUTES}
              max={MAX_MINUTES}
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
        {untilOpen && (
          <>
            <div className="vote-add-row">
              <input
                className="input"
                type="time"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && untilOk) {
                    e.preventDefault();
                    startUntil();
                  }
                }}
              />
              <button className="btn btn-primary btn-compact" disabled={!untilOk} onClick={startUntil}>
                {untilOk ? `Start (${untilMin} min)` : 'Start'}
              </button>
            </div>
            {untilMin !== null && !untilOk && (
              <p className="hint timer-hint">
                {untilMin < MIN_MINUTES
                  ? `That's only ${untilMin} min away — rounds need at least ${MIN_MINUTES}.`
                  : `That's ${untilMin} min away — rounds max out at ${MAX_MINUTES} (4 h).`}
              </p>
            )}
          </>
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
          {!finished && <span className="timer-sub timer-ends">ends {formatClock(timer.endsAt)}</span>}
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
