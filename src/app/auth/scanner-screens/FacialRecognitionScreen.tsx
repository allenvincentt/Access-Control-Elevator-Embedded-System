import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { VerificationSession } from '@/app/auth/scanner-screens/ScannerFlow';
import { useSnackbar } from '@/components/common/Snackbar';
import { HintRow } from '@/components/HintRow';
import { CameraPermissionGate } from '@/components/scanner/CameraPermissionGate';
import { FaceAperture, type ApertureTone } from '@/components/scanner/FaceAperture';
import { ScannerScaffold } from '@/components/scanner/ScannerScaffold';
import { GeneralButton } from '@/components/ui/buttons/GeneralButton';
import { Icon, type IconName } from '@/components/ui/Icon';
import { ShakeView } from '@/components/ui/ShakeView';
import { colors, palette, radius, spacing, typography } from '@/constants/themeColor';
import { getDeviceId } from '@/lib/deviceId';
import { DENIAL_MESSAGES, errorMessage } from '@/lib/errors';
import { announceAccessDenied, announceGuestCheckedIn, announceScanAgain, announceWelcome } from '@/lib/speech';
import {
  FACE_MODEL_FAILURE_MESSAGES,
  FACE_PRESENCE,
  FACE_PRESENCE_MESSAGES,
  FACE_TERMINAL_GATES,
  FACE_TERMINAL_ISSUE_MESSAGES,
  FACE_TERMINAL_SUBJECT_RULES,
} from '@/services/face/constants';
import { warmUpFaceModel, type FaceModelState } from '@/services/face/embedder';
import { captureFaceFromPhoto, captureFacePhoto } from '@/services/face/pipeline';
import { readPresence } from '@/services/face/presence';
import {
  recordIssue,
  recordOutcome,
  recordPresence,
  snapshotTelemetry,
  type TelemetrySnapshot,
} from '@/services/face/telemetry';
import { PresenceTracker, type TrackedPresence } from '@/services/face/tracker';
import { uploadGuestCapture } from '@/services/storageService';
import { recordGuestFace, verifyFace } from '@/services/verificationService';
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

type Frame = {
  uri: string;
  width: number;
  height: number;
};

const LOCAL_MISS_LIMIT = 5;
const GUEST_PORTRAIT_SIZE = 384;
const GUEST_PORTRAIT_MARGIN = 0.55;
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
  const isGuest = session.role === 'Guest';
  const cameraRef = useRef<CameraView>(null);
  const mounted = useRef(true);
  const phaseRef = useRef<Phase>('starting');
  const tracker = useRef(new PresenceTracker());
  const serverDenials = useRef(0);
  const localMisses = useRef(0);
  const needsReArm = useRef(false);
  const detectorMisses = useRef(0);
  const sizeResolved = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verifyRunner = useRef<() => Promise<void>>(async () => {});

  const [phase, setPhaseState] = useState<Phase>('starting');
  const [cameraReady, setCameraReady] = useState(false);
  const [pictureSize, setPictureSize] = useState<string | null>(null);
  const [appActive, setAppActive] = useState(true);
  const [settled, setSettled] = useState(true);
  const [presence, setPresence] = useState<TrackedPresence | null>(null);
  const [progress, setProgress] = useState(0);
  const [coaching, setCoaching] = useState<Coaching | null>(null);
  const [denial, setDenial] = useState<Denial | null>(null);
  const [halt, setHalt] = useState<Halt | null>(null);
  const [reArm, setReArm] = useState(false);
  const [panelHeight, setPanelHeight] = useState(0);
  const [model, setModel] = useState<FaceModelState | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<TelemetrySnapshot | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(() => remainingSeconds(session.expiresAt));
  const [errorPulse, setErrorPulse] = useState(0);

  const pulseError = useCallback(() => setErrorPulse((count) => count + 1), []);

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
    tracker.current.reset();
    setProgress(0);
    setPresence(null);
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
      tracker.current.reset();
      setProgress(0);
      setHalt(next);
      pulseError();
      setPhase('halted');
      if (next.autoExit) {
        holdTimer.current = setTimeout(() => {
          if (mounted.current) onCancel();
        }, 2400);
      }
    },
    [clearHold, onCancel, pulseError, setPhase],
  );

  useEffect(() => {
    mounted.current = true;

    if (isGuest) {
      if (phaseRef.current === 'starting') setPhase('watching');
      return () => {
        mounted.current = false;
        if (holdTimer.current) clearTimeout(holdTimer.current);
      };
    }

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
  }, [isGuest, setPhase, stop]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      setAppActive(active);
      setSettled(!active);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      if (!active) return;
      tracker.current.reset();
      settleTimer.current = setTimeout(() => {
        if (mounted.current) setSettled(true);
      }, FACE_PRESENCE.resumeSettleMs);
    });
    return () => {
      subscription.remove();
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!diagnosticsOpen) return;
    const timer = setInterval(() => setDiagnostics(snapshotTelemetry()), 1000);
    return () => clearInterval(timer);
  }, [diagnosticsOpen]);

  useEffect(() => {
    const timer = setInterval(() => {
      const left = remainingSeconds(session.expiresAt);
      setSecondsLeft(left);
      if (left > 0) return;
      clearInterval(timer);
      if (phaseRef.current !== 'granted' && phaseRef.current !== 'halted') {
        announceScanAgain();
        stop({
          title: 'Badge scan expired',
          body: 'The badge step timed out. Scan the badge again to start over.',
          autoExit: true,
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [session.expiresAt, stop]);

  const capturePhoto = useCallback(async (quality: number): Promise<Frame | null> => {
    const camera = cameraRef.current;
    if (!camera) return null;
    try {
      const photo = await camera.takePictureAsync({
        quality,
        skipProcessing: false,
        shutterSound: false,
        exif: false,
      });
      return photo?.uri && photo.width && photo.height
        ? { uri: photo.uri, width: photo.width, height: photo.height }
        : null;
    } catch {
      return null;
    }
  }, []);

  const takePollFrame = useCallback(async (): Promise<Frame | null> => {
    const photo = await capturePhoto(FACE_PRESENCE.pollFrameQuality);
    if (!photo) return null;
    if (photo.width <= FACE_PRESENCE.pollFrameWidth) return photo;

    try {
      const context = ImageManipulator.manipulate(photo.uri);
      context.resize({ width: FACE_PRESENCE.pollFrameWidth, height: null });
      const rendered = await context.renderAsync();
      const saved = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: FACE_PRESENCE.pollFrameQuality,
      });
      release(rendered);
      release(context);
      discard(photo.uri);
      return { uri: saved.uri, width: saved.width, height: saved.height };
    } catch {
      return photo;
    }
  }, [capturePhoto]);

  const coach = useCallback(
    (caption: string, detail: string) => {
      localMisses.current += 1;
      if (localMisses.current >= LOCAL_MISS_LIMIT) {
        needsReArm.current = true;
        setReArm(true);
      }
      tracker.current.reset();
      setProgress(0);
      setCoaching({ caption, detail });
      pulseError();
      setPhase('coaching');
      holdThenResume(FACE_PRESENCE.guidanceHoldMs);
    },
    [holdThenResume, pulseError, setPhase],
  );

  const runVerification = useCallback(async () => {
    setPhase('scanning');
    setCoaching(null);

    try {
      const frame = await capturePhoto(FACE_PRESENCE.captureFrameQuality);
      if (!mounted.current) return;
      if (!frame) {
        recordOutcome('frameLost');
        coach('Camera hiccup', FACE_TERMINAL_ISSUE_MESSAGES.CaptureFailed);
        return;
      }

      const captureOptions = {
        gates: FACE_TERMINAL_GATES,
        rules: FACE_TERMINAL_SUBJECT_RULES,
        messages: FACE_TERMINAL_ISSUE_MESSAGES,
      };

      const outcome = isGuest
        ? await captureFacePhoto(frame, {
            ...captureOptions,
            outputSize: GUEST_PORTRAIT_SIZE,
            cropMarginRatio: GUEST_PORTRAIT_MARGIN,
          })
        : await captureFaceFromPhoto(frame, captureOptions);
      discard(frame.uri);

      if (!mounted.current) return;

      if (!outcome.ok) {
        recordIssue(outcome.issue);
        coach(
          outcome.issue === 'MultipleFaces' ? 'One person at a time' : 'Almost — hold still',
          outcome.message,
        );
        return;
      }

      localMisses.current = 0;
      setPhase('verifying');

      const deviceId = await getDeviceId();
      let result;

      if ('photo' in outcome) {
        const photoPath = await uploadGuestCapture(outcome.photo.cropBase64);
        discard(outcome.photo.cropUri);
        if (!mounted.current) return;
        result = await recordGuestFace(session.token, photoPath, deviceId);
      } else {
        discard(outcome.capture.cropUri);
        result = await verifyFace(
          session.token,
          outcome.capture.embedding,
          outcome.capture.quality,
          deviceId,
        );
      }

      if (!mounted.current) return;

      if (result.ok) {
        recordOutcome('granted');
        clearHold();
        setPhase('granted');
        if (isGuest) {
          announceGuestCheckedIn();
        } else {
          announceWelcome(result.staff.full_name);
        }
        snackbar.show(
          isGuest
            ? `Guest checked in — ${result.staff.full_name}`
            : `Identity confirmed — ${result.staff.full_name}`,
          { variant: 'success' },
        );
        holdTimer.current = setTimeout(() => {
          if (mounted.current) onFacePassed(result.authorized_floors);
        }, FACE_PRESENCE.grantedHoldMs);
        return;
      }

      recordOutcome('denied');

      if (result.reason === 'SessionExpired' || result.reason === 'TooManyAttempts') {
        if (result.reason === 'SessionExpired') {
          announceScanAgain();
        }
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

      tracker.current.reset();
      setProgress(0);
      setDenial({ message: DENIAL_MESSAGES[result.reason], attemptsLeft });
      announceAccessDenied();
      pulseError();
      setPhase('denied');
      holdThenResume(FACE_PRESENCE.deniedHoldMs);
    } catch (error) {
      if (!mounted.current) return;
      recordOutcome('error');
      const message = errorMessage(error, 'Face verification failed.');
      serverDenials.current += 1;
      if (serverDenials.current >= FACE_PRESENCE.autoAttemptLimit) {
        needsReArm.current = true;
        setReArm(true);
      }
      tracker.current.reset();
      setProgress(0);
      setDenial({ message, attemptsLeft: null });
      announceAccessDenied();
      pulseError();
      setPhase('denied');
      holdThenResume(FACE_PRESENCE.deniedHoldMs);
    }
  }, [
    capturePhoto,
    clearHold,
    coach,
    holdThenResume,
    isGuest,
    onFacePassed,
    pulseError,
    session.token,
    setPhase,
    snackbar,
    stop,
  ]);

  useEffect(() => {
    verifyRunner.current = runVerification;
  }, [runVerification]);

  const handleCameraReady = useCallback(async () => {
    if (!sizeResolved.current) {
      sizeResolved.current = true;
      try {
        const sizes = await cameraRef.current?.getAvailablePictureSizesAsync();
        const chosen = sizes ? choosePictureSize(sizes) : null;
        if (mounted.current && chosen) setPictureSize(chosen);
      } catch {
        sizeResolved.current = true;
      }
    }
    if (mounted.current) setCameraReady(true);
  }, []);

  const monitoring =
    cameraReady &&
    appActive &&
    settled &&
    phase !== 'halted' &&
    (isGuest || model?.ready === true);

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

        const frame = await takePollFrame();
        if (cancelled) break;

        if (!frame) {
          recordOutcome('frameLost');
          await wait(FACE_PRESENCE.lostPersonPollMs);
          continue;
        }

        const sample = await readPresence(frame.uri, frame.width, frame.height);
        discard(frame.uri);
        if (cancelled || phaseRef.current !== 'watching') continue;

        if (sample.detectorFailed) {
          detectorMisses.current += 1;
          recordPresence('DetectorUnavailable');
          if (detectorMisses.current >= FACE_PRESENCE.detectorFailureLimit) {
            stop({
              title: 'Face detection unavailable',
              body: FACE_PRESENCE_MESSAGES.DetectorUnavailable.detail,
              autoExit: false,
            });
            break;
          }
          await wait(FACE_PRESENCE.lostPersonPollMs);
          continue;
        }

        detectorMisses.current = 0;

        const tracked = tracker.current.push(sample);
        recordPresence(tracked.code);

        if (needsReArm.current && (!tracked.present || tracked.code === 'TooFar')) {
          needsReArm.current = false;
          serverDenials.current = 0;
          localMisses.current = 0;
          setReArm(false);
        }

        setPresence(tracked);
        setProgress(tracked.progress);

        if (tracked.ready && !needsReArm.current) {
          await verifyRunner.current();
          continue;
        }

        await wait(
          tracked.present ? FACE_PRESENCE.pollIntervalMs : FACE_PRESENCE.lostPersonPollMs,
        );
      }
    };

    void loop();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [monitoring, stop, takePollFrame]);

  const view = useMemo(
    () => describe({ phase, presence, coaching, denial, halt, reArm, isGuest }),
    [coaching, denial, halt, isGuest, phase, presence, reArm],
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
        title={isGuest ? 'Guest photo' : 'Face verification'}
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
              pictureSize={pictureSize ?? undefined}
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
          <ShakeView
            signal={errorPulse}
            style={live ? styles.livePanelStack : styles.panelStack}
          >
            {phase === 'granted' ? (
              <>
                <PanelHead
                  icon="checkCircle"
                  color={colors.success}
                  title={isGuest ? 'Guest checked in' : 'Identity confirmed'}
                />
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
                <Pressable
                  style={styles.head}
                  delayLongPress={1500}
                  onLongPress={() => {
                    setDiagnostics(snapshotTelemetry());
                    setDiagnosticsOpen((open) => !open);
                  }}
                >
                  <LiveDot color={view.dot} pulsing={phase === 'watching'} />
                  <Text style={styles.title}>{view.panelTitle}</Text>
                  <Text style={styles.clock}>{expired ? 'expired' : `${secondsLeft}s`}</Text>
                </Pressable>
  
                {diagnosticsOpen ? (
                  <Diagnostics snapshot={diagnostics} presence={presence} />
                ) : presence?.present ? (
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
            )}
          </ShakeView>
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
  isGuest,
}: {
  phase: Phase;
  presence: TrackedPresence | null;
  coaching: Coaching | null;
  denial: Denial | null;
  halt: Halt | null;
  reArm: boolean;
  isGuest: boolean;
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
      detail: isGuest ? 'Guest photo captured.' : 'Identity confirmed.',
      panelTitle: isGuest ? 'Guest checked in' : 'Identity confirmed',
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
      caption:
        phase === 'scanning'
          ? isGuest
            ? 'Taking your photo…'
            : 'Scanning…'
          : isGuest
            ? 'Saving your photo…'
            : 'Checking your identity…',
      detail: 'Hold still — this takes a moment.',
      panelTitle: phase === 'scanning' ? 'Capturing' : isGuest ? 'Saving' : 'Verifying',
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

function Diagnostics({
  snapshot,
  presence,
}: {
  snapshot: TelemetrySnapshot | null;
  presence: TrackedPresence | null;
}) {
  if (!snapshot) {
    return <Text style={styles.meta}>Collecting diagnostics…</Text>;
  }

  const minutes = Math.round(snapshot.windowMs / 60000);

  return (
    <View style={styles.diagnostics}>
      <Text style={styles.meta}>
        Last {minutes} min · {snapshot.total} event{snapshot.total === 1 ? '' : 's'}
      </Text>
      <Text style={styles.diagnosticLine}>
        {presence
          ? `w ${presence.widthRatio.toFixed(3)} · q ${presence.geometryScore.toFixed(2)} · n ${presence.samples} · ${presence.steady ? 'steady' : 'moving'}`
          : 'no track'}
      </Text>
      <DiagnosticRow label="presence" tallies={snapshot.presence} />
      <DiagnosticRow label="rejects" tallies={snapshot.issues} />
      <DiagnosticRow label="results" tallies={snapshot.outcomes} />
    </View>
  );
}

function DiagnosticRow({
  label,
  tallies,
}: {
  label: string;
  tallies: TelemetrySnapshot['presence'];
}) {
  if (!tallies.length) return null;

  return (
    <Text style={styles.diagnosticLine} numberOfLines={2}>
      {label}: {tallies.map((row) => `${row.key} ${row.count}`).join(' · ')}
    </Text>
  );
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

function release(target: { release: () => void }) {
  try {
    target.release();
  } catch {
    return;
  }
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
  panelStack: {
    gap: spacing.md,
  },
  livePanelStack: {
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
  diagnostics: {
    gap: spacing.xs,
  },
  diagnosticLine: {
    color: colors.textSecondary,
    ...typography.caption,
    fontVariant: ['tabular-nums'],
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
