import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityState,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { PointerGlow } from '@/components/common/animations';
import {
  LiquidBubbleSkin,
  useAnimatedValue,
  useGlassInteraction,
  type GlassInteraction,
} from '@/components/GlassPanel';
import { Icon, type IconName } from '@/components/ui/Icon';
import { GlassMotion, LiquidBubbleTints, type BubbleTint } from '@/constants/glassTheme';
import { colors, fontFamily, radius, typography } from '@/constants/themeColor';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type BubbleButtonVariant = 'solid' | 'ghost';

type AnimatedNumber = number | Animated.Value | Animated.AnimatedInterpolation<number>;

export const BubbleButtonGhostMetrics = {
  height: 40,
  paddingHorizontal: 12,
  iconSlot: 22,
  gap: 10,
  spacing: 4,
  radius: radius.md,
} as const;

export const BubbleButtonSolidMetrics = {
  height: 48,
  paddingHorizontal: 20,
  iconSlot: 20,
  gap: 10,
  spacing: 8,
  radius: radius.pill,
} as const;

export function bubbleButtonMetrics(variant: BubbleButtonVariant) {
  return variant === 'solid' ? BubbleButtonSolidMetrics : BubbleButtonGhostMetrics;
}

export type BubbleButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: BubbleButtonVariant;
  icon?: IconName;
  iconRight?: IconName;
  active?: boolean;
  activeSkin?: boolean;
  disabled?: boolean;
  tint?: BubbleTint;
  backgroundHint?: string;
  labelOpacity?: AnimatedNumber;
  iconOffsetX?: AnimatedNumber;
  interaction?: GlassInteraction;
  accessibilityLabel?: string;
  accessibilityState?: AccessibilityState;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
};

export function BubbleButton({
  label,
  onPress,
  variant = 'ghost',
  icon,
  iconRight,
  active = false,
  activeSkin = true,
  disabled = false,
  tint = 'iridescent',
  backgroundHint,
  labelOpacity = 1,
  iconOffsetX = 0,
  interaction: sharedInteraction,
  accessibilityLabel,
  accessibilityState,
  style,
  labelStyle,
  onLayout,
}: BubbleButtonProps) {
  const ownInteraction = useGlassInteraction({ disabled, shimmerOnPress: false });
  const interaction = sharedInteraction ?? ownInteraction;
  const metrics = bubbleButtonMetrics(variant);
  const solid = variant === 'solid';

  const activeValue = useAnimatedValue(active ? 1 : 0);
  const previousActive = useRef(active);

  useEffect(() => {
    Animated.timing(activeValue, {
      toValue: active ? 1 : 0,
      duration: GlassMotion.morph.duration,
      easing: GlassMotion.morph.easing,
      useNativeDriver: false,
    }).start();

    if (active && !previousActive.current) {
      interaction.triggerShimmer();
    }
    previousActive.current = active;
  }, [active, activeValue, interaction]);

  const emphasis = useMemo(
    () =>
      Animated.add(
        activeValue,
        Animated.multiply(interaction.energy, Animated.subtract(1, activeValue)),
      ).interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    [activeValue, interaction.energy],
  );

  const skinSource = activeSkin ? emphasis : interaction.energy;
  const skinOpacity = skinSource.interpolate({
    inputRange: [0, 1],
    outputRange: solid ? [0.72, 1] : [0, 0.9],
  });
  const scale = interaction.press.interpolate({
    inputRange: [0, 1],
    outputRange: [1, solid ? 0.96 : 0.97],
  });
  const translateY = interaction.hover.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -3],
  });
  const reflectionOpacity = skinSource.interpolate({
    inputRange: [0, 1],
    outputRange: solid ? [0.18, 0.7] : [0, 0.7],
  });
  const textGlow = interaction.hover.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 8],
  });

  const restColor = solid ? colors.onPrimary : colors.textMuted;
  const emphasisColor = solid ? colors.onPrimary : colors.primary;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, selected: active, ...accessibilityState }}
      disabled={disabled}
      onPress={onPress}
      onLayout={onLayout}
      onHoverIn={interaction.handlers.onHoverIn}
      onHoverOut={interaction.handlers.onHoverOut}
      onFocus={interaction.handlers.onHoverIn}
      onBlur={interaction.handlers.onHoverOut}
      onPressIn={interaction.handlers.onPressIn}
      onPressOut={interaction.handlers.onPressOut}
      style={[
        styles.shell,
        {
          height: metrics.height,
          paddingHorizontal: metrics.paddingHorizontal,
          borderRadius: metrics.radius,
          opacity: disabled ? 0.5 : 1,
          transform: [{ translateY }, { scale }],
        },
        style,
      ]}>
      {solid ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.fill, { borderRadius: metrics.radius, opacity: activeValue.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }]}
        />
      ) : null}

      <LiquidBubbleSkin
        radius={metrics.radius}
        tint={tint}
        backgroundHint={backgroundHint}
        opacity={skinOpacity}
        bordered={!solid}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.reflection,
          {
            opacity: reflectionOpacity,
            backgroundColor: solid ? 'rgba(255,255,255,0.7)' : LiquidBubbleTints[tint].leading,
          },
        ]}
      />

      {!disabled ? (
        <PointerGlow
          color={solid ? 'rgba(255,255,255,0.42)' : LiquidBubbleTints[tint].trailing}
          size={metrics.height * 3}
          borderRadius={metrics.radius}
        />
      ) : null}

      <View pointerEvents="none" style={[styles.content, { gap: metrics.gap }]}>
        {icon ? (
          <Animated.View
            style={[
              styles.iconSlot,
              { width: metrics.iconSlot, height: metrics.iconSlot, transform: [{ translateX: iconOffsetX }] },
            ]}>
            <Animated.View
              style={[
                styles.iconLayer,
                { opacity: emphasis.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
              ]}>
              <Icon name={icon} size={metrics.iconSlot - 2} color={restColor} />
            </Animated.View>
            <Animated.View style={[styles.iconLayer, { opacity: emphasis }]}>
              <Icon name={icon} size={metrics.iconSlot - 2} color={emphasisColor} />
            </Animated.View>
          </Animated.View>
        ) : null}

        <Animated.Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
          style={[
            styles.label,
            solid ? typography.button : typography.label,
            {
              opacity: labelOpacity,
              color: emphasis.interpolate({
                inputRange: [0, 1],
                outputRange: [restColor, emphasisColor],
              }) as unknown as string,
              textShadowColor: solid ? 'rgba(58,18,16,0.35)' : LiquidBubbleTints[tint].trailing,
              textShadowRadius: textGlow as unknown as number,
            },
            labelStyle,
          ]}>
          {label}
        </Animated.Text>

        {iconRight ? (
          <Animated.View style={[styles.iconRight, { opacity: emphasis }]}>
            <Icon name={iconRight} size={metrics.iconSlot - 4} color={emphasisColor} />
          </Animated.View>
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  fill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.primary,
  },
  reflection: {
    position: 'absolute',
    top: 1,
    left: '14%',
    right: '14%',
    height: 1,
    borderRadius: 1,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRight: {
    marginLeft: 'auto',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flexShrink: 1,
    fontFamily: fontFamily.semibold,
    textShadowOffset: { width: 0, height: 0 },
  },
});

export default BubbleButton;
