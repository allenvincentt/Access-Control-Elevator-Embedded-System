import { useId, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { useAnimatedNumber } from '@/components/common/animations';
import { colors, fontFamily, palette, typography } from '@/constants/themeColor';

export type TrendChartProps = {
  points: number[];
  labels?: string[];
  height?: number;
  color?: string;
  /** Accent dot; defaults to the highest point, matching the dashboard design. */
  markIndex?: number;
  animate?: boolean;
  animationDelay?: number;
  accessibilityLabel?: string;
};

const TOP_PADDING = 10;
const BOTTOM_PADDING = 8;

/** Catmull-Rom control points, so the line curves without overshooting. */
function smoothPath(coords: { x: number; y: number }[]): string {
  if (coords.length === 0) return '';
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;

  let path = `M ${coords[0].x} ${coords[0].y}`;
  for (let index = 0; index < coords.length - 1; index++) {
    const previous = coords[index - 1] ?? coords[index];
    const start = coords[index];
    const end = coords[index + 1];
    const after = coords[index + 2] ?? end;

    const control1 = {
      x: start.x + (end.x - previous.x) / 6,
      y: start.y + (end.y - previous.y) / 6,
    };
    const control2 = {
      x: end.x - (after.x - start.x) / 6,
      y: end.y - (after.y - start.y) / 6,
    };

    path += ` C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`;
  }
  return path;
}

/**
 * Compact area/line chart for a short series (a week of daily counts).
 *
 * Width comes from layout rather than a fixed viewBox, so the curve keeps its
 * stroke weight from a 320px phone to a full-width desktop panel.
 */
export function TrendChart({
  points,
  labels,
  height = 150,
  color = colors.primary,
  markIndex,
  animate = true,
  animationDelay = 120,
  accessibilityLabel,
}: TrendChartProps) {
  const [width, setWidth] = useState(0);
  // Gradient ids share one document per platform, so keep them instance unique.
  const fillId = `trend-fill-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const progress = useAnimatedNumber(1, { delay: animationDelay, enabled: animate });

  const handleLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setWidth((current) => (current === next ? current : next));
  };

  const plotHeight = Math.max(0, height - TOP_PADDING - BOTTOM_PADDING);
  const peak = points.length > 0 ? Math.max(...points) : 0;
  const highest = markIndex ?? (points.length > 0 ? points.indexOf(peak) : -1);
  const ceiling = peak > 0 ? peak : 1;
  const baseline = TOP_PADDING + plotHeight;

  const coords = points.map((value, index) => {
    const ratio = points.length > 1 ? index / (points.length - 1) : 0.5;
    const eased = (value / ceiling) * progress;
    return {
      x: ratio * Math.max(width - 2, 0) + 1,
      y: baseline - eased * plotHeight,
    };
  });

  const line = smoothPath(coords);
  const area =
    coords.length > 1
      ? `${line} L ${coords[coords.length - 1].x} ${baseline} L ${coords[0].x} ${baseline} Z`
      : '';
  const mark = highest >= 0 ? coords[highest] : null;

  return (
    <View
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={{ height }} onLayout={handleLayout}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.22} />
                <Stop offset="1" stopColor={color} stopOpacity={0.02} />
              </LinearGradient>
            </Defs>

            {area ? <Path d={area} fill={`url(#${fillId})`} /> : null}
            <Path
              d={line}
              stroke={color}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            {mark ? (
              <>
                <Circle cx={mark.x} cy={mark.y} r={7} fill={color} opacity={0.16} />
                <Circle
                  cx={mark.x}
                  cy={mark.y}
                  r={4}
                  fill={color}
                  stroke={palette.white}
                  strokeWidth={1.5}
                />
              </>
            ) : null}
          </Svg>
        ) : null}
      </View>

      {labels && labels.length > 0 ? (
        <View style={styles.labels}>
          {labels.map((label, index) => (
            <Text
              key={`${label}-${index}`}
              style={[styles.label, index === highest && styles.labelActive]}
              numberOfLines={1}
            >
              {label}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  labels: {
    flexDirection: 'row',
    marginTop: 6,
  },
  label: {
    flex: 1,
    textAlign: 'center',
    color: colors.textMuted,
    ...typography.caption,
    fontSize: 11,
  },
  labelActive: {
    color: colors.textSecondary,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
  },
});

export default TrendChart;
