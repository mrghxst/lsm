import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from './api';
import { disablePush, pushSupported, syncPushSubscription } from './push';
import type { User } from './types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn(username: string, pin: string, color?: string, inviteCode?: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: User }>('/api/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (username: string, pin: string, color?: string, inviteCode?: string) => {
    const r = await api<{ user: User }>('/api/auth/session', {
      method: 'POST',
      body: { username, pin, color, inviteCode },
    });
    setUser(r.user);
    // Notification setup must not turn a successful sign-in into a failure.
    await syncPushSubscription().catch(() => {});
  }, []);

  const signOut = useCallback(async () => {
    // Remove the current browser endpoint while its authenticated session can
    // still identify the correct owner. Other devices remain subscribed.
    if (pushSupported()) await disablePush().catch(() => {});
    await api('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
