import { Check } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, space } from '../tokens';
import { Text } from './text';

/**
 * A selectable row with a title, details and a value on the right, like the
 * service list on the website's booking card. Selected rows get the navy
 * ring and the soft blue fill.
 */
export function OptionCard({
  title,
  description,
  meta,
  value,
  selected = false,
  onPress,
  style,
}: {
  title: string;
  description?: string | null;
  /** Small line under the title, e.g. a duration. */
  meta?: ReactNode;
  /** The figure on the right, e.g. a price. */
  value?: ReactNode;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      role="radio"
      aria-checked={selected}
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && !selected && styles.pressed, selected && styles.selected, style]}
    >
      <View style={[styles.check, selected && styles.checkSelected]} aria-hidden>
        {selected ? <Check size={14} color={colors.paper} strokeWidth={3} /> : null}
      </View>
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {title}
        </Text>
        {meta ? (
          <Text variant="caption" tone="faint">
            {meta}
          </Text>
        ) : null}
        {description ? (
          <Text variant="small" tone="soft" numberOfLines={2} style={styles.description}>
            {description}
          </Text>
        ) : null}
      </View>
      {value != null ? (
        <Text variant="subheading" style={styles.value}>
          {value}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
    padding: space[3.5],
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  pressed: {
    borderColor: colors.lineStrong,
  },
  selected: {
    borderColor: colors.brand500,
    backgroundColor: colors.brand50,
    boxShadow: `0px 0px 0px 1px ${colors.brand500}`,
  },
  check: {
    width: 22,
    height: 22,
    marginTop: 1,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkSelected: {
    backgroundColor: colors.brand600,
    borderColor: colors.brand600,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: space[0.5],
  },
  description: {
    marginTop: space[1],
  },
  value: {
    flexShrink: 0,
  },
});
