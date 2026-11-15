import { Button, Chip, colors, EmptyState, maxContentWidth, PageHeader, SearchField, space, Text } from '@swathbook/mobile/design-system';
import { LoadError, Loading } from '@swathbook/mobile/query-state';
import { useDebouncedValue } from '@swathbook/mobile/use-debounced-value';
import { useLocalSearchParams } from 'expo-router';
import { ClipboardList, SearchX } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JobRow } from '@/components/job-row';
import { useRunStep } from '@/components/use-run-step';
import { useBookingCounts, useBookingList, type BookingRow } from '@/data/api';
import { useActiveBusiness } from '@/data/business';
import { BOOKING_VIEWS, isBookingView, type BookingView } from '@/lib/booking-views';
import { jobSteps } from '@/lib/job-rules';

/**
 * Every booking, by view (Upcoming, Requests, Cancel requests, Awaiting
 * deposit, Past), with search. A FlatList that loads pages as you scroll, so
 * years of history stay quick. Requests can be answered right from the list.
 */
export default function BookingsScreen() {
  const params = useLocalSearchParams<{ view?: string }>();
  const { business, canManage } = useActiveBusiness();
  const views = BOOKING_VIEWS.filter((view) => canManage || !view.managersOnly);
  // Opened from Today's "Needs your attention": go to that view, even if this tab was already open.
  const [view, setView] = useState<BookingView>(isBookingView(params.view) ? params.view : 'upcoming');
  const [lastParam, setLastParam] = useState(params.view);
  if (params.view !== lastParam) {
    setLastParam(params.view);
    if (isBookingView(params.view)) setView(params.view);
  }
  const [query, setQuery] = useState('');
  const search = useDebouncedValue(query, 300);
  const memberId = canManage ? null : business.memberId;

  const counts = useBookingCounts(business.id);
  const list = useBookingList(business.id, view, search, memberId);
  const { run, pending } = useRunStep(business.id);
  const rows = list.data?.pages.flat() ?? [];
  const total = Number(rows[0]?.total_count ?? 0);
  const current = views.find((item) => item.id === view) ?? views[0];

  function requestActions(job: BookingRow) {
    if (view !== 'requests' || !canManage) return null;
    const steps = jobSteps({ status: job.status, customerName: job.customer_name, started: false, cancelRequested: false }, { canManage, canWork: true });
    const accept = steps.primary.find((step) => step.key === 'accept');
    const decline = steps.more.find((step) => step.key === 'decline');
    return (
      <View style={styles.decision}>
        {accept ? (
          <Button size="sm" loading={pending} onPress={() => run(job.id, accept)} style={styles.flex} aria-label={`Accept ${job.customer_name}'s request`}>
            Accept
          </Button>
        ) : null}
        {decline ? (
          <Button size="sm" variant="secondary" disabled={pending} onPress={() => run(job.id, decline)} style={styles.flex} aria-label={`Decline ${job.customer_name}'s request`}>
            Decline
          </Button>
        ) : null}
      </View>
    );
  }

  const header = (
    <View style={styles.header}>
      <PageHeader eyebrow={business.name} title="Bookings" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} role="radiogroup" aria-label="Booking views">
        {views.map((item) => {
          const count = item.countKey ? (counts.data as Record<string, number> | undefined)?.[item.countKey] : undefined;
          return (
            <Chip key={item.id} selected={item.id === view} onPress={() => setView(item.id)}>
              {count ? `${item.label} · ${count}` : item.label}
            </Chip>
          );
        })}
      </ScrollView>
      <SearchField value={query} onChangeText={setQuery} placeholder="Name, phone, email or #ref" />
      {rows.length ? (
        <Text variant="label" role="status" aria-live="polite">
          {total === 1 ? '1 booking' : `${total} bookings`}
        </Text>
      ) : null}
    </View>
  );

  let empty;
  if (list.isPending) empty = <Loading />;
  else if (list.isError) empty = <LoadError onRetry={list.refetch} />;
  else if (search) empty = <EmptyState icon={SearchX} title="No matches">Try a name, phone number, email or booking reference.</EmptyState>;
  else empty = <EmptyState icon={ClipboardList} title={`No ${current.label.toLowerCase()}`}>{current.empty}</EmptyState>;

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <FlatList
        data={list.isPending ? [] : rows}
        keyExtractor={(job) => job.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <JobRow job={item} timeZone={business.timezone} />
            {requestActions(item)}
          </View>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          list.hasNextPage ? (
            <Button variant="secondary" block loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} style={styles.more}>
              Show more
            </Button>
          ) : undefined
        }
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching && !list.isFetchingNextPage}
            onRefresh={() => {
              void list.refetch();
              void counts.refetch();
            }}
            tintColor={colors.brand600}
          />
        }
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews
      />
    </SafeAreaView>
  );
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
    gap: space[4],
    marginBottom: space[4],
  },
  chips: {
    gap: space[2],
    paddingRight: space[4],
  },
  item: {
    gap: space[2],
    marginBottom: space[3],
  },
  decision: {
    flexDirection: 'row',
    gap: space[2],
  },
  flex: {
    flex: 1,
  },
  more: {
    marginTop: space[2],
  },
});
