import type { Claim, Table } from '../types';
import { etaLabel } from '../util';

function Seat({ claim, mine }: { claim: Claim | null; mine: boolean }) {
  if (!claim) return <span className="seat empty" />;
  return <span className={`seat ${claim.status}${mine ? ' me' : ''}`}>{claim.username.slice(0, 2)}</span>;
}

export function TableCard({
  table,
  seatsPerTable,
  currentUserId,
  onClick,
}: {
  table: Table;
  seatsPerTable: number;
  currentUserId: number;
  onClick(): void;
}) {
  const mine = table.claims.some((c) => c.userId === currentUserId);
  const seats = Array.from({ length: seatsPerTable }, (_, i) => table.claims[i] ?? null);
  const topCount = Math.ceil(seatsPerTable / 2);

  return (
    <button className={`table-card${mine ? ' mine' : ''}${table.released ? ' released' : ''}`} onClick={onClick}>
      <div className="table-head">
        <span className="table-label">{table.label}</span>
        {table.released ? (
          <span className="badge">given back</span>
        ) : (
          <span className="table-count">
            {table.claims.length}/{seatsPerTable}
          </span>
        )}
      </div>
      <div className="table-visual">
        <div className="seat-row">
          {seats.slice(0, topCount).map((c, i) => (
            <Seat key={i} claim={c} mine={c?.userId === currentUserId} />
          ))}
        </div>
        <div className="table-surface" />
        {seatsPerTable > 1 && (
          <div className="seat-row">
            {seats.slice(topCount).map((c, i) => (
              <Seat key={i} claim={c} mine={c?.userId === currentUserId} />
            ))}
          </div>
        )}
      </div>
      {table.claims.length > 0 && (
        <ul className="claim-list">
          {table.claims.map((c) => (
            <li key={c.userId}>
              <span className={`dot ${c.status}`} />
              <span className="claim-name">{c.username}</span>
              <span className="claim-eta">{c.status === 'arrived' ? 'here' : etaLabel(c.eta)}</span>
            </li>
          ))}
        </ul>
      )}
    </button>
  );
}
