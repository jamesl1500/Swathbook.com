import { router } from 'expo-router';
import { ChevronRight, MapPin } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Avatar, Badge, colors, PressableCard, space, Text } from '@/design-system';
import type { BusinessSummary } from '@/data/types';
import { assetUrl } from '@/lib/config';
import { formatCents } from '@/lib/format';
import { tradeName } from '@/lib/trades';

/** A business in search results. */
export function BusinessCard({ business }: { business: BusinessSummary }) {
  return (
    <PressableCard
      onPress={() => router.push({ pathname: '/business/[slug]', params: { slug: business.slug } })}
      aria-label={`${business.name}, ${tradeName(business.trade)}`}
      style={styles.card}
    >
      <Avatar name={business.name} color={business.brand_color} imageUri={assetUrl(business.logo_path)} />
      <View style={styles.body}>
        <Text variant="subheading" numberOfLines={1}>
          {business.name}
        </Text>
        <Text variant="small" tone="soft" numberOfLines={1}>
          {tradeName(business.trade)}
          {business.from_price_cents != null ? ` · from ${formatCents(business.from_price_cents)}` : ''}
        </Text>
        {business.service_area ? (
          <View style={styles.area}>
            <MapPin size={13} color={colors.inkFaint} aria-hidden />
            <Text variant="caption" tone="faint" numberOfLines={1} style={styles.areaText}>
              {business.service_area}
            </Text>
          </View>
        ) : null}
        {business.accepts_online_payments ? null : (
          <Badge tone="neutral" style={styles.badge}>
            Pay on site
          </Badge>
        )}
      </View>
      <ChevronRight size={20} color={colors.inkFaint} aria-hidden />
    </PressableCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3.5],
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: space[0.5],
  },
  area: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
  },
  areaText: {
    flex: 1,
  },
  badge: {
    marginTop: space[1.5],
  },
});
