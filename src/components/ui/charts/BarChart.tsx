import { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useRevealOpen } from '@/components/common/animations/RevealGate';
import { createGradientStyle } from '@/constants/glassTheme';
import { colors, fontFamily, palette, radius, typography } from '@/constants/themeColor';

export type BarChartDatum = {
  key: string;
  label: string;
  value: number | null;
  tooltip?: string;
};

export type BarChartProps = {
  bars: BarChartDatum[];
  defaultIndex?: number;
  height?: number;
  color?: string;
  tint?: string;
  stripe?: string;
  formatValue?: (value: number) => string;
  animationDelay?: number;
  accessibilityLabel?: string;
};

const TICKS = 5;
const AXIS_WIDTH = 34;
const TOOLTIP_SPACE = 40;
const DOT_SIZE = 12;
const MAX_BAR_WIDTH = 56;
const MIN_BAR_HEIGHT = 10;
const TIMING = { duration: 220, easing: Easing.out(Easing.cubic) };
const GROW = { duration: 980, easing: Easing.out(Easing.cubic) };

function grownHeight(target: number, progress: number): number {
  'worklet';
  return Math.max(target * progress, MIN_BAR_HEIGHT * Math.min(progress * 2, 1));
}

function niceStep(max: number): number {
  const raw = Math.max(max, 1) / (TICKS - 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const scaled = raw / magnitude;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return Math.max(1, nice * magnitude);
}

function axisLabel(value: number): string {
  if (value >= 1000) {
    const thousands = value / 1000;
    return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`;
  }
  return `${value}`;
}

export function BarChart({
  bars,
  defaultIndex,
  height = 220,
  color = colors.primary,
  tint = colors.primaryTint,
  stripe = 'rgba(178,10,7,0.16)',
  formatValue = (value) => `${value}`,
  animationDelay = 120,
  accessibilityLabel,
}: BarChartProps) {
  const [plotWidth, setPlotWidth] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const progress = useSharedValue(0);
  const open = useRevealOpen();

  useEffect(() => {
    if (!open) return;
    progress.value = withDelay(animationDelay, withTiming(1, GROW));
    return () => cancelAnimation(progress);
  }, [open, animationDelay, progress]);

  const fallback = defaultIndex ?? Math.max(bars.length - 1, 0);
  const selected = hovered ?? pinned ?? fallback;

  const peak = bars.reduce((max, bar) => Math.max(max, bar.value ?? 0), 0);
  const step = niceStep(peak);
  const ceiling = step * (TICKS - 1);
  const plotHeight = Math.max(height - TOOLTIP_SPACE, 40);
  const columnWidth = bars.length > 0 ? plotWidth / bars.length : 0;
  const barWidth = Math.min(MAX_BAR_WIDTH, Math.max(columnWidth * 0.62, 10));

  const barHeight = (value: number | null) => {
    if (value == null) return 0;
    return Math.max((value / ceiling) * plotHeight, MIN_BAR_HEIGHT);
  };

  const selectedBar = bars[selected];
  const selectedHeight = selectedBar ? barHeight(selectedBar.value) : 0;

  const [bubbleWidth, setBubbleWidth] = useState(0);
  const center = selected * columnWidth + columnWidth / 2;
  const bubbleLeft = Math.min(
    Math.max(center - bubbleWidth / 2, 0),
    Math.max(plotWidth - bubbleWidth, 0),
  );

  const dotX = useSharedValue(0);
  const bubbleX = useSharedValue(0);
  const lift = useSharedValue(0);
  const tooltipOpacity = useSharedValue(0);
  const glideFrom = useRef<number | null>(null);

  useEffect(() => {
    if (!selectedBar || columnWidth <= 0 || selectedBar.value == null) {
      tooltipOpacity.value = withTiming(0, TIMING);
      return;
    }
    const glide = glideFrom.current !== null && glideFrom.current !== selected;
    glideFrom.current = selected;
    if (glide) {
      dotX.value = withTiming(center - DOT_SIZE / 2, TIMING);
      bubbleX.value = withTiming(bubbleLeft, TIMING);
      lift.value = withTiming(selectedHeight, TIMING);
    } else {
      dotX.value = center - DOT_SIZE / 2;
      bubbleX.value = bubbleLeft;
      lift.value = selectedHeight;
    }
    tooltipOpacity.value = withTiming(bubbleWidth > 0 ? 1 : 0, TIMING);
  }, [
    selected,
    selectedBar,
    columnWidth,
    center,
    bubbleLeft,
    bubbleWidth,
    selectedHeight,
    dotX,
    bubbleX,
    lift,
    tooltipOpacity,
  ]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: tooltipOpacity.value,
    transform: [
      { translateX: dotX.value },
      { translateY: -grownHeight(lift.value, progress.value) },
    ],
  }));
  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: tooltipOpacity.value,
    transform: [
      { translateX: bubbleX.value },
      { translateY: -grownHeight(lift.value, progress.value) },
    ],
  }));

  const handleBubbleLayout = (event: LayoutChangeEvent) => {
    const next = Math.ceil(event.nativeEvent.layout.width);
    setBubbleWidth((current) => (current === next ? current : next));
  };

  const baseline = height - TOOLTIP_SPACE - plotHeight;

  const handleLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setPlotWidth((current) => (current === next ? current : next));
  };

  const ticks = Array.from({ length: TICKS }, (_, index) => step * (TICKS - 1 - index));

  return (
    <View
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={[styles.chart, { height }]}>
        <View style={[styles.axis, { height: plotHeight, marginTop: TOOLTIP_SPACE }]}>
          {ticks.map((tick) => (
            <Text key={tick} style={styles.axisLabel} numberOfLines={1}>
              {axisLabel(tick)}
            </Text>
          ))}
        </View>

        <View style={styles.plot} onLayout={handleLayout}>
          <View
            pointerEvents="none"
            style={[styles.grid, { top: TOOLTIP_SPACE, height: plotHeight }]}
          >
            {ticks.map((tick, index) => (
              <View
                key={tick}
                style={[styles.gridLine, index === ticks.length - 1 && styles.gridBase]}
              />
            ))}
          </View>

          <View style={[styles.columns, { top: TOOLTIP_SPACE, height: plotHeight }]}>
            {bars.map((bar, index) => (
              <Pressable
                key={bar.key}
                accessibilityRole="button"
                accessibilityLabel={`${bar.label}: ${
                  bar.value == null ? 'no data yet' : bar.tooltip ?? formatValue(bar.value)
                }`}
                accessibilityState={{ selected: index === selected }}
                onHoverIn={() => setHovered(index)}
                onHoverOut={() => setHovered((current) => (current === index ? null : current))}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered((current) => (current === index ? null : current))}
                onPress={() => setPinned(index)}
                style={styles.column}
              >
                <Bar
                  active={index === selected}
                  empty={bar.value == null}
                  width={barWidth}
                  height={bar.value == null ? barWidth : barHeight(bar.value)}
                  progress={progress}
                  color={color}
                  tint={tint}
                  stripe={stripe}
                />
              </Pressable>
            ))}
          </View>

          {columnWidth > 0 ? (
            <>
              <Animated.View
                pointerEvents="none"
                onLayout={handleBubbleLayout}
                style={[
                  styles.tooltip,
                  { backgroundColor: color, bottom: baseline + DOT_SIZE / 2 + 6 },
                  bubbleStyle,
                ]}
              >
                <Text style={styles.tooltipText} numberOfLines={1}>
                  {selectedBar?.value != null
                    ? selectedBar.tooltip ?? formatValue(selectedBar.value)
                    : ''}
                </Text>
              </Animated.View>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.dot,
                  { borderColor: color, bottom: baseline - DOT_SIZE / 2 },
                  dotStyle,
                ]}
              />
            </>
          ) : null}
        </View>
      </View>

      <View style={styles.labels}>
        {bars.map((bar, index) => (
          <Text
            key={bar.key}
            style={[
              styles.label,
              index === selected && styles.labelActive,
              bar.value == null && styles.labelEmpty,
            ]}
            numberOfLines={1}
          >
            {bar.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Bar({
  active,
  empty,
  width,
  height,
  progress,
  color,
  tint,
  stripe,
}: {
  active: boolean;
  empty: boolean;
  width: number;
  height: number;
  progress: SharedValue<number>;
  color: string;
  tint: string;
  stripe: string;
}) {
  const emphasis = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    emphasis.value = withTiming(active && !empty ? 1 : 0, TIMING);
  }, [active, empty, emphasis]);

  const growStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: height - grownHeight(height, progress.value) }],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(emphasis.value, [0, 1], [tint, color]),
  }));
  const stripeStyle = useAnimatedStyle(() => ({ opacity: 1 - emphasis.value }));

  if (empty) {
    return (
      <View
        style={[
          styles.bar,
          styles.barEmpty,
          { width, height, borderRadius: width / 2, borderColor: stripe },
        ]}
      />
    );
  }

  const shape = { width, height, borderRadius: width / 2 };

  return (
    <View style={[styles.bar, shape]}>
      <Animated.View style={[styles.bar, shape, fillStyle, growStyle]}>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            createGradientStyle(
              `repeating-linear-gradient(135deg, ${stripe} 0px, ${stripe} 2px, transparent 2px, transparent 7px)`,
            ),
            stripeStyle,
          ]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    flexDirection: 'row',
  },
  axis: {
    width: AXIS_WIDTH,
    justifyContent: 'space-between',
  },
  axisLabel: {
    color: colors.textMuted,
    ...typography.caption,
    fontSize: 11,
    lineHeight: 12,
    marginTop: -6,
    marginBottom: -6,
  },
  plot: {
    flex: 1,
    position: 'relative',
  },
  grid: {
    position: 'absolute',
    left: 0,
    right: 0,
    justifyContent: 'space-between',
  },
  gridLine: {
    height: 0,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderStyle: Platform.OS === 'web' ? 'dashed' : 'solid',
  },
  gridBase: {
    borderStyle: 'solid',
  },
  columns: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
  },
  column: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    overflow: 'hidden',
  },
  barEmpty: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  tooltip: {
    position: 'absolute',
    left: 0,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  tooltipText: {
    color: palette.white,
    ...typography.caption,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  dot: {
    position: 'absolute',
    left: 0,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2.5,
    backgroundColor: palette.white,
  },
  labels: {
    flexDirection: 'row',
    marginTop: 8,
    paddingLeft: AXIS_WIDTH,
  },
  label: {
    flex: 1,
    textAlign: 'center',
    color: colors.textMuted,
    ...typography.caption,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  labelActive: {
    color: colors.text,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
  },
  labelEmpty: {
    opacity: 0.55,
  },
});

export default BarChart;
