import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { colors } from '../tokens';
import { textVariants, type TextVariant } from '../typography';

export const textTones = {
  ink: colors.ink,
  soft: colors.inkSoft,
  faint: colors.inkFaint,
  brand: colors.brand600,
  paper: colors.paper,
  sky: colors.sky,
  clay: colors.clay,
  clayInk: colors.clayInk,
} as const;

export type TextTone = keyof typeof textTones;

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  tone?: TextTone;
  align?: 'left' | 'center' | 'right';
};

/**
 * Every piece of text in the app. Pick a `variant` for the role and a `tone`
 * for the color; avoid one-off font sizes.
 *
 * Headings (`display`, `title`, `heading`) are marked as headers for screen
 * readers automatically.
 */
export function Text({ variant = 'body', tone, align, style, role, ...props }: TextProps) {
  const isHeading = variant === 'display' || variant === 'title' || variant === 'heading';
  const defaultTone: TextTone = variant === 'label' ? 'faint' : 'ink';
  return (
    <RNText
      role={role ?? (isHeading ? 'heading' : undefined)}
      style={[textVariants[variant], { color: textTones[tone ?? defaultTone] }, align && { textAlign: align }, style]}
      {...props}
    />
  );
}
