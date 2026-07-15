import { useEffect, useState } from 'react';
import { api } from '../api';
import type { FacilityMenu, SpaceState, Vote, VoteOption } from '../types';
import { Sheet } from './Sheet';

interface VoteActions {
  castBallot(voteId: number, optionId: number | null): void;
  addOption(voteId: number, label: string): void;
  createVote(title: string, options: string[]): void;
  startLunchVote(): void;
  removeVote(voteId: number): void;
}

function leaderOf(vote: Vote): VoteOption | null {
  let leader: VoteOption | null = null;
  for (const option of vote.options) {
    if (option.voters.length === 0) continue;
    if (!leader || option.voters.length > leader.voters.length) leader = option;
  }
  return leader;
}

// The sidebar is deliberately only a status summary. Showing one leader per
// poll keeps decisions visible without turning the study room into a voting
// dashboard; choosing an option remains an intentional action in the sheet.
export function VotesBar({
  votes,
  onOpen,
}: {
  votes: Vote[];
  onOpen(): void;
}) {
  if (votes.length === 0) {
    return (
      <button className="card vote-card vote-summary-card vote-empty" onClick={onOpen}>
        + Start a vote
      </button>
    );
  }
  return (
    <>
      {votes.map((v) => {
        const total = v.options.reduce((n, o) => n + o.voters.length, 0);
        const leader = leaderOf(v);
        return (
          <button
            key={v.id}
            className="card vote-card vote-summary-card"
            onClick={onOpen}
            aria-label={`Open ${v.title}`}
          >
            <span className="card-head">
              <span className="card-label">{v.title}</span>
              <span className="vote-summary-meta">
                {total} {total === 1 ? 'vote' : 'votes'}
                <span className="vote-summary-arrow" aria-hidden="true">›</span>
              </span>
            </span>
            <span className={`vote-leader${leader ? '' : ' empty'}`}>
              <span className="vote-leader-result">
                <span className="vote-label">{leader?.label ?? 'No result yet'}</span>
                {leader && <span className="vote-count">{leader.voters.length}</span>}
              </span>
              <span className="vote-track" aria-hidden="true">
                <span
                  className="vote-fill"
                  style={{ width: leader && total ? `${(leader.voters.length / total) * 100}%` : '0%' }}
                />
              </span>
            </span>
          </button>
        );
      })}
    </>
  );
}

function MenuDetail({ menus, facilityId }: { menus: FacilityMenu[] | null; facilityId: number }) {
  // Photos stay hidden until you ask: tap a dish name (📷) to peek at one.
  const [shownPhoto, setShownPhoto] = useState<number | null>(null);
  if (!menus) return <p className="hint menu-detail">Loading today's menu…</p>;
  const menu = menus.find((m) => m.facilityId === facilityId);
  if (!menu || menu.meals.length === 0) {
    return (
      <p className="hint menu-detail">
        {menu?.status === 'closed'
          ? 'Closed today.'
          : 'No menu online yet — spots often add theirs during the morning.'}
      </p>
    );
  }
  return (
    <ul className="menu-detail">
      {menu.meals.map((meal, i) => (
        <li key={i}>
          <div className="menu-row">
            <span className="menu-line">{meal.line}</span>
            <span className="menu-meal">
              {meal.image ? (
                <button
                  type="button"
                  className="menu-name-btn"
                  title="Peek at the photo"
                  onClick={() => setShownPhoto(shownPhoto === i ? null : i)}
                >
                  {meal.name} <span className="menu-cam">📷</span>
                </button>
              ) : (
                meal.name
              )}
              {meal.description && <span className="menu-desc"> — {meal.description}</span>}
            </span>
            {meal.price !== null && <span className="menu-price">{meal.price.toFixed(2)}</span>}
          </div>
          {meal.image && shownPhoto === i && (
            <img className="menu-photo" src={meal.image} alt={meal.name} loading="lazy" />
          )}
        </li>
      ))}
    </ul>
  );
}

function VoteCard({
  vote,
  userId,
  canManage,
  menus,
  actions,
}: {
  vote: Vote;
  userId: number;
  canManage: boolean;
  menus: FacilityMenu[] | null;
  actions: VoteActions;
}) {
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [newOption, setNewOption] = useState('');
  const myOptionId = vote.options.find((o) => o.voters.some((v) => v.userId === userId))?.id ?? null;
  const totalBallots = vote.options.reduce((sum, o) => sum + o.voters.length, 0);
  // Everyone may suggest at most one extra lunch place per day; other polls
  // take as many options as people need.
  const canAddOption = vote.kind !== 'lunch' || !vote.options.some((o) => o.addedBy === userId);
  const canRemove = canManage || vote.createdBy === userId;

  return (
    <div className="sheet-section vote-card">
      <div className="vote-head">
        <p className="sheet-label">{vote.title}</p>
        <span className="vote-total">{totalBallots === 1 ? '1 vote' : `${totalBallots} votes`}</span>
        {canRemove && (
          <button className="occupant-btn danger" title="Remove this vote" onClick={() => actions.removeVote(vote.id)}>
            ✕
          </button>
        )}
      </div>
      {vote.options.map((o) => (
        <div key={o.id}>
          <div className={`vote-opt${o.id === myOptionId ? ' mine' : ''}`}>
            <button
              className="vote-opt-main"
              onClick={() => actions.castBallot(vote.id, o.id === myOptionId ? null : o.id)}
            >
              <span className="vote-opt-top">
                <span className="vote-check">{o.id === myOptionId ? '✅' : '⬜'}</span>
                <span className="vote-label">{o.label}</span>
                <span className="voter-dots">
                  {o.voters.map((v) => (
                    <span key={v.userId} className="person-dot" style={{ background: v.color }} title={v.username} />
                  ))}
                </span>
                <span className="vote-count">{o.voters.length > 0 ? o.voters.length : ''}</span>
              </span>
              <span className="vote-track">
                <span
                  className="vote-fill"
                  style={{ width: totalBallots > 0 ? `${(o.voters.length / totalBallots) * 100}%` : '0%' }}
                />
              </span>
            </button>
            {o.facilityId !== null &&
              (menus?.find((m) => m.facilityId === o.facilityId)?.status === 'closed' ? (
                // known closed today — nothing to expand, just say so
                <span className="occupant-btn menu-closed" title="Closed today">
                  🌙
                </span>
              ) : (
                <button
                  className="occupant-btn"
                  title="Today's menu"
                  onClick={() => setOpenMenu(openMenu === o.id ? null : o.id)}
                >
                  {openMenu === o.id ? '▴' : 'ℹ️'}
                </button>
              ))}
          </div>
          {openMenu === o.id && o.facilityId !== null && <MenuDetail menus={menus} facilityId={o.facilityId} />}
        </div>
      ))}
      {canAddOption && (
        <div className="vote-add-row">
          <input
            className="input"
            value={newOption}
            onChange={(e) => setNewOption(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newOption.trim()) {
                e.preventDefault();
                actions.addOption(vote.id, newOption.trim());
                setNewOption('');
              }
            }}
            placeholder={vote.kind === 'lunch' ? 'Suggest one more place (1 per person)' : 'Add an option'}
            maxLength={40}
          />
          <button
            className="btn btn-secondary btn-compact"
            disabled={!newOption.trim()}
            onClick={() => {
              actions.addOption(vote.id, newOption.trim());
              setNewOption('');
            }}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

export function VoteSheet({
  state,
  userId,
  canManage,
  onClose,
  actions,
}: {
  state: SpaceState;
  userId: number;
  canManage: boolean;
  onClose(): void;
  actions: VoteActions;
}) {
  const [menus, setMenus] = useState<FacilityMenu[] | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newOptions, setNewOptions] = useState<string[]>(['', '']);
  const needMenus = state.votes.some((v) => v.options.some((o) => o.facilityId !== null));
  const hasLunchVote = state.votes.some((v) => v.kind === 'lunch');
  const filledOptions = newOptions.map((o) => o.trim()).filter(Boolean);
  const canCreate = newTitle.trim().length > 0 && filledOptions.length >= 2;

  useEffect(() => {
    if (!needMenus) return;
    api<{ menus: FacilityMenu[] }>('/api/menus')
      .then((r) => setMenus(r.menus))
      .catch(() => setMenus([]));
  }, [needMenus]);

  function setOption(i: number, value: string) {
    setNewOptions((opts) => opts.map((o, j) => (j === i ? value : o)));
  }

  function create() {
    actions.createVote(newTitle.trim(), filledOptions);
    setNewTitle('');
    setNewOptions(['', '']);
  }

  return (
    <Sheet title="Votes" onClose={onClose}>
      <div className="stack">
          {!hasLunchVote && (
            <button className="btn btn-secondary" onClick={() => actions.startLunchVote()}>
              🍽️ Where to eat lunch today?
            </button>
          )}
          {state.votes.map((v) => (
            <VoteCard key={v.id} vote={v} userId={userId} canManage={canManage} menus={menus} actions={actions} />
          ))}
          <div className="sheet-section">
            <p className="sheet-label">Start a new vote</p>
            <input
              className="input"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="What are you deciding?"
              maxLength={40}
            />
            {newOptions.map((val, i) => (
              <input
                key={i}
                className="input"
                value={val}
                onChange={(e) => setOption(i, e.target.value)}
                placeholder={`Option ${i + 1}${i === 0 ? ' (e.g. Yes)' : i === 1 ? ' (e.g. No)' : ''}`}
                maxLength={40}
              />
            ))}
            <div className="vote-add-row">
              <button
                className="btn btn-secondary btn-compact"
                disabled={newOptions.length >= 12}
                onClick={() => setNewOptions((opts) => [...opts, ''])}
              >
                ➕ Option
              </button>
              <button className="btn btn-primary btn-compact vote-create-btn" disabled={!canCreate} onClick={create}>
                Start vote
              </button>
            </div>
          </div>
        </div>
      </Sheet>
  );
}
