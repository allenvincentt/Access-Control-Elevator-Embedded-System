import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/constants/themeColor';

export type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  overline?: string;
  right?: ReactNode;
  left?: ReactNode;
};

export function ScreenHeader({ title, subtitle, overline, right, left }: ScreenHeaderProps) {
  return (
    <View style={styles.row}>
      {left ? <View style={styles.left}>{left}</View> : null}
      <View style={styles.text}>
        {overline ? <Text style={styles.overline}>{overline}</Text> : null}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  left: {
    marginRight: spacing.xs,
  },
  text: {
    flex: 1,
    gap: 3,
  },
  overline: {
    color: colors.primary,
    ...typography.overline,
  },
  title: {
    color: colors.text,
    ...typography.title,
  },
  subtitle: {
    color: colors.textSecondary,
    ...typography.body,
  },
  right: {
    alignItems: 'flex-end',
  },
});

export default ScreenHeader;
