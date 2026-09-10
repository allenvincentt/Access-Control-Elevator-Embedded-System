import FaceDetection, { type Face } from '@react-native-ml-kit/face-detection';

import {
  FACE_ENROLLMENT_SUBJECT_RULES,
  FACE_QUALITY_GATES,
  type FaceQualityGates,
  type FaceQualityIssue,
  type FaceSubjectRules,
} from '@/services/face/constants';
import { selectSubject, type FaceCandidate } from '@/services/face/subject';

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
  yaw: number;
  pitch: number;
  roll: number;
  score: number;
};

export type GeometryGates = {
  idealFaceWidthRatio: number;
  maxFaceWidthRatio: number;
  maxCenterOffsetXRatio: number;
  maxCenterOffsetYRatio: number;
  maxYawDegrees: number;
  maxPitchDegrees: number;
  maxRollDegrees: number;
};

export type DetectFacesOptions = {
  minFaceSize: number;
};

export async function detectFaces(
  imageUri: string,
  { minFaceSize }: DetectFacesOptions,
): Promise<Face[] | null> {
  try {
    return await FaceDetection.detect(imageUri, {
      performanceMode: 'accurate',
      landmarkMode: 'none',
      contourMode: 'none',
      classificationMode: 'all',
      minFaceSize,
    });
  } catch {
    return null;
  }
}

export function scoreGeometry(candidate: FaceCandidate, gates: GeometryGates): FaceGeometry {
  const { widthRatio, offsetX, offsetY, yaw, pitch, roll } = candidate;

  const posePenalty =
    (yaw / gates.maxYawDegrees + pitch / gates.maxPitchDegrees + roll / gates.maxRollDegrees) / 3;
  const poseScore = clamp01(1 - posePenalty);

  const framing = Math.max(
    offsetX / gates.maxCenterOffsetXRatio,
    offsetY / gates.maxCenterOffsetYRatio,
  );
  const framingScore = clamp01(1 - 0.7 * framing);

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
  rules: FaceSubjectRules = FACE_ENROLLMENT_SUBJECT_RULES,
): Promise<DetectionOutcome> {
  const faces = await detectFaces(imageUri, { minFaceSize: gates.detectorMinFaceSize });

  if (faces === null) {
    return { ok: false, issue: 'ModelUnavailable' };
  }
  if (faces.length === 0) {
    return { ok: false, issue: 'NoFaceDetected' };
  }

  const selection = selectSubject(faces, imageWidth, imageHeight, rules, gates.minEyeOpenProbability);
  const subject = selection.subject;

  if (!subject) {
    return { ok: false, issue: selection.outsideRoi > 0 ? 'FaceOffCentre' : 'NoFaceDetected' };
  }
  if (selection.bystanders > 0) {
    return { ok: false, issue: 'MultipleFaces' };
  }

  const geometry = scoreGeometry(subject, gates);

  if (geometry.widthRatio < gates.minFaceWidthRatio) {
    return { ok: false, issue: 'FaceTooSmall' };
  }
  if (geometry.widthRatio > gates.maxFaceWidthRatio) {
    return { ok: false, issue: 'FaceTooClose' };
  }
  if (
    geometry.offsetX > gates.maxCenterOffsetXRatio ||
    geometry.offsetY > gates.maxCenterOffsetYRatio
  ) {
    return { ok: false, issue: 'FaceOffCentre' };
  }
  if (geometry.yaw > gates.maxYawDegrees || geometry.pitch > gates.maxPitchDegrees) {
    return { ok: false, issue: 'HeadTurned' };
  }
  if (geometry.roll > gates.maxRollDegrees) {
    return { ok: false, issue: 'HeadTilted' };
  }
  if (subject.eyesOpen === false) {
    return { ok: false, issue: 'EyesClosed' };
  }

  return { ok: true, detected: { face: subject.face, geometryScore: geometry.score } };
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
