import { CameraView } from "expo-camera";
import * as ScreenOrientation from "expo-screen-orientation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Circle, Rect } from "react-native-svg";

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
  shadow,
  spacing,
  typography,
} from "@/constants/themeColor";
import { useRideNarration } from "@/hooks/useRideNarration";
import { useRideSession } from "@/hooks/useRideSession";
import { errorMessage } from "@/lib/errors";
import { reportOccupancy } from "@/services/elevatorService";
import {
  OVERHEAD_CAMERA,
  OVERHEAD_MODEL_FAILURES,
  OVERHEAD_MODEL_NAME,
} from "@/services/overhead/constants";
import {
  CountSmoother,
  StableCounter,
  UniqueCounter,
} from "@/services/overhead/counter";
import {
  deleteFrame,
  detectPeople,
  type CameraFrame,
} from "@/services/overhead/detector";
import {
  warmUpOverheadModel,
  type OverheadModelState,
} from "@/services/overhead/model";
import { ByteTracker, type TrackedPerson } from "@/services/overhead/tracker";
import { refreshBoarding, watchBoardingOnly } from "@/services/rideSession";

export type HumanDetectionScreenProps = {
  onExit: () => void;
};

type Reading = {
  people: number;
  raw: number;
  unique: number;
  fps: number;
  stable: boolean;
  persons: TrackedPerson[];
  source: { width: number; height: number };
};

type DrawnBox = {
  id: number;
  label: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const DANGER = "#FF6B60";
const SUCCESS = "#4ADE80";
const WARNING = "#FBBF24";
const PANEL_MAX_WIDTH = 380;
const LABEL_HEIGHT = 18;
const INK = "rgb(20,20,20)";

export function HumanDetectionScreen({ onExit }: HumanDetectionScreenProps) {
  const snackbar = useSnackbar();
  const { width: viewWidth, height: viewHeight } = useWindowDimensions();
  const ride = useRideSession();
  const boarding = ride.boarding;
  const linkFault = ride.boardingError;
  const linkCheck = ride.boardingCheck;

  const cameraRef = useRef<CameraView>(null);
  const mounted = useRef(true);
  const tracker = useRef(new ByteTracker());
  const smoother = useRef(new CountSmoother());
  const unique = useRef(new UniqueCounter());
  const steadiness = useRef(new StableCounter());
  const fpsRef = useRef(0);
  const lastFrameAt = useRef(0);
  const phaseRef = useRef<string>("idle");
  const attemptRef = useRef(0);
  const faultSeqRef = useRef(0);
  const reportedKey = useRef<string | null>(null);
  const reportedAt = useRef(0);
  const misses = useRef(0);

  const [cameraReady, setCameraReady] = useState(false);
  const [appActive, setAppActive] = useState(true);
  const [landscape, setLandscape] = useState(false);
  const [model, setModel] = useState<OverheadModelState | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [fault, setFault] = useState<string | null>(null);

  useRideNarration(boarding, true);

  const resetCounting = useCallback(() => {
    tracker.current.reset();
    smoother.current.reset();
    unique.current.reset();
    steadiness.current.reset();
    fpsRef.current = 0;
    lastFrameAt.current = 0;
    reportedKey.current = null;
  }, []);

  useEffect(() => {
    phaseRef.current = boarding?.phase ?? "idle";
    attemptRef.current = boarding?.attempt ?? 0;
    faultSeqRef.current = boarding?.faultSeq ?? 0;
  }, [boarding]);

  useEffect(() => {
    mounted.current = true;
    warmUpOverheadModel().then((state) => {
      if (mounted.current) setModel(state);
    });
    return () => {
      mounted.current = false;
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
      if (state !== "active") resetCounting();
    });
    return () => subscription.remove();
  }, [resetCounting]);

  const capture = useCallback(async (): Promise<CameraFrame | null> => {
    const camera = cameraRef.current;
    if (!camera) return null;
    try {
      const photo = await camera.takePictureAsync({
        quality: OVERHEAD_CAMERA.frameQuality,
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

  const monitoring =
    cameraReady && appActive && landscape && model?.ready === true;

  useEffect(() => {
    if (!monitoring) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let wasCounting = false;
    lastFrameAt.current = 0;

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      });

    const loop = async () => {
      while (!cancelled) {
        const counting = phaseRef.current === "counting";
        const interval = counting
          ? OVERHEAD_CAMERA.pollIntervalMs
          : OVERHEAD_CAMERA.idlePollIntervalMs;

        if (counting !== wasCounting) {
          wasCounting = counting;
          reportedKey.current = null;
        }

        const frame = await capture();
        if (cancelled) break;
        if (!frame) {
          await wait(interval);
          continue;
        }

        let result;
        try {
          result = await detectPeople(frame);
        } catch (error) {
          deleteFrame(frame.uri);
          if (!cancelled && mounted.current) {
            setFault(errorMessage(error, "Human detection failed."));
          }
          break;
        }
        deleteFrame(frame.uri);
        if (cancelled || !mounted.current) break;

        if (!result.ok) {
          misses.current += 1;
          if (misses.current >= OVERHEAD_CAMERA.failureLimit) {
            setFault("The camera could not produce a usable frame.");
            break;
          }
          await wait(interval);
          continue;
        }
        misses.current = 0;

        const persons = tracker.current.update(result.detections);
        const people = smoother.current.update(persons.length);
        unique.current.update(persons);
        const stable = steadiness.current.update(people);

        const now = Date.now();
        if (lastFrameAt.current > 0) {
          const instant = 1000 / Math.max(now - lastFrameAt.current, 1);
          fpsRef.current = 0.9 * fpsRef.current + 0.1 * instant;
        }
        lastFrameAt.current = now;

        setReading({
          people,
          raw: persons.length,
          unique: unique.current.total,
          fps: fpsRef.current,
          stable,
          persons,
          source: { width: frame.width, height: frame.height },
        });

        if (!counting) {
          await wait(interval);
          continue;
        }

        const key = `${attemptRef.current}-${faultSeqRef.current}-${people}`;
        const stale =
          Date.now() - reportedAt.current >= OVERHEAD_CAMERA.reportRetryMs;
        if ((people > 0 || stable) && (reportedKey.current !== key || stale)) {
          reportedKey.current = key;
          reportedAt.current = Date.now();
          try {
            await reportOccupancy(people);
          } catch (error) {
            if (mounted.current) {
              snackbar.show(
                errorMessage(error, "The count could not be sent."),
                { variant: "error" },
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
  const observed = reading?.people ?? 0;
  const matches = counting && observed === expected;
  const boxes = layoutBoxes(reading, viewWidth, viewHeight);
  const wide = viewWidth > viewHeight;
  const compact = !fault && !linkFault;

  if (model && !model.ready) {
    const copy = OVERHEAD_MODEL_FAILURES[model.failure];
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
        panelStyle={
          compact ? styles.panelCompact : wide ? styles.panelWide : undefined
        }
        camera={
          <>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              active={appActive}
              animateShutter={false}
              pictureSize={OVERHEAD_CAMERA.pictureSize}
              onCameraReady={() => setCameraReady(true)}
            />
            <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
              {boxes.map((box) => (
                <Rect
                  key={`box-${box.id}`}
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  fill="none"
                  stroke={box.color}
                  strokeWidth={2}
                />
              ))}
              {boxes.map((box) => (
                <Circle
                  key={`dot-${box.id}`}
                  cx={box.x + box.width / 2}
                  cy={box.y + box.height / 2}
                  r={4}
                  fill={box.color}
                />
              ))}
            </Svg>
            {boxes.map((box) => (
              <View
                key={`label-${box.id}`}
                pointerEvents="none"
                style={[
                  styles.label,
                  {
                    left: box.x,
                    top: Math.max(0, box.y - LABEL_HEIGHT),
                    backgroundColor: box.color,
                  },
                ]}
              >
                <Text style={styles.labelText}>{box.label}</Text>
              </View>
            ))}
            {reading ? (
              <View style={styles.stats} pointerEvents="none">
                <Text style={styles.statsText}>{`People: ${reading.people}`}</Text>
                <Text style={styles.statsText}>
                  {`Raw: ${reading.raw}  Unique: ${reading.unique}`}
                </Text>
                <Text style={styles.statsText}>
                  {`FPS: ${reading.fps.toFixed(1)}  Model: ${OVERHEAD_MODEL_NAME}`}
                </Text>
              </View>
            ) : null}
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
                  misses.current = 0;
                  resetCounting();
                  setReading(null);
                  setFault(null);
                  void refreshBoarding();
                }}
              />
            </>
          ) : counting ? (
            <>
              <View style={styles.compactHead}>
                <Icon
                  name={matches ? "checkCircle" : "person"}
                  size={12}
                  color={matches ? SUCCESS : palette.white}
                />
                <Text style={styles.compactTitle}>
                  {matches ? "Occupancy matches" : "Counting…"}
                </Text>
              </View>
              <Text style={styles.compactText}>
                {"Verified "}
                <Text style={styles.compactValue}>{expected}</Text>
                {"  ·  In the car "}
                <Text
                  style={[
                    styles.compactValue,
                    { color: matches ? SUCCESS : DANGER },
                  ]}
                >
                  {observed}
                </Text>
              </Text>
              <Text style={styles.compactText}>
                {reading?.stable
                  ? "Count is steady and has been sent to the controller."
                  : "Holding until the count is steady…"}
              </Text>
              {boarding && boarding.attempt > 0 ? (
                <Text style={[styles.compactText, styles.compactWarning]}>
                  {`Attempt ${boarding.attempt} of ${boarding.maxAttempts} used.`}
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <View style={styles.compactHead}>
                <Icon name="elevator" size={12} color={palette.white} />
                <Text style={styles.compactTitle}>
                  {idleTitle(boarding?.phase)}
                </Text>
              </View>
              <Text style={styles.compactText}>
                {idleBody(boarding?.phase, expected)}
              </Text>
              {boarding?.phase === "boarding" && boarding.attempt > 0 ? (
                <Text style={[styles.compactText, styles.compactWarning]}>
                  {`Last count did not match. Attempt ${boarding.attempt} of ${boarding.maxAttempts} used.`}
                </Text>
              ) : null}
              {ride.error ? (
                <Text style={[styles.compactText, styles.compactError]}>
                  {ride.error}
                </Text>
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
  if (phase === "verifying") return "Checking faces";
  if (phase === "cleared") return "Cleared to travel";
  return "Standing by";
}

function idleBody(phase: string | undefined, expected: number): string {
  if (phase === "boarding") {
    return `${expected} scanned so far. Pick a floor, then press the door button to start the face check.`;
  }
  if (phase === "verifying") {
    return `The door is closed. Counting starts once all ${expected} rider${expected === 1 ? "" : "s"} confirm their faces on the scanner.`;
  }
  if (phase === "cleared") {
    return "The controller released the car. Counting stops until the next ride.";
  }
  return "Waiting for a verified group to board at the lobby.";
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

function trackColor(id: number): string {
  return `rgb(${(id * 151) % 255},${(id * 91) % 255},${(id * 47) % 255})`;
}

function layoutBoxes(
  reading: Reading | null,
  viewWidth: number,
  viewHeight: number,
): DrawnBox[] {
  if (!reading) return [];
  const { width, height } = reading.source;
  if (width <= 0 || height <= 0) return [];

  const scale = Math.max(viewWidth / width, viewHeight / height);
  const shownWidth = width * scale;
  const shownHeight = height * scale;
  const offsetX = (viewWidth - shownWidth) / 2;
  const offsetY = (viewHeight - shownHeight) / 2;

  return reading.persons.map(({ id, box, score }) => ({
    id,
    label: `#${id} ${score.toFixed(2)}`,
    color: trackColor(id),
    x: offsetX + box.left * shownWidth,
    y: offsetY + box.top * shownHeight,
    width: Math.max(1, (box.right - box.left) * shownWidth),
    height: Math.max(1, (box.bottom - box.top) * shownHeight),
  }));
}

const styles = StyleSheet.create({
  panelWide: {
    alignSelf: "flex-end",
    width: "100%",
    maxWidth: PANEL_MAX_WIDTH,
  },
  panelCompact: {
    alignSelf: "flex-end",
    maxWidth: 260,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: "rgba(0,0,0,0.55)",
    gap: 2,
    ...shadow.none,
  },
  compactHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  compactTitle: {
    color: palette.white,
    fontSize: 12,
    fontWeight: "600",
  },
  compactText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
  },
  compactValue: {
    color: palette.white,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  compactError: {
    color: DANGER,
  },
  compactWarning: {
    color: WARNING,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    ...typography.subheading,
  },
  label: {
    position: "absolute",
    height: LABEL_HEIGHT,
    paddingHorizontal: 4,
    justifyContent: "center",
  },
  labelText: {
    color: INK,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  stats: {
    position: "absolute",
    left: spacing.base,
    bottom: spacing.base,
    paddingVertical: spacing.sm,
    paddingHorizontal: 10,
    backgroundColor: "rgba(20,20,20,0.6)",
    gap: 4,
  },
  statsText: {
    color: palette.white,
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});

export default HumanDetectionScreen;
