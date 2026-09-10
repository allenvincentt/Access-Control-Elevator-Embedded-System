import { FACE_PRESENCE, type PresenceCode } from '@/services/face/constants';
import { detectFaces, faceWidthRatio, measureFace, nearFieldFaces } from '@/services/face/detector';

export type PresenceReading = {
  code: PresenceCode;
  ready: boolean;
  faceCount: number;
  nearCount: number;
  widthRatio: number;
  centreX: number;
  centreY: number;
  proximity: number;
  alignment: number;
  geometryScore: number;
};

const EMPTY: PresenceReading = {
  code: 'NoPerson',
  ready: false,
  faceCount: 0,
  nearCount: 0,
  widthRatio: 0,
  centreX: 0.5,
  centreY: 0.5,
  proximity: 0,
  alignment: 0,
  geometryScore: 0,
};

export async function readPresence(
  imageUri: string,
  imageWidth: number,
  imageHeight: number,
): Promise<PresenceReading> {
  if (!imageUri || !imageWidth || !imageHeight) {
    return EMPTY;
  }

  const faces = await detectFaces(imageUri, {
    minFaceSize: FACE_PRESENCE.detectorMinFaceSize,
    accurate: false,
  });

  if (faces === null) {
    return { ...EMPTY, code: 'DetectorUnavailable' };
  }
  if (faces.length === 0) {
    return EMPTY;
  }

  const near = nearFieldFaces(faces, imageWidth, FACE_PRESENCE.bystanderMinWidthRatio);

  if (near.length === 0) {
    const largest = faces.reduce((best, face) =>
      faceWidthRatio(face, imageWidth) > faceWidthRatio(best, imageWidth) ? face : best,
    );
    return {
      ...EMPTY,
      code: 'TooFar',
      faceCount: faces.length,
      widthRatio: faceWidthRatio(largest, imageWidth),
      proximity: clamp01(faceWidthRatio(largest, imageWidth) / FACE_PRESENCE.idealWidthRatio),
    };
  }

  if (near.length > 1) {
    return {
      ...EMPTY,
      code: 'Crowded',
      faceCount: faces.length,
      nearCount: near.length,
    };
  }

  const face = near[0];
  const geometry = measureFace(face, imageWidth, imageHeight, {
    idealFaceWidthRatio: FACE_PRESENCE.idealWidthRatio,
    maxFaceWidthRatio: FACE_PRESENCE.maxWidthRatio,
    maxCenterOffsetRatio: Math.max(FACE_PRESENCE.maxOffsetXRatio, FACE_PRESENCE.maxOffsetYRatio),
    maxYawDegrees: FACE_PRESENCE.maxYawDegrees,
    maxPitchDegrees: FACE_PRESENCE.maxPitchDegrees,
    maxRollDegrees: FACE_PRESENCE.maxRollDegrees,
  });

  const base: PresenceReading = {
    code: 'Ready',
    ready: false,
    faceCount: faces.length,
    nearCount: 1,
    widthRatio: geometry.widthRatio,
    centreX: (face.frame.left + face.frame.width / 2) / imageWidth,
    centreY: (face.frame.top + face.frame.height / 2) / imageHeight,
    proximity: clamp01(geometry.widthRatio / FACE_PRESENCE.idealWidthRatio),
    alignment: clamp01(
      1 -
        Math.max(
          geometry.offsetX / FACE_PRESENCE.maxOffsetXRatio,
          geometry.offsetY / FACE_PRESENCE.maxOffsetYRatio,
        ),
    ),
    geometryScore: geometry.score,
  };

  if (geometry.widthRatio < FACE_PRESENCE.minWidthRatio) {
    return { ...base, code: 'TooFar' };
  }
  if (geometry.widthRatio > FACE_PRESENCE.maxWidthRatio) {
    return { ...base, code: 'TooClose' };
  }
  if (
    geometry.offsetX > FACE_PRESENCE.maxOffsetXRatio ||
    geometry.offsetY > FACE_PRESENCE.maxOffsetYRatio
  ) {
    return { ...base, code: 'OffCentre' };
  }
  if (
    geometry.yaw > FACE_PRESENCE.maxYawDegrees ||
    geometry.pitch > FACE_PRESENCE.maxPitchDegrees ||
    geometry.roll > FACE_PRESENCE.maxRollDegrees
  ) {
    return { ...base, code: 'HeadTurned' };
  }

  const leftEye = face.leftEyeOpenProbability;
  const rightEye = face.rightEyeOpenProbability;
  if (
    typeof leftEye === 'number' &&
    typeof rightEye === 'number' &&
    (leftEye < FACE_PRESENCE.minEyeOpenProbability ||
      rightEye < FACE_PRESENCE.minEyeOpenProbability)
  ) {
    return { ...base, code: 'EyesClosed' };
  }

  if (geometry.score < FACE_PRESENCE.minGeometryScore) {
    return { ...base, code: weakestAxis(geometry.offsetX, geometry.offsetY) };
  }

  return { ...base, ready: true };
}

export function isSteady(previous: PresenceReading | null, current: PresenceReading) {
  if (!previous || !previous.nearCount || !current.nearCount) return false;

  const moved = Math.hypot(current.centreX - previous.centreX, current.centreY - previous.centreY);
  if (moved > FACE_PRESENCE.steadyCentreDelta) return false;

  const scale = Math.abs(current.widthRatio - previous.widthRatio) / Math.max(0.01, previous.widthRatio);
  return scale <= FACE_PRESENCE.steadyScaleDelta;
}

function weakestAxis(offsetX: number, offsetY: number): PresenceCode {
  const framing = Math.max(
    offsetX / FACE_PRESENCE.maxOffsetXRatio,
    offsetY / FACE_PRESENCE.maxOffsetYRatio,
  );
  return framing > 0.6 ? 'OffCentre' : 'HeadTurned';
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
