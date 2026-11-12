import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { colors, radius, shadows, space } from '../tokens';
import { Text } from './text';

export type CardProps = ViewProps & {
  /**
   * `default`: the white card on paper (rounded-[1.5rem] border-line bg-card).
   * `raised`: same, with the website's card shadow.
   * `deep`: a recessed paper-deep panel for grouping inside a card.
   * `dashed`: the empty/placeholder outline.
   */
  variant?: 'default' | 'raised' | 'deep' | 'dashed';
  padding?: keyof typeof space;
};

export function Card({ variant = 'default', padding = 5, style, ...props }: CardProps) {
  return <View style={[styles.card, cardVariants[variant], { padding: space[padding] }, style]} {...props} />;
}

export type PressableCardProps = Omit<PressableProps, 'style'> & {
  variant?: 'default' | 'raised';
  padding?: keyof typeof space;
  style?: StyleProp<ViewStyle>;
};

/** A card that is one big tap target, e.g. a job or a business in a list. */
export function PressableCard({ variant = 'default', padding = 4, style, ...props }: PressableCardProps) {
  return (
    <Pressable
      role="button"
      style={({ pressed }) => [
        styles.card,
        cardVariants[variant],
        { padding: space[padding] },
        pressed && styles.pressed,
        style,
      ]}
      {...props}
    />
  );
}

/** A card heading with an optional action on the right (CardTitle on the web). */
export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.titleRow}>
      <Text variant="subheading" style={styles.titleText}>
        {children}
      </Text>
      {action}
    </View>
  );
}

export function Divider({ inset = 0, style }: { inset?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, { marginLeft: inset }, style]} />;
}

/** A small stat tile: mono label, big display number, optional hint. */
export function Stat({ label, value, hint, style }: { label: string; value: ReactNode; hint?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.stat, style]}>
      <Text variant="label">{label}</Text>
      <Text variant="stat" numberOfLines={1} style={styles.statValue}>
        {value}
      </Text>
      {hint ? (
        <Text variant="small" tone="soft">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const cardVariants = StyleSheet.create({
  default: {},
  raised: { boxShadow: shadows.card },
  deep: { backgroundColor: colors.paperDeep, borderColor: 'transparent', borderRadius: radius.lg },
  dashed: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: colors.lineStrong },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.card,
  },
  pressed: {
    backgroundColor: colors.white,
    borderColor: colors.lineStrong,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[3],
    marginBottom: space[4],
  },
  titleText: {
    flexShrink: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
  },
  stat: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: space[4],
  },
  statValue: {
    marginTop: space[2],
  },
});
