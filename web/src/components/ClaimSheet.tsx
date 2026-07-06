import { useState } from 'react';
import type { SpaceState, Table } from '../types';
import { etaLabel } from '../util';
import { EtaPicker } from './EtaPicker';
import { Stepper } from './Stepper';

interface Actions {
  join(tableId: number, eta: string): void;
  updateEta(eta: string): void;
  markArrived(): void;
  leave(): void;
  setReleased(tableId: number, released: boolean): void;
  setCapacity(tableId: number, capacity: number): void;
  rotate(tableId: number): void;
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
  const isFull = table.claims.length >= table.capacity;
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
    body = <p className="sheet-status">This table was given back{isOwner ? '.' : ' — pick another one.'}</p>;
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

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>Table {table.label.replace(/^T/, '')}</h2>
          <span className="table-count">
            {table.released ? 'given back' : `${table.claims.length}/${table.capacity} seats`}
          </span>
        </div>
        <div className="stack">
          {body}
          {isOwner && (
            <div className="sheet-owner">
              <p className="sheet-label">Table settings</p>
              {!table.released && (
                <Stepper
                  small
                  label="Seats"
                  value={table.capacity}
                  min={Math.max(1, table.claims.length)}
                  max={8}
                  onChange={(v) => actions.setCapacity(table.id, v)}
                />
              )}
              <div className="sheet-owner-row">
                {!table.released && (
                  <button className="btn btn-secondary" onClick={() => actions.rotate(table.id)}>
                    ⟳ Rotate
                  </button>
                )}
                {table.released ? (
                  <button className="btn btn-secondary" onClick={() => actions.setReleased(table.id, false)}>
                    Reserve it again
                  </button>
                ) : (
                  table.claims.length === 0 && (
                    <button className="btn btn-secondary" onClick={() => actions.setReleased(table.id, true)}>
                      Give back
                    </button>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
