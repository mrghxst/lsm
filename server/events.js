// SSE hub: keeps one subscriber set per space and pushes full space
// state to everyone in it whenever something changes.
const subscribers = new Map(); // spaceId -> Set<res>

export function subscribe(spaceId, res) {
  let set = subscribers.get(spaceId);
  if (!set) {
    set = new Set();
    subscribers.set(spaceId, set);
  }
  set.add(res);
  return () => {
    set.delete(res);
    if (set.size === 0) subscribers.delete(spaceId);
  };
}

export function broadcast(spaceId, payload) {
  const set = subscribers.get(spaceId);
  if (!set) return;
  const frame = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) res.write(frame);
}

// Keep connections alive through proxies that time out idle streams.
setInterval(() => {
  for (const set of subscribers.values()) {
    for (const res of set) res.write(': ping\n\n');
  }
}, 25_000).unref();
