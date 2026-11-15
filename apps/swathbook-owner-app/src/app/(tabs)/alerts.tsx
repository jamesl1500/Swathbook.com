import { colors, EmptyState, maxContentWidth, PageHeader, PressableCard, radius, space, Text } from '@swathbook/mobile/design-system';
import { LoadError, Loading } from '@swathbook/mobile/query-state';
import { router, useFocusEffect } from 'expo-router';
import { Bell, CalendarClock, CalendarPlus, CircleCheck, HandCoins, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMarkNotificationsRead, useNotifications } from '@/data/api';
import { useActiveBusiness } from '@/data/business';
import { describeNotification, timeAgo, type NotificationTone } from '@/lib/notifications';

const ICONS: Record<NotificationTone, LucideIcon> = { new: CalendarPlus, money: HandCoins, change: CalendarClock, warning: TriangleAlert, done: CircleCheck };
const TILE: Record<NotificationTone, { bg: string; fg: string }> = {
  new: { bg: colors.brand50, fg: colors.brand700 },
  money: { bg: colors.brand50, fg: colors.brand700 },
  change: { bg: colors.paperDeep, fg: colors.inkSoft },
  warning: { bg: colors.sunSoft, fg: colors.ink },
  done: { bg: colors.paperDeep, fg: colors.inkSoft },
};

/**
 * What changed on the business's jobs: new bookings, payments, reschedules,
 * cancellations. Opening the tab catches up (clears the badge); new items keep
 * their dot until the next refresh so you can see what was new.
 */
export default function AlertsScreen() {
  const { business } = useActiveBusiness();
  const feed = useNotifications(business.id);
  const markRead = useMarkNotificationsRead(business.id);
  const unread = feed.data?.unread ?? 0;

  useFocusEffect(
    useCallback(() => {
      if (unread > 0 && !markRead.isPending) markRead.mutate();
    }, [unread, markRead]),
  );

  const items = feed.data?.items ?? [];

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<PageHeader eyebrow={business.name} title="Alerts" description="New bookings, payments and changes, as they happen." style={styles.header} />}
        ListEmptyComponent={
          feed.isPending ? (
            <Loading />
          ) : feed.isError ? (
            <LoadError onRetry={feed.refetch} />
          ) : (
            <EmptyState icon={Bell} title="You're all caught up">
              When customers book, pay, move or cancel, it shows up here.
            </EmptyState>
          )
        }
        renderItem={({ item }) => {
          const described = describeNotification(item, business.timezone, business.currency);
          const Icon = ICONS[described.tone];
          return (
            <PressableCard
              onPress={() => router.push({ pathname: '/job/[id]', params: { id: item.booking_id } })}
              style={styles.item}
              aria-label={`${item.unread ? 'New: ' : ''}${described.title}. ${described.body}`}
            >
              <View style={[styles.tile, { backgroundColor: TILE[described.tone].bg }]} aria-hidden>
                <Icon size={18} color={TILE[described.tone].fg} />
              </View>
              <View style={styles.body}>
                <Text variant="bodyStrong">{described.title}</Text>
                <Text variant="small" tone="soft" numberOfLines={2}>
                  {described.body}
                </Text>
              </View>
              <View style={styles.meta}>
                <Text variant="caption" tone="faint">
                  {timeAgo(item.created_at)}
                </Text>
                {item.unread ? <View style={styles.dot} aria-hidden /> : null}
              </View>
            </PressableCard>
          );
        }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => void feed.refetch()} tintColor={colors.brand600} />}
        initialNumToRender={10}
        windowSize={7}
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
    gap: space[3],
  },
  header: {
    marginBottom: space[3],
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
  },
  tile: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: space[0.5],
  },
  meta: {
    alignItems: 'flex-end',
    gap: space[1.5],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.clay,
  },
});
