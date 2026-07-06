import type { SpaceState } from '../types';

export function SummaryBar({ state }: { state: SpaceState }) {
  const { space, tables } = state;
  const people = tables.flatMap((t) => t.claims);
  const arrived = people.filter((p) => p.status === 'arrived').length;
  const coming = people.length - arrived;
  const reserved = tables.filter((t) => !t.released).length;
  const needed = people.length === 0 ? 0 : Math.ceil(people.length / space.seatsPerTable);

  const comingEtas = people.filter((p) => p.status === 'coming').map((p) => p.eta);
  const next = comingEtas.includes('now') ? 'any minute' : [...comingEtas].sort()[0] ?? null;

  const emptyReserved = tables.filter((t) => !t.released && t.claims.length === 0).length;
  const giveBack = people.length > 0 ? Math.min(reserved - needed, emptyReserved) : 0;

  return (
    <div className="card summary">
      <div className="stats">
        <div className="stat">
          <span className="stat-value ok">{arrived}</span>
          <span className="stat-label">here</span>
        </div>
        <div className="stat">
          <span className="stat-value warn">{coming}</span>
          <span className="stat-label">{next ? `coming · ${next}` : 'coming'}</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {needed}
            <span className="stat-sub">/{reserved}</span>
          </span>
          <span className="stat-label">tables needed</span>
        </div>
      </div>
      {giveBack > 0 && (
        <p className="summary-hint">
          💡 {giveBack === 1 ? '1 reserved table is' : `${giveBack} reserved tables are`} not needed right now — consider
          giving {giveBack === 1 ? 'it' : 'them'} back.
        </p>
      )}
    </div>
  );
}
