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

  return enabled ? current : value;
}

export default useAnimatedNumber;
