import FaceDetection, { type Face } from '@react-native-ml-kit/face-detection';

import { FACE_QUALITY_GATES, type FaceQualityIssue } from '@/services/face/constants';

export type DetectedFace = {
  face: Face;
  geometryScore: number;
};

export type DetectionOutcome =
  | { ok: true; detected: DetectedFace }
  | { ok: false; issue: FaceQualityIssue };

export async function detectSingleFace(
  imageUri: string,
  imageWidth: number,
  imageHeight: number,
): Promise<DetectionOutcome> {
  let faces: Face[];
  try {
    faces = await FaceDetection.detect(imageUri, {
      performanceMode: 'accurate',
      landmarkMode: 'all',
      classificationMode: 'all',
      contourMode: 'none',
      minFaceSize: 0.15,
    });
  } catch {
    return { ok: false, issue: 'ModelUnavailable' };
  }

  if (!faces || faces.length === 0) {
    return { ok: false, issue: 'NoFaceDetected' };
  }
  if (faces.length > 1) {
    return { ok: false, issue: 'MultipleFaces' };
  }

  const face = faces[0];
  const { frame } = face;
  const widthRatio = frame.width / imageWidth;

  if (widthRatio < FACE_QUALITY_GATES.minFaceWidthRatio) {
    return { ok: false, issue: 'FaceTooSmall' };
  }
  if (widthRatio > FACE_QUALITY_GATES.maxFaceWidthRatio) {
    return { ok: false, issue: 'FaceTooClose' };
  }

  const centreX = frame.left + frame.width / 2;
  const centreY = frame.top + frame.height / 2;
  const offsetX = Math.abs(centreX - imageWidth / 2) / imageWidth;
  const offsetY = Math.abs(centreY - imageHeight / 2) / imageHeight;
  const centreOffset = Math.max(offsetX, offsetY);

  if (centreOffset > FACE_QUALITY_GATES.maxCenterOffsetRatio) {
    return { ok: false, issue: 'FaceOffCentre' };
  }

  const yaw = Math.abs(face.rotationY ?? 0);
  const pitch = Math.abs(face.rotationX ?? 0);
  const roll = Math.abs(face.rotationZ ?? 0);

  if (yaw > FACE_QUALITY_GATES.maxYawDegrees || pitch > FACE_QUALITY_GATES.maxPitchDegrees) {
    return { ok: false, issue: 'HeadTurned' };
  }
  if (roll > FACE_QUALITY_GATES.maxRollDegrees) {
    return { ok: false, issue: 'HeadTilted' };
  }

  const leftEye = face.leftEyeOpenProbability;
  const rightEye = face.rightEyeOpenProbability;
  if (
    typeof leftEye === 'number' &&
    typeof rightEye === 'number' &&
    (leftEye < FACE_QUALITY_GATES.minEyeOpenProbability ||
      rightEye < FACE_QUALITY_GATES.minEyeOpenProbability)
  ) {
    return { ok: false, issue: 'EyesClosed' };
  }

  const poseScore =
    1 -
    Math.min(
      1,
      yaw / (FACE_QUALITY_GATES.maxYawDegrees * 2) +
        pitch / (FACE_QUALITY_GATES.maxPitchDegrees * 2) +
        roll / (FACE_QUALITY_GATES.maxRollDegrees * 2),
    );
  const framingScore = 1 - Math.min(1, centreOffset / FACE_QUALITY_GATES.maxCenterOffsetRatio);
  const sizeScore = Math.min(1, widthRatio / 0.45);

  return {
    ok: true,
    detected: {
      face,
      geometryScore: clamp01(poseScore * 0.5 + framingScore * 0.25 + sizeScore * 0.25),
    },
  };
}

export function faceCropRect(
  face: Face,
  imageWidth: number,
  imageHeight: number,
  marginRatio = FACE_QUALITY_GATES.cropMarginRatio,
) {
  const { frame } = face;
  const centreX = frame.left + frame.width / 2;
  const centreY = frame.top + frame.height / 2;
  const side = Math.max(frame.width, frame.height) * (1 + marginRatio);

  const half = side / 2;
  const originX = Math.round(Math.max(0, Math.min(centreX - half, imageWidth - side)));
  const originY = Math.round(Math.max(0, Math.min(centreY - half, imageHeight - side)));
  const size = Math.round(Math.min(side, imageWidth - originX, imageHeight - originY));

  return { originX, originY, width: size, height: size };
}

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
