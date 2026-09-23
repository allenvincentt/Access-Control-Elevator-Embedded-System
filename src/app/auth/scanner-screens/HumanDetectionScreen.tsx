import { CameraView } from "expo-camera";
import * as ScreenOrientation from "expo-screen-orientation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AppState,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Rect } from "react-native-svg";

import { useSnackbar } from "@/components/common/Snackbar";
import { HintRow } from "@/components/HintRow";
import { CameraPermissionGate } from "@/components/scanner/CameraPermissionGate";
import { ClipLabelEditor } from "@/components/scanner/ClipLabelEditor";
import { ScannerScaffold } from "@/components/scanner/ScannerScaffold";
import { GeneralButton } from "@/components/ui/buttons/GeneralButton";
import { Icon, type IconName } from "@/components/ui/Icon";
import {
  colors,
  palette,
  radius,
  spacing,
  typography,
} from "@/constants/themeColor";
import { useRideNarration } from "@/hooks/useRideNarration";
import { useRideSession } from "@/hooks/useRideSession";
import { errorMessage } from "@/lib/errors";
import { reportOccupancy } from "@/services/elevatorService";
import {
  PERSON_DETECTION,
  PERSON_MODEL_FAILURE_MESSAGES,
  PERSON_ROI_WIDE,
  PERSON_SCOPE_FULL,
  PERSON_SCOPES,
  type ClipLabel,
} from "@/services/person/constants";
import {
  ClipRecorder,
  PERSON_DATASET_ENABLED,
} from "@/services/person/dataset";
import {
  detectPeople,
  discardFile,
  type DetectionStats,
} from "@/services/person/detector";
import {
  warmUpPersonModel,
  type PersonModelState,
} from "@/services/person/model";
import {
  PersonTracker,
  type PersonTrack,
  type TrackedCount,
} from "@/services/person/tracker";
import { refreshBoarding, watchBoardingOnly } from "@/services/rideSession";

export type HumanDetectionScreenProps = {
  onExit: () => void;
  onOpenReplay?: () => void;
};

type Frame = {
  uri: string;
  width: number;
  height: number;
  capturedAt: number;
};

type OverlayBox = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  counted: boolean;
};

const DANGER = "#FF6B60";
const SUCCESS = "#4ADE80";
const PANEL_MAX_WIDTH = 380;

const AnimatedRect = Animated.createAnimatedComponent(Rect);

export function HumanDetectionScreen({
  onExit,
  onOpenReplay,
}: HumanDetectionScreenProps) {
  const snackbar = useSnackbar();
  const { width: viewWidth, height: viewHeight } = useWindowDimensions();
  const ride = useRideSession();
  const boarding = ride.boarding;
  const linkFault = ride.boardingError;
  const linkCheck = ride.boardingCheck;

  const cameraRef = useRef<CameraView>(null);
  const mounted = useRef(true);
  const tracker = useRef(new PersonTracker());
  const phaseRef = useRef<string>("idle");
  const attemptRef = useRef(0);
  const faultSeqRef = useRef(0);
  const trackingRef = useRef(false);
  const reportedKey = useRef<string | null>(null);
  const reportedAt = useRef(0);
  const detectorMisses = useRef(0);
  const lastFrameAt = useRef(0);
  const recorderRef = useRef<ClipRecorder | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [appActive, setAppActive] = useState(true);
  const [landscape, setLandscape] = useState(false);
  const [model, setModel] = useState<PersonModelState | null>(null);
  const [glideMs, setGlideMs] = useState<number>(
    PERSON_DETECTION.boxGlideMinMs,
  );
  const [stats, setStats] = useState<DetectionStats | null>(null);
  const [tracked, setTracked] = useState<TrackedCount | null>(null);
  const [source, setSource] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [fault, setFault] = useState<string | null>(null);
  const [datasetOpen, setDatasetOpen] = useState(false);
  const [clipLabel, setClipLabel] = useState<ClipLabel>({
    count: 0,
    tags: [],
  });
  const [recordedFrames, setRecordedFrames] = useState<number | null>(null);
  const recording = recordedFrames !== null;

  useRideNarration(boarding, true);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    setRecordedFrames(null);
    if (!recorder) return;
    let saved;
    try {
      saved = recorder.finish();
    } catch (error) {
      if (mounted.current) {
        snackbar.show(errorMessage(error, "The clip could not be saved."), {
          variant: "error",
        });
      }
      return;
    }
    if (!mounted.current) return;
    snackbar.show(
      saved
        ? `Clip saved with ${saved.manifest.frames.length} frames.`
        : "No frames were captured, so nothing was saved.",
      { variant: saved ? "success" : "info" },
    );
  }, [snackbar]);

  const startRecording = useCallback(() => {
    if (recorderRef.current) return;
    try {
      recorderRef.current = new ClipRecorder(clipLabel);
      setRecordedFrames(0);
    } catch (error) {
      snackbar.show(errorMessage(error, "The clip could not be started."), {
        variant: "error",
      });
    }
  }, [clipLabel, snackbar]);

  useEffect(() => {
    phaseRef.current = boarding?.phase ?? "idle";
    attemptRef.current = boarding?.attempt ?? 0;
    faultSeqRef.current = boarding?.faultSeq ?? 0;
  }, [boarding]);

  useEffect(() => {
    mounted.current = true;
    warmUpPersonModel().then((state) => {
      if (mounted.current) setModel(state);
    });
    return () => {
      mounted.current = false;
      const recorder = recorderRef.current;
      recorderRef.current = null;
      try {
        recorder?.finish();
      } catch {
        return;
      }
    };
  }, []);

  useEffect(() => {
    let released = false;

    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
      .catch(() => undefined)
      .then(() => {
        if (!released && mounted.current) setLandscape(true);
      });

    return () => {
      released = true;
      setLandscape(false);
      void ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      ).catch(() => undefined);
    };
  }, []);

  useEffect(() => watchBoardingOnly(), []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setAppActive(state === "active");
      if (state !== "active") {
        tracker.current.reset();
        stopRecording();
      }
    });
    return () => subscription.remove();
  }, [stopRecording]);

  const capture = useCallback(async (): Promise<Frame | null> => {
    const camera = cameraRef.current;
    if (!camera) return null;
    try {
      const photo = await camera.takePictureAsync({
        quality: PERSON_DETECTION.frameQuality,
        skipProcessing: false,
        shutterSound: false,
        exif: false,
      });
      return photo?.uri && photo.width && photo.height
        ? {
            uri: photo.uri,
            width: photo.width,
            height: photo.height,
            capturedAt: Date.now(),
          }
        : null;
    } catch {
      return null;
    }
  }, []);

  const monitoring =
    cameraReady && appActive && landscape && model?.ready === true;

  useEffect(() => {
    if (!monitoring) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    lastFrameAt.current = 0;

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      });

    const settleFrame = async (frame: Frame) => {
      const recorder = recorderRef.current;
      if (!recorder) {
        discardFile(frame.uri);
        return;
      }
      try {
        await recorder.add(frame);
        if (mounted.current && recorderRef.current === recorder) {
          setRecordedFrames(recorder.frameCount);
        }
      } catch {
        discardFile(frame.uri);
      }
    };

    const loop = async () => {
      while (!cancelled) {
        const counting = phaseRef.current === "counting";
        const interval =
          counting || recorderRef.current
            ? PERSON_DETECTION.pollIntervalMs
            : PERSON_DETECTION.idlePollIntervalMs;

        if (counting !== trackingRef.current) {
          trackingRef.current = counting;
          reportedKey.current = null;
          // Tracks built up while idling describe the car as it was before this
          // count began. Carrying them across means a count opens with whatever
          // the detector had already settled on, including anything it held onto
          // in an empty car, and those tracks are confirmed so they count at once.
          tracker.current.reset();
        }

        const frame = await capture();
        if (cancelled) break;
        if (!frame) {
          await wait(interval);
          continue;
        }

        setSource({ width: frame.width, height: frame.height });

        let outcome;
        try {
          outcome = await detectPeople(frame, PERSON_ROI_WIDE, PERSON_SCOPES);
        } catch (error) {
          discardFile(frame.uri);
          if (!cancelled && mounted.current) {
            setFault(errorMessage(error, "Person detection failed."));
          }
          break;
        }
        await settleFrame(frame);
        if (cancelled || !mounted.current) break;

        if (!outcome.ok) {
          detectorMisses.current += 1;
          if (detectorMisses.current >= PERSON_DETECTION.detectorFailureLimit) {
            setFault("The camera could not produce a usable frame.");
            break;
          }
          await wait(interval);
          continue;
        }

        detectorMisses.current = 0;
        const next = tracker.current.push(outcome.boxes);
        const now = Date.now();
        const gap =
          lastFrameAt.current > 0
            ? now - lastFrameAt.current
            : PERSON_DETECTION.boxGlideMinMs;
        lastFrameAt.current = now;
        setGlideMs(
          Math.min(
            PERSON_DETECTION.boxGlideMaxMs,
            Math.max(PERSON_DETECTION.boxGlideMinMs, gap),
          ),
        );
        setStats(outcome.stats);
        setTracked(next);

        if (!counting) {
          await wait(interval);
          continue;
        }

        const key = `${attemptRef.current}-${faultSeqRef.current}-${next.count}`;
        const stale =
          Date.now() - reportedAt.current >= PERSON_DETECTION.reportRetryMs;
        const worthReporting = next.count > 0 || next.stable;
        if (worthReporting && (reportedKey.current !== key || stale)) {
          reportedKey.current = key;
          reportedAt.current = Date.now();
          try {
            await reportOccupancy(next.count);
          } catch (error) {
            if (mounted.current) {
              snackbar.show(
                errorMessage(error, "The count could not be sent."),
                {
                  variant: "error",
                },
              );
            }
          }
        }

        await wait(interval);
      }
    };

    void loop();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [capture, monitoring, snackbar]);

  const counting = boarding?.phase === "counting";
  const expected = boarding?.expected ?? 0;
  const observed = tracked?.count ?? 0;
  const matches = counting && observed === expected;

  const overlay = buildOverlay(
    tracked?.visible ?? [],
    source,
    viewWidth,
    viewHeight,
  );
  const wide = viewWidth > viewHeight;

  const datasetToggle = PERSON_DATASET_ENABLED ? (
    <DatasetToggle
      recordedFrames={recordedFrames}
      onPress={() => setDatasetOpen(true)}
    />
  ) : null;

  const datasetPanel = (
    <>
      <PanelHead
        icon="camera"
        color={colors.primary}
        title="Dataset capture"
        accessory={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close dataset capture"
            hitSlop={8}
            onPress={() => setDatasetOpen(false)}
            style={({ pressed }) => [
              styles.headAction,
              pressed && styles.headActionPressed,
            ]}
          >
            <Icon name="close" size={16} color={colors.textSecondary} />
          </Pressable>
        }
      />
      <ClipLabelEditor
        label={clipLabel}
        onChange={setClipLabel}
        disabled={recording}
      />
      <View style={styles.datasetActions}>
        <GeneralButton
          size="sm"
          label={recording ? `Stop · ${recordedFrames} frames` : "Record clip"}
          icon={recording ? "stop" : "record"}
          variant={recording ? "danger" : "primary"}
          disabled={!recording && !monitoring}
          onPress={recording ? stopRecording : startRecording}
          fullWidth
          style={styles.datasetPrimary}
        />
        {onOpenReplay ? (
          <GeneralButton
            size="sm"
            label="Replay"
            icon="play"
            variant="outline"
            disabled={recording}
            onPress={onOpenReplay}
          />
        ) : null}
      </View>
    </>
  );

  if (model && !model.ready) {
    const copy = PERSON_MODEL_FAILURE_MESSAGES[model.failure];
    return (
      <ScannerScaffold
        step="Human detector"
        title={copy.title}
        subtitle="Occupancy check unavailable"
        onExit={onExit}
        exitIcon="back"
        exitLabel="Back to sign in"
        camera={null}
        panel={
          <>
            <PanelHead icon="error" color={colors.danger} title={copy.title} />
            <HintRow tone="danger" title="What to fix">
              {copy.admin}
            </HintRow>
            {model.detail ? (
              <HintRow tone="neutral" title="Detail">
                {model.detail}
              </HintRow>
            ) : null}
          </>
        }
      />
    );
  }

  return (
    <CameraPermissionGate
      icon="camera"
      title="Camera access needed"
      reason="Elevator System needs the camera to count the people inside the car before it moves."
    >
      <ScannerScaffold
        step="Human detector"
        title={counting ? "Counting the car" : "Watching the car"}
        subtitle={
          counting ? `Expecting ${expected}` : "Waiting for the door to close"
        }
        onExit={onExit}
        exitIcon="back"
        exitLabel="Back to sign in"
        panelStyle={wide ? styles.panelWide : undefined}
        camera={
          <>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              active={appActive}
              animateShutter={false}
              onCameraReady={() => setCameraReady(true)}
            />
            <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
              <Rect
                x={PERSON_ROI_WIDE.left * viewWidth}
                y={PERSON_ROI_WIDE.top * viewHeight}
                width={
                  (PERSON_ROI_WIDE.right - PERSON_ROI_WIDE.left) * viewWidth
                }
                height={
                  (PERSON_ROI_WIDE.bottom - PERSON_ROI_WIDE.top) * viewHeight
                }
                fill="none"
                stroke="rgba(255,255,255,0.45)"
                strokeWidth={2}
                strokeDasharray="10 8"
                rx={radius.lg}
              />
              {overlay.map((box) => (
                <TrackBox key={box.id} box={box} glideMs={glideMs} />
              ))}
            </Svg>
            {PERSON_DETECTION.showDiagnostics && stats ? (
              <View style={styles.diagnostics} pointerEvents="none">
                <Text style={styles.diagnosticsText}>
                  {`model ${stats.reported}/${stats.scanned}  gate ${stats.decoded}  merged ${stats.merged}  in view ${stats.accepted}  counted ${observed}`}
                </Text>
                <Text style={styles.diagnosticsText}>
                  {`best person score ${stats.topScore.toFixed(2)} · needs ${PERSON_SCOPE_FULL.minScore.toFixed(2)}`}
                </Text>
              </View>
            ) : null}
          </>
        }
        panel={
          datasetOpen && PERSON_DATASET_ENABLED ? (
            datasetPanel
          ) : fault || linkFault ? (
            <>
              <PanelHead
                icon="error"
                color={colors.danger}
                title={fault ? "Detector stopped" : "Controller not reporting"}
                accessory={datasetToggle}
              />
              <HintRow tone="danger" title="Why">
                {fault ?? linkFault}
              </HintRow>
              {linkFault && !fault ? (
                <HintRow tone="neutral" title="What to check">
                  {linkCheck ??
                    "The controller is reachable but this phone cannot read its boarding status. Confirm the ESP32 is running the current firmware, then clear the Bluetooth cache in Settings."}
                </HintRow>
              ) : null}
              <GeneralButton
                label="Retry"
                icon="refresh"
                onPress={() => {
                  detectorMisses.current = 0;
                  tracker.current.reset();
                  setFault(null);
                  void refreshBoarding();
                }}
              />
            </>
          ) : counting ? (
            <>
              <PanelHead
                icon={matches ? "checkCircle" : "person"}
                color={matches ? colors.success : colors.primary}
                title={matches ? "Occupancy matches" : "Counting…"}
                accessory={datasetToggle}
              />
              <View style={styles.tally}>
                <Tally label="Verified" value={expected} tone={colors.text} />
                <Tally
                  label="In the car"
                  value={observed}
                  tone={matches ? colors.success : DANGER}
                />
              </View>
              <Text style={styles.body}>
                {tracked?.stable
                  ? "Count is steady and has been sent to the controller."
                  : "Holding until the count is steady…"}
              </Text>
              {boarding && boarding.attempt > 0 ? (
                <HintRow tone="warning" title="Attempt">
                  {`${boarding.attempt} of ${boarding.maxAttempts} used.`}
                </HintRow>
              ) : null}
            </>
          ) : (
            <>
              <PanelHead
                icon="elevator"
                color={colors.primary}
                title={idleTitle(boarding?.phase)}
                accessory={datasetToggle}
              />
              <Text style={styles.body}>
                {idleBody(boarding?.phase, expected)}
              </Text>
              {ride.error ? (
                <HintRow tone="danger" title="Link">
                  {ride.error}
                </HintRow>
              ) : null}
            </>
          )
        }
      />
    </CameraPermissionGate>
  );
}

function idleTitle(phase: string | undefined): string {
  if (phase === "boarding") return "Boarding";
  if (phase === "cleared") return "Cleared to travel";
  return "Standing by";
}

function idleBody(phase: string | undefined, expected: number): string {
  if (phase === "boarding") {
    return `${expected} verified so far. The count starts when the door closes.`;
  }
  if (phase === "cleared") {
    return "The controller released the car. Counting stops until the next ride.";
  }
  return "Waiting for a verified group to board at the lobby.";
}

function Tally({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <View style={styles.tallyCell}>
      <Text style={styles.tallyLabel}>{label}</Text>
      <Text style={[styles.tallyValue, { color: tone }]}>{value}</Text>
    </View>
  );
}

function PanelHead({
  icon,
  color,
  title,
  accessory,
}: {
  icon: IconName;
  color: string;
  title: string;
  accessory?: ReactNode;
}) {
  return (
    <View style={styles.head}>
      <Icon name={icon} size={20} color={color} />
      <Text style={styles.title}>{title}</Text>
      {accessory}
    </View>
  );
}

function DatasetToggle({
  recordedFrames,
  onPress,
}: {
  recordedFrames: number | null;
  onPress: () => void;
}) {
  const recording = recordedFrames !== null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        recording
          ? `Dataset capture, recording, ${recordedFrames} frames`
          : "Open dataset capture"
      }
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.datasetToggle,
        recording && styles.datasetToggleRecording,
        pressed && styles.headActionPressed,
      ]}
    >
      <Icon
        name={recording ? "record" : "camera"}
        size={14}
        color={recording ? colors.danger : colors.textSecondary}
      />
      <Text
        style={[
          styles.datasetToggleText,
          recording && styles.datasetToggleTextRecording,
        ]}
      >
        {recording ? `REC ${recordedFrames}` : "Dataset"}
      </Text>
    </Pressable>
  );
}

function TrackBox({ box, glideMs }: { box: OverlayBox; glideMs: number }) {
  const x = useSharedValue(box.x);
  const y = useSharedValue(box.y);
  const width = useSharedValue(box.width);
  const height = useSharedValue(box.height);

  useEffect(() => {
    const timing = { duration: glideMs, easing: Easing.linear };
    x.value = withTiming(box.x, timing);
    y.value = withTiming(box.y, timing);
    width.value = withTiming(box.width, timing);
    height.value = withTiming(box.height, timing);
  }, [box.x, box.y, box.width, box.height, glideMs, x, y, width, height]);

  const animatedProps = useAnimatedProps(() => ({
    x: x.value,
    y: y.value,
    width: width.value,
    height: height.value,
  }));

  return (
    <AnimatedRect
      animatedProps={animatedProps}
      fill="none"
      stroke={box.counted ? SUCCESS : "rgba(255,255,255,0.55)"}
      strokeWidth={box.counted ? 3 : 2}
      rx={radius.sm}
    />
  );
}

function buildOverlay(
  tracks: PersonTrack[],
  source: { width: number; height: number } | null,
  viewWidth: number,
  viewHeight: number,
): OverlayBox[] {
  if (!source || source.width <= 0 || source.height <= 0) return [];

  const scale = Math.max(viewWidth / source.width, viewHeight / source.height);
  const renderedWidth = source.width * scale;
  const renderedHeight = source.height * scale;
  const offsetX = (viewWidth - renderedWidth) / 2;
  const offsetY = (viewHeight - renderedHeight) / 2;

  return tracks.map(({ id, view, confirmed }) => ({
    id,
    x: offsetX + view.left * renderedWidth,
    y: offsetY + view.top * renderedHeight,
    width: Math.max(1, (view.right - view.left) * renderedWidth),
    height: Math.max(1, (view.bottom - view.top) * renderedHeight),
    counted: confirmed,
  }));
}

const styles = StyleSheet.create({
  panelWide: {
    alignSelf: "flex-end",
    width: "100%",
    maxWidth: PANEL_MAX_WIDTH,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    color: colors.text,
    ...typography.subheading,
  },
  headAction: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSunken,
  },
  headActionPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.8,
  },
  datasetToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
  },
  datasetToggleRecording: {
    backgroundColor: colors.dangerTint,
    borderColor: "transparent",
  },
  datasetToggleText: {
    color: colors.textSecondary,
    ...typography.caption,
    fontVariant: ["tabular-nums"],
  },
  datasetToggleTextRecording: {
    color: colors.danger,
  },
  datasetActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  datasetPrimary: {
    flex: 1,
  },
  body: {
    color: colors.textSecondary,
    ...typography.body,
  },
  tally: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  tallyCell: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  tallyLabel: {
    color: colors.textMuted,
    ...typography.overline,
    letterSpacing: 0.6,
  },
  tallyValue: {
    color: palette.ink,
    ...typography.display,
  },
  diagnostics: {
    position: "absolute",
    left: spacing.base,
    bottom: spacing.base,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: "rgba(0,0,0,0.55)",
    gap: 2,
  },
  diagnosticsText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
});

export default HumanDetectionScreen;
