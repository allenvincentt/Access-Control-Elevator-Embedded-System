export const PERSON_CLASS_INDEX = 0;
export const PERSON_MAX_DETECTIONS = 25;

export type PersonRoi = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export const PERSON_ROI: PersonRoi = {
  left: 0.04,
  top: 0.04,
  right: 0.96,
  bottom: 0.98,
};

export const PERSON_DETECTION = {
  minScore: 0.5,
  minBoxWidth: 0.04,
  minBoxHeight: 0.1,
  pollIntervalMs: 350,
  frameQuality: 0.6,
  iouMatchThreshold: 0.3,
  trackConfirmFrames: 2,
  trackMissLimit: 3,
  stableFrames: 4,
  detectorFailureLimit: 6,
  reportRetryMs: 1500,
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
