import { useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors, fonts } from '../tokens';
import { Text } from './text';

/**
 * The Swathbook mark: a navy tile with a dotted route that ends at an orange
 * pin, i.e. the day's jobs, in order. Same paths as the website's LogoMark.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <Rect width={32} height={32} rx={9} fill={colors.brand600} />
      <Path
        d="M7.5 24.5c3.5 0 4-6 8-6s4.5-5.5 8-5.5"
        fill="none"
        stroke={colors.sky}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeDasharray="0.1 4.2"
      />
      <Circle cx={7.5} cy={24.5} r={2.4} fill={colors.paper} />
      <Path d="M23.5 4.5a5 5 0 0 1 5 5c0 3.6-5 8.5-5 8.5s-5-4.9-5-8.5a5 5 0 0 1 5-5Z" fill={colors.sun} />
      <Circle cx={23.5} cy={9.5} r={1.8} fill={colors.brand600} />
    </Svg>
  );
}

/** Mark + wordmark. `tone="paper"` for navy backgrounds. */
export function Logo({ tone = 'ink', size = 32 }: { tone?: 'ink' | 'paper'; size?: number }) {
  return (
    <View style={styles.logo} role="img" aria-label="Swathbook">
      <LogoMark size={size} />
      <Text
        tone={tone}
        style={{ fontFamily: fonts.display.bold, fontSize: size * 0.62, letterSpacing: -0.02 * size * 0.62 }}
        aria-hidden
      >
        Swathbook
      </Text>
    </View>
  );
}

/** Decorative orange map pin, the mark's accent at poster size. */
export function BrandPin({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 1.2} viewBox="0 0 10 12" aria-hidden>
      <Path d="M5 0a5 5 0 0 1 5 5c0 3.6-5 7-5 7s-5-3.4-5-7a5 5 0 0 1 5-5Z" fill={colors.sun} />
      <Circle cx={5} cy={5} r={1.9} fill={colors.brand600} />
    </Svg>
  );
}

/** SVG ids must be unique per instance and safe inside url(#…) on web. */
function useSvgId(prefix: string) {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

export type MapGridProps = ViewProps & {
  /** `navy`: the brand's signature surface. `light`: the soft blue-grid header. */
  tone?: 'navy' | 'light';
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * The faint map grid, a nod to the routes every crew drives. A port of the
 * website's `map-grid` and `map-grid-light` utilities. Children render on top.
 */
export function MapGrid({ tone = 'navy', children, style, ...props }: MapGridProps) {
  const gridId = useSvgId('grid');
  const glowId = useSvgId('glow');
  const navy = tone === 'navy';
  const cell = navy ? 32 : 28;
  const lineColor = navy ? 'rgba(255,255,255,0.07)' : 'rgba(28,61,112,0.07)';

  return (
    <View style={[{ backgroundColor: navy ? colors.brand600 : colors.brand50, overflow: 'hidden' }, style]} {...props}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" aria-hidden pointerEvents="none">
        <Defs>
          <Pattern id={gridId} width={cell} height={cell} patternUnits="userSpaceOnUse">
            <Path d={`M ${cell} 0 L 0 0 0 ${cell}`} fill="none" stroke={lineColor} strokeWidth={1} />
          </Pattern>
          {navy ? (
            <RadialGradient id={glowId} cx="85%" cy="15%" r="55%" fx="85%" fy="15%">
              <Stop offset="0" stopColor={colors.sun} stopOpacity={0.18} />
              <Stop offset="1" stopColor={colors.sun} stopOpacity={0} />
            </RadialGradient>
          ) : null}
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${gridId})`} />
        {navy ? <Rect width="100%" height="100%" fill={`url(#${glowId})`} /> : null}
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
