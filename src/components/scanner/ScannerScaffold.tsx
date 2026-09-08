import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui/Icon';
import { palette, radius, shadow, spacing, typography } from '@/constants/themeColor';

export type ScannerScaffoldProps = {
  title: string;
  subtitle: string;
  step: string;
  camera: ReactNode;
  panel: ReactNode;
  onExit: () => void;
  exitIcon?: IconName;
  exitLabel?: string;
};

export function ScannerScaffold({
  title,
  subtitle,
  step,
  camera,
  panel,
  onExit,
  exitIcon = 'logout',
  exitLabel = 'Sign out',
}: ScannerScaffoldProps) {
  return (
    <View style={styles.root}>
      <View style={StyleSheet.absoluteFill}>{camera}</View>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.step}>{step}</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={exitLabel}
            hitSlop={8}
            onPress={onExit}
            style={({ pressed }) => [styles.exit, pressed && styles.exitPressed]}
          >
            <Icon name={exitIcon} size={18} color={palette.white} />
          </Pressable>
        </View>

        <View style={styles.panel}>{panel}</View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0B0706',
  },
  safe: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 3,
  },
  step: {
    color: palette.gold,
    ...typography.overline,
    letterSpacing: 0.8,
  },
  title: {
    color: palette.white,
    ...typography.title,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.78)',
    ...typography.caption,
  },
  exit: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 9, 9, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  exitPressed: {
    opacity: 0.7,
  },
  panel: {
    margin: spacing.base,
    padding: spacing.xl,
    borderRadius: radius['2xl'],
    backgroundColor: palette.surface,
    gap: spacing.md,
    ...shadow.lg,
  },
});

export default ScannerScaffold;
