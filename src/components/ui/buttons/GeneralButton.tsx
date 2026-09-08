import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { PointerGlow, useInteraction } from '@/components/common/animations';
import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, gradient, radius, shadow, spacing, typography } from '@/constants/themeColor';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type GeneralButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

const SIZE_STYLE: Record<ButtonSize, { height: number; paddingHorizontal: number; fontSize: number; icon: number; gap: number }> = {
  sm: { height: 40, paddingHorizontal: spacing.base, fontSize: 13, icon: 16, gap: spacing.xs },
  md: { height: 50, paddingHorizontal: spacing.xl, fontSize: 15, icon: 18, gap: spacing.sm },
  lg: { height: 56, paddingHorizontal: spacing.xl, fontSize: 16, icon: 20, gap: spacing.sm },
};

function palette(variant: ButtonVariant) {
  switch (variant) {
    case 'secondary':
      return { bg: colors.secondary, bgPressed: colors.secondaryPressed, fg: colors.onSecondary, border: 'transparent', elevated: true, gradient: false, glow: 'rgba(255,255,255,0.45)' };
    case 'outline':
      return { bg: 'transparent', bgPressed: colors.primaryTint, fg: colors.primary, border: colors.primary, elevated: false, gradient: false, glow: 'rgba(178,10,7,0.14)' };
    case 'ghost':
      return { bg: 'transparent', bgPressed: colors.primaryTint, fg: colors.primary, border: 'transparent', elevated: false, gradient: false, glow: 'rgba(178,10,7,0.12)' };
    case 'danger':
      return { bg: colors.danger, bgPressed: '#A11A12', fg: colors.onDark, border: 'transparent', elevated: true, gradient: true, glow: 'rgba(255,255,255,0.4)' };
    default:
      return { bg: colors.primary, bgPressed: colors.primaryPressed, fg: colors.onPrimary, border: 'transparent', elevated: true, gradient: true, glow: 'rgba(255,255,255,0.5)' };
  }
}

export function GeneralButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityHint,
  style,
}: GeneralButtonProps) {
  const sizing = SIZE_STYLE[size];
  const tones = palette(variant);
  const isDisabled = disabled || loading;
  const { animatedStyle, handlers } = useInteraction({ hoverLift: 3, pressScale: 0.96, disabled: isDisabled });

  return (
    <Animated.View style={[animatedStyle, fullWidth && styles.fullWidth, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        accessibilityHint={accessibilityHint}
        disabled={isDisabled}
        onPress={onPress}
        onHoverIn={handlers.onHoverIn}
        onHoverOut={handlers.onHoverOut}
        onPressIn={handlers.onPressIn}
        onPressOut={handlers.onPressOut}
        onFocus={handlers.onFocus}
        onBlur={handlers.onBlur}
        style={({ pressed }) => [
          styles.base,
          {
            height: sizing.height,
            paddingHorizontal: sizing.paddingHorizontal,
            gap: sizing.gap,
            backgroundColor: pressed && !isDisabled ? tones.bgPressed : tones.bg,
            borderColor: tones.border,
            borderWidth: tones.border === 'transparent' ? 0 : 1.5,
          },
          tones.elevated && !isDisabled ? shadow.sm : null,
          fullWidth && styles.fullWidth,
          isDisabled && styles.disabled,
        ]}
      >
        {tones.gradient && !isDisabled ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fill, gradient('base')]} />
        ) : null}
        {tones.elevated && !isDisabled ? (
          <View pointerEvents="none" style={styles.sheen} />
        ) : null}
        {!isDisabled ? (
          <PointerGlow color={tones.glow} size={sizing.height * 3} borderRadius={radius.pill} />
        ) : null}

        {loading ? (
          <ActivityIndicator color={tones.fg} size="small" />
        ) : (
          <View style={[styles.content, { gap: sizing.gap }]}>
            {icon ? <Icon name={icon} size={sizing.icon} color={tones.fg} /> : null}
            <Text
              style={[
                typography.button,
                { color: tones.fg, fontSize: sizing.fontSize },
                Platform.OS === 'web' && tones.elevated ? styles.labelOnGradient : null,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
            {iconRight ? <Icon name={iconRight} size={sizing.icon} color={tones.fg} /> : null}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: radius.pill,
  },
  sheen: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    top: 1,
    height: 1,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelOnGradient: {
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  fullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
});

export default GeneralButton;
