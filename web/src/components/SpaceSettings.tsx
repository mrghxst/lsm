import { useEffect, useState } from 'react';
import type { NotificationPreferences, SpaceMembership, SpaceState, User } from '../types';
import { Sheet } from './Sheet';

interface SettingsActions {
  updateMembership(patch: { archived?: boolean; notifications?: Partial<NotificationPreferences> }): Promise<void>;
  updateSpace(patch: { name?: string; ownerId?: number }): Promise<void>;
  leaveSpace(): Promise<void>;
  deleteSpace(): Promise<void>;
}

const notificationRows: Array<{ key: keyof NotificationPreferences; label: string; hint: string }> = [
  { key: 'setup', label: 'Daily setup', hint: 'Session started, ended, and tomorrow reminders' },
  { key: 'activity', label: 'Room activity', hint: 'People joining, arriving, or leaving' },
  { key: 'votes', label: 'Votes', hint: 'Lunch and poll reminders' },
  { key: 'timers', label: 'Focus timers', hint: 'Round invitations and break alerts' },
  { key: 'chat', label: 'Room chat', hint: 'New messages from people in the room' },
];

export function SpaceSettings({
  state,
  membership,
  user,
  onClose,
  actions,
}: {
  state: SpaceState;
  membership: SpaceMembership;
  user: User;
  onClose(): void;
  actions: SettingsActions;
}) {
  const [name, setName] = useState(state.space.name);
  const [ownerId, setOwnerId] = useState(state.space.ownerId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManage = state.space.ownerId === user.id || user.isAdmin;

  useEffect(() => {
    setName(state.space.name);
    setOwnerId(state.space.ownerId);
  }, [state.space.name, state.space.ownerId]);

  async function run(key: string, task: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that change.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet title="Space settings" className="settings-sheet" onClose={onClose}>
      <div className="stack">
          <div className="sheet-section stack">
            <p className="sheet-label">Notifications for this space</p>
            {notificationRows.map((row) => (
              <label key={row.key} className="preference-row">
                <span>
                  <span className="preference-name">{row.label}</span>
                  <span className="preference-hint">{row.hint}</span>
                </span>
                <input
                  type="checkbox"
                  checked={membership.notifications[row.key]}
                  disabled={busy !== null}
                  onChange={() => void run(`notify-${row.key}`, () =>
                    actions.updateMembership({ notifications: { [row.key]: !membership.notifications[row.key] } }))}
                />
              </label>
            ))}
          </div>

          <div className="sheet-section stack">
            <p className="sheet-label">Your membership</p>
            <button
              className="btn btn-secondary"
              disabled={busy !== null}
              onClick={() => void run('archive', () => actions.updateMembership({ archived: !membership.archived }))}
            >
              {membership.archived ? 'Restore to home screen' : 'Archive from home screen'}
            </button>
            {state.space.ownerId === user.id ? (
              <p className="hint">Transfer ownership before leaving this space.</p>
            ) : (
              <button
                className="btn btn-danger"
                disabled={busy !== null}
                onClick={() => {
                  if (window.confirm(`Leave "${state.space.name}"? You can rejoin later with its code.`)) {
                    void run('leave', actions.leaveSpace);
                  }
                }}
              >
                Leave this space
              </button>
            )}
          </div>

          {canManage && (
            <div className="sheet-section stack">
              <p className="sheet-label">Manage space</p>
              <label className="field">
                <span>Name</span>
                <input className="input" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
              </label>
              <button
                className="btn btn-secondary"
                disabled={busy !== null || !name.trim() || name.trim() === state.space.name}
                onClick={() => void run('rename', () => actions.updateSpace({ name: name.trim() }))}
              >
                Save name
              </button>

              <label className="field">
                <span>Owner</span>
                <select className="input" value={ownerId} onChange={(event) => setOwnerId(Number(event.target.value))}>
                  {state.members.map((member) => (
                    <option key={member.userId} value={member.userId}>{member.username}</option>
                  ))}
                </select>
              </label>
              <button
                className="btn btn-secondary"
                disabled={busy !== null || ownerId === state.space.ownerId}
                onClick={() => {
                  const target = state.members.find((member) => member.userId === ownerId);
                  if (target && window.confirm(`Transfer ownership to ${target.username}?`)) {
                    void run('owner', () => actions.updateSpace({ ownerId }));
                  }
                }}
              >
                Transfer ownership
              </button>

              <button
                className="btn btn-danger"
                disabled={busy !== null}
                onClick={() => {
                  if (window.confirm(`Delete "${state.space.name}" forever? The code stops working for everyone.`)) {
                    void run('delete', actions.deleteSpace);
                  }
                }}
              >
                Delete this space forever
              </button>
            </div>
          )}

          {error && <p className="error">{error}</p>}
        </div>
      </Sheet>
  );
}
