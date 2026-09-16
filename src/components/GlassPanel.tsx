import { BlurView } from 'expo-blur';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityRole,
  type AccessibilityState,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  bubbleStyles,
  GlassGradients,
  GlassMaterials,
  GlassMotion,
  glassStyles,
  glassToneProgress,
  LiquidBubbleFields,
  LiquidBubbleGradients,
  LiquidBubbleMetrics,
  LiquidBubbleMotion,
  LiquidBubblePillGradients,
  LiquidBubbleTints,
  LiquidBubbleTones,
  resolveGlassTone,
  type BubbleTint,
  type GlassTone,
  type GlassVariant,
  type LiquidBubbleSeed,
} from '@/constants/glassTheme';
import { colors } from '@/constants/themeColor';
import { useBlurTarget } from '@/hooks/useBlurTarget';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const BASE_BACKGROUND = colors.background;

type GlassRadius = ViewStyle['borderRadius'];
type GlassAnimatedNumber = number | Animated.Value | Animated.AnimatedInterpolation<number>;

type GlassEnvironmentValue = {
  background: string;
  tone: GlassTone;
  toneProgress: number;
  setBackground: (color: string) => void;
};

const GlassEnvironmentContext = createContext<GlassEnvironmentValue>({
  background: BASE_BACKGROUND,
  tone: resolveGlassTone(BASE_BACKGROUND),
  toneProgress: glassToneProgress(BASE_BACKGROUND),
  setBackground: () => undefined,
});

export function GlassEnvironmentProvider({
  background,
  children,
}: {
  background?: string;
  children: ReactNode;
}) {
  const [tracked, setTracked] = useState<string>(BASE_BACKGROUND);
  const current = background ?? tracked;

  const value = useMemo<GlassEnvironmentValue>(
    () => ({
      background: current,
      tone: resolveGlassTone(current),
      toneProgress: glassToneProgress(current),
      setBackground: setTracked,
    }),
    [current],
  );

  return <GlassEnvironmentContext.Provider value={value}>{children}</GlassEnvironmentContext.Provider>;
}

export function useGlassEnvironment(backgroundHint?: string): GlassEnvironmentValue {
  const environment = useContext(GlassEnvironmentContext);

  return useMemo(() => {
    if (!backgroundHint || backgroundHint === environment.background) {
      return environment;
    }

    return {
      ...environment,
      background: backgroundHint,
      tone: resolveGlassTone(backgroundHint),
      toneProgress: glassToneProgress(backgroundHint),
    };
  }, [environment, backgroundHint]);
}

export function useAnimatedValue(initial: number): Animated.Value {
  const [value] = useState(() => new Animated.Value(initial));
  return value;
}

function useToneValue(toneProgress: number) {
  const value = useAnimatedValue(toneProgress);

  useEffect(() => {
    Animated.timing(value, {
      toValue: toneProgress,
      duration: GlassMotion.tone.duration,
      easing: GlassMotion.tone.easing,
      useNativeDriver: false,
    }).start();
  }, [toneProgress, value]);

  return value;
}

export type GlassInteraction = {
  hover: Animated.Value;
  press: Animated.Value;
  shimmer: Animated.Value;
  energy: Animated.AnimatedInterpolation<number>;
  triggerShimmer: () => void;
  handlers: {
    onHoverIn: () => void;
    onHoverOut: () => void;
    onPressIn: () => void;
    onPressOut: () => void;
  };
};

export function useGlassInteraction(options?: {
  disabled?: boolean;
  shimmerOnPress?: boolean;
}): GlassInteraction {
  const disabled = options?.disabled ?? false;
  const shimmerOnPress = options?.shimmerOnPress ?? true;

  const hover = useAnimatedValue(0);
  const press = useAnimatedValue(0);
  const shimmer = useAnimatedValue(0);

  const triggerShimmer = useCallback(() => {
    shimmer.stopAnimation();
    shimmer.setValue(0);
    Animated.timing(shimmer, {
      toValue: 1,
      duration: GlassMotion.shimmer.duration,
      easing: GlassMotion.shimmer.easing,
      useNativeDriver: false,
    }).start();
  }, [shimmer]);

  const energy = useMemo(
    () =>
      Animated.add(Animated.multiply(hover, 0.45), Animated.multiply(press, 0.55)).interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    [hover, press],
  );

  const handlers = useMemo(
    () => ({
      onHoverIn: () => {
        if (disabled) {
          return;
        }
        Animated.timing(hover, {
          toValue: 1,
          duration: GlassMotion.hover.duration,
          easing: GlassMotion.hover.easing,
          useNativeDriver: false,
        }).start();
      },
      onHoverOut: () => {
        if (disabled) {
          return;
        }
        Animated.timing(hover, {
          toValue: 0,
          duration: GlassMotion.hover.duration,
          easing: GlassMotion.hover.easing,
          useNativeDriver: false,
        }).start();
      },
      onPressIn: () => {
        if (disabled) {
          return;
        }
        Animated.timing(press, {
          toValue: 1,
          duration: GlassMotion.press.duration,
          easing: GlassMotion.press.easing,
          useNativeDriver: false,
        }).start();
        if (shimmerOnPress) {
          triggerShimmer();
        }
      },
      onPressOut: () => {
        if (disabled) {
          return;
        }
        Animated.spring(press, {
          toValue: 0,
          friction: GlassMotion.release.friction,
          tension: GlassMotion.release.tension,
          useNativeDriver: false,
        }).start();
      },
    }),
    [disabled, hover, press, shimmerOnPress, triggerShimmer],
  );

  return useMemo(
    () => ({ hover, press, shimmer, energy, triggerShimmer, handlers }),
    [hover, press, shimmer, energy, triggerShimmer, handlers],
  );
}

export type GlassLensTarget = { x: number; y: number; width: number; height: number };

export type GlassLensController = {
  left: Animated.AnimatedInterpolation<number>;
  top: Animated.AnimatedInterpolation<number>;
  width: Animated.AnimatedInterpolation<number>;
  height: Animated.AnimatedInterpolation<number>;
  centerX: Animated.AnimatedInterpolation<number>;
  centerY: Animated.AnimatedInterpolation<number>;
  bell: Animated.AnimatedInterpolation<number>;
  ready: Animated.Value;
  moveTo: (target: GlassLensTarget | null) => void;
  resize: (target: GlassLensTarget | null) => void;
};

function sameTarget(a: GlassLensTarget | null, b: GlassLensTarget | null) {
  if (!a || !b) {
    return false;
  }
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function useGlassLens(axis: 'x' | 'y' = 'x'): GlassLensController {
  const x = useAnimatedValue(0);
  const y = useAnimatedValue(0);
  const rawWidth = useAnimatedValue(0);
  const rawHeight = useAnimatedValue(0);
  const travel = useAnimatedValue(0);
  const stretch = useAnimatedValue(0);
  const ready = useAnimatedValue(0);
  const settled = useRef<GlassLensTarget | null>(null);

  const horizontal = axis === 'x';

  const bell = useMemo(
    () => travel.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] }),
    [travel],
  );
  const grow = useMemo(() => Animated.multiply(bell, stretch), [bell, stretch]);
  const halfGrow = useMemo(() => Animated.multiply(grow, 0.5), [grow]);

  const left = useMemo(
    () =>
      (horizontal ? Animated.subtract(x, halfGrow) : Animated.add(x, 0)) as Animated.AnimatedInterpolation<number>,
    [horizontal, x, halfGrow],
  );
  const top = useMemo(
    () =>
      (horizontal ? Animated.add(y, 0) : Animated.subtract(y, halfGrow)) as Animated.AnimatedInterpolation<number>,
    [horizontal, y, halfGrow],
  );
  const width = useMemo(
    () =>
      (horizontal
        ? Animated.add(rawWidth, grow)
        : Animated.add(rawWidth, 0)) as Animated.AnimatedInterpolation<number>,
    [horizontal, rawWidth, grow],
  );
  const height = useMemo(
    () =>
      (horizontal
        ? Animated.add(rawHeight, 0)
        : Animated.add(rawHeight, grow)) as Animated.AnimatedInterpolation<number>,
    [horizontal, rawHeight, grow],
  );
  const centerX = useMemo(
    () => Animated.add(x, Animated.multiply(rawWidth, 0.5)) as Animated.AnimatedInterpolation<number>,
    [x, rawWidth],
  );
  const centerY = useMemo(
    () => Animated.add(y, Animated.multiply(rawHeight, 0.5)) as Animated.AnimatedInterpolation<number>,
    [y, rawHeight],
  );

  const moveTo = useCallback(
    (target: GlassLensTarget | null) => {
      if (!target || target.width <= 0 || target.height <= 0) {
        return;
      }
      if (sameTarget(settled.current, target)) {
        return;
      }

      const previous = settled.current;
      settled.current = target;

      if (!previous) {
        x.setValue(target.x);
        y.setValue(target.y);
        rawWidth.setValue(target.width);
        rawHeight.setValue(target.height);
        travel.setValue(0);
        stretch.setValue(0);
        Animated.timing(ready, {
          toValue: 1,
          duration: GlassMotion.morph.duration,
          easing: GlassMotion.morph.easing,
          useNativeDriver: false,
        }).start();
        return;
      }

      const distance = horizontal
        ? Math.abs(target.x - previous.x)
        : Math.abs(target.y - previous.y);
      stretch.setValue(Math.min(distance * GlassMotion.stretchRatio, GlassMotion.stretchMax));
      travel.setValue(0);

      Animated.parallel([
        Animated.timing(travel, {
          toValue: 1,
          duration: GlassMotion.travelBell.duration,
          easing: GlassMotion.travelBell.easing,
          useNativeDriver: false,
        }),
        Animated.timing(x, {
          toValue: target.x,
          duration: GlassMotion.travel.duration,
          easing: GlassMotion.travel.easing,
          useNativeDriver: false,
        }),
        Animated.timing(y, {
          toValue: target.y,
          duration: GlassMotion.travel.duration,
          easing: GlassMotion.travel.easing,
          useNativeDriver: false,
        }),
        Animated.timing(rawWidth, {
          toValue: target.width,
          duration: GlassMotion.travel.duration,
          easing: GlassMotion.travel.easing,
          useNativeDriver: false,
        }),
        Animated.timing(rawHeight, {
          toValue: target.height,
          duration: GlassMotion.travel.duration,
          easing: GlassMotion.travel.easing,
          useNativeDriver: false,
        }),
      ]).start();
    },
    [horizontal, x, y, rawWidth, rawHeight, travel, stretch, ready],
  );

  const resize = useCallback(
    (target: GlassLensTarget | null) => {
      if (!target || target.width <= 0 || target.height <= 0) {
        return;
      }
      if (sameTarget(settled.current, target)) {
        return;
      }
      if (!settled.current) {
        moveTo(target);
        return;
      }

      settled.current = target;

      Animated.parallel([
        Animated.timing(x, {
          toValue: target.x,
          duration: GlassMotion.morph.duration,
          easing: GlassMotion.morph.easing,
          useNativeDriver: false,
        }),
        Animated.timing(y, {
          toValue: target.y,
          duration: GlassMotion.morph.duration,
          easing: GlassMotion.morph.easing,
          useNativeDriver: false,
        }),
        Animated.timing(rawWidth, {
          toValue: target.width,
          duration: GlassMotion.morph.duration,
          easing: GlassMotion.morph.easing,
          useNativeDriver: false,
        }),
        Animated.timing(rawHeight, {
          toValue: target.height,
          duration: GlassMotion.morph.duration,
          easing: GlassMotion.morph.easing,
          useNativeDriver: false,
        }),
      ]).start();
    },
    [x, y, rawWidth, rawHeight, moveTo],
  );

  return useMemo(
    () => ({ left, top, width, height, centerX, centerY, bell, ready, moveTo, resize }),
    [left, top, width, height, centerX, centerY, bell, ready, moveTo, resize],
  );
}

export function useLensMagnify(
  lens: GlassLensController,
  layout: GlassLensTarget | undefined,
  axis: 'x' | 'y' = 'x',
) {
  return useMemo(() => {
    if (!layout || layout.width <= 0 || layout.height <= 0) {
      return null;
    }

    const horizontal = axis === 'x';
    const center = horizontal ? layout.x + layout.width / 2 : layout.y + layout.height / 2;
    const span = horizontal ? layout.width : layout.height;
    const source = horizontal ? lens.centerX : lens.centerY;

    return source.interpolate({
      inputRange: [center - span, center, center + span],
      outputRange: [1, GlassMotion.magnify, 1],
      extrapolate: 'clamp',
    });
  }, [lens, layout, axis]);
}

export type LiquidBubbleProps = {
  size: number;
  tint?: BubbleTint;
  backgroundHint?: string;
  contactShadow?: boolean;
  cast?: boolean;
  opacity?: GlassAnimatedNumber;
  style?: StyleProp<ViewStyle>;
};

export function LiquidBubble({
  size,
  tint = 'iridescent',
  backgroundHint,
  contactShadow = true,
  cast = true,
  opacity = 1,
  style,
}: LiquidBubbleProps) {
  const { tone } = useGlassEnvironment(backgroundHint);
  const spec = LiquidBubbleTones[tone];
  const hue = LiquidBubbleGradients[tint];

  const radius = size / 2;
  const catchLight = LiquidBubbleMetrics.catchLight;
  const contact = LiquidBubbleMetrics.contact;

  return (
    <Animated.View
      pointerEvents="none"
      style={[bubbleStyles.bubble, { width: size, height: size, opacity }, style]}>
      {contactShadow && (
        <View
          style={[
            bubbleStyles.contact,
            LiquidBubbleGradients.contact,
            {
              width: size * contact.width,
              height: size * contact.height,
              left: size * ((1 - contact.width) / 2),
              top: size * contact.top,
              borderRadius: (size * contact.height) / 2,
            },
          ]}
        />
      )}

      <View
        style={[
          bubbleStyles.disc,
          {
            borderRadius: radius,
            shadowColor: spec.shadowColor,
            shadowOpacity: cast ? spec.shadowOpacity : 0,
            shadowRadius: spec.shadowRadius,
            shadowOffset: { width: 0, height: size * 0.06 },
            elevation: cast ? spec.elevation : 0,
          },
        ]}>
        <View style={[bubbleStyles.layer, hue, { opacity: spec.iridescence, borderRadius: radius }]} />
        <View style={[bubbleStyles.layer, LiquidBubbleGradients.core, { opacity: spec.core, borderRadius: radius }]} />
        <View style={[bubbleStyles.layer, LiquidBubbleGradients.shell, { opacity: spec.shell, borderRadius: radius }]} />
        <View
          style={[
            bubbleStyles.layer,
            LiquidBubbleGradients.refraction,
            { opacity: spec.refraction, borderRadius: radius },
          ]}
        />
        <View
          style={[bubbleStyles.layer, LiquidBubbleGradients.bounce, { opacity: spec.bounce, borderRadius: radius }]}
        />
        <View
          style={[
            bubbleStyles.layer,
            LiquidBubbleGradients.specular,
            { opacity: spec.specular, borderRadius: radius },
          ]}
        />
        <View
          style={[
            bubbleStyles.catchLight,
            LiquidBubbleGradients.catchLight,
            {
              width: size * catchLight.width,
              height: size * catchLight.height,
              left: size * catchLight.left,
              top: size * catchLight.top,
              borderRadius: (size * catchLight.height) / 2,
              transform: [{ rotate: catchLight.rotate }],
            },
          ]}
        />
        <View style={[bubbleStyles.rim, { borderColor: spec.border, borderRadius: radius }]} />
      </View>
    </Animated.View>
  );
}

export type LiquidBubbleSkinProps = {
  radius?: GlassRadius;
  tint?: BubbleTint;
  backgroundHint?: string;
  opacity?: GlassAnimatedNumber;
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function LiquidBubbleSkin({
  radius = 999,
  tint = 'iridescent',
  backgroundHint,
  opacity = 1,
  bordered = true,
  style,
}: LiquidBubbleSkinProps) {
  const { tone } = useGlassEnvironment(backgroundHint);
  const spec = LiquidBubbleTones[tone];
  const hue = LiquidBubbleGradients[tint];

  return (
    <Animated.View
      pointerEvents="none"
      style={[bubbleStyles.disc, { borderRadius: radius, opacity }, style]}>
      <View
        style={[bubbleStyles.layer, LiquidBubblePillGradients.core, { opacity: spec.core, borderRadius: radius }]}
      />
      <View style={[bubbleStyles.layer, hue, { opacity: spec.iridescence, borderRadius: radius }]} />
      <View
        style={[bubbleStyles.layer, LiquidBubblePillGradients.shell, { opacity: spec.shell, borderRadius: radius }]}
      />
      <View
        style={[
          bubbleStyles.layer,
          LiquidBubblePillGradients.refraction,
          { opacity: spec.refraction, borderRadius: radius },
        ]}
      />
      <View
        style={[
          bubbleStyles.layer,
          LiquidBubblePillGradients.specular,
          { opacity: spec.specular, borderRadius: radius },
        ]}
      />
      {bordered && <View style={[bubbleStyles.rim, { borderColor: spec.border, borderRadius: radius }]} />}
    </Animated.View>
  );
}

type DriftingBubbleProps = {
  seed: LiquidBubbleSeed;
  container: { width: number; height: number };
  tint: BubbleTint;
  backgroundHint?: string;
  animated: boolean;
};

function DriftingBubble({ seed, container, tint, backgroundHint, animated }: DriftingBubbleProps) {
  const phase = useAnimatedValue(0);
  const swell = useAnimatedValue(0);
  const rise = useAnimatedValue(0);

  const size = seed.size * container.width;

  useEffect(() => {
    const entrance = Animated.timing(rise, {
      toValue: 1,
      duration: LiquidBubbleMotion.rise.duration,
      delay: seed.delay,
      easing: LiquidBubbleMotion.rise.easing,
      useNativeDriver: true,
    });
    entrance.start();

    if (!animated) {
      return () => entrance.stop();
    }

    const drift = Animated.loop(
      Animated.sequence([
        Animated.timing(phase, {
          toValue: 1,
          duration: LiquidBubbleMotion.drift.duration,
          delay: seed.delay,
          easing: LiquidBubbleMotion.drift.easing,
          useNativeDriver: true,
        }),
        Animated.timing(phase, {
          toValue: 0,
          duration: LiquidBubbleMotion.drift.duration,
          easing: LiquidBubbleMotion.drift.easing,
          useNativeDriver: true,
        }),
      ]),
    );
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(swell, {
          toValue: 1,
          duration: LiquidBubbleMotion.swell.duration,
          easing: LiquidBubbleMotion.swell.easing,
          useNativeDriver: true,
        }),
        Animated.timing(swell, {
          toValue: 0,
          duration: LiquidBubbleMotion.swell.duration,
          easing: LiquidBubbleMotion.swell.easing,
          useNativeDriver: true,
        }),
      ]),
    );

    drift.start();
    breathe.start();

    return () => {
      entrance.stop();
      drift.stop();
      breathe.stop();
    };
  }, [animated, phase, rise, seed.delay, swell]);

  if (size <= 0) {
    return null;
  }

  const travel = LiquidBubbleMotion.driftRange * seed.drift;
  const translateY = phase.interpolate({ inputRange: [0, 1], outputRange: [0, -travel] });
  const translateX = phase.interpolate({ inputRange: [0, 1], outputRange: [0, travel * 0.38] });
  const scale = swell.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1 + LiquidBubbleMotion.swellRange],
  });

  return (
    <Animated.View
      pointerEvents="none"
      renderToHardwareTextureAndroid
      shouldRasterizeIOS
      style={{
        position: 'absolute',
        left: seed.x * container.width,
        top: seed.y * container.height,
        opacity: Animated.multiply(rise, seed.opacity),
        transform: [{ translateX }, { translateY }, { scale }],
      }}>
      <LiquidBubble
        size={size}
        tint={seed.tint ?? tint}
        backgroundHint={backgroundHint}
        contactShadow={false}
        cast={false}
      />
    </Animated.View>
  );
}

export type LiquidBubbleFieldProps = {
  seeds?: LiquidBubbleSeed[] | keyof typeof LiquidBubbleFields;
  tint?: BubbleTint;
  backgroundHint?: string;
  radius?: GlassRadius;
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function LiquidBubbleField({
  seeds = 'sidebar',
  tint = 'iridescent',
  backgroundHint,
  radius,
  animated = true,
  style,
}: LiquidBubbleFieldProps) {
  const [container, setContainer] = useState({ width: 0, height: 0 });

  const resolved = useMemo(
    () => (typeof seeds === 'string' ? LiquidBubbleFields[seeds] : seeds),
    [seeds],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainer((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  }, []);

  return (
    <View
      pointerEvents="none"
      onLayout={handleLayout}
      style={[bubbleStyles.field, radius !== undefined && { borderRadius: radius }, style]}>
      {container.width > 0 &&
        resolved.map((seed) => (
          <DriftingBubble
            key={seed.key}
            seed={seed}
            container={container}
            tint={tint}
            backgroundHint={backgroundHint}
            animated={animated}
          />
        ))}
    </View>
  );
}

export function useBubbleFringe(tint: BubbleTint = 'iridescent') {
  return LiquidBubbleTints[tint];
}

type GlassLensViewProps = {
  lens: GlassLensController;
  radius?: number;
  variant?: GlassVariant;
  backgroundHint?: string;
  tint?: string;
  blurEnabled?: boolean;
  fringe?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function GlassLensView({
  lens,
  radius = 26,
  variant = 'chip',
  backgroundHint,
  tint,
  blurEnabled = false,
  fringe = true,
  style,
}: GlassLensViewProps) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        glassStyles.lensShell,
        {
          width: lens.width,
          height: lens.height,
          borderRadius: radius,
          opacity: lens.ready,
          transform: [{ translateX: lens.left }, { translateY: lens.top }],
        },
        style,
      ]}>
      {tint && (
        <Animated.View style={[glassStyles.layer, { backgroundColor: tint, borderRadius: radius }]} />
      )}
      <GlassMaterial
        variant={variant}
        backgroundHint={backgroundHint}
        radius={radius}
        blurEnabled={blurEnabled}
      />
      <Animated.View
        style={[
          glassStyles.layer,
          GlassGradients.lensSpecular,
          {
            borderRadius: radius,
            opacity: lens.bell.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
          },
        ]}
      />
      {fringe && (
        <>
          <Animated.View
            style={[glassStyles.lensFringeLeading, GlassGradients.fringeLeading, { opacity: lens.bell }]}
          />
          <Animated.View
            style={[glassStyles.lensFringeTrailing, GlassGradients.fringeTrailing, { opacity: lens.bell }]}
          />
        </>
      )}
    </Animated.View>
  );
}

type GlassMaterialProps = {
  variant?: GlassVariant;
  backgroundHint?: string;
  radius?: GlassRadius;
  interaction?: GlassInteraction | null;
  blurEnabled?: boolean;
  liveBlur?: boolean;
  sheen?: boolean;
  bordered?: boolean;
  wash?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function GlassMaterial({
  variant = 'bar',
  backgroundHint,
  radius,
  interaction,
  blurEnabled = true,
  liveBlur = false,
  sheen = false,
  bordered = true,
  wash = true,
  style,
}: GlassMaterialProps) {
  const { tone, toneProgress } = useGlassEnvironment(backgroundHint);
  const toneValue = useToneValue(toneProgress);
  const material = GlassMaterials[variant];
  const blurTarget = useBlurTarget();
  const [width, setWidth] = useState(0);

  const cornerRadius = radius ?? material.radius;
  const sweeps = sheen && Boolean(interaction);
  const liveTarget =
    Platform.OS === 'android' && liveBlur && blurTarget?.current ? blurTarget : undefined;
  const blurIntensity = Math.round(
    material.light.blur + (material.dark.blur - material.light.blur) * toneProgress,
  );

  const tint = toneValue.interpolate({
    inputRange: [0, 1],
    outputRange: [material.light.tint, material.dark.tint],
  });
  const borderColor = toneValue.interpolate({
    inputRange: [0, 1],
    outputRange: [material.light.border, material.dark.border],
  });
  const rimColor = toneValue.interpolate({
    inputRange: [0, 1],
    outputRange: [material.light.rim, material.dark.rim],
  });
  const washOpacity = toneValue.interpolate({
    inputRange: [0, 1],
    outputRange: [material.light.wash, material.dark.wash],
  });
  const lensOpacity = toneValue.interpolate({
    inputRange: [0, 1],
    outputRange: [material.light.lens, material.dark.lens],
  });
  const edgeOpacity = toneValue.interpolate({
    inputRange: [0, 1],
    outputRange: [material.light.edge, material.dark.edge],
  });
  const bounceOpacity = toneValue.interpolate({
    inputRange: [0, 1],
    outputRange: [material.light.bounce, material.dark.bounce],
  });

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      setWidth(event.nativeEvent.layout.width);
    },
    [setWidth],
  );

  return (
    <Animated.View
      pointerEvents="none"
      onLayout={sweeps ? handleLayout : undefined}
      style={[
        glassStyles.material,
        {
          borderRadius: cornerRadius,
          borderWidth: bordered ? material.borderWidth : 0,
          borderColor,
        },
        style,
      ]}>
      {blurEnabled && (
        <BlurView
          style={StyleSheet.absoluteFill}
          tint={tone === 'dark' ? 'dark' : 'light'}
          intensity={blurIntensity}
          blurMethod={liveTarget ? 'dimezisBlurViewSdk31Plus' : undefined}
          blurTarget={liveTarget}
        />
      )}
      <Animated.View style={[glassStyles.layer, { backgroundColor: tint }]} />
      {wash && (
        <Animated.View style={[glassStyles.layer, GlassGradients.wash, { opacity: washOpacity }]} />
      )}
      <Animated.View style={[glassStyles.layer, GlassGradients.body, { opacity: lensOpacity }]} />
      <Animated.View style={[glassStyles.edgeLeft, GlassGradients.edgeLeft, { opacity: bounceOpacity }]} />
      <Animated.View
        style={[glassStyles.edgeRight, GlassGradients.edgeRight, { opacity: bounceOpacity }]}
      />
      <Animated.View
        style={[glassStyles.edgeBottom, GlassGradients.edgeBottom, { opacity: bounceOpacity }]}
      />
      <Animated.View style={[glassStyles.edgeTop, GlassGradients.edgeTop, { opacity: edgeOpacity }]} />
      {interaction && (
        <Animated.View
          style={[
            glassStyles.layer,
            GlassGradients.glow,
            {
              opacity: interaction.energy.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.85],
              }),
            },
          ]}
        />
      )}
      <Animated.View style={[glassStyles.rim, { borderRadius: cornerRadius, borderColor: rimColor }]} />
      {sweeps && width > 0 && (
        <Animated.View
          style={[
            glassStyles.sheen,
            GlassGradients.sheen,
            {
              opacity: interaction!.shimmer.interpolate({
                inputRange: [0, 0.15, 0.85, 1],
                outputRange: [0, 0.9, 0.9, 0],
              }),
              transform: [
                {
                  translateX: interaction!.shimmer.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-140, width + 20],
                  }),
                },
                { rotate: '14deg' },
              ],
            },
          ]}
        />
      )}
    </Animated.View>
  );
}

type GlassPanelProps = {
  children?: ReactNode;
  variant?: GlassVariant;
  style?: StyleProp<ViewStyle>;
  reflection?: boolean;
  reflectionStyle?: StyleProp<ViewStyle>;
  materialStyle?: StyleProp<ViewStyle>;
  backgroundHint?: string;
  interaction?: GlassInteraction | null;
  presence?: GlassAnimatedNumber;
  blurEnabled?: boolean;
  liveBlur?: boolean;
  sheen?: boolean;
  wash?: boolean;
  bubbles?: boolean | LiquidBubbleFieldProps['seeds'];
  bubbleTint?: BubbleTint;
  bubbleRadius?: GlassRadius;
  bubblesAnimated?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
};

export function GlassPanel({
  children,
  variant = 'bar',
  style,
  reflection = false,
  reflectionStyle,
  materialStyle,
  backgroundHint,
  interaction,
  presence = 1,
  blurEnabled = true,
  liveBlur = false,
  sheen = false,
  wash = true,
  bubbles,
  bubbleTint = 'iridescent',
  bubbleRadius,
  bubblesAnimated = true,
  onLayout,
}: GlassPanelProps) {
  const { toneProgress } = useGlassEnvironment(backgroundHint);
  const toneValue = useToneValue(toneProgress);
  const material = GlassMaterials[variant];
  const flattened = StyleSheet.flatten(style) as ViewStyle | undefined;
  const cornerRadius = flattened?.borderRadius ?? material.radius;

  const shadowColor = toneValue.interpolate({
    inputRange: [0, 1],
    outputRange: [material.light.shadowColor, material.dark.shadowColor],
  });
  const shadowOpacity = Animated.multiply(
    toneValue.interpolate({
      inputRange: [0, 1],
      outputRange: [material.light.shadowOpacity, material.dark.shadowOpacity],
    }),
    presence,
  );
  const shadowRadius = toneValue.interpolate({
    inputRange: [0, 1],
    outputRange: [material.light.shadowRadius, material.dark.shadowRadius],
  });
  const elevation = Animated.multiply(
    toneValue.interpolate({
      inputRange: [0, 1],
      outputRange: [material.light.elevation, material.dark.elevation],
    }),
    presence,
  );
  const reflectionColor = toneValue.interpolate({
    inputRange: [0, 1],
    outputRange: [material.light.reflection, material.dark.reflection],
  });

  return (
    <Animated.View
      onLayout={onLayout}
      style={[
        glassStyles.shell,
        {
          borderRadius: material.radius,
          shadowColor,
          shadowOpacity,
          shadowRadius,
          shadowOffset: material.shadowOffset,
          elevation,
        },
        style,
      ]}>
      <GlassMaterial
        variant={variant}
        backgroundHint={backgroundHint}
        radius={cornerRadius}
        interaction={interaction}
        blurEnabled={blurEnabled}
        liveBlur={liveBlur}
        sheen={sheen}
        wash={wash}
        style={[{ opacity: presence }, materialStyle]}
      />
      {bubbles ? (
        <LiquidBubbleField
          seeds={bubbles === true ? undefined : bubbles}
          tint={bubbleTint}
          backgroundHint={backgroundHint}
          radius={bubbleRadius ?? cornerRadius}
          animated={bubblesAnimated}
        />
      ) : null}
      {reflection && (
        <Animated.View
          pointerEvents="none"
          style={[
            glassStyles.reflection,
            { backgroundColor: reflectionColor, opacity: presence },
            reflectionStyle,
          ]}
        />
      )}
      {children}
    </Animated.View>
  );
}

type GlassPressableProps = {
  children?: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  variant?: GlassVariant;
  backgroundHint?: string;
  radius?: GlassRadius;
  accent?: string;
  active?: boolean;
  disabled?: boolean;
  blurEnabled?: boolean;
  sheen?: boolean;
  bordered?: boolean;
  wash?: boolean;
  lift?: number;
  flex?: number;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
};

export function GlassPressable({
  children,
  onPress,
  style,
  contentStyle,
  variant = 'control',
  backgroundHint,
  radius,
  accent,
  active = false,
  disabled = false,
  blurEnabled = false,
  sheen = true,
  bordered = true,
  wash = true,
  lift = 2,
  flex = 0.05,
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityState,
}: GlassPressableProps) {
  const interaction = useGlassInteraction({ disabled });
  const material = GlassMaterials[variant];
  const cornerRadius = radius ?? material.radius;
  const activeValue = useAnimatedValue(active ? 1 : 0);
  const previousActive = useRef(active);

  useEffect(() => {
    Animated.timing(activeValue, {
      toValue: active ? 1 : 0,
      duration: GlassMotion.morph.duration,
      easing: GlassMotion.morph.easing,
      useNativeDriver: false,
    }).start();

    if (active && !previousActive.current) {
      interaction.triggerShimmer();
    }
    previousActive.current = active;
  }, [active, activeValue, interaction]);

  const scale = interaction.press.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1 - flex],
  });
  const translateY = interaction.hover.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -lift],
  });

  return (
    <AnimatedPressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={interaction.handlers.onHoverIn}
      onHoverOut={interaction.handlers.onHoverOut}
      onPressIn={interaction.handlers.onPressIn}
      onPressOut={interaction.handlers.onPressOut}
      style={[
        glassStyles.control,
        { borderRadius: cornerRadius, transform: [{ translateY }, { scale }] },
        style,
      ]}>
      <GlassMaterial
        variant={variant}
        backgroundHint={backgroundHint}
        radius={cornerRadius}
        interaction={interaction}
        blurEnabled={blurEnabled}
        bordered={bordered}
        sheen={sheen}
        wash={wash}
      />
      {accent && (
        <Animated.View
          pointerEvents="none"
          style={[
            glassStyles.accent,
            {
              borderRadius: cornerRadius,
              backgroundColor: accent,
              opacity: activeValue,
              transform: [
                {
                  scale: activeValue.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }),
                },
              ],
            },
          ]}>
          <Animated.View style={[glassStyles.layer, GlassGradients.accent]} />
        </Animated.View>
      )}
      <Animated.View pointerEvents="none" style={[glassStyles.content, contentStyle]}>
        {children}
      </Animated.View>
    </AnimatedPressable>
  );
}
