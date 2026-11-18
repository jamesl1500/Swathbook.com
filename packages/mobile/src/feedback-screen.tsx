import { Bug, Heart, Lightbulb, MessageCircle, MessageSquareReply, type LucideIcon } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Badge, Button, Card, Chip, colors, FormMessage, OptionCard, Screen, SectionHeader, space, Text, TextField } from './design-system';
import {
  FEEDBACK_KIND_LABELS,
  FEEDBACK_KINDS,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_PLACEHOLDERS,
  FEEDBACK_STATUSES,
  feedbackError,
  RATING_LABELS,
  type FeedbackInput,
  type FeedbackKind,
  type FeedbackNote,
} from './feedback';
import { formatRelativeDay } from './format';

const KIND_ICONS: Record<FeedbackKind, LucideIcon> = { idea: Lightbulb, problem: Bug, praise: Heart, other: MessageCircle };

/**
 * The feedback screen both apps share: what kind of note, the note, an
 * optional rating and "you can email me", then what the person has sent so
 * far with where each stands and any reply from the team. `send` throws with
 * a readable message when it fails.
 */
export function FeedbackScreen({
  intro,
  send,
  notes,
  notesLoading = false,
}: {
  intro: ReactNode;
  send: (input: FeedbackInput) => Promise<unknown>;
  notes: FeedbackNote[] | undefined;
  notesLoading?: boolean;
}) {
  const [kind, setKind] = useState<FeedbackKind>('idea');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [contactOk, setContactOk] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    const problem = feedbackError({ message, rating });
    setError(problem);
    setSent(false);
    if (problem) return;
    setSending(true);
    try {
      await send({ kind, message, rating, contactOk });
      // A fresh form for the next note.
      setMessage('');
      setRating(null);
      setSent(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'We couldn’t send that. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen
      edges={[]}
      footer={
        <Button size="lg" block loading={sending} onPress={submit}>
          Send feedback
        </Button>
      }
    >
      <Text tone="soft">{intro}</Text>
      {sent ? <FormMessage tone="success">Thanks! Your feedback went straight to the team. We read every note.</FormMessage> : null}

      <View style={styles.stack} role="radiogroup" aria-label="What kind of feedback?">
        <SectionHeader title="What kind of feedback?" />
        {FEEDBACK_KINDS.map((option) => (
          <OptionCard
            key={option.value}
            title={option.label}
            description={option.hint}
            selected={kind === option.value}
            onPress={() => setKind(option.value)}
            value={(() => {
              const Icon = KIND_ICONS[option.value];
              return <Icon size={20} color={kind === option.value ? colors.brand600 : colors.inkFaint} aria-hidden />;
            })()}
          />
        ))}
      </View>

      <TextField
        label="Your feedback"
        value={message}
        onChangeText={(text) => {
          setMessage(text);
          if (error) setError(null);
        }}
        placeholder={FEEDBACK_PLACEHOLDERS[kind]}
        multiline
        maxLength={FEEDBACK_MESSAGE_MAX}
        hint={`${message.length.toLocaleString('en-US')} / ${FEEDBACK_MESSAGE_MAX.toLocaleString('en-US')}`}
        error={error ?? undefined}
      />

      <View style={styles.stack}>
        <SectionHeader title="How's Swathbook working for you?" />
        <View style={styles.ratings} role="radiogroup" aria-label="Rating, optional">
          {[1, 2, 3, 4, 5].map((value) => (
            <Chip
              key={value}
              selected={rating === value}
              onPress={() => setRating(rating === value ? null : value)}
              aria-label={`${value} of 5: ${RATING_LABELS[value]}`}
            >
              {String(value)}
            </Chip>
          ))}
        </View>
        <Text variant="small" tone="faint">
          {rating ? RATING_LABELS[rating] : 'Optional. 1 is “not working for me”, 5 is “love it”.'}
        </Text>
      </View>

      <View style={styles.toggle}>
        <View style={styles.flex}>
          <Text variant="bodyStrong">You can email me about this</Text>
          <Text variant="small" tone="soft">
            We might ask a follow-up question, or tell you when it’s fixed.
          </Text>
        </View>
        <Switch
          value={contactOk}
          onValueChange={setContactOk}
          aria-label="You can email me about this"
          trackColor={{ true: colors.brand500, false: colors.lineStrong }}
        />
      </View>

      <View style={styles.stack}>
        <SectionHeader title="Your feedback so far" />
        {notesLoading ? (
          <Text variant="small" tone="faint">
            Loading…
          </Text>
        ) : notes?.length ? (
          notes.map((note) => <NoteCard key={note.id} note={note} />)
        ) : (
          <Text variant="small" tone="soft">
            Nothing yet. Ideas, problems, praise: it all goes straight to the people building Swathbook.
          </Text>
        )}
      </View>
    </Screen>
  );
}

function NoteCard({ note }: { note: FeedbackNote }) {
  const status = FEEDBACK_STATUSES[note.status];
  return (
    <Card style={styles.note}>
      <View style={styles.noteHeader}>
        <Text variant="caption" tone="soft">
          {FEEDBACK_KIND_LABELS[note.kind]} · {formatRelativeDay(note.created_at)}
        </Text>
        <Badge tone={status.tone}>{status.label}</Badge>
      </View>
      <Text variant="small" numberOfLines={4}>
        {note.message}
      </Text>
      {note.response ? (
        <View style={styles.reply}>
          <MessageSquareReply size={16} color={colors.brand700} aria-hidden />
          <Text variant="small" style={styles.flex}>
            <Text variant="smallStrong">The team: </Text>
            {note.response}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space[2.5],
  },
  ratings: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  note: {
    gap: space[2],
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[2],
  },
  reply: {
    flexDirection: 'row',
    gap: space[2],
    padding: space[2.5],
    borderRadius: 10,
    backgroundColor: colors.brand50,
  },
});
