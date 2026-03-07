/* ── Auth context – wraps Supabase session + profile ── */

import {
  createContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import type { Profile } from '../lib/database.types';

/* ── Types ── */

interface AuthState {
  /** Supabase session (null = logged out) */
  session: Session | null;
  /** Shortcut for session.user */
  user: User | null;
  /** Profile row from `profiles` table */
  profile: Profile | null;
  /** True while we check the initial session */
  loading: boolean;
  /** True when user chose to play without account */
  isGuest: boolean;
  /** Sign in with Google OAuth */
  signInWithGoogle: () => Promise<void>;
  /** Sign in with Discord OAuth */
  signInWithDiscord: () => Promise<void>;
  /** Send a magic link to the user's email */
  signInWithEmail: (email: string) => Promise<string | null>;
  /** Sign out */
  signOut: () => Promise<void>;
  /** Enter guest mode (local only) */
  enterGuestMode: () => void;
  /** Exit guest mode and return to login */
  exitGuestMode: () => void;
  /** Refresh profile from DB */
  refreshProfile: () => Promise<void>;
  /** Update profile fields (username etc.) */
  updateProfile: (fields: Partial<Pick<Profile, 'username' | 'skin' | 'avatar_url'>>) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const GUEST_MODE_KEY = 'pusselpaus:guest-mode';

/* ── Provider ── */

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState<boolean>(() => localStorage.getItem(GUEST_MODE_KEY) === '1');

  const clearAuthTokens = useCallback(() => {
    const clearMatching = (storage: Storage) => {
      const keys = Object.keys(storage);
      for (const key of keys) {
        if (
          key === 'supabase.auth.token'
          || (key.startsWith('sb-') && key.endsWith('-auth-token'))
        ) {
          storage.removeItem(key);
        }
      }
    };

    clearMatching(localStorage);
    clearMatching(sessionStorage);
  }, []);

  const getDefaultUsername = useCallback((user: User) => {
    const metadata = user.user_metadata as Record<string, unknown> | undefined;
    const fullName = typeof metadata?.full_name === 'string' ? metadata.full_name.trim() : '';
    const name = typeof metadata?.name === 'string' ? metadata.name.trim() : '';
    const preferredUsername = typeof metadata?.preferred_username === 'string'
      ? metadata.preferred_username.trim()
      : '';
    const emailName = user.email?.split('@')[0]?.trim() ?? '';

    return fullName || name || preferredUsername || emailName || 'Spelare';
  }, []);

  /* ── Fetch or create profile ── */
  const fetchProfile = useCallback(async (userId: string, fallbackUsername?: string) => {
    const safeUsername = fallbackUsername?.trim() || 'Spelare';

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .returns<Profile[]>()
      .single();

    if (!error && data) {
      const isDefaultUsername = data.username.trim().toLowerCase() === 'spelare';
      if (isDefaultUsername && safeUsername !== 'Spelare') {
        const { data: renamed, error: renameError } = await supabase
          .from('profiles')
          .update({ username: safeUsername })
          .eq('id', userId)
          .select('*')
          .returns<Profile[]>()
          .single();

        if (!renameError && renamed) {
          setProfile(renamed);
          return;
        }
      }

      setProfile(data);
      return;
    }

    const { data: upserted, error: upsertError } = await supabase
      .from('profiles')
      .upsert({ id: userId, username: safeUsername }, { onConflict: 'id' })
      .select('*')
      .returns<Profile[]>()
      .single();

    if (upsertError) {
      console.error('[Auth] Could not fetch/upsert profile:', upsertError);
      setProfile(null);
      return;
    }

    setProfile(upserted ?? null);
  }, []);

  /* ── Mark online / offline ── */
  const setOnlineStatus = useCallback(async (userId: string, online: boolean) => {
    await supabase
      .from('profiles')
      .update({ is_online: online, last_seen: new Date().toISOString() })
      .eq('id', userId);
  }, []);

  /* ── Listen for auth changes ── */
  useEffect(() => {
    let mounted = true;
    const loadingWatchdog = window.setTimeout(() => {
      if (mounted) {
        setLoading(false);
      }
    }, 1200);

    const applySession = async (s: Session | null) => {
      if (!mounted) return;
      setSession(s);

      if (s?.user) {
        setIsGuest(false);
        localStorage.removeItem(GUEST_MODE_KEY);
        try {
          const fallbackUsername = getDefaultUsername(s.user);
          await fetchProfile(s.user.id, fallbackUsername);
          await setOnlineStatus(s.user.id, true);
        } catch (err) {
          console.error('[Auth] profile/online error:', err);
        }
      } else {
        setProfile(null);
      }

      if (mounted) setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      void applySession(s);
    });

    (async () => {
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        await applySession(s);
      } catch (err) {
        console.error('[Auth] getSession failed:', err);
      } finally {
        if (mounted) {
          window.clearTimeout(loadingWatchdog);
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
      window.clearTimeout(loadingWatchdog);
      subscription.unsubscribe();
    };
  }, [fetchProfile, setOnlineStatus, getDefaultUsername]);

  /* ── Mark offline on window close ── */
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    const handleBeforeUnload = () => {
      // Use fetch keepalive for auth headers (sendBeacon can't set Authorization)
      fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${session?.access_token ?? ''}`,
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ is_online: false, last_seen: new Date().toISOString() }),
          keepalive: true,
        },
      );
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [session?.user?.id, session?.access_token]);

  /* ── Actions ── */
  const signInWithGoogle = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }, []);

  const signInWithDiscord = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: window.location.origin },
    });
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    return error ? (error.message || 'Kunde inte skicka magic link') : null;
  }, []);

  const signOut = useCallback(async () => {
    const userId = session?.user?.id;

    // Optimistic local logout for instant UX
    setSession(null);
    setProfile(null);
    setLoading(false);
    clearAuthTokens();

    if (userId) {
      setOnlineStatus(userId, false).catch((err) => {
        console.error('[Auth] setOnlineStatus(false) failed during signOut:', err);
      });
    }

    try {
      // Always clear local session/cache first so refresh cannot auto-login.
      await supabase.auth.signOut({ scope: 'local' });

      // Optional best-effort server revoke (non-blocking UX)
      void supabase.auth.signOut({ scope: 'global' }).catch((err) => {
        console.error('[Auth] global signOut failed:', err);
      });
    } catch (err) {
      console.error('[Auth] local signOut failed, forcing storage cleanup:', err);
      clearAuthTokens();
    }
  }, [session?.user?.id, setOnlineStatus, clearAuthTokens]);

  const enterGuestMode = useCallback(() => {
    setSession(null);
    setProfile(null);
    setIsGuest(true);
    setLoading(false);
    localStorage.setItem(GUEST_MODE_KEY, '1');
  }, []);

  const exitGuestMode = useCallback(() => {
    setSession(null);
    setProfile(null);
    setIsGuest(false);
    localStorage.removeItem(GUEST_MODE_KEY);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      const fallbackUsername = getDefaultUsername(session.user);
      await fetchProfile(session.user.id, fallbackUsername);
    }
  }, [session, fetchProfile, getDefaultUsername]);

  const updateProfile = useCallback(async (fields: Partial<Pick<Profile, 'username' | 'skin' | 'avatar_url'>>) => {
    const userId = session?.user?.id;
    if (!userId) return;
    await supabase.from('profiles').update(fields).eq('id', userId);
    await fetchProfile(userId);
  }, [session?.user?.id, fetchProfile]);

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    isGuest,
    signInWithGoogle,
    signInWithDiscord,
    signInWithEmail,
    signOut,
    enterGuestMode,
    exitGuestMode,
    refreshProfile,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { AuthContext };
export type { AuthState };
