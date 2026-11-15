import { Link, type Href } from 'expo-router';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, space } from '../tokens';
import { Divider } from './surfaces';
import { Text } from './text';
import { usePressed } from './use-pressed';

/** A card of rows with hairlines between them (settings, details). */
export function ListGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.group, style]}>
      {rows.map((row, index) => (
        <Fragment key={row.key ?? index}>
          {index > 0 ? <Divider inset={space[4]} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

export type ListRowProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  /** Shown on the right, before the chevron, e.g. a value or a badge. */
  trailing?: ReactNode;
  onPress?: () => void;
  href?: Href;
  /** Red text and icon, for destructive actions like "Sign out". */
  destructive?: boolean;
};

/** One row in a ListGroup. Tappable rows get a chevron. */
export function ListRow({ title, subtitle, icon: Icon, trailing, onPress, href, destructive = false }: ListRowProps) {
  const interactive = Boolean(onPress || href);
  const fg = destructive ? colors.clay : colors.ink;
  const { pressed, ...pressHandlers } = usePressed({});

  const body = (
    <View style={[styles.row, pressed && styles.rowPressed]}>
      {Icon ? (
        <View style={[styles.iconTile, destructive && styles.iconTileDestructive]}>
          <Icon size={18} color={destructive ? colors.clay : colors.brand600} strokeWidth={2.25} aria-hidden />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text variant="bodyStrong" style={{ color: fg }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="soft" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {typeof trailing === 'string' ? (
        <Text variant="small" tone="soft">
          {trailing}
        </Text>
      ) : (
        trailing
      )}
      {interactive && !destructive ? <ChevronRight size={18} color={colors.inkFaint} aria-hidden /> : null}
    </View>
  );

  if (!interactive) return body;

  // Plain children and handlers, not render functions: see usePressed.
  const pressable = (
    <Pressable role={href ? 'link' : 'button'} onPress={onPress} {...pressHandlers}>
      {body}
    </Pressable>
  );
  return href ? (
    <Link href={href} asChild>
      {pressable}
    </Link>
  ) : (
    pressable
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: 56,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  rowPressed: {
    backgroundColor: colors.paperDeep,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.brand50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTileDestructive: {
    backgroundColor: colors.claySoft,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
});
