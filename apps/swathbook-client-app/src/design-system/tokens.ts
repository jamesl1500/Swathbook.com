/**
 * Swathbook design tokens for React Native.
 *
 * A one-to-one port of the website's "work order" palette in
 * apps/swathbook-web/src/app/globals.css: warm paper, workwear navy and a
 * safety-orange accent. Change a value there, change it here too.
 *
 * Like the website, the palette is light-only.
 */

export const colors = {
  paper: '#f6f3ee',
  paperDeep: '#ece6dc',
  card: '#fffdfa',
  white: '#ffffff',
  line: '#ddd6ca',
  lineStrong: '#c6bcab',

  ink: '#14202e',
  inkSoft: '#475466',
  inkFaint: '#566273',

  /** Workwear navy. 600 is the primary; 400+ pass AA as text on paper. */
  brand50: '#edf2fa',
  brand100: '#dbe5f4',
  brand200: '#b6c9e8',
  brand400: '#4a6aa3',
  brand500: '#2b5290',
  brand600: '#1c3d70',
  brand700: '#152f58',
  brand800: '#0e2140',

  /** Light accent for small text on navy (6.5:1 on brand600). */
  sky: '#a9cbff',
  /** Safety orange: fills, highlights and large text. Never small text on paper. */
  sun: '#ff7a33',
  sunPressed: '#ec6a24',
  sunSoft: '#ffe6d6',
  clay: '#b42318',
  clayPressed: '#9a1d14',
  claySoft: '#fde4e1',
  clayInk: '#8a1c12',

  /** Scrim behind sheets and dialogs (ink at 40%). */
  scrim: 'rgba(20, 32, 46, 0.4)',
} as const;

export type ColorToken = keyof typeof colors;

/**
 * Font families, one per weight. React Native can't synthesise weights from a
 * single custom family on Android, so each weight is its own family name.
 * These names are the keys `useBrandFonts` registers.
 */
export const fonts = {
  /** Bricolage Grotesque: headings and big numbers. */
  display: {
    semibold: 'BricolageGrotesque_600SemiBold',
    bold: 'BricolageGrotesque_700Bold',
    extrabold: 'BricolageGrotesque_800ExtraBold',
  },
  /** Instrument Sans: body copy and UI. */
  sans: {
    regular: 'InstrumentSans_400Regular',
    medium: 'InstrumentSans_500Medium',
    semibold: 'InstrumentSans_600SemiBold',
    bold: 'InstrumentSans_700Bold',
  },
  /** JetBrains Mono: label tags, references and links. */
  mono: {
    regular: 'JetBrainsMono_400Regular',
    medium: 'JetBrainsMono_500Medium',
  },
} as const;

/** Tailwind's 4px spacing scale, keyed the same way (space[4] === 16). */
export const space = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  3.5: 14,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radius = {
  /** rounded-lg: time chips, small tiles. */
  sm: 8,
  /** rounded-xl: inputs, list options, banners. */
  md: 12,
  /** rounded-2xl: avatars and icon tiles. */
  lg: 16,
  /** rounded-[1.25rem]: stat tiles. */
  xl: 20,
  /** rounded-[1.5rem]: cards. */
  card: 24,
  /** rounded-[1.75rem]: sheets and showcase cards. */
  sheet: 28,
  full: 999,
} as const;

/** The website's shadows, as React Native `boxShadow` strings. */
export const shadows = {
  card: '0px 1px 0px rgba(20, 32, 46, 0.04), 0px 12px 32px -12px rgba(20, 32, 46, 0.18)',
  lift: '0px 2px 0px rgba(20, 32, 46, 0.05), 0px 28px 60px -24px rgba(20, 32, 46, 0.35)',
  /** The pressed-in bottom edge on solid buttons. */
  buttonEdge: 'inset 0px -2px 0px rgba(0, 0, 0, 0.18)',
  buttonEdgeSoft: 'inset 0px -2px 0px rgba(0, 0, 0, 0.12)',
  /** Inputs sit slightly into the page. */
  inputInset: 'inset 0px 1px 2px rgba(20, 38, 27, 0.06)',
  /** focus:ring-3 ring-brand-200 */
  focusRing: '0px 0px 0px 3px #b6c9e8',
  errorRing: '0px 0px 0px 3px #fde4e1',
} as const;

/** Minimum touch target (Apple HIG 44pt, Material 48dp; we use 44). */
export const touchTarget = 44;

/** Content never gets wider than this on tablets and web. */
export const maxContentWidth = 640;

export const motion = {
  /** The website's --animate-rise: 0.7s, cubic-bezier(0.2, 0.7, 0.2, 1). */
  riseMs: 700,
  pressMs: 120,
} as const;
