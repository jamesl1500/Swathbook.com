import { DefaultTheme, type Theme } from 'expo-router';

import { colors, fonts } from './tokens';

/** Brand colors and fonts for expo-router's navigators (headers, backgrounds). */
export const navigationTheme: Theme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.brand600,
    background: colors.paper,
    card: colors.paper,
    text: colors.ink,
    border: colors.line,
    notification: colors.sun,
  },
  fonts: {
    regular: { fontFamily: fonts.sans.regular, fontWeight: '400' },
    medium: { fontFamily: fonts.sans.medium, fontWeight: '500' },
    bold: { fontFamily: fonts.sans.semibold, fontWeight: '600' },
    heavy: { fontFamily: fonts.display.bold, fontWeight: '700' },
  },
};

/** Default options for stack screens: paper header, display-font title, no hairline. */
export const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.paper },
  headerShadowVisible: false,
  headerTintColor: colors.ink,
  headerTitleStyle: { fontFamily: fonts.display.bold, fontSize: 18, color: colors.ink },
  headerBackButtonDisplayMode: 'minimal',
  contentStyle: { backgroundColor: colors.paper },
} as const;
