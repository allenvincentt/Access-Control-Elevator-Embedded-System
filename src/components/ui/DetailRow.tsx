import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, radius, spacing, typography } from '@/constants/themeColor';

export type DetailRowProps = {
  icon: IconName;
  label: string;
  value: string;
  onPress?: () => void;
  trailingIcon?: IconName;
  style?: StyleProp<ViewStyle>;
};

export function DetailRow({ icon, label, value, onPress, trailingIcon, style }: DetailRowProps) {
  const content = (
    <View style={[styles.row, style]}>
      <View style={styles.iconWrap}>
        <Icon name={icon} size={16} color={colors.textSecondary} />
      </View>
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {trailingIcon ? <Icon name={trailingIcon} size={16} color={colors.textMuted} /> : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
  },
  text: {
    flex: 1,
    gap: 1,
  },
  label: {
    color: colors.textMuted,
    ...typography.overline,
    letterSpacing: 0.4,
  },
  value: {
    color: colors.text,
    ...typography.bodyStrong,
  },
  pressed: {
    opacity: 0.6,
  },
});

export default DetailRow;
