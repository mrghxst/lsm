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

// Ring geometry: r=27 in a 64×64 viewBox leaves room for the 6px stroke.
const R = 27;
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
        <h2 className="section-title">Focus together</h2>
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

  // Who's in, as a sentence — the round is glanceable, the roster is detail.
  const names = timer.participants.map((p) => p.username);
  const roster =
    names.length === 0
      ? 'nobody yet'
      : names.length <= 3
        ? names.join(', ')
        : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;

  return (
    <div className="card timer-card">
      <div className="timer-row">
        <div className="timer-ring-wrap">
          <svg className="timer-ring" viewBox="0 0 64 64">
            <circle className="timer-ring-track" cx="32" cy="32" r={R} />
            <circle
              className={`timer-ring-fill${joinOpen ? ' joinable' : ''}`}
              cx="32"
              cy="32"
              r={R}
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - frac)}
              transform="rotate(-90 32 32)"
            />
          </svg>
          {finished && <span className="timer-emoji">🎉</span>}
        </div>

        <div className="timer-body">
          <span className="card-label">{finished ? 'Break time' : 'Focus round'}</span>
          <div className="timer-time-row">
            {finished ? (
              <span className="timer-time">{totalMin} min</span>
            ) : (
              <>
                <span className="timer-time">{fmt(remaining)}</span>
                <span className="timer-of">of {totalMin} min</span>
              </>
            )}
          </div>
          <p className="timer-sub">
            {finished
              ? `Nice work${joined ? ' — stretch your legs' : ''}! Anyone can start the next round.`
              : `${roster} focusing · ${joinOpen ? `join open ${fmt(timer.joinUntil - now)}` : 'join window closed'}`}
          </p>
          {!finished && <p className="timer-sub timer-ends">ends {formatClock(timer.endsAt)}</p>}
        </div>

        {canStop && (
          <button
            className="timer-stop"
            title={finished ? 'Dismiss' : 'Stop the timer for everyone'}
            aria-label={finished ? 'Dismiss' : 'Stop the timer for everyone'}
            onClick={() => {
              if (finished || window.confirm('Stop the timer for everyone?')) actions.cancelTimer(timer.id);
            }}
          >
            ✕
          </button>
        )}
      </div>

      {!finished &&
        (joined ? (
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
        ) : null)}
    </div>
  );
}
