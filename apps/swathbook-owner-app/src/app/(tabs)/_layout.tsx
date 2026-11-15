import { TabBar } from '@swathbook/mobile/design-system';
import { Tabs } from 'expo-router/js-tabs';
import { Bell, CalendarDays, ClipboardList, Menu } from 'lucide-react-native';

import { useNotifications } from '@/data/api';
import { useActiveBusiness } from '@/data/business';

const icons = { index: CalendarDays, bookings: ClipboardList, alerts: Bell, more: Menu };

/**
 * Four tabs, in the design system's TabBar so they look the same on iOS,
 * Android and web. Alerts carries the unread count (kept live by Realtime).
 */
export default function TabsLayout() {
  const { business } = useActiveBusiness();
  const unread = useNotifications(business.id).data?.unread ?? 0;

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} icons={icons} />}>
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings' }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts', tabBarBadge: unread ? (unread > 99 ? '99+' : unread) : undefined }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}
