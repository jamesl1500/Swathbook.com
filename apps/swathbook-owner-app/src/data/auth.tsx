import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { signInMessage } from '@/lib/sign-in-message';
import { supabase } from '@/lib/supabase';

/**
 * Team sign-in: the same email and password as the web dashboard. New
 * businesses are set up on the website; this app is for running the day.
 */

type AuthState = { session: Session | null; ready: boolean };

const AuthContext = createContext<AuthState>({ session: null, ready: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ session: null, ready: false });

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setState({ session: data.session, ready: true });
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState({ session, ready: true });
      // Never show one person's jobs to the next person on the device.
      if (event === 'SIGNED_OUT') queryClient.clear();
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const { session, ready } = useContext(AuthContext);
  return { session, user: session?.user ?? null, ready, signedIn: Boolean(session) };
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw new Error(signInMessage(error));
}

export async function signOut() {
  await supabase.auth.signOut();
}
