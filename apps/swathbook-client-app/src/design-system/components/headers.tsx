import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, space } from '../tokens';
import { Text, type TextTone } from './text';

/** The mono uppercase label with a short rule before it (Eyebrow on the website). */
export function Eyebrow({ children, tone = 'brand' }: { children: ReactNode; tone?: TextTone }) {
  const lineColor = tone === 'sky' ? colors.sky : tone === 'paper' ? colors.paper : colors.brand600;
  return (
    <View style={styles.eyebrow}>
      <View style={[styles.eyebrowRule, { backgroundColor: lineColor }]} />
      <Text variant="label" tone={tone}>
        {children}
      </Text>
    </View>
  );
}

/** The title block at the top of a screen. */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  style,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.pageHeader, style]}>
      <View style={styles.pageHeaderText}>
        {eyebrow ? <Text variant="label">{eyebrow}</Text> : null}
        <Text variant="title">{title}</Text>
        {description ? (
          <Text variant="body" tone="soft">
            {description}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

/** A heading above a group of content, with an optional action ("See all"). */
export function SectionHeader({ title, action, style }: { title: ReactNode; action?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <Text variant="subheading" role="heading" style={styles.sectionTitle}>
        {title}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  eyebrowRule: {
    width: 24,
    height: 1,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space[4],
  },
  pageHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: space[2],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[3],
    marginBottom: space[3],
  },
  sectionTitle: {
    flexShrink: 1,
  },
});
