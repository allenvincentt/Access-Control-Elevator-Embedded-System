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
  type AccessibilityRole,
  type AccessibilityState,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { DefaultTheme } from /*@constants/defaultTheme i just copied this file from the original code, but you should replace it with your actual theme import*/;
import {
  GlassGradients,
  GlassMaterials,
  GlassMotion,
  glassStyles,
  glassToneProgress,
  resolveGlassTone,
  type GlassTone,
  type GlassVariant,
} from '@/constants/glassTheme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const BASE_BACKGROUND = DefaultTheme.colors.background;

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

function useToneValue(toneProgress: number) {
  const value = useRef(new Animated.Value(toneProgress)).current;

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

  const hover = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

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
  const x = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;
  const rawWidth = useRef(new Animated.Value(0)).current;
  const rawHeight = useRef(new Animated.Value(0)).current;
  const travel = useRef(new Animated.Value(0)).current;
  const stretch = useRef(new Animated.Value(0)).current;
  const ready = useRef(new Animated.Value(0)).current;
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
  sheen = false,
  bordered = true,
  wash = true,
  style,
}: GlassMaterialProps) {
  const { tone, toneProgress } = useGlassEnvironment(backgroundHint);
  const toneValue = useToneValue(toneProgress);
  const material = GlassMaterials[variant];
  const [width, setWidth] = useState(0);

  const cornerRadius = radius ?? material.radius;
  const sweeps = sheen && Boolean(interaction);
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
          blurMethod={Platform.OS === 'android' ? 'dimezisBlurViewSdk31Plus' : undefined}
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
  sheen?: boolean;
  wash?: boolean;
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
  sheen = false,
  wash = true,
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
        sheen={sheen}
        wash={wash}
        style={[{ opacity: presence }, materialStyle]}
      />
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
  const activeValue = useRef(new Animated.Value(active ? 1 : 0)).current;
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
