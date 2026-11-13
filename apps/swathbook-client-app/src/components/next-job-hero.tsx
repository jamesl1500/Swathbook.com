import { ArrowRight, Clock, MapPin } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Avatar, BrandPin, Button, colors, Eyebrow, MapGrid, radius, shadows, space, Text } from '@/design-system';
import type { CustomerBooking } from '@/data/types';
import { assetUrl } from '@/lib/config';
import { formatRelativeDay, formatTimeRange } from '@/lib/format';

import { formatAddress } from './address';
import { serviceNames } from './job-card';

/** The navy map-grid card at the top of Home: your next visit, at a glance. */
export function NextJobHero({ booking }: { booking: CustomerBooking }) {
  const tz = booking.business.timezone;
  return (
    <MapGrid style={styles.hero}>
      <View style={styles.pin}>
        <BrandPin size={26} />
      </View>
      <Eyebrow tone="sky">Next visit</Eyebrow>
      <Text variant="display" tone="paper" style={styles.when}>
        {formatRelativeDay(booking.scheduled_start, tz)}
      </Text>
      <View style={styles.row}>
        <Clock size={16} color={colors.sky} aria-hidden />
        <Text variant="bodyStrong" tone="paper">
          {formatTimeRange(booking.scheduled_start, booking.scheduled_end, tz)}
        </Text>
      </View>
      {booking.address ? (
        <View style={styles.row}>
          <MapPin size={16} color={colors.sky} aria-hidden />
          <Text variant="small" tone="sky" numberOfLines={1} style={styles.flex}>
            {formatAddress(booking.address)}
          </Text>
        </View>
      ) : null}

      <View style={styles.business}>
        <Avatar
          name={booking.business.name}
          color={booking.business.brand_color}
          imageUri={assetUrl(booking.business.logo_path)}
          size="sm"
        />
        <View style={styles.flex}>
          <Text variant="smallStrong" tone="paper" numberOfLines={1}>
            {serviceNames(booking)}
          </Text>
          <Text variant="caption" tone="sky" numberOfLines={1}>
            {booking.business.name}
          </Text>
        </View>
      </View>

      <Button variant="accent" iconRight={ArrowRight} href={{ pathname: '/job/[id]', params: { id: booking.id } }} block>
        View job
      </Button>
    </MapGrid>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.sheet,
    padding: space[5],
    gap: space[2],
    boxShadow: shadows.lift,
  },
  pin: {
    position: 'absolute',
    top: space[5],
    right: space[5],
  },
  when: {
    marginTop: space[1],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  business: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    marginTop: space[3],
    marginBottom: space[3],
    padding: space[3],
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
});
