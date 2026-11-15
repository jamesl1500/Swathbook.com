import { BookingStatusBadge } from '@swathbook/mobile/booking-status';
import { Badge, Button, colors, PressableCard, radius, space, Text } from '@swathbook/mobile/design-system';
import { formatDayOfMonth, formatMonth, formatTime, formatTimeRange } from '@swathbook/mobile/format';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import type { BookingRow } from '@/data/api';
import type { Step } from '@/lib/job-rules';

/**
 * A job in a list: a date tile (or the time, on Today), who and what, and
 * its status. `step` adds a button for the obvious next step ("Start job").
 */
export function JobRow({
  job,
  timeZone,
  showDate = true,
  step,
  onStep,
  pending = false,
  assignee,
}: {
  job: BookingRow;
  timeZone: string;
  /** False on Today, where every job is the same day: show the time instead. */
  showDate?: boolean;
  step?: Step | null;
  onStep?: (step: Step) => void;
  pending?: boolean;
  assignee?: string | null;
}) {
  const muted = job.status === 'cancelled' || job.status === 'completed' || job.status === 'no_show';
  const services = job.services || 'Service visit';

  return (
    <PressableCard
      onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })}
      aria-label={`${job.customer_name}, ${services}, ${formatTimeRange(job.scheduled_start, job.scheduled_end, timeZone)}`}
      style={styles.card}
    >
      <View style={styles.row}>
        <View style={[styles.tile, muted && styles.tileMuted]} aria-hidden>
          {showDate ? (
            <>
              <Text variant="label" tone={muted ? 'faint' : 'sky'} style={styles.month}>
                {formatMonth(job.scheduled_start, timeZone)}
              </Text>
              <Text variant="heading" tone={muted ? 'soft' : 'paper'} style={styles.day}>
                {formatDayOfMonth(job.scheduled_start, timeZone)}
              </Text>
            </>
          ) : (
            <Text variant="smallStrong" tone={muted ? 'soft' : 'paper'} align="center">
              {formatTime(job.scheduled_start, timeZone)}
            </Text>
          )}
        </View>
        <View style={styles.body}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {job.customer_name}
          </Text>
          <Text variant="small" tone="soft" numberOfLines={1}>
            {services}
          </Text>
          <Text variant="small" tone="faint" numberOfLines={1}>
            {formatTimeRange(job.scheduled_start, job.scheduled_end, timeZone)}
            {assignee !== undefined ? ` · ${assignee ?? 'Unassigned'}` : ''}
          </Text>
          <View style={styles.badges}>
            <BookingStatusBadge status={job.status} />
            {job.cancel_requested_at ? <Badge tone="clay">Cancel requested</Badge> : null}
          </View>
        </View>
      </View>
      {step && onStep ? (
        <Button size="sm" block loading={pending} onPress={() => onStep(step)} style={styles.step} aria-label={`${step.label} for ${job.customer_name}`}>
          {step.label}
        </Button>
      ) : null}
    </PressableCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space[3],
  },
  row: {
    flexDirection: 'row',
    gap: space[4],
    alignItems: 'flex-start',
  },
  tile: {
    width: 64,
    minHeight: 56,
    paddingVertical: space[2],
    paddingHorizontal: space[1],
    borderRadius: radius.lg,
    backgroundColor: colors.brand600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileMuted: {
    backgroundColor: colors.paperDeep,
  },
  month: {
    fontSize: 10.5,
    letterSpacing: 1.4,
  },
  day: {
    lineHeight: 28,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: space[0.5],
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[1.5],
    marginTop: space[2],
  },
  step: {
    marginTop: space[1],
  },
});
