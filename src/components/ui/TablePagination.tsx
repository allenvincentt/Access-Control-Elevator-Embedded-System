import { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { useInteraction } from '@/components/common/animations';
import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, fontFamily, radius, shadow, spacing, typography } from '@/constants/themeColor';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export type TablePaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizes?: readonly number[];
  noun?: string;
  busy?: boolean;
  attached?: boolean;
};

type Anchor = { x: number; y: number; width: number };

const MENU_WIDTH = 140;
const MENU_GAP = 6;

export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizes = PAGE_SIZE_OPTIONS,
  noun = 'records',
  busy = false,
  attached = false,
}: TablePaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount - 1);
  const [draft, setDraft] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const sizeButton = useRef<View>(null);
  const { height: windowHeight } = useWindowDimensions();

  const commit = () => {
    if (draft == null) return;
    const parsed = Number.parseInt(draft, 10);
    setDraft(null);
    if (!Number.isFinite(parsed)) return;
    const next = Math.min(Math.max(parsed, 1), pageCount) - 1;
    if (next !== current) onPageChange(next);
  };

  const openMenu = () => {
    sizeButton.current?.measureInWindow((x, y, width) => {
      setAnchor({ x, y, width });
    });
  };

  const choose = (size: number) => {
    setAnchor(null);
    if (size !== pageSize) onPageSizeChange(size);
  };

  return (
    <View style={[styles.bar, attached ? styles.barAttached : styles.barStandalone]}>
      <View style={styles.pager}>
        <PagerButton
          icon="back"
          label="Previous page"
          disabled={busy || current <= 0}
          onPress={() => onPageChange(current - 1)}
        />
        <Text style={styles.text}>Page</Text>
        <TextInput
          value={draft ?? `${current + 1}`}
          onChangeText={(text) => setDraft(text.replace(/[^0-9]/g, ''))}
          onFocus={() => setDraft(`${current + 1}`)}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="number-pad"
          returnKeyType="go"
          selectTextOnFocus
          editable={!busy}
          accessibilityLabel={`Page number, ${current + 1} of ${pageCount}`}
          style={styles.pageInput}
        />
        <Text style={styles.text}>{`of ${pageCount}`}</Text>
        <PagerButton
          icon="chevronRight"
          label="Next page"
          disabled={busy || current >= pageCount - 1}
          onPress={() => onPageChange(current + 1)}
        />
      </View>

      <View style={styles.meta}>
        <View ref={sizeButton} collapsable={false}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${pageSize} rows per page`}
            accessibilityState={{ expanded: anchor != null }}
            onPress={openMenu}
            style={({ hovered }) => [styles.sizeButton, hovered && styles.sizeButtonHover]}
          >
            <Text style={styles.sizeLabel}>{`${pageSize} rows`}</Text>
            <Icon name="chevronDown" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
        <Text style={styles.count}>{`${total.toLocaleString()} ${noun}`}</Text>
      </View>

      <Modal
        visible={anchor != null}
        transparent
        animationType="fade"
        onRequestClose={() => setAnchor(null)}
      >
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setAnchor(null)}
            accessibilityLabel="Close"
          />
          {anchor ? (
            <View
              style={[
                styles.menu,
                {
                  left: anchor.x,
                  bottom: windowHeight - anchor.y + MENU_GAP,
                  minWidth: Math.max(MENU_WIDTH, anchor.width),
                },
              ]}
              accessibilityRole="menu"
            >
              {pageSizes.map((size) => {
                const active = size === pageSize;
                return (
                  <Pressable
                    key={size}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: active }}
                    onPress={() => choose(size)}
                    style={({ hovered }) => [
                      styles.menuItem,
                      hovered && styles.menuItemHover,
                    ]}
                  >
                    <Text style={[styles.menuLabel, active && styles.menuLabelActive]}>
                      {`${size} rows`}
                    </Text>
                    {active ? <Icon name="check" size={16} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function PagerButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { animatedStyle, handlers } = useInteraction({
    hoverLift: 2,
    pressScale: 0.94,
    disabled,
  });

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onHoverIn={handlers.onHoverIn}
        onHoverOut={handlers.onHoverOut}
        onPressIn={handlers.onPressIn}
        onPressOut={handlers.onPressOut}
        onFocus={handlers.onFocus}
        onBlur={handlers.onBlur}
        style={({ hovered }) => [styles.pagerButton, hovered && !disabled && styles.pagerButtonHover]}
      >
        <Icon name={icon} size={16} color={colors.textSecondary} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  barAttached: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  barStandalone: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadow.sm,
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  pagerButton: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  pagerButtonHover: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  text: {
    color: colors.textSecondary,
    ...typography.label,
  },
  pageInput: {
    width: 48,
    height: 34,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    textAlign: 'center',
    color: colors.text,
    ...typography.label,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    paddingVertical: 0,
    backgroundColor: colors.surface,
  },
  sizeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sizeButtonHover: {
    borderColor: colors.primary,
  },
  sizeLabel: {
    color: colors.text,
    ...typography.label,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
  },
  count: {
    color: colors.textMuted,
    ...typography.caption,
    fontVariant: ['tabular-nums'],
  },
  backdrop: {
    flex: 1,
  },
  menu: {
    position: 'absolute',
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadow.md,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  menuItemHover: {
    backgroundColor: colors.surfaceSunken,
  },
  menuLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  menuLabelActive: {
    color: colors.text,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
  },
});

export default TablePagination;
