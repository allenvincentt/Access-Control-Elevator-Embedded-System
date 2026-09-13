import { useCallback, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
} from "react-native-reanimated";

import { CountUp, ScrollReveal, useInteraction } from "@/components/common/animations";
import { Skeleton } from "@/components/common/SkeletonLoader";
import { HintRow } from "@/components/HintRow";
import { Screen } from "@/components/layout/Screen";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { BarMeter, DonutChart, TrendChart } from "@/components/ui/charts";
import { Chip } from "@/components/ui/Chip";
import { Icon, type IconName } from "@/components/ui/Icon";
import { floorShortLabel } from "@/constants/floors";
import {
  colors,
  layout,
  palette,
  radius,
  shadow,
  spacing,
  typography,
} from "@/constants/themeColor";
import { useHomeOverview } from "@/hooks/useHomeOverview";
import { useScannerPresence } from "@/hooks/useScannerPresence";
import { DENIAL_LABELS } from "@/lib/errors";
import type { ActivityEntry, HomeOverview } from "@/types/database";

const TABLET_WIDTH = 760;
const DESKTOP_WIDTH = 1180;
const MAX_CONTENT_WIDTH = 1440;

type Tone = "brand" | "success" | "danger" | "warning" | "info";

const TONE: Record<Tone, { tint: string; fg: string; glow: string }> = {
  brand: { tint: colors.primaryTint, fg: colors.primary, glow: "rgba(178,10,7,0.30)" },
  success: { tint: colors.successTint, fg: colors.success, glow: "rgba(30,138,80,0.30)" },
  danger: { tint: colors.dangerTint, fg: colors.danger, glow: "rgba(194,31,22,0.30)" },
  warning: { tint: colors.warningTint, fg: colors.warning, glow: "rgba(217,180,17,0.34)" },
  info: { tint: colors.infoTint, fg: colors.info, glow: "rgba(28,109,166,0.30)" },
};

function percent(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return (part / whole) * 100;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";

  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const days = Math.round(hours / 24);
  if (days <= 7) return `${days} d ago`;

  return new Date(then).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function entryTitle(entry: ActivityEntry): string {
  return entry.staff_name_snapshot ?? `Badge ${entry.scanned_company_id}`;
}

function entryMeta(entry: ActivityEntry): string {
  const parts = [entry.scanned_company_id];
  if (entry.floor) parts.push(floorShortLabel(entry.floor));
  parts.push(entry.stage === "Face" ? "Badge + Face" : "Badge");
  return parts.join(" · ");
}

/* -------------------------------------------------------------- status --- */

function SystemStatusPill({ tone, label }: { tone: Tone; label: string }) {
  const meta = TONE[tone];
  return (
    <View style={styles.statusPill} accessibilityRole="summary" accessibilityLabel={label}>
      <View pointerEvents="none" style={styles.statusSheen} />
      <View style={[styles.statusDot, { backgroundColor: meta.fg }]} />
      <Text style={[styles.statusLabel, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/* ----------------------------------------------------------- KPI card ---- */

type KpiCardProps = {
  icon: IconName;
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  tone?: Tone;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

function KpiCard({
  icon,
  label,
  value,
  caption,
  tone = "brand",
  delay = 0,
  style,
  accessibilityLabel,
}: KpiCardProps) {
  const meta = TONE[tone];
  const { animatedStyle, hovered, handlers } = useInteraction({
    hoverLift: 4,
    pressScale: 1,
  });

  const surfaceStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(hovered.value, [0, 1], [colors.border, meta.fg]),
    shadowColor: meta.glow,
    shadowOpacity: 0.08 + hovered.value * 0.26,
    shadowRadius: 14 + hovered.value * 16,
    elevation: 2 + hovered.value * 6,
  }));

  return (
    <ScrollReveal delay={delay} style={style}>
      <Animated.View
        accessibilityRole="summary"
        accessibilityLabel={accessibilityLabel}
        onPointerEnter={handlers.onHoverIn}
        onPointerLeave={handlers.onHoverOut}
        style={[styles.kpiCard, shadow.sm, surfaceStyle, animatedStyle]}
      >
        <View style={[styles.kpiIcon, { backgroundColor: meta.tint }]}>
          <Icon name={icon} size={18} color={meta.fg} />
        </View>
        <Text style={styles.kpiLabel} numberOfLines={2}>
          {label}
        </Text>
        <View style={styles.kpiValueRow}>{value}</View>
        {caption ? <View style={styles.kpiCaption}>{caption}</View> : null}
      </Animated.View>
    </ScrollReveal>
  );
}

function KpiCaption({ text, tone }: { text: string; tone?: Tone }) {
  return (
    <Text style={[styles.caption, tone ? { color: TONE[tone].fg } : null]} numberOfLines={2}>
      {text}
    </Text>
  );
}

function DeltaCaption({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <KpiCaption text="No scans yesterday to compare" />;
  }

  const flat = Math.abs(delta) < 0.5;
  const up = delta > 0;
  const tone: Tone = flat ? "info" : up ? "success" : "danger";

  return (
    <View style={styles.deltaRow}>
      <Icon
        name={flat ? "activity" : up ? "trendUp" : "trendDown"}
        size={14}
        color={TONE[tone].fg}
      />
      <Text style={[styles.caption, { color: TONE[tone].fg }]} numberOfLines={1}>
        {flat ? "Level with yesterday" : `${Math.abs(delta).toFixed(0)}% vs yesterday`}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------- panel ----- */

type PanelProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
};

function Panel({ title, subtitle, action, children, delay = 0, style }: PanelProps) {
  return (
    <View style={style}>
      <ScrollReveal delay={delay} style={styles.fill}>
        <Card padding="lg" style={styles.fill}>
          <View style={styles.panelHeader}>
            <View style={styles.panelHeading}>
              <Text style={styles.panelTitle} numberOfLines={2}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={styles.panelSubtitle} numberOfLines={2}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {action}
          </View>
          {children}
        </Card>
      </ScrollReveal>
    </View>
  );
}

function EmptyNote({ children }: { children: string }) {
  return <Text style={styles.emptyNote}>{children}</Text>;
}

/* ------------------------------------------------------- activity row ---- */

function ActivityRow({
  entry,
  compact,
  last,
}: {
  entry: ActivityEntry;
  compact: boolean;
  last: boolean;
}) {
  const granted = entry.decision === "Granted";
  const named = entry.staff_name_snapshot != null;
  const status = (
    <>
      <Text style={styles.activityTime}>{relativeTime(entry.occurred_at)}</Text>
      <Chip label={granted ? "Granted" : "Denied"} tone={granted ? "success" : "danger"} size="sm" />
    </>
  );

  return (
    <View style={[styles.activityRow, last && styles.activityRowLast]}>
      <View style={styles.activityMain}>
        {named ? (
          <Avatar name={entry.staff_name_snapshot ?? ""} size={38} tone="brand" />
        ) : (
          <View style={styles.activityUnknown}>
            <Text style={styles.activityUnknownMark}>?</Text>
          </View>
        )}

        <View style={styles.activityBody}>
          <Text style={styles.activityName} numberOfLines={1}>
            {entryTitle(entry)}
          </Text>
          <Text style={styles.activityMeta} numberOfLines={1}>
            {entryMeta(entry)}
          </Text>
          {!granted && entry.reason ? (
            <Text style={styles.activityReason} numberOfLines={1}>
              {`Denied — ${DENIAL_LABELS[entry.reason]}`}
            </Text>
          ) : null}
          {compact ? <View style={styles.activityStatusCompact}>{status}</View> : null}
        </View>

        {compact ? null : <View style={styles.activityStatus}>{status}</View>}
      </View>
    </View>
  );
}

/* -------------------------------------------------------------- screen --- */

export type HomeScreenProps = {
  /** Jumps to the Logs tab from the activity panel. */
  onViewLogs?: () => void;
};

export function HomeScreen({ onViewLogs }: HomeScreenProps) {
  const { overview, loading, refreshing, error, refresh } = useHomeOverview();
  const scanners = useScannerPresence();

  const { width: windowWidth } = useWindowDimensions();
  const [measured, setMeasured] = useState(0);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setMeasured((current) => (current === next ? current : next));
  }, []);

  const width =
    measured ||
    Math.min(Math.max(windowWidth - layout.screenPadding * 2, 280), MAX_CONTENT_WIDTH);
  const desktop = width >= DESKTOP_WIDTH;
  const wide = width >= TABLET_WIDTH;

  const kpiColumns = desktop ? 5 : wide ? 3 : 2;
  const kpiWidth = Math.floor((width - spacing.md * (kpiColumns - 1)) / kpiColumns);

  const handleRefresh = useCallback(() => {
    void refresh();
    scanners.refresh();
  }, [refresh, scanners]);

  const systemStatus = resolveSystemStatus(error, scanners);

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={handleRefresh}
      header={
        <ScreenHeader
          overline="Overview"
          title="Home"
          subtitle="System overview — one building, one elevator bank"
          right={
            <SystemStatusPill
              tone={systemStatus.tone}
              label={wide ? systemStatus.label : systemStatus.shortLabel}
            />
          }
        />
      }
    >
      <View style={styles.content} onLayout={handleLayout}>
        {error ? (
          <HintRow tone="danger" title="Could not load the dashboard">
            {error}
          </HintRow>
        ) : null}

        {loading && !overview ? (
          <LoadingState columns={kpiColumns} itemWidth={kpiWidth} wide={wide} />
        ) : overview ? (
          <>
            <KpiGrid
              overview={overview}
              scanners={scanners}
              itemWidth={kpiWidth}
              columns={kpiColumns}
            />

            {overview.faces_missing > 0 ? (
              <HintRow tone="warning" title="Enrollment gap">
                {`${overview.faces_missing} staff ${
                  overview.faces_missing === 1 ? "member has" : "members have"
                } no face template. They are stopped at the badge step until a face is registered.`}
              </HintRow>
            ) : null}

            <View style={[styles.row, !desktop && styles.rowStacked]}>
              <Panel
                title="Access Attempts — Last 7 Days"
                subtitle="Badge + face verification events"
                delay={180}
                style={desktop ? styles.flexWide : styles.full}
              >
                <TrendChart
                  points={overview.days.map((day) => day.attempts)}
                  labels={overview.days.map((day) => day.weekday)}
                  height={desktop ? 168 : 148}
                  color={colors.primary}
                  accessibilityLabel={`Access attempts for the last seven days, ${overview.attempts_7d} in total`}
                />
              </Panel>

              <View
                style={[
                  styles.row,
                  desktop ? styles.flexPair : styles.full,
                  !wide && styles.rowStacked,
                ]}
              >
                <GrantedVsDeniedPanel
                  overview={overview}
                  style={wide ? styles.flexEqual : styles.full}
                />
                <DenialReasonsPanel
                  overview={overview}
                  style={wide ? styles.flexEqual : styles.full}
                />
              </View>
            </View>

            <View style={[styles.row, !wide && styles.rowStacked]}>
              <BusiestFloorsPanel overview={overview} style={wide ? styles.flexNarrow : styles.full} />
              <RecentActivityPanel
                overview={overview}
                compact={!wide}
                onViewLogs={onViewLogs}
                style={wide ? styles.flexWide : styles.full}
              />
            </View>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

/* ----------------------------------------------------------- sections ---- */

const KPI_COUNT = 5;

function KpiGrid({
  overview,
  scanners,
  itemWidth,
  columns,
}: {
  overview: HomeOverview;
  scanners: ReturnType<typeof useScannerPresence>;
  itemWidth: number;
  columns: number;
}) {
  const grantedRate = percent(overview.granted_today, overview.attempts_today);
  const enrollmentRate = percent(overview.faces_enrolled, overview.staff_total);
  const delta =
    overview.attempts_yesterday > 0
      ? ((overview.attempts_today - overview.attempts_yesterday) / overview.attempts_yesterday) * 100
      : null;

  const scannerReadable = scanners.supported && scanners.reachable;
  const scannerCaption = !scanners.supported
    ? "Bluetooth needs the mobile app"
    : scanners.checking && !scanners.reachable
      ? "Checking the Bluetooth link…"
      : !scanners.reachable
        ? "Controller out of range"
        : scanners.online > 0
          ? "Live on the Bluetooth link"
          : "No scanner connected";

  const item = { width: itemWidth };
  // A card left alone on the last row reads as a gap; let it span instead.
  const lastItem = KPI_COUNT % columns === 1 ? styles.full : item;

  return (
    <View style={styles.kpiGrid}>
      <KpiCard
        icon="activity"
        label="Access attempts today"
        tone="brand"
        delay={0}
        style={item}
        accessibilityLabel={`${overview.attempts_today} access attempts today`}
        value={<CountUp value={overview.attempts_today} style={styles.kpiValue} />}
        caption={<DeltaCaption delta={delta} />}
      />

      <KpiCard
        icon="shield"
        label="Granted rate"
        tone="success"
        delay={70}
        style={item}
        accessibilityLabel={`Granted rate ${grantedRate.toFixed(1)} percent`}
        value={
          <CountUp value={grantedRate} decimals={1} suffix="%" delay={70} style={styles.kpiValue} />
        }
        caption={
          <KpiCaption
            text={`${overview.granted_today} of ${overview.attempts_today} attempts`}
          />
        }
      />

      <KpiCard
        icon="warning"
        label="Denied — needs review"
        tone={overview.needs_review_today > 0 ? "warning" : "success"}
        delay={140}
        style={item}
        accessibilityLabel={`${overview.needs_review_today} denials flagged for review`}
        value={<CountUp value={overview.needs_review_today} delay={140} style={styles.kpiValue} />}
        caption={
          <KpiCaption
            text={
              overview.needs_review_today > 0
                ? "Flagged for admin review"
                : "Nothing to review today"
            }
            tone={overview.needs_review_today > 0 ? "warning" : undefined}
          />
        }
      />

      <KpiCard
        icon="staff"
        label="Staff enrolled"
        tone={overview.faces_missing > 0 ? "warning" : "success"}
        delay={210}
        style={item}
        accessibilityLabel={`${overview.faces_enrolled} of ${overview.staff_total} staff enrolled`}
        value={
          <>
            <CountUp value={overview.faces_enrolled} delay={210} style={styles.kpiValue} />
            <Text style={styles.kpiValueDivider}>/</Text>
            <Text style={styles.kpiValueMuted}>{overview.staff_total}</Text>
          </>
        }
        caption={<KpiCaption text={`${enrollmentRate.toFixed(1)}% face-enrollment`} />}
      />

      <KpiCard
        icon="bluetooth"
        label="Scanners online"
        tone={scannerReadable && scanners.online > 0 ? "success" : "info"}
        delay={280}
        style={lastItem}
        accessibilityLabel={
          scannerReadable
            ? `${scanners.online} scanners connected over Bluetooth`
            : "Scanner count unavailable"
        }
        value={
          scannerReadable ? (
            <CountUp value={scanners.online} delay={280} style={styles.kpiValue} />
          ) : (
            <Text style={[styles.kpiValue, styles.kpiValueMuted]}>—</Text>
          )
        }
        caption={
          <KpiCaption
            text={scannerCaption}
            tone={scannerReadable && scanners.online > 0 ? "success" : undefined}
          />
        }
      />
    </View>
  );
}

function GrantedVsDeniedPanel({
  overview,
  style,
}: {
  overview: HomeOverview;
  style?: StyleProp<ViewStyle>;
}) {
  const total = overview.granted_7d + overview.denied_7d;
  const rate = percent(overview.granted_7d, total);

  return (
    <Panel title="Granted vs Denied" delay={250} style={style}>
      {total === 0 ? (
        <EmptyNote>No verification activity in the last 7 days.</EmptyNote>
      ) : (
        <View style={styles.donutWrap}>
          <DonutChart
            value={total > 0 ? overview.granted_7d / total : 0}
            size={168}
            thickness={20}
            color={colors.success}
            trackColor={colors.danger}
            animationDelay={250}
            accessibilityLabel={`${rate.toFixed(1)} percent of attempts granted in the last 7 days`}
          >
            <CountUp
              value={rate}
              decimals={1}
              suffix="%"
              delay={250}
              style={styles.donutValue}
            />
            <Text style={styles.donutCaption}>granted</Text>
          </DonutChart>

          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
              <Text style={styles.legendLabel}>{`Granted (${overview.granted_7d})`}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
              <Text style={styles.legendLabel}>{`Denied (${overview.denied_7d})`}</Text>
            </View>
          </View>
        </View>
      )}
    </Panel>
  );
}

function DenialReasonsPanel({
  overview,
  style,
}: {
  overview: HomeOverview;
  style?: StyleProp<ViewStyle>;
}) {
  const reasons = overview.denial_reasons;
  const peak = reasons.length > 0 ? Math.max(...reasons.map((entry) => entry.count)) : 0;

  return (
    <Panel title="Denial Reasons" subtitle="Last 7 days" delay={320} style={style}>
      {reasons.length === 0 ? (
        <EmptyNote>No denials in the last 7 days.</EmptyNote>
      ) : (
        <View style={styles.meterList}>
          {reasons.map((entry, index) => (
            <BarMeter
              key={entry.reason}
              label={DENIAL_LABELS[entry.reason]}
              value={entry.count}
              ratio={peak > 0 ? entry.count / peak : 0}
              color={colors.danger}
              animationDelay={320 + index * 70}
            />
          ))}
        </View>
      )}
    </Panel>
  );
}

function BusiestFloorsPanel({
  overview,
  style,
}: {
  overview: HomeOverview;
  style?: StyleProp<ViewStyle>;
}) {
  const floors = overview.busiest_floors;
  const peak = floors.length > 0 ? Math.max(...floors.map((entry) => entry.count)) : 0;

  return (
    <Panel title="Busiest Floors" subtitle="Today, by entry count" delay={380} style={style}>
      {floors.length === 0 ? (
        <EmptyNote>No floor releases yet today.</EmptyNote>
      ) : (
        <View style={styles.meterList}>
          {floors.map((entry, index) => (
            <BarMeter
              key={entry.floor}
              label={floorShortLabel(entry.floor)}
              value={entry.count}
              ratio={peak > 0 ? entry.count / peak : 0}
              color={colors.secondary}
              animationDelay={380 + index * 70}
            />
          ))}
        </View>
      )}
    </Panel>
  );
}

function RecentActivityPanel({
  overview,
  compact,
  onViewLogs,
  style,
}: {
  overview: HomeOverview;
  compact: boolean;
  onViewLogs?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Panel
      title="Recent Activity"
      delay={440}
      style={style}
      action={
        onViewLogs ? (
          <ViewLogsAction onPress={onViewLogs} compact={compact} />
        ) : undefined
      }
    >
      {overview.recent.length === 0 ? (
        <EmptyNote>Nothing has been scanned yet.</EmptyNote>
      ) : (
        <View style={styles.activityList}>
          {overview.recent.map((entry, index) => (
            <ActivityRow
              key={entry.id}
              entry={entry}
              compact={compact}
              last={index === overview.recent.length - 1}
            />
          ))}
        </View>
      )}
    </Panel>
  );
}

function ViewLogsAction({ onPress, compact }: { onPress: () => void; compact: boolean }) {
  const { animatedStyle, handlers } = useInteraction({ hoverLift: 2, pressScale: 0.96 });

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="View all access logs"
        onPress={onPress}
        onHoverIn={handlers.onHoverIn}
        onHoverOut={handlers.onHoverOut}
        onPressIn={handlers.onPressIn}
        onPressOut={handlers.onPressOut}
        onFocus={handlers.onFocus}
        onBlur={handlers.onBlur}
        style={styles.linkAction}
      >
        <Text style={styles.linkLabel}>{compact ? "All logs" : "View all access logs"}</Text>
        <Icon name="chevronRight" size={16} color={colors.primary} />
      </Pressable>
    </Animated.View>
  );
}

function LoadingState({
  columns,
  itemWidth,
  wide,
}: {
  columns: number;
  itemWidth: number;
  wide: boolean;
}) {
  return (
    <>
      <View style={styles.kpiGrid}>
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} width={itemWidth} height={148} rounded="lg" />
        ))}
      </View>
      <View style={[styles.row, !wide && styles.rowStacked]}>
        <View style={wide ? styles.flexWide : styles.full}>
          <Skeleton height={260} rounded="lg" />
        </View>
        <View style={wide ? styles.flexNarrow : styles.full}>
          <Skeleton height={260} rounded="lg" />
        </View>
      </View>
      <Skeleton height={280} rounded="lg" />
    </>
  );
}

/* ------------------------------------------------------------ helpers ---- */

function resolveSystemStatus(
  error: string | null,
  scanners: ReturnType<typeof useScannerPresence>,
): { tone: Tone; label: string; shortLabel: string } {
  if (error) {
    return { tone: "danger", label: "Service degraded", shortLabel: "Degraded" };
  }
  if (scanners.supported && !scanners.reachable && !scanners.checking) {
    return { tone: "warning", label: "Controller unreachable", shortLabel: "No link" };
  }
  if (scanners.supported && scanners.reachable && scanners.online === 0) {
    return { tone: "warning", label: "No scanners online", shortLabel: "No scanners" };
  }
  return { tone: "success", label: "All Systems Operational", shortLabel: "Operational" };
}

/* ------------------------------------------------------------- styles ---- */

const styles = StyleSheet.create({
  content: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
    gap: spacing.base,
  },
  fill: {
    // flexGrow (not flex) so the panel still measures by content when its
    // parent has no definite height, and fills the row when it does.
    flexGrow: 1,
  },
  full: {
    width: "100%",
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.md,
  },
  rowStacked: {
    flexDirection: "column",
  },
  flexWide: {
    flex: 2.05,
    minWidth: 0,
  },
  flexNarrow: {
    flex: 1,
    minWidth: 0,
  },
  flexPair: {
    flex: 2.2,
    minWidth: 0,
  },
  flexEqual: {
    flex: 1,
    minWidth: 0,
  },

  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.glassStroke,
    backgroundColor: palette.glassFill,
    overflow: "hidden",
    ...shadow.sm,
  },
  statusSheen: {
    position: "absolute",
    top: 0,
    left: "14%",
    right: "14%",
    height: 1,
    backgroundColor: "rgba(255,255,255,0.75)",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    ...typography.caption,
    fontWeight: "700",
  },

  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  kpiCard: {
    flexGrow: 1,
    gap: spacing.sm,
    padding: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  kpiIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiLabel: {
    color: colors.textSecondary,
    ...typography.overline,
    textTransform: "uppercase",
  },
  kpiValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  kpiValue: {
    color: colors.text,
    ...typography.display,
    fontVariant: ["tabular-nums"],
  },
  kpiValueDivider: {
    color: colors.textMuted,
    ...typography.title,
  },
  kpiValueMuted: {
    color: colors.textMuted,
    ...typography.title,
    fontVariant: ["tabular-nums"],
  },
  kpiCaption: {
    marginTop: -2,
  },
  caption: {
    color: colors.textMuted,
    ...typography.caption,
  },
  deltaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  panelHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.base,
  },
  panelHeading: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  panelTitle: {
    color: colors.text,
    ...typography.subheading,
  },
  panelSubtitle: {
    color: colors.textMuted,
    ...typography.caption,
  },
  emptyNote: {
    color: colors.textMuted,
    ...typography.caption,
    lineHeight: 18,
  },

  donutWrap: {
    alignItems: "center",
    gap: spacing.base,
    paddingVertical: spacing.xs,
  },
  donutValue: {
    color: colors.text,
    ...typography.title,
    fontVariant: ["tabular-nums"],
  },
  donutCaption: {
    color: colors.textMuted,
    ...typography.caption,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.base,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    color: colors.textSecondary,
    ...typography.caption,
  },

  meterList: {
    gap: spacing.md,
  },

  linkAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  linkLabel: {
    color: colors.primary,
    ...typography.label,
  },

  activityList: {
    gap: spacing.xs,
  },
  activityRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  activityRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  activityMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  activityUnknown: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSunken,
  },
  activityUnknownMark: {
    color: colors.textMuted,
    ...typography.subheading,
  },
  activityBody: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  activityName: {
    color: colors.text,
    ...typography.bodyStrong,
  },
  activityMeta: {
    color: colors.textSecondary,
    ...typography.caption,
  },
  activityReason: {
    color: colors.warning,
    ...typography.caption,
  },
  activityStatus: {
    alignItems: "flex-end",
    gap: 6,
  },
  activityStatusCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 4,
  },
  activityTime: {
    color: colors.textMuted,
    ...typography.caption,
    fontVariant: ["tabular-nums"],
  },
});

export default HomeScreen;
