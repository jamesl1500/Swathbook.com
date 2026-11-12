import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { CalendarClock, CalendarPlus, Clock, CreditCard, Mail, MapPin, Phone, RotateCcw, SearchX, X } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { formatAddress } from '@/components/address';
import { BookingStatusBadge } from '@/components/booking-status-badge';
import { Loading, LoadError } from '@/components/query-state';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { isUpcoming, useCancelBooking, useMyBooking } from '@/data/api';
import { useAuth } from '@/data/auth';
import type { CustomerBooking } from '@/data/types';
import {
  Avatar,
  Button,
  Card,
  CardTitle,
  colors,
  Divider,
  EmptyState,
  FormMessage,
  IconButton,
  MapGrid,
  radius,
  Rise,
  Screen,
  space,
  Text,
} from '@/design-system';
import { assetUrl, manageBookingUrl } from '@/lib/config';
import { confirm } from '@/lib/confirm';
import { formatCents, formatDuration, formatLongDate, formatTime, formatTimeRange, minutesBetween } from '@/lib/format';
import { tradeName } from '@/lib/trades';

export default function JobScreen() {
  const { id, booked } = useLocalSearchParams<{ id: string; booked?: string }>();
  const { signedIn } = useAuth();
  const { data: booking, isPending, isError, refetch } = useMyBooking(id);

  if (!signedIn) {
    return (
      <Screen edges={[]}>
        <SignInPrompt title="Sign in to see this job">Your jobs are tied to the email you book with.</SignInPrompt>
      </Screen>
    );
  }
  if (isPending) return <Loading />;
  if (isError) {
    return (
      <Screen edges={[]}>
        <LoadError onRetry={refetch} />
      </Screen>
    );
  }
  if (!booking) {
    return (
      <Screen edges={[]}>
        <EmptyState icon={SearchX} title="Job not found">
          It may belong to a different email address, or the business removed it.
        </EmptyState>
      </Screen>
    );
  }
  return <JobDetail booking={booking} justBooked={booked === '1'} onPaid={refetch} />;
}

function JobDetail({ booking, justBooked, onPaid }: { booking: CustomerBooking; justBooked: boolean; onPaid: () => void }) {
  const cancel = useCancelBooking();
  const [cancelOutcome, setCancelOutcome] = useState<'cancelled' | 'requested' | null>(null);
  const { business, options } = booking;
  const tz = business.timezone;
  const upcoming = isUpcoming(booking);
  const bookHref = { pathname: '/book/[slug]', params: { slug: business.slug } } as const;

  const awaitingDeposit = booking.status === 'pending_payment' && booking.deposit_due_cents > booking.deposit_paid_cents;
  const canPayOnline = business.accepts_online_payments;
  const balanceOwed = booking.balance_due_cents > 0 && booking.status !== 'cancelled' && booking.status !== 'no_show';

  async function pay() {
    // Payments happen on the booking's web page (Stripe), then we refresh.
    await WebBrowser.openBrowserAsync(manageBookingUrl(booking.public_token));
    onPaid();
  }

  async function onCancel() {
    const asRequest = options?.cancel_is_request ?? true;
    const ok = await confirm({
      title: asRequest ? 'Ask to cancel?' : 'Cancel this booking?',
      message: asRequest
        ? `${business.name} has accepted this booking, so they'll confirm the cancellation.${refundNote(booking)}`
        : `${business.name} hasn't accepted it yet, so it's cancelled right away.`,
      confirmLabel: asRequest ? 'Ask to cancel' : 'Cancel booking',
      destructive: true,
    });
    if (!ok) return;
    cancel.mutate({ id: booking.id, reason: '' }, { onSuccess: ({ outcome }) => setCancelOutcome(outcome) });
  }

  return (
    <Screen edges={[]}>
      {justBooked && booking.status !== 'pending_payment' ? (
        <Rise>
          <FormMessage tone="success">
            {booking.status === 'requested'
              ? `Request sent. ${business.name} will confirm it, and we'll email you.`
              : `You're booked. ${business.name} will see it right away.`}
          </FormMessage>
        </Rise>
      ) : null}
      {cancelOutcome === 'requested' ? (
        <FormMessage tone="success">Cancellation requested. {business.name} will confirm it by email.</FormMessage>
      ) : null}

      {awaitingDeposit ? (
        <Card variant="raised" style={styles.payCard}>
          <Text variant="subheading">Pay the deposit to keep this time</Text>
          <Text variant="small" tone="soft">
            {booking.hold_expires_at
              ? `We're holding it until ${formatTime(booking.hold_expires_at, tz)}. After that it opens up for others.`
              : 'Your time is held for a short while.'}
          </Text>
          <Button variant="accent" icon={CreditCard} block onPress={pay}>
            {`Pay ${formatCents(booking.deposit_due_cents - booking.deposit_paid_cents, booking.currency)} deposit`}
          </Button>
        </Card>
      ) : null}

      <MapGrid style={styles.when}>
        <View style={styles.whenTop}>
          <BookingStatusBadge status={booking.status} />
          <Text variant="mono" tone="sky">
            {booking.reference}
          </Text>
        </View>
        <Text variant="heading" tone="paper">
          {formatLongDate(booking.scheduled_start, tz)}
        </Text>
        <View style={styles.line}>
          <Clock size={16} color={colors.sky} aria-hidden />
          <Text variant="bodyStrong" tone="paper">
            {formatTimeRange(booking.scheduled_start, booking.scheduled_end, tz)}
          </Text>
          <Text variant="small" tone="sky">
            · {formatDuration(minutesBetween(booking.scheduled_start, booking.scheduled_end))}
          </Text>
        </View>
        {booking.address ? (
          <View style={styles.line}>
            <MapPin size={16} color={colors.sky} aria-hidden />
            <Text variant="small" tone="sky" style={styles.flex}>
              {formatAddress(booking.address)}
            </Text>
          </View>
        ) : null}
      </MapGrid>

      {booking.cancel_requested_at && cancelOutcome !== 'requested' ? (
        <FormMessage tone="info">You asked to cancel. {business.name} will confirm it by email.</FormMessage>
      ) : null}
      {booking.status === 'cancelled' && booking.cancellation_reason ? (
        <FormMessage tone="info">{booking.cancellation_reason}.</FormMessage>
      ) : null}

      <Card>
        <CardTitle>What&rsquo;s booked</CardTitle>
        <View style={styles.rows}>
          {booking.items.map((item, index) => (
            <View key={`${item.name}-${index}`} style={styles.row}>
              <Text variant="body" style={styles.flex}>
                {item.quantity > 1 ? `${item.quantity} × ${item.name}` : item.name}
              </Text>
              <Text variant="bodyStrong">{formatCents(item.line_total_cents, booking.currency)}</Text>
            </View>
          ))}
          <Divider />
          <MoneyRow label="Discount" cents={-booking.discount_cents} currency={booking.currency} />
          <MoneyRow label="Tax" cents={booking.tax_cents} currency={booking.currency} />
          <MoneyRow label="Tip" cents={booking.tip_cents} currency={booking.currency} />
          <MoneyRow label="Paid" cents={-booking.amount_paid_cents} currency={booking.currency} />
          <MoneyRow label="Refunded" cents={booking.amount_refunded_cents} currency={booking.currency} />
          <View style={styles.row}>
            <Text variant="bodyStrong" style={styles.flex}>
              {booking.status === 'cancelled' || booking.status === 'no_show' ? 'Nothing due' : balanceOwed ? 'Balance due' : 'Paid in full'}
            </Text>
            <Text variant="subheading">
              {formatCents(balanceOwed ? booking.balance_due_cents : booking.status === 'cancelled' ? 0 : booking.total_cents, booking.currency)}
            </Text>
          </View>
          {balanceOwed && !awaitingDeposit ? (
            canPayOnline ? (
              <Button variant="secondary" icon={CreditCard} block onPress={pay}>
                {`Pay ${formatCents(booking.balance_due_cents, booking.currency)} now`}
              </Button>
            ) : (
              <Text variant="caption" tone="faint">
                Pay {business.name} directly on the day.
              </Text>
            )
          ) : null}
        </View>
      </Card>

      {booking.customer_notes ? (
        <Card variant="deep">
          <Text variant="label">Your notes</Text>
          <Text variant="body" style={styles.notes}>
            {booking.customer_notes}
          </Text>
        </Card>
      ) : null}

      <Card style={styles.business}>
        <Avatar name={business.name} color={business.brand_color} imageUri={assetUrl(business.logo_path)} />
        <View style={styles.flex}>
          <Text variant="subheading" numberOfLines={1}>
            {business.name}
          </Text>
          <Text variant="small" tone="soft">
            {tradeName(business.trade)}
          </Text>
        </View>
        {business.phone ? (
          <IconButton icon={Phone} label={`Call ${business.name}`} onPress={() => Linking.openURL(`tel:${business.phone}`)} />
        ) : null}
        {business.email ? (
          <IconButton icon={Mail} label={`Email ${business.name}`} onPress={() => Linking.openURL(`mailto:${business.email}`)} />
        ) : null}
      </Card>

      {cancel.isError ? <FormMessage tone="error">{cancel.error.message}</FormMessage> : null}

      <View style={styles.actions}>
        {upcoming && options ? (
          <>
            {options.can_reschedule ? (
              <Button variant="secondary" block icon={CalendarClock} href={{ pathname: '/reschedule/[id]', params: { id: booking.id } }}>
                Pick a different time
              </Button>
            ) : null}
            {options.can_cancel ? (
              <Button variant="ghost" block icon={X} loading={cancel.isPending} onPress={onCancel} style={styles.cancel}>
                {options.cancel_is_request ? 'Ask to cancel' : 'Cancel booking'}
              </Button>
            ) : null}
            <Text variant="caption" tone="faint" align="center">
              {changeNote(booking)}
            </Text>
          </>
        ) : !upcoming && business.is_bookable ? (
          <Button block icon={booking.status === 'cancelled' ? CalendarPlus : RotateCcw} href={bookHref}>
            {booking.status === 'cancelled' ? 'Book a new time' : 'Book again'}
          </Button>
        ) : null}
      </View>
    </Screen>
  );
}

/** A money line that only shows when there's something to show. Negative = taken off. */
function MoneyRow({ label, cents, currency }: { label: string; cents: number; currency: string }) {
  if (!cents) return null;
  return (
    <View style={styles.row}>
      <Text variant="small" tone="soft" style={styles.flex}>
        {label}
      </Text>
      <Text variant="small" tone="soft">
        {cents < 0 ? `−${formatCents(-cents, currency)}` : formatCents(cents, currency)}
      </Text>
    </View>
  );
}

function refundNote(booking: CustomerBooking) {
  if (!booking.deposit_paid_cents) return '';
  switch (booking.business.deposit_refund_policy) {
    case 'refundable':
      return ' Your deposit will be refunded.';
    case 'non_refundable':
      return ' Deposits are non-refundable.';
    default:
      return ` Your deposit is refunded if you cancel at least ${booking.business.cancellation_window_hours} hours before.`;
  }
}

/** Why a change isn't offered, or the rules when it is. */
function changeNote(booking: CustomerBooking) {
  const options = booking.options;
  const hours = booking.business.cancellation_window_hours;
  switch (options?.reschedule_blocked_reason) {
    case 'too_late':
      return `It's within ${hours} hours, so call ${booking.business.name} to change it.`;
    case 'limit':
      return `This booking has been moved the most times allowed online. Call ${booking.business.name} to change it.`;
    case 'not_offered':
      return `${booking.business.name} doesn't take online reschedules. Call them to change it.`;
    case 'cancel_requested':
      return 'Waiting on the business to confirm your cancellation.';
    default:
      return options && options.reschedules_left < 3
        ? `You can move it ${options.reschedules_left} more ${options.reschedules_left === 1 ? 'time' : 'times'} online, up to ${hours} hours before.`
        : `You can move it online up to ${hours} hours before.`;
  }
}

const styles = StyleSheet.create({
  payCard: {
    gap: space[2.5],
    borderColor: colors.sun,
  },
  when: {
    borderRadius: radius.card,
    padding: space[5],
    gap: space[2],
  },
  whenTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space[2],
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  rows: {
    gap: space[3],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  notes: {
    marginTop: space[1.5],
  },
  business: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  actions: {
    gap: space[2],
  },
  cancel: {
    // A light outline so it reads as a button and not a link, without competing with the main action.
    borderColor: colors.line,
  },
});
