import { createContext, useContext } from 'react';
import type { Role, User } from '../lib/types';

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
  role: Role;
}

export interface SessionValue {
  /** null when signed out; undefined is never exposed — check `status` first. */
  user: User | null;
  /** 'loading' until the first /api/auth/me answers, so guards don't flash. */
  status: 'loading' | 'ready';
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (input: SignUpInput) => Promise<User>;
  signOut: () => Promise<void>;
  /** Re-reads the current user, e.g. after something changes server-side. */
  refresh: () => Promise<void>;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
