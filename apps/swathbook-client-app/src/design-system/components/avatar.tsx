import { Image } from 'expo-image';
import { StyleSheet, Text as RNText, View, type StyleProp, type ViewStyle } from 'react-native';

import { brandTextColor } from '../color';
import { colors, fonts } from '../tokens';

export function initials(name: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase());
  return letters.join('') || 'SB';
}

const sizes = { sm: 36, md: 48, lg: 64, xl: 80 } as const;

/**
 * A business or person tile: their logo if there is one, otherwise initials on
 * their brand color (navy by default), as on the website's booking card.
 */
export function Avatar({
  name,
  imageUri,
  color = colors.brand600,
  size = 'md',
  style,
}: {
  name: string;
  imageUri?: string | null;
  /** A business's `brand_color`. Text color is picked for contrast. */
  color?: string | null;
  size?: keyof typeof sizes;
  style?: StyleProp<ViewStyle>;
}) {
  const px = sizes[size];
  const bg = color ?? colors.brand600;
  const box = { width: px, height: px, borderRadius: Math.round(px / 3) };

  return (
    <View style={[styles.tile, box, { backgroundColor: bg }, style]} aria-hidden>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <RNText style={[styles.initials, { color: brandTextColor(bg), fontSize: Math.round(px * 0.38) }]}>
          {initials(name)}
        </RNText>
      )}
    </View>
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
});
