import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { PointerGlow, useInteraction } from '@/components/common/animations';
import { Icon, type IconName } from '@/components/ui/Icon';
import { brandGradient, colors, palette, shadow } from '@/constants/themeColor';

export type FloatingActionButtonProps = {
  onPress: () => void;
  icon?: IconName;
  size?: number;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};

export function FloatingActionButton({
  onPress,
  icon = 'add',
  size = 60,
  accessibilityLabel,
  style,
}: FloatingActionButtonProps) {
  const { animatedStyle, handlers } = useInteraction({ hoverLift: 3, pressScale: 0.92 });

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        onHoverIn={handlers.onHoverIn}
        onHoverOut={handlers.onHoverOut}
        onPressIn={handlers.onPressIn}
        onPressOut={handlers.onPressOut}
        onFocus={handlers.onFocus}
        onBlur={handlers.onBlur}
        style={[styles.button, { width: size, height: size, borderRadius: size / 2 }, shadow.brand]}
      >
        <View
          style={[
            styles.fill,
            { borderRadius: size / 2, backgroundColor: palette.red },
            brandGradient(palette.red, palette.redDeep),
          ]}
        >
          <View pointerEvents="none" style={[styles.sheen, { borderRadius: size / 2 }]} />
          <PointerGlow color="rgba(255,255,255,0.55)" size={size * 2} borderRadius={size / 2} />
          <Icon name={icon} size={size * 0.44} color={colors.onPrimary} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
});

export default FloatingActionButton;
