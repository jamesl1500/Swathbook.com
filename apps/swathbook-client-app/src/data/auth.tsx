import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * Customer sign-in: passwordless, by a one-time code emailed to them. The
 * first code also creates the account, and entering it confirms the email,
 * which is what links the login to bookings made with that address.
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
      if (event === 'SIGNED_OUT') queryClient.removeQueries({ queryKey: ['me'] });
      if (event === 'SIGNED_IN') queryClient.invalidateQueries({ queryKey: ['me'] });
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

/** Friendlier wording for Supabase Auth errors. */
function authMessage(error: { message: string; code?: string; status?: number }) {
  if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
    return 'Too many codes requested. Wait a minute, then try again.';
  }
  if (error.code === 'otp_expired' || /expired|invalid/i.test(error.message)) {
    return 'That code is wrong or has expired. Check the email, or send a new code.';
  }
  if (/network|fetch/i.test(error.message)) return "Can't reach Swathbook. Check your connection.";
  return 'Something went wrong. Please try again.';
}

export async function sendSignInCode(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    // `customer_app` picks the code version of the confirmation email for new accounts.
    options: { shouldCreateUser: true, data: { customer_app: true } },
  });
  if (error) throw new Error(authMessage(error));
}

export async function verifySignInCode(email: string, code: string) {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
  if (error) throw new Error(authMessage(error));
}

export async function signOut() {
  await supabase.auth.signOut();
}
