import { CircleAlert, CircleCheck, Info, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, space } from '../tokens';
import { Text } from './text';

/** Shown when a list has nothing in it yet. Says what goes here and how to add it. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  style,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.empty, style]}>
      <View style={styles.emptyIcon}>
        <Icon size={24} color={colors.brand600} strokeWidth={2} aria-hidden />
      </View>
      <Text variant="subheading" align="center" style={styles.emptyTitle} role="heading">
        {title}
      </Text>
      {children ? (
        <Text variant="small" tone="soft" align="center" style={styles.emptyBody}>
          {children}
        </Text>
      ) : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

type Tone = 'error' | 'success' | 'info';

const messageTones: Record<Tone, { bg: string; border: string; fg: string; icon: LucideIcon }> = {
  error: { bg: colors.claySoft, border: 'rgba(180, 35, 24, 0.4)', fg: colors.clayInk, icon: CircleAlert },
  success: { bg: colors.brand50, border: colors.brand200, fg: colors.brand700, icon: CircleCheck },
  info: { bg: colors.sunSoft, border: 'rgba(255, 122, 51, 0.5)', fg: colors.ink, icon: Info },
};

/** Inline banner for form-level errors, confirmations and notes. */
export function FormMessage({ tone = 'error', children, style }: { tone?: Tone; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  if (!children) return null;
  const t = messageTones[tone];
  const Icon = t.icon;
  return (
    <View
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      style={[styles.message, { backgroundColor: t.bg, borderColor: t.border }, style]}
    >
      <Icon size={18} color={t.fg} strokeWidth={2.25} aria-hidden />
      <Text variant="small" style={[styles.messageText, { color: t.fg }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.lineStrong,
    borderRadius: radius.card,
    paddingHorizontal: space[6],
    paddingVertical: space[10],
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.brand50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    marginTop: space[4],
  },
  emptyBody: {
    marginTop: space[1],
    maxWidth: 320,
  },
  emptyAction: {
    marginTop: space[5],
  },
  message: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2.5],
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  messageText: {
    flex: 1,
  },
});
