import { Button, Card, CardTitle, colors, FormMessage, space, Text, TextField } from '@swathbook/mobile/design-system';
import { formatCents } from '@swathbook/mobile/format';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { useResolveCancelRequest, useSaveTeamNotes, type Job , Membership } from '@/data/api';
import { refundByDefault, type Step } from '@/lib/job-rules';

import { showError, useRunStep } from './use-run-step';

/** The job's next steps as buttons, and the rest behind "More actions" (destructive last). */
export function JobActions({ job, primary, more }: { job: Job; primary: Step[]; more: Step[] }) {
  const { run, pending } = useRunStep(job.business_id);
  const [showMore, setShowMore] = useState(false);
  const [reasonFor, setReasonFor] = useState<Step | null>(null);
  const [reason, setReason] = useState('');
  const customer = job.customers?.full_name ?? 'the customer';

  if (!primary.length && !more.length) return null;

  if (reasonFor) {
    return (
      <Card>
        <CardTitle>{reasonFor.label}?</CardTitle>
        <View style={styles.stack}>
          <TextField
            label="Reason (optional)"
            value={reason}
            onChangeText={setReason}
            placeholder="For your records"
            maxLength={500}
            hint={`${customer} gets an email that it's cancelled.`}
          />
          <Button
            variant="danger"
            block
            loading={pending}
            onPress={() => {
              void run(job.id, reasonFor, reason.trim());
              setReasonFor(null);
              setReason('');
            }}
          >
            {reasonFor.label}
          </Button>
          <Button variant="ghost" block onPress={() => setReasonFor(null)}>
            Keep the job
          </Button>
        </View>
      </Card>
    );
  }

  return (
    <View style={styles.stack}>
      {primary.map((step, index) => (
        <Button key={step.key} block size="lg" variant={index === 0 ? 'primary' : 'secondary'} loading={pending} onPress={() => void run(job.id, step)}>
          {step.label}
        </Button>
      ))}
      {more.length ? (
        <Button variant="ghost" block onPress={() => setShowMore((value) => !value)} aria-expanded={showMore}>
          {showMore ? 'Fewer actions' : 'More actions'}
        </Button>
      ) : null}
      {showMore ? (
        <Card padding={3}>
          <View style={styles.stack}>
            {more.map((step) => (
              <Button
                key={step.key}
                block
                variant={step.danger ? 'danger' : 'secondary'}
                disabled={pending}
                onPress={() => (step.askReason ? setReasonFor(step) : void run(job.id, step))}
              >
                {step.label}
              </Button>
            ))}
          </View>
        </Card>
      ) : null}
    </View>
  );
}

/** A customer asked to cancel: approve (refunding what they paid, per policy) or decline. */
export function CancelRequestCard({ job, business }: { job: Job; business: Membership }) {
  const resolve = useResolveCancelRequest(business.id);
  const [refund, setRefund] = useState(() =>
    refundByDefault(business.depositRefundPolicy, job.cancel_requested_at, job.scheduled_start, business.cancellationWindowHours),
  );
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const customer = job.customers?.full_name ?? 'The customer';
  const paid = job.deposit_paid_cents;

  function decide(approve: boolean) {
    resolve.mutate(
      { id: job.id, approve, refund: approve && refund && paid > 0, note: approve ? undefined : note.trim() },
      { onSuccess: (message) => setDone(message), onError: (error) => showError("Couldn't answer the request", error.message) },
    );
  }

  if (done) return <FormMessage tone="success">{done}</FormMessage>;

  return (
    <Card variant="raised" style={styles.alert}>
      <Text variant="subheading">{customer} asked to cancel</Text>
      {job.cancel_request_reason ? <Text tone="soft">“{job.cancel_request_reason}”</Text> : null}
      {declining ? (
        <View style={styles.stack}>
          <TextField label={`Note for ${customer} (optional)`} value={note} onChangeText={setNote} placeholder="We can move you to another day instead…" maxLength={500} multiline />
          <Button block loading={resolve.isPending} onPress={() => decide(false)}>
            Keep the booking
          </Button>
          <Button variant="ghost" block onPress={() => setDeclining(false)}>
            Back
          </Button>
        </View>
      ) : (
        <View style={styles.stack}>
          {paid > 0 ? (
            <View style={styles.switchRow}>
              <Text variant="bodyStrong" style={styles.flex}>
                Refund {formatCents(paid, job.currency)}
              </Text>
              <Switch value={refund} onValueChange={setRefund} trackColor={{ true: colors.brand600 }} aria-label={`Refund ${formatCents(paid, job.currency)}`} />
            </View>
          ) : null}
          <Button variant="danger" block loading={resolve.isPending} onPress={() => decide(true)}>
            Approve cancellation
          </Button>
          <Button variant="secondary" block disabled={resolve.isPending} onPress={() => setDeclining(true)}>
            Decline
          </Button>
        </View>
      )}
    </Card>
  );
}

/** Notes only the team sees. Owners and admins edit; crew read. */
export function TeamNotes({ job, canEdit }: { job: Job; canEdit: boolean }) {
  const save = useSaveTeamNotes(job.business_id);
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? job.internal_notes ?? '';
  if (!canEdit && !job.internal_notes) return null;

  return (
    <Card>
      <CardTitle>Team notes</CardTitle>
      {canEdit ? (
        <View style={styles.stack}>
          <TextField value={value} onChangeText={setDraft} placeholder="Gate code, dog in the yard, bring the long ladder…" multiline maxLength={5000} aria-label="Team notes" />
          {save.isSuccess && draft === null ? <FormMessage tone="success">Saved.</FormMessage> : null}
          <Button
            variant="secondary"
            disabled={draft === null || draft === (job.internal_notes ?? '')}
            loading={save.isPending}
            onPress={() =>
              save.mutate(
                { id: job.id, notes: value },
                { onSuccess: () => setDraft(null), onError: (error) => showError("Couldn't save the notes", error.message) },
              )
            }
          >
            Save notes
          </Button>
        </View>
      ) : (
        <Text>{job.internal_notes}</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space[2],
  },
  alert: {
    gap: space[3],
    borderColor: colors.clay,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[1],
  },
  flex: {
    flex: 1,
  },
});
