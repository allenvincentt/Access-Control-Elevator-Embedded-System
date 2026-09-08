import { Image } from 'expo-image';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, palette, typography } from '@/constants/themeColor';

export type AvatarProps = {
  name: string;
  imageUri?: string | null;
  size?: number;
  tone?: 'brand' | 'gold' | 'neutral';
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
};

const TONE: Record<NonNullable<AvatarProps['tone']>, { bg: string; fg: string }> = {
  brand: { bg: palette.redTint, fg: palette.redDeep },
  gold: { bg: palette.goldTint, fg: palette.goldDeep },
  neutral: { bg: colors.surfaceSunken, fg: colors.textSecondary },
};

function initialsFrom(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, imageUri, size = 44, tone = 'brand', ring = false, style }: AvatarProps) {
  const toneColors = TONE[tone];
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  return (
    <View
      style={[
        styles.wrap,
        dimension,
        { backgroundColor: toneColors.bg },
        ring && styles.ring,
        style,
      ]}
    >
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={dimension}
          contentFit="cover"
          transition={0}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text style={[styles.initials, { color: toneColors.fg, fontSize: Math.round(size * 0.36) }]}>
          {initialsFrom(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ring: {
    borderWidth: 2,
    borderColor: colors.surface,
  },
  initials: {
    ...typography.button,
    letterSpacing: 0.4,
  },
});

export default Avatar;
