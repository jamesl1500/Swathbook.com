import { Card, colors, EmptyState, PageHeader, PressableCard, Screen, SectionHeader, space, Text } from '@swathbook/mobile/design-system';
import { formatLongDate } from '@swathbook/mobile/format';
import { LoadError, Loading } from '@swathbook/mobile/query-state';
import { router } from 'expo-router';
import { CalendarCheck, ChevronRight } from 'lucide-react-native';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { JobRow } from '@/components/job-row';
import { useRunStep } from '@/components/use-run-step';
import { useBookingCounts, useTodayJobs, type BookingRow } from '@/data/api';
import { useActiveBusiness } from '@/data/business';
import type { BookingView } from '@/lib/booking-views';
import { jobSteps } from '@/lib/job-rules';
import { dateKeyIn } from '@/lib/time';

/**
 * Today: what's waiting on a decision, then the day's jobs in order, each
 * with its next step one tap away.
 */
export default function TodayScreen() {
  const { business, canManage } = useActiveBusiness();
  const tz = business.timezone;
  const today = dateKeyIn(new Date(), tz);
  // Crew see their own day; owners and admins see everyone's.
  const memberId = canManage ? null : business.memberId;
  const counts = useBookingCounts(business.id);
  const jobs = useTodayJobs(business.id, today, tz, memberId);
  const { run, pending } = useRunStep(business.id);

  const attention: { view: BookingView; count: number; label: string }[] = [
    ...(canManage
      ? [
          { view: 'requests' as const, count: counts.data?.requests ?? 0, label: 'requests to accept' },
          { view: 'cancel' as const, count: counts.data?.cancel_requests ?? 0, label: 'cancellation requests' },
        ]
      : []),
    { view: 'deposit' as const, count: counts.data?.awaiting_deposit ?? 0, label: 'waiting on a deposit' },
  ].filter((item) => item.count > 0);

  const list = jobs.data ?? [];
  const remaining = list.filter((job) => job.status === 'confirmed' || job.status === 'in_progress').length;

  function stepFor(job: BookingRow) {
    const canWork = canManage || job.assigned_member_id === business.memberId;
    const steps = jobSteps({ status: job.status, customerName: job.customer_name, started: true, cancelRequested: Boolean(job.cancel_requested_at) }, { canManage, canWork });
    return steps.primary.find((step) => step.key === 'start' || step.key === 'complete') ?? null;
  }

  const refreshing = jobs.isRefetching || counts.isRefetching;

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void jobs.refetch();
            void counts.refetch();
          }}
          tintColor={colors.brand600}
        />
      }
    >
      <PageHeader
        eyebrow={business.name}
        title="Today"
        description={`${formatLongDate(new Date().toISOString(), tz)}${list.length ? ` · ${remaining ? `${remaining} to go` : 'all done'}` : ''}`}
      />

      {attention.length ? (
        <View style={styles.stack}>
          <SectionHeader title="Needs your attention" />
          {attention.map((item) => (
            <PressableCard
              key={item.view}
              onPress={() => router.push({ pathname: '/bookings', params: { view: item.view } })}
              style={styles.attention}
              aria-label={`${item.count} ${item.label}`}
            >
              <Text variant="stat" tone="ink">
                {item.count}
              </Text>
              <Text variant="bodyStrong" style={styles.flex}>
                {item.label}
              </Text>
              <ChevronRight size={20} color={colors.inkFaint} aria-hidden />
            </PressableCard>
          ))}
        </View>
      ) : null}

      <View style={styles.stack}>
        <SectionHeader title={canManage ? "Today's jobs" : 'Your jobs today'} />
        {jobs.isPending ? (
          <Loading />
        ) : jobs.isError ? (
          <LoadError onRetry={jobs.refetch} />
        ) : list.length === 0 ? (
          <Card variant="deep">
            <EmptyState icon={CalendarCheck} title="Nothing booked today">
              New bookings show up here the moment they come in.
            </EmptyState>
          </Card>
        ) : (
          list.map((job) => (
            <JobRow key={job.id} job={job} timeZone={tz} showDate={false} step={stepFor(job)} pending={pending} onStep={(step) => run(job.id, step)} />
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space[3],
  },
  attention: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
  },
  flex: {
    flex: 1,
  },
});
