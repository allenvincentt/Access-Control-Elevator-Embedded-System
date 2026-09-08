import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, palette, radius, spacing, typography } from '@/constants/themeColor';

export type ChipTone = 'neutral' | 'brand' | 'gold' | 'success' | 'danger' | 'info';
export type ChipSize = 'sm' | 'md';

export type ChipProps = {
  label: string;
  tone?: ChipTone;
  size?: ChipSize;
  icon?: IconName;
  onPress?: () => void;
  onRemove?: () => void;
  style?: StyleProp<ViewStyle>;
};

const TONE: Record<ChipTone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: colors.surfaceSunken, fg: colors.textSecondary, border: colors.border },
  brand: { bg: colors.primaryTint, fg: colors.primaryDeep, border: 'transparent' },
  gold: { bg: colors.secondaryTint, fg: palette.goldDeep, border: 'transparent' },
  success: { bg: colors.successTint, fg: colors.success, border: 'transparent' },
  danger: { bg: colors.dangerTint, fg: colors.danger, border: 'transparent' },
  info: { bg: colors.infoTint, fg: colors.info, border: 'transparent' },
};

export function Chip({ label, tone = 'neutral', size = 'md', icon, onPress, onRemove, style }: ChipProps) {
  const palette = TONE[tone];
  const compact = size === 'sm';
  const content = (
    <View
      style={[
        styles.base,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: palette.border === 'transparent' ? 0 : 1,
          paddingVertical: compact ? 3 : 5,
          paddingHorizontal: compact ? spacing.sm : spacing.md,
          gap: compact ? 4 : spacing.xs,
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={compact ? 12 : 14} color={palette.fg} /> : null}
      <Text style={[compact ? typography.caption : typography.label, { color: palette.fg }]} numberOfLines={1}>
        {label}
      </Text>
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label}`} hitSlop={8} onPress={onRemove}>
          <Icon name="close" size={compact ? 12 : 14} color={palette.fg} />
        </Pressable>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => (pressed ? styles.pressed : undefined)}
      >
        {content}
      </Pressable>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
  },
  pressed: {
    opacity: 0.7,
  },
});

export default Chip;
