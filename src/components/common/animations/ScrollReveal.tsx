import { useEffect, useState, type ReactNode } from 'react';
import { type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useRevealOpen } from './RevealGate';

export type ScrollRevealProps = {
  children: ReactNode;
  delay?: number;
  duration?: number;
  distance?: number;
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
};

const REVEAL_DURATION = 980;
const REVEAL_DISTANCE = 44;
const REVEAL_SCALE_FROM = 0.985;

export function ScrollReveal({
  children,
  delay = 0,
  duration = REVEAL_DURATION,
  distance = REVEAL_DISTANCE,
  enabled = true,
  style,
  onLayout,
}: ScrollRevealProps) {
  const [played, setPlayed] = useState(!enabled);
  const progress = useSharedValue(enabled ? 0 : 1);
  const open = useRevealOpen();

  useEffect(() => {
    if (!enabled || played) {
      progress.value = 1;
      return;
    }
    if (!open) return;
    progress.value = withDelay(
      delay,
      withTiming(1, { duration, easing: Easing.out(Easing.cubic) }),
    );
    const timeout = setTimeout(() => setPlayed(true), delay + duration);
    return () => {
      clearTimeout(timeout);
      cancelAnimation(progress);
    };
  }, [enabled, played, open, delay, duration, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * distance },
      { scale: REVEAL_SCALE_FROM + (1 - REVEAL_SCALE_FROM) * progress.value },
    ],
  }));

  return (
    <Animated.View style={[animatedStyle, style]} onLayout={onLayout}>
      {children}
    </Animated.View>
  );
}

export default ScrollReveal;
