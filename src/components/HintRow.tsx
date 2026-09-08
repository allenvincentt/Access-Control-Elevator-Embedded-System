import { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, radius, spacing, typography } from '@/constants/themeColor';

export type HintTone = 'info' | 'warning' | 'danger' | 'success' | 'neutral';

export type HintRowProps = {
  children: ReactNode;
  title?: string;
  tone?: HintTone;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
};

const TONE: Record<HintTone, { bg: string; fg: string; icon: IconName }> = {
  info: { bg: colors.infoTint, fg: colors.info, icon: 'lightbulb' },
  warning: { bg: colors.warningTint, fg: colors.warning, icon: 'warning' },
  danger: { bg: colors.dangerTint, fg: colors.danger, icon: 'error' },
  success: { bg: colors.successTint, fg: colors.success, icon: 'checkCircle' },
  neutral: { bg: colors.surfaceSunken, fg: colors.textSecondary, icon: 'info' },
};

export function HintRow({ children, title, tone = 'info', icon, style }: HintRowProps) {
  const meta = TONE[tone];
  return (
    <View style={[styles.row, { backgroundColor: meta.bg }, style]} accessibilityRole="summary">
      <Icon name={icon ?? meta.icon} size={18} color={meta.fg} style={styles.icon} />
      <View style={styles.body}>
        {title ? <Text style={[styles.title, { color: meta.fg }]}>{title}</Text> : null}
        <Text style={styles.text}>{children}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  icon: {
    marginTop: 1,
  },
  body: {
    flex: 1,
    gap: 3,
  },
  title: {
    ...typography.label,
  },
  text: {
    color: colors.textSecondary,
    ...typography.caption,
    lineHeight: 17,
  },
});

export default HintRow;
