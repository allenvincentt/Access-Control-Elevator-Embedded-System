import { type ReactNode } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, interpolateColor } from 'react-native-reanimated';

import { ScrollReveal, useInteraction } from '@/components/common/animations';
import { colors, palette, radius, shadow, spacing } from '@/constants/themeColor';

export type CardProps = {
  children: ReactNode;
  onPress?: () => void;
  padding?: keyof typeof spacing | number;
  elevated?: boolean;
  accent?: 'none' | 'brand' | 'gold' | 'danger' | 'success';
  reveal?: boolean;
  revealDelay?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

const ACCENT_COLOR: Record<NonNullable<CardProps['accent']>, string | null> = {
  none: null,
  brand: colors.primary,
  gold: colors.secondary,
  danger: colors.danger,
  success: colors.success,
};

const ACCENT_GLOW: Record<NonNullable<CardProps['accent']>, string> = {
  none: 'rgba(58,18,16,0.16)',
  brand: 'rgba(178,10,7,0.28)',
  gold: 'rgba(217,180,17,0.32)',
  danger: 'rgba(194,31,22,0.30)',
  success: 'rgba(30,138,80,0.28)',
};

export function Card({
  children,
  onPress,
  padding = 'base',
  elevated = false,
  accent = 'none',
  reveal = false,
  revealDelay = 0,
  style,
  accessibilityLabel,
}: CardProps) {
  const pad = typeof padding === 'number' ? padding : spacing[padding];
  const accentColor = ACCENT_COLOR[accent];
  const glowColor = ACCENT_GLOW[accent];
  const interactive = Boolean(onPress);
  const { animatedStyle, hovered, pressed, handlers } = useInteraction({
    hoverLift: interactive ? 4 : 0,
    pressScale: interactive ? 0.985 : 1,
  });

  const surfaceStyle = useAnimatedStyle(() => {
    const active = Math.max(hovered.value, pressed.value);
    return {
      backgroundColor: interpolateColor(active, [0, 1], [colors.surface, palette.white]),
      borderColor: interpolateColor(
        active,
        [0, 1],
        [accentColor ?? colors.border, accentColor ?? colors.borderStrong],
      ),
      shadowColor: accent === 'none' ? '#3A1210' : glowColor,
      shadowOpacity: 0.1 + active * 0.22,
      shadowRadius: 14 + active * 16,
      elevation: elevated ? 7 : 2 + active * 6,
    };
  });

  const body = (
    <Animated.View
      style={[
        styles.card,
        { padding: pad },
        elevated ? shadow.md : shadow.sm,
        accentColor ? { borderLeftWidth: 3, borderLeftColor: accentColor } : null,
        surfaceStyle,
        !interactive && style,
      ]}
    >
      {children}
    </Animated.View>
  );

  const content = interactive ? (
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
      >
        {body}
      </Pressable>
    </Animated.View>
  ) : (
    body
  );

  if (reveal) {
    return <ScrollReveal delay={revealDelay}>{content}</ScrollReveal>;
  }
  return content;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
});

export default Card;
