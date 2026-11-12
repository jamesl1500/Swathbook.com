import type { BottomTabBarProps } from 'expo-router/js-tabs';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { colors, fonts, maxContentWidth, radius, space } from '../tokens';

export type TabBarProps = BottomTabBarProps & {
  /** Icon per route name. Labels come from each screen's `title`. */
  icons: Record<string, LucideIcon>;
};

/**
 * The bottom tab bar from the website's phone dashboard: a card-colored bar
 * over a hairline, navy for the open tab, soft ink for the rest.
 *
 * Use with `<Tabs tabBar={(props) => <TabBar {...props} icons={…} />}>` from
 * `expo-router/js-tabs`.
 */
export function TabBar({ state, descriptors, emitter, navigateToTab, insets, icons }: TabBarProps) {
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      <View role="tablist" style={styles.row}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = index === state.index;
          const label = options.title ?? route.name;
          const Icon = icons[route.name];
          const color = focused ? colors.brand600 : colors.inkSoft;
          const badge = options.tabBarBadge;

          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };

          return (
            <Pressable
              key={route.key}
              role="tab"
              aria-selected={focused}
              aria-label={options.tabBarAccessibilityLabel ?? (badge != null ? `${label}, ${badge} new` : label)}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            >
              <View>
                {Icon ? <Icon size={22} color={color} strokeWidth={focused ? 2.5 : 2} aria-hidden /> : null}
                {badge != null ? (
                  <View style={styles.badge} aria-hidden>
                    <RNText style={styles.badgeText}>{badge}</RNText>
                  </View>
                ) : null}
              </View>
              <RNText style={[styles.label, { color }]} numberOfLines={1}>
                {label}
              </RNText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: 'rgba(255, 253, 250, 0.97)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  row: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
  },
  item: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[1],
    paddingTop: space[1],
  },
  itemPressed: {
    opacity: 0.7,
  },
  label: {
    fontFamily: fonts.sans.semibold,
    fontSize: 11.5,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: radius.full,
    backgroundColor: colors.sun,
    borderWidth: 2,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: fonts.sans.bold,
    fontSize: 10,
    color: colors.ink,
  },
});
