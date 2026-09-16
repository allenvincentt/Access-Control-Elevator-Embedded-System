import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassLensView,
  GlassMaterial,
  GlassPanel,
  GlassPressable,
  useAnimatedValue,
  useGlassInteraction,
  useGlassLens,
  type GlassLensTarget,
} from '@/components/GlassPanel';
import { BrandMark } from '@/components/ui/BrandMark';
import { BubbleButton, BubbleButtonGhostMetrics } from '@/components/ui/buttons/BubbleButton';
import { Icon } from '@/components/ui/Icon';
import {
  adminNavFlat,
  adminNavigation,
  type AdminNavItem,
  type AdminSection,
} from '@/constants/adminNav';
import { GlassMotion } from '@/constants/glassTheme';
import { colors, fontFamily, layout, radius } from '@/constants/themeColor';

type ItemLocalLayout = { x: number; y: number; width: number; height: number };

export const SIDEBAR_WIDTH_EXPANDED = 248;
export const SIDEBAR_WIDTH_COLLAPSED = 84;
export const SIDEBAR_MARGIN = 16;

const SHELL_PADDING_EXPANDED = 14;
const SHELL_PADDING_COLLAPSED = 10;
const BRAND_MARK_SIZE = 28;

const NAV_ICON_CENTER_SHIFT = Math.max(
  (SIDEBAR_WIDTH_COLLAPSED -
    SHELL_PADDING_COLLAPSED * 2 -
    BubbleButtonGhostMetrics.paddingHorizontal * 2 -
    BubbleButtonGhostMetrics.iconSlot) /
    2,
  0,
);

const TAB_HEIGHT = 44;
const TAB_ICON_SIZE = 19;
const TAB_BADGE_RADIUS = TAB_HEIGHT / 2;
const MOBILE_SHELL_PADDING = 5;
const MOBILE_SHELL_RADIUS = TAB_HEIGHT / 2 + MOBILE_SHELL_PADDING;

const BRAND_SHADOW = {
  shadowColor: colors.primary,
  shadowOpacity: 0.1,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 7,
};

const BRAND_SHADOW_COMPACT = {
  shadowColor: colors.primary,
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

type SideBarProps = {
  activeSection: AdminSection;
  onNavigate: (section: AdminSection) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSignOut?: () => void;
};

export function SideBar({
  activeSection,
  onNavigate,
  collapsed,
  onToggleCollapsed,
  onSignOut,
}: SideBarProps) {
  const { width } = useWindowDimensions();
  const { top: safeAreaTop, bottom: safeAreaBottom } = useSafeAreaInsets();
  const compact = width < layout.compactNavigation;
  const collapseProgress = useAnimatedValue(collapsed ? 1 : 0);
  const shellInteraction = useGlassInteraction({ shimmerOnPress: false });
  const railInteraction = useGlassInteraction({ shimmerOnPress: false });

  const navLens = useGlassLens('y');
  const [groupOffsets, setGroupOffsets] = useState<Record<string, number>>({});
  const [navItemLayouts, setNavItemLayouts] = useState<
    Partial<Record<AdminSection, ItemLocalLayout>>
  >({});
  const previousActiveSection = useRef<AdminSection | null>(null);

  const sectionGroupLabel = useMemo(() => {
    const map: Partial<Record<AdminSection, string>> = {};
    for (const group of adminNavigation) {
      for (const item of group.items) {
        map[item.section] = group.label;
      }
    }
    return map;
  }, []);

  const registerGroupLayout = useCallback((label: string, event: LayoutChangeEvent) => {
    const { y } = event.nativeEvent.layout;
    setGroupOffsets((current) => (current[label] === y ? current : { ...current, [label]: y }));
  }, []);

  const registerNavItemLayout = useCallback(
    (section: AdminSection, event: LayoutChangeEvent) => {
      const { x, y, width: itemWidth, height } = event.nativeEvent.layout;
      setNavItemLayouts((current) => {
        const previous = current[section];
        if (
          previous &&
          previous.x === x &&
          previous.y === y &&
          previous.width === itemWidth &&
          previous.height === height
        ) {
          return current;
        }
        return { ...current, [section]: { x, y, width: itemWidth, height } };
      });
    },
    [],
  );

  useEffect(() => {
    const groupLabel = sectionGroupLabel[activeSection];
    const itemLayout = navItemLayouts[activeSection];
    if (!groupLabel || !itemLayout) {
      return;
    }
    const groupY = groupOffsets[groupLabel];
    if (groupY === undefined) {
      return;
    }

    const target: GlassLensTarget = {
      x: itemLayout.x,
      y: groupY + itemLayout.y,
      width: Math.max(itemLayout.width, 24),
      height: Math.max(itemLayout.height, 30),
    };

    if (previousActiveSection.current !== activeSection) {
      previousActiveSection.current = activeSection;
      navLens.moveTo(target);
    } else {
      navLens.resize(target);
    }
  }, [activeSection, sectionGroupLabel, navItemLayouts, groupOffsets, navLens]);

  useEffect(() => {
    Animated.timing(collapseProgress, {
      toValue: collapsed ? 1 : 0,
      duration: GlassMotion.morph.duration,
      easing: GlassMotion.morph.easing,
      useNativeDriver: false,
    }).start();
  }, [collapsed, collapseProgress]);

  const handleToggleCollapsed = useCallback(() => {
    shellInteraction.triggerShimmer();
    onToggleCollapsed();
  }, [onToggleCollapsed, shellInteraction]);

  useEffect(() => {
    if (compact) {
      railInteraction.triggerShimmer();
    }
  }, [activeSection, compact, railInteraction]);

  if (compact) {
    return (
      <GlassPanel
        variant="floating"
        backgroundHint={colors.background}
        reflection
        sheen
        liveBlur
        interaction={railInteraction}
        style={[styles.mobileShell, { bottom: Math.max(safeAreaBottom, 10) + 10 }, BRAND_SHADOW_COMPACT]}>
        <View pointerEvents="none" style={styles.mobileShellEdge} />
        <View style={styles.mobileRow}>
          {adminNavFlat.map((item) => (
            <MobileNavTab
              key={item.section}
              item={item}
              active={activeSection === item.section}
              onPress={() => onNavigate(item.section)}
            />
          ))}
        </View>
      </GlassPanel>
    );
  }

  const panelWidth = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [SIDEBAR_WIDTH_EXPANDED, SIDEBAR_WIDTH_COLLAPSED],
  });
  const labelOpacity = collapseProgress.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [1, 0, 0],
  });
  const groupLabelSpace = labelOpacity.interpolate({ inputRange: [0, 1], outputRange: [0, 6] });
  const iconShift = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, NAV_ICON_CENTER_SHIFT],
  });
  const chevronRotate = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const shellRadius = collapseProgress.interpolate({ inputRange: [0, 1], outputRange: [32, 40] });

  return (
    <GlassPanel
      variant="floating"
      backgroundHint={colors.background}
      reflection
      sheen
      interaction={shellInteraction}
      reflectionStyle={styles.shellReflection}
      style={[
        styles.desktopShell,
        {
          marginTop: safeAreaTop + SIDEBAR_MARGIN,
          marginBottom: safeAreaBottom + SIDEBAR_MARGIN,
          marginLeft: SIDEBAR_MARGIN,
          width: panelWidth,
          borderRadius: shellRadius,
          paddingHorizontal: collapseProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [SHELL_PADDING_EXPANDED, SHELL_PADDING_COLLAPSED],
          }),
        },
        BRAND_SHADOW,
      ]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.desktopShellEdge, { borderRadius: shellRadius }]}
      />
      <View style={styles.brandRow}>
        <Animated.View style={[styles.brandMark, { transform: [{ translateX: iconShift }] }]}>
          <BrandMark size={BRAND_MARK_SIZE} />
        </Animated.View>
        <Animated.View style={[styles.brandText, { opacity: labelOpacity }]} pointerEvents="none">
          <Text style={styles.brandName} numberOfLines={1}>
            Elevator System
          </Text>
          <Text style={styles.brandCaption} numberOfLines={1}>
            Access Control
          </Text>
        </Animated.View>
      </View>

      <GlassPressable
        accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        variant="control"
        radius={16}
        lift={1}
        flex={0.08}
        style={styles.collapseBump}
        onPress={handleToggleCollapsed}>
        <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
          <Icon name="chevronLeft" size={14} color={colors.textMuted} />
        </Animated.View>
      </GlassPressable>

      <ScrollView
        style={styles.nav}
        contentContainerStyle={styles.navContent}
        showsVerticalScrollIndicator={false}>
        <GlassLensView
          lens={navLens}
          radius={radius.md}
          tint={colors.primaryTint}
          backgroundHint={colors.background}
        />
        {adminNavigation.map((group) => (
          <View
            key={group.label}
            style={styles.group}
            onLayout={(event) => registerGroupLayout(group.label, event)}>
            <Animated.Text
              style={[styles.groupLabel, { opacity: labelOpacity, marginBottom: groupLabelSpace }]}
              numberOfLines={1}
              pointerEvents="none">
              {group.label.toUpperCase()}
            </Animated.Text>
            {group.items.map((item) => (
              <BubbleButton
                key={item.section}
                variant="ghost"
                icon={item.icon}
                label={item.label}
                active={activeSection === item.section}
                activeSkin={false}
                labelOpacity={labelOpacity}
                iconOffsetX={iconShift}
                backgroundHint={colors.background}
                accessibilityLabel={item.label}
                accessibilityState={{ selected: activeSection === item.section }}
                style={styles.navItem}
                onLayout={(event) => registerNavItemLayout(item.section, event)}
                onPress={() => onNavigate(item.section)}
              />
            ))}
          </View>
        ))}
      </ScrollView>

      {onSignOut && (
        <View style={styles.footer}>
          <BubbleButton
            variant="ghost"
            icon="logout"
            label="Sign out"
            labelOpacity={labelOpacity}
            iconOffsetX={iconShift}
            backgroundHint={colors.background}
            accessibilityLabel="Sign out"
            style={styles.navItem}
            onPress={onSignOut}
          />
        </View>
      )}
    </GlassPanel>
  );
}

function MobileNavTab({
  item,
  active,
  onPress,
}: {
  item: AdminNavItem;
  active: boolean;
  onPress: () => void;
}) {
  const interaction = useGlassInteraction();
  const activeProgress = useAnimatedValue(active ? 1 : 0);

  useEffect(() => {
    Animated.timing(activeProgress, {
      toValue: active ? 1 : 0,
      duration: GlassMotion.morph.duration,
      easing: GlassMotion.morph.easing,
      useNativeDriver: false,
    }).start();
  }, [active, activeProgress]);

  const rest = activeProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const scale = interaction.press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] });
  const badgeScale = activeProgress.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });
  const labelColor = activeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.textMuted, colors.primary],
  });

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      onHoverIn={interaction.handlers.onHoverIn}
      onHoverOut={interaction.handlers.onHoverOut}
      onPressIn={interaction.handlers.onPressIn}
      onPressOut={interaction.handlers.onPressOut}
      style={styles.mobileTabPress}>
      <Animated.View style={[styles.mobileTab, { transform: [{ scale }] }]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.mobileTabBadge,
            { opacity: activeProgress, transform: [{ scale: badgeScale }] },
          ]}>
          <View style={styles.mobileTabBadgeFill} />
          <GlassMaterial
            variant="chip"
            radius={TAB_BADGE_RADIUS}
            backgroundHint={colors.background}
            blurEnabled={false}
          />
        </Animated.View>

        <View style={styles.mobileTabIcon}>
          <Animated.View style={[styles.mobileTabIconLayer, { opacity: rest }]}>
            <Icon name={item.icon} size={TAB_ICON_SIZE} color={colors.textMuted} />
          </Animated.View>
          <Animated.View style={[styles.mobileTabIconLayer, { opacity: activeProgress }]}>
            <Icon name={item.icon} size={TAB_ICON_SIZE} color={colors.primary} />
          </Animated.View>
        </View>

        <Animated.Text
          style={[styles.mobileTabLabel, { color: labelColor as unknown as string }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.1}>
          {item.shortLabel ?? item.label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  desktopShell: {
    paddingVertical: 18,
  },
  desktopShellEdge: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  shellReflection: {
    left: 30,
    right: 30,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BubbleButtonGhostMetrics.gap,
    paddingHorizontal: BubbleButtonGhostMetrics.paddingHorizontal,
    paddingBottom: 16,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.55)',
  },
  brandMark: {
    width: BubbleButtonGhostMetrics.iconSlot,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    flex: 1,
  },
  brandName: {
    color: colors.text,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    fontSize: 15,
  },
  brandCaption: {
    color: colors.textMuted,
    fontFamily: fontFamily.medium,
    fontWeight: '500',
    fontSize: 10.5,
  },
  collapseBump: {
    position: 'absolute',
    top: 2,
    right: -12,
    width: 30,
    height: 30,
    zIndex: 5,
  },
  nav: {
    flex: 1,
  },
  navContent: {
    position: 'relative',
    paddingBottom: 8,
  },
  group: {
    marginBottom: 14,
  },
  groupLabel: {
    color: colors.textMuted,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    fontSize: 10.5,
    letterSpacing: 0.6,
    paddingHorizontal: BubbleButtonGhostMetrics.paddingHorizontal,
  },
  navItem: {
    width: '100%',
    marginBottom: BubbleButtonGhostMetrics.spacing,
  },
  footer: {
    paddingTop: 10,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.55)',
  },
  mobileShell: {
    position: 'absolute',
    left: 26,
    right: 26,
    maxWidth: 420,
    alignSelf: 'center',
    paddingVertical: MOBILE_SHELL_PADDING,
    borderRadius: MOBILE_SHELL_RADIUS,
    zIndex: 30,
  },
  mobileShellEdge: {
    ...StyleSheet.absoluteFill,
    borderRadius: MOBILE_SHELL_RADIUS,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  mobileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  mobileTabPress: {
    flex: 1,
    minWidth: 0,
  },
  mobileTab: {
    height: TAB_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 2,
    borderRadius: TAB_BADGE_RADIUS,
  },
  mobileTabBadge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 3,
    right: 3,
    borderRadius: TAB_BADGE_RADIUS,
    overflow: 'hidden',
  },
  mobileTabBadgeFill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.primaryTint,
  },
  mobileTabIcon: {
    width: TAB_ICON_SIZE + 4,
    height: TAB_ICON_SIZE + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileTabIconLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileTabLabel: {
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    fontSize: 10,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
});

export default SideBar;
