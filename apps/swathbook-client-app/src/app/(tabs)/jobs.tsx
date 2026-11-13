import { CalendarCheck, History, Search } from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { JobCard } from '@/components/job-card';
import { Loading, LoadError } from '@/components/query-state';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { isUpcoming, useMyBookings } from '@/data/api';
import { useAuth } from '@/data/auth';
import { Button, colors, EmptyState, PageHeader, Screen, SegmentedTabs, space } from '@/design-system';

type JobsView = 'upcoming' | 'past';

export default function JobsScreen() {
  const { signedIn } = useAuth();
  const [view, setView] = useState<JobsView>('upcoming');
  const { data: bookings, isPending, isError, refetch, isRefetching } = useMyBookings();

  const upcoming = bookings?.filter(isUpcoming) ?? [];
  // Past: newest first.
  const past = (bookings?.filter((booking) => !isUpcoming(booking)) ?? []).reverse();
  const shown = view === 'upcoming' ? upcoming : past;

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

  return (
    <Screen refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.brand600} />}>
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

      {isPending ? (
        <Loading />
      ) : isError ? (
        <LoadError onRetry={refetch} />
      ) : shown.length === 0 ? (
        view === 'upcoming' ? (
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
        ) : (
          <EmptyState icon={History} title="No past jobs yet">
            Finished and cancelled jobs will show up here.
          </EmptyState>
        )
      ) : (
        <View style={styles.list}>
          {shown.map((booking) => (
            <JobCard key={booking.id} booking={booking} />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: space[3],
  },
});
