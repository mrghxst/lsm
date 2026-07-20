import type { Table } from '../types';
import { claimColor, etaLabel, formatDuration } from '../util';
import { useNowMinute } from '../useNow';

export function PeopleList({ tables, currentUserId }: { tables: Table[]; currentUserId: number }) {
  const now = useNowMinute();
  const rows = tables.flatMap((t) => t.claims.map((c) => ({ ...c, tableLabel: t.label })));
  if (rows.length === 0) return null;
  rows.sort((a, b) => {
    const aIsMe = !a.guestName && a.userId === currentUserId;
    const bIsMe = !b.guestName && b.userId === currentUserId;
    if (aIsMe !== bIsMe) return aIsMe ? -1 : 1;
    if (a.status !== b.status) return a.status === 'arrived' ? -1 : 1;
    return a.eta.localeCompare(b.eta);
  });
  return (
    <div className="card people">
      <div className="card-head">
        <span className="card-label">People</span>
        <span className="card-count">{rows.length} today</span>
      </div>
      <ul className="people-list">
        {rows.map((r) => {
          const color = claimColor(r);
          const name = r.guestName ?? r.username;
          const isMe = !r.guestName && r.userId === currentUserId;
          // Present: filled disc. On the way: the same disc as an outline —
          // the room map uses the same solid/outlined pairing.
          const avatar =
            r.status === 'arrived'
              ? { background: color, color: '#fff' }
              : { boxShadow: `inset 0 0 0 2px ${color}`, color };
          return (
            <li key={r.id} className={r.status === 'coming' ? 'coming' : undefined}>
              <span className="person-avatar" style={avatar}>
                {name.trim().charAt(0).toUpperCase()}
              </span>
              <span className="person-name">
                {name}
                {isMe && <span className="occupant-sub"> · you</span>}
                {r.guestName && <span className="occupant-sub"> · friend of {r.username}</span>}
              </span>
              <span className="person-eta">
                {r.tableLabel.replace(/^Table\s+/i, 'T')} ·{' '}
                {r.status === 'arrived'
                  ? r.arrivedAt
                    ? formatDuration(r.arrivedAt, now)
                    : 'here'
                  : etaLabel(r.eta)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
