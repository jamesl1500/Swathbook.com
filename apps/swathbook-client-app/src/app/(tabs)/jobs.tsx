import { CalendarCheck, History, Search } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JobCard } from '@/components/job-card';
import { Loading, LoadError } from '@swathbook/mobile/query-state';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { isUpcoming, useMyBookings } from '@/data/api';
import { useAuth } from '@/data/auth';
import type { CustomerBooking } from '@/data/types';
import { Button, colors, EmptyState, maxContentWidth, PageHeader, Screen, SegmentedTabs, space } from '@swathbook/mobile/design-system';

type JobsView = 'upcoming' | 'past';

export default function JobsScreen() {
  const { signedIn } = useAuth();
  const [view, setView] = useState<JobsView>('upcoming');
  const { data: bookings, isPending, isError, refetch, isRefetching } = useMyBookings();

  if (!signedIn) {
    return (
      <Screen>
        <PageHeader eyebrow="Your bookings" title="My jobs" />
        <SignInPrompt icon={CalendarCheck} title="See every visit in one place">
          Sign in with the email you book with. Bookings you&rsquo;ve already made with it show up here.
        </SignInPrompt>
      </Screen>
    );
  }

  // Bookings arrive oldest first: upcoming reads soonest first, past newest first.
  const upcoming: CustomerBooking[] = [];
  const past: CustomerBooking[] = [];
  for (const booking of bookings ?? []) (isUpcoming(booking) ? upcoming : past).push(booking);
  past.reverse();
  const shown = view === 'upcoming' ? upcoming : past;

  let empty;
  if (isPending) empty = <Loading />;
  else if (isError) empty = <LoadError onRetry={refetch} />;
  else if (view === 'upcoming') {
    empty = (
      <EmptyState
        icon={CalendarCheck}
        title="No upcoming jobs"
        action={
          <Button href="/explore" icon={Search}>
            Find a business
          </Button>
        }
      >
        When you book a visit it shows up here.
      </EmptyState>
    );
  } else {
    empty = (
      <EmptyState icon={History} title="No past jobs yet">
        Finished and cancelled jobs will show up here.
      </EmptyState>
    );
  }

  // A FlatList rather than a ScrollView: years of past visits only render
  // the cards on screen.
  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <FlatList
        data={isPending || isError ? [] : shown}
        keyExtractor={(booking) => booking.id}
        renderItem={({ item }) => <JobCard booking={item} />}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader eyebrow="Your bookings" title="My jobs" description="Every visit you've booked, at every business." />
            <SegmentedTabs<JobsView>
              label="Jobs"
              value={view}
              onChange={setView}
              items={[
                { id: 'upcoming', label: 'Upcoming', badge: bookings ? upcoming.length : undefined },
                { id: 'past', label: 'Past' },
              ]}
            />
          </View>
        }
        ListEmptyComponent={empty}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.brand600} />}
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews
      />
    </SafeAreaView>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  content: {
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: space[4],
    paddingTop: space[4],
    paddingBottom: space[10],
  },
  header: {
    gap: space[6],
    marginBottom: space[6],
  },
  separator: {
    height: space[3],
  },
});
