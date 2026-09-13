import { useEffect, useState } from 'react';
import {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

export type AnimatedNumberOptions = {
  duration?: number;
  delay?: number;
  enabled?: boolean;
};

/**
 * Eases a plain JavaScript number towards `value`.
 *
 * Reanimated drives the timing, so the curve matches the rest of the system's
 * motion, while the result stays a normal number that SVG geometry can be
 * derived from on any platform. Use the shared-value hooks directly whenever a
 * plain View can be animated instead — this exists for the chart paths that
 * have to be recomputed to move.
 */
export function useAnimatedNumber(
  value: number,
  { duration = 980, delay = 0, enabled = true }: AnimatedNumberOptions = {},
): number {
  const progress = useSharedValue(0);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    progress.value = withDelay(
      delay,
      withTiming(value, { duration, easing: Easing.out(Easing.cubic) }),
    );
    return () => cancelAnimation(progress);
  }, [value, duration, delay, enabled, progress]);

  useAnimatedReaction(
    () => progress.value,
    (next) => {
      runOnJS(setCurrent)(next);
    },
  );

  // With animation off the target is reported straight through, so nothing has
  // to be written to state to settle on it.
  return enabled ? current : value;
}

export default useAnimatedNumber;
