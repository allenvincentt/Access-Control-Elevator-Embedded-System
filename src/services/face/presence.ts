import { FACE_PRESENCE, FACE_TERMINAL_SUBJECT_RULES } from '@/services/face/constants';
import { detectFaces, scoreGeometry, type GeometryGates } from '@/services/face/detector';
import { selectSubject } from '@/services/face/subject';

export type PresenceSample = {
  detectorFailed: boolean;
  present: boolean;
  crowded: boolean;
  widthRatio: number;
  centreX: number;
  centreY: number;
  offsetX: number;
  offsetY: number;
  yaw: number;
  pitch: number;
  roll: number;
  geometryScore: number;
  eyesOpen: boolean | null;
  detectedCount: number;
  bystanders: number;
};

const PRESENCE_GEOMETRY: GeometryGates = {
  idealFaceWidthRatio: FACE_PRESENCE.idealWidthRatio,
  maxFaceWidthRatio: FACE_PRESENCE.maxWidthRatio,
  maxCenterOffsetXRatio: FACE_PRESENCE.maxOffsetXRatio,
  maxCenterOffsetYRatio: FACE_PRESENCE.maxOffsetYRatio,
  maxYawDegrees: FACE_PRESENCE.maxYawDegrees,
  maxPitchDegrees: FACE_PRESENCE.maxPitchDegrees,
  maxRollDegrees: FACE_PRESENCE.maxRollDegrees,
};

const EMPTY: PresenceSample = {
  detectorFailed: false,
  present: false,
  crowded: false,
  widthRatio: 0,
  centreX: 0.5,
  centreY: 0.5,
  offsetX: 0,
  offsetY: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  geometryScore: 0,
  eyesOpen: null,
  detectedCount: 0,
  bystanders: 0,
};

export async function readPresence(
  imageUri: string,
  imageWidth: number,
  imageHeight: number,
): Promise<PresenceSample> {
  if (!imageUri || !imageWidth || !imageHeight) {
    return { ...EMPTY, detectorFailed: true };
  }

  const faces = await detectFaces(imageUri, { minFaceSize: FACE_PRESENCE.detectorMinFaceSize });

  if (faces === null) {
    return { ...EMPTY, detectorFailed: true };
  }
  if (faces.length === 0) {
    return EMPTY;
  }

  const selection = selectSubject(
    faces,
    imageWidth,
    imageHeight,
    FACE_TERMINAL_SUBJECT_RULES,
    FACE_PRESENCE.minEyeOpenProbability,
  );
  const subject = selection.subject;

  if (!subject) {
    return { ...EMPTY, detectedCount: faces.length };
  }

  const geometry = scoreGeometry(subject, PRESENCE_GEOMETRY);

  return {
    detectorFailed: false,
    present: true,
    crowded: selection.bystanders > 0,
    widthRatio: geometry.widthRatio,
    centreX: subject.centreX,
    centreY: subject.centreY,
    offsetX: geometry.offsetX,
    offsetY: geometry.offsetY,
    yaw: geometry.yaw,
    pitch: geometry.pitch,
    roll: geometry.roll,
    geometryScore: geometry.score,
    eyesOpen: subject.eyesOpen,
    detectedCount: faces.length,
    bystanders: selection.bystanders,
  };
}
