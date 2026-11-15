import { Image } from 'expo-image';
import { Camera } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text as RNText, View, type StyleProp, type ViewStyle } from 'react-native';

import { brandTextColor } from '../color';
import { colors, fonts } from '../tokens';
import { usePressed } from './use-pressed';

export function initials(name: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase());
  return letters.join('') || 'SB';
}

const sizes = { sm: 36, md: 48, lg: 64, xl: 80 } as const;

type AvatarProps = {
  name: string;
  imageUri?: string | null;
  /** Keeps the cached image when the URL changes but the picture doesn't (signed URLs). */
  cacheKey?: string | null;
  /** A business's `brand_color`. Text color is picked for contrast. */
  color?: string | null;
  size?: keyof typeof sizes;
  style?: StyleProp<ViewStyle>;
  /** Makes it a button (with a camera badge), e.g. to change a profile photo. */
  onPress?: () => void;
  /** What the button does, for screen readers. */
  label?: string;
  /** Shows a spinner over it while a change is saving. */
  busy?: boolean;
};

/**
 * A business or person tile: their logo or photo if there is one, otherwise
 * initials on their brand color (navy by default), as on the website's
 * booking card.
 */
export function Avatar({ name, imageUri, cacheKey, color = colors.brand600, size = 'md', style, onPress, label, busy = false }: Readonly<AvatarProps>) {
  const px = sizes[size];
  const bg = color ?? colors.brand600;
  const box = { width: px, height: px, borderRadius: Math.round(px / 3) };

  const tile = (
    <View style={[styles.tile, box, { backgroundColor: bg }, onPress ? null : style]} aria-hidden>
      {imageUri ? (
        <Image source={{ uri: imageUri, cacheKey: cacheKey ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <RNText style={[styles.initials, { color: brandTextColor(bg), fontSize: Math.round(px * 0.38) }]}>{initials(name)}</RNText>
      )}
      {busy ? (
        <View style={[StyleSheet.absoluteFill, styles.busy]}>
          <ActivityIndicator color={colors.white} />
        </View>
      ) : null}
    </View>
  );
  if (!onPress) return tile;
  return <EditableAvatar tile={tile} px={px} style={style} onPress={onPress} label={label ?? 'Change photo'} busy={busy} />;
}

function EditableAvatar({
  tile,
  px,
  style,
  onPress,
  label,
  busy,
}: Readonly<{
  tile: ReactNode;
  px: number;
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
  label: string;
  busy: boolean;
}>) {
  const press = usePressed({});
  const badge = Math.max(22, Math.round(px * 0.36));
  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-busy={busy}
      disabled={busy}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      hitSlop={6}
      style={StyleSheet.flatten([styles.button, { opacity: press.pressed ? 0.85 : 1 }, style])}
    >
      {tile}
      <View style={[styles.badge, { width: badge, height: badge, borderRadius: badge / 2 }]} aria-hidden>
        <Camera size={Math.round(badge * 0.55)} color={colors.white} strokeWidth={2.25} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    fontFamily: fonts.display.bold,
  },
  busy: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.scrim,
  },
  button: {
    alignSelf: 'flex-start',
  },
  badge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
    borderWidth: 2,
    borderColor: colors.card,
  },
});
