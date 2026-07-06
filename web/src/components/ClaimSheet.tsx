import { useState } from 'react';
import type { SpaceState, Table } from '../types';
import { etaLabel } from '../util';
import { EtaPicker } from './EtaPicker';
import { Stepper } from './Stepper';

interface Actions {
  join(tableId: number, eta: string): void;
  addGuest(tableId: number, name: string, eta: string): void;
  updateClaim(claimId: number, body: { eta?: string; status?: string }, close?: boolean): void;
  removeClaim(claimId: number): void;
  setReleased(tableId: number, released: boolean): void;
  setCapacity(tableId: number, capacity: number): void;
  rotate(tableId: number): void;
  removeTable(tableId: number): void;
}

export function ClaimSheet({
  state,
  table,
  userId,
  canManageClaims,
  onClose,
  actions,
}: {
  state: SpaceState;
  table: Table;
  userId: number;
  canManageClaims: boolean;
  onClose(): void;
  actions: Actions;
}) {
  const myClaimHere = table.claims.find((c) => c.userId === userId && !c.guestName);
  const myOtherTable = state.tables.find(
    (t) => t.id !== table.id && t.claims.some((c) => c.userId === userId && !c.guestName),
  );
  const isFull = table.claims.length >= table.capacity;
  const [eta, setEta] = useState<string>(myClaimHere && myClaimHere.eta !== 'now' ? myClaimHere.eta : 'now');
  const [editingTime, setEditingTime] = useState(false);
  const [guestMode, setGuestMode] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestEta, setGuestEta] = useState('now');

  const manageableOthers = table.claims.filter(
    (c) => c !== myClaimHere && (c.userId === userId || canManageClaims),
  );

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
          <button className="btn btn-primary" onClick={() => actions.updateClaim(myClaimHere.id, { status: 'arrived' })}>
            ✅ I've arrived
          </button>
        )}
        {myClaimHere.status === 'coming' &&
          (editingTime ? (
            <>
              <EtaPicker value={eta} onChange={setEta} />
              <button className="btn btn-secondary" onClick={() => actions.updateClaim(myClaimHere.id, { eta })}>
                Save new time
              </button>
            </>
          ) : (
            <button className="btn btn-secondary" onClick={() => setEditingTime(true)}>
              🕐 Change arrival time
            </button>
          ))}
        <button className="btn btn-danger" onClick={() => actions.removeClaim(myClaimHere.id)}>
          Leave table
        </button>
      </>
    );
  } else if (table.released) {
    body = <p className="sheet-status">This table was given back.</p>;
  } else if (isFull) {
    body = <p className="sheet-status">This table is full — pick another one.</p>;
  } else if (!guestMode) {
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

  const showGuestButton = !table.released && !isFull;
  const guestForm = guestMode && showGuestButton && (
    <div className="stack guest-form">
      <p className="sheet-label">Reserve a seat for a friend</p>
      <input
        className="input"
        value={guestName}
        onChange={(e) => setGuestName(e.target.value)}
        placeholder="Friend's name"
        maxLength={20}
      />
      <EtaPicker value={guestEta} onChange={setGuestEta} />
      <button
        className="btn btn-primary"
        disabled={!guestName.trim()}
        onClick={() => actions.addGuest(table.id, guestName.trim(), guestEta)}
      >
        Reserve for {guestName.trim() || 'them'}
      </button>
      <button className="link-btn" onClick={() => setGuestMode(false)}>
        Back
      </button>
    </div>
  );

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
          {!guestMode && body}
          {guestForm}
          {!guestMode && showGuestButton && (
            <button className="btn btn-secondary" onClick={() => setGuestMode(true)}>
              👋 Reserve a seat for a friend
            </button>
          )}

          {manageableOthers.length > 0 && (
            <div className="sheet-section">
              <p className="sheet-label">Seats you can manage</p>
              {manageableOthers.map((c) => (
                <div key={c.id} className="occupant-row">
                  <span className="person-dot" style={{ background: c.color }} />
                  <span className="occupant-name">
                    {c.guestName ?? c.username}
                    {c.guestName && <span className="occupant-sub"> · friend of {c.username}</span>}
                  </span>
                  <span className="occupant-eta">{c.status === 'arrived' ? 'here' : etaLabel(c.eta)}</span>
                  {c.status === 'coming' && (
                    <button
                      className="occupant-btn"
                      title="Mark as arrived"
                      onClick={() => actions.updateClaim(c.id, { status: 'arrived' }, false)}
                    >
                      ✓
                    </button>
                  )}
                  <button className="occupant-btn danger" title="Remove" onClick={() => actions.removeClaim(c.id)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="sheet-section">
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
            {table.claims.length === 0 && (
              <button className="btn btn-danger" onClick={() => actions.removeTable(table.id)}>
                Remove this table
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
