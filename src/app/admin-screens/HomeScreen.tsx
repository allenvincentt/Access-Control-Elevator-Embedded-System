import { StyleSheet, Text, View } from "react-native";

import { CountUp } from "@/components/common/animations";
import { Skeleton } from "@/components/common/SkeletonLoader";
import { HintRow } from "@/components/HintRow";
import { Screen } from "@/components/layout/Screen";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Icon, type IconName } from "@/components/ui/Icon";
import { colors, radius, spacing, typography } from "@/constants/themeColor";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardStats } from "@/hooks/useDashboardStats";

type Metric = {
  key: string;
  label: string;
  value: number;
  icon: IconName;
  tone: "brand" | "success" | "danger" | "info";
  caption?: string;
};

const TONE_STYLES = {
  brand: {
    bg: colors.primaryTint,
    fg: colors.primary,
    accent: "brand" as const,
  },
  success: {
    bg: colors.successTint,
    fg: colors.success,
    accent: "success" as const,
  },
  danger: {
    bg: colors.dangerTint,
    fg: colors.danger,
    accent: "danger" as const,
  },
  info: { bg: colors.infoTint, fg: colors.info, accent: "brand" as const },
} as const;

function MetricTile({ metric, index }: { metric: Metric; index: number }) {
  const tone = TONE_STYLES[metric.tone];
  return (
    <Card
      padding="base"
      accent={tone.accent}
      reveal
      revealDelay={index * 90}
      style={styles.tile}
    >
      <View style={[styles.tileIcon, { backgroundColor: tone.bg }]}>
        <Icon name={metric.icon} size={20} color={tone.fg} />
      </View>
      <CountUp
        value={metric.value}
        delay={index * 90}
        style={styles.tileValue}
      />
      <Text style={styles.tileLabel} numberOfLines={2}>
        {metric.label}
      </Text>
      {metric.caption ? (
        <Text style={styles.tileCaption}>{metric.caption}</Text>
      ) : null}
    </Card>
  );
}

export function HomeScreen() {
  const { profile } = useAuth();
  const { stats, loading, refreshing, error, refresh } = useDashboardStats();

  const metrics: Metric[] = stats
    ? [
        {
          key: "staff",
          label: "Staff on file",
          value: stats.staff_total,
          icon: "staff",
          tone: "brand",
          caption: `${stats.staff_active} active · ${stats.staff_suspended} suspended`,
        },
        {
          key: "faces",
          label: "Faces enrolled",
          value: stats.faces_enrolled,
          icon: "face",
          tone: stats.faces_missing > 0 ? "danger" : "success",
          caption:
            stats.faces_missing > 0
              ? `${stats.faces_missing} without a template`
              : "Everyone can be verified",
        },
        {
          key: "granted",
          label: "Granted today",
          value: stats.granted_24h,
          icon: "checkCircle",
          tone: "success",
          caption: "Last 24 hours",
        },
        {
          key: "denied",
          label: "Denied today",
          value: stats.denied_24h,
          icon: "lock",
          tone: "danger",
          caption: "Last 24 hours",
        },
        {
          key: "attempts",
          label: "Badge scans",
          value: stats.attempts_24h,
          icon: "qr",
          tone: "info",
          caption: "Last 24 hours",
        },
      ]
    : [];

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      header={
        <ScreenHeader
          overline="Overview"
          title="Home"
          subtitle={profile ? `Signed in as ${profile.full_name}` : undefined}
        />
      }
    >
      {error ? (
        <HintRow tone="danger" title="Could not load the dashboard">
          {error}
        </HintRow>
      ) : null}

      {loading ? (
        <View style={styles.grid}>
          {[0, 1, 2, 3].map((key) => (
            <View key={key} style={styles.gridItem}>
              <Skeleton height={132} rounded="lg" />
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.grid}>
          {metrics.map((metric, index) => (
            <View key={metric.key} style={styles.gridItem}>
              <MetricTile metric={metric} index={index} />
            </View>
          ))}
        </View>
      )}

      {stats && stats.faces_missing > 0 ? (
        <HintRow tone="warning" title="Enrollment gap">
          {stats.faces_missing} staff{" "}
          {stats.faces_missing === 1 ? "member has" : "members have"} no face
          template. They will be stopped at the barcode step until a face is
          registered.
        </HintRow>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  gridItem: {
    flexGrow: 1,
    flexBasis: "46%",
    minWidth: 150,
  },
  tile: {
    gap: spacing.xs,
  },
  tileIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  tileValue: {
    color: colors.text,
    ...typography.display,
  },
  tileLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  tileCaption: {
    color: colors.textMuted,
    ...typography.caption,
  },
});

export default HomeScreen;
