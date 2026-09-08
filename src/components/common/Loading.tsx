import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, spacing, typography } from '@/constants/themeColor';

export type LoadingProps = {
  label?: string;
  size?: 'small' | 'large';
  fullscreen?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

export function Loading({
  label,
  size = 'large',
  fullscreen = false,
  color = colors.primary,
  style,
}: LoadingProps) {
  return (
    <View
      style={[styles.container, fullscreen && styles.fullscreen, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Loading'}
    >
      <ActivityIndicator size={size} color={color} />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  fullscreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  label: {
    color: colors.textSecondary,
    ...typography.bodyStrong,
    textAlign: 'center',
  },
});

export default Loading;
