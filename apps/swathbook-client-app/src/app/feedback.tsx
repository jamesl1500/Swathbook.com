import { FeedbackScreen } from '@swathbook/mobile/feedback-screen';
import { MessageSquareHeart } from 'lucide-react-native';

import { SignInPrompt } from '@/components/sign-in-prompt';
import { useMyFeedback, useSendFeedback } from '@/data/api';
import { useAuth } from '@/data/auth';
import { Screen } from '@swathbook/mobile/design-system';

/** Ideas, problems and praise for the team, from Account › Send feedback. */
export default function SendFeedbackScreen() {
  const { user } = useAuth();
  const notes = useMyFeedback(user?.id);
  const send = useSendFeedback();

  // Notes come with the sender's account, so the team can write back.
  if (!user) {
    return (
      <Screen edges={[]}>
        <SignInPrompt icon={MessageSquareHeart} title="Tell us what you think">
          Sign in to send feedback. It goes straight to the team building Swathbook, and you'll see their replies here.
        </SignInPrompt>
      </Screen>
    );
  }

  return (
    <FeedbackScreen
      intro="Booking with Swathbook is brand new, and you're one of the first to try it. Tell us what's working and what isn't. It goes straight to the team."
      send={(input) => send.mutateAsync(input)}
      notes={notes.data}
      notesLoading={notes.isPending}
    />
  );
}
