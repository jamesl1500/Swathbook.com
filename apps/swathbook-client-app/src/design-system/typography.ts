import type { TextStyle } from 'react-native';

import { fonts } from './tokens';

/** Headings get the website's -0.02em tracking. */
const tight = (size: number) => -0.02 * size;

/**
 * The type roles used across the website, sized for phones. Each maps to a
 * Tailwind class combination on the web so the two read the same:
 *
 * - display:  hero h1 (text-4xl font-extrabold leading-[1.02])
 * - title:    page h1 (text-3xl font-extrabold leading-tight)
 * - heading:  section h2 (text-2xl font-bold)
 * - subheading: card titles (text-lg font-bold)
 * - stat:     big numbers (font-display text-2xl font-extrabold)
 * - body / bodyStrong / small / smallStrong / caption: Instrument Sans copy
 * - label:    the mono uppercase "label-tag" eyebrow
 * - mono:     references, links and codes
 */
export const textVariants = {
  display: {
    fontFamily: fonts.display.extrabold,
    fontSize: 36,
    lineHeight: 38,
    letterSpacing: tight(36),
  },
  title: {
    fontFamily: fonts.display.extrabold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: tight(30),
  },
  heading: {
    fontFamily: fonts.display.bold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: tight(24),
  },
  subheading: {
    fontFamily: fonts.display.bold,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: tight(18),
  },
  stat: {
    fontFamily: fonts.display.extrabold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: tight(26),
  },
  body: {
    fontFamily: fonts.sans.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  bodyStrong: {
    fontFamily: fonts.sans.semibold,
    fontSize: 16,
    lineHeight: 24,
  },
  small: {
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  smallStrong: {
    fontFamily: fonts.sans.semibold,
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  label: {
    fontFamily: fonts.mono.medium,
    fontSize: 11.5,
    lineHeight: 16,
    letterSpacing: 0.14 * 11.5,
    textTransform: 'uppercase',
  },
  mono: {
    fontFamily: fonts.mono.regular,
    fontSize: 13,
    lineHeight: 18,
  },
} satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof textVariants;
