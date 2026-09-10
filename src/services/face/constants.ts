export const FACE_MODEL_VERSION = 'mobilefacenet-112x112-192d-v1';
export const FACE_INPUT_SIZE = 112;
export const FACE_EMBEDDING_SIZE = 192;
export const ENROLLMENT_SAMPLE_COUNT = 3;

export type FaceQualityGates = {
  detectorMinFaceSize: number;
  bystanderMinWidthRatio: number;
  minFaceWidthRatio: number;
  idealFaceWidthRatio: number;
  maxFaceWidthRatio: number;
  maxCenterOffsetRatio: number;
  maxYawDegrees: number;
  maxPitchDegrees: number;
  maxRollDegrees: number;
  minEyeOpenProbability: number;
  minMeanLuma: number;
  maxMeanLuma: number;
  minLumaSpread: number;
  minSharpness: number;
  targetSharpness: number;
  cropMarginRatio: number;
};

export const FACE_QUALITY_GATES: FaceQualityGates = {
  detectorMinFaceSize: 0.15,
  bystanderMinWidthRatio: 0,
  minFaceWidthRatio: 0.18,
  idealFaceWidthRatio: 0.45,
  maxFaceWidthRatio: 0.9,
  maxCenterOffsetRatio: 0.28,
  maxYawDegrees: 16,
  maxPitchDegrees: 16,
  maxRollDegrees: 12,
  minEyeOpenProbability: 0.35,
  minMeanLuma: 55,
  maxMeanLuma: 218,
  minLumaSpread: 22,
  minSharpness: 18,
  targetSharpness: 120,
  cropMarginRatio: 0.28,
};

export const FACE_TERMINAL_GATES: FaceQualityGates = {
  detectorMinFaceSize: 0.06,
  bystanderMinWidthRatio: 0.085,
  minFaceWidthRatio: 0.11,
  idealFaceWidthRatio: 0.22,
  maxFaceWidthRatio: 0.6,
  maxCenterOffsetRatio: 0.3,
  maxYawDegrees: 30,
  maxPitchDegrees: 28,
  maxRollDegrees: 26,
  minEyeOpenProbability: 0.22,
  minMeanLuma: 42,
  maxMeanLuma: 226,
  minLumaSpread: 16,
  minSharpness: 10,
  targetSharpness: 95,
  cropMarginRatio: 0.3,
};

export const FACE_PRESENCE = {
  detectorMinFaceSize: FACE_TERMINAL_GATES.detectorMinFaceSize,
  bystanderMinWidthRatio: FACE_TERMINAL_GATES.bystanderMinWidthRatio,
  minWidthRatio: 0.13,
  idealWidthRatio: FACE_TERMINAL_GATES.idealFaceWidthRatio,
  maxWidthRatio: 0.5,
  maxOffsetXRatio: 0.24,
  maxOffsetYRatio: 0.24,
  maxYawDegrees: 26,
  maxPitchDegrees: 24,
  maxRollDegrees: 22,
  minEyeOpenProbability: 0.3,
  minGeometryScore: 0.62,
  steadyCentreDelta: 0.055,
  steadyScaleDelta: 0.22,
  readyStreakTarget: 3,
  pollIntervalMs: 220,
  lostPersonPollMs: 500,
  deniedHoldMs: 3200,
  guidanceHoldMs: 1500,
  grantedHoldMs: 900,
  autoAttemptLimit: 3,
} as const;

export type PresenceCode =
  | 'NoPerson'
  | 'Crowded'
  | 'TooFar'
  | 'TooClose'
  | 'OffCentre'
  | 'HeadTurned'
  | 'EyesClosed'
  | 'Ready'
  | 'DetectorUnavailable';

export type PresenceCopy = {
  caption: string;
  detail: string;
};

export const FACE_PRESENCE_MESSAGES: Record<PresenceCode, PresenceCopy> = {
  NoPerson: {
    caption: 'Step up to scan',
    detail: 'The scanner is watching the door. Walk up and look at the screen.',
  },
  Crowded: {
    caption: 'One person at a time',
    detail: 'Please step away from the scanner so only the person entering is in front of it.',
  },
  TooFar: {
    caption: 'Move closer',
    detail: 'Stand a little closer to the display.',
  },
  TooClose: {
    caption: 'Step back',
    detail: 'Move back slightly so your whole face fits in the circle.',
  },
  OffCentre: {
    caption: 'Position your face inside the circle',
    detail: 'Line your face up with the circle on the screen.',
  },
  HeadTurned: {
    caption: 'Look straight at the scanner',
    detail: 'Face the screen without turning or tilting your head.',
  },
  EyesClosed: {
    caption: 'Look at the scanner',
    detail: 'Keep both eyes open and look at the screen.',
  },
  Ready: {
    caption: 'Hold still…',
    detail: 'Stay where you are while the scanner reads your face.',
  },
  DetectorUnavailable: {
    caption: 'Scanner unavailable',
    detail: 'Face detection could not start on this device. Ask facilities to check the terminal.',
  },
};

export type FaceQualityIssue =
  | 'NoFaceDetected'
  | 'MultipleFaces'
  | 'FaceTooSmall'
  | 'FaceTooClose'
  | 'FaceOffCentre'
  | 'HeadTurned'
  | 'HeadTilted'
  | 'EyesClosed'
  | 'PoorLighting'
  | 'Blurry'
  | 'ModelUnavailable'
  | 'CaptureFailed';

export const FACE_ISSUE_MESSAGES: Record<FaceQualityIssue, string> = {
  NoFaceDetected: 'No face detected. Centre the face in the oval and hold still.',
  MultipleFaces: 'More than one face is in frame. Only the person being verified should be visible.',
  FaceTooSmall: 'Move closer so the face fills more of the oval.',
  FaceTooClose: 'Move back slightly so the whole face fits inside the oval.',
  FaceOffCentre: 'Centre the face inside the oval.',
  HeadTurned: 'Look straight at the camera without turning the head.',
  HeadTilted: 'Hold the head upright without tilting it.',
  EyesClosed: 'Keep both eyes open and look at the camera.',
  PoorLighting: 'Lighting is too dark or too harsh. Move to evenly lit surroundings.',
  Blurry: 'The capture was blurry. Hold the phone steady and try again.',
  ModelUnavailable: 'The face recognition model is not available on this build.',
  CaptureFailed: 'The camera could not produce a usable frame. Try again.',
};

export const FACE_TERMINAL_ISSUE_MESSAGES: Record<FaceQualityIssue, string> = {
  ...FACE_ISSUE_MESSAGES,
  NoFaceDetected: 'You moved out of the circle. Step back in front of the scanner.',
  MultipleFaces: 'Another person stepped into frame. One person at a time.',
  FaceTooSmall: 'Move closer to the scanner.',
  FaceTooClose: 'Step back a little from the scanner.',
  FaceOffCentre: 'Position your face inside the circle.',
  HeadTurned: 'Look straight at the scanner.',
  HeadTilted: 'Hold your head upright and look at the scanner.',
  EyesClosed: 'Keep both eyes open and look at the scanner.',
  PoorLighting: 'The light at the door is too dark or too harsh to read your face.',
  Blurry: 'You moved while the scanner read your face. Hold still.',
  CaptureFailed: 'The camera could not read that frame. Hold still and stay in the circle.',
};

export type FaceModelFailureCode =
  | 'FACE_MODEL_UNAVAILABLE'
  | 'FACE_MODEL_MISSING'
  | 'FACE_MODEL_LOAD_FAILED';

export type FaceModelFailureCopy = {
  title: string;
  admin: string;
  user: string;
};

export const FACE_MODEL_FAILURE_MESSAGES: Record<FaceModelFailureCode, FaceModelFailureCopy> = {
  FACE_MODEL_UNAVAILABLE: {
    title: 'Native module missing',
    admin:
      'The react-native-fast-tflite native module is not in this binary, so no model can be loaded. Rebuild with "npx expo run:android" or "npx expo run:ios". Face recognition cannot run in Expo Go.',
    user: 'This device is missing the face recognition module. Ask facilities to reinstall the app.',
  },
  FACE_MODEL_MISSING: {
    title: 'Model file could not be read',
    admin:
      'mobilefacenet.tflite could not be resolved from src/assets/models/ or could not be unpacked from the app bundle onto disk. Confirm the file exists and that "tflite" is listed in assetExts in metro.config.js, then rebuild.',
    user: 'This device is missing its face recognition data. Ask facilities to reinstall the app.',
  },
  FACE_MODEL_LOAD_FAILED: {
    title: 'Model rejected by TFLite',
    admin:
      'The bundled mobilefacenet.tflite was found but TFLite refused to parse it. The usual cause is the placeholder file still being in src/assets/models/ instead of a real 112x112 MobileFaceNet model. Replace it and rebuild — on a release build, reloading Metro is not enough.',
    user: 'This device could not start face recognition. Ask facilities to check the installation.',
  },
};
