import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { colors } from '@/constants/themeColor';

export const GLYPHS = {
  home: 'home',
  logs: 'receipt_long',
  staff: 'groups',
  me: 'person',
  add: 'add',
  back: 'arrow_back_ios_new',
  close: 'close',
  chevronRight: 'chevron_right',
  chevronDown: 'expand_more',
  chevronUp: 'expand_less',
  search: 'search',
  filter: 'tune',
  logout: 'logout',
  settings: 'settings',

  person: 'person',
  badge: 'badge',
  mail: 'mail',
  phone: 'call',
  floors: 'apartment',
  key: 'key',
  shield: 'verified_user',
  adminRole: 'shield_person',

  edit: 'edit',
  delete: 'delete',
  more: 'more_vert',
  check: 'check',
  checkCircle: 'check_circle',
  copy: 'content_copy',
  refresh: 'refresh',
  visible: 'visibility',
  hidden: 'visibility_off',

  elevator: 'elevator',
  qr: 'qr_code_scanner',
  face: 'sensor_occupied',
  camera: 'photo_camera',
  cameraOff: 'no_photography',
  flipCamera: 'cameraswitch',
  torch: 'flashlight_on',
  torchOff: 'flashlight_off',

  activity: 'monitoring',
  trendUp: 'trending_up',
  trendDown: 'trending_down',
  bluetooth: 'bluetooth',

  info: 'info',
  warning: 'warning',
  error: 'error',
  lightbulb: 'lightbulb',
  lock: 'lock',
  lockOpen: 'lock_open',
  time: 'schedule',
  calendar: 'calendar_today',
} as const;

export type IconName = keyof typeof GLYPHS;

export type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
};

export function Icon({ name, size = 22, color = colors.text, style, accessibilityLabel }: IconProps) {
  const decorative = !accessibilityLabel;
  return (
    <Text
      accessible={!decorative}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
      accessibilityLabel={accessibilityLabel}
      allowFontScaling={false}
      maxFontSizeMultiplier={1}
      selectable={false}
      style={[
        styles.glyph,
        { fontSize: size, lineHeight: size, width: size, height: size, color },
        style,
      ]}
    >
      {GLYPHS[name]}
    </Text>
  );
}

const styles = StyleSheet.create({
  glyph: {
    fontFamily: 'MaterialSymbols',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    padding: 0,
    margin: 0,
  },
});

export default Icon;
