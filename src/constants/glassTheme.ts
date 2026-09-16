import { Easing, Platform, StyleSheet, type ViewStyle } from 'react-native';

import { colors, palette, radius } from '@/constants/themeColor';

export type GlassTone = 'light' | 'dark';
export type GlassVariant = 'bar' | 'floating' | 'control' | 'chip';

type ColorChannels = { r: number; g: number; b: number };

const SHORT_HEX = /^#([\da-f])([\da-f])([\da-f])$/i;
const LONG_HEX = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})(?:[\da-f]{2})?$/i;
const RGB_CALL = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i;

const FALLBACK_CHANNELS: ColorChannels = { r: 255, g: 255, b: 255 };

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
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function glassToneProgress(background: string): number {
  return clamp01((TONE_PIVOT - relativeLuminance(background)) / TONE_RANGE);
}

export function resolveGlassTone(background: string): GlassTone {
  return glassToneProgress(background) >= 0.5 ? 'dark' : 'light';
}

type GradientStyle = ViewStyle & { backgroundImage?: string };

export function createGradientStyle(image: string): GradientStyle {
  const style: GradientStyle = { experimental_backgroundImage: image };

  if (Platform.OS === 'web') {
    style.backgroundImage = image;
  }

  return style;
}

export const GlassLens = {
  body: 'linear-gradient(157deg, rgba(255,255,255,0.58) 0%, rgba(255,255,255,0.14) 26%, rgba(255,255,255,0) 54%, rgba(255,255,255,0.12) 78%, rgba(255,255,255,0.38) 100%)',
  edgeTop:
    'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.42) 30%, rgba(255,255,255,0.06) 68%, rgba(255,255,255,0) 100%)',
  edgeBottom:
    'linear-gradient(0deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.16) 44%, rgba(255,255,255,0) 100%)',
  edgeLeft:
    'linear-gradient(90deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.10) 46%, rgba(255,255,255,0) 100%)',
  edgeRight:
    'linear-gradient(270deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.10) 46%, rgba(255,255,255,0) 100%)',
  wash: 'linear-gradient(158deg, rgba(178,10,7,0.10) 0%, rgba(245,207,40,0.07) 38%, rgba(120,170,215,0.05) 72%, rgba(255,255,255,0) 100%)',
  sheen:
    'linear-gradient(102deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.26) 38%, rgba(255,255,255,0.84) 50%, rgba(255,255,255,0.26) 62%, rgba(255,255,255,0) 100%)',
  glow: 'linear-gradient(180deg, rgba(255,255,255,0.60) 0%, rgba(254,248,218,0.36) 48%, rgba(178,10,7,0.20) 100%)',
  accent:
    'linear-gradient(151deg, rgba(255,255,255,0.44) 0%, rgba(255,255,255,0.10) 44%, rgba(0,0,0,0.07) 100%)',
  lensSpecular:
    'linear-gradient(200deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.20) 22%, rgba(255,255,255,0) 50%, rgba(255,255,255,0.24) 78%, rgba(255,255,255,0.78) 100%)',
  fringeLeading:
    'linear-gradient(90deg, rgba(150,203,240,0.58) 0%, rgba(214,166,226,0.32) 44%, rgba(255,255,255,0) 100%)',
  fringeTrailing:
    'linear-gradient(270deg, rgba(240,168,206,0.54) 0%, rgba(150,203,240,0.30) 44%, rgba(255,255,255,0) 100%)',
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
    radius: radius.lg,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    light: {
      tint: 'rgba(255, 255, 255, 0.34)',
      border: 'rgba(255, 255, 255, 0.86)',
      rim: 'rgba(255, 255, 255, 0.5)',
      reflection: 'rgba(255, 255, 255, 0.96)',
      wash: 0.42,
      lens: 0.5,
      edge: 0.66,
      bounce: 0.3,
      blur: 34,
      shadowColor: '#3A1210',
      shadowOpacity: 0.16,
      shadowRadius: 16,
      elevation: 7,
    },
    dark: {
      tint: 'rgba(27, 21, 20, 0.36)',
      border: 'rgba(255, 255, 255, 0.22)',
      rim: 'rgba(255, 255, 255, 0.14)',
      reflection: 'rgba(255, 255, 255, 0.52)',
      wash: 0.52,
      lens: 0.38,
      edge: 0.46,
      bounce: 0.22,
      blur: 50,
      shadowColor: '#140707',
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
      tint: 'rgba(255, 255, 255, 0.14)',
      border: 'rgba(255, 255, 255, 0.9)',
      rim: 'rgba(255, 255, 255, 0.68)',
      reflection: 'rgba(255, 255, 255, 1)',
      wash: 0.2,
      lens: 0.74,
      edge: 0.92,
      bounce: 0.52,
      blur: 34,
      shadowColor: '#3A1210',
      shadowOpacity: 0.22,
      shadowRadius: 30,
      elevation: 12,
    },
    dark: {
      tint: 'rgba(22, 17, 16, 0.22)',
      border: 'rgba(255, 255, 255, 0.32)',
      rim: 'rgba(255, 255, 255, 0.22)',
      reflection: 'rgba(255, 255, 255, 0.66)',
      wash: 0.32,
      lens: 0.58,
      edge: 0.72,
      bounce: 0.42,
      blur: 44,
      shadowColor: '#0F0505',
      shadowOpacity: 0.5,
      shadowRadius: 40,
      elevation: 16,
    },
  },
  control: {
    radius: radius.md,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    light: {
      tint: 'rgba(255, 255, 255, 0.24)',
      border: 'rgba(255, 255, 255, 0.66)',
      rim: 'rgba(255, 255, 255, 0.42)',
      reflection: 'rgba(255, 255, 255, 0.9)',
      wash: 0.32,
      lens: 0.44,
      edge: 0.56,
      bounce: 0.26,
      blur: 16,
      shadowColor: '#3A1210',
      shadowOpacity: 0.1,
      shadowRadius: 10,
      elevation: 3,
    },
    dark: {
      tint: 'rgba(255, 255, 255, 0.12)',
      border: 'rgba(255, 255, 255, 0.2)',
      rim: 'rgba(255, 255, 255, 0.14)',
      reflection: 'rgba(255, 255, 255, 0.44)',
      wash: 0.58,
      lens: 0.4,
      edge: 0.44,
      bounce: 0.2,
      blur: 26,
      shadowColor: '#0F0505',
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 6,
    },
  },
  chip: {
    radius: radius.pill,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 3 },
    light: {
      tint: 'rgba(255, 255, 255, 0.26)',
      border: 'rgba(255, 255, 255, 0.6)',
      rim: 'rgba(255, 255, 255, 0.4)',
      reflection: 'rgba(255, 255, 255, 0.88)',
      wash: 0.28,
      lens: 0.42,
      edge: 0.5,
      bounce: 0.22,
      blur: 14,
      shadowColor: '#3A1210',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 2,
    },
    dark: {
      tint: 'rgba(255, 255, 255, 0.14)',
      border: 'rgba(255, 255, 255, 0.22)',
      rim: 'rgba(255, 255, 255, 0.12)',
      reflection: 'rgba(255, 255, 255, 0.4)',
      wash: 0.52,
      lens: 0.36,
      edge: 0.4,
      bounce: 0.18,
      blur: 22,
      shadowColor: '#0F0505',
      shadowOpacity: 0.34,
      shadowRadius: 12,
      elevation: 5,
    },
  },
};

export type BubbleTint = 'iridescent' | 'brand';

export type LiquidBubbleTintSpec = {
  iridescence: string;
  leading: string;
  trailing: string;
};

export const LiquidBubbleTints: Record<BubbleTint, LiquidBubbleTintSpec> = {
  iridescent: {
    iridescence:
      'linear-gradient(106deg, rgba(236,150,196,0.62) 0%, rgba(206,164,228,0.38) 24%, rgba(255,255,255,0) 50%, rgba(150,204,238,0.44) 76%, rgba(96,176,226,0.68) 100%)',
    leading: 'rgba(240,168,206,0.52)',
    trailing: 'rgba(122,188,230,0.52)',
  },
  brand: {
    iridescence:
      'linear-gradient(106deg, rgba(245,207,40,0.52) 0%, rgba(250,224,150,0.30) 24%, rgba(255,255,255,0) 50%, rgba(224,132,128,0.38) 76%, rgba(178,10,7,0.48) 100%)',
    leading: 'rgba(245,207,40,0.46)',
    trailing: 'rgba(178,10,7,0.40)',
  },
};

export const LiquidBubbleLayers = {
  shell:
    'radial-gradient(circle farthest-side at 50% 50%, rgba(255,255,255,0) 62%, rgba(255,255,255,0.16) 79%, rgba(255,255,255,0.56) 92%, rgba(255,255,255,0.92) 98%, rgba(255,255,255,0.44) 100%)',
  core: 'radial-gradient(circle farthest-side at 44% 40%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.78) 32%, rgba(255,255,255,0.44) 58%, rgba(255,255,255,0.12) 76%, rgba(255,255,255,0) 88%)',
  specular:
    'radial-gradient(circle farthest-side at 68% 12%, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.58) 20%, rgba(255,255,255,0.14) 40%, rgba(255,255,255,0) 58%)',
  catchLight:
    'radial-gradient(ellipse farthest-side at 50% 50%, rgba(255,255,255,1) 0%, rgba(255,255,255,0.72) 36%, rgba(255,255,255,0.18) 72%, rgba(255,255,255,0) 100%)',
  refraction:
    'radial-gradient(circle farthest-side at 50% 58%, rgba(255,255,255,0) 64%, rgba(255,255,255,0.16) 78%, rgba(255,255,255,0.48) 91%, rgba(255,255,255,0) 100%)',
  bounce:
    'linear-gradient(0deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.14) 26%, rgba(255,255,255,0) 54%)',
  contact:
    'radial-gradient(ellipse farthest-side at 50% 50%, rgba(58,18,16,0.20) 0%, rgba(58,18,16,0.10) 48%, rgba(58,18,16,0.03) 74%, rgba(58,18,16,0) 100%)',
} as const;

export const LiquidBubblePillLayers = {
  shell:
    'radial-gradient(ellipse farthest-side at 50% 50%, rgba(255,255,255,0) 52%, rgba(255,255,255,0.12) 74%, rgba(255,255,255,0.38) 90%, rgba(255,255,255,0.62) 100%)',
  core: 'radial-gradient(ellipse farthest-side at 44% 38%, rgba(255,255,255,0.52) 0%, rgba(255,255,255,0.26) 44%, rgba(255,255,255,0) 82%)',
  specular:
    'radial-gradient(ellipse farthest-side at 72% 6%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.30) 30%, rgba(255,255,255,0) 60%)',
  refraction:
    'radial-gradient(ellipse farthest-side at 50% 62%, rgba(255,255,255,0) 58%, rgba(255,255,255,0.10) 72%, rgba(255,255,255,0.28) 88%, rgba(255,255,255,0) 100%)',
} as const;

export const LiquidBubbleGradients = {
  shell: createGradientStyle(LiquidBubbleLayers.shell),
  core: createGradientStyle(LiquidBubbleLayers.core),
  specular: createGradientStyle(LiquidBubbleLayers.specular),
  catchLight: createGradientStyle(LiquidBubbleLayers.catchLight),
  refraction: createGradientStyle(LiquidBubbleLayers.refraction),
  bounce: createGradientStyle(LiquidBubbleLayers.bounce),
  contact: createGradientStyle(LiquidBubbleLayers.contact),
  iridescent: createGradientStyle(LiquidBubbleTints.iridescent.iridescence),
  brand: createGradientStyle(LiquidBubbleTints.brand.iridescence),
} as const;

export const LiquidBubblePillGradients = {
  shell: createGradientStyle(LiquidBubblePillLayers.shell),
  core: createGradientStyle(LiquidBubblePillLayers.core),
  specular: createGradientStyle(LiquidBubblePillLayers.specular),
  refraction: createGradientStyle(LiquidBubblePillLayers.refraction),
} as const;

export type LiquidBubbleToneSpec = {
  shell: number;
  iridescence: number;
  core: number;
  specular: number;
  refraction: number;
  bounce: number;
  border: string;
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

export const LiquidBubbleTones: Record<GlassTone, LiquidBubbleToneSpec> = {
  light: {
    shell: 1,
    iridescence: 1,
    core: 0.85,
    specular: 0.92,
    refraction: 0.85,
    bounce: 0.5,
    border: 'rgba(255,255,255,0.58)',
    shadowColor: '#3A1210',
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 6,
  },
  dark: {
    shell: 0.86,
    iridescence: 1,
    core: 0.34,
    specular: 1,
    refraction: 0.92,
    bounce: 0.32,
    border: 'rgba(255,255,255,0.26)',
    shadowColor: '#0F0505',
    shadowOpacity: 0.44,
    shadowRadius: 34,
    elevation: 10,
  },
};

export const LiquidBubbleMetrics = {
  catchLight: { width: 0.23, height: 0.135, left: 0.23, top: 0.29, rotate: '-34deg' },
  contact: { width: 0.78, height: 0.13, top: 0.93 },
  borderWidth: StyleSheet.hairlineWidth,
} as const;

export const LiquidBubbleMotion = {
  drift: { duration: 11000, easing: Easing.inOut(Easing.sin) },
  swell: { duration: 7400, easing: Easing.inOut(Easing.sin) },
  rise: { duration: 980, easing: Easing.out(Easing.cubic) },
  driftRange: 18,
  swellRange: 0.06,
} as const;

export type LiquidBubbleSeed = {
  key: string;
  size: number;
  x: number;
  y: number;
  opacity: number;
  drift: number;
  delay: number;
  tint?: BubbleTint;
};

export const LiquidBubbleFields: Record<'sidebar' | 'rail', LiquidBubbleSeed[]> = {
  sidebar: [
    { key: 'crown', size: 1.18, x: -0.22, y: 0.02, opacity: 0.9, drift: 1, delay: 0 },
    { key: 'drift', size: 0.62, x: 0.58, y: 0.24, opacity: 0.75, drift: -0.7, delay: 1400 },
    { key: 'mid', size: 0.92, x: 0.3, y: 0.46, opacity: 0.7, drift: 0.55, delay: 2600 },
    { key: 'spark', size: 0.34, x: 0.06, y: 0.66, opacity: 0.85, drift: -1.1, delay: 900 },
    { key: 'keel', size: 0.78, x: -0.14, y: 0.78, opacity: 0.72, drift: 0.8, delay: 3400 },
  ],
  rail: [
    { key: 'lead', size: 0.34, x: 0.02, y: -0.45, opacity: 0.42, drift: 0.8, delay: 0 },
    { key: 'centre', size: 0.26, x: 0.42, y: 0.1, opacity: 0.34, drift: -0.9, delay: 1200 },
    { key: 'tail', size: 0.3, x: 0.78, y: -0.3, opacity: 0.38, drift: 0.6, delay: 2100 },
  ],
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
  bubble: {
    background: colors.background,
    accent: palette.gold,
  },
} as const;

export const glassStyles = StyleSheet.create({
  shell: {
    backgroundColor: 'transparent',
  },
  material: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  layer: {
    ...StyleSheet.absoluteFill,
  },
  rim: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1,
  },
  edgeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 26,
  },
  edgeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 18,
  },
  edgeLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 20,
  },
  edgeRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 20,
  },
  sheen: {
    position: 'absolute',
    top: -30,
    bottom: -30,
    width: 130,
  },
  reflection: {
    position: 'absolute',
    top: 1,
    left: 24,
    right: 24,
    height: 1,
    borderRadius: 1,
  },
  control: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accent: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  lensShell: {
    position: 'absolute',
    left: 0,
    top: 0,
    overflow: 'hidden',
  },
  lensFringeLeading: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 24,
  },
  lensFringeTrailing: {
    position: 'absolute',
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

export const bubbleStyles = StyleSheet.create({
  field: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  bubble: {
    position: 'absolute',
  },
  disc: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  layer: {
    ...StyleSheet.absoluteFill,
  },
  rim: {
    ...StyleSheet.absoluteFill,
    borderWidth: LiquidBubbleMetrics.borderWidth,
  },
  catchLight: {
    position: 'absolute',
  },
  contact: {
    position: 'absolute',
  },
});
