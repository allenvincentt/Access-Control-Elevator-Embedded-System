import { Easing, Platform, StyleSheet, type ViewStyle } from "react-native";

import { DefaultTheme } from  /*@constants/defaultTheme i just copied this file from the original code, but you should replace it with your actual theme import*/;

export type GlassTone = "light" | "dark";
export type GlassVariant = "bar" | "floating" | "control" | "chip";

type ColorChannels = { r: number; g: number; b: number };

const SHORT_HEX = /^#([\da-f])([\da-f])([\da-f])$/i;
const LONG_HEX = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})(?:[\da-f]{2})?$/i;
const RGB_CALL = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i;

const FALLBACK_CHANNELS: ColorChannels = { r: 249, g: 247, b: 240 };

const TONE_PIVOT = 0.62;
const TONE_RANGE = 0.5;

function clamp01(value: number) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function parseGlassColor(color: string): ColorChannels {
  const short = SHORT_HEX.exec(color);
  if (short) {
    return {
      r: parseInt(`${short[1]}${short[1]}`, 16),
      g: parseInt(`${short[2]}${short[2]}`, 16),
      b: parseInt(`${short[3]}${short[3]}`, 16),
    };
  }

  const long = LONG_HEX.exec(color);
  if (long) {
    return {
      r: parseInt(long[1], 16),
      g: parseInt(long[2], 16),
      b: parseInt(long[3], 16),
    };
  }

  const call = RGB_CALL.exec(color);
  if (call) {
    return { r: Number(call[1]), g: Number(call[2]), b: Number(call[3]) };
  }

  return FALLBACK_CHANNELS;
}

export function relativeLuminance(color: string): number {
  const { r, g, b } = parseGlassColor(color);
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function glassToneProgress(background: string): number {
  return clamp01((TONE_PIVOT - relativeLuminance(background)) / TONE_RANGE);
}

export function resolveGlassTone(background: string): GlassTone {
  return glassToneProgress(background) >= 0.5 ? "dark" : "light";
}

type GradientStyle = ViewStyle & { backgroundImage?: string };

export function createGradientStyle(image: string): GradientStyle {
  const style: GradientStyle = { experimental_backgroundImage: image };

  if (Platform.OS === "web") {
    style.backgroundImage = image;
  }

  return style;
}

export const GlassLens = {
  body: "linear-gradient(157deg, rgba(255,255,255,0.58) 0%, rgba(255,255,255,0.14) 26%, rgba(255,255,255,0) 54%, rgba(255,255,255,0.12) 78%, rgba(255,255,255,0.38) 100%)",
  edgeTop:
    "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.42) 30%, rgba(255,255,255,0.06) 68%, rgba(255,255,255,0) 100%)",
  edgeBottom:
    "linear-gradient(0deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.16) 44%, rgba(255,255,255,0) 100%)",
  edgeLeft:
    "linear-gradient(90deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.10) 46%, rgba(255,255,255,0) 100%)",
  edgeRight:
    "linear-gradient(270deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.10) 46%, rgba(255,255,255,0) 100%)",
  wash: `linear-gradient(158deg, rgba(138,153,0,0.12) 0%, rgba(232,218,23,0.06) 38%, rgba(78,164,229,0.05) 72%, rgba(255,255,255,0) 100%)`,
  sheen:
    "linear-gradient(102deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.26) 38%, rgba(255,255,255,0.84) 50%, rgba(255,255,255,0.26) 62%, rgba(255,255,255,0) 100%)",
  glow: `linear-gradient(180deg, rgba(255,255,255,0.60) 0%, rgba(250,255,204,0.34) 48%, rgba(138,153,0,0.22) 100%)`,
  accent:
    "linear-gradient(151deg, rgba(255,255,255,0.44) 0%, rgba(255,255,255,0.10) 44%, rgba(0,0,0,0.07) 100%)",
  lensSpecular:
    "linear-gradient(200deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.20) 22%, rgba(255,255,255,0) 50%, rgba(255,255,255,0.24) 78%, rgba(255,255,255,0.78) 100%)",
  fringeLeading:
    "linear-gradient(90deg, rgba(126,255,214,0.60) 0%, rgba(178,142,255,0.32) 44%, rgba(255,255,255,0) 100%)",
  fringeTrailing:
    "linear-gradient(270deg, rgba(255,150,220,0.54) 0%, rgba(140,200,255,0.30) 44%, rgba(255,255,255,0) 100%)",
} as const;

export const GlassGradients = {
  body: createGradientStyle(GlassLens.body),
  edgeTop: createGradientStyle(GlassLens.edgeTop),
  edgeBottom: createGradientStyle(GlassLens.edgeBottom),
  edgeLeft: createGradientStyle(GlassLens.edgeLeft),
  edgeRight: createGradientStyle(GlassLens.edgeRight),
  wash: createGradientStyle(GlassLens.wash),
  sheen: createGradientStyle(GlassLens.sheen),
  glow: createGradientStyle(GlassLens.glow),
  accent: createGradientStyle(GlassLens.accent),
  lensSpecular: createGradientStyle(GlassLens.lensSpecular),
  fringeLeading: createGradientStyle(GlassLens.fringeLeading),
  fringeTrailing: createGradientStyle(GlassLens.fringeTrailing),
} as const;

export const GlassMotion = {
  tone: { duration: 520, easing: Easing.inOut(Easing.cubic) },
  morph: { duration: 420, easing: Easing.out(Easing.cubic) },
  hover: { duration: 220, easing: Easing.out(Easing.cubic) },
  press: { duration: 110, easing: Easing.out(Easing.quad) },
  release: { friction: 5, tension: 240 },
  shimmer: { duration: 720, easing: Easing.inOut(Easing.quad) },
  travel: { duration: 540, easing: Easing.bezier(0.24, 1.02, 0.32, 1) },
  travelBell: { duration: 540, easing: Easing.inOut(Easing.quad) },
  magnify: 1.16,
  stretchRatio: 0.34,
  stretchMax: 82,
} as const;

export type GlassToneSpec = {
  tint: string;
  border: string;
  rim: string;
  reflection: string;
  wash: number;
  lens: number;
  edge: number;
  bounce: number;
  blur: number;
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

export type GlassMaterialSpec = {
  radius: number;
  borderWidth: number;
  shadowOffset: { width: number; height: number };
  light: GlassToneSpec;
  dark: GlassToneSpec;
};

export const GlassMaterials: Record<GlassVariant, GlassMaterialSpec> = {
  bar: {
    radius: DefaultTheme.radius.lg,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    light: {
      tint: "rgba(255, 255, 255, 0.34)",
      border: "rgba(255, 255, 255, 0.86)",
      rim: "rgba(255, 255, 255, 0.5)",
      reflection: "rgba(255, 255, 255, 0.96)",
      wash: 0.42,
      lens: 0.5,
      edge: 0.66,
      bounce: 0.3,
      blur: 34,
      shadowColor: "#69705A",
      shadowOpacity: 0.16,
      shadowRadius: 16,
      elevation: 7,
    },
    dark: {
      tint: "rgba(26, 28, 23, 0.36)",
      border: "rgba(255, 255, 255, 0.22)",
      rim: "rgba(255, 255, 255, 0.14)",
      reflection: "rgba(255, 255, 255, 0.52)",
      wash: 0.52,
      lens: 0.38,
      edge: 0.46,
      bounce: 0.22,
      blur: 50,
      shadowColor: "#070A05",
      shadowOpacity: 0.52,
      shadowRadius: 28,
      elevation: 12,
    },
  },
  floating: {
    radius: 36,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 14 },
    light: {
      tint: "rgba(255, 255, 255, 0.14)",
      border: "rgba(255, 255, 255, 0.9)",
      rim: "rgba(255, 255, 255, 0.68)",
      reflection: "rgba(255, 255, 255, 1)",
      wash: 0.2,
      lens: 0.74,
      edge: 0.92,
      bounce: 0.52,
      blur: 34,
      shadowColor: "#69705A",
      shadowOpacity: 0.22,
      shadowRadius: 30,
      elevation: 12,
    },
    dark: {
      tint: "rgba(20, 22, 18, 0.22)",
      border: "rgba(255, 255, 255, 0.32)",
      rim: "rgba(255, 255, 255, 0.22)",
      reflection: "rgba(255, 255, 255, 0.66)",
      wash: 0.32,
      lens: 0.58,
      edge: 0.72,
      bounce: 0.42,
      blur: 44,
      shadowColor: "#050703",
      shadowOpacity: 0.5,
      shadowRadius: 40,
      elevation: 16,
    },
  },
  control: {
    radius: DefaultTheme.radius.md,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    light: {
      tint: "rgba(255, 255, 255, 0.24)",
      border: "rgba(255, 255, 255, 0.66)",
      rim: "rgba(255, 255, 255, 0.42)",
      reflection: "rgba(255, 255, 255, 0.9)",
      wash: 0.32,
      lens: 0.44,
      edge: 0.56,
      bounce: 0.26,
      blur: 16,
      shadowColor: "#69705A",
      shadowOpacity: 0.1,
      shadowRadius: 10,
      elevation: 3,
    },
    dark: {
      tint: "rgba(255, 255, 255, 0.12)",
      border: "rgba(255, 255, 255, 0.2)",
      rim: "rgba(255, 255, 255, 0.14)",
      reflection: "rgba(255, 255, 255, 0.44)",
      wash: 0.58,
      lens: 0.4,
      edge: 0.44,
      bounce: 0.2,
      blur: 26,
      shadowColor: "#050703",
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 6,
    },
  },
  chip: {
    radius: DefaultTheme.radius.pill,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 3 },
    light: {
      tint: "rgba(255, 255, 255, 0.26)",
      border: "rgba(255, 255, 255, 0.6)",
      rim: "rgba(255, 255, 255, 0.4)",
      reflection: "rgba(255, 255, 255, 0.88)",
      wash: 0.28,
      lens: 0.42,
      edge: 0.5,
      bounce: 0.22,
      blur: 14,
      shadowColor: "#69705A",
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 2,
    },
    dark: {
      tint: "rgba(255, 255, 255, 0.14)",
      border: "rgba(255, 255, 255, 0.22)",
      rim: "rgba(255, 255, 255, 0.12)",
      reflection: "rgba(255, 255, 255, 0.4)",
      wash: 0.52,
      lens: 0.36,
      edge: 0.4,
      bounce: 0.18,
      blur: 22,
      shadowColor: "#050703",
      shadowOpacity: 0.34,
      shadowRadius: 12,
      elevation: 5,
    },
  },
};

export const GlassTheme = {
  colors: {
    surface: GlassMaterials.bar.light.tint,
    surfaceFloating: GlassMaterials.floating.light.tint,
    border: GlassMaterials.bar.light.border,
    borderFloating: GlassMaterials.floating.light.border,
    reflection: GlassMaterials.bar.light.reflection,
    shadow: GlassMaterials.bar.light.shadowColor,
  },
  tone: {
    pivot: TONE_PIVOT,
    range: TONE_RANGE,
  },
  shadow: {
    bar: {
      shadowColor: GlassMaterials.bar.light.shadowColor,
      shadowOpacity: GlassMaterials.bar.light.shadowOpacity,
      shadowRadius: GlassMaterials.bar.light.shadowRadius,
      shadowOffset: GlassMaterials.bar.shadowOffset,
      elevation: GlassMaterials.bar.light.elevation,
    },
    floating: {
      shadowColor: GlassMaterials.floating.light.shadowColor,
      shadowOpacity: GlassMaterials.floating.light.shadowOpacity,
      shadowRadius: GlassMaterials.floating.light.shadowRadius,
      shadowOffset: GlassMaterials.floating.shadowOffset,
      elevation: GlassMaterials.floating.light.elevation,
    },
  },
} as const;

export const glassStyles = StyleSheet.create({
  shell: {
    backgroundColor: "transparent",
  },
  material: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
  layer: {
    ...StyleSheet.absoluteFill,
  },
  rim: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1,
  },
  edgeTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 26,
  },
  edgeBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 18,
  },
  edgeLeft: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 20,
  },
  edgeRight: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: 20,
  },
  sheen: {
    position: "absolute",
    top: -30,
    bottom: -30,
    width: 130,
  },
  reflection: {
    position: "absolute",
    top: 1,
    left: 24,
    right: 24,
    height: 1,
    borderRadius: 1,
  },
  control: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  accent: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
  lensShell: {
    position: "absolute",
    left: 0,
    top: 0,
    overflow: "hidden",
  },
  lensFringeLeading: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 24,
  },
  lensFringeTrailing: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 24,
  },
  bar: {
    backgroundColor: GlassTheme.colors.surface,
    borderWidth: 1,
    borderColor: GlassTheme.colors.border,
    ...GlassTheme.shadow.bar,
  },
  floating: {
    backgroundColor: GlassTheme.colors.surfaceFloating,
    borderWidth: 1,
    borderColor: GlassTheme.colors.borderFloating,
    ...GlassTheme.shadow.floating,
  },
});
