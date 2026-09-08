import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { BrandMark } from '@/components/ui/BrandMark';
import { radius, shadow } from '@/constants/themeColor';

export type LogoProps = {
  size?: number;
  rounded?: boolean;
  elevated?: boolean;
  background?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Logo({ size = 64, rounded = true, elevated = false, background = true, style }: LogoProps) {
  const borderRadius = rounded ? Math.round(size * 0.24) : 0;
  return (
    <View
      style={[
        { width: size, height: size, borderRadius },
        styles.wrap,
        elevated && shadow.md,
        style,
      ]}
    >
      <BrandMark size={size} background={background} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
  },
});

export default Logo;
