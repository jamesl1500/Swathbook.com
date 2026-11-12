import { router } from 'expo-router';
import { CalendarCheck, LogIn, Search, UserRoundPen } from 'lucide-react-native';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { BusinessCard } from '@/components/business-card';
import { JobCard } from '@/components/job-card';
import { NextJobHero } from '@/components/next-job-hero';
import { Loading, LoadError } from '@/components/query-state';
import { isUpcoming, useBusinessSearch, useMyBookings, useMyDetails } from '@/data/api';
import { useAuth } from '@/data/auth';
import type { CustomerBooking } from '@/data/types';
import {
  Avatar,
  Button,
  Card,
  colors,
  EmptyState,
  Eyebrow,
  Logo,
  MapGrid,
  radius,
  Rise,
  Screen,
  SectionHeader,
  space,
  Stat,
  Text,
} from '@/design-system';
import { assetUrl } from '@/lib/config';
import { tradeName } from '@/lib/trades';

export default function HomeScreen() {
  const { signedIn } = useAuth();
  return signedIn ? <SignedInHome /> : <WelcomeHome />;
}

function SearchEntry() {
  return (
    <Pressable
      role="link"
      aria-label="Search for a business"
      onPress={() => router.push('/explore')}
      style={({ pressed }) => [styles.search, pressed && styles.searchPressed]}
    >
      <Search size={18} color={colors.inkFaint} aria-hidden />
      <Text tone="faint">Find a pro: lawn care, detailing…</Text>
    </Pressable>
  );
}

/** Businesses you've booked before, most recent first, one entry each. */
function pastBusinesses(bookings: CustomerBooking[]) {
  const seen = new Map<string, CustomerBooking['business']>();
  for (const booking of [...bookings].reverse()) {
    if (booking.business.is_bookable && !seen.has(booking.business.slug)) seen.set(booking.business.slug, booking.business);
  }
  return [...seen.values()];
}

function SignedInHome() {
  const details = useMyDetails();
  const { data: bookings, isPending, isError, refetch, isRefetching } = useMyBookings();
  const firstName = details.data?.full_name?.split(' ')[0];
  const needsSetup = details.data != null && !details.data.onboarded_at;

  const upcoming = bookings?.filter(isUpcoming) ?? [];
  const [next, ...later] = upcoming;
  const businesses = bookings ? pastBusinesses(bookings) : [];

  return (
    <Screen refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.brand600} />}>
      <Logo size={28} />

      <Rise>
        <Text variant="label">Welcome back</Text>
        <Text variant="title">{firstName ? `Hi, ${firstName}` : 'Hi there'}</Text>
      </Rise>

      {needsSetup ? (
        <Card variant="raised" style={styles.setup}>
          <View style={styles.setupText}>
            <Text variant="subheading">Finish setting up</Text>
            <Text variant="small" tone="soft">
              Add your name and home address once, and every booking fills itself in.
            </Text>
          </View>
          <Button size="sm" icon={UserRoundPen} href="/setup">
            Set up
          </Button>
        </Card>
      ) : null}

      <SearchEntry />

      {isPending ? (
        <Loading />
      ) : isError ? (
        <LoadError onRetry={refetch} />
      ) : (
        <>
          {next ? (
            <Rise delay={80}>
              <NextJobHero booking={next} />
            </Rise>
          ) : (
            <EmptyState
              icon={CalendarCheck}
              title="Nothing booked yet"
              action={
                <Button href="/explore" icon={Search}>
                  Find a business
                </Button>
              }
            >
              Book a local pro and your visits show up here. Bookings you made on the web with this email appear too.
            </EmptyState>
          )}

          <Rise delay={160} style={styles.stats}>
            <Stat label="Upcoming" value={upcoming.length} />
            <Stat label="Pros used" value={businesses.length} />
          </Rise>

          {later.length > 0 ? (
            <View>
              <SectionHeader
                title="Also coming up"
                action={
                  <Button variant="ghost" size="sm" href="/jobs">
                    See all
                  </Button>
                }
              />
              <View style={styles.list}>
                {later.slice(0, 3).map((booking) => (
                  <JobCard key={booking.id} booking={booking} />
                ))}
              </View>
            </View>
          ) : null}

          {businesses.length > 0 ? (
            <View>
              <SectionHeader title="Book again" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.again}>
                {businesses.map((business) => (
                  <Pressable
                    key={business.slug}
                    role="link"
                    aria-label={`Book ${business.name} again`}
                    onPress={() => router.push({ pathname: '/business/[slug]', params: { slug: business.slug } })}
                    style={({ pressed }) => [styles.againCard, pressed && styles.againPressed]}
                  >
                    <Avatar name={business.name} color={business.brand_color} imageUri={assetUrl(business.logo_path)} size="sm" />
                    <Text variant="smallStrong" numberOfLines={2}>
                      {business.name}
                    </Text>
                    <Text variant="caption" tone="faint" numberOfLines={1}>
                      {tradeName(business.trade)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function WelcomeHome() {
  const featured = useBusinessSearch('', null);
  const businesses = featured.data?.pages[0]?.slice(0, 4) ?? [];

  return (
    <Screen>
      <Logo size={28} />

      <Rise>
        <MapGrid style={styles.welcome}>
          <Eyebrow tone="sky">Book local pros</Eyebrow>
          <Text variant="display" tone="paper">
            Book the job in a minute.
          </Text>
          <Text tone="sky">
            Lawn care, detailing, cleaning and more from businesses near you. See open times, book, and keep every visit in one place.
          </Text>
          <View style={styles.welcomeActions}>
            <Button variant="accent" icon={Search} href="/explore" block>
              Find a business
            </Button>
            <Button variant="inverse" icon={LogIn} href="/sign-in" block>
              Sign in
            </Button>
          </View>
        </MapGrid>
      </Rise>

      <SearchEntry />

      {businesses.length > 0 ? (
        <View>
          <SectionHeader
            title="On Swathbook"
            action={
              <Button variant="ghost" size="sm" href="/explore">
                See all
              </Button>
            }
          />
          <View style={styles.list}>
            {businesses.map((business) => (
              <BusinessCard key={business.id} business={business} />
            ))}
          </View>
        </View>
      ) : featured.isPending ? (
        <Loading />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2.5],
    minHeight: 48,
    paddingHorizontal: space[4],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.card,
  },
  searchPressed: {
    backgroundColor: colors.paperDeep,
  },
  setup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    borderColor: colors.sun,
  },
  setupText: {
    flex: 1,
    minWidth: 0,
    gap: space[0.5],
  },
  welcome: {
    borderRadius: radius.sheet,
    padding: space[6],
    gap: space[3],
  },
  welcomeActions: {
    gap: space[2.5],
    marginTop: space[3],
  },
  stats: {
    flexDirection: 'row',
    gap: space[3],
  },
  list: {
    gap: space[3],
  },
  again: {
    gap: space[3],
    paddingRight: space[4],
  },
  againCard: {
    width: 140,
    gap: space[1.5],
    padding: space[3.5],
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  againPressed: {
    backgroundColor: colors.white,
    borderColor: colors.lineStrong,
  },
});
