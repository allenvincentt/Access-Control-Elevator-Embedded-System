import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';

import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import {
  fetchProfile,
  signInWithPassword,
  signOutEverywhere,
  updateOwnDisplayName,
} from '@/services/authService';
import type { ProfileRow } from '@/types/database';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  profile: ProfileRow | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateDisplayName: (fullName: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const resolveProfile = useCallback(async (next: Session | null) => {
    if (!next?.user?.id) {
      if (mounted.current) {
        setSession(null);
        setProfile(null);
        setStatus('signedOut');
      }
      return;
    }

    try {
      const row = await fetchProfile(next.user.id);
      if (!mounted.current) return;

      if (!row.is_active) {
        await supabase.auth.signOut({ scope: 'local' });
        setSession(null);
        setProfile(null);
        setStatus('signedOut');
        return;
      }

      setSession(next);
      setProfile(row);
      setStatus('signedIn');
    } catch {
      if (!mounted.current) return;
      await supabase.auth.signOut({ scope: 'local' });
      setSession(null);
      setProfile(null);
      setStatus('signedOut');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) void resolveProfile(data.session ?? null);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        setSession(next ?? null);
        return;
      }
      setTimeout(() => {
        if (!cancelled) void resolveProfile(next ?? null);
      }, 0);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [resolveProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    setStatus('loading');
    try {
      const next = await signInWithPassword(email, password);
      await resolveProfile(next);
    } catch (error) {
      setStatus('signedOut');
      throw error;
    }
  }, [resolveProfile]);

  const signOut = useCallback(async () => {
    try {
      await signOutEverywhere();
    } finally {
      if (mounted.current) {
        setSession(null);
        setProfile(null);
        setStatus('signedOut');
      }
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      const row = await fetchProfile(session.user.id);
      if (mounted.current) setProfile(row);
    } catch {
      return;
    }
  }, [session]);

  const updateDisplayName = useCallback(
    async (fullName: string) => {
      if (!session?.user?.id) return;
      const row = await updateOwnDisplayName(session.user.id, fullName);
      if (mounted.current) setProfile(row);
    },
    [session],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      profile,
      isAuthenticated: status === 'signedIn' && profile != null,
      isAdmin: profile?.user_role === 'Admin',
      signIn,
      signOut,
      refreshProfile,
      updateDisplayName,
    }),
    [status, session, profile, signIn, signOut, refreshProfile, updateDisplayName],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return value;
}

export { errorMessage };
