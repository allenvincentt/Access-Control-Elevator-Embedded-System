import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';
import type { ViewStyle } from 'react-native';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated';

const DEFAULT_AMPLITUDE = 6;
const STEP = { duration: 48, easing: Easing.inOut(Easing.quad) } as const;
const SWINGS = [-1, 0.82, -0.55, 0.3, 0];

export type ShakeStyle = AnimatedStyle<ViewStyle>;

export function useShake(signal: unknown, amplitude: number = DEFAULT_AMPLITUDE): ShakeStyle {
  const offset = useSharedValue(0);
  const previous = useRef(signal);
  const reduceMotion = useRef(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((enabled) => {
        if (active) reduceMotion.current = enabled;
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (enabled: boolean) => {
        reduceMotion.current = enabled;
      },
    );
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (Object.is(previous.current, signal)) return;
    previous.current = signal;
    if (signal === null || signal === undefined || signal === false) return;
    if (reduceMotion.current) return;
    offset.value = withSequence(...SWINGS.map((swing) => withTiming(swing * amplitude, STEP)));
  }, [amplitude, offset, signal]);

  return useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));
}

export default useShake;
