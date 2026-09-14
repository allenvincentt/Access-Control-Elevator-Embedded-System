import { type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { useShake } from '@/hooks/useShake';

export type ShakeViewProps = {
  signal: unknown;
  amplitude?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

export function ShakeView({ signal, amplitude, style, children }: ShakeViewProps) {
  const shakeStyle = useShake(signal, amplitude);
  return <Animated.View style={[style, shakeStyle]}>{children}</Animated.View>;
}

export default ShakeView;
