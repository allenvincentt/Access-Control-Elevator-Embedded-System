import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import { palette, radius, spacing, typography } from '@/constants/themeColor';

export type ScannerStatus = 'idle' | 'scanning' | 'verifying' | 'error' | 'success';

export type ScannerOverlayProps = {
  shape?: 'square' | 'portrait';
  status: ScannerStatus;
  caption: string;
};

const MASK = 'rgba(11, 7, 6, 0.66)';

const STATUS_META: Record<ScannerStatus, { color: string; icon: IconName | null }> = {
  idle: { color: palette.gold, icon: null },
  scanning: { color: palette.gold, icon: null },
  verifying: { color: palette.white, icon: null },
  error: { color: '#FF6B60', icon: 'error' },
  success: { color: '#4ADE80', icon: 'checkCircle' },
};

export function ScannerOverlay({ shape = 'square', status, caption }: ScannerOverlayProps) {
  const { width, height } = useWindowDimensions();
  const windowWidth = Math.min(width * (shape === 'portrait' ? 0.66 : 0.74), 288);
  const windowHeight =
    shape === 'portrait' ? Math.min(windowWidth * 1.3, height * 0.42) : windowWidth;
  const sideWidth = (width - windowWidth) / 2;
  const topHeight = Math.max((height - windowHeight) / 2 - 56, 72);

  const meta = STATUS_META[status];
  const frameColor = meta.color;

  return (
    <View style={styles.root}>
      <View style={[styles.mask, { height: topHeight }]} />
      <View style={styles.middle}>
        <View style={[styles.mask, { width: sideWidth }]} />
        <View style={[styles.window, { width: windowWidth, height: windowHeight }]}>
          <View
            style={[
              styles.frame,
              {
                borderColor: frameColor,
                borderRadius: shape === 'portrait' ? windowWidth * 0.62 : radius.lg,
              },
            ]}
          />
          <Corner color={frameColor} style={styles.cTL} />
          <Corner color={frameColor} style={styles.cTR} />
          <Corner color={frameColor} style={styles.cBL} />
          <Corner color={frameColor} style={styles.cBR} />
          {status === 'scanning' && shape === 'square' ? (
            <View style={[styles.scanLine, { backgroundColor: frameColor }]} />
          ) : null}
          {status === 'verifying' ? (
            <View style={styles.centerBadge}>
              <ActivityIndicator color={palette.white} />
            </View>
          ) : null}
          {(status === 'success' || status === 'error') && meta.icon ? (
            <View style={[styles.centerBadge, { backgroundColor: frameColor }]}>
              <Icon name={meta.icon} size={30} color={palette.white} />
            </View>
          ) : null}
        </View>
        <View style={[styles.mask, { width: sideWidth }]} />
      </View>
      <View style={[styles.mask, styles.bottomMask]}>
        <View style={styles.caption}>
          <Text style={styles.captionText}>{caption}</Text>
        </View>
      </View>
    </View>
  );
}

function Corner({ style, color }: { style: ViewStyle; color: string }) {
  return <View style={[styles.corner, style, { borderColor: color }]} />;
}

const CORNER = 28;

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  mask: {
    backgroundColor: MASK,
  },
  middle: {
    flexDirection: 'row',
  },
  bottomMask: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.xl,
  },
  window: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1.5,
    opacity: 0.8,
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
  },
  cTL: { top: -3, left: -3, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  cTR: { top: -3, right: -3, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  cBL: { bottom: -3, left: -3, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  cBR: { bottom: -3, right: -3, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },
  scanLine: {
    position: 'absolute',
    left: 14,
    right: 14,
    height: 2,
    borderRadius: 2,
  },
  centerBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11, 7, 6, 0.6)',
  },
  caption: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(11, 7, 6, 0.6)',
  },
  captionText: {
    color: palette.white,
    ...typography.label,
    textAlign: 'center',
  },
});

export default ScannerOverlay;
