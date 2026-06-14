import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isLocalDemoMode, supabase } from './client';
import { LOCAL_USER_ID } from '../local/localDatabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!isLocalDemoMode);
  const localUser = useMemo(() => ({
    id: LOCAL_USER_ID,
    email: 'owner@local.demo',
    aud: 'authenticated',
    role: 'authenticated',
    created_at: new Date(0).toISOString(),
    app_metadata: {},
    user_metadata: {}
  } as User), []);

  useEffect(() => {
    if (isLocalDemoMode) return undefined;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: isLocalDemoMode ? localUser : session?.user ?? null,
    loading
  }), [localUser, session, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
