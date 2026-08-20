import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { User } from '../lib/types';
import { SessionContext, type SessionValue, type SignUpInput } from './session';

/**
 * Who is signed in.
 *
 * There is no token in JavaScript to keep: the session is an HTTP-only cookie
 * the browser attaches by itself. This provider only caches the user object
 * so the UI does not refetch it on every screen, and asks the server who that
 * is when the app loads.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');

  const refresh = useCallback(async () => {
    try {
      const { user: current } = await api.me();
      setUser(current);
    } catch {
      // 401 (no session) and an unreachable API both mean "not signed in here".
      setUser(null);
    } finally {
      setStatus('ready');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { user: signedIn } = await api.login({ email, password });
    setUser(signedIn);
    return signedIn;
  }, []);

  const signUp = useCallback(async (input: SignUpInput) => {
    const { user: created } = await api.signup(input);
    setUser(created);
    return created;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      // Even if the request fails, stop showing signed-in UI.
      setUser(null);
    }
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ user, status, signIn, signUp, signOut, refresh }),
    [user, status, signIn, signUp, signOut, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
