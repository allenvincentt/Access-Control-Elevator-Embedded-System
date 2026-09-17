import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { Skeleton } from "@/components/common/SkeletonLoader";
import { HintRow } from "@/components/HintRow";
import { Screen } from "@/components/layout/Screen";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { GeneralButton } from "@/components/ui/buttons/GeneralButton";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { floorShortLabel, staffRoleLabel } from "@/constants/floors";
import {
  colors,
  fontFamily,
  radius,
  shadow,
  spacing,
  typography,
} from "@/constants/themeColor";
import { useAccessLogs, type LogDecisionFilter } from "@/hooks/useAccessLogs";
import { DENIAL_LABELS, DENIAL_MESSAGES } from "@/lib/errors";
import {
  isAnonymizedAttempt,
  type AccessAttempt,
  type AttemptBadge,
  type AttemptOutcome,
} from "@/services/logsService";

const FILTERS: { key: LogDecisionFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "Granted", label: "Granted" },
  { key: "Denied", label: "Denied" },
];

const OUTCOME_TONE: Record<
  AttemptOutcome,
  { bg: string; fg: string; label: string }
> = {
  Granted: { bg: colors.successTint, fg: colors.success, label: "Granted" },
  Denied: { bg: colors.dangerTint, fg: colors.danger, label: "Denied" },
  Incomplete: {
    bg: colors.surfaceSunken,
    fg: colors.textSecondary,
    label: "Incomplete",
  },
};

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
};

function formatDay(date: Date) {
  const today = new Date();
  const midnight = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const days = Math.floor((midnight.getTime() - date.getTime()) / 86_400_000);

  if (days < 0) return "Today";
  if (days === 0) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString(undefined, TIME_FORMAT);
}

function personName(attempt: AccessAttempt) {
  if (isAnonymizedAttempt(attempt)) return "Deleted staff member";
  return attempt.staffName ?? `Badge ${attempt.companyId}`;
}

function scoreLabel(score: number | null) {
  return score == null ? null : `${Math.round(score * 100)}%`;
}

function PersonBadge({
  attempt,
  badge,
  photoUrl,
  compact = false,
}: {
  attempt: AccessAttempt;
  badge?: AttemptBadge;
  photoUrl?: string;
  compact?: boolean;
}) {
  const anonymized = isAnonymizedAttempt(attempt);
  return (
    <View style={styles.person}>
      <Avatar
        name={attempt.staffName ?? ""}
        imageUri={photoUrl}
        size={compact ? 40 : 38}
        tone={badge?.role === "Guest" ? "gold" : "neutral"}
      />
      <View style={styles.personText}>
        <Text style={styles.personName} numberOfLines={1}>
          {personName(attempt)}
        </Text>
        <Text style={styles.personBadgeId} numberOfLines={1}>
          {anonymized ? "—" : attempt.companyId}
        </Text>
        <Text style={styles.personRole} numberOfLines={1}>
          {anonymized
            ? "Record anonymized"
            : badge
              ? staffRoleLabel(badge.role)
              : "Unregistered badge"}
        </Text>
      </View>
    </View>
  );
}

function OutcomePill({ outcome }: { outcome: AttemptOutcome }) {
  const tone = OUTCOME_TONE[outcome];
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.pillText, { color: tone.fg }]}>{tone.label}</Text>
    </View>
  );
}

function StageLines({ attempt }: { attempt: AccessAttempt }) {
  const score = scoreLabel(attempt.face?.match_score ?? null);

  return (
    <View style={styles.stages}>
      <View style={styles.stageLine}>
        <Text style={styles.stageLabel}>Barcode:</Text>
        <Text
          style={[
            styles.stageValue,
            {
              color:
                attempt.barcode?.decision === "Granted"
                  ? colors.success
                  : attempt.barcode
                    ? colors.danger
                    : colors.textMuted,
            },
          ]}
        >
          {attempt.barcode?.decision ?? "—"}
        </Text>
      </View>
      <View style={styles.stageLine}>
        <Text style={styles.stageLabel}>Face:</Text>
        <Text
          style={[
            styles.stageValue,
            {
              color:
                attempt.face?.decision === "Granted"
                  ? colors.success
                  : attempt.face
                    ? colors.danger
                    : colors.textMuted,
            },
          ]}
        >
          {attempt.face?.decision ?? "Not reached"}
        </Text>
        {score ? <Text style={styles.stageScore}>· {score}</Text> : null}
      </View>
    </View>
  );
}

function DenialReason({ attempt }: { attempt: AccessAttempt }) {
  if (!attempt.reason) {
    return <Text style={styles.noReason}>—</Text>;
  }
  return (
    <View style={styles.reason}>
      <Text style={styles.reasonTitle}>{DENIAL_LABELS[attempt.reason]}</Text>
      <Text style={styles.reasonBody}>{DENIAL_MESSAGES[attempt.reason]}</Text>
    </View>
  );
}

function AttemptRow({
  attempt,
  badge,
  photoUrl,
}: {
  attempt: AccessAttempt;
  badge?: AttemptBadge;
  photoUrl?: string;
}) {
  const at = new Date(attempt.occurredAt);

  return (
    <View style={styles.tRow}>
      <View style={[styles.tCell, styles.colPerson]}>
        <PersonBadge attempt={attempt} badge={badge} photoUrl={photoUrl} />
      </View>
      <View style={[styles.tCell, styles.colWhen]}>
        <Text style={styles.whenDay}>{formatDay(at)}</Text>
        <Text style={styles.whenTime}>{formatTime(at)}</Text>
      </View>
      <View style={[styles.tCell, styles.colOutcome]}>
        <OutcomePill outcome={attempt.outcome} />
        <StageLines attempt={attempt} />
        {attempt.floor ? (
          <Text style={styles.floorNote}>{floorShortLabel(attempt.floor)}</Text>
        ) : null}
      </View>
      <View style={[styles.tCell, styles.colReason]}>
        <DenialReason attempt={attempt} />
      </View>
    </View>
  );
}

function AttemptCard({
  attempt,
  badge,
  photoUrl,
  index,
}: {
  attempt: AccessAttempt;
  badge?: AttemptBadge;
  photoUrl?: string;
  index: number;
}) {
  const at = new Date(attempt.occurredAt);

  return (
    <Card padding="base" reveal revealDelay={Math.min(index, 8) * 50}>
      <View style={styles.cardTop}>
        <PersonBadge attempt={attempt} badge={badge} photoUrl={photoUrl} compact />
        <OutcomePill outcome={attempt.outcome} />
      </View>

      <View style={styles.cardMeta}>
        <Icon name="time" size={13} color={colors.textMuted} />
        <Text style={styles.cardMetaText}>
          {formatDay(at)} · {formatTime(at)}
          {attempt.floor ? ` · ${floorShortLabel(attempt.floor)}` : ""}
        </Text>
      </View>

      <View style={styles.cardStages}>
        <StageLines attempt={attempt} />
      </View>

      {attempt.reason ? (
        <View style={styles.cardReason}>
          <DenialReason attempt={attempt} />
        </View>
      ) : null}
    </Card>
  );
}

export function LogsScreen() {
  const {
    attempts,
    badges,
    photoUrls,
    total,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    decision,
    setDecision,
    search,
    setSearch,
    refresh,
    loadMore,
  } = useAccessLogs();

  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const photoFor = (badge?: AttemptBadge) =>
    badge?.photoPath ? photoUrls[badge.photoPath] : undefined;

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      header={
        <ScreenHeader
          overline="Activity"
          title="Access Logs"
          subtitle="Full history of every badge scan and face verification attempt"
        />
      }
    >
      <View style={[styles.controls, wide && styles.controlsWide]}>
        <View style={[styles.searchField, wide && styles.searchFieldWide]}>
          <Icon name="search" size={18} color={colors.textMuted} />
          <View style={styles.searchInputWrap}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by company ID"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search access logs"
              cursorColor={colors.primary}
              selectionColor={colors.focusRing}
            />
          </View>
          {search.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
              onPress={() => setSearch("")}
            >
              <Icon name="close" size={16} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.filterRow}>
          <View style={styles.segmented}>
            {FILTERS.map((filter) => {
              const active = decision === filter.key;
              return (
                <Pressable
                  key={filter.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setDecision(filter.key)}
                  style={[styles.segment, active && styles.segmentActive]}
                >
                  <Text
                    style={[
                      styles.segmentLabel,
                      active && styles.segmentLabelActive,
                    ]}
                  >
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {loading ? null : (
            <Text style={styles.resultCount}>
              {total} result{total === 1 ? "" : "s"}
            </Text>
          )}
        </View>
      </View>

      {error ? (
        <HintRow tone="danger" title="Could not load logs">
          {error}
        </HintRow>
      ) : null}

      {loading ? (
        <View style={styles.list}>
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} height={wide ? 84 : 150} rounded="lg" />
          ))}
        </View>
      ) : attempts.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Icon name="logs" size={26} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>
            {search || decision !== "all"
              ? "No attempts match your filters"
              : "No access attempts yet"}
          </Text>
          <Text style={styles.emptyBody}>
            {search || decision !== "all"
              ? "Try a different company ID or clear the outcome filter."
              : "Every badge scan and face check from the scanner is recorded here."}
          </Text>
        </View>
      ) : wide ? (
        <View style={styles.table}>
          <View style={styles.tHeader}>
            <Text style={[styles.tHeaderText, styles.colPerson]}>
              Person / Badge
            </Text>
            <Text style={[styles.tHeaderText, styles.colWhen]}>Date & Time</Text>
            <Text style={[styles.tHeaderText, styles.colOutcome]}>Outcome</Text>
            <Text style={[styles.tHeaderText, styles.colReason]}>
              Denial Reason
            </Text>
          </View>
          {attempts.map((attempt, index) => (
            <View key={attempt.key}>
              {index > 0 ? <View style={styles.tDivider} /> : null}
              <AttemptRow
                attempt={attempt}
                badge={attempt.staffId ? badges[attempt.staffId] : undefined}
                photoUrl={photoFor(
                  attempt.staffId ? badges[attempt.staffId] : undefined,
                )}
              />
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.list}>
          {attempts.map((attempt, index) => (
            <AttemptCard
              key={attempt.key}
              attempt={attempt}
              index={index}
              badge={attempt.staffId ? badges[attempt.staffId] : undefined}
              photoUrl={photoFor(
                attempt.staffId ? badges[attempt.staffId] : undefined,
              )}
            />
          ))}
        </View>
      )}

      {hasMore ? (
        <GeneralButton
          label={loadingMore ? "Loading…" : "Load more"}
          variant="outline"
          fullWidth
          loading={loadingMore}
          disabled={loadingMore}
          onPress={() => void loadMore()}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: {
    gap: spacing.md,
  },
  controlsWide: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.base,
  },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    height: 46,
    paddingHorizontal: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchFieldWide: {
    flex: 1,
    maxWidth: 380,
  },
  searchInputWrap: {
    flex: 1,
    minWidth: 0,
  },
  searchInput: {
    color: colors.text,
    padding: 0,
    ...typography.body,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.md,
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
  resultCount: {
    ...typography.caption,
    color: colors.textMuted,
  },
  list: {
    gap: spacing.md,
  },

  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
    minWidth: 0,
  },
  personText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  personName: {
    color: colors.text,
    ...typography.bodyStrong,
    fontFamily: fontFamily.bold,
    fontWeight: "700",
  },
  personBadgeId: {
    color: colors.textSecondary,
    ...typography.mono,
    fontSize: 12,
    lineHeight: 16,
  },
  personRole: {
    color: colors.textMuted,
    ...typography.caption,
  },

  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  pillText: {
    ...typography.caption,
    fontFamily: fontFamily.bold,
    fontWeight: "700",
  },
  stages: {
    gap: 2,
  },
  stageLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  stageLabel: {
    color: colors.textMuted,
    ...typography.caption,
    width: 54,
  },
  stageValue: {
    ...typography.caption,
    fontFamily: fontFamily.bold,
    fontWeight: "700",
  },
  stageScore: {
    color: colors.textMuted,
    ...typography.caption,
  },
  floorNote: {
    color: colors.textMuted,
    ...typography.caption,
  },

  reason: {
    gap: 2,
  },
  reasonTitle: {
    color: colors.warning,
    ...typography.label,
  },
  reasonBody: {
    color: colors.textSecondary,
    ...typography.caption,
    lineHeight: 16,
  },
  noReason: {
    color: colors.textMuted,
    ...typography.body,
  },

  table: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
    ...shadow.sm,
  },
  tHeader: {
    flexDirection: "row",
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tHeaderText: {
    ...typography.overline,
    color: colors.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  tRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  tDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  tCell: {
    paddingRight: spacing.md,
    justifyContent: "center",
    minWidth: 0,
  },
  colPerson: { flex: 3, flexDirection: "row", alignItems: "center" },
  colWhen: { flex: 1.6, gap: 2 },
  colOutcome: { flex: 1.9, gap: spacing.xs },
  colReason: { flex: 2.4, paddingRight: 0 },
  whenDay: {
    color: colors.text,
    ...typography.bodyStrong,
  },
  whenTime: {
    color: colors.textSecondary,
    ...typography.caption,
    fontVariant: ["tabular-nums"],
  },

  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  cardMetaText: {
    flex: 1,
    color: colors.textSecondary,
    ...typography.caption,
  },
  cardStages: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cardReason: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.warningTint,
  },

  empty: {
    marginTop: spacing["3xl"],
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSunken,
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    color: colors.text,
    ...typography.subheading,
  },
  emptyBody: {
    color: colors.textSecondary,
    ...typography.body,
    textAlign: "center",
  },
});

export default LogsScreen;
