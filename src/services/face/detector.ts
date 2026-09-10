import FaceDetection, { type Face } from '@react-native-ml-kit/face-detection';

import {
  FACE_QUALITY_GATES,
  type FaceQualityGates,
  type FaceQualityIssue,
} from '@/services/face/constants';

export type DetectedFace = {
  face: Face;
  geometryScore: number;
};

export type DetectionOutcome =
  | { ok: true; detected: DetectedFace }
  | { ok: false; issue: FaceQualityIssue };

export type FaceGeometry = {
  widthRatio: number;
  offsetX: number;
  offsetY: number;
  centreOffset: number;
  yaw: number;
  pitch: number;
  roll: number;
  score: number;
};

export type DetectFacesOptions = {
  minFaceSize: number;
  accurate: boolean;
};

export async function detectFaces(
  imageUri: string,
  { minFaceSize, accurate }: DetectFacesOptions,
): Promise<Face[] | null> {
  try {
    return await FaceDetection.detect(imageUri, {
      performanceMode: accurate ? 'accurate' : 'fast',
      landmarkMode: 'none',
      contourMode: 'none',
      classificationMode: 'all',
      minFaceSize,
    });
  } catch {
    return null;
  }
}

export function faceWidthRatio(face: Face, imageWidth: number) {
  return imageWidth > 0 ? face.frame.width / imageWidth : 0;
}

export function nearFieldFaces(faces: Face[], imageWidth: number, minWidthRatio: number) {
  return faces.filter((face) => faceWidthRatio(face, imageWidth) >= minWidthRatio);
}

export function measureFace(
  face: Face,
  imageWidth: number,
  imageHeight: number,
  gates: {
    idealFaceWidthRatio: number;
    maxFaceWidthRatio: number;
    maxCenterOffsetRatio: number;
    maxYawDegrees: number;
    maxPitchDegrees: number;
    maxRollDegrees: number;
  },
): FaceGeometry {
  const { frame } = face;
  const widthRatio = faceWidthRatio(face, imageWidth);

  const centreX = frame.left + frame.width / 2;
  const centreY = frame.top + frame.height / 2;
  const offsetX = Math.abs(centreX - imageWidth / 2) / imageWidth;
  const offsetY = Math.abs(centreY - imageHeight / 2) / imageHeight;
  const centreOffset = Math.max(offsetX, offsetY);

  const yaw = Math.abs(face.rotationY ?? 0);
  const pitch = Math.abs(face.rotationX ?? 0);
  const roll = Math.abs(face.rotationZ ?? 0);

  const posePenalty =
    (yaw / gates.maxYawDegrees + pitch / gates.maxPitchDegrees + roll / gates.maxRollDegrees) / 3;
  const poseScore = clamp01(1 - posePenalty);
  const framingScore = clamp01(1 - 0.7 * (centreOffset / gates.maxCenterOffsetRatio));
  const sizeScore =
    widthRatio <= gates.idealFaceWidthRatio
      ? clamp01(widthRatio / gates.idealFaceWidthRatio)
      : clamp01(
          1 -
            0.6 *
              ((widthRatio - gates.idealFaceWidthRatio) /
                Math.max(0.0001, gates.maxFaceWidthRatio - gates.idealFaceWidthRatio)),
        );

  return {
    widthRatio,
    offsetX,
    offsetY,
    centreOffset,
    yaw,
    pitch,
    roll,
    score: clamp01(poseScore * 0.5 + framingScore * 0.25 + sizeScore * 0.25),
  };
}

export async function detectSingleFace(
  imageUri: string,
  imageWidth: number,
  imageHeight: number,
  gates: FaceQualityGates = FACE_QUALITY_GATES,
): Promise<DetectionOutcome> {
  const faces = await detectFaces(imageUri, {
    minFaceSize: gates.detectorMinFaceSize,
    accurate: true,
  });

  if (faces === null) {
    return { ok: false, issue: 'ModelUnavailable' };
  }
  if (faces.length === 0) {
    return { ok: false, issue: 'NoFaceDetected' };
  }

  const nearField = nearFieldFaces(faces, imageWidth, gates.bystanderMinWidthRatio);

  if (nearField.length === 0) {
    return { ok: false, issue: 'FaceTooSmall' };
  }
  if (nearField.length > 1) {
    return { ok: false, issue: 'MultipleFaces' };
  }

  const face = nearField[0];
  const geometry = measureFace(face, imageWidth, imageHeight, gates);

  if (geometry.widthRatio < gates.minFaceWidthRatio) {
    return { ok: false, issue: 'FaceTooSmall' };
  }
  if (geometry.widthRatio > gates.maxFaceWidthRatio) {
    return { ok: false, issue: 'FaceTooClose' };
  }
  if (geometry.centreOffset > gates.maxCenterOffsetRatio) {
    return { ok: false, issue: 'FaceOffCentre' };
  }
  if (geometry.yaw > gates.maxYawDegrees || geometry.pitch > gates.maxPitchDegrees) {
    return { ok: false, issue: 'HeadTurned' };
  }
  if (geometry.roll > gates.maxRollDegrees) {
    return { ok: false, issue: 'HeadTilted' };
  }

  const leftEye = face.leftEyeOpenProbability;
  const rightEye = face.rightEyeOpenProbability;
  if (
    typeof leftEye === 'number' &&
    typeof rightEye === 'number' &&
    (leftEye < gates.minEyeOpenProbability || rightEye < gates.minEyeOpenProbability)
  ) {
    return { ok: false, issue: 'EyesClosed' };
  }

  return { ok: true, detected: { face, geometryScore: geometry.score } };
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
