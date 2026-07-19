import { useEffect, useRef, useState } from 'react';
import type { ChatState } from '../types';

export interface ChatActions {
  sendMessage(text: string): void;
  setChatNotify(enabled: boolean): void;
}

// A tiny support-widget-style chat pinned to the bottom-right corner:
// collapsed it is just a square button with an unread count (and a ✓ to
// clear it without opening — like Discord's "mark as read"), expanded it
// is a minimal message panel for the people in the room today.
export function RoomChat({
  chat,
  userId,
  code,
  canChat,
  notifyChat,
  actions,
}: {
  chat: ChatState;
  userId: number;
  code: string;
  canChat: boolean;
  notifyChat: boolean;
  actions: ChatActions;
}) {
  const { messages } = chat;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  // Unread tracking is local: the id of the newest message this browser saw.
  const [lastRead, setLastRead] = useState(() => Number(localStorage.getItem(`lsm-chat-read-${code}`) || 0));
  const listRef = useRef<HTMLDivElement>(null);

  const lastId = messages.length > 0 ? messages[messages.length - 1].id : 0;

  function markRead() {
    setLastRead(lastId);
    localStorage.setItem(`lsm-chat-read-${code}`, String(lastId));
  }

  useEffect(() => {
    if (!open) return;
    if (lastId > lastRead) {
      setLastRead(lastId);
      localStorage.setItem(`lsm-chat-read-${code}`, String(lastId));
    }
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, lastId, lastRead, code]);

  const unread = messages.filter((m) => m.id > lastRead && m.userId !== userId).length;

  function send() {
    const t = text.trim();
    if (!t) return;
    actions.sendMessage(t);
    setText('');
  }

  if (!open) {
    const last = messages[messages.length - 1];
    return (
      <>
        <button className="card chat-dock" onClick={() => setOpen(true)}>
          <span className="chat-dock-label">Room chat</span>
          <span className="chat-dock-preview">
            {last ? `${last.userId === userId ? 'You' : last.username}: ${last.body}` : 'Say hi to the room 👋'}
          </span>
          {unread > 0 && <span className="chat-dock-badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
        </button>
        {unread > 0 && (
          <button
            className="chat-mark-read"
            aria-label={`Mark ${unread} unread room ${unread === 1 ? 'message' : 'messages'} as read`}
            onClick={markRead}
          >
            ✓ Read
          </button>
        )}
      </>
    );
  }

  return (
    <div className="chat-panel">
      <div className="chat-head">
        <span className="chat-title">Room chat</span>
        <button
          className="icon-btn chat-icon"
          aria-label={notifyChat ? 'Mute room chat notifications' : 'Enable room chat notifications'}
          title={notifyChat ? 'Notifications on — tap to mute (same as in Settings)' : 'Notifications off — tap to unmute (same as in Settings)'}
          onClick={() => actions.setChatNotify(!notifyChat)}
        >
          {notifyChat ? '🔔' : '🔕'}
        </button>
        <button className="icon-btn chat-icon" aria-label="Close" onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>
      <div className="chat-msgs" ref={listRef}>
        {messages.length === 0 && <p className="hint chat-empty">Just the people in the room today — say hi 👋</p>}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`chat-msg${m.userId === userId ? ' mine' : ''}`}
            title={new Date(m.createdAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          >
            {m.userId !== userId && (
              <span className="chat-msg-name" style={{ color: m.color }}>
                {m.username}
              </span>
            )}
            {m.body}
          </div>
        ))}
      </div>
      <div className="chat-input-row">
        <input
          className="input"
          value={text}
          maxLength={500}
          placeholder={canChat ? 'Message the room…' : 'Grab a seat to chat'}
          disabled={!canChat}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn btn-primary btn-compact chat-send" aria-label="Send message" disabled={!canChat || !text.trim()} onClick={send}>
          ➤
        </button>
      </div>
    </div>
  );
}
