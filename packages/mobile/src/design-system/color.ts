import { colors } from './tokens';

function relativeLuminance(hex: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * Text color for content on a business's brand color: white or ink, whichever
 * contrasts more (WCAG). Owners pick any color, including pale ones. Same
 * logic as `brandTextColor` in the web app's libs/utils.ts.
 */
export function brandTextColor(brand: string) {
  const luminance = relativeLuminance(brand);
  if (luminance === null) return colors.white;
  const inkLuminance = relativeLuminance(colors.ink)!;
  const onWhite = 1.05 / (luminance + 0.05);
  const onInk = (luminance + 0.05) / (inkLuminance + 0.05);
  return onWhite >= onInk ? colors.white : colors.ink;
}
