import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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

import {
  CountUp,
  ScrollReveal,
  useInteraction,
} from "@/components/common/animations";
import { Skeleton } from "@/components/common/SkeletonLoader";
import { HintRow } from "@/components/HintRow";
import { Screen } from "@/components/layout/Screen";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import {
  BarChart,
  BarMeter,
  DonutChart,
  type BarChartDatum,
} from "@/components/ui/charts";
import { Chip } from "@/components/ui/Chip";
import { Icon, type IconName } from "@/components/ui/Icon";
import { floorShortLabel } from "@/constants/floors";
import {
  colors,
  fontFamily,
  gradient,
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
import {
  MOST_ACTIVE_DAYS,
  type HomeInsights,
  type LastEntry,
} from "@/services/dashboardService";
import type {
  ActivityEntry,
  HomeOverview,
  HomeOverviewDay,
} from "@/types/database";

const TABLET_WIDTH = 760;
const DESKTOP_WIDTH = 1180;
const MAX_CONTENT_WIDTH = 1440;

type Tone = "brand" | "success" | "danger" | "warning" | "info";

const TONE: Record<Tone, { tint: string; fg: string; glow: string }> = {
  brand: {
    tint: colors.primaryTint,
    fg: colors.primary,
    glow: "rgba(178,10,7,0.30)",
  },
  success: {
    tint: colors.successTint,
    fg: colors.success,
    glow: "rgba(30,138,80,0.30)",
  },
  danger: {
    tint: colors.dangerTint,
    fg: colors.danger,
    glow: "rgba(194,31,22,0.30)",
  },
  warning: {
    tint: colors.warningTint,
    fg: colors.warning,
    glow: "rgba(217,180,17,0.34)",
  },
  info: {
    tint: colors.infoTint,
    fg: colors.info,
    glow: "rgba(28,109,166,0.30)",
  },
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
    <View
      style={styles.statusPill}
      accessibilityRole="summary"
      accessibilityLabel={label}
    >
      <View pointerEvents="none" style={styles.statusSheen} />
      <View style={[styles.statusDot, { backgroundColor: meta.fg }]} />
      <Text
        style={[styles.statusLabel, { color: colors.text }]}
        numberOfLines={1}
      >
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
  featured?: boolean;
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
  featured = false,
  delay = 0,
  style,
  accessibilityLabel,
}: KpiCardProps) {
  const meta = TONE[tone];
  const restBorder = featured ? "rgba(255,255,255,0.18)" : colors.border;
  const hoverBorder = featured ? "rgba(255,255,255,0.55)" : meta.fg;
  const { animatedStyle, hovered, handlers } = useInteraction({
    hoverLift: 4,
    pressScale: 1,
  });

  const surfaceStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      hovered.value,
      [0, 1],
      [restBorder, hoverBorder],
    ),
    shadowColor: meta.glow,
    shadowOpacity: (featured ? 0.22 : 0.08) + hovered.value * 0.26,
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
        style={[
          styles.kpiCard,
          featured && styles.kpiCardFeatured,
          shadow.sm,
          surfaceStyle,
          animatedStyle,
        ]}
      >
        {featured ? (
          <View
            pointerEvents="none"
            style={[styles.kpiFeaturedFill, gradient("base")]}
          />
        ) : null}
        <View
          style={[
            styles.kpiIcon,
            { backgroundColor: featured ? "rgba(255,255,255,0.18)" : meta.tint },
          ]}
        >
          <Icon name={icon} size={18} color={featured ? colors.onPrimary : meta.fg} />
        </View>
        <Text
          style={[styles.kpiLabel, featured && styles.kpiLabelFeatured]}
          numberOfLines={2}
        >
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
    <Text
      style={[styles.caption, tone ? { color: TONE[tone].fg } : null]}
      numberOfLines={2}
    >
      {text}
    </Text>
  );
}

function DeltaCaption({
  delta,
  inverse = false,
}: {
  delta: number | null;
  inverse?: boolean;
}) {
  if (delta === null) {
    return (
      <Text
        style={[styles.caption, inverse && styles.captionInverse]}
        numberOfLines={2}
      >
        No scans yesterday to compare
      </Text>
    );
  }

  const flat = Math.abs(delta) < 0.5;
  const up = delta > 0;
  const tone: Tone = flat ? "info" : up ? "success" : "danger";
  const toneColor = inverse ? colors.onPrimary : TONE[tone].fg;

  return (
    <View style={styles.deltaRow}>
      <Icon
        name={flat ? "activity" : up ? "trendUp" : "trendDown"}
        size={14}
        color={toneColor}
      />
      <Text
        style={[styles.caption, { color: toneColor }]}
        numberOfLines={1}
      >
        {flat
          ? "Level with yesterday"
          : `${Math.abs(delta).toFixed(0)}% vs yesterday`}
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

function Panel({
  title,
  subtitle,
  action,
  children,
  delay = 0,
  style,
}: PanelProps) {
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
      <Chip
        label={granted ? "Granted" : "Denied"}
        tone={granted ? "success" : "danger"}
        size="sm"
      />
    </>
  );

  return (
    <View style={[styles.activityRow, last && styles.activityRowLast]}>
      <View style={styles.activityMain}>
        {named ? (
          <Avatar
            name={entry.staff_name_snapshot ?? ""}
            size={38}
            tone="brand"
          />
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
          {compact ? (
            <View style={styles.activityStatusCompact}>{status}</View>
          ) : null}
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
  const { overview, insights, loading, refreshing, error, refresh } =
    useHomeOverview();
  const scanners = useScannerPresence();

  const { width: windowWidth } = useWindowDimensions();
  const [measured, setMeasured] = useState(0);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setMeasured((current) => (current === next ? current : next));
  }, []);

  const width =
    measured ||
    Math.min(
      Math.max(windowWidth - layout.screenPadding * 2, 280),
      MAX_CONTENT_WIDTH,
    );
  const desktop = width >= DESKTOP_WIDTH;
  const wide = width >= TABLET_WIDTH;

  const kpiColumns = desktop ? 5 : wide ? 3 : 2;
  const kpiWidth = Math.floor(
    (width - spacing.md * (kpiColumns - 1)) / kpiColumns,
  );

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
          title="Home"
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
              insights={insights}
              itemWidth={kpiWidth}
              columns={kpiColumns}
            />

            <View style={[styles.row, !desktop && styles.rowStacked]}>
              <AccessAttemptsPanel
                overview={overview}
                insights={insights}
                height={desktop ? 230 : 200}
                style={desktop ? styles.flexWide : styles.full}
              />

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

            <View
              style={[
                styles.row,
                !wide && styles.rowStacked,
                wide && !desktop && styles.rowWrap,
              ]}
            >
              <BusiestFloorsPanel
                overview={overview}
                style={wide ? styles.flexNarrow : styles.full}
              />
              <MostActivePanel
                insights={insights}
                style={wide ? styles.flexNarrow : styles.full}
              />
              <RecentActivityPanel
                overview={overview}
                compact={!wide}
                onViewLogs={onViewLogs}
                style={desktop ? styles.flexWide : styles.full}
              />
            </View>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

/* ----------------------------------------------------------- sections ---- */

function lastEntryName(entry: LastEntry): string {
  return entry.staff_name_snapshot ?? `Badge ${entry.scanned_company_id}`;
}

function lastEntryMeta(entry: LastEntry): string {
  const name = lastEntryName(entry);
  return entry.floor ? `${name} · ${floorShortLabel(entry.floor)}` : name;
}

function sinceParts(iso: string, now: number): { value: string; unit: string } {
  const then = new Date(iso).getTime();
  const minutes = Math.floor((now - then) / 60_000);
  if (minutes < 1) return { value: "Now", unit: "" };
  if (minutes < 60) return { value: `${minutes}`, unit: "min ago" };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { value: `${hours}`, unit: hours === 1 ? "hr ago" : "hrs ago" };
  const days = Math.floor(hours / 24);
  if (days <= 7) return { value: `${days}`, unit: days === 1 ? "day ago" : "days ago" };
  return {
    value: new Date(then).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    unit: "",
  };
}

function LastEntryValue({ entry }: { entry: LastEntry | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!entry) {
    return <Text style={[styles.kpiValue, styles.kpiValueMuted]}>—</Text>;
  }

  const since = sinceParts(entry.occurred_at, now);
  return (
    <>
      <Text style={styles.kpiValue} numberOfLines={1}>
        {since.value}
      </Text>
      {since.unit ? <Text style={styles.kpiValueMuted}>{since.unit}</Text> : null}
    </>
  );
}

type AttemptsRange = "weekly" | "monthly";

const ATTEMPT_RANGES: { key: AttemptsRange; label: string }[] = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

function localDayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function attemptsLabel(count: number): string {
  return `${count} ${count === 1 ? "attempt" : "attempts"}`;
}

function weekBars(days: HomeOverviewDay[]): {
  bars: BarChartDatum[];
  today: number;
} {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = (today.getDay() + 6) % 7;
  const tally = new Map(days.map((day) => [day.day, day.attempts]));

  const bars = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - offset + index);
    const key = localDayKey(date);
    const future = index > offset;
    const value = future ? null : (tally.get(key) ?? 0);
    return {
      key,
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      value,
      tooltip: value == null ? undefined : attemptsLabel(value),
    };
  });

  return { bars, today: offset };
}

function AccessAttemptsPanel({
  overview,
  insights,
  height,
  style,
}: {
  overview: HomeOverview;
  insights: HomeInsights | null;
  height: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [range, setRange] = useState<AttemptsRange>("weekly");
  const week = useMemo(() => weekBars(overview.days), [overview.days]);

  const monthBars = useMemo<BarChartDatum[]>(
    () =>
      (insights?.months ?? []).map((month) => ({
        key: month.key,
        label: month.label,
        value: month.attempts,
        tooltip: attemptsLabel(month.attempts),
      })),
    [insights],
  );

  const weekly = range === "weekly";
  const bars = weekly ? week.bars : monthBars;
  const total = bars.reduce((sum, bar) => sum + (bar.value ?? 0), 0);
  const subtitle = weekly
    ? `${attemptsLabel(total)} this week`
    : `${attemptsLabel(total)} in the last ${monthBars.length} months`;

  return (
    <Panel
      title="Access Attempts"
      subtitle={subtitle}
      delay={180}
      style={style}
      action={
        <View style={styles.segmented} accessibilityRole="tablist">
          {ATTEMPT_RANGES.map((option) => {
            const active = range === option.key;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setRange(option.key)}
                style={[styles.segment, active && styles.segmentActive]}
              >
                <Text
                  style={[
                    styles.segmentLabel,
                    active && styles.segmentLabelActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      }
    >
      {!weekly && monthBars.length === 0 ? (
        <EmptyNote>Monthly totals could not be loaded.</EmptyNote>
      ) : (
        <BarChart
          key={range}
          bars={bars}
          defaultIndex={weekly ? week.today : monthBars.length - 1}
          height={height}
          color={colors.primary}
          tint={colors.primaryTint}
          accessibilityLabel={
            weekly
              ? `Access attempts this week, ${total} in total`
              : `Access attempts per month, ${total} in total`
          }
        />
      )}
    </Panel>
  );
}

const KPI_COUNT = 5;

function KpiGrid({
  overview,
  insights,
  itemWidth,
  columns,
}: {
  overview: HomeOverview;
  insights: HomeInsights | null;
  itemWidth: number;
  columns: number;
}) {
  const grantedRate = percent(overview.granted_today, overview.attempts_today);
  const delta =
    overview.attempts_yesterday > 0
      ? ((overview.attempts_today - overview.attempts_yesterday) /
          overview.attempts_yesterday) *
        100
      : null;

  const lockouts = insights
    ? insights.lockouts.face + insights.lockouts.badge
    : null;

  const item = { width: itemWidth };
  // A card left alone on the last row reads as a gap; let it span instead.
  const lastItem = KPI_COUNT % columns === 1 ? styles.full : item;

  return (
    <View style={styles.kpiGrid}>
      <KpiCard
        icon="activity"
        label="Access attempts today"
        tone="brand"
        featured
        delay={0}
        style={item}
        accessibilityLabel={`${overview.attempts_today} access attempts today`}
        value={
          <CountUp
            value={overview.attempts_today}
            style={[styles.kpiValue, styles.kpiValueInverse]}
          />
        }
        caption={<DeltaCaption delta={delta} inverse />}
      />

      <KpiCard
        icon="shield"
        label="Granted rate"
        tone="success"
        delay={70}
        style={item}
        accessibilityLabel={`Granted rate ${grantedRate.toFixed(1)} percent`}
        value={
          <CountUp
            value={grantedRate}
            decimals={1}
            suffix="%"
            delay={70}
            style={styles.kpiValue}
          />
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
        value={
          <CountUp
            value={overview.needs_review_today}
            delay={140}
            style={styles.kpiValue}
          />
        }
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
        icon="lock"
        label="Lockouts today"
        tone="danger"
        delay={210}
        style={item}
        accessibilityLabel={
          lockouts == null
            ? "Lockout count unavailable"
            : `${lockouts} lockouts today`
        }
        value={
          lockouts == null ? (
            <Text style={[styles.kpiValue, styles.kpiValueMuted]}>—</Text>
          ) : (
            <CountUp value={lockouts} delay={210} style={styles.kpiValue} />
          )
        }
        caption={
          <KpiCaption
            text={
              !insights
                ? "Could not be loaded"
                : lockouts
                  ? `${insights.lockouts.face} face · ${insights.lockouts.badge} badge`
                  : "No one locked out today"
            }
            tone={lockouts ? "danger" : undefined}
          />
        }
      />

      <KpiCard
        icon="time"
        label="Last entry"
        tone="info"
        delay={280}
        style={lastItem}
        accessibilityLabel={
          insights?.lastEntry
            ? `Last entry ${relativeTime(insights.lastEntry.occurred_at)} by ${lastEntryName(insights.lastEntry)}`
            : "No entries yet"
        }
        value={<LastEntryValue entry={insights?.lastEntry ?? null} />}
        caption={
          <KpiCaption
            text={
              !insights
                ? "Could not be loaded"
                : insights.lastEntry
                  ? lastEntryMeta(insights.lastEntry)
                  : "No one has entered yet"
            }
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
              <View
                style={[styles.legendDot, { backgroundColor: colors.success }]}
              />
              <Text
                style={styles.legendLabel}
              >{`Granted (${overview.granted_7d})`}</Text>
            </View>
            <View style={styles.legendItem}>
              <View
                style={[styles.legendDot, { backgroundColor: colors.danger }]}
              />
              <Text
                style={styles.legendLabel}
              >{`Denied (${overview.denied_7d})`}</Text>
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
  const peak =
    reasons.length > 0 ? Math.max(...reasons.map((entry) => entry.count)) : 0;

  return (
    <Panel
      title="Denial Reasons"
      subtitle="Last 7 days"
      delay={320}
      style={style}
    >
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
  const peak =
    floors.length > 0 ? Math.max(...floors.map((entry) => entry.count)) : 0;

  return (
    <Panel
      title="Busiest Floors"
      subtitle="Today, by entry count"
      delay={380}
      style={style}
    >
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

function MostActivePanel({
  insights,
  style,
}: {
  insights: HomeInsights | null;
  style?: StyleProp<ViewStyle>;
}) {
  const staff = insights?.mostActive ?? [];
  const peak = staff.length > 0 ? staff[0].attempts : 0;

  return (
    <Panel
      title="Most Active"
      subtitle={`Last ${MOST_ACTIVE_DAYS} days, by access attempts`}
      delay={410}
      style={style}
    >
      {!insights ? (
        <EmptyNote>Staff activity could not be loaded.</EmptyNote>
      ) : staff.length === 0 ? (
        <EmptyNote>No staff badge scans in the last 7 days.</EmptyNote>
      ) : (
        <View style={styles.meterList}>
          {staff.map((member, index) => (
            <View key={member.staffId} style={styles.activeRow}>
              <Avatar
                name={member.name}
                imageUri={member.photoUrl ?? undefined}
                size={32}
                tone="brand"
              />
              <View style={styles.activeMeter}>
                <BarMeter
                  label={member.name}
                  value={member.attempts}
                  ratio={peak > 0 ? member.attempts / peak : 0}
                  color={colors.primary}
                  animationDelay={410 + index * 70}
                />
              </View>
            </View>
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

function ViewLogsAction({
  onPress,
  compact,
}: {
  onPress: () => void;
  compact: boolean;
}) {
  const { animatedStyle, handlers } = useInteraction({
    hoverLift: 2,
    pressScale: 0.96,
  });

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
        <Text style={styles.linkLabel}>
          {compact ? "All logs" : "View all access logs"}
        </Text>
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
    return {
      tone: "danger",
      label: "Service degraded",
      shortLabel: "Degraded",
    };
  }
  if (scanners.supported && !scanners.reachable && !scanners.checking) {
    return {
      tone: "warning",
      label: "Controller unreachable",
      shortLabel: "No link",
    };
  }
  if (scanners.supported && scanners.reachable && scanners.online === 0) {
    return {
      tone: "warning",
      label: "No scanners online",
      shortLabel: "No scanners",
    };
  }
  return {
    tone: "success",
    label: "All Systems Operational",
    shortLabel: "Operational",
  };
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
  rowWrap: {
    flexWrap: "wrap",
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
    fontFamily: fontFamily.bold,
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
  kpiCardFeatured: {
    overflow: "hidden",
    backgroundColor: colors.primary,
  },
  kpiFeaturedFill: {
    ...StyleSheet.absoluteFill,
  },
  kpiLabelFeatured: {
    color: "rgba(255,255,255,0.82)",
  },
  kpiValueInverse: {
    color: colors.onPrimary,
  },
  captionInverse: {
    color: "rgba(255,255,255,0.82)",
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

  segmented: {
    flexDirection: "row",
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
  },
  segment: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
  },
  segmentActive: {
    backgroundColor: colors.primary,
    ...shadow.sm,
  },
  segmentLabel: {
    ...typography.label,
    color: colors.textSecondary,
  },
  segmentLabelActive: {
    color: colors.onPrimary,
  },

  meterList: {
    gap: spacing.md,
  },
  activeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  activeMeter: {
    flex: 1,
    minWidth: 0,
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
