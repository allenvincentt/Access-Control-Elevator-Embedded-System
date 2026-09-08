import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/constants/themeColor';

export type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  rounded?: keyof typeof radius | number;
  style?: StyleProp<ViewStyle>;
};

export function Skeleton({ width = '100%', height = 16, rounded = 'sm', style }: SkeletonProps) {
  const borderRadius = typeof rounded === 'number' ? rounded : radius[rounded];
  return <View style={[styles.block, { width, height, borderRadius }, style]} />;
}

export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.row}>
          <Skeleton width={48} height={48} rounded="pill" />
          <View style={styles.rowBody}>
            <Skeleton width="55%" height={14} />
            <Skeleton width="80%" height={12} />
            <Skeleton width="40%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.surfaceSunken,
  },
  list: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowBody: {
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
  },
});

export default Skeleton;
