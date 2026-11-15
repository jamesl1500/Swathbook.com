import { confirm } from '@swathbook/mobile/confirm';
import { colors, ListGroup, ListRow, PageHeader, Screen, SectionHeader, space, Text } from '@swathbook/mobile/design-system';
import * as WebBrowser from 'expo-web-browser';
import { Check, CircleHelp, CreditCard, LayoutDashboard, ListChecks, LogOut, Settings, Store, Users } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { signOut, useAuth } from '@/data/auth';
import { useBusiness } from '@/data/business';
import { webUrl } from '@/lib/config';

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', crew: 'Crew' } as const;

/**
 * Who's signed in, which business is open, and the web dashboard for the
 * rest (services, payouts, billing, team), which open in an in-app browser.
 */
export default function MoreScreen() {
  const { user } = useAuth();
  const { memberships, active, setActive } = useBusiness();
  const canManage = active?.role !== 'crew';
  const open = (path: string) => () => void WebBrowser.openBrowserAsync(webUrl(path));

  return (
    <Screen>
      <PageHeader eyebrow={active?.name} title="More" />

      {memberships.length > 1 ? (
        <View style={styles.stack}>
          <SectionHeader title="Business" />
          <ListGroup>
            {memberships.map((membership) => (
              <ListRow
                key={membership.id}
                icon={Store}
                title={membership.name}
                subtitle={ROLE_LABEL[membership.role]}
                onPress={() => setActive(membership.id)}
                trailing={membership.id === active?.id ? <Check size={20} color={colors.brand600} aria-label="Open now" /> : undefined}
              />
            ))}
          </ListGroup>
        </View>
      ) : null}

      <View style={styles.stack}>
        <SectionHeader title="On the website" />
        <ListGroup>
          <ListRow icon={LayoutDashboard} title="Full dashboard" subtitle="Schedule, routes and customers" onPress={open('/dashboard')} />
          {canManage ? (
            <>
              <ListRow icon={ListChecks} title="Services and prices" onPress={open('/dashboard/services')} />
              <ListRow icon={Users} title="Team" onPress={open('/dashboard/team')} />
              <ListRow icon={CreditCard} title="Payouts and billing" onPress={open('/dashboard/payouts')} />
            </>
          ) : null}
          <ListRow icon={Settings} title="Account settings" onPress={open('/dashboard/account')} />
          <ListRow icon={CircleHelp} title="Help & contact" onPress={open('/contact')} />
        </ListGroup>
      </View>

      <View style={styles.stack}>
        <Text variant="small" tone="soft">
          Signed in as {user?.email}
          {active ? ` · ${ROLE_LABEL[active.role]}` : ''}
        </Text>
        <ListGroup>
          <ListRow
            icon={LogOut}
            title="Sign out"
            destructive
            onPress={async () => {
              if (await confirm({ title: 'Sign out?', message: "You'll need your email and password to sign back in.", confirmLabel: 'Sign out', cancelLabel: 'Stay' })) {
                await signOut();
              }
            }}
          />
        </ListGroup>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space[3],
  },
});
