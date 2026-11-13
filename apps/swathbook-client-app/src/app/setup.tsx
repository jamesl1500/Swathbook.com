import { router, Stack } from 'expo-router';
import { ArrowRight, CalendarCheck, PartyPopper, Phone, Search, User } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AddressFields, toAddressValue, type AddressValue } from '@/components/address-fields';
import { Loading } from '@/components/query-state';
import { useFinishMySetup, useMyDetails, useSaveMyDetails } from '@/data/api';
import type { MyDetails } from '@/data/types';
import { Button, colors, FormMessage, MapGrid, radius, Rise, Screen, space, StepProgress, Text, TextField } from '@/design-system';

const PHONE = /^\+?[0-9 ().-]{7,20}$/;

/** Leave setup and go back to wherever they were (e.g. a booking in progress). */
function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * Account setup, right after a customer's first sign-in: who they are, where
 * they usually need work done, then a welcome that tells them what we
 * already found. Everything after the name is optional, and "Skip for now"
 * works from any step. Opened from sign-in, or from the Home reminder.
 */
export default function SetupScreen() {
  const details = useMyDetails();
  if (details.isPending) return <Loading />;
  return <Setup initial={details.data ?? null} />;
}

function Setup({ initial }: { initial: MyDetails | null }) {
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState(initial?.full_name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [address, setAddress] = useState<AddressValue>(toAddressValue(initial?.address));
  const [errors, setErrors] = useState<{ fullName?: string; phone?: string; line1?: string }>({});
  const save = useSaveMyDetails();
  const skip = useFinishMySetup();
  const saved = save.data ?? initial;

  function skipSetup() {
    skip.mutate(undefined, { onSettled: close });
  }

  function aboutYouNext() {
    const next = {
      fullName: fullName.trim().length < 2 ? 'Enter your name.' : undefined,
      phone: phone.trim() && !PHONE.test(phone.trim()) ? 'Enter a valid phone number.' : undefined,
    };
    setErrors(next);
    if (!next.fullName && !next.phone) setStep(1);
  }

  function finish(withAddress: boolean) {
    if (withAddress && address.line1.trim() && address.line1.trim().length < 3) {
      setErrors({ line1: 'Enter a street address, or skip this step.' });
      return;
    }
    setErrors({});
    save.mutate(
      {
        fullName: fullName.trim(),
        phone: phone.trim(),
        address: withAddress && address.line1.trim() ? address : undefined,
        finishSetup: true,
      },
      { onSuccess: () => setStep(2) },
    );
  }

  return (
    <Screen
      edges={['bottom']}
      footer={
        step === 0 ? (
          <Button size="lg" block iconRight={ArrowRight} onPress={aboutYouNext}>
            Next
          </Button>
        ) : step === 1 ? (
          <View style={styles.footer}>
            <Button size="lg" block loading={save.isPending} onPress={() => finish(true)}>
              {address.line1.trim() ? 'Save and finish' : 'Finish'}
            </Button>
            {address.line1.trim() ? (
              <Button variant="ghost" block disabled={save.isPending} onPress={() => finish(false)}>
                I&rsquo;ll add it when I book
              </Button>
            ) : null}
          </View>
        ) : (
          <View style={styles.footer}>
            {(saved?.booking_count ?? 0) > 0 ? (
              <Button size="lg" block icon={CalendarCheck} onPress={() => router.dismissTo('/jobs')}>
                See my jobs
              </Button>
            ) : null}
            <Button size="lg" block variant={(saved?.booking_count ?? 0) > 0 ? 'secondary' : 'primary'} onPress={close}>
              Done
            </Button>
          </View>
        )
      }
    >
      <Stack.Screen
        options={{
          // Gestures would dismiss half-way; "Skip for now" is the way out.
          gestureEnabled: false,
          headerRight: () =>
            step < 2 ? (
              <Button variant="ghost" size="sm" loading={skip.isPending} onPress={skipSetup}>
                Skip for now
              </Button>
            ) : null,
        }}
      />

      {step < 2 ? <StepProgress total={2} current={step} /> : null}

      {step === 0 ? (
        <Rise key="about" style={styles.step}>
          <View style={styles.intro}>
            <Text variant="title">What should we call you?</Text>
            <Text tone="soft">Businesses see your name and phone when you book, so they know who&rsquo;s at the door.</Text>
          </View>
          <TextField
            label="Full name"
            icon={User}
            value={fullName}
            onChangeText={setFullName}
            autoComplete="name"
            textContentType="name"
            autoFocus={!fullName}
            error={errors.fullName}
          />
          <TextField
            label="Phone"
            icon={Phone}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            hint="Optional. So the crew can reach you on the day."
            error={errors.phone}
          />
        </Rise>
      ) : step === 1 ? (
        <Rise key="home" style={styles.step}>
          <View style={styles.intro}>
            <Text variant="title">Where do you need work done?</Text>
            <Text tone="soft">
              We&rsquo;ll fill it in when you book. Only you can see it until you book with a business.
            </Text>
          </View>
          <AddressFields value={address} onChange={setAddress} line1Label="Home street address" error={errors.line1} />
          {save.isError ? <FormMessage tone="error">{save.error.message}</FormMessage> : null}
        </Rise>
      ) : (
        <Rise key="done" style={styles.step}>
          <MapGrid style={styles.done}>
            <View style={styles.doneIcon}>
              <PartyPopper size={28} color={colors.brand700} aria-hidden />
            </View>
            <Text variant="display" tone="paper">
              {`You're all set${saved?.full_name ? `, ${saved.full_name.split(' ')[0]}` : ''}.`}
            </Text>
            <Text tone="sky">
              {(saved?.booking_count ?? 0) > 0
                ? `We found ${saved!.booking_count} ${saved!.booking_count === 1 ? 'booking' : 'bookings'} made with ${saved!.email}. ${saved!.booking_count === 1 ? 'It’s' : 'They’re'} in My jobs.`
                : 'Find a local pro, pick an open time, and your visits show up here.'}
            </Text>
          </MapGrid>
          {(saved?.booking_count ?? 0) === 0 ? (
            <Button variant="secondary" icon={Search} block onPress={() => router.dismissTo('/explore')}>
              Find a pro
            </Button>
          ) : null}
        </Rise>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: {
    gap: space[4],
  },
  intro: {
    gap: space[2],
  },
  footer: {
    gap: space[2],
  },
  done: {
    borderRadius: radius.sheet,
    padding: space[6],
    gap: space[3],
  },
  doneIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[2],
  },
});
