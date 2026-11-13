import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { CalendarCheck, Globe, Mail, MapPin, Phone, SearchX } from 'lucide-react-native';
import { Linking, StyleSheet, View } from 'react-native';

import { Loading, LoadError } from '@/components/query-state';
import { useBookingPage } from '@/data/api';
import type { BookingPage, RefundPolicy } from '@/data/types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardTitle,
  colors,
  Divider,
  EmptyState,
  MapGrid,
  Screen,
  space,
  Text,
} from '@/design-system';
import { assetUrl } from '@/lib/config';
import { formatClock, formatDuration, formatServicePrice, weekdayNames } from '@/lib/format';
import { tradeName } from '@/lib/trades';

const refundCopy: Record<RefundPolicy, string> = {
  refundable: 'Deposits are always refunded if you cancel.',
  refundable_before_window: 'Deposits are refunded if you cancel in time.',
  non_refundable: 'Deposits are non-refundable.',
};

export default function BusinessScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data: page, isPending, isError, refetch } = useBookingPage(slug);

  if (isPending) return <Loading />;
  if (isError) {
    return (
      <Screen edges={[]}>
        <LoadError onRetry={refetch} />
      </Screen>
    );
  }
  if (!page) {
    return (
      <Screen edges={[]}>
        <EmptyState icon={SearchX} title="Business not found">
          This booking page may have moved or been unpublished.
        </EmptyState>
      </Screen>
    );
  }

  return <Profile page={page} />;
}

function Profile({ page }: { page: BookingPage }) {
  const { business, services, hours } = page;

  return (
    <Screen
      edges={[]}
      padded={false}
      contentStyle={styles.flush}
      footer={
        <Button
          size="lg"
          block
          icon={CalendarCheck}
          href={{ pathname: '/book/[slug]', params: { slug: business.slug } }}
          disabled={services.length === 0}
        >
          Book a time
        </Button>
      }
    >
      <Stack.Screen options={{ title: business.name }} />

      <MapGrid tone="light" style={styles.header}>
        <Avatar name={business.name} color={business.brand_color} imageUri={assetUrl(business.logo_path)} size="xl" />
        <View style={styles.headerText}>
          <Text variant="label" tone="brand">
            {tradeName(business.trade)}
          </Text>
          <Text variant="title">{business.name}</Text>
          {business.service_area ? (
            <View style={styles.area}>
              <MapPin size={15} color={colors.inkSoft} aria-hidden />
              <Text variant="small" tone="soft" style={styles.flex}>
                {business.service_area}
              </Text>
            </View>
          ) : null}
        </View>
      </MapGrid>

      <View style={styles.body}>
        {business.description ? (
          <Text variant="body" tone="soft">
            {business.description}
          </Text>
        ) : null}

        <View style={styles.contact}>
          {business.phone ? (
            <Button variant="secondary" size="sm" icon={Phone} onPress={() => Linking.openURL(`tel:${business.phone}`)}>
              Call
            </Button>
          ) : null}
          {business.email ? (
            <Button variant="secondary" size="sm" icon={Mail} onPress={() => Linking.openURL(`mailto:${business.email}`)}>
              Email
            </Button>
          ) : null}
          {business.website_url ? (
            <Button
              variant="secondary"
              size="sm"
              icon={Globe}
              onPress={() => WebBrowser.openBrowserAsync(business.website_url!)}
            >
              Website
            </Button>
          ) : null}
        </View>

        <Card>
          <CardTitle action={<Badge>{`${services.length} ${services.length === 1 ? 'service' : 'services'}`}</Badge>}>
            Services
          </CardTitle>
          <View>
            {services.map((service, index) => (
              <View key={service.id}>
                {index > 0 ? <Divider style={styles.divider} /> : null}
                <View style={styles.service}>
                  <View style={styles.flex}>
                    <Text variant="bodyStrong">{service.name}</Text>
                    <Text variant="caption" tone="faint">
                      {formatDuration(service.duration_minutes)}
                      {service.deposit_cents > 0 ? ' · deposit to book' : ''}
                    </Text>
                    {service.description ? (
                      <Text variant="small" tone="soft" style={styles.serviceDescription}>
                        {service.description}
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="subheading">{formatServicePrice(service, business.currency)}</Text>
                </View>
              </View>
            ))}
          </View>
        </Card>

        <Card>
          <CardTitle>Hours</CardTitle>
          <View style={styles.hours}>
            {weekdayNames.map((name, weekday) => {
              const day = hours.find((h) => h.weekday === weekday);
              return (
                <View key={name} style={styles.hoursRow}>
                  <Text variant="small" tone={day ? 'ink' : 'faint'}>
                    {name}
                  </Text>
                  <Text variant="small" tone={day ? 'soft' : 'faint'}>
                    {day ? `${formatClock(day.opens_at)} – ${formatClock(day.closes_at)}` : 'Closed'}
                  </Text>
                </View>
              );
            })}
          </View>
        </Card>

        <Card variant="deep">
          <Text variant="label">Good to know</Text>
          <Text variant="small" tone="soft" style={styles.policy}>
            Free cancellation up to {business.cancellation_window_hours} hours before your visit.{' '}
            {services.some((s) => s.deposit_cents > 0) ? refundCopy[business.deposit_refund_policy] : ''}
            {business.accepts_online_payments ? '' : ' Pay the business directly on the day.'}
          </Text>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The map-grid header sits flush under the navigation bar.
  flush: {
    paddingTop: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    paddingHorizontal: space[4],
    paddingVertical: space[6],
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: space[1],
  },
  area: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[1],
    marginTop: space[1],
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  body: {
    paddingHorizontal: space[4],
    gap: space[5],
  },
  contact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  divider: {
    marginVertical: space[3.5],
  },
  service: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
  },
  serviceDescription: {
    marginTop: space[1],
  },
  hours: {
    gap: space[2],
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space[3],
  },
  policy: {
    marginTop: space[1.5],
  },
});
