import { useState } from 'react';
import type { SpaceState, Table } from '../types';
import { claimColor, etaLabel, formatClock, formatDuration } from '../util';
import { useNowMinute } from '../useNow';
import { EtaPicker } from './EtaPicker';
import { Sheet } from './Sheet';
import { Stepper } from './Stepper';

interface Actions {
  join(tableId: number, eta: string, seat?: number, forUserId?: number): void;
  addGuest(tableId: number, name: string, eta: string, seat?: number, hostUserId?: number): void;
  updateClaim(claimId: number, body: { eta?: string; status?: string }, close?: boolean): void;
  removeClaim(claimId: number, reason?: string): void;
  setReleased(tableId: number, released: boolean): void;
  setStolen(tableId: number, stolen: boolean): void;
  setCapacity(tableId: number, capacity: number): void;
  rotate(tableId: number): void;
  removeTable(tableId: number): void;
}

export function ClaimSheet({
  state,
  table,
  seat,
  userId,
  isAdmin,
  canManageClaims,
  onClose,
  actions,
}: {
  state: SpaceState;
  table: Table;
  seat: number;
  userId: number;
  isAdmin: boolean;
  canManageClaims: boolean;
  onClose(): void;
  actions: Actions;
}) {
  const now = useNowMinute();
  const myClaimHere = table.claims.find((c) => c.userId === userId && !c.guestName);
  const myOtherTable = state.tables.find(
    (t) => t.id !== table.id && t.claims.some((c) => c.userId === userId && !c.guestName),
  );
  const isFull = table.claims.length >= table.capacity;
  const seatFree = !table.claims.some((c) => c.seat === seat);
  const seatText = table.capacity > 1 && seatFree ? `Seat ${seat + 1} · ` : '';
  const [eta, setEta] = useState<string>(myClaimHere && myClaimHere.eta !== 'now' ? myClaimHere.eta : 'now');
  const [editingTime, setEditingTime] = useState(false);
  const [guestMode, setGuestMode] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestEta, setGuestEta] = useState('now');
  const [bookMode, setBookMode] = useState(false);
  const [bookUserId, setBookUserId] = useState<number | null>(null);
  const [bookGuest, setBookGuest] = useState('');
  const [bookEta, setBookEta] = useState('now');
  const [leaveMode, setLeaveMode] = useState(false);
  const [leaveReason, setLeaveReason] = useState('');

  const others = [...table.claims].filter((c) => c !== myClaimHere).sort((a, b) => a.seat - b.seat);

  let body;
  if (myClaimHere) {
    body = (
      <>
        <p className="sheet-status">
          {myClaimHere.status === 'arrived'
            ? myClaimHere.arrivedAt
              ? `You're at this table since ${formatClock(myClaimHere.arrivedAt)} (${formatDuration(myClaimHere.arrivedAt, now)}).`
              : "You're at this table."
            : `You're coming ${myClaimHere.eta === 'now' ? 'right now' : `at ${myClaimHere.eta}`}.`}
        </p>
        {myClaimHere.status === 'coming' && (
          <button className="btn btn-primary" onClick={() => actions.updateClaim(myClaimHere.id, { status: 'arrived' })}>
            I've arrived
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
              Change arrival time
            </button>
          ))}
        {leaveMode ? (
          <>
            <input
              className="input"
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
              placeholder="Tell the others why? (optional)"
              maxLength={100}
            />
            <button
              className="btn btn-danger"
              onClick={() => actions.removeClaim(myClaimHere.id, leaveReason.trim() || undefined)}
            >
              Leave table
            </button>
            <button className="link-btn" onClick={() => setLeaveMode(false)}>
              Stay
            </button>
          </>
        ) : (
          <button className="btn btn-danger" onClick={() => setLeaveMode(true)}>
            Leave table
          </button>
        )}
      </>
    );
  } else if (table.stolen) {
    body = <p className="sheet-status">This table was taken by someone outside the group.</p>;
  } else if (table.released) {
    body = <p className="sheet-status">This table was given back.</p>;
  } else if (isFull) {
    body = <p className="sheet-status">This table is full — here's who has the seats:</p>;
  } else if (!guestMode) {
    body = (
      <>
        <p className="sheet-label">{seatText}When will you arrive?</p>
        <EtaPicker value={eta} onChange={setEta} />
        {myOtherTable && <p className="hint">You'll move here from {myOtherTable.label}.</p>}
        <button className="btn btn-primary" onClick={() => actions.join(table.id, eta, seat)}>
          {eta === 'now' ? "I'm here now" : `I'll be there ${etaLabel(eta)}`}
        </button>
      </>
    );
  }

  const showGuestButton = !table.released && !isFull;

  // Admins can put the seat in another member's name — either the member
  // themselves (their name, their color) or a guest of theirs.
  const otherMembers = state.members.filter((m) => m.userId !== userId);
  const bookTarget = otherMembers.find((m) => m.userId === bookUserId) ?? null;
  function submitBooking() {
    if (!bookTarget) return;
    if (bookGuest.trim()) actions.addGuest(table.id, bookGuest.trim(), bookEta, seat, bookTarget.userId);
    else actions.join(table.id, bookEta, seat, bookTarget.userId);
  }
  const bookForm = bookMode && showGuestButton && (
    <div className="stack guest-form">
      <p className="sheet-label">{seatText}Book for someone else</p>
      <select
        className="input"
        value={bookUserId ?? ''}
        onChange={(e) => setBookUserId(e.target.value ? Number(e.target.value) : null)}
        autoFocus
      >
        <option value="">Who is it for?</option>
        {otherMembers.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.username}
          </option>
        ))}
      </select>
      <input
        className="input"
        value={bookGuest}
        onChange={(e) => setBookGuest(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && bookTarget) {
            e.preventDefault();
            submitBooking();
          }
        }}
        placeholder="Or a guest of theirs (optional)"
        maxLength={20}
      />
      <EtaPicker value={bookEta} onChange={setBookEta} />
      <button className="btn btn-primary" disabled={!bookTarget} onClick={submitBooking}>
        {!bookTarget
          ? 'Pick a person first'
          : bookGuest.trim()
            ? `Reserve for ${bookGuest.trim()} (friend of ${bookTarget.username})`
            : `Book ${bookTarget.username} in`}
      </button>
      <button className="link-btn" onClick={() => setBookMode(false)}>
        Back
      </button>
    </div>
  );

  const guestForm = guestMode && showGuestButton && (
    <div className="stack guest-form">
      <p className="sheet-label">{seatText}Reserve for a friend</p>
      <input
        className="input"
        value={guestName}
        onChange={(e) => setGuestName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && guestName.trim()) {
            e.preventDefault();
            actions.addGuest(table.id, guestName.trim(), guestEta, seat);
          }
        }}
        placeholder="Friend's name"
        maxLength={20}
        autoFocus
      />
      <EtaPicker value={guestEta} onChange={setGuestEta} />
      <button
        className="btn btn-primary"
        disabled={!guestName.trim()}
        onClick={() => actions.addGuest(table.id, guestName.trim(), guestEta, seat)}
      >
        {guestEta === 'now'
          ? `${guestName.trim() || 'Your friend'} is here — add them`
          : `Reserve for ${guestName.trim() || 'them'}`}
      </button>
      <button className="link-btn" onClick={() => setGuestMode(false)}>
        Back
      </button>
    </div>
  );

  return (
    <Sheet
      title={`Table ${table.label.replace(/^T/, '')}`}
      meta={
        <span className="table-count">
          {table.stolen ? 'taken by others' : table.released ? 'given back' : `${table.claims.length}/${table.capacity} seats`}
        </span>
      }
      onClose={onClose}
    >
      <div className="stack">
          {!guestMode && !bookMode && body}
          {guestForm}
          {bookForm}
          {!guestMode && !bookMode && showGuestButton && (
            <>
              <button className="btn btn-secondary" onClick={() => setGuestMode(true)}>
                Reserve a seat for a friend
              </button>
              {isAdmin && otherMembers.length > 0 && (
                <button className="btn btn-secondary" onClick={() => setBookMode(true)}>
                  Book for someone else
                </button>
              )}
            </>
          )}

          {others.length > 0 && (
            <div className="sheet-section">
              <p className="sheet-label">At this table</p>
              {others.map((c) => {
                const canManage = c.userId === userId || canManageClaims;
                return (
                  <div key={c.id} className="occupant-row">
                    {table.capacity > 1 && <span className="occupant-seat">#{c.seat + 1}</span>}
                    <span className="person-dot" style={{ background: claimColor(c) }} />
                    <span className="occupant-name">
                      {c.guestName ?? c.username}
                      {c.guestName && <span className="occupant-sub"> · friend of {c.username}</span>}
                    </span>
                    <span className="occupant-eta">
                      {c.status === 'arrived'
                        ? c.arrivedAt
                          ? `here · ${formatDuration(c.arrivedAt, now)}`
                          : 'here'
                        : etaLabel(c.eta)}
                    </span>
                    {canManage && c.status === 'coming' && (
                      <button
                        className="occupant-btn"
                        title="Mark as arrived"
                        onClick={() => actions.updateClaim(c.id, { status: 'arrived' }, false)}
                      >
                        ✓
                      </button>
                    )}
                    {canManage && (
                      <button className="occupant-btn danger" title="Remove" onClick={() => actions.removeClaim(c.id)}>
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
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
              {table.claims.length === 0 && !table.stolen && (
                <button className="btn btn-secondary" onClick={() => actions.setStolen(table.id, true)}>
                  Taken by others
                </button>
              )}
            </div>
            {table.claims.length === 0 && (
              <button className="btn btn-danger" onClick={() => actions.removeTable(table.id)}>
                Remove this table
              </button>
            )}
          </div>
        </div>
      </Sheet>
  );
}
