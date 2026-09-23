import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
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

export function Card(props: CardProps) {
  const content = props.onPress ? <InteractiveCard {...props} /> : <StaticCard {...props} />;
  if (props.reveal) {
    return <ScrollReveal delay={props.revealDelay ?? 0}>{content}</ScrollReveal>;
  }
  return content;
}

function StaticCard({
  children,
  padding = 'base',
  elevated = false,
  accent = 'none',
  style,
  accessibilityLabel,
}: CardProps) {
  const pad = typeof padding === 'number' ? padding : spacing[padding];
  const accentColor = ACCENT_COLOR[accent];

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.card,
        { padding: pad },
        elevated ? shadow.md : shadow.sm,
        {
          borderColor: accentColor ?? colors.border,
          shadowColor: accent === 'none' ? '#3A1210' : ACCENT_GLOW[accent],
          shadowOpacity: 0.1,
          shadowRadius: 14,
          elevation: elevated ? 7 : 2,
        },
        accentColor ? { borderLeftWidth: 3, borderLeftColor: accentColor } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

function InteractiveCard({
  children,
  onPress,
  padding = 'base',
  elevated = false,
  accent = 'none',
  style,
  accessibilityLabel,
}: CardProps) {
  const pad = typeof padding === 'number' ? padding : spacing[padding];
  const accentColor = ACCENT_COLOR[accent];
  const glowColor = ACCENT_GLOW[accent];
  const { animatedStyle, hovered, pressed, handlers } = useInteraction({
    hoverLift: 4,
    pressScale: 0.985,
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
      ]}
    >
      {children}
    </Animated.View>
  );

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
      >
        {body}
      </Pressable>
    </Animated.View>
  );
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
