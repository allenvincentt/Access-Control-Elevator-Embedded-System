import { useEffect, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

export type CountUpProps = {
  value: number;
  duration?: number;
  delay?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

export function CountUp({
  value,
  duration = 980,
  delay = 0,
  decimals = 0,
  prefix = '',
  suffix = '',
  style,
  numberOfLines,
}: CountUpProps) {
  const progress = useSharedValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      delay,
      withTiming(value, { duration, easing: Easing.out(Easing.cubic) }),
    );
    return () => cancelAnimation(progress);
  }, [value, duration, delay, progress]);

  useAnimatedReaction(
    () => progress.value,
    (current) => {
      runOnJS(setDisplay)(current);
    },
  );

  const factor = 10 ** decimals;
  const shown = (Math.round(display * factor) / factor).toFixed(decimals);

  return (
    <Text style={style} numberOfLines={numberOfLines} allowFontScaling={false}>
      {`${prefix}${shown}${suffix}`}
    </Text>
  );
}

export default CountUp;
