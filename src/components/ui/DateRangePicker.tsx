import { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { colors, fontFamily, radius, shadow, spacing, typography } from '@/constants/themeColor';

export type DateRange = { start: Date; end: Date };

export type DateRangePickerProps = {
  value: DateRange | null;
  onChange: (range: DateRange | null) => void;
  disabled?: boolean;
};

type Draft = { start: Date | null; end: Date | null };
type Anchor = { x: number; y: number; width: number; height: number };

const CELL = 36;
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const PANEL_GAP = 6;
const SCREEN_MARGIN = 12;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function sameDay(a: Date | null, b: Date | null): boolean {
  return (
    a != null &&
    b != null &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDay(date: Date, withYear: boolean): string {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : null),
  });
}

function rangeLabel(range: DateRange | null): string {
  if (!range) return 'All dates';
  const today = startOfDay(new Date());
  if (sameDay(range.start, range.end)) {
    if (sameDay(range.start, today)) return 'Today';
    if (sameDay(range.start, addDays(today, -1))) return 'Yesterday';
  }
  const year = today.getFullYear();
  const withYear = range.start.getFullYear() !== year || range.end.getFullYear() !== year;
  if (sameDay(range.start, range.end)) return formatDay(range.start, withYear);
  return `${formatDay(range.start, withYear)} – ${formatDay(range.end, withYear)}`;
}

function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function presets(): { key: string; label: string; range: DateRange | null }[] {
  const today = startOfDay(new Date());
  return [
    { key: 'today', label: 'Today', range: { start: today, end: today } },
    {
      key: 'yesterday',
      label: 'Yesterday',
      range: { start: addDays(today, -1), end: addDays(today, -1) },
    },
    { key: 'week', label: 'Last 7 days', range: { start: addDays(today, -6), end: today } },
    { key: 'month', label: 'Last 30 days', range: { start: addDays(today, -29), end: today } },
    {
      key: 'calendar-month',
      label: 'This month',
      range: { start: new Date(today.getFullYear(), today.getMonth(), 1), end: today },
    },
    { key: 'all', label: 'All time', range: null },
  ];
}

export function DateRangePicker({ value, onChange, disabled = false }: DateRangePickerProps) {
  const trigger = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [draft, setDraft] = useState<Draft>({ start: null, end: null });
  const [hoverDay, setHoverDay] = useState<Date | null>(null);
  const [triggerHovered, setTriggerHovered] = useState(false);
  const [month, setMonth] = useState(() => startOfDay(new Date()));
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const today = startOfDay(new Date());
  const compact = windowWidth < 640;

  const open = () => {
    if (disabled) return;
    setDraft({ start: value?.start ?? null, end: value?.end ?? null });
    setMonth(startOfDay(value?.end ?? today));
    setHoverDay(null);
    trigger.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
  };

  const close = () => setAnchor(null);

  const commit = (range: DateRange | null) => {
    onChange(range);
    close();
  };

  const pick = (day: Date) => {
    if (!draft.start || draft.end) {
      setDraft({ start: day, end: null });
      return;
    }
    const [start, end] = day < draft.start ? [day, draft.start] : [draft.start, day];
    setDraft({ start, end });
  };

  const previewEnd = draft.end ?? (draft.start && hoverDay ? hoverDay : null);
  const [lo, hi] =
    draft.start && previewEnd
      ? previewEnd < draft.start
        ? [previewEnd, draft.start]
        : [draft.start, previewEnd]
      : [draft.start, draft.start];

  const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const canGoNext = nextMonth <= today;
  const days = monthGrid(month);
  const canApply = draft.start != null;

  const panelWidth = compact ? Math.min(windowWidth - SCREEN_MARGIN * 2, 360) : 460;
  const panelPosition = anchor
    ? compact
      ? { left: (windowWidth - panelWidth) / 2, top: Math.max(SCREEN_MARGIN, windowHeight * 0.12) }
      : {
          left: Math.min(
            Math.max(anchor.x, SCREEN_MARGIN),
            windowWidth - panelWidth - SCREEN_MARGIN,
          ),
          top: anchor.y + anchor.height + PANEL_GAP,
        }
    : null;

  return (
    <>
      <View
        ref={trigger}
        collapsable={false}
        style={[
          styles.trigger,
          value && styles.triggerActive,
          triggerHovered && styles.triggerHover,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Date range: ${rangeLabel(value)}`}
          accessibilityState={{ expanded: anchor != null, disabled }}
          disabled={disabled}
          onPress={open}
          onHoverIn={() => setTriggerHovered(true)}
          onHoverOut={() => setTriggerHovered(false)}
          style={styles.triggerMain}
        >
          <Icon name="calendar" size={16} color={value ? colors.primary : colors.textSecondary} />
          <Text style={[styles.triggerLabel, value && styles.triggerLabelActive]} numberOfLines={1}>
            {rangeLabel(value)}
          </Text>
          {value ? null : <Icon name="chevronDown" size={16} color={colors.textSecondary} />}
        </Pressable>
        {value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear date range"
            hitSlop={8}
            onPress={() => onChange(null)}
            style={styles.triggerClear}
          >
            <Icon name="close" size={14} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>

      <Modal visible={anchor != null} transparent animationType="fade" onRequestClose={close}>
        <View style={[styles.backdrop, compact && styles.backdropDim]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
          {panelPosition ? (
            <View
              style={[styles.panel, compact && styles.panelCompact, { width: panelWidth }, panelPosition]}
              accessibilityViewIsModal
            >
              <View style={[styles.presets, compact && styles.presetsCompact]}>
                {presets().map((preset) => {
                  const active =
                    preset.range == null
                      ? value == null
                      : value != null &&
                        sameDay(value.start, preset.range.start) &&
                        sameDay(value.end, preset.range.end);
                  return (
                    <Pressable
                      key={preset.key}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => commit(preset.range)}
                      style={({ hovered }) => [
                        styles.preset,
                        compact && styles.presetCompact,
                        hovered && styles.presetHover,
                        active && styles.presetActive,
                      ]}
                    >
                      <Text style={[styles.presetLabel, active && styles.presetLabelActive]}>
                        {preset.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.calendar}>
                <View style={styles.monthRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Previous month"
                    onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                    style={({ hovered }) => [styles.monthButton, hovered && styles.monthButtonHover]}
                  >
                    <Icon name="chevronLeft" size={18} color={colors.textSecondary} />
                  </Pressable>
                  <Text style={styles.monthLabel}>
                    {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Next month"
                    disabled={!canGoNext}
                    onPress={() => setMonth(nextMonth)}
                    style={({ hovered }) => [
                      styles.monthButton,
                      hovered && canGoNext && styles.monthButtonHover,
                      !canGoNext && styles.monthButtonDisabled,
                    ]}
                  >
                    <Icon name="chevronRight" size={18} color={colors.textSecondary} />
                  </Pressable>
                </View>

                <View style={styles.weekRow}>
                  {WEEKDAYS.map((weekday) => (
                    <Text key={weekday} style={styles.weekday}>
                      {weekday}
                    </Text>
                  ))}
                </View>

                <View style={styles.grid} onPointerLeave={() => setHoverDay(null)}>
                  {days.map((day) => {
                    const outside = day.getMonth() !== month.getMonth();
                    const future = day > today;
                    const isStart = sameDay(day, lo);
                    const isEnd = sameDay(day, hi);
                    const inRange = lo != null && hi != null && day > lo && day < hi;
                    const hasSpan = lo != null && hi != null && !sameDay(lo, hi);
                    const isToday = sameDay(day, today);
                    return (
                      <Pressable
                        key={day.toISOString()}
                        accessibilityRole="button"
                        accessibilityLabel={day.toDateString()}
                        accessibilityState={{ selected: isStart || isEnd, disabled: future }}
                        disabled={future}
                        onPress={() => pick(day)}
                        onHoverIn={() => setHoverDay(day)}
                        style={styles.cell}
                      >
                        {inRange ? <View style={[styles.band, styles.bandFull]} /> : null}
                        {hasSpan && isStart ? <View style={[styles.band, styles.bandRight]} /> : null}
                        {hasSpan && isEnd ? <View style={[styles.band, styles.bandLeft]} /> : null}
                        <View
                          style={[
                            styles.dayDot,
                            isToday && styles.dayToday,
                            (isStart || isEnd) && styles.daySelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dayText,
                              outside && styles.dayOutside,
                              future && styles.dayFuture,
                              inRange && styles.dayInRange,
                              (isStart || isEnd) && styles.dayTextSelected,
                            ]}
                          >
                            {day.getDate()}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.footer}>
                  <Text style={styles.footerHint} numberOfLines={1}>
                    {draft.start
                      ? draft.end
                        ? rangeLabel({ start: draft.start, end: draft.end })
                        : 'Pick an end date'
                      : 'Pick a start date'}
                  </Text>
                  <View style={styles.footerActions}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={close}
                      style={({ hovered }) => [styles.footerButton, hovered && styles.footerButtonHover]}
                    >
                      <Text style={styles.footerCancel}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={!canApply}
                      onPress={() =>
                        draft.start &&
                        commit({ start: draft.start, end: draft.end ?? draft.start })
                      }
                      style={[styles.footerButton, styles.applyButton, !canApply && styles.applyDisabled]}
                    >
                      <Text style={styles.applyLabel}>Apply</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  triggerActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  triggerHover: {
    borderColor: colors.primary,
  },
  triggerMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: '100%',
    paddingHorizontal: spacing.md,
  },
  triggerClear: {
    height: '100%',
    justifyContent: 'center',
    paddingRight: spacing.md,
    paddingLeft: 2,
  },
  triggerLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  triggerLabelActive: {
    color: colors.primary,
  },
  backdrop: {
    flex: 1,
  },
  backdropDim: {
    backgroundColor: colors.scrim,
  },
  panel: {
    position: 'absolute',
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadow.lg,
  },
  panelCompact: {
    flexDirection: 'column',
  },
  presets: {
    width: 128,
    gap: 2,
    paddingRight: spacing.md,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  presetsCompact: {
    width: 'auto',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingRight: 0,
    paddingBottom: spacing.md,
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  preset: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  presetCompact: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
  },
  presetHover: {
    backgroundColor: colors.surfaceSunken,
  },
  presetActive: {
    backgroundColor: colors.primaryTint,
  },
  presetLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  presetLabelActive: {
    color: colors.primary,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
  },
  calendar: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  monthRow: {
    width: CELL * 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthButtonHover: {
    backgroundColor: colors.surfaceSunken,
  },
  monthButtonDisabled: {
    opacity: 0.35,
  },
  monthLabel: {
    color: colors.text,
    ...typography.bodyStrong,
  },
  weekRow: {
    width: CELL * 7,
    flexDirection: 'row',
  },
  weekday: {
    width: CELL,
    textAlign: 'center',
    color: colors.textMuted,
    ...typography.caption,
    fontSize: 11,
  },
  grid: {
    width: CELL * 7,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: CELL,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  band: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    backgroundColor: colors.primaryTint,
  },
  bandFull: {
    left: 0,
    right: 0,
  },
  bandLeft: {
    left: 0,
    right: CELL / 2,
  },
  bandRight: {
    left: CELL / 2,
    right: 0,
  },
  dayDot: {
    width: CELL - 6,
    height: CELL - 6,
    borderRadius: (CELL - 6) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToday: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  daySelected: {
    backgroundColor: colors.primary,
    borderWidth: 0,
    ...shadow.sm,
  },
  dayText: {
    color: colors.text,
    ...typography.caption,
    fontVariant: ['tabular-nums'],
  },
  dayOutside: {
    color: colors.textMuted,
  },
  dayFuture: {
    opacity: 0.35,
  },
  dayInRange: {
    color: colors.primary,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
  },
  dayTextSelected: {
    color: colors.onPrimary,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
  },
  footer: {
    width: CELL * 7,
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerHint: {
    color: colors.textSecondary,
    ...typography.caption,
  },
  footerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  footerButton: {
    paddingVertical: 7,
    paddingHorizontal: spacing.base,
    borderRadius: radius.pill,
  },
  footerButtonHover: {
    backgroundColor: colors.surfaceSunken,
  },
  footerCancel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  applyButton: {
    backgroundColor: colors.primary,
  },
  applyDisabled: {
    opacity: 0.5,
  },
  applyLabel: {
    color: colors.onPrimary,
    ...typography.label,
  },
});

export default DateRangePicker;
