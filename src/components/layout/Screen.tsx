import { type ReactNode } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout, spacing } from '@/constants/themeColor';

export type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomClearance?: boolean;
  background?: string;
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({
  children,
  scroll = true,
  padded = true,
  header,
  footer,
  refreshing = false,
  onRefresh,
  bottomClearance = true,
  background = colors.background,
  contentStyle,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const paddingBottom = (bottomClearance ? layout.bottomNavClearance : spacing.xl) + insets.bottom;
  const innerPadding = padded ? { paddingHorizontal: layout.screenPadding } : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: background }]} edges={['top']}>
      {header ? <View style={[styles.header, innerPadding]}>{header}</View> : null}
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            innerPadding,
            { paddingBottom },
            contentStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, innerPadding, { paddingBottom }, contentStyle]}>{children}</View>
      )}
      {footer ? <View style={[styles.footer, innerPadding]}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  scrollContent: {
    paddingTop: spacing.xs,
    gap: spacing.base,
  },
  footer: {
    paddingTop: spacing.md,
    paddingBottom: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});

export default Screen;
