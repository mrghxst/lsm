import type { SpaceState } from '../types';

export function SummaryBar({ state }: { state: SpaceState }) {
  const { tables } = state;
  const people = tables.flatMap((t) => t.claims);
  const arrived = people.filter((p) => p.status === 'arrived').length;
  const coming = people.length - arrived;
  const activeTables = tables.filter((t) => !t.released);
  const freeSeats = activeTables.reduce((sum, t) => sum + t.capacity, 0) - people.length;

  const comingEtas = people.filter((p) => p.status === 'coming').map((p) => p.eta);
  const next = comingEtas.includes('now') ? 'any minute' : [...comingEtas].sort()[0] ?? null;

  const emptyTables = activeTables.filter((t) => t.claims.length === 0);
  const showHint = people.length > 0 && emptyTables.length > 0;
  const emptyLabels = emptyTables.map((t) => t.label).join(', ');

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
          <span className="stat-value">{freeSeats}</span>
          <span className="stat-label">free seats</span>
        </div>
      </div>
      {showHint && (
        <p className="summary-hint">
          💡 {emptyLabels} {emptyTables.length === 1 ? 'is' : 'are'} still empty — give back what you don't need.
        </p>
      )}
    </div>
  );
}
