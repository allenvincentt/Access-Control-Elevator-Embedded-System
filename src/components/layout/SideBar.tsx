import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassLensView,
  GlassPanel,
  useAnimatedValue,
  useGlassInteraction,
  useGlassLens,
  type GlassLensTarget,
} from '@/components/GlassPanel';
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

const BRAND_TILE = require('@/assets/brand/mascot-splash-tile-1024.png');

type ItemLocalLayout = { x: number; y: number; width: number; height: number };
type GroupOffset = { x: number; y: number };

export const SIDEBAR_WIDTH_EXPANDED = 248;
export const SIDEBAR_WIDTH_COLLAPSED = 84;
export const SIDEBAR_MARGIN = 16;

const SHELL_PADDING_EXPANDED = 14;
const SHELL_PADDING_COLLAPSED = 10;
const SHELL_PADDING_VERTICAL = 18;
const BRAND_MARK_SIZE = 28;

const PILL_RADIUS = 30;
const PILL_PADDING_VERTICAL = 10;
const PILL_GAP = 12;
const GROUP_GAP_EXPANDED = 14;
const GROUP_LABEL_HEIGHT = 20;
const SCROLL_BLEED = 8;

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
  const [groupsOrigin, setGroupsOrigin] = useState<GroupOffset | null>(null);
  const [groupLayouts, setGroupLayouts] = useState<Record<string, GroupOffset>>({});
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

  const groupOffsets = useMemo(() => {
    const map: Record<string, GroupOffset> = {};
    if (!groupsOrigin) {
      return map;
    }
    for (const [label, offset] of Object.entries(groupLayouts)) {
      map[label] = { x: groupsOrigin.x + offset.x, y: groupsOrigin.y + offset.y };
    }
    return map;
  }, [groupsOrigin, groupLayouts]);

  const registerGroupsOrigin = useCallback((event: LayoutChangeEvent) => {
    const { x, y } = event.nativeEvent.layout;
    setGroupsOrigin((current) => (current && current.x === x && current.y === y ? current : { x, y }));
  }, []);

  const registerGroupLayout = useCallback((label: string, event: LayoutChangeEvent) => {
    const { x, y } = event.nativeEvent.layout;
    setGroupLayouts((current) => {
      const previous = current[label];
      if (previous && previous.x === x && previous.y === y) {
        return current;
      }
      return { ...current, [label]: { x, y } };
    });
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
    const group = groupOffsets[groupLabel];
    if (!group) {
      return;
    }

    const target: GlassLensTarget = {
      x: group.x + itemLayout.x,
      y: group.y + itemLayout.y,
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

  const mobileLens = useGlassLens('x');
  const [mobileTabLayouts, setMobileTabLayouts] = useState<
    Partial<Record<AdminSection, ItemLocalLayout>>
  >({});
  const previousMobileSection = useRef<AdminSection | null>(null);

  const registerMobileTabLayout = useCallback(
    (section: AdminSection, event: LayoutChangeEvent) => {
      const { x, y, width: itemWidth, height } = event.nativeEvent.layout;
      setMobileTabLayouts((current) => {
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
    if (!compact) {
      return;
    }
    const layout = mobileTabLayouts[activeSection];
    if (!layout) {
      return;
    }

    const target: GlassLensTarget = {
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
    };

    if (previousMobileSection.current !== activeSection) {
      previousMobileSection.current = activeSection;
      mobileLens.moveTo(target);
    } else {
      mobileLens.resize(target);
    }
  }, [activeSection, compact, mobileTabLayouts, mobileLens]);

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
          <GlassLensView
            lens={mobileLens}
            radius={TAB_BADGE_RADIUS}
            variant="chip"
            tint={colors.primaryTint}
            backgroundHint={colors.background}
            blurEnabled={false}
          />
          {adminNavFlat.map((item) => (
            <MobileNavTab
              key={item.section}
              item={item}
              active={activeSection === item.section}
              onPress={() => onNavigate(item.section)}
              onLayout={(event) => registerMobileTabLayout(item.section, event)}
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
  const groupLabelHeight = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [GROUP_LABEL_HEIGHT, 0],
  });
  const iconShift = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, NAV_ICON_CENTER_SHIFT],
  });
  const shellRadius = collapseProgress.interpolate({ inputRange: [0, 1], outputRange: [32, 40] });
  const shellPresence = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const shellShadowOpacity = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.1, 0],
  });
  const pillPresence = collapseProgress;
  const segmentPaddingHorizontal = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [SHELL_PADDING_EXPANDED, SHELL_PADDING_COLLAPSED],
  });
  const segmentPaddingVertical = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, PILL_PADDING_VERTICAL],
  });
  const shellPaddingVertical = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [SHELL_PADDING_VERTICAL, 0],
  });
  const segmentItemSpacing = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, BubbleButtonGhostMetrics.spacing],
  });
  const railGap = collapseProgress.interpolate({ inputRange: [0, 1], outputRange: [4, PILL_GAP] });
  const groupGap = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [GROUP_GAP_EXPANDED, PILL_GAP],
  });
  const brandPaddingBottom = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });
  const footerPaddingTop = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  });

  const segmentStyle = {
    paddingHorizontal: segmentPaddingHorizontal,
    paddingTop: segmentPaddingVertical,
    paddingBottom: Animated.subtract(segmentPaddingVertical, segmentItemSpacing),
  };
  const brandSegmentStyle = {
    paddingHorizontal: segmentPaddingHorizontal,
    paddingVertical: segmentPaddingVertical,
  };

  return (
    <Animated.View
      style={[
        styles.desktopRail,
        {
          marginTop: safeAreaTop + SIDEBAR_MARGIN,
          marginBottom: safeAreaBottom + SIDEBAR_MARGIN,
          marginLeft: SIDEBAR_MARGIN,
          width: panelWidth,
          paddingVertical: shellPaddingVertical,
          gap: railGap,
        },
      ]}>
      <GlassPanel
        variant="floating"
        backgroundHint={colors.background}
        reflection
        sheen
        presence={shellPresence}
        interaction={shellInteraction}
        reflectionStyle={styles.shellReflection}
        style={[
          styles.desktopShell,
          BRAND_SHADOW,
          { borderRadius: shellRadius, shadowOpacity: shellShadowOpacity },
        ]}>
        <Animated.View
          pointerEvents="none"
          style={[styles.desktopShellEdge, { borderRadius: shellRadius, opacity: shellPresence }]}
        />
      </GlassPanel>

      <SegmentPill presence={pillPresence} interaction={shellInteraction} style={brandSegmentStyle}>
        <Animated.View style={[styles.brandRow, { paddingBottom: brandPaddingBottom }]}>
          <Animated.View style={[styles.brandMark, { transform: [{ translateX: iconShift }] }]}>
            <Image
              source={BRAND_TILE}
              style={styles.brandImage}
              contentFit="contain"
              accessibilityIgnoresInvertColors
            />
          </Animated.View>
          <Animated.View style={[styles.brandText, { opacity: labelOpacity }]} pointerEvents="none">
            <Text style={styles.brandName} numberOfLines={1}>
              Elevator System
            </Text>
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[styles.brandDivider, { opacity: shellPresence }]}
          />
        </Animated.View>
      </SegmentPill>

      <ScrollView
        style={styles.nav}
        contentContainerStyle={styles.navContent}
        showsVerticalScrollIndicator={false}>
        <Animated.View pointerEvents="none" style={[styles.lensLayer, { opacity: shellPresence }]}>
          <GlassLensView
            lens={navLens}
            radius={radius.md}
            tint={colors.primaryTint}
            backgroundHint={colors.background}
          />
        </Animated.View>

        <View style={styles.navSpacer} />

        <Animated.View style={[styles.groups, { gap: groupGap }]} onLayout={registerGroupsOrigin}>
          {adminNavigation.map((group) => {
            const offset = groupOffsets[group.label];
            return (
              <SegmentPill
                key={group.label}
                presence={pillPresence}
                interaction={shellInteraction}
                style={segmentStyle}
                onLayout={(event) => registerGroupLayout(group.label, event)}>
                <Animated.View
                  pointerEvents="none"
                  style={[styles.pillLensClip, { opacity: pillPresence }]}>
                  {offset ? (
                    <View style={[styles.pillLensOrigin, { left: -offset.x, top: -offset.y }]}>
                      <GlassLensView
                        lens={navLens}
                        radius={radius.md}
                        tint={colors.primaryTint}
                        backgroundHint={colors.background}
                      />
                    </View>
                  ) : null}
                </Animated.View>
                <Animated.Text
                  style={[styles.groupLabel, { opacity: labelOpacity, height: groupLabelHeight }]}
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
              </SegmentPill>
            );
          })}
        </Animated.View>

        <View style={styles.navSpacer} />
      </ScrollView>

      <SegmentPill presence={pillPresence} interaction={shellInteraction} style={segmentStyle}>
        <Animated.View style={[styles.footer, { paddingTop: footerPaddingTop }]}>
          <Animated.View
            pointerEvents="none"
            style={[styles.footerDivider, { opacity: shellPresence }]}
          />
          <BubbleButton
            variant="ghost"
            icon={collapsed ? 'chevronRight' : 'chevronLeft'}
            label="Collapse"
            labelOpacity={labelOpacity}
            iconOffsetX={iconShift}
            backgroundHint={colors.background}
            accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            accessibilityState={{ expanded: !collapsed }}
            style={styles.navItem}
            onPress={handleToggleCollapsed}
          />
          {onSignOut ? (
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
          ) : null}
        </Animated.View>
      </SegmentPill>
    </Animated.View>
  );
}

function SegmentPill({
  children,
  presence,
  interaction,
  style,
  onLayout,
}: {
  children: ReactNode;
  presence: Animated.Value | Animated.AnimatedInterpolation<number>;
  interaction: ReturnType<typeof useGlassInteraction>;
  style: object;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  return (
    <GlassPanel
      variant="floating"
      backgroundHint={colors.background}
      reflection
      sheen
      presence={presence}
      interaction={interaction}
      reflectionStyle={styles.pillReflection}
      onLayout={onLayout}
      style={[styles.pill, style]}>
      <Animated.View pointerEvents="none" style={[styles.pillEdge, { opacity: presence }]} />
      {children}
    </GlassPanel>
  );
}

function MobileNavTab({
  item,
  active,
  onPress,
  onLayout,
}: {
  item: AdminNavItem;
  active: boolean;
  onPress: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  const interaction = useGlassInteraction();
  const activeProgress = useAnimatedValue(active ? 1 : 0);

  useEffect(() => {
    Animated.timing(activeProgress, {
      toValue: active ? 1 : 0,
      duration: GlassMotion.morph.duration,
      easing: GlassMotion.morph.easing,
      useNativeDriver: true,
    }).start();
  }, [active, activeProgress]);

  const rest = activeProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const scale = interaction.press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] });
  const label = item.shortLabel ?? item.label;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      onLayout={onLayout}
      onHoverIn={interaction.handlers.onHoverIn}
      onHoverOut={interaction.handlers.onHoverOut}
      onPressIn={interaction.handlers.onPressIn}
      onPressOut={interaction.handlers.onPressOut}
      style={styles.mobileTabPress}>
      <Animated.View style={[styles.mobileTab, { transform: [{ scale }] }]}>
        <View style={styles.mobileTabIcon}>
          <Animated.View style={[styles.mobileTabIconLayer, { opacity: rest }]}>
            <Icon name={item.icon} size={TAB_ICON_SIZE} color={colors.textMuted} />
          </Animated.View>
          <Animated.View style={[styles.mobileTabIconLayer, { opacity: activeProgress }]}>
            <Icon name={item.icon} size={TAB_ICON_SIZE} color={colors.primary} />
          </Animated.View>
        </View>

        <View style={styles.mobileTabLabelWrap}>
          <Animated.Text
            style={[styles.mobileTabLabel, { color: colors.textMuted, opacity: rest }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.1}>
            {label}
          </Animated.Text>
          <Animated.Text
            style={[
              styles.mobileTabLabel,
              styles.mobileTabLabelLayer,
              { color: colors.primary, opacity: activeProgress },
            ]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.1}>
            {label}
          </Animated.Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  desktopRail: {
    position: 'relative',
  },
  desktopShell: {
    ...StyleSheet.absoluteFill,
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
  pill: {
    borderRadius: PILL_RADIUS,
  },
  pillEdge: {
    ...StyleSheet.absoluteFill,
    borderRadius: PILL_RADIUS,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  pillReflection: {
    left: PILL_RADIUS - 6,
    right: PILL_RADIUS - 6,
  },
  pillLensClip: {
    ...StyleSheet.absoluteFill,
    borderRadius: PILL_RADIUS,
    overflow: 'hidden',
  },
  pillLensOrigin: {
    position: 'absolute',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BubbleButtonGhostMetrics.gap,
    paddingHorizontal: BubbleButtonGhostMetrics.paddingHorizontal,
  },
  brandDivider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
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
  brandImage: {
    width: BRAND_MARK_SIZE,
    height: BRAND_MARK_SIZE,
  },
  nav: {
    flex: 1,
    marginHorizontal: -SIDEBAR_MARGIN,
    marginVertical: -SCROLL_BLEED,
  },
  navContent: {
    position: 'relative',
    flexGrow: 1,
    paddingHorizontal: SIDEBAR_MARGIN,
    paddingVertical: SCROLL_BLEED,
  },
  lensLayer: {
    ...StyleSheet.absoluteFill,
  },
  navSpacer: {
    flexGrow: 1,
  },
  groups: {
    position: 'relative',
  },
  groupLabel: {
    color: colors.textMuted,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 0.6,
    paddingHorizontal: BubbleButtonGhostMetrics.paddingHorizontal,
    overflow: 'hidden',
  },
  navItem: {
    width: '100%',
    marginBottom: BubbleButtonGhostMetrics.spacing,
  },
  footer: {
    position: 'relative',
  },
  footerDivider: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
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
    position: 'relative',
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
  mobileTabLabelWrap: {
    alignSelf: 'stretch',
  },
  mobileTabLabelLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
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
