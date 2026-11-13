import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';

import { colors, fonts, radius, space } from '../tokens';

export type SegmentItem<T extends string> = {
  id: T;
  label: string;
  /** A small count next to the label, e.g. 3. */
  badge?: ReactNode;
};

/**
 * Underline tabs, like the website's settings <Tabs>: a row of labels over a
 * hairline, the open one underlined in navy. Scrolls sideways if it's wider
 * than the screen. Controlled: you render the matching content yourself.
 */
export function SegmentedTabs<T extends string>({
  label,
  items,
  value,
  onChange,
}: {
  /** What the tabs switch between, for screen readers. */
  label: string;
  items: SegmentItem<T>[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroller}>
      <View role="tablist" aria-label={label} style={styles.list}>
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <Pressable
              key={item.id}
              role="tab"
              aria-selected={selected}
              onPress={() => onChange(item.id)}
              style={[styles.tab, selected && styles.tabSelected]}
            >
              <RNText style={[styles.tabLabel, { color: selected ? colors.ink : colors.inkSoft }]}>{item.label}</RNText>
              {item.badge != null ? (
                <View style={[styles.badge, { backgroundColor: selected ? colors.brand50 : colors.paperDeep }]}>
                  <RNText style={[styles.badgeText, { color: selected ? colors.brand700 : colors.inkSoft }]}>
                    {item.badge}
                  </RNText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroller: {
    flexGrow: 1,
  },
  list: {
    flexGrow: 1,
    flexDirection: 'row',
    gap: space[1],
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    height: 44,
    paddingHorizontal: space[3],
    marginBottom: -1,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabSelected: {
    borderBottomColor: colors.brand600,
  },
  tabLabel: {
    fontFamily: fonts.sans.semibold,
    fontSize: 15,
  },
  badge: {
    borderRadius: radius.full,
    paddingHorizontal: space[2],
    paddingVertical: space[0.5],
  },
  badgeText: {
    fontFamily: fonts.sans.semibold,
    fontSize: 12,
  },
});
