import { FeedbackScreen } from '@swathbook/mobile/feedback-screen';

import { useMyFeedback, useSendFeedback } from '@/data/api';
import { useAuth } from '@/data/auth';
import { useBusiness } from '@/data/business';

/** Ideas, problems and praise for the team, from More › Send feedback. */
export default function SendFeedbackScreen() {
  const { user } = useAuth();
  const { active } = useBusiness();
  const notes = useMyFeedback(user?.id);
  const send = useSendFeedback(active?.id ?? null);

  return (
    <FeedbackScreen
      intro="You're one of our first users, so what you tell us decides what we build next. It goes straight to the team, with your app version and phone so we can reproduce problems."
      send={(input) => send.mutateAsync(input)}
      notes={notes.data}
      notesLoading={notes.isPending}
    />
  );
}
