import { FACE_PRESENCE, FACE_TRACKING, type PresenceCode } from '@/services/face/constants';
import type { PresenceSample } from '@/services/face/presence';

export type TrackedPresence = {
  code: PresenceCode;
  ready: boolean;
  progress: number;
  present: boolean;
  crowded: boolean;
  steady: boolean;
  widthRatio: number;
  geometryScore: number;
  proximity: number;
  alignment: number;
  samples: number;
};

type SmoothedTrack = {
  widthRatio: number;
  centreX: number;
  centreY: number;
  offsetX: number;
  offsetY: number;
  yaw: number;
  pitch: number;
  roll: number;
  geometryScore: number;
  eyesOpen: boolean | null;
};

type Centre = { x: number; y: number };

export class PresenceTracker {
  private window: PresenceSample[] = [];
  private readyConfidence = 0;
  private crowdConfidence = 0;
  private absentConfidence = 0;
  private locked = false;
  private steady = false;
  private crowdedNow = false;
  private gate: PresenceCode = 'NoPerson';
  private trackCentre: Centre | null = null;
  private pendingCentre: Centre | null = null;
  private pendingFrames = 0;

  reset() {
    this.forget();
    this.crowdConfidence = 0;
    this.absentConfidence = 0;
  }

  push(sample: PresenceSample): TrackedPresence {
    if (sample.detectorFailed) {
      return this.snapshot();
    }

    this.crowdedNow = sample.crowded;
    this.crowdConfidence = sample.crowded
      ? Math.min(FACE_TRACKING.crowdTarget + 1, this.crowdConfidence + 1)
      : Math.max(0, this.crowdConfidence - 1);

    if (!sample.present) {
      this.absentConfidence = Math.min(
        FACE_TRACKING.absentTarget + 1,
        this.absentConfidence + 1,
      );
      if (this.absentConfidence >= FACE_TRACKING.absentTarget) {
        this.forget();
      } else {
        this.readyConfidence = Math.max(0, this.readyConfidence - 1);
      }
      return this.snapshot();
    }

    this.absentConfidence = Math.max(0, this.absentConfidence - 1);

    if (!this.associate(sample)) {
      this.readyConfidence = Math.max(0, this.readyConfidence - 1);
      return this.snapshot();
    }

    this.window.push(sample);
    if (this.window.length > FACE_TRACKING.windowSize) {
      this.window.shift();
    }

    const smoothed = this.smooth();
    if (!smoothed) {
      return this.snapshot();
    }

    this.updateLock(smoothed.geometryScore);
    this.gate = this.classify(smoothed);
    this.steady = this.steadyOverWindow(smoothed);

    const blocked = this.crowdConfidence >= FACE_TRACKING.crowdTarget;
    const qualified = !blocked && !sample.crowded && this.gate === 'Ready';

    if (!qualified) {
      this.readyConfidence = Math.max(0, this.readyConfidence - 1);
    } else if (this.steady) {
      this.readyConfidence = Math.min(FACE_TRACKING.readyTarget, this.readyConfidence + 1);
    } else {
      this.readyConfidence = Math.max(this.readyConfidence, 1);
    }

    return this.snapshot();
  }

  private forget() {
    this.window = [];
    this.readyConfidence = 0;
    this.locked = false;
    this.steady = false;
    this.crowdedNow = false;
    this.gate = 'NoPerson';
    this.trackCentre = null;
    this.pendingCentre = null;
    this.pendingFrames = 0;
  }

  private associate(sample: PresenceSample) {
    const centre: Centre = { x: sample.centreX, y: sample.centreY };

    if (!this.trackCentre) {
      this.adopt(centre);
      return true;
    }

    if (distance(centre, this.trackCentre) <= FACE_TRACKING.associationMaxDistance) {
      this.pendingCentre = null;
      this.pendingFrames = 0;
      this.trackCentre = {
        x: this.trackCentre.x + 0.45 * (centre.x - this.trackCentre.x),
        y: this.trackCentre.y + 0.45 * (centre.y - this.trackCentre.y),
      };
      return true;
    }

    const consistent =
      this.pendingCentre !== null &&
      distance(centre, this.pendingCentre) <= FACE_TRACKING.associationMaxDistance;

    this.pendingCentre = centre;
    this.pendingFrames = consistent ? this.pendingFrames + 1 : 1;

    if (this.pendingFrames >= FACE_TRACKING.adoptionFrames) {
      this.adopt(centre);
      return true;
    }

    return false;
  }

  private adopt(centre: Centre) {
    this.window = [];
    this.readyConfidence = 0;
    this.locked = false;
    this.steady = false;
    this.gate = 'NoPerson';
    this.trackCentre = centre;
    this.pendingCentre = null;
    this.pendingFrames = 0;
  }

  private smooth(): SmoothedTrack | null {
    if (!this.window.length) return null;

    return {
      widthRatio: median(this.window.map((sample) => sample.widthRatio)),
      centreX: median(this.window.map((sample) => sample.centreX)),
      centreY: median(this.window.map((sample) => sample.centreY)),
      offsetX: median(this.window.map((sample) => sample.offsetX)),
      offsetY: median(this.window.map((sample) => sample.offsetY)),
      yaw: median(this.window.map((sample) => sample.yaw)),
      pitch: median(this.window.map((sample) => sample.pitch)),
      roll: median(this.window.map((sample) => sample.roll)),
      geometryScore: median(this.window.map((sample) => sample.geometryScore)),
      eyesOpen: majorityEyesOpen(this.window),
    };
  }

  private updateLock(score: number) {
    if (!this.locked && score >= FACE_PRESENCE.readyEnterScore) {
      this.locked = true;
    } else if (this.locked && score < FACE_PRESENCE.readyExitScore) {
      this.locked = false;
    }
  }

  private classify(smoothed: SmoothedTrack): PresenceCode {
    if (smoothed.widthRatio < FACE_PRESENCE.minWidthRatio) return 'TooFar';
    if (smoothed.widthRatio > FACE_PRESENCE.maxWidthRatio) return 'TooClose';
    if (
      smoothed.offsetX > FACE_PRESENCE.maxOffsetXRatio ||
      smoothed.offsetY > FACE_PRESENCE.maxOffsetYRatio
    ) {
      return 'OffCentre';
    }
    if (
      smoothed.yaw > FACE_PRESENCE.maxYawDegrees ||
      smoothed.pitch > FACE_PRESENCE.maxPitchDegrees ||
      smoothed.roll > FACE_PRESENCE.maxRollDegrees
    ) {
      return 'HeadTurned';
    }
    if (smoothed.eyesOpen === false) return 'EyesClosed';
    if (!this.locked) return weakestAxis(smoothed);
    return 'Ready';
  }

  private steadyOverWindow(smoothed: SmoothedTrack) {
    if (this.window.length < FACE_TRACKING.minSteadySamples) return false;

    const drifts = this.window.map((sample) =>
      distance({ x: sample.centreX, y: sample.centreY }, { x: smoothed.centreX, y: smoothed.centreY }),
    );
    if (median(drifts) > FACE_TRACKING.steadyCentreDelta) return false;

    const reference = Math.max(0.01, smoothed.widthRatio);
    const scales = this.window.map(
      (sample) => Math.abs(sample.widthRatio - smoothed.widthRatio) / reference,
    );
    if (median(scales) > FACE_TRACKING.steadyScaleDelta) return false;

    const current = this.window[this.window.length - 1];
    const jump = distance(
      { x: current.centreX, y: current.centreY },
      { x: smoothed.centreX, y: smoothed.centreY },
    );
    if (jump > FACE_TRACKING.rawCentreDelta) return false;

    return Math.abs(current.widthRatio - smoothed.widthRatio) / reference <=
      FACE_TRACKING.rawScaleDelta;
  }

  private snapshot(): TrackedPresence {
    const smoothed = this.smooth();
    const blocked = this.crowdConfidence >= FACE_TRACKING.crowdTarget;
    const present = smoothed !== null && this.absentConfidence < FACE_TRACKING.absentTarget;
    const gate = present ? this.gate : 'NoPerson';

    return {
      code: blocked && present ? 'Crowded' : gate,
      ready:
        present &&
        !blocked &&
        !this.crowdedNow &&
        this.gate === 'Ready' &&
        this.steady &&
        this.readyConfidence >= FACE_TRACKING.readyTarget,
      progress: Math.min(1, this.readyConfidence / FACE_TRACKING.readyTarget),
      present,
      crowded: blocked,
      steady: this.steady,
      widthRatio: smoothed?.widthRatio ?? 0,
      geometryScore: smoothed?.geometryScore ?? 0,
      proximity: clamp01((smoothed?.widthRatio ?? 0) / FACE_PRESENCE.idealWidthRatio),
      alignment: smoothed
        ? clamp01(
            1 -
              Math.max(
                smoothed.offsetX / FACE_PRESENCE.maxOffsetXRatio,
                smoothed.offsetY / FACE_PRESENCE.maxOffsetYRatio,
              ),
          )
        : 0,
      samples: this.window.length,
    };
  }
}

function weakestAxis(smoothed: SmoothedTrack): PresenceCode {
  const framing = Math.max(
    smoothed.offsetX / FACE_PRESENCE.maxOffsetXRatio,
    smoothed.offsetY / FACE_PRESENCE.maxOffsetYRatio,
  );
  return framing > 0.6 ? 'OffCentre' : 'HeadTurned';
}

function majorityEyesOpen(samples: PresenceSample[]): boolean | null {
  let open = 0;
  let closed = 0;
  for (const sample of samples) {
    if (sample.eyesOpen === true) open += 1;
    else if (sample.eyesOpen === false) closed += 1;
  }
  if (!open && !closed) return null;
  return open >= closed;
}

function distance(a: Centre, b: Centre) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
