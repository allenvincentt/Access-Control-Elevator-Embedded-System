import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Ellipse, Path } from 'react-native-svg';

import { Icon, type IconName } from '@/components/ui/Icon';
import { palette, radius, spacing, typography } from '@/constants/themeColor';

export type ApertureTone =
  | 'idle'
  | 'guide'
  | 'blocked'
  | 'locking'
  | 'working'
  | 'granted'
  | 'denied';

export type FaceApertureProps = {
  tone: ApertureTone;
  progress: number;
  caption: string;
  detail?: string | null;
  bottomReserve?: number;
};

type ToneMeta = {
  accent: string;
  track: string;
  badge: IconName | null;
  spinner: boolean;
  breathe: boolean;
};

const MASK = 'rgba(9, 6, 5, 0.72)';
const DANGER = '#FF6B60';
const SUCCESS = '#4ADE80';

const TONES: Record<ApertureTone, ToneMeta> = {
  idle: {
    accent: 'rgba(255,255,255,0.62)',
    track: 'rgba(255,255,255,0.18)',
    badge: null,
    spinner: false,
    breathe: true,
  },
  guide: {
    accent: palette.gold,
    track: 'rgba(245,207,40,0.22)',
    badge: null,
    spinner: false,
    breathe: false,
  },
  blocked: {
    accent: DANGER,
    track: 'rgba(255,107,96,0.22)',
    badge: 'warning',
    spinner: false,
    breathe: false,
  },
  locking: {
    accent: palette.gold,
    track: 'rgba(245,207,40,0.24)',
    badge: null,
    spinner: false,
    breathe: false,
  },
  working: {
    accent: palette.white,
    track: 'rgba(255,255,255,0.24)',
    badge: null,
    spinner: true,
    breathe: false,
  },
  granted: {
    accent: SUCCESS,
    track: 'rgba(74,222,128,0.24)',
    badge: 'checkCircle',
    spinner: false,
    breathe: false,
  },
  denied: {
    accent: DANGER,
    track: 'rgba(255,107,96,0.24)',
    badge: 'error',
    spinner: false,
    breathe: false,
  },
};

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

export function FaceAperture({
  tone,
  progress,
  caption,
  detail,
  bottomReserve = 0,
}: FaceApertureProps) {
  const { width, height } = useWindowDimensions();
  const [captionHeight, setCaptionHeight] = useState(0);

  const geometry = useMemo(() => {
    const rx = Math.min(width * 0.26, 160);
    const ry = Math.min(rx * 1.36, height * 0.22);
    const cx = width / 2;
    const cy = height / 2;
    const ringRx = rx + 10;
    const ringRy = ry + 10;
    const perimeter =
      Math.PI *
      (3 * (ringRx + ringRy) - Math.sqrt((3 * ringRx + ringRy) * (ringRx + 3 * ringRy)));

    return {
      cx,
      cy,
      rx,
      ry,
      ringRx,
      ringRy,
      perimeter,
      mask: [
        `M0 0 H${width} V${height} H0 Z`,
        `M${cx - rx} ${cy}`,
        `a${rx} ${ry} 0 1 0 ${rx * 2} 0`,
        `a${rx} ${ry} 0 1 0 ${-rx * 2} 0`,
        'Z',
      ].join(' '),
    };
  }, [height, width]);

  const meta = TONES[tone];
  const lock = useSharedValue(0);
  const breath = useSharedValue(0);
  const pop = useSharedValue(0);

  useEffect(() => {
    lock.value = withTiming(Math.max(0, Math.min(1, progress)), {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
  }, [lock, progress]);

  useEffect(() => {
    if (meta.breathe) {
      breath.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      );
    } else {
      breath.value = withTiming(0, { duration: 240 });
    }
  }, [breath, meta.breathe]);

  useEffect(() => {
    pop.value = 0;
    pop.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.back(1.6)) });
  }, [pop, tone]);

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: geometry.perimeter * (1 - lock.value),
    opacity: 0.35 + 0.65 * lock.value,
  }));

  const haloProps = useAnimatedProps(() => ({
    opacity: 0.06 + 0.16 * breath.value,
    strokeWidth: 10 + 14 * breath.value,
  }));

  const preferredTop = geometry.cy + geometry.ringRy + spacing.lg;
  const captionTop = captionHeight
    ? Math.min(
        preferredTop,
        Math.max(spacing.md, height - bottomReserve - spacing.md - captionHeight),
      )
    : preferredTop;

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ scale: 0.7 + 0.3 * pop.value }],
  }));

  return (
    <View style={styles.root} pointerEvents="none">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Path d={geometry.mask} fill={MASK} fillRule="evenodd" />
        <AnimatedEllipse
          cx={geometry.cx}
          cy={geometry.cy}
          rx={geometry.ringRx + 12}
          ry={geometry.ringRy + 12}
          stroke={meta.accent}
          fill="none"
          animatedProps={haloProps}
        />
        <Ellipse
          cx={geometry.cx}
          cy={geometry.cy}
          rx={geometry.rx}
          ry={geometry.ry}
          stroke={meta.accent}
          strokeWidth={1.5}
          strokeOpacity={0.55}
          fill="none"
        />
        <Ellipse
          cx={geometry.cx}
          cy={geometry.cy}
          rx={geometry.ringRx}
          ry={geometry.ringRy}
          stroke={meta.track}
          strokeWidth={5}
          fill="none"
        />
        <AnimatedEllipse
          cx={geometry.cx}
          cy={geometry.cy}
          rx={geometry.ringRx}
          ry={geometry.ringRy}
          stroke={meta.accent}
          strokeWidth={5}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={[geometry.perimeter, geometry.perimeter]}
          transform={`rotate(-90 ${geometry.cx} ${geometry.cy})`}
          animatedProps={arcProps}
        />
      </Svg>

      {meta.badge ? (
        <Animated.View
          style={[
            styles.badge,
            badgeStyle,
            {
              backgroundColor: meta.accent,
              left: geometry.cx - 34,
              top: geometry.cy - 34,
            },
          ]}
        >
          <Icon name={meta.badge} size={34} color={palette.white} />
        </Animated.View>
      ) : null}

      <View
        style={[styles.captionSlot, { top: captionTop }]}
        onLayout={(event) => setCaptionHeight(event.nativeEvent.layout.height)}
      >
        <View style={[styles.pill, { borderColor: withAlpha(meta.accent) }]}>
          {meta.spinner ? (
            <ActivityIndicator size="small" color={palette.white} style={styles.spinner} />
          ) : null}
          <Text style={styles.caption}>{caption}</Text>
        </View>
        {detail ? (
          <Text style={styles.detail} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function withAlpha(color: string) {
  return color.startsWith('#') ? `${color}66` : color;
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  badge: {
    position: 'absolute',
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionSlot: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: 'rgba(9, 6, 5, 0.72)',
  },
  spinner: {
    marginLeft: -spacing.xs,
  },
  caption: {
    color: palette.white,
    ...typography.subheading,
    textAlign: 'center',
  },
  detail: {
    color: 'rgba(255,255,255,0.76)',
    ...typography.caption,
    textAlign: 'center',
    lineHeight: 17,
  },
});

export default FaceAperture;
