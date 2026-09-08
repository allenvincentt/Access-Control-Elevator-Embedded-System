export const FACE_MODEL_VERSION = 'mobilefacenet-112x112-192d-v1';
export const FACE_INPUT_SIZE = 112;
export const FACE_EMBEDDING_SIZE = 192;
export const ENROLLMENT_SAMPLE_COUNT = 3;

export const FACE_QUALITY_GATES = {
  minFaceWidthRatio: 0.18,
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
} as const;

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
