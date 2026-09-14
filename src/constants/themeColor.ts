import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const palette = {
  red: '#B20A07',
  redPressed: '#8E0805',
  redDeep: '#6C0604',
  redTint: '#F9E7E6',
  redTintStrong: '#F1CFCE',

  gold: '#F5CF28',
  goldPressed: '#D9B411',
  goldDeep: '#8A6B04',
  goldTint: '#FEF8DA',

  white: '#FFFFFF',
  ink: '#1B1514',
  bodyText: '#4B4442',
  secondaryText: '#6B6360',
  mutedText: '#928A87',
  line: '#EBE5E3',
  lineStrong: '#DBD3D0',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceAlt: '#F8F5F4',
  surfaceSunken: '#F1ECEA',
  canvas: '#FFFFFF',

  success: '#1E8A50',
  successTint: '#E3F3E9',
  danger: '#C21F16',
  dangerTint: '#FBE6E4',
  warning: '#9A6A12',
  warningTint: '#FBEFD6',
  info: '#1C6DA6',
  infoTint: '#E2F0F8',

  overlay: 'rgba(22, 12, 12, 0.55)',
  scrim: 'rgba(22, 12, 12, 0.32)',
  focusRing: 'rgba(178, 10, 7, 0.35)',
  glassStroke: 'rgba(255, 255, 255, 0.55)',
  glassFill: 'rgba(255, 255, 255, 0.72)',
} as const;

export const colors = {
  primary: palette.red,
  primaryPressed: palette.redPressed,
  primaryDeep: palette.redDeep,
  primaryTint: palette.redTint,
  onPrimary: palette.white,

  secondary: palette.gold,
  secondaryPressed: palette.goldPressed,
  secondaryTint: palette.goldTint,
  onSecondary: palette.ink,

  background: palette.canvas,
  surface: palette.surface,
  surfaceAlt: palette.surfaceAlt,
  surfaceSunken: palette.surfaceSunken,

  text: palette.ink,
  textSecondary: palette.secondaryText,
  textMuted: palette.mutedText,
  onDark: palette.white,

  border: palette.line,
  borderStrong: palette.lineStrong,

  success: palette.success,
  successTint: palette.successTint,
  danger: palette.danger,
  dangerTint: palette.dangerTint,
  warning: palette.warning,
  warningTint: palette.warningTint,
  info: palette.info,
  infoTint: palette.infoTint,

  overlay: palette.overlay,
  scrim: palette.scrim,
  focusRing: palette.focusRing,
} as const;

export const spacing = {
  none: 0,
  hair: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 56,
  '5xl': 72,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  '2xl': 28,
  '3xl': 34,
  pill: 999,
} as const;

export const fontFamily = {
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

const MEDIUM = { fontFamily: fontFamily.medium, fontWeight: '500' } as const;
const SEMIBOLD = { fontFamily: fontFamily.semibold, fontWeight: '600' } as const;
const BOLD = { fontFamily: fontFamily.bold, fontWeight: '700' } as const;
const EXTRABOLD = { fontFamily: fontFamily.extrabold, fontWeight: '800' } as const;

export const typography = {
  display: { fontSize: 30, lineHeight: 36, letterSpacing: -0.4, ...EXTRABOLD },
  title: { fontSize: 23, lineHeight: 29, letterSpacing: -0.3, ...EXTRABOLD },
  heading: { fontSize: 18, lineHeight: 24, letterSpacing: -0.2, ...BOLD },
  subheading: { fontSize: 16, lineHeight: 22, ...BOLD },
  body: { fontSize: 15, lineHeight: 22, ...MEDIUM },
  bodyStrong: { fontSize: 15, lineHeight: 22, ...SEMIBOLD },
  label: { fontSize: 13, lineHeight: 17, letterSpacing: 0.1, ...SEMIBOLD },
  caption: { fontSize: 12, lineHeight: 16, ...MEDIUM },
  overline: { fontSize: 11, lineHeight: 14, letterSpacing: 0.8, ...BOLD },
  button: { fontSize: 15, lineHeight: 20, letterSpacing: 0.2, ...BOLD },
  mono: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
} satisfies Record<string, TextStyle>;

type ShadowStyle = Pick<
  ViewStyle,
  'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'
>;

export const shadow = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#3A1210',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: '#3A1210',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 7,
  },
  lg: {
    shadowColor: '#3A1210',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.16,
    shadowRadius: 32,
    elevation: 14,
  },
  brand: {
    shadowColor: palette.red,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 10,
  },
} satisfies Record<string, ShadowStyle>;

export function brandGradient(
  from: string = palette.red,
  to: string = palette.redDeep,
  angle = 106,
): ViewStyle {
  const image = `linear-gradient(${angle}deg, ${from} 37%, ${to} 100%)`;
  return Platform.OS === 'web'
    ? ({ backgroundImage: image } as unknown as ViewStyle)
    : ({ experimental_backgroundImage: image } as unknown as ViewStyle);
}

export type GradientRole = 'base' | 'hover' | 'pressed' | 'soft';

const GRADIENT_STOPS: Record<GradientRole, { from: string; to: string }> = {
  base: { from: palette.red, to: palette.redDeep },
  hover: { from: '#C41210', to: palette.redPressed },
  pressed: { from: palette.redPressed, to: palette.redDeep },
  soft: { from: 'rgba(178, 10, 7, 0.16)', to: 'rgba(108, 6, 4, 0.12)' },
};

export function gradient(role: GradientRole = 'base'): ViewStyle {
  const { from, to } = GRADIENT_STOPS[role];
  return brandGradient(from, to, 106);
}

export const layout = {
  screenPadding: spacing.xl,
  maxContentWidth: 520,
  bottomNavHeight: 64,
  bottomNavClearance: 108,
  minTouchTarget: 48,
} as const;

export const theme = {
  palette,
  colors,
  spacing,
  radius,
  fontFamily,
  typography,
  shadow,
  layout,
  brandGradient,
  gradient,
} as const;

export type AppTheme = typeof theme;
export default theme;
