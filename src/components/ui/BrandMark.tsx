import Svg, { Circle, G, Path, Rect, type SvgProps } from 'react-native-svg';

import { palette } from '@/constants/themeColor';

export type BrandMarkProps = {
  size?: number;
  background?: boolean;
} & Omit<SvgProps, 'width' | 'height' | 'viewBox'>;

export function BrandMark({ size = 64, background = true, ...rest }: BrandMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" {...rest}>
      {background ? <Rect width={1024} height={1024} rx={150} fill={palette.red} /> : null}

      <G fill="none" stroke={palette.white} strokeWidth={38} strokeLinejoin="round">
        <Rect x={300} y={210} width={540} height={500} rx={42} />
        <Path d="M570 250v430" />
      </G>

      <G fill="none" stroke={palette.gold} strokeWidth={28} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M470 155l45-45 45 45" />
        <Path d="M620 110l45 45 45-45" />
      </G>

      <Rect x={835} y={355} width={85} height={175} rx={22} fill={palette.white} />
      <G fill={palette.red} stroke={palette.red} strokeWidth={8} strokeLinejoin="round">
        <Circle cx={877} cy={407} r={24} />
        <Circle cx={877} cy={480} r={24} />
      </G>
      <G fill="none" stroke={palette.gold} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M867 412l10-10 10 10" />
        <Path d="M867 475l10 10 10-10" />
      </G>

      <Path
        d="M515 385 L850 500 V675 C850 790 745 875 515 950 C285 875 180 790 180 675 V500 Z"
        fill={palette.red}
        stroke={palette.gold}
        strokeWidth={24}
        strokeLinejoin="round"
      />

      <G fill="none" stroke={palette.white} strokeWidth={17} strokeLinecap="round">
        <Path d="M515 475c-65 0-112 52-112 118v50c0 38 27 68 61 68h102c34 0 61-30 61-68v-50c0-66-47-118-112-118z" />
        <Path d="M420 585v-35h35M610 585v-35h-35M420 650v35h35M610 650v35h-35" />
      </G>
      <Path d="M350 625h330" stroke={palette.gold} strokeWidth={14} strokeLinecap="round" />

      <G fill={palette.gold}>
        <Rect x={445} y={755} width={65} height={65} />
        <Rect x={520} y={755} width={65} height={65} />
        <Rect x={445} y={830} width={65} height={65} />
        <Rect x={530} y={835} width={18} height={18} />
        <Rect x={555} y={830} width={30} height={30} />
        <Rect x={530} y={870} width={55} height={25} />
      </G>
      <G fill={palette.red}>
        <Rect x={458} y={768} width={39} height={39} />
        <Rect x={533} y={768} width={39} height={39} />
        <Rect x={458} y={843} width={39} height={39} />
      </G>
    </Svg>
  );
}

export default BrandMark;
