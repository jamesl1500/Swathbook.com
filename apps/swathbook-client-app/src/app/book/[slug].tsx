import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { CalendarCheck, CalendarX, ChevronRight, LogIn, SearchX } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AddressFields, toAddressValue, type AddressValue } from '@/components/address-fields';
import { Loading, LoadError } from '@/components/query-state';
import { SlotPicker, useSlotDays } from '@/components/slot-picker';
import { ApiError, useAvailableSlots, useBookingPage, useCreateBooking, useMyDetails } from '@/data/api';
import { useAuth } from '@/data/auth';
import type { BookingPage, MyDetails, Slot } from '@/data/types';
import {
  Button,
  Card,
  Chip,
  colors,
  Divider,
  EmptyState,
  FormMessage,
  OptionCard,
  Screen,
  SectionHeader,
  space,
  Text,
  TextField,
} from '@/design-system';
import { formatCents, formatDuration, formatServicePrice, formatShortDate, formatTime } from '@/lib/format';

export default function BookScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const page = useBookingPage(slug);
  const details = useMyDetails();

  if (page.isPending) return <Loading />;
  if (page.isError) {
    return (
      <Screen edges={[]}>
        <LoadError onRetry={page.refetch} />
      </Screen>
    );
  }
  if (!page.data || page.data.services.length === 0) {
    return (
      <Screen edges={[]}>
        <EmptyState icon={SearchX} title="Can&rsquo;t book this business">
          They aren&rsquo;t taking online bookings right now.
        </EmptyState>
      </Screen>
    );
  }
  // Never remounted: signing in (and setting up) mid-booking keeps the chosen
  // services and time, and the details fill in as they arrive.
  return <BookingFlow page={page.data} details={details.data ?? null} />;
}

const PHONE = /^\+?[0-9 ().-]{7,20}$/;

type FormErrors = Partial<Record<'fullName' | 'phone' | 'line1', string>>;

function BookingFlow({ page, details }: { page: BookingPage; details: MyDetails | null }) {
  const { business, services } = page;
  const tz = business.timezone;
  const { signedIn } = useAuth();

  const [serviceIds, setServiceIds] = useState<string[]>([services[0].id]);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [notes, setNotes] = useState('');
  // null = untouched, so the field shows their saved details (which can arrive
  // after the screen opens, e.g. when they sign in mid-booking).
  const [nameInput, setFullName] = useState<string | null>(null);
  const [phoneInput, setPhone] = useState<string | null>(null);
  const [addressInput, setAddress] = useState<AddressValue | null>(null);
  const fullName = nameInput ?? details?.full_name ?? '';
  const phone = phoneInput ?? details?.phone ?? '';
  const address = addressInput ?? toAddressValue(details?.address);
  const [errors, setErrors] = useState<FormErrors>({});
  // Each page of openings covers 14 days from `from` (the business's local date).
  const [from, setFrom] = useState<string | null>(null);

  const slots = useAvailableSlots(business.slug, serviceIds, from);
  const booking = useCreateBooking();

  const chosen = services.filter((s) => serviceIds.includes(s.id));
  const minutes = chosen.reduce((sum, s) => sum + s.duration_minutes, 0);
  const subtotal = chosen.reduce((sum, s) => sum + (s.price_type === 'quote' ? 0 : s.price_cents), 0);
  const deposit = business.accepts_online_payments ? chosen.reduce((sum, s) => sum + s.deposit_cents, 0) : 0;
  const anyEstimate = chosen.some((s) => s.price_type !== 'fixed');

  const slotDays = useSlotDays(slots.data, tz, day);
  const { days } = slotDays;
  const lastDay = days.at(-1)?.[0];

  function toggleService(id: string) {
    setSlot(null);
    setServiceIds((current) =>
      current.includes(id) ? (current.length > 1 ? current.filter((x) => x !== id) : current) : [...current, id],
    );
  }

  function laterOpenings() {
    if (!lastDay) return;
    const next = new Date(`${lastDay}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    setFrom(next.toISOString().slice(0, 10));
    setDay(null);
    setSlot(null);
  }

  function validate() {
    const next: FormErrors = {
      fullName: fullName.trim().length < 2 ? 'Enter your name.' : undefined,
      phone: phone.trim() && !PHONE.test(phone.trim()) ? 'Enter a valid phone number.' : undefined,
      line1: address.line1.trim().length < 3 ? 'Enter the service address.' : undefined,
    };
    setErrors(next);
    return !next.fullName && !next.phone && !next.line1;
  }

  function submit() {
    if (!slot || !validate()) return;
    booking.mutate(
      {
        slug: business.slug,
        serviceIds,
        start: slot.slot_start,
        customer: { fullName: fullName.trim(), phone: phone.trim() },
        address: {
          line1: address.line1.trim(),
          line2: address.line2.trim(),
          city: address.city.trim(),
          region: address.region.trim(),
          postalCode: address.postal_code.trim(),
        },
        notes: notes.trim(),
      },
      {
        onSuccess: async ({ booking: created, manageUrl }) => {
          // A deposit is paid on the booking's web page (Stripe), then they come back.
          if (created?.status === 'pending_payment') await WebBrowser.openBrowserAsync(manageUrl);
          router.replace({ pathname: '/job/[id]', params: { id: created?.id ?? '', booked: '1' } });
        },
        onError: (error) => {
          // The slot went while they were filling in the form: show fresh times.
          if (error instanceof ApiError && error.code === 'slot_unavailable') {
            setSlot(null);
            slots.refetch();
          }
        },
      },
    );
  }

  const cta = !signedIn
    ? 'Sign in to book'
    : !slot
      ? 'Pick a time'
      : deposit > 0
        ? `Book & pay ${formatCents(deposit, business.currency)} deposit`
        : 'Book this time';

  return (
    <Screen
      edges={[]}
      footer={
        <View style={styles.footer}>
          {slot ? (
            <Text variant="small" tone="soft" align="center">
              {formatShortDate(slot.slot_start, tz)} at {formatTime(slot.slot_start, tz)} · {formatDuration(minutes)}
            </Text>
          ) : null}
          {signedIn ? (
            <Button size="lg" block icon={CalendarCheck} disabled={!slot} loading={booking.isPending} onPress={submit}>
              {cta}
            </Button>
          ) : (
            <Button size="lg" block icon={LogIn} href="/sign-in">
              {cta}
            </Button>
          )}
        </View>
      }
    >
      <View>
        <Text variant="label" tone="brand">
          {business.name}
        </Text>
        <Text variant="heading">Book a visit</Text>
      </View>

      <View role="radiogroup" aria-label="Services">
        <SectionHeader title="1. Pick a service" />
        <View style={styles.stack}>
          {services.map((service) => (
            <OptionCard
              key={service.id}
              title={service.name}
              description={service.description}
              meta={formatDuration(service.duration_minutes)}
              value={formatServicePrice(service, business.currency)}
              selected={serviceIds.includes(service.id)}
              onPress={() => toggleService(service.id)}
            />
          ))}
        </View>
      </View>

      <View>
        <SectionHeader title="2. Pick a time" />
        {slots.isPending ? (
          <View style={styles.slotsLoading}>
            <ActivityIndicator color={colors.brand600} />
          </View>
        ) : slots.isError ? (
          <LoadError onRetry={slots.refetch} title="Couldn&rsquo;t load open times" />
        ) : days.length === 0 ? (
          <EmptyState
            icon={CalendarX}
            title="No openings in these two weeks"
            action={
              from ? (
                <Button variant="secondary" onPress={() => setFrom(null)}>
                  Back to the soonest
                </Button>
              ) : undefined
            }
          >
            Try fewer services, or call the business to fit you in.
          </EmptyState>
        ) : (
          <View style={styles.stack}>
            <SlotPicker
              {...slotDays}
              tz={tz}
              slot={slot}
              onDay={(key) => {
                setDay(key);
                setSlot(null);
              }}
              onSlot={setSlot}
              moreDays={
                <Chip icon={ChevronRight} onPress={laterOpenings} aria-label="Later dates">
                  Later
                </Chip>
              }
            />
            {tz !== Intl.DateTimeFormat().resolvedOptions().timeZone ? (
              <Text variant="caption" tone="faint">
                Times are in {business.name}&rsquo;s time zone ({tz.replaceAll('_', ' ')}).
              </Text>
            ) : null}
          </View>
        )}
      </View>

      {signedIn ? (
        <>
          <View style={styles.stack}>
            <SectionHeader title="3. Your details" />
            <TextField
              label="Full name"
              value={fullName}
              onChangeText={setFullName}
              autoComplete="name"
              textContentType="name"
              error={errors.fullName}
            />
            <TextField
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              hint="Optional. So the crew can reach you on the day."
              error={errors.phone}
            />
          </View>

          <View style={styles.stack}>
            <SectionHeader title="4. Where" />
            <AddressFields value={address} onChange={setAddress} error={errors.line1} />
          </View>

          <View>
            <SectionHeader title="5. Anything we should know?" />
            <TextField
              value={notes}
              onChangeText={setNotes}
              placeholder="Gate codes, pets, where to park…"
              multiline
              maxLength={2000}
              hint="Optional. Only the business sees this."
              aria-label="Notes for the business"
            />
          </View>
        </>
      ) : (
        <FormMessage tone="info">
          Sign in with your email to book. It takes a few seconds, and your bookings stay in the app.
        </FormMessage>
      )}

      <Card>
        <Text variant="label">Summary</Text>
        <View style={styles.summary}>
          {chosen.map((s) => (
            <View key={s.id} style={styles.summaryRow}>
              <Text variant="small" style={styles.flex}>
                {s.name}
              </Text>
              <Text variant="smallStrong">{formatServicePrice(s, business.currency)}</Text>
            </View>
          ))}
          <Divider />
          <View style={styles.summaryRow}>
            <Text variant="bodyStrong" style={styles.flex}>
              {anyEstimate ? 'Estimated total' : 'Total'}
            </Text>
            <Text variant="subheading">
              {subtotal === 0 && anyEstimate ? 'Quote' : formatCents(subtotal, business.currency)}
            </Text>
          </View>
          {deposit > 0 ? (
            <View style={styles.summaryRow}>
              <Text variant="small" tone="soft" style={styles.flex}>
                Deposit due now
              </Text>
              <Text variant="smallStrong">{formatCents(deposit, business.currency)}</Text>
            </View>
          ) : null}
          {deposit > 0 ? (
            <Text variant="caption" tone="faint">
              You&rsquo;ll pay the deposit securely on the next screen. We hold your time for 30 minutes.
            </Text>
          ) : business.accepts_online_payments ? null : (
            <Text variant="caption" tone="faint">
              Pay {business.name} directly on the day.
            </Text>
          )}
        </View>
      </Card>

      {booking.isError ? <FormMessage tone="error">{booking.error.message}</FormMessage> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: {
    gap: space[2],
  },
  stack: {
    gap: space[3],
  },
  slotsLoading: {
    paddingVertical: space[8],
    alignItems: 'center',
  },
  summary: {
    marginTop: space[3],
    gap: space[2.5],
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  flex: {
    flex: 1,
  },
});
