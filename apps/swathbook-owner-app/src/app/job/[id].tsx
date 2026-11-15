import { BookingStatusBadge } from '@swathbook/mobile/booking-status';
import { Badge, Button, Card, CardTitle, colors, Divider, EmptyState, FormMessage, Screen, space, Text } from '@swathbook/mobile/design-system';
import { formatCents, formatDuration, formatLongDate, formatTimeRange } from '@swathbook/mobile/format';
import { LoadError, Loading } from '@swathbook/mobile/query-state';
import { useLocalSearchParams } from 'expo-router';
import { MapPin, MessageSquareText, Navigation, Phone, SearchX } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { CancelRequestCard, JobActions, TeamNotes } from '@/components/job-sections';
import { useJob, useTeam, type Job } from '@/data/api';
import { useActiveBusiness } from '@/data/business';
import { describeJobEvent } from '@/lib/job-events';
import { jobSteps } from '@/lib/job-rules';
import { dateKeyIn } from '@/lib/time';

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { business } = useActiveBusiness();
  const job = useJob(business.id, id);

  if (job.isPending) return <Loading />;
  if (job.isError) {
    return (
      <Screen edges={[]}>
        <LoadError onRetry={job.refetch} />
      </Screen>
    );
  }
  if (!job.data) {
    return (
      <Screen edges={[]}>
        <EmptyState icon={SearchX} title="Job not found">
          It may belong to another business, or it was removed.
        </EmptyState>
      </Screen>
    );
  }
  return <JobDetail job={job.data} />;
}

function addressText(address: NonNullable<Job['customer_addresses']>) {
  return [address.line1, address.line2, [address.city, address.region].filter(Boolean).join(', '), address.postal_code].filter(Boolean).join(', ');
}

function directionsUrl(address: NonNullable<Job['customer_addresses']>) {
  const destination = address.lat != null && address.lng != null ? `${address.lat},${address.lng}` : addressText(address);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

function JobDetail({ job }: { job: Job }) {
  const { business, canManage } = useActiveBusiness();
  const team = useTeam(business.id);
  const [allActivity, setAllActivity] = useState(false);
  const tz = business.timezone;
  const names = (team.data ?? []).map((person) => ({ id: person.id, name: person.display_name ?? 'Team member' }));
  const assignee = names.find((person) => person.id === job.assigned_member_id)?.name ?? 'Unassigned';
  const customer = job.customers?.full_name ?? 'Customer';
  const phone = job.customers?.phone ?? null;
  const address = job.customer_addresses;
  const balance = Math.max(0, job.balance_due_cents ?? 0);
  const canWork = canManage || job.assigned_member_id === business.memberId;
  const started = dateKeyIn(new Date(job.scheduled_start), tz) <= dateKeyIn(new Date(), tz);
  const steps = jobSteps({ status: job.status, customerName: customer, started, cancelRequested: Boolean(job.cancel_requested_at) }, { canManage, canWork });
  const events = allActivity ? job.booking_events : job.booking_events.slice(0, 5);
  const minutes = Math.round((Date.parse(job.scheduled_end) - Date.parse(job.scheduled_start)) / 60_000);

  return (
    <Screen edges={[]}>
      <View style={styles.stack}>
        <Text variant="label">Job {job.reference}</Text>
        <Text variant="title">{customer}</Text>
        <Text tone="soft">
          {formatLongDate(job.scheduled_start, tz)} · {formatTimeRange(job.scheduled_start, job.scheduled_end, tz)} · {formatDuration(minutes)}
        </Text>
        <View style={styles.badges}>
          <BookingStatusBadge status={job.status} />
          <Badge tone="neutral">{assignee}</Badge>
          {canManage && (job.total_cents ?? 0) > 0 ? (
            <Badge tone={balance > 0 ? 'sun' : 'neutral'}>
              {formatCents(job.total_cents ?? 0, job.currency)}
              {balance > 0 ? ` · ${formatCents(balance, job.currency)} due` : ' · paid'}
            </Badge>
          ) : null}
        </View>
      </View>

      {job.status === 'pending_payment' && job.hold_expires_at ? (
        <FormMessage tone="info">Waiting for the deposit. The time is held for a little while; if it isn&rsquo;t paid, it opens up again.</FormMessage>
      ) : null}
      {job.status === 'cancelled' && job.cancellation_reason ? (
        <FormMessage tone="info">
          Cancelled: {job.cancellation_reason === 'Payment hold expired' ? "the deposit wasn't paid in time, so the time was released." : job.cancellation_reason}
        </FormMessage>
      ) : null}
      {job.cancel_requested_at && canManage ? <CancelRequestCard job={job} business={business} /> : null}

      <JobActions job={job} primary={steps.primary} more={steps.more} />

      {phone || address ? (
        <View style={styles.quick} role="group" aria-label="Quick actions">
          {phone ? (
            <>
              <Button variant="secondary" icon={Phone} style={styles.flex} onPress={() => void Linking.openURL(`tel:${phone}`)}>
                Call
              </Button>
              <Button variant="secondary" icon={MessageSquareText} style={styles.flex} onPress={() => void Linking.openURL(`sms:${phone}`)}>
                Text
              </Button>
            </>
          ) : null}
          {address ? (
            <Button variant="secondary" icon={Navigation} style={styles.flex} onPress={() => void Linking.openURL(directionsUrl(address))}>
              Directions
            </Button>
          ) : null}
        </View>
      ) : null}

      <Card>
        <CardTitle>What&rsquo;s booked</CardTitle>
        <View style={styles.stack}>
          {job.booking_items.map((item, index) => (
            <View key={item.id}>
              {index ? <Divider /> : null}
              <View style={styles.row}>
                <Text style={styles.flex}>
                  {item.name}
                  {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                </Text>
                {canManage ? <Text variant="bodyStrong">{formatCents(item.line_total_cents ?? 0, job.currency)}</Text> : null}
              </View>
            </View>
          ))}
          {job.customer_notes ? (
            <Card variant="deep" padding={3}>
              <Text variant="smallStrong">Customer note</Text>
              <Text variant="small">{job.customer_notes}</Text>
            </Card>
          ) : null}
        </View>
      </Card>

      {job.booking_answers.length ? (
        <Card>
          <CardTitle>Customer answers</CardTitle>
          <View style={styles.answers}>
            {job.booking_answers.map((answer, index) => (
              <View key={`${index}-${answer.prompt}`}>
                <Text variant="small" tone="soft">
                  {answer.prompt}
                </Text>
                <Text variant="bodyStrong">{answer.answer}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {address ? (
        <Card>
          <CardTitle>Where</CardTitle>
          <View style={styles.addressRow}>
            <MapPin size={16} color={colors.inkFaint} aria-hidden />
            <Text style={styles.flex}>{addressText(address)}</Text>
          </View>
          {address.access_notes ? (
            <Card variant="deep" padding={3} style={styles.access}>
              <Text variant="smallStrong">Access notes</Text>
              <Text variant="small">{address.access_notes}</Text>
            </Card>
          ) : null}
        </Card>
      ) : null}

      <TeamNotes job={job} canEdit={canManage} />

      <Card>
        <CardTitle>Activity</CardTitle>
        <View style={styles.answers}>
          {events.map((event) => {
            const described = describeJobEvent(event, { timeZone: tz, currency: job.currency, team: names });
            return (
              <View key={event.id}>
                <Text variant="bodyStrong">{described.title}</Text>
                {described.detail ? (
                  <Text variant="small" tone="soft">
                    {described.detail}
                  </Text>
                ) : null}
                <Text variant="caption" tone="faint">
                  {formatLongDate(event.created_at, tz)}
                </Text>
              </View>
            );
          })}
          {job.booking_events.length > 5 ? (
            <Button variant="ghost" size="sm" onPress={() => setAllActivity((value) => !value)}>
              {allActivity ? 'Show less' : `Show all ${job.booking_events.length}`}
            </Button>
          ) : null}
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space[2],
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[1.5],
    marginTop: space[1],
  },
  quick: {
    flexDirection: 'row',
    gap: space[2],
  },
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: space[3],
    paddingVertical: space[1.5],
  },
  answers: {
    gap: space[3],
  },
  addressRow: {
    flexDirection: 'row',
    gap: space[2],
    alignItems: 'flex-start',
  },
  access: {
    marginTop: space[3],
  },
});
