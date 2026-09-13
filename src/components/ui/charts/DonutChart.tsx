import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { useAnimatedNumber } from '@/components/common/animations';
import { colors } from '@/constants/themeColor';

export type DonutChartProps = {
  /** Share of the ring to fill, 0–1. */
  value: number;
  size?: number;
  thickness?: number;
  color?: string;
  trackColor?: string;
  animate?: boolean;
  animationDelay?: number;
  children?: ReactNode;
  accessibilityLabel?: string;
};

/** Ring gauge: the full circle is the total, the sweep is the share. */
export function DonutChart({
  value,
  size = 168,
  thickness = 18,
  color = colors.success,
  trackColor = colors.danger,
  animate = true,
  animationDelay = 120,
  children,
  accessibilityLabel,
}: DonutChartProps) {
  const target = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const swept = useAnimatedNumber(target, { delay: animationDelay, enabled: animate });

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <Svg width={size} height={size}>
        {/* Rotate with an explicit pivot: the `origin` prop maps to an invalid
            DOM attribute on web. */}
        <G transform={`rotate(-90 ${center} ${center})`}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={trackColor}
            strokeWidth={thickness}
            fill="none"
          />
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={color}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - swept)}
            fill="none"
          />
        </G>
      </Svg>
      {children ? <View style={styles.center}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default DonutChart;
