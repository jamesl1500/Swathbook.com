import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, maxContentWidth, space } from '../tokens';

export type ScreenProps = {
  children: ReactNode;
  /** Scrolls by default. Turn off for screens that manage their own list. */
  scroll?: boolean;
  /** Safe-area edges to pad. Tab screens without a header need 'top'. */
  edges?: Edge[];
  /** Horizontal page gutter (px-4 on the website). */
  padded?: boolean;
  /** Pinned to the bottom, above the safe area, e.g. a booking button. */
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: ScrollViewProps['refreshControl'];
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
};

/**
 * The page: paper background, safe areas, a 16px gutter, and content held to a
 * readable width on tablets and web.
 */
export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  padded = true,
  footer,
  contentStyle,
  refreshControl,
  keyboardShouldPersistTaps = 'handled',
}: ScreenProps) {
  const inner = [styles.content, padded && styles.padded, contentStyle];

  return (
    <SafeAreaView edges={edges} style={styles.root}>
      {scroll ? (
        <ScrollView
          style={styles.root}
          contentContainerStyle={inner}
          refreshControl={refreshControl}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="automatic"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.root, ...inner]}>{children}</View>
      )}
      {footer ? <ScreenFooter>{footer}</ScreenFooter> : null}
    </SafeAreaView>
  );
}

/** A bar pinned to the bottom of a screen, for the one main action. */
export function ScreenFooter({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView edges={['bottom']} style={styles.footer}>
      <View style={styles.footerInner}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  content: {
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    paddingTop: space[4],
    paddingBottom: space[10],
    gap: space[6],
  },
  padded: {
    paddingHorizontal: space[4],
  },
  footer: {
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  footerInner: {
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: space[4],
    paddingTop: space[3],
    paddingBottom: space[3],
  },
});
