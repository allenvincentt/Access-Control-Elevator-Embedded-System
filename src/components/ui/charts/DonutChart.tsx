import { useEffect, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

import { useRevealOpen } from '@/components/common/animations/RevealGate';
import { colors } from '@/constants/themeColor';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SWEEP = { duration: 980, easing: Easing.out(Easing.cubic) };
const MIN_VISIBLE = 0.5;
const IS_WEB = Platform.OS === 'web';
const WEB_TRANSITION = {
  transition: `stroke-dashoffset ${SWEEP.duration}ms cubic-bezier(0.33, 1, 0.68, 1), stroke-opacity 160ms linear`,
};

function arcGeometry(swept: number, circumference: number, inset: number) {
  'worklet';
  const filled = circumference * swept;
  const valueDrawn = filled - inset * 2;
  const restDrawn = circumference - filled - inset * 2;
  return {
    sweepOffset: circumference * (1 - swept),
    valueOffset: circumference - Math.max(valueDrawn, 0.01),
    valueOpacity: valueDrawn > MIN_VISIBLE ? 1 : 0,
    restOffset: -Math.min(filled + inset * 2, circumference - 0.01),
    restOpacity: restDrawn > MIN_VISIBLE ? 1 : 0,
  };
}

export type DonutChartProps = {
  value: number;
  size?: number;
  thickness?: number;
  color?: string;
  trackColor?: string;
  gap?: number;
  baseColor?: string;
  animate?: boolean;
  animationDelay?: number;
  children?: ReactNode;
  accessibilityLabel?: string;
};

export function DonutChart({
  value,
  size = 168,
  thickness = 18,
  color = colors.success,
  trackColor = colors.danger,
  gap = 0,
  baseColor = colors.surfaceSunken,
  animate = true,
  animationDelay = 120,
  children,
  accessibilityLabel,
}: DonutChartProps) {
  const target = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const swept = useSharedValue(animate ? 0 : target);
  const [webArmed, setWebArmed] = useState(!animate);
  const open = useRevealOpen();

  useEffect(() => {
    if (animate && !open) return;
    if (IS_WEB) {
      if (!animate) return;
      const timer = setTimeout(() => setWebArmed(true), animationDelay);
      return () => clearTimeout(timer);
    }
    if (!animate) {
      swept.value = target;
      return;
    }
    swept.value = withDelay(animationDelay, withTiming(target, SWEEP));
    return () => cancelAnimation(swept);
  }, [animate, open, animationDelay, swept, target]);

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const split = gap > 0 && target > 0 && target < 1;
  const inset = split ? (gap + thickness) / 2 : 0;
  const insetDegrees = (inset / circumference) * 360;

  const sweepProps = useAnimatedProps(() => ({
    strokeDashoffset: arcGeometry(swept.value, circumference, inset).sweepOffset,
  }));

  const valueArcProps = useAnimatedProps(() => {
    const geometry = arcGeometry(swept.value, circumference, inset);
    return { strokeDashoffset: geometry.valueOffset, strokeOpacity: geometry.valueOpacity };
  });

  const restArcProps = useAnimatedProps(() => {
    const geometry = arcGeometry(swept.value, circumference, inset);
    return { strokeDashoffset: geometry.restOffset, strokeOpacity: geometry.restOpacity };
  });

  const web = arcGeometry(webArmed ? target : 0, circumference, inset);
  const ArcCircle = IS_WEB ? Circle : AnimatedCircle;
  const arcProps = (native: object, offset: number, opacity?: number) =>
    IS_WEB
      ? {
          strokeDashoffset: offset,
          ...(opacity === undefined ? null : { strokeOpacity: opacity }),
          style: WEB_TRANSITION,
        }
      : { animatedProps: native };

  const ring = { cx: center, cy: center, r: radius, strokeWidth: thickness, fill: 'none' };
  const dash = [circumference, circumference];

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <Svg width={size} height={size}>
        <G transform={`rotate(-90 ${center} ${center})`}>
          {gap > 0 ? (
            <>
              <Circle {...ring} stroke={baseColor} />
              <ArcCircle
                {...ring}
                stroke={trackColor}
                strokeLinecap="round"
                strokeDasharray={dash}
                transform={`rotate(${-insetDegrees} ${center} ${center})`}
                {...arcProps(restArcProps, web.restOffset, web.restOpacity)}
              />
              <ArcCircle
                {...ring}
                stroke={color}
                strokeLinecap="round"
                strokeDasharray={dash}
                transform={`rotate(${insetDegrees} ${center} ${center})`}
                {...arcProps(valueArcProps, web.valueOffset, web.valueOpacity)}
              />
            </>
          ) : (
            <>
              <Circle {...ring} stroke={trackColor} />
              <ArcCircle
                {...ring}
                stroke={color}
                strokeLinecap="round"
                strokeDasharray={dash}
                {...arcProps(sweepProps, web.sweepOffset)}
              />
            </>
          )}
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
