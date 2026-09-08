import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { HintRow } from '@/components/HintRow';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Skeleton } from '@/components/common/SkeletonLoader';
import { GeneralButton } from '@/components/ui/buttons/GeneralButton';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { floorShortLabel } from '@/constants/floors';
import { colors, radius, spacing, typography } from '@/constants/themeColor';
import { useAccessLogs, type LogDecisionFilter } from '@/hooks/useAccessLogs';
import { DENIAL_MESSAGES } from '@/lib/errors';
import type { AccessLogRow } from '@/types/database';

const FILTERS: { key: LogDecisionFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'Granted', label: 'Granted' },
  { key: 'Denied', label: 'Denied' },
];

function formatTimestamp(value: string) {
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function LogEntry({ log, index = 0 }: { log: AccessLogRow; index?: number }) {
  const granted = log.decision === 'Granted';
  const finalGrant = granted && log.stage === 'Face';

  return (
    <Card padding="base" reveal revealDelay={Math.min(index, 8) * 60}>
      <View style={styles.entryTop}>
        <View
          style={[
            styles.badge,
            granted ? styles.badgeGranted : styles.badgeDenied,
          ]}
        >
          <Icon
            name={granted ? 'checkCircle' : 'lock'}
            size={18}
            color={granted ? colors.success : colors.danger}
          />
        </View>
        <View style={styles.entryIdentity}>
          <Text style={styles.entryName} numberOfLines={1}>
            {log.staff_name_snapshot ?? 'Unknown badge'}
          </Text>
          <Text style={styles.entryMeta} numberOfLines={1}>
            {log.scanned_company_id}
            {log.floor ? ` · ${floorShortLabel(log.floor)}` : ''}
          </Text>
        </View>
        <Text style={styles.entryTime}>{formatTimestamp(log.occurred_at)}</Text>
      </View>

      <View style={styles.entryChips}>
        <Chip label={log.stage} tone="neutral" size="sm" />
        <Chip
          label={finalGrant ? 'Access granted' : granted ? 'Passed' : 'Denied'}
          tone={granted ? 'success' : 'danger'}
          size="sm"
        />
        {log.match_score != null ? (
          <Chip label={`Match ${(log.match_score * 100).toFixed(1)}%`} tone="info" size="sm" />
        ) : null}
      </View>

      {log.reason ? <Text style={styles.entryReason}>{DENIAL_MESSAGES[log.reason]}</Text> : null}
    </Card>
  );
}

export function LogsScreen() {
  const {
    rows,
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

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      header={
        <ScreenHeader
          overline="Activity"
          title="Logs"
          subtitle={`${total} recorded verification ${total === 1 ? 'attempt' : 'attempts'}`}
        />
      }
    >
      <View style={styles.searchField}>
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
            onPress={() => setSearch('')}
          >
            <Icon name="close" size={16} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((filter) => {
          const active = decision === filter.key;
          return (
            <Pressable
              key={filter.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setDecision(filter.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <HintRow tone="danger" title="Could not load logs">
          {error}
        </HintRow>
      ) : null}

      {loading ? (
        <View style={styles.list}>
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} height={116} rounded="lg" />
          ))}
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Icon name="logs" size={26} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No access attempts yet</Text>
          <Text style={styles.emptyBody}>
            Every barcode scan and face check from the scanner is recorded here.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {rows.map((log, index) => (
            <LogEntry key={log.id} log={log} index={index} />
          ))}
        </View>
      )}

      {hasMore ? (
        <GeneralButton
          label={loadingMore ? 'Loading…' : 'Load more'}
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
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 50,
    paddingHorizontal: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInputWrap: {
    flex: 1,
  },
  searchInput: {
    color: colors.text,
    padding: 0,
    ...typography.body,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  filterLabel: {
    ...typography.label,
    color: colors.textSecondary,
  },
  filterLabelActive: {
    color: colors.primaryDeep,
  },
  list: {
    gap: spacing.md,
  },
  entryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  badge: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeGranted: {
    backgroundColor: colors.successTint,
  },
  badgeDenied: {
    backgroundColor: colors.dangerTint,
  },
  entryIdentity: {
    flex: 1,
    gap: 2,
  },
  entryName: {
    color: colors.text,
    ...typography.bodyStrong,
  },
  entryMeta: {
    color: colors.textSecondary,
    ...typography.caption,
  },
  entryTime: {
    color: colors.textMuted,
    ...typography.caption,
  },
  entryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  entryReason: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    ...typography.caption,
    lineHeight: 17,
  },
  empty: {
    marginTop: spacing['3xl'],
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
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
    textAlign: 'center',
  },
});

export default LogsScreen;
