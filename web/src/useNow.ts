import { useEffect, useState } from 'react';

// Re-renders once a minute so "here for 1h 05m" style durations stay live.
export function useNowMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}
