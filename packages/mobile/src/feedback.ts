/**
 * Product feedback in the mobile apps: the same choices, limits and wording
 * as the website (apps/swathbook-web/src/libs/feedback.ts). Plain TypeScript
 * (no React Native), so it's easy to test. Both apps send through the
 * submit_feedback() database function with the signed-in session.
 */

export type FeedbackKind = 'idea' | 'problem' | 'praise' | 'other';
export type FeedbackStatus = 'new' | 'reviewing' | 'planned' | 'done' | 'closed';
export type FeedbackSource = 'owner_app' | 'client_app';

export const FEEDBACK_KINDS: Array<{ value: FeedbackKind; label: string; hint: string }> = [
  { value: 'idea', label: 'An idea', hint: 'Something you wish it did' },
  { value: 'problem', label: "Something's broken", hint: 'An error, or it did the wrong thing' },
  { value: 'praise', label: 'Something I love', hint: 'Tell us what to keep' },
  { value: 'other', label: 'Something else', hint: 'Questions, confusion, anything' },
];

export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = { idea: 'Idea', problem: 'Problem', praise: 'Praise', other: 'Other' };

export const FEEDBACK_PLACEHOLDERS: Record<FeedbackKind, string> = {
  idea: 'What would make Swathbook more useful to you?',
  problem: 'What happened, and what did you expect? Your app version and phone are included for us.',
  praise: "What's working well? We'll make sure to keep it.",
  other: "What's on your mind?",
};

/** How a note's status reads to the person who sent it. */
export const FEEDBACK_STATUSES: Record<FeedbackStatus, { label: string; tone: 'neutral' | 'sun' | 'brand' | 'brandSolid' }> = {
  new: { label: 'Received', tone: 'neutral' },
  reviewing: { label: 'Looking into it', tone: 'sun' },
  planned: { label: 'Planned', tone: 'brand' },
  done: { label: 'Done', tone: 'brandSolid' },
  closed: { label: 'Closed', tone: 'neutral' },
};

export const RATING_LABELS = ['', 'Not working for me', 'Needs work', "It's OK", 'Pretty good', 'Love it'];

export const FEEDBACK_MESSAGE_MAX = 4000;

/** A note as the sender sees it (the columns RLS lets them read). */
export type FeedbackNote = {
  id: string;
  kind: FeedbackKind;
  message: string;
  status: FeedbackStatus;
  response: string | null;
  created_at: string;
};

export type FeedbackInput = {
  kind: FeedbackKind;
  message: string;
  rating: number | null;
  contactOk: boolean;
};

/** What's wrong with a note before sending, or null when it's fine. */
export function feedbackError({ message, rating }: Pick<FeedbackInput, 'message' | 'rating'>) {
  const text = message.trim();
  if (text.length < 3) return 'Tell us a little more.';
  if (text.length > FEEDBACK_MESSAGE_MAX) return `Keep it under ${FEEDBACK_MESSAGE_MAX.toLocaleString('en-US')} characters.`;
  if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) return 'Pick a rating from 1 to 5.';
  return null;
}

/** Friendly words for what submit_feedback() can refuse. */
export const FEEDBACK_ERRORS: Record<string, string> = {
  feedback_rate_limited: "That's a lot of feedback in a short time. Thank you! Try again in a little while.",
  invalid_message: 'Tell us a little more (at least a few words).',
  not_signed_in: 'Sign in again to send feedback.',
};

/** The arguments submit_feedback() takes, from the form and the device. */
export function feedbackArgs(
  input: FeedbackInput,
  context: { source: FeedbackSource; appVersion?: string | null; platform?: string | null; screen?: string | null; businessId?: string | null },
) {
  return {
    p_source: context.source,
    p_kind: input.kind,
    p_message: input.message.trim(),
    p_contact_ok: input.contactOk,
    ...(input.rating ? { p_rating: input.rating } : {}),
    ...(context.appVersion ? { p_app_version: context.appVersion.slice(0, 40) } : {}),
    ...(context.platform ? { p_platform: context.platform.slice(0, 200) } : {}),
    ...(context.screen ? { p_page: context.screen.slice(0, 300) } : {}),
    ...(context.businessId ? { p_business_id: context.businessId } : {}),
  };
}
