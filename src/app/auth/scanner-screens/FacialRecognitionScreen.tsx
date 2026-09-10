import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView } from 'expo-camera';
import { File } from 'expo-file-system';

import type { VerificationSession } from '@/app/auth/scanner-screens/ScannerFlow';
import { useSnackbar } from '@/components/common/Snackbar';
import { HintRow } from '@/components/HintRow';
import { CameraPermissionGate } from '@/components/scanner/CameraPermissionGate';
import { FaceAperture, type ApertureTone } from '@/components/scanner/FaceAperture';
import { ScannerScaffold } from '@/components/scanner/ScannerScaffold';
import { GeneralButton } from '@/components/ui/buttons/GeneralButton';
import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, palette, radius, spacing, typography } from '@/constants/themeColor';
import { getDeviceId } from '@/lib/deviceId';
import { DENIAL_MESSAGES, errorMessage } from '@/lib/errors';
import {
  FACE_MODEL_FAILURE_MESSAGES,
  FACE_PRESENCE,
  FACE_PRESENCE_MESSAGES,
  FACE_TERMINAL_GATES,
  FACE_TERMINAL_ISSUE_MESSAGES,
} from '@/services/face/constants';
import { warmUpFaceModel, type FaceModelState } from '@/services/face/embedder';
import { captureFaceFromPhoto } from '@/services/face/pipeline';
import { isSteady, readPresence, type PresenceReading } from '@/services/face/presence';
import { verifyFace } from '@/services/verificationService';
import type { FloorKey } from '@/types/database';

export type FacialRecognitionScreenProps = {
  session: VerificationSession;
  onFacePassed: (floors: FloorKey[]) => void;
  onCancel: () => void;
};

type Phase =
  | 'starting'
  | 'watching'
  | 'scanning'
  | 'verifying'
  | 'granted'
  | 'coaching'
  | 'denied'
  | 'halted';

type Coaching = {
  caption: string;
  detail: string;
};

type Denial = {
  message: string;
  attemptsLeft: number | null;
};

type Halt = {
  title: string;
  body: string;
  autoExit: boolean;
};

const LOCAL_MISS_LIMIT = 5;
const IDEAL_BAND_END = Math.min(
  1,
  (FACE_PRESENCE.idealWidthRatio * 1.6) / FACE_PRESENCE.maxWidthRatio,
);
const IDEAL_BAND_START = FACE_PRESENCE.minWidthRatio / FACE_PRESENCE.maxWidthRatio;

export function FacialRecognitionScreen({
  session,
  onFacePassed,
  onCancel,
}: FacialRecognitionScreenProps) {
  const snackbar = useSnackbar();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const mounted = useRef(true);
  const phaseRef = useRef<Phase>('starting');
  const streak = useRef(0);
  const lastReading = useRef<PresenceReading | null>(null);
  const serverDenials = useRef(0);
  const localMisses = useRef(0);
  const needsReArm = useRef(false);
  const detectorMisses = useRef(0);
  const pictureSize = useRef<string | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verifyRunner = useRef<() => Promise<void>>(async () => {});

  const [phase, setPhaseState] = useState<Phase>('starting');
  const [cameraReady, setCameraReady] = useState(false);
  const [appActive, setAppActive] = useState(true);
  const [presence, setPresence] = useState<PresenceReading | null>(null);
  const [progress, setProgress] = useState(0);
  const [coaching, setCoaching] = useState<Coaching | null>(null);
  const [denial, setDenial] = useState<Denial | null>(null);
  const [halt, setHalt] = useState<Halt | null>(null);
  const [reArm, setReArm] = useState(false);
  const [panelHeight, setPanelHeight] = useState(0);
  const [model, setModel] = useState<FaceModelState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(() => remainingSeconds(session.expiresAt));

  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const clearHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  const resumeWatching = useCallback(() => {
    if (!mounted.current) return;
    streak.current = 0;
    lastReading.current = null;
    setProgress(0);
    setCoaching(null);
    setDenial(null);
    setPhase('watching');
  }, [setPhase]);

  const holdThenResume = useCallback(
    (delay: number) => {
      clearHold();
      holdTimer.current = setTimeout(resumeWatching, delay);
    },
    [clearHold, resumeWatching],
  );

  const stop = useCallback(
    (next: Halt) => {
      clearHold();
      streak.current = 0;
      setProgress(0);
      setHalt(next);
      setPhase('halted');
      if (next.autoExit) {
        holdTimer.current = setTimeout(() => {
          if (mounted.current) onCancel();
        }, 2400);
      }
    },
    [clearHold, onCancel, setPhase],
  );

  useEffect(() => {
    mounted.current = true;
    warmUpFaceModel().then((state) => {
      if (!mounted.current) return;
      setModel(state);
      if (state.ready) {
        if (phaseRef.current === 'starting') setPhase('watching');
      } else {
        stop({
          title: FACE_MODEL_FAILURE_MESSAGES[state.failure].title,
          body: FACE_MODEL_FAILURE_MESSAGES[state.failure].user,
          autoExit: false,
        });
      }
    });
    return () => {
      mounted.current = false;
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, [setPhase, stop]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const left = remainingSeconds(session.expiresAt);
      setSecondsLeft(left);
      if (left > 0) return;
      clearInterval(timer);
      if (phaseRef.current !== 'granted' && phaseRef.current !== 'halted') {
        stop({
          title: 'Badge scan expired',
          body: 'The badge step timed out. Scan the badge again to start over.',
          autoExit: true,
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [session.expiresAt, stop]);

  const takeFrame = useCallback(async (quality: number) => {
    const camera = cameraRef.current;
    if (!camera) return null;
    try {
      const photo = await camera.takePictureAsync({
        quality,
        skipProcessing: false,
        shutterSound: false,
        exif: false,
        ...(pictureSize.current ? { pictureSize: pictureSize.current } : null),
      });
      return photo?.uri && photo.width && photo.height ? photo : null;
    } catch {
      return null;
    }
  }, []);

  const coach = useCallback(
    (caption: string, detail: string) => {
      localMisses.current += 1;
      if (localMisses.current >= LOCAL_MISS_LIMIT) {
        needsReArm.current = true;
        setReArm(true);
      }
      streak.current = 0;
      lastReading.current = null;
      setProgress(0);
      setCoaching({ caption, detail });
      setPhase('coaching');
      holdThenResume(FACE_PRESENCE.guidanceHoldMs);
    },
    [holdThenResume, setPhase],
  );

  const runVerification = useCallback(async () => {
    setPhase('scanning');
    setCoaching(null);

    try {
      const frame = await takeFrame(0.85);
      if (!mounted.current) return;
      if (!frame) {
        coach('Camera hiccup', FACE_TERMINAL_ISSUE_MESSAGES.CaptureFailed);
        return;
      }

      const outcome = await captureFaceFromPhoto(
        { uri: frame.uri, width: frame.width, height: frame.height },
        { gates: FACE_TERMINAL_GATES, messages: FACE_TERMINAL_ISSUE_MESSAGES },
      );
      discard(frame.uri);

      if (!mounted.current) return;

      if (!outcome.ok) {
        coach(
          outcome.issue === 'MultipleFaces' ? 'One person at a time' : 'Almost — hold still',
          outcome.message,
        );
        return;
      }

      discard(outcome.capture.cropUri);
      localMisses.current = 0;
      setPhase('verifying');

      const deviceId = await getDeviceId();
      const result = await verifyFace(
        session.token,
        outcome.capture.embedding,
        outcome.capture.quality,
        deviceId,
      );

      if (!mounted.current) return;

      if (result.ok) {
        clearHold();
        setPhase('granted');
        snackbar.show(`Identity confirmed — ${result.staff.full_name}`, { variant: 'success' });
        holdTimer.current = setTimeout(() => {
          if (mounted.current) onFacePassed(result.authorized_floors);
        }, FACE_PRESENCE.grantedHoldMs);
        return;
      }

      if (result.reason === 'SessionExpired' || result.reason === 'TooManyAttempts') {
        stop({
          title: result.reason === 'SessionExpired' ? 'Badge scan expired' : 'Too many attempts',
          body: DENIAL_MESSAGES[result.reason],
          autoExit: true,
        });
        return;
      }

      const attemptsLeft = result.attempts_left ?? null;
      if (attemptsLeft === 0) {
        stop({
          title: 'No attempts left',
          body: 'This badge scan is used up. Scan the badge again to retry.',
          autoExit: true,
        });
        return;
      }

      serverDenials.current += 1;
      if (serverDenials.current >= FACE_PRESENCE.autoAttemptLimit) {
        needsReArm.current = true;
        setReArm(true);
      }

      streak.current = 0;
      lastReading.current = null;
      setProgress(0);
      setDenial({ message: DENIAL_MESSAGES[result.reason], attemptsLeft });
      setPhase('denied');
      holdThenResume(FACE_PRESENCE.deniedHoldMs);
    } catch (error) {
      if (!mounted.current) return;
      const message = errorMessage(error, 'Face verification failed.');
      serverDenials.current += 1;
      if (serverDenials.current >= FACE_PRESENCE.autoAttemptLimit) {
        needsReArm.current = true;
        setReArm(true);
      }
      streak.current = 0;
      lastReading.current = null;
      setProgress(0);
      setDenial({ message, attemptsLeft: null });
      setPhase('denied');
      holdThenResume(FACE_PRESENCE.deniedHoldMs);
    }
  }, [
    clearHold,
    coach,
    holdThenResume,
    onFacePassed,
    session.token,
    setPhase,
    snackbar,
    stop,
    takeFrame,
  ]);

  useEffect(() => {
    verifyRunner.current = runVerification;
  }, [runVerification]);

  const handleCameraReady = useCallback(async () => {
    try {
      const sizes = await cameraRef.current?.getAvailablePictureSizesAsync();
      pictureSize.current = sizes ? choosePictureSize(sizes) : null;
    } catch {
      pictureSize.current = null;
    }
    if (mounted.current) setCameraReady(true);
  }, []);

  const monitoring = cameraReady && appActive && phase !== 'halted' && model?.ready === true;

  useEffect(() => {
    if (!monitoring) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      });

    const loop = async () => {
      while (!cancelled) {
        if (phaseRef.current !== 'watching') {
          await wait(200);
          continue;
        }

        const frame = await takeFrame(0.5);
        if (cancelled) break;

        if (!frame) {
          await wait(FACE_PRESENCE.lostPersonPollMs);
          continue;
        }

        const reading = await readPresence(frame.uri, frame.width, frame.height);
        discard(frame.uri);
        if (cancelled || phaseRef.current !== 'watching') continue;

        const previous = lastReading.current;
        lastReading.current = reading;

        if (reading.code === 'DetectorUnavailable') {
          detectorMisses.current += 1;
          if (detectorMisses.current >= 3) {
            stop({
              title: 'Face detection unavailable',
              body: FACE_PRESENCE_MESSAGES.DetectorUnavailable.detail,
              autoExit: false,
            });
            break;
          }
        } else {
          detectorMisses.current = 0;
        }

        if (needsReArm.current && (reading.code === 'NoPerson' || reading.code === 'TooFar')) {
          needsReArm.current = false;
          serverDenials.current = 0;
          localMisses.current = 0;
          setReArm(false);
        }

        if (reading.code === 'NoPerson' || reading.code === 'Crowded') {
          streak.current = 0;
        } else if (reading.ready) {
          streak.current = isSteady(previous, reading)
            ? Math.min(FACE_PRESENCE.readyStreakTarget, streak.current + 1)
            : Math.max(streak.current, 1);
        } else {
          streak.current = Math.max(0, streak.current - 1);
        }

        setPresence(reading);
        setProgress(streak.current / FACE_PRESENCE.readyStreakTarget);

        if (streak.current >= FACE_PRESENCE.readyStreakTarget && !needsReArm.current) {
          await verifyRunner.current();
          continue;
        }

        await wait(
          reading.nearCount > 0 ? FACE_PRESENCE.pollIntervalMs : FACE_PRESENCE.lostPersonPollMs,
        );
      }
    };

    void loop();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [monitoring, stop, takeFrame]);

  const view = useMemo(
    () => describe({ phase, presence, coaching, denial, halt, reArm }),
    [coaching, denial, halt, phase, presence, reArm],
  );

  const expired = secondsLeft <= 0;
  const live = phase !== 'granted' && phase !== 'denied' && phase !== 'halted';
  const meterFill = presence ? Math.min(1, presence.widthRatio / FACE_PRESENCE.maxWidthRatio) : 0;

  return (
    <CameraPermissionGate
      icon="face"
      title="Camera access needed"
      reason="The door terminal needs the front camera to recognise people as they walk up."
    >
      <ScannerScaffold
        step="Step 2 of 3"
        title="Face verification"
        subtitle={`${session.staffName} · ${session.companyId}`}
        onExit={onCancel}
        exitIcon="back"
        exitLabel="Back to barcode"
        panelStyle={live ? styles.livePanel : undefined}
        onPanelHeight={setPanelHeight}
        camera={
          <>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="front"
              active={appActive}
              animateShutter={false}
              onCameraReady={() => void handleCameraReady()}
            />
            <FaceAperture
              tone={view.tone}
              progress={progress}
              caption={view.caption}
              detail={view.detail}
              bottomReserve={panelHeight + spacing.base + insets.bottom}
            />
          </>
        }
        panel={
          phase === 'granted' ? (
            <>
              <PanelHead icon="checkCircle" color={colors.success} title="Identity confirmed" />
              <Text style={styles.body}>Releasing the elevator door…</Text>
            </>
          ) : phase === 'halted' ? (
            <>
              <PanelHead
                icon="error"
                color={colors.danger}
                title={halt?.title ?? 'Scanner stopped'}
              />
              <HintRow tone="danger" title="What happened">
                {halt?.body ?? 'The scanner cannot continue.'}
              </HintRow>
              <GeneralButton label="Back to barcode" icon="back" fullWidth onPress={onCancel} />
            </>
          ) : phase === 'denied' ? (
            <>
              <PanelHead icon="error" color={colors.danger} title="Not verified" />
              <HintRow tone="danger" title="Why">
                {denial?.message ?? 'The face could not be verified.'}
              </HintRow>
              <HintRow tone="warning" title="What happens next">
                {reArm
                  ? 'Step away from the door, then walk up again to retry.'
                  : 'The scanner re-arms on its own — stay in front of it and hold still.'}
              </HintRow>
              {denial?.attemptsLeft != null ? (
                <Text style={styles.meta}>
                  {denial.attemptsLeft} attempt{denial.attemptsLeft === 1 ? '' : 's'} left on this
                  badge scan.
                </Text>
              ) : null}
              <GeneralButton
                label="Back to barcode"
                variant="ghost"
                size="sm"
                onPress={onCancel}
              />
            </>
          ) : (
            <>
              <View style={styles.head}>
                <LiveDot color={view.dot} pulsing={phase === 'watching'} />
                <Text style={styles.title}>{view.panelTitle}</Text>
                <Text style={styles.clock}>{expired ? 'expired' : `${secondsLeft}s`}</Text>
              </View>

              {presence && presence.nearCount > 0 ? (
                <View style={styles.meter}>
                  <View style={styles.track}>
                    <View
                      style={[
                        styles.band,
                        {
                          left: `${IDEAL_BAND_START * 100}%`,
                          width: `${(IDEAL_BAND_END - IDEAL_BAND_START) * 100}%`,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.fill,
                        { width: `${meterFill * 100}%`, backgroundColor: view.dot },
                      ]}
                    />
                  </View>
                  <Text style={styles.meterValue}>{view.distance}</Text>
                </View>
              ) : (
                <Text style={styles.meta}>
                  No button needed — the scanner starts on its own.
                </Text>
              )}
            </>
          )
        }
      />
    </CameraPermissionGate>
  );
}

type ViewModel = {
  tone: ApertureTone;
  caption: string;
  detail: string;
  panelTitle: string;
  dot: string;
  distance: string;
};

function describe({
  phase,
  presence,
  coaching,
  denial,
  halt,
  reArm,
}: {
  phase: Phase;
  presence: PresenceReading | null;
  coaching: Coaching | null;
  denial: Denial | null;
  halt: Halt | null;
  reArm: boolean;
}): ViewModel {
  const distance = !presence
    ? '—'
    : presence.code === 'TooFar'
      ? 'Too far'
      : presence.code === 'TooClose'
        ? 'Too close'
        : 'Good';

  if (phase === 'starting') {
    return {
      tone: 'idle',
      caption: 'Starting the scanner…',
      detail: 'Warming up face recognition.',
      panelTitle: 'Starting up',
      dot: palette.gold,
      distance,
    };
  }

  if (phase === 'halted') {
    return {
      tone: 'blocked',
      caption: halt?.title ?? 'Scanner stopped',
      detail: halt?.body ?? 'The scanner cannot continue.',
      panelTitle: halt?.title ?? 'Scanner stopped',
      dot: colors.danger,
      distance,
    };
  }

  if (phase === 'granted') {
    return {
      tone: 'granted',
      caption: 'Access granted',
      detail: 'Identity confirmed.',
      panelTitle: 'Identity confirmed',
      dot: colors.success,
      distance,
    };
  }

  if (phase === 'denied') {
    return {
      tone: 'denied',
      caption: 'Not verified',
      detail: denial?.message ?? 'The face could not be verified.',
      panelTitle: 'Not verified',
      dot: colors.danger,
      distance,
    };
  }

  if (phase === 'coaching') {
    return {
      tone: 'guide',
      caption: coaching?.caption ?? 'Hold still',
      detail: coaching?.detail ?? 'Stay inside the circle.',
      panelTitle: 'Adjusting',
      dot: palette.gold,
      distance,
    };
  }

  if (phase === 'scanning' || phase === 'verifying') {
    return {
      tone: 'working',
      caption: phase === 'scanning' ? 'Scanning…' : 'Checking your identity…',
      detail: 'Hold still — this takes a moment.',
      panelTitle: phase === 'scanning' ? 'Scanning' : 'Verifying',
      dot: palette.white,
      distance,
    };
  }

  if (reArm) {
    return {
      tone: 'guide',
      caption: 'Step away and try again',
      detail: 'Move back from the door, then walk up again to restart the scan.',
      panelTitle: 'Waiting for a reset',
      dot: palette.gold,
      distance,
    };
  }

  const code = presence?.code ?? 'NoPerson';
  const copy = FACE_PRESENCE_MESSAGES[code];

  return {
    tone:
      code === 'Crowded' || code === 'DetectorUnavailable'
        ? 'blocked'
        : code === 'Ready'
          ? 'locking'
          : code === 'NoPerson'
            ? 'idle'
            : 'guide',
    caption: copy.caption,
    detail: copy.detail,
    panelTitle:
      code === 'Ready'
        ? 'Locking on'
        : code === 'Crowded'
          ? 'Waiting for one person'
          : code === 'NoPerson'
            ? 'Ready to scan'
            : 'Line yourself up',
    dot:
      code === 'Crowded' || code === 'DetectorUnavailable'
        ? colors.danger
        : code === 'Ready'
          ? colors.success
          : palette.gold,
    distance,
  };
}

function LiveDot({ color, pulsing }: { color: string; pulsing: boolean }) {
  const beat = useSharedValue(0);

  useEffect(() => {
    if (pulsing) {
      beat.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 780, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 780, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      );
    } else {
      beat.value = withTiming(0, { duration: 200 });
    }
  }, [beat, pulsing]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - 0.55 * beat.value,
    transform: [{ scale: 1 + 0.35 * beat.value }],
  }));

  return <Animated.View style={[styles.dot, style, { backgroundColor: color }]} />;
}

function PanelHead({ icon, color, title }: { icon: IconName; color: string; title: string }) {
  return (
    <View style={styles.head}>
      <Icon name={icon} size={20} color={color} />
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

function choosePictureSize(sizes: string[]) {
  const target = 1280 * 960;

  const parsed = sizes.flatMap((value) => {
    const match = value.match(/(\d{3,5})\s*[xX×]\s*(\d{3,5})/);
    if (!match) return [];
    const long = Math.max(Number(match[1]), Number(match[2]));
    const short = Math.min(Number(match[1]), Number(match[2]));
    const area = long * short;
    if (area < 640 * 480 || area > 4000 * 3000) return [];
    return [{ value, area, aspect: long / short }];
  });

  const preferred = parsed.filter((size) => Math.abs(size.aspect - 4 / 3) < 0.06);
  const pool = preferred.length > 0 ? preferred : parsed;

  return (
    pool.reduce<(typeof pool)[number] | null>(
      (best, size) =>
        !best || Math.abs(size.area - target) < Math.abs(best.area - target) ? size : best,
      null,
    )?.value ?? null
  );
}

function discard(uri: string) {
  if (!uri.startsWith('file:')) return;
  try {
    new File(uri).delete();
  } catch {
    return;
  }
}

function remainingSeconds(expiresAt: string) {
  const millis = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.floor(millis / 1000));
}

const styles = StyleSheet.create({
  livePanel: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  clock: {
    marginLeft: 'auto',
    color: colors.textMuted,
    ...typography.caption,
    fontVariant: ['tabular-nums'],
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  title: {
    color: colors.text,
    ...typography.subheading,
  },
  body: {
    color: colors.textSecondary,
    ...typography.body,
  },
  meta: {
    color: colors.textMuted,
    ...typography.caption,
  },
  meter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  meterValue: {
    width: 62,
    textAlign: 'right',
    color: colors.textSecondary,
    ...typography.caption,
  },
  track: {
    flex: 1,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  band: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: palette.goldTint,
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
});

export default FacialRecognitionScreen;
