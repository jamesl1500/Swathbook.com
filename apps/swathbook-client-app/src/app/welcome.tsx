import { router } from 'expo-router';
import { ArrowRight, CalendarCheck, CalendarClock, LogIn, Search, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { markIntroSeen } from '@/data/intro';
import { BrandPin, Button, colors, Logo, MapGrid, maxContentWidth, PageDots, radius, Rise, space, Text } from '@/design-system';

type Panel = { icon: LucideIcon; eyebrow: string; title: string; body: string };

const panels: Panel[] = [
  {
    icon: Search,
    eyebrow: 'Find',
    title: 'Local pros, real prices.',
    body: 'Lawn care, cleaning, detailing and more from businesses near you. See what each job costs before you book.',
  },
  {
    icon: CalendarCheck,
    eyebrow: 'Book',
    title: 'Booked in under a minute.',
    body: 'Pick a time that’s actually open. If there’s a deposit, pay it securely and your time is held for you.',
  },
  {
    icon: CalendarClock,
    eyebrow: 'Manage',
    title: 'Every visit in one place.',
    body: 'Move or cancel without a phone call. Bookings you’ve already made with your email show up too.',
  },
];

/**
 * First launch: three short panels on what the app does, then sign in or
 * browse. Shown once per device (see data/intro.ts); skipped for anyone
 * already signed in.
 */
export default function WelcomeScreen() {
  const [index, setIndex] = useState(0);
  const panel = panels[index];
  const last = index === panels.length - 1;
  const Icon = panel.icon;

  function browse() {
    markIntroSeen();
    router.replace('/');
  }

  function signIn() {
    markIntroSeen();
    router.replace('/');
    router.push('/sign-in');
  }

  return (
    <MapGrid style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.inner}>
          <View style={styles.top}>
            <Logo tone="paper" size={28} />
            {last ? null : (
              <Button variant="inverse" size="sm" onPress={browse}>
                Skip
              </Button>
            )}
          </View>

          {/* Keyed so each panel rises in as it appears. */}
          <Rise key={index} style={styles.panel}>
            <View style={styles.iconTile}>
              <Icon size={30} color={colors.brand700} strokeWidth={2} aria-hidden />
              <View style={styles.pin}>
                <BrandPin size={18} />
              </View>
            </View>
            <Text variant="label" tone="sky">
              {`${index + 1} · ${panel.eyebrow}`}
            </Text>
            <Text variant="display" tone="paper" role="heading">
              {panel.title}
            </Text>
            <Text tone="sky">{panel.body}</Text>
          </Rise>

          <View style={styles.bottom}>
            <PageDots total={panels.length} current={index} tone="paper" />
            {last ? (
              <View style={styles.actions}>
                <Button variant="accent" size="lg" icon={LogIn} block onPress={signIn}>
                  Sign in or create an account
                </Button>
                <Button variant="inverse" size="lg" icon={Search} block onPress={browse}>
                  Browse first
                </Button>
              </View>
            ) : (
              <View style={styles.actions}>
                <Button variant="accent" size="lg" iconRight={ArrowRight} block onPress={() => setIndex(index + 1)}>
                  Next
                </Button>
                {index > 0 ? (
                  <Button variant="inverse" size="lg" block onPress={() => setIndex(index - 1)}>
                    Back
                  </Button>
                ) : null}
              </View>
            )}
          </View>
        </View>
      </SafeAreaView>
    </MapGrid>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: space[5],
    paddingVertical: space[4],
    justifyContent: 'space-between',
    gap: space[6],
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panel: {
    gap: space[3],
  },
  iconTile: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[3],
  },
  pin: {
    position: 'absolute',
    top: -8,
    right: -6,
  },
  bottom: {
    gap: space[5],
  },
  actions: {
    gap: space[2.5],
  },
});
