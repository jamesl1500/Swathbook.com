import { Link, type Href } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, fonts, radius, shadows, touchTarget } from '../tokens';
import { usePressed } from './use-pressed';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'inverse' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

type VariantStyle = { bg: string; pressedBg: string; fg: string; border?: string; edge?: string };

/** Mirrors `variants` in apps/swathbook-web/src/components/ui/button.tsx. */
const variantStyles: Record<ButtonVariant, VariantStyle> = {
  primary: { bg: colors.brand600, pressedBg: colors.brand700, fg: colors.paper, edge: shadows.buttonEdge },
  accent: { bg: colors.sun, pressedBg: colors.sunPressed, fg: colors.ink, edge: shadows.buttonEdgeSoft },
  secondary: { bg: colors.card, pressedBg: colors.white, fg: colors.ink, border: colors.lineStrong },
  ghost: { bg: 'transparent', pressedBg: colors.paperDeep, fg: colors.inkSoft },
  inverse: { bg: colors.paper, pressedBg: colors.white, fg: colors.brand700 },
  danger: { bg: colors.clay, pressedBg: colors.clayPressed, fg: colors.white, edge: shadows.buttonEdge },
};

/** h-9 / h-11 / h-13. `sm` keeps a 44pt hit area via hitSlop. */
const sizeStyles: Record<ButtonSize, { height: number; paddingX: number; fontSize: number; icon: number }> = {
  sm: { height: 36, paddingX: 16, fontSize: 14, icon: 16 },
  md: { height: 44, paddingX: 20, fontSize: 15, icon: 18 },
  lg: { height: 52, paddingX: 28, fontSize: 16, icon: 20 },
};

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon before the label. */
  icon?: LucideIcon;
  /** Icon after the label, e.g. an arrow. */
  iconRight?: LucideIcon;
  /** Shows a spinner and blocks presses, keeping the button's width. */
  loading?: boolean;
  /** Stretch to the container's width. */
  block?: boolean;
  /** Render as a link to this route (expo-router). */
  href?: Href;
  style?: StyleProp<ViewStyle>;
};

/**
 * The pill button from the website, in the same six variants and three sizes.
 * Pass `href` to make it navigate; otherwise handle `onPress`.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  block = false,
  disabled,
  href,
  style,
  onPressIn,
  onPressOut,
  ...props
}: ButtonProps) {
  const v = variantStyles[variant];
  const s = sizeStyles[size];
  const inactive = disabled || loading;
  const slop = Math.max(0, (touchTarget - s.height) / 2);
  const { pressed, ...pressHandlers } = usePressed({ onPressIn, onPressOut });

  const button = (
    <Pressable
      role={href ? 'link' : 'button'}
      disabled={inactive}
      aria-disabled={inactive}
      aria-busy={loading}
      hitSlop={slop ? { top: slop, bottom: slop } : undefined}
      {...pressHandlers}
      // One flat object, not an array or a function: see usePressed.
      style={StyleSheet.flatten([
        styles.base,
        {
          height: s.height,
          paddingHorizontal: s.paddingX,
          backgroundColor: pressed ? v.pressedBg : v.bg,
          borderColor: v.border ?? 'transparent',
          boxShadow: v.edge,
          // Always an array: going from a transform to `undefined` reaches native
          // as `null`, which crashes React Native's processTransform.
          transform: [{ translateY: pressed ? 1 : 0 }],
        },
        block && styles.block,
        inactive && styles.disabled,
        style,
      ])}
      {...props}
    >
      {/* Content stays laid out while loading so the button doesn't change width. */}
      <View style={[styles.content, loading && styles.hidden]}>
        {Icon ? <Icon size={s.icon} color={v.fg} strokeWidth={2.25} aria-hidden /> : null}
        <RNText numberOfLines={1} style={[styles.label, { color: v.fg, fontSize: s.fontSize }]}>
          {children}
        </RNText>
        {IconRight ? <IconRight size={s.icon} color={v.fg} strokeWidth={2.25} aria-hidden /> : null}
      </View>
      {loading ? <ActivityIndicator color={v.fg} style={StyleSheet.absoluteFill} /> : null}
    </Pressable>
  );

  return href ? (
    <Link href={href} asChild>
      {button}
    </Link>
  ) : (
    button
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  block: {
    alignSelf: 'stretch',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hidden: {
    opacity: 0,
  },
  label: {
    fontFamily: fonts.sans.semibold,
  },
  disabled: {
    opacity: 0.6,
  },
});

export type IconButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  icon: LucideIcon;
  /** Read by screen readers; icon buttons have no visible text. */
  label: string;
  variant?: 'secondary' | 'ghost' | 'primary' | 'inverse';
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/** A round, icon-only button (back, close, favourite). Always 44pt. */
export function IconButton({ icon: Icon, label, variant = 'secondary', size = touchTarget, style, ...props }: IconButtonProps) {
  const v = variantStyles[variant];
  return (
    <Pressable
      role="button"
      aria-label={label}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: v.border ?? 'transparent',
          backgroundColor: pressed ? v.pressedBg : v.bg,
        },
        style,
      ]}
      {...props}
    >
      <Icon size={Math.round(size * 0.45)} color={variant === 'ghost' ? colors.ink : v.fg} strokeWidth={2.25} aria-hidden />
    </Pressable>
  );
}
