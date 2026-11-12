import { SearchX } from 'lucide-react-native';
import { useDeferredValue, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BusinessCard } from '@/components/business-card';
import { Loading, LoadError } from '@/components/query-state';
import { useBusinessSearch, useTrades } from '@/data/api';
import { Button, Chip, EmptyState, PageHeader, Screen, SearchField, space, Text } from '@/design-system';
import { tradeName } from '@/lib/trades';

export default function ExploreScreen() {
  const [query, setQuery] = useState('');
  const [trade, setTrade] = useState<string | null>(null);
  // Don't query on every keystroke while typing fast.
  const deferredQuery = useDeferredValue(query);
  const trades = useTrades();
  const search = useBusinessSearch(deferredQuery, trade);
  const results = search.data?.pages.flat() ?? [];
  const total = Number(results[0]?.total_count ?? 0);

  return (
    <Screen>
      <PageHeader eyebrow="Explore" title="Find a pro" description="Local businesses on Swathbook you can book online." />

      <View style={styles.filters}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Search businesses, services or towns" />
        {trades.data && trades.data.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip selected={trade === null} onPress={() => setTrade(null)}>
              All
            </Chip>
            {trades.data.map(({ trade: id }) => (
              <Chip key={id} selected={trade === id} onPress={() => setTrade(trade === id ? null : id)}>
                {tradeName(id)}
              </Chip>
            ))}
          </ScrollView>
        ) : null}
      </View>

      {search.isPending ? (
        <Loading label="Searching" />
      ) : search.isError ? (
        <LoadError onRetry={search.refetch} />
      ) : results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No matches"
          action={
            query || trade ? (
              <Button
                variant="secondary"
                onPress={() => {
                  setQuery('');
                  setTrade(null);
                }}
              >
                Clear search
              </Button>
            ) : undefined
          }
        >
          {query || trade
            ? 'Try a different trade, or search by service or town, like “mowing” or “Austin”.'
            : 'No businesses are taking bookings yet. Check back soon.'}
        </EmptyState>
      ) : (
        <View style={styles.results}>
          <Text variant="label" role="status" aria-live="polite">
            {total} {total === 1 ? 'business' : 'businesses'}
          </Text>
          {results.map((business) => (
            <BusinessCard key={business.id} business={business} />
          ))}
          {search.hasNextPage ? (
            <Button variant="secondary" block loading={search.isFetchingNextPage} onPress={() => search.fetchNextPage()}>
              Show more
            </Button>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: {
    gap: space[3],
  },
  chips: {
    gap: space[2],
    paddingRight: space[4],
  },
  results: {
    gap: space[3],
  },
});
