import { describe, expect, it } from 'vitest';

import { feedbackArgs, feedbackError } from './feedback';

describe('feedbackError', () => {
  it('asks for a few words and a rating from 1 to 5', () => {
    expect(feedbackError({ message: '  hi ', rating: null })).toBe('Tell us a little more.');
    expect(feedbackError({ message: 'x'.repeat(4001), rating: null })).toMatch(/under 4,000/);
    expect(feedbackError({ message: 'Love the reminders', rating: 6 })).toBe('Pick a rating from 1 to 5.');
    expect(feedbackError({ message: 'Love the reminders', rating: 5 })).toBeNull();
    expect(feedbackError({ message: 'Love the reminders', rating: null })).toBeNull();
  });
});

describe('feedbackArgs', () => {
  it('sends the note with where it came from, leaving out what is unknown', () => {
    expect(
      feedbackArgs(
        { kind: 'problem', message: '  The map froze ', rating: 2, contactOk: false },
        { source: 'owner_app', appVersion: '1.2.0', platform: 'ios 18.1', screen: 'job/abc', businessId: 'b1' },
      ),
    ).toEqual({
      p_source: 'owner_app',
      p_kind: 'problem',
      p_message: 'The map froze',
      p_contact_ok: false,
      p_rating: 2,
      p_app_version: '1.2.0',
      p_platform: 'ios 18.1',
      p_page: 'job/abc',
      p_business_id: 'b1',
    });
    expect(feedbackArgs({ kind: 'idea', message: 'Dark mode', rating: null, contactOk: true }, { source: 'client_app' })).toEqual({
      p_source: 'client_app',
      p_kind: 'idea',
      p_message: 'Dark mode',
      p_contact_ok: true,
    });
  });
});
