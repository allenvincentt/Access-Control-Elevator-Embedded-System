import { useCallback } from 'react';
import { Platform } from 'react-native';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

const TIMING = { duration: 160, easing: Easing.out(Easing.cubic) };

export type InteractionOptions = {
  hoverLift?: number;
  pressScale?: number;
  disabled?: boolean;
  disabledOpacity?: number;
};

export function useInteraction({
  hoverLift = 3,
  pressScale = 0.96,
  disabled = false,
  disabledOpacity = 0.5,
}: InteractionOptions = {}) {
  const hovered = useSharedValue(0);
  const pressed = useSharedValue(0);

  const set = useCallback(
    (value: SharedValue<number>, to: number) => {
      if (disabled) return;
      value.value = withTiming(to, TIMING);
    },
    [disabled],
  );

  const animatedStyle = useAnimatedStyle(() => {
    const lift = -hoverLift * hovered.value;
    const scale = 1 - (1 - pressScale) * pressed.value;
    return {
      opacity: disabled ? disabledOpacity : 1,
      transform: [{ translateY: lift }, { scale }],
    };
  });

  return {
    hovered,
    pressed,
    animatedStyle,
    handlers: {
      onHoverIn: () => set(hovered, 1),
      onHoverOut: () => set(hovered, 0),
      onPressIn: () => set(pressed, 1),
      onPressOut: () => set(pressed, 0),
      onFocus: () => set(hovered, 1),
      onBlur: () => set(hovered, 0),
    },
  };
}

export const supportsHover = Platform.OS === 'web';
