export const OVERHEAD_MODEL_NAME = 'top-n';

export const OVERHEAD_DETECTION = {
  confidence: 0.35,
  nmsIou: 0.65,
  maxDetections: 100,
  letterboxFill: 114,
  personClass: 0,
} as const;

export const OVERHEAD_TRACKING = {
  newTrackScore: 0.25,
  matchThreshold: 0.8,
  unconfirmedMatchThreshold: 0.7,
  lostBufferFrames: 30,
  duplicateIou: 0.85,
  velocityGain: 0.5,
} as const;

export const OVERHEAD_COUNTING = {
  smoothWindow: 9,
  uniqueMinFrames: 5,
  stableFrames: 3,
} as const;

export const OVERHEAD_CAMERA = {
  pollIntervalMs: 90,
  idlePollIntervalMs: 200,
  frameQuality: 0.45,
  pictureSize: '1280x960',
  failureLimit: 6,
  reportRetryMs: 1200,
} as const;

export type OverheadModelFailure =
  | 'OVERHEAD_MODEL_UNAVAILABLE'
  | 'OVERHEAD_MODEL_MISSING'
  | 'OVERHEAD_MODEL_LOAD_FAILED'
  | 'OVERHEAD_MODEL_UNSUPPORTED';

export const OVERHEAD_MODEL_FAILURES: Record<
  OverheadModelFailure,
  { title: string; admin: string }
> = {
  OVERHEAD_MODEL_UNAVAILABLE: {
    title: 'Native module missing',
    admin:
      'The react-native-fast-tflite native module is not in this binary. Rebuild with "npx expo run:android". Human detection cannot run in Expo Go.',
  },
  OVERHEAD_MODEL_MISSING: {
    title: 'Model file could not be read',
    admin:
      'person-detector.tflite could not be resolved from src/assets/models/. Confirm the file exists and that "tflite" is listed in assetExts in metro.config.js, then rebuild.',
  },
  OVERHEAD_MODEL_LOAD_FAILED: {
    title: 'Model rejected by TFLite',
    admin:
      'person-detector.tflite was found but TFLite refused to parse it. Replace it with the float32 export from HumanDetectionModel and rebuild.',
  },
  OVERHEAD_MODEL_UNSUPPORTED: {
    title: 'Model shape not recognised',
    admin:
      'The model must take one square float32 image and return one float32 [1, 4+classes, N] YOLO tensor. Run "npm run verify-person-model" on the file.',
  },
};
