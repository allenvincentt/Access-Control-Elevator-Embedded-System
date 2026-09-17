import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';

import { palette } from '@/constants/themeColor';

export type CharacterMood =
  | 'idle'
  | 'email'
  | 'emailTyping'
  | 'password'
  | 'passwordTyping'
  | 'loading'
  | 'success'
  | 'error';

export type SignInCharacterProps = {
  mood?: CharacterMood;
  size?: number;
  color?: string;
};

const VIEW_W = 120;
const VIEW_H = 112;
const TAU = Math.PI * 2;

const SOCKET_Y = 42;
const SOCKET_SIZE = 14;
const SOCKET_RADIUS = 4.5;
const SOCKET_LEFT_X = 40;
const SOCKET_RIGHT_X = 66;
const PUPIL_SIZE = 7;
const PUPIL_RADIUS = 2.5;
const PUPIL_INSET = (SOCKET_SIZE - PUPIL_SIZE) / 2;

const ARM_TOP = 51;
const ARM_SPAN = 24;
const ARM_THICKNESS = 10;

const LEG_TOP = 72;
const LEG_BLOCK_W = 22;
const LEG_BLOCK_H = 19;
const LEG_W = 8;
const LEG_H = 14;
const FOOT_H = 7;
const FOOT_OFFSET = 12;
const LEG_LEFT_X = 36;
const LEG_RIGHT_X = 62;
const LEG_LEFT_INSET = 8;
const LEG_RIGHT_INSET = 6;

const ARM_REST = -62;
const ARM_DOWN = 0;
const ARM_BACK = -20;
const ARM_FORWARD = 22;
const ARM_WAVE_LOW = 84;
const ARM_WAVE_HIGH = 128;

const WALK_FRAMES = 8;
const WALK_FRAME_MS = 120;
const WALK_CYCLE_MS = WALK_FRAME_MS * WALK_FRAMES;
const WALK_BOB = [0, -1, -2, -1, 0, -1, -2, -1];
const WALK_LEAN = [0, 1, 1, 0, 0, -1, -1, 0];
const WALK_LEFT_LIFT = [0, 2, 4, 2, 0, 0, 0, 0];
const WALK_RIGHT_LIFT = [0, 0, 0, 0, 0, 2, 4, 2];
const WALK_ARM_RIGHT = [
  ARM_DOWN,
  ARM_BACK,
  ARM_FORWARD,
  ARM_BACK,
  ARM_DOWN,
  ARM_DOWN,
  ARM_DOWN,
  ARM_DOWN,
];
const WALK_ARM_LEFT = [
  ARM_DOWN,
  ARM_DOWN,
  ARM_DOWN,
  ARM_DOWN,
  ARM_DOWN,
  ARM_BACK,
  ARM_FORWARD,
  ARM_BACK,
];
const WALK_BOB_SCALE = 1.5;
const WALK_LEAN_SCALE = 1.5;
const WALK_LIFT_SCALE = 1.6;

const WAVE_FLAP_MS = WALK_FRAME_MS * 2;
const WAVE_BOB = 1.2;
const WAVE_TILT = -3;

function sampleTable(table: readonly number[], progress: number) {
  'worklet';
  const n = table.length;
  const x = (progress - Math.floor(progress)) * n;
  const i = Math.floor(x) % n;
  const j = (i + 1) % n;
  const f = x - Math.floor(x);
  const s = f * f * (3 - 2 * f);
  return table[i] + (table[j] - table[i]) * s;
}

function waveFlap(progress: number) {
  'worklet';
  return (1 - Math.cos(progress * TAU)) / 2;
}

type Pose = {
  gazeX: number;
  gazeY: number;
  tilt: number;
  headX: number;
  headY: number;
  armL: number;
  armR: number;
  armIn: number;
  armUp: number;
  lidTop: number;
  lidBottom: number;
};

const POSE: Record<CharacterMood, Pose> = {
  idle: {
    gazeX: 0,
    gazeY: 0,
    tilt: 0,
    headX: 0,
    headY: 0,
    armL: ARM_REST,
    armR: -ARM_REST,
    armIn: 0,
    armUp: 0,
    lidTop: 0,
    lidBottom: 0,
  },
  email: {
    gazeX: 0,
    gazeY: 3.4,
    tilt: 0,
    headX: 0,
    headY: 2.6,
    armL: -54,
    armR: 54,
    armIn: 0,
    armUp: 0,
    lidTop: 0.08,
    lidBottom: 0,
  },
  emailTyping: {
    gazeX: 0,
    gazeY: 3.9,
    tilt: 2,
    headX: 0,
    headY: 3.4,
    armL: -46,
    armR: 46,
    armIn: 2,
    armUp: 0,
    lidTop: 0.14,
    lidBottom: 0,
  },
  password: {
    gazeX: -3.4,
    gazeY: 1.4,
    tilt: -10,
    headX: -3,
    headY: 0,
    armL: -22,
    armR: 56,
    armIn: 2,
    armUp: 2,
    lidTop: 0.44,
    lidBottom: 0.12,
  },
  passwordTyping: {
    gazeX: 0,
    gazeY: 0,
    tilt: 0,
    headX: 0,
    headY: 1.4,
    armL: 68,
    armR: -68,
    armIn: 13,
    armUp: 7,
    lidTop: 1,
    lidBottom: 0,
  },
  loading: {
    gazeX: 0,
    gazeY: 0,
    tilt: 0,
    headX: 0,
    headY: 0,
    armL: ARM_REST,
    armR: -ARM_REST,
    armIn: 0,
    armUp: 0,
    lidTop: 0.08,
    lidBottom: 0,
  },
  success: {
    gazeX: 0,
    gazeY: 0,
    tilt: 0,
    headX: 0,
    headY: -3,
    armL: 76,
    armR: -76,
    armIn: 4,
    armUp: 6,
    lidTop: 0.6,
    lidBottom: 0,
  },
  error: {
    gazeX: 0,
    gazeY: 2.2,
    tilt: 0,
    headX: 0,
    headY: 3.6,
    armL: -74,
    armR: 74,
    armIn: 0,
    armUp: 0,
    lidTop: 0,
    lidBottom: 0.5,
  },
};

const BLINK_GAP: Record<CharacterMood, number> = {
  idle: 3200,
  email: 2800,
  emailTyping: 2600,
  password: 2400,
  passwordTyping: 0,
  loading: 620,
  success: 0,
  error: 2900,
};

const POSE_SPRING = { damping: 15, stiffness: 130, mass: 0.9 };
const SOFT_TIMING = { duration: 260, easing: Easing.out(Easing.cubic) };
const GATE_TIMING = { duration: 320, easing: Easing.inOut(Easing.cubic) };
const BREATH_MS = 2600;

export function SignInCharacter({
  mood = 'idle',
  size = 120,
  color = palette.white,
}: SignInCharacterProps) {
  const unit = size / VIEW_W;
  const height = VIEW_H * unit;

  const phase = useSharedValue(0);
  const walkCycle = useSharedValue(0);
  const waveCycle = useSharedValue(0);
  const walk = useSharedValue(0);
  const wave = useSharedValue(0);
  const gazeX = useSharedValue(0);
  const gazeY = useSharedValue(0);
  const tilt = useSharedValue(0);
  const headX = useSharedValue(0);
  const headY = useSharedValue(0);
  const armL = useSharedValue(POSE.idle.armL);
  const armR = useSharedValue(POSE.idle.armR);
  const armIn = useSharedValue(0);
  const armUp = useSharedValue(0);
  const lidTop = useSharedValue(0);
  const lidBottom = useSharedValue(0);
  const think = useSharedValue(0);
  const shake = useSharedValue(0);
  const hop = useSharedValue(0);

  useEffect(() => {
    phase.value = 0;
    phase.value = withRepeat(
      withTiming(1, { duration: BREATH_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(phase);
  }, [phase]);

  useEffect(() => {
    const pose = POSE[mood];
    gazeX.value = withSpring(pose.gazeX, POSE_SPRING);
    gazeY.value = withSpring(pose.gazeY, POSE_SPRING);
    tilt.value = withSpring(pose.tilt, POSE_SPRING);
    headX.value = withSpring(pose.headX, POSE_SPRING);
    headY.value = withSpring(pose.headY, POSE_SPRING);
    armL.value = withSpring(pose.armL, POSE_SPRING);
    armR.value = withSpring(pose.armR, POSE_SPRING);
    armIn.value = withSpring(pose.armIn, POSE_SPRING);
    armUp.value = withSpring(pose.armUp, POSE_SPRING);
    lidBottom.value = withTiming(pose.lidBottom, SOFT_TIMING);
    think.value = withTiming(mood === 'loading' ? 1 : 0, SOFT_TIMING);
  }, [mood, gazeX, gazeY, tilt, headX, headY, armL, armR, armIn, armUp, lidBottom, think]);

  useEffect(() => {
    const walking = mood === 'loading';
    if (walking) {
      cancelAnimation(walkCycle);
      walkCycle.value = 0;
      walkCycle.value = withRepeat(
        withTiming(1, { duration: WALK_CYCLE_MS, easing: Easing.linear }),
        -1,
        false,
      );
    }
    walk.value = withTiming(walking ? 1 : 0, GATE_TIMING);
    return () => {
      if (walking) {
        cancelAnimation(walkCycle);
      }
    };
  }, [mood, walk, walkCycle]);

  useEffect(() => {
    const waving = mood === 'idle';
    if (waving) {
      cancelAnimation(waveCycle);
      waveCycle.value = 0;
      waveCycle.value = withRepeat(
        withTiming(1, { duration: WAVE_FLAP_MS, easing: Easing.linear }),
        -1,
        false,
      );
    }
    wave.value = withTiming(waving ? 1 : 0, GATE_TIMING);
    return () => {
      if (waving) {
        cancelAnimation(waveCycle);
      }
    };
  }, [mood, wave, waveCycle]);

  useEffect(() => {
    const rest = POSE[mood].lidTop;
    const gap = BLINK_GAP[mood];
    cancelAnimation(lidTop);

    if (gap <= 0) {
      lidTop.value = withTiming(rest, SOFT_TIMING);
      return;
    }

    lidTop.value = withRepeat(
      withSequence(
        withTiming(rest, SOFT_TIMING),
        withDelay(gap, withTiming(1, { duration: 80, easing: Easing.in(Easing.quad) })),
        withTiming(rest, { duration: 130, easing: Easing.out(Easing.quad) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(lidTop);
  }, [mood, lidTop]);

  useEffect(() => {
    if (mood === 'error') {
      shake.value = withSequence(
        withTiming(-7, { duration: 70 }),
        withTiming(7, { duration: 90 }),
        withTiming(-4, { duration: 80 }),
        withTiming(0, { duration: 110 }),
      );
    }
    if (mood === 'success') {
      hop.value = withSequence(
        withSpring(-9, { damping: 9, stiffness: 240 }),
        withSpring(0, { damping: 11, stiffness: 170 }),
      );
    }
  }, [mood, shake, hop]);

  const bodyStyle = useAnimatedStyle(() => {
    const breath = Math.sin(phase.value * TAU) * 2 * (1 - walk.value);
    const stride = sampleTable(WALK_BOB, walkCycle.value) * WALK_BOB_SCALE * walk.value;
    const waveBob = -WAVE_BOB * waveFlap(waveCycle.value) * wave.value;
    return {
      transform: [{ translateY: (breath + stride + waveBob + hop.value) * unit }],
    };
  });

  const headStyle = useAnimatedStyle(() => {
    const lean = sampleTable(WALK_LEAN, walkCycle.value) * WALK_LEAN_SCALE * walk.value;
    return {
      transform: [
        { translateX: (headX.value + lean) * unit },
        { translateY: headY.value * unit },
        { rotate: `${tilt.value + WAVE_TILT * wave.value + shake.value}deg` },
      ],
    };
  });

  const pupilStyle = useAnimatedStyle(() => {
    const orbit = phase.value * TAU * 2;
    return {
      transform: [
        { translateX: (gazeX.value + Math.cos(orbit) * 2.2 * think.value) * unit },
        { translateY: (gazeY.value + Math.sin(orbit) * 2.2 * think.value) * unit },
      ],
    };
  });

  const lidTopStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: lidTop.value }],
  }));

  const lidBottomStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: lidBottom.value }],
  }));

  const armLeftStyle = useAnimatedStyle(() => {
    const swing = sampleTable(WALK_ARM_LEFT, walkCycle.value) * walk.value;
    return {
      transform: [
        { translateX: armIn.value * unit },
        { translateY: -armUp.value * unit },
        { rotate: `${armL.value + swing}deg` },
      ],
    };
  });

  const armRightStyle = useAnimatedStyle(() => {
    const swing = sampleTable(WALK_ARM_RIGHT, walkCycle.value) * walk.value;
    const raise =
      (ARM_WAVE_LOW + (ARM_WAVE_HIGH - ARM_WAVE_LOW) * waveFlap(waveCycle.value)) * wave.value;
    return {
      transform: [
        { translateX: -armIn.value * unit },
        { translateY: -armUp.value * unit },
        { rotate: `${armR.value - swing - raise}deg` },
      ],
    };
  });

  const legLeftStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          -sampleTable(WALK_LEFT_LIFT, walkCycle.value) * WALK_LIFT_SCALE * walk.value * unit,
      },
    ],
  }));

  const legRightStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          -sampleTable(WALK_RIGHT_LIFT, walkCycle.value) * WALK_LIFT_SCALE * walk.value * unit,
      },
    ],
  }));

  const geometry = useMemo(() => {
    const lidW = (SOCKET_SIZE + 2) * unit;
    const lid = {
      position: 'absolute' as const,
      left: -unit,
      top: -unit,
      width: lidW,
      height: lidW,
      backgroundColor: color,
    };
    const legBlock = {
      position: 'absolute' as const,
      top: LEG_TOP * unit,
      width: LEG_BLOCK_W * unit,
      height: LEG_BLOCK_H * unit,
    };
    return {
      stage: { width: size, height },
      socket: {
        position: 'absolute' as const,
        top: SOCKET_Y * unit,
        width: SOCKET_SIZE * unit,
        height: SOCKET_SIZE * unit,
        borderRadius: SOCKET_RADIUS * unit,
        overflow: 'hidden' as const,
      },
      socketLeft: { left: SOCKET_LEFT_X * unit },
      socketRight: { left: SOCKET_RIGHT_X * unit },
      pupil: {
        position: 'absolute' as const,
        left: PUPIL_INSET * unit,
        top: PUPIL_INSET * unit,
        width: PUPIL_SIZE * unit,
        height: PUPIL_SIZE * unit,
        borderRadius: PUPIL_RADIUS * unit,
        backgroundColor: color,
      },
      lidTop: { ...lid, transformOrigin: '50% 0%' },
      lidBottom: { ...lid, transformOrigin: '50% 100%' },
      armLeft: {
        position: 'absolute' as const,
        left: 0,
        top: ARM_TOP * unit,
        width: ARM_SPAN * unit,
        height: ARM_THICKNESS * unit,
        transformOrigin: '100% 50%',
      },
      armRight: {
        position: 'absolute' as const,
        left: (VIEW_W - ARM_SPAN) * unit,
        top: ARM_TOP * unit,
        width: ARM_SPAN * unit,
        height: ARM_THICKNESS * unit,
        transformOrigin: '0% 50%',
      },
      armBarLeft: {
        position: 'absolute' as const,
        left: 5 * unit,
        top: 2.5 * unit,
        width: 19 * unit,
        height: 5 * unit,
        borderRadius: 2.5 * unit,
        backgroundColor: color,
      },
      armBarRight: {
        position: 'absolute' as const,
        left: 0,
        top: 2.5 * unit,
        width: 19 * unit,
        height: 5 * unit,
        borderRadius: 2.5 * unit,
        backgroundColor: color,
      },
      handLeft: {
        position: 'absolute' as const,
        left: 0,
        top: 0,
        width: ARM_THICKNESS * unit,
        height: ARM_THICKNESS * unit,
        borderRadius: (ARM_THICKNESS / 2) * unit,
        backgroundColor: color,
      },
      handRight: {
        position: 'absolute' as const,
        left: (ARM_SPAN - ARM_THICKNESS) * unit,
        top: 0,
        width: ARM_THICKNESS * unit,
        height: ARM_THICKNESS * unit,
        borderRadius: (ARM_THICKNESS / 2) * unit,
        backgroundColor: color,
      },
      legLeft: { ...legBlock, left: LEG_LEFT_X * unit },
      legRight: { ...legBlock, left: LEG_RIGHT_X * unit },
      shinLeft: {
        position: 'absolute' as const,
        left: LEG_LEFT_INSET * unit,
        top: 0,
        width: LEG_W * unit,
        height: LEG_H * unit,
        borderRadius: (LEG_W / 2) * unit,
        backgroundColor: color,
      },
      shinRight: {
        position: 'absolute' as const,
        left: LEG_RIGHT_INSET * unit,
        top: 0,
        width: LEG_W * unit,
        height: LEG_H * unit,
        borderRadius: (LEG_W / 2) * unit,
        backgroundColor: color,
      },
      foot: {
        position: 'absolute' as const,
        left: 0,
        top: FOOT_OFFSET * unit,
        width: LEG_BLOCK_W * unit,
        height: FOOT_H * unit,
        borderRadius: (FOOT_H / 2) * unit,
        backgroundColor: color,
      },
    };
  }, [size, height, unit, color]);

  return (
    <Animated.View
      style={[geometry.stage, bodyStyle]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[geometry.legLeft, legLeftStyle]}>
        <View style={geometry.shinLeft} />
        <View style={geometry.foot} />
      </Animated.View>

      <Animated.View style={[geometry.legRight, legRightStyle]}>
        <View style={geometry.shinRight} />
        <View style={geometry.foot} />
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, headStyle]}>
        <Animated.View style={[geometry.armLeft, armLeftStyle]}>
          <View style={geometry.armBarLeft} />
          <View style={geometry.handLeft} />
        </Animated.View>

        <Animated.View style={[geometry.armRight, armRightStyle]}>
          <View style={geometry.armBarRight} />
          <View style={geometry.handRight} />
        </Animated.View>

        <Svg
          style={StyleSheet.absoluteFill}
          width={size}
          height={height}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        >
          <Defs>
            <Mask id="face" maskUnits="userSpaceOnUse" x={0} y={0} width={VIEW_W} height={VIEW_H}>
              <Rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="#FFFFFF" />
              <Rect
                x={SOCKET_LEFT_X}
                y={SOCKET_Y}
                width={SOCKET_SIZE}
                height={SOCKET_SIZE}
                rx={SOCKET_RADIUS}
                fill="#000000"
              />
              <Rect
                x={SOCKET_RIGHT_X}
                y={SOCKET_Y}
                width={SOCKET_SIZE}
                height={SOCKET_SIZE}
                rx={SOCKET_RADIUS}
                fill="#000000"
              />
            </Mask>
          </Defs>

          <Rect x={24} y={24} width={72} height={52} rx={20} fill={color} mask="url(#face)" />
        </Svg>

        <View style={[geometry.socket, geometry.socketLeft]}>
          <Animated.View style={[geometry.pupil, pupilStyle]} />
          <Animated.View style={[geometry.lidTop, lidTopStyle]} />
          <Animated.View style={[geometry.lidBottom, lidBottomStyle]} />
        </View>

        <View style={[geometry.socket, geometry.socketRight]}>
          <Animated.View style={[geometry.pupil, pupilStyle]} />
          <Animated.View style={[geometry.lidTop, lidTopStyle]} />
          <Animated.View style={[geometry.lidBottom, lidBottomStyle]} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

export default SignInCharacter;
