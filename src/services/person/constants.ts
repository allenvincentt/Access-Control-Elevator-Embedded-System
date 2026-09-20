export const PERSON_CLASS_INDEX = 0;
export const PERSON_MAX_DETECTIONS = 25;

export type PersonRoi = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export const PERSON_ROI_WIDE: PersonRoi = {
  left: 0.02,
  top: 0.02,
  right: 0.98,
  bottom: 1,
};

export type PersonScopeAnchor = 'centre' | 'foot';

export type PersonScope = {
  anchor: PersonScopeAnchor;
  minScore: number;
  minBoxWidth: number;
  minBoxHeight: number;
  /**
   * Lowest and highest height/width a box may have, **measured in pixels**, not
   * in the fractions the box coordinates use. The detector divides the frame's
   * own aspect back out before comparing, because the camera is locked to
   * landscape and a fraction-of-frame ratio carries that shape with it: an
   * ordinary standing person reads as roughly 7:1 in those units and only about
   * 4:1 in real pixels. Benches and bags fall below the floor; door edges and
   * frame slivers rise above the ceiling.
   */
  minAspect: number;
  maxAspect: number;
  /** Largest share of the frame one person may occupy, as a fraction of frame area. */
  maxArea: number;
};

/**
 * Partial bodies: the anchor is the box centre, so a torso with the feet out of
 * frame still counts. This scope is the one that fires on furniture, so it asks
 * for the higher confidence of the two.
 */
export const PERSON_SCOPE_HALF: PersonScope = {
  anchor: 'centre',
  minScore: 0.45,
  minBoxWidth: 0.035,
  minBoxHeight: 0.12,
  minAspect: 0.9,
  maxAspect: 9,
  maxArea: 0.9,
};

/**
 * Whole bodies standing on the car floor: the anchor is the foot edge. A box
 * this tall with its feet inside the region is far more likely to be a person,
 * so it is allowed a lower score as a safety net in poor light.
 */
export const PERSON_SCOPE_FULL: PersonScope = {
  anchor: 'foot',
  minScore: 0.4,
  minBoxWidth: 0.045,
  minBoxHeight: 0.28,
  minAspect: 0.9,
  maxAspect: 9,
  maxArea: 0.95,
};

export const PERSON_SCOPES: readonly PersonScope[] = [PERSON_SCOPE_HALF, PERSON_SCOPE_FULL];

export const PERSON_DETECTION = {
  pollIntervalMs: 90,
  idlePollIntervalMs: 200,
  frameQuality: 0.45,

  /**
   * Suppression applied on top of the model's own NMS. TFLite_Detection_PostProcess
   * in person-detector.tflite is baked at nms_iou_threshold 0.6 and
   * nms_score_threshold 1e-8, so it keeps every box that overlaps a stronger one by
   * less than 60% and filters on confidence not at all. A person turned sideways
   * yields a torso box and a body box that overlap by roughly 40-55%, which the
   * model happily returns as two detections. These two gates collapse them.
   */
  nmsIouThreshold: 0.45,
  /** Intersection over the smaller box. Catches a part nested inside a whole. */
  containmentThreshold: 0.6,
  /** A merged box may not grow past this multiple of the box that absorbed it. */
  maxMergeGrowth: 1.6,

  iouMatchThreshold: 0.25,
  /** Consecutive frames a new box must survive before it counts as a person. */
  trackConfirmFrames: 2,
  trackMissLimit: 6,
  /** A confirmed track keeps counting through this many missed frames. */
  trackCountGrace: 2,
  /** Two confirmed tracks overlapping this much (over the smaller) are one person. */
  trackOverlapThreshold: 0.55,
  stableFrames: 3,
  detectorFailureLimit: 6,
  reportRetryMs: 1200,

  /**
   * Draws the per-stage detection counts over the camera, so a frame that counts
   * nobody can be traced to the stage that dropped them rather than guessed at.
   * Turn off once the thresholds above are settled for the car.
   */
  showDiagnostics: true,
} as const;

export type PersonModelFailureCode =
  | 'PERSON_MODEL_UNAVAILABLE'
  | 'PERSON_MODEL_MISSING'
  | 'PERSON_MODEL_LOAD_FAILED'
  | 'PERSON_MODEL_UNSUPPORTED';

export type PersonModelFailureCopy = {
  title: string;
  admin: string;
  user: string;
};

export const PERSON_MODEL_FAILURE_MESSAGES: Record<
  PersonModelFailureCode,
  PersonModelFailureCopy
> = {
  PERSON_MODEL_UNAVAILABLE: {
    title: 'Native module missing',
    admin:
      'The react-native-fast-tflite native module is not in this binary. Rebuild with "npx expo run:android". Person detection cannot run in Expo Go.',
    user: 'This device is missing the detection module. Ask facilities to reinstall the app.',
  },
  PERSON_MODEL_MISSING: {
    title: 'Model file could not be read',
    admin:
      'person-detector.tflite could not be resolved from src/assets/models/. Confirm the file exists and that "tflite" is listed in assetExts in metro.config.js, then rebuild.',
    user: 'This device is missing its detection data. Ask facilities to reinstall the app.',
  },
  PERSON_MODEL_LOAD_FAILED: {
    title: 'Model rejected by TFLite',
    admin:
      'person-detector.tflite was found but TFLite refused to parse it. The usual cause is the placeholder file still sitting in src/assets/models/ instead of a real detector. Replace it and rebuild.',
    user: 'This device could not start person detection. Ask facilities to check the installation.',
  },
  PERSON_MODEL_UNSUPPORTED: {
    title: 'Model shape not recognised',
    admin:
      'The model loaded but its tensors do not match the TFLite detection contract (one [1,N,4] box tensor, two [1,N] tensors and a scalar count). Use an SSD MobileNet V2 or EfficientDet-Lite export.',
    user: 'This device could not start person detection. Ask facilities to check the installation.',
  },
};

export type PersonCountCode = 'Starting' | 'Counting' | 'Settled' | 'DetectorUnavailable';
