import { useCallback, useState } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export type PointerGlowProps = {
  color?: string;
  size?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

export function PointerGlow({
  color = 'rgba(255,255,255,0.55)',
  size = 160,
  borderRadius = 0,
  style,
}: PointerGlowProps) {
  const x = useSharedValue(0.5);
  const y = useSharedValue(0.5);
  const active = useSharedValue(0);
  const [box, setBox] = useState({ width: 0, height: 0 });

  const handlePointerMove = useCallback(
    (event: { nativeEvent?: Record<string, number> }) => {
      const width = box.width || 1;
      const height = box.height || 1;
      const ne = event.nativeEvent ?? {};
      const px = ne.offsetX ?? ne.locationX ?? 0;
      const py = ne.offsetY ?? ne.locationY ?? 0;
      x.set(Math.min(Math.max(px / width, 0), 1));
      y.set(Math.min(Math.max(py / height, 0), 1));
    },
    [box.width, box.height, x, y],
  );

  const handlePointerEnter = useCallback(() => {
    active.set(withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) }));
  }, [active]);

  const handlePointerLeave = useCallback(() => {
    active.set(withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) }));
  }, [active]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: active.value,
    transform: [
      { translateX: x.value * box.width - size / 2 },
      { translateY: y.value * box.height - size / 2 },
    ],
  }));

  if (Platform.OS !== 'web') return null;

  const webProps = {
    onPointerMove: handlePointerMove,
    onPointerEnter: handlePointerEnter,
    onPointerLeave: handlePointerLeave,
  };

  return (
    <View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, { borderRadius, overflow: 'hidden' }, style]}
      onLayout={(event) => setBox(event.nativeEvent.layout)}
      {...(webProps as object)}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
          },
          glowStyle,
        ]}
      />
    </View>
  );
}

export default PointerGlow;
