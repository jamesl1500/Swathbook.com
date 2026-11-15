/** Supabase Auth errors, as people should read them. */
export function signInMessage(error: { message: string; code?: string; status?: number }) {
  if (error.code === 'invalid_credentials') return "That email and password don't match. Try again, or reset your password.";
  if (error.code === 'email_not_confirmed') return 'Confirm your email first: the link is in your inbox.';
  if (error.code === 'over_request_rate_limit' || error.status === 429) return 'Too many attempts. Wait a minute, then try again.';
  if (/network|fetch/i.test(error.message)) return "Can't reach Swathbook. Check your connection.";
  return 'Something went wrong. Please try again.';
}
