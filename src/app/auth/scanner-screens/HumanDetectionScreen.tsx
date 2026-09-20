import { CameraView } from "expo-camera";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, { Rect } from "react-native-svg";

import { useSnackbar } from "@/components/common/Snackbar";
import { HintRow } from "@/components/HintRow";
import { CameraPermissionGate } from "@/components/scanner/CameraPermissionGate";
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
  PERSON_ROI,
} from "@/services/person/constants";
import {
  detectPeople,
  discardFile,
  type PersonBox,
} from "@/services/person/detector";
import {
  warmUpPersonModel,
  type PersonModelState,
} from "@/services/person/model";
import { PersonTracker, type TrackedCount } from "@/services/person/tracker";
import { refreshBoarding, watchBoardingOnly } from "@/services/rideSession";

export type HumanDetectionScreenProps = {
  onExit: () => void;
};

type Frame = {
  uri: string;
  width: number;
  height: number;
};

const IDLE_POLL_MS = 150;
const DANGER = "#FF6B60";
const SUCCESS = "#4ADE80";

export function HumanDetectionScreen({ onExit }: HumanDetectionScreenProps) {
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

  const [cameraReady, setCameraReady] = useState(false);
  const [appActive, setAppActive] = useState(true);
  const [model, setModel] = useState<PersonModelState | null>(null);
  const [boxes, setBoxes] = useState<PersonBox[]>([]);
  const [tracked, setTracked] = useState<TrackedCount | null>(null);
  const [source, setSource] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [fault, setFault] = useState<string | null>(null);

  useRideNarration(boarding, true);

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
    };
  }, []);

  useEffect(() => watchBoardingOnly(), []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setAppActive(state === "active");
      if (state !== "active") tracker.current.reset();
    });
    return () => subscription.remove();
  }, []);

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
        ? { uri: photo.uri, width: photo.width, height: photo.height }
        : null;
    } catch {
      return null;
    }
  }, []);

  const monitoring = cameraReady && appActive && model?.ready === true;

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
        if (phaseRef.current !== "counting") {
          if (trackingRef.current) {
            trackingRef.current = false;
            tracker.current.reset();
            setTracked(null);
            setBoxes([]);
          }
          reportedKey.current = null;
          await wait(IDLE_POLL_MS);
          continue;
        }
        trackingRef.current = true;

        const frame = await capture();
        if (cancelled) break;
        if (!frame) {
          await wait(PERSON_DETECTION.pollIntervalMs);
          continue;
        }

        setSource({ width: frame.width, height: frame.height });

        let outcome;
        try {
          outcome = await detectPeople(frame, PERSON_ROI);
        } catch (error) {
          discardFile(frame.uri);
          if (!cancelled && mounted.current) {
            setFault(errorMessage(error, "Person detection failed."));
          }
          break;
        }
        discardFile(frame.uri);
        if (cancelled || !mounted.current) break;

        if (!outcome.ok) {
          detectorMisses.current += 1;
          if (detectorMisses.current >= PERSON_DETECTION.detectorFailureLimit) {
            setFault("The camera could not produce a usable frame.");
            break;
          }
          await wait(PERSON_DETECTION.pollIntervalMs);
          continue;
        }

        detectorMisses.current = 0;
        const next = tracker.current.push(outcome.boxes);
        setBoxes(outcome.boxes);
        setTracked(next);

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

        await wait(PERSON_DETECTION.pollIntervalMs);
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

  const overlay = buildOverlay(boxes, source, viewWidth, viewHeight);

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
        camera={
          <>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="front"
              active={appActive}
              animateShutter={false}
              onCameraReady={() => setCameraReady(true)}
            />
            <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
              <Rect
                x={PERSON_ROI.left * viewWidth}
                y={PERSON_ROI.top * viewHeight}
                width={(PERSON_ROI.right - PERSON_ROI.left) * viewWidth}
                height={(PERSON_ROI.bottom - PERSON_ROI.top) * viewHeight}
                fill="none"
                stroke="rgba(255,255,255,0.45)"
                strokeWidth={2}
                strokeDasharray="10 8"
                rx={radius.lg}
              />
              {overlay.map((box, index) => (
                <Rect
                  key={`${index}-${box.x}-${box.y}`}
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  fill="none"
                  stroke={box.inRoi ? SUCCESS : "rgba(255,255,255,0.4)"}
                  strokeWidth={box.inRoi ? 3 : 2}
                  rx={radius.sm}
                />
              ))}
            </Svg>
          </>
        }
        panel={
          fault || linkFault ? (
            <>
              <PanelHead
                icon="error"
                color={colors.danger}
                title={fault ? "Detector stopped" : "Controller not reporting"}
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
}: {
  icon: IconName;
  color: string;
  title: string;
}) {
  return (
    <View style={styles.head}>
      <Icon name={icon} size={20} color={color} />
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

function buildOverlay(
  boxes: PersonBox[],
  source: { width: number; height: number } | null,
  viewWidth: number,
  viewHeight: number,
) {
  if (!source || source.width <= 0 || source.height <= 0) return [];

  const scale = Math.max(viewWidth / source.width, viewHeight / source.height);
  const renderedWidth = source.width * scale;
  const renderedHeight = source.height * scale;
  const offsetX = (viewWidth - renderedWidth) / 2;
  const offsetY = (viewHeight - renderedHeight) / 2;

  return boxes.map((box) => ({
    x: offsetX + box.left * renderedWidth,
    y: offsetY + box.top * renderedHeight,
    width: Math.max(1, (box.right - box.left) * renderedWidth),
    height: Math.max(1, (box.bottom - box.top) * renderedHeight),
    inRoi: box.inRoi,
  }));
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    ...typography.subheading,
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
});

export default HumanDetectionScreen;
