import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, radius, shadow, spacing, typography } from '@/constants/themeColor';

export type SnackbarVariant = 'default' | 'success' | 'error' | 'info';

export type SnackbarOptions = {
  variant?: SnackbarVariant;
  duration?: number;
  action?: { label: string; onPress: () => void };
};

type SnackbarState = SnackbarOptions & { id: number; message: string };

type SnackbarContextValue = {
  show: (message: string, options?: SnackbarOptions) => void;
  hide: () => void;
};

const SnackbarContext = createContext<SnackbarContextValue | null>(null);

const VARIANT_META: Record<SnackbarVariant, { icon: IconName; accent: string }> = {
  default: { icon: 'info', accent: colors.secondary },
  success: { icon: 'checkCircle', accent: colors.success },
  error: { icon: 'error', accent: colors.danger },
  info: { icon: 'info', accent: colors.info },
};

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<SnackbarState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setCurrent(null);
  }, [clearTimer]);

  const show = useCallback(
    (message: string, options?: SnackbarOptions) => {
      clearTimer();
      counter.current += 1;
      const next: SnackbarState = {
        id: counter.current,
        message,
        variant: options?.variant ?? 'default',
        duration: options?.duration ?? 3600,
        action: options?.action,
      };
      setCurrent(next);
      if (next.duration && next.duration > 0) {
        timer.current = setTimeout(() => setCurrent((value) => (value?.id === next.id ? null : value)), next.duration);
      }
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  const value = useMemo(() => ({ show, hide }), [show, hide]);
  const meta = current ? VARIANT_META[current.variant ?? 'default'] : null;

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      {current && meta ? (
        <View style={[styles.host, { paddingBottom: insets.bottom + 92 }]}>
          <View style={styles.bar} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <View style={[styles.iconWrap, { backgroundColor: meta.accent }]}>
              <Icon name={meta.icon} size={16} color={colors.onDark} />
            </View>
            <Text style={styles.message} numberOfLines={3}>
              {current.message}
            </Text>
            {current.action ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  current.action?.onPress();
                  hide();
                }}
                style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
              >
                <Text style={styles.actionLabel}>{current.action.label}</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
                hitSlop={8}
                onPress={hide}
                style={({ pressed }) => [styles.close, pressed && styles.actionPressed]}
              >
                <Icon name="close" size={16} color={colors.onDark} />
              </Pressable>
            )}
          </View>
        </View>
      ) : null}
    </SnackbarContext.Provider>
  );
}

export function useSnackbar() {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error('useSnackbar must be used within a SnackbarProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.base,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  bar: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.text,
    ...shadow.lg,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    flex: 1,
    color: colors.onDark,
    ...typography.bodyStrong,
  },
  action: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  actionPressed: {
    opacity: 0.6,
  },
  actionLabel: {
    color: colors.secondary,
    ...typography.button,
  },
  close: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
});

export default SnackbarProvider;
