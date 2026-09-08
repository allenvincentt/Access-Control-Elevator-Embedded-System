import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Modal as RNModal,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, radius, shadow, spacing, typography } from '@/constants/themeColor';

export type ModalProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  subtitle?: string;
  icon?: IconName;
  variant?: 'auto' | 'sheet' | 'center';
  dismissOnBackdropPress?: boolean;
  showClose?: boolean;
  footer?: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

const SHEET_BREAKPOINT = 768;
const OPEN_DURATION = 240;
const CLOSE_DURATION = 180;

export function Modal({
  visible,
  onClose,
  children,
  title,
  subtitle,
  icon,
  variant = 'auto',
  dismissOnBackdropPress = true,
  showClose = true,
  footer,
  scroll = true,
  contentStyle,
}: ModalProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const asSheet = variant === 'sheet' || (variant === 'auto' && width < SHEET_BREAKPOINT);

  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const openedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      openedRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount for the enter animation
      setMounted(true);
      progress.set(withTiming(1, { duration: OPEN_DURATION, easing: Easing.out(Easing.cubic) }));
      return;
    }
    if (!openedRef.current) return;
    progress.set(withTiming(0, { duration: CLOSE_DURATION, easing: Easing.in(Easing.cubic) }));
    const timeout = setTimeout(() => setMounted(false), CLOSE_DURATION + 40);
    return () => clearTimeout(timeout);
  }, [visible, progress]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: asSheet
      ? [{ translateY: (1 - progress.value) * 72 }]
      : [
          { translateY: (1 - progress.value) * 16 },
          { scale: 0.94 + progress.value * 0.06 },
        ],
  }));

  if (!mounted) return null;

  const header =
    title || icon ? (
      <View style={styles.header}>
        {icon ? (
          <View style={styles.headerBadge}>
            <Icon name={icon} size={20} color={colors.primary} />
          </View>
        ) : null}
        <View style={styles.headerText}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {showClose ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={10}
            onPress={onClose}
            style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
          >
            <Icon name="close" size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
    ) : null;

  const body = scroll ? (
    <ScrollView
      style={styles.scrollArea}
      contentContainerStyle={styles.bodyContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.bodyContent}>{children}</View>
  );

  return (
    <RNModal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={dismissOnBackdropPress ? onClose : undefined}
          />
        </Animated.View>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
          style={[styles.avoider, asSheet ? styles.avoiderSheet : styles.avoiderCenter]}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              asSheet ? styles.sheet : styles.card,
              asSheet
                ? { paddingBottom: insets.bottom + spacing.base, maxHeight: '92%' }
                : { marginTop: insets.top, marginBottom: insets.bottom, maxHeight: '86%' },
              contentAnimStyle,
              contentStyle,
            ]}
          >
            {asSheet ? (
              <View style={styles.grabberArea}>
                <View style={styles.grabber} />
              </View>
            ) : null}
            {header}
            {body}
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
  },
  avoider: {
    flex: 1,
  },
  avoiderSheet: {
    justifyContent: 'flex-end',
  },
  avoiderCenter: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  sheet: {
    width: '100%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    ...shadow.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    ...shadow.lg,
  },
  grabberArea: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.base,
  },
  headerBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryTint,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    ...typography.heading,
  },
  subtitle: {
    color: colors.textSecondary,
    ...typography.caption,
  },
  close: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
  },
  closePressed: {
    opacity: 0.6,
  },
  scrollArea: {
    flexGrow: 0,
    flexShrink: 1,
  },
  bodyContent: {
    paddingBottom: spacing.xs,
  },
  footer: {
    paddingTop: spacing.base,
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
});

export default Modal;
