import { useState } from 'react';
import type { SpaceState } from '../types';
import { claimColor, etaLabel, formatClock, formatDuration } from '../util';
import { useNowMinute } from '../useNow';

type DetailKey = 'here' | 'coming' | 'free';

export function SummaryBar({ state, onAddTable }: { state: SpaceState; onAddTable(): void }) {
  const { tables } = state;
  const now = useNowMinute();
  const [detail, setDetail] = useState<DetailKey | null>(null);

  const rows = tables.flatMap((t) => t.claims.map((c) => ({ ...c, tableLabel: t.label })));
  const arrived = rows
    .filter((p) => p.status === 'arrived')
    .sort((a, b) => (a.arrivedAt ?? 0) - (b.arrivedAt ?? 0));
  const coming = rows.filter((p) => p.status === 'coming').sort((a, b) => a.eta.localeCompare(b.eta));
  const activeTables = tables.filter((t) => !t.released);
  const freeSeats = activeTables.reduce((sum, t) => sum + t.capacity, 0) - rows.length;
  const next = coming.some((p) => p.eta === 'now') ? 'any minute' : coming[0]?.eta ?? null;
  const freeByTable = activeTables
    .map((t) => ({ id: t.id, label: t.label, free: t.capacity - t.claims.length, capacity: t.capacity }))
    .filter((t) => t.free > 0);

  const toggle = (key: DetailKey) => setDetail((d) => (d === key ? null : key));

  return (
    <div className="summary">
      <div className="stats">
        <button className={`stat stat-btn${detail === 'here' ? ' active' : ''}`} onClick={() => toggle('here')}>
          <span className="stat-value ok">{arrived.length}</span>
          <span className="stat-label">here</span>
        </button>
        <button className={`stat stat-btn${detail === 'coming' ? ' active' : ''}`} onClick={() => toggle('coming')}>
          <span className="stat-value warn">{coming.length}</span>
          <span className="stat-label">{next ? `coming · ${next}` : 'coming'}</span>
        </button>
        <button className={`stat stat-btn${detail === 'free' ? ' active' : ''}`} onClick={() => toggle('free')}>
          <span className="stat-value">{freeSeats}</span>
          <span className="stat-label">free seats</span>
        </button>
        <span className="stats-gap" />
        <button className="add-table-btn" onClick={onAddTable}>
          + Add table
        </button>
      </div>

      {detail === 'here' && (
        <ul className="people-list summary-detail card">
          {arrived.length === 0 && <li className="hint">Nobody has arrived yet.</li>}
          {arrived.map((p) => (
            <li key={p.id}>
              <span className="person-dot" style={{ background: claimColor(p) }} />
              <span className="person-name">
                {p.guestName ?? p.username}
                {p.guestName && <span className="occupant-sub"> · friend of {p.username}</span>}
              </span>
              <span className="person-table">{p.tableLabel}</span>
              <span className="person-eta">
                {p.arrivedAt ? `since ${formatClock(p.arrivedAt)} · ${formatDuration(p.arrivedAt, now)}` : 'here'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {detail === 'coming' && (
        <ul className="people-list summary-detail card">
          {coming.length === 0 && <li className="hint">Nobody is on the way right now.</li>}
          {coming.map((p) => (
            <li key={p.id}>
              <span className="person-dot" style={{ background: claimColor(p) }} />
              <span className="person-name">
                {p.guestName ?? p.username}
                {p.guestName && <span className="occupant-sub"> · friend of {p.username}</span>}
              </span>
              <span className="person-table">{p.tableLabel}</span>
              <span className="person-eta">{etaLabel(p.eta)}</span>
            </li>
          ))}
        </ul>
      )}

      {detail === 'free' && (
        <ul className="people-list summary-detail card">
          {freeByTable.length === 0 && <li className="hint">Every seat is taken.</li>}
          {freeByTable.map((t) => (
            <li key={t.id}>
              <span className="person-name">{t.label}</span>
              <span className="person-eta">
                {t.free} of {t.capacity} {t.capacity === 1 ? 'seat' : 'seats'} free
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
