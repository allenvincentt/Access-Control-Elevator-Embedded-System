import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius, spacing, typography } from '@/constants/themeColor';

export type BarMeterProps = {
  label: string;
  value: number;
  /** Share of the track to fill, 0–1. */
  ratio: number;
  color?: string;
  trackColor?: string;
  suffix?: string;
  animationDelay?: number;
};

const FILL_DURATION = 820;
const MIN_VISIBLE_RATIO = 0.04;

/**
 * Labelled horizontal meter used for rankings (floor traffic, denial reasons).
 * The fill runs on the UI thread, so a list of them stays at 60 FPS.
 */
export function BarMeter({
  label,
  value,
  ratio,
  color = colors.primary,
  trackColor = colors.surfaceSunken,
  suffix,
  animationDelay = 0,
}: BarMeterProps) {
  const safeRatio = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  const target = value > 0 ? Math.max(safeRatio, MIN_VISIBLE_RATIO) : 0;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      animationDelay,
      withTiming(target, { duration: FILL_DURATION, easing: Easing.out(Easing.cubic) }),
    );
    return () => cancelAnimation(progress);
  }, [target, animationDelay, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityLabel={`${label}: ${value}${suffix ?? ''}`}
    >
      <View style={styles.head}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.value}>
          {value}
          {suffix ?? ''}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: trackColor }]}>
        <Animated.View style={[styles.fill, { backgroundColor: color }, fillStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 6,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    flex: 1,
    color: colors.text,
    ...typography.label,
  },
  value: {
    color: colors.textSecondary,
    ...typography.label,
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 8,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
});

export default BarMeter;
