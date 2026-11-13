import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { CalendarDays, CircleUser, House, Search } from 'lucide-react-native';

import { useAuth } from '@/data/auth';
import { useIntroState } from '@/data/intro';
import { TabBar } from '@/design-system';

const icons = { index: House, explore: Search, jobs: CalendarDays, account: CircleUser };

/**
 * The four tabs. JS tabs (not native tabs) so the bar looks the same on iOS,
 * Android and web: it's the design system's TabBar.
 *
 * First launch goes to the welcome intro instead, unless they're already
 * signed in (e.g. upgrading from a version without the intro).
 */
export default function TabsLayout() {
  const { signedIn } = useAuth();
  const intro = useIntroState();
  if (!intro.seen && !signedIn) return <Redirect href="/welcome" />;

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} icons={icons} />}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
      <Tabs.Screen name="jobs" options={{ title: 'My jobs' }} />
      <Tabs.Screen name="account" options={{ title: 'Account' }} />
    </Tabs>
  );
}
