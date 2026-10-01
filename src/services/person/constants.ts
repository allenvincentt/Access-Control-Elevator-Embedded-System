export const PERSON_CLASS_INDEX = 0;
export const HEAD_CLASS_INDEX = 0;
export const PERSON_MAX_DETECTIONS = 25;

export type PersonModelKind = 'ssd' | 'yolo';
export type PersonTarget = 'person' | 'head';

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
  sustainScore: number;
  minBoxWidth: number;
  minBoxHeight: number;
  minAspect: number;
  maxAspect: number;
  maxArea: number;
};

export const PERSON_SCOPE_HALF: PersonScope = {
  anchor: 'centre',
  minScore: 0.45,
  sustainScore: 0.25,
  minBoxWidth: 0.035,
  minBoxHeight: 0.12,
  minAspect: 0.9,
  maxAspect: 9,
  maxArea: 0.9,
};

export const PERSON_SCOPE_FULL: PersonScope = {
  anchor: 'foot',
  minScore: 0.4,
  sustainScore: 0.25,
  minBoxWidth: 0.045,
  minBoxHeight: 0.28,
  minAspect: 0.9,
  maxAspect: 9,
  maxArea: 0.95,
};

export const PERSON_ROI_OVERHEAD: PersonRoi = {
  left: 0,
  top: 0,
  right: 1,
  bottom: 1,
};

export const PERSON_SCOPE_OVERHEAD: PersonScope = {
  anchor: 'centre',
  minScore: 0.35,
  sustainScore: 0.25,
  minBoxWidth: 0.04,
  minBoxHeight: 0.06,
  minAspect: 0.33,
  maxAspect: 3,
  maxArea: 0.5,
};

export const PERSON_SCOPE_HEAD: PersonScope = {
  anchor: 'centre',
  minScore: 0.5,
  sustainScore: 0.3,
  minBoxWidth: 0.015,
  minBoxHeight: 0.02,
  minAspect: 0.5,
  maxAspect: 2,
  maxArea: 0.15,
};

export const PERSON_SCOPES: readonly PersonScope[] = [PERSON_SCOPE_OVERHEAD];

export const PERSON_SCOPES_BY_TARGET: Record<PersonTarget, readonly PersonScope[]> = {
  person: PERSON_SCOPES,
  head: [PERSON_SCOPE_HEAD],
};

export const PERSON_DETECTION = {
  pollIntervalMs: 90,
  idlePollIntervalMs: 200,
  frameQuality: 0.45,
  pictureSize: '1280x960',

  nmsIouThreshold: 0.45,
  containmentThreshold: 0.8,
  maxMergeGrowth: 1.6,

  groupMemberMinShare: 0.2,
  groupSplitOverlap: 0.3,

  yoloNmsIouThreshold: 0.5,
  yoloDuplicateIou: 0.6,

  iouMatchThreshold: 0.25,
  trackCentreMatch: 0.6,
  trackReacquireCentre: 1.2,
  trackCentreFloor: 0.06,
  trackConfirmFrames: 3,
  trackForgetMs: 5000,
  trackCountGraceMs: 2500,
  trackOverlapThreshold: 0.8,
  stableFrames: 3,
  detectorFailureLimit: 6,
  reportRetryMs: 1200,

  boxSmoothingFloor: 0.45,
  boxFollowGain: 2.5,
  boxGlideMinMs: 80,
  boxGlideMaxMs: 600,

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
      'The model loaded but its tensors match neither supported contract: an SSD-style export with TFLite_Detection_PostProcess (one [1,N,4] box tensor, two [1,N] tensors and a scalar count), or a YOLO export with a single float32 [1,4+classes,N] output. Run "npm run verify-person-model" on the file.',
    user: 'This device could not start person detection. Ask facilities to check the installation.',
  },
};

export type PersonCountCode = 'Starting' | 'Counting' | 'Settled' | 'DetectorUnavailable';
