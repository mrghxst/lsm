import type { Table } from '../types';
import { etaLabel } from '../util';

export function PeopleList({ tables }: { tables: Table[] }) {
  const rows = tables.flatMap((t) => t.claims.map((c) => ({ ...c, tableLabel: t.label })));
  if (rows.length === 0) return null;
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'arrived' ? -1 : 1;
    return a.eta.localeCompare(b.eta);
  });
  return (
    <div className="card people">
      <h2 className="section-title">Who's coming</h2>
      <ul className="people-list">
        {rows.map((r) => (
          <li key={r.userId}>
            <span className="person-dot" style={{ background: r.color }} />
            <span className="person-name">{r.username}</span>
            <span className="person-table">{r.tableLabel}</span>
            <span className="person-eta">{r.status === 'arrived' ? 'here 🎉' : etaLabel(r.eta)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
