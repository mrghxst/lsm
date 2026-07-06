import { useState } from 'react';
import type { SpaceState, Table } from '../types';
import { etaLabel } from '../util';
import { EtaPicker } from './EtaPicker';

interface Actions {
  join(tableId: number, eta: string): void;
  updateEta(eta: string): void;
  markArrived(): void;
  leave(): void;
  setReleased(tableId: number, released: boolean): void;
}

export function ClaimSheet({
  state,
  table,
  userId,
  onClose,
  actions,
}: {
  state: SpaceState;
  table: Table;
  userId: number;
  onClose(): void;
  actions: Actions;
}) {
  const { space } = state;
  const myClaimHere = table.claims.find((c) => c.userId === userId);
  const myOtherTable = state.tables.find((t) => t.id !== table.id && t.claims.some((c) => c.userId === userId));
  const isOwner = space.ownerId === userId;
  const isFull = table.claims.length >= space.seatsPerTable;
  const [eta, setEta] = useState<string>(myClaimHere && myClaimHere.eta !== 'now' ? myClaimHere.eta : 'now');
  const [editingTime, setEditingTime] = useState(false);

  let body;
  if (myClaimHere) {
    body = (
      <>
        <p className="sheet-status">
          {myClaimHere.status === 'arrived'
            ? "You're at this table. 🎉"
            : `You're coming ${myClaimHere.eta === 'now' ? 'right now' : `at ${myClaimHere.eta}`}.`}
        </p>
        {myClaimHere.status === 'coming' && (
          <button className="btn btn-primary" onClick={actions.markArrived}>
            ✅ I've arrived
          </button>
        )}
        {myClaimHere.status === 'coming' &&
          (editingTime ? (
            <>
              <EtaPicker value={eta} onChange={setEta} />
              <button className="btn btn-secondary" onClick={() => actions.updateEta(eta)}>
                Save new time
              </button>
            </>
          ) : (
            <button className="btn btn-secondary" onClick={() => setEditingTime(true)}>
              🕐 Change arrival time
            </button>
          ))}
        <button className="btn btn-danger" onClick={actions.leave}>
          Leave table
        </button>
      </>
    );
  } else if (table.released) {
    body = (
      <>
        <p className="sheet-status">This table was given back{isOwner ? '.' : ' — pick another one.'}</p>
        {isOwner && (
          <button className="btn btn-secondary" onClick={() => actions.setReleased(table.id, false)}>
            Reserve it again
          </button>
        )}
      </>
    );
  } else if (isFull) {
    body = <p className="sheet-status">This table is full — pick another one.</p>;
  } else {
    body = (
      <>
        <p className="sheet-label">When will you arrive?</p>
        <EtaPicker value={eta} onChange={setEta} />
        {myOtherTable && <p className="hint">You'll move here from {myOtherTable.label}.</p>}
        <button className="btn btn-primary" onClick={() => actions.join(table.id, eta)}>
          {eta === 'now' ? "🪑 I'm here now" : `🪑 I'll be there ${etaLabel(eta)}`}
        </button>
      </>
    );
  }

  const canGiveBack = isOwner && !myClaimHere && !table.released && table.claims.length === 0;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>Table {table.label.replace(/^T/, '')}</h2>
          <span className="table-count">
            {table.claims.length}/{space.seatsPerTable} seats
          </span>
        </div>
        <div className="stack">
          {body}
          {canGiveBack && (
            <button className="btn btn-secondary" onClick={() => actions.setReleased(table.id, true)}>
              Give this table back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
