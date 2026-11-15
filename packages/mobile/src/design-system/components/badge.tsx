import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text as RNText, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, radius, space } from '../tokens';

export type BadgeTone = 'neutral' | 'brand' | 'brandSolid' | 'sun' | 'clay' | 'ink';

/** The status pill colors used across the website (see BookingStatusBadge on the web). */
const badgeTones: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.paperDeep, fg: colors.inkSoft },
  brand: { bg: colors.brand50, fg: colors.brand700 },
  brandSolid: { bg: colors.brand600, fg: colors.paper },
  sun: { bg: colors.sunSoft, fg: colors.ink },
  clay: { bg: colors.claySoft, fg: colors.clayInk },
  ink: { bg: colors.ink, fg: colors.paper },
};

export function Badge({
  children,
  tone = 'neutral',
  icon: Icon,
  style,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
}) {
  const t = badgeTones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }, style]}>
      {Icon ? <Icon size={12} color={t.fg} strokeWidth={2.5} aria-hidden /> : null}
      <RNText style={[styles.badgeText, { color: t.fg }]} numberOfLines={1}>
        {children}
      </RNText>
    </View>
  );
}

export type ChipProps = Omit<PressableProps, 'children' | 'style'> & {
  children: ReactNode;
  /** Set it (true or false) to make the chip one choice of several; leave it out for a plain button. */
  selected?: boolean;
  icon?: LucideIcon;
  /** `pill` for filters, `tile` for time slots (the website's opening chips). */
  shape?: 'pill' | 'tile';
  style?: StyleProp<ViewStyle>;
};

/**
 * A selectable chip. Selected chips go solid ink, exactly like the "Next
 * openings" times on the website's booking card.
 */
export function Chip({ children, selected, icon: Icon, shape = 'pill', style, ...props }: ChipProps) {
  const fg = selected ? colors.paper : colors.inkSoft;
  // A chip with `selected` is one choice of several (put them in a
  // role="radiogroup"); without it, it's a plain button like "Later".
  const choice = selected !== undefined;
  return (
    <Pressable
      role={choice ? 'radio' : 'button'}
      aria-checked={choice ? selected : undefined}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [
        styles.chip,
        shape === 'tile' ? styles.tile : styles.pill,
        selected ? styles.chipSelected : pressed && styles.chipPressed,
        style,
      ]}
      {...props}
    >
      {Icon ? <Icon size={15} color={fg} strokeWidth={2.25} aria-hidden /> : null}
      <RNText style={[styles.chipText, { color: fg }]} numberOfLines={1}>
        {children}
      </RNText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space[1],
    borderRadius: radius.full,
    paddingHorizontal: space[2.5],
    paddingVertical: space[1],
  },
  badgeText: {
    fontFamily: fonts.sans.semibold,
    fontSize: 12,
    lineHeight: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[1.5],
    minHeight: 38,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  pill: {
    borderRadius: radius.full,
    paddingHorizontal: space[3.5],
  },
  tile: {
    borderRadius: radius.sm,
    paddingHorizontal: space[3],
  },
  chipSelected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipPressed: {
    borderColor: colors.lineStrong,
    backgroundColor: colors.paperDeep,
  },
  chipText: {
    fontFamily: fonts.sans.semibold,
    fontSize: 14,
  },
});
