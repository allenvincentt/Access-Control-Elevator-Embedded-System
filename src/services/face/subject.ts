import type { Face } from '@react-native-ml-kit/face-detection';

import type { FaceSubjectRules } from '@/services/face/constants';

export type FaceCandidate = {
  face: Face;
  widthRatio: number;
  heightRatio: number;
  aspect: number;
  centreX: number;
  centreY: number;
  offsetX: number;
  offsetY: number;
  yaw: number;
  pitch: number;
  roll: number;
  classified: boolean;
  eyesOpen: boolean | null;
  touchesEdge: boolean;
  score: number;
};

export type SubjectSelection = {
  subject: FaceCandidate | null;
  others: FaceCandidate[];
  bystanders: number;
  detectedCount: number;
  candidateCount: number;
  plausibleCount: number;
  outsideRoi: number;
};

const EMPTY_SELECTION: SubjectSelection = {
  subject: null,
  others: [],
  bystanders: 0,
  detectedCount: 0,
  candidateCount: 0,
  plausibleCount: 0,
  outsideRoi: 0,
};

export function selectSubject(
  faces: Face[],
  imageWidth: number,
  imageHeight: number,
  rules: FaceSubjectRules,
  minEyeOpenProbability: number,
): SubjectSelection {
  if (!faces.length || imageWidth <= 0 || imageHeight <= 0) {
    return { ...EMPTY_SELECTION, detectedCount: faces.length };
  }

  const measured = faces.map((face) =>
    describeCandidate(face, imageWidth, imageHeight, rules, minEyeOpenProbability),
  );
  const candidates = dedupe(measured, rules);
  const plausible = candidates.filter((candidate) => isPlausible(candidate, rules));
  const inRoi = plausible.filter(
    (candidate) =>
      candidate.offsetX <= rules.roiMaxOffsetX && candidate.offsetY <= rules.roiMaxOffsetY,
  );

  const base = {
    detectedCount: faces.length,
    candidateCount: candidates.length,
    plausibleCount: plausible.length,
    outsideRoi: plausible.length - inRoi.length,
  };

  if (!inRoi.length) {
    return { ...EMPTY_SELECTION, ...base };
  }

  const subject = inRoi.reduce((best, candidate) => (candidate.score > best.score ? candidate : best));
  const others = plausible.filter((candidate) => candidate !== subject);

  return {
    ...base,
    subject,
    others,
    bystanders: others.filter((other) => isBystander(subject, other, rules)).length,
  };
}

export function describeCandidate(
  face: Face,
  imageWidth: number,
  imageHeight: number,
  rules: FaceSubjectRules,
  minEyeOpenProbability: number,
): FaceCandidate {
  const { frame } = face;
  const widthRatio = frame.width / imageWidth;
  const heightRatio = frame.height / imageHeight;
  const aspect = frame.height > 0 ? frame.width / frame.height : 0;

  const centreX = (frame.left + frame.width / 2) / imageWidth;
  const centreY = (frame.top + frame.height / 2) / imageHeight;
  const offsetX = Math.abs(centreX - 0.5);
  const offsetY = Math.abs(centreY - 0.5);

  const yaw = Math.abs(face.rotationY ?? 0);
  const pitch = Math.abs(face.rotationX ?? 0);
  const roll = Math.abs(face.rotationZ ?? 0);

  const probabilities = [face.leftEyeOpenProbability, face.rightEyeOpenProbability].filter(
    (value): value is number => typeof value === 'number',
  );
  const classified = probabilities.length > 0 || typeof face.smilingProbability === 'number';
  const eyesOpen = probabilities.length
    ? probabilities.every((value) => value >= minEyeOpenProbability)
    : null;

  const marginX = rules.edgeMarginRatio * imageWidth;
  const marginY = rules.edgeMarginRatio * imageHeight;
  const touchesEdge =
    frame.left <= marginX ||
    frame.top <= marginY ||
    frame.left + frame.width >= imageWidth - marginX ||
    frame.top + frame.height >= imageHeight - marginY;

  const sizeTerm = clamp01(widthRatio / Math.max(0.0001, rules.idealWidthRatio));
  const centralityTerm = clamp01(
    1 - Math.max(offsetX / rules.roiMaxOffsetX, offsetY / rules.roiMaxOffsetY),
  );
  const poseTerm = clamp01(
    1 - (yaw / rules.maxCandidateYaw + pitch / rules.maxCandidatePitch) / 2,
  );
  const classificationTerm = classified ? 1 : rules.unclassifiedPenalty;

  return {
    face,
    widthRatio,
    heightRatio,
    aspect,
    centreX,
    centreY,
    offsetX,
    offsetY,
    yaw,
    pitch,
    roll,
    classified,
    eyesOpen,
    touchesEdge,
    score: sizeTerm * centralityTerm * poseTerm * classificationTerm,
  };
}

export function isPlausible(candidate: FaceCandidate, rules: FaceSubjectRules) {
  if (candidate.aspect < rules.minAspect || candidate.aspect > rules.maxAspect) return false;
  if (candidate.yaw > rules.maxCandidateYaw || candidate.pitch > rules.maxCandidatePitch) {
    return false;
  }
  if (
    candidate.touchesEdge &&
    Math.max(candidate.offsetX, candidate.offsetY) > rules.edgeOffsetTolerance
  ) {
    return false;
  }
  return true;
}

export function isBystander(
  subject: FaceCandidate,
  other: FaceCandidate,
  rules: FaceSubjectRules,
) {
  if (!other.classified) return false;
  if (other.widthRatio < rules.crowdMinWidthRatio) return false;
  if (other.widthRatio < rules.crowdRelativeSize * subject.widthRatio) return false;
  const separation = Math.hypot(other.centreX - subject.centreX, other.centreY - subject.centreY);
  return separation >= rules.crowdMinSeparation;
}

function dedupe(candidates: FaceCandidate[], rules: FaceSubjectRules) {
  const ordered = [...candidates].sort((a, b) => b.widthRatio - a.widthRatio);
  const kept: FaceCandidate[] = [];

  for (const candidate of ordered) {
    if (!kept.some((existing) => overlaps(existing, candidate, rules))) {
      kept.push(candidate);
    }
  }

  return kept;
}

function overlaps(a: FaceCandidate, b: FaceCandidate, rules: FaceSubjectRules) {
  if (intersectionOverUnion(a.face, b.face) > rules.duplicateIouThreshold) return true;

  const separation = Math.hypot(a.centreX - b.centreX, a.centreY - b.centreY);
  const reference = Math.min(a.widthRatio, b.widthRatio);
  return separation < rules.duplicateCentreRatio * reference;
}

function intersectionOverUnion(a: Face, b: Face) {
  const left = Math.max(a.frame.left, b.frame.left);
  const top = Math.max(a.frame.top, b.frame.top);
  const right = Math.min(a.frame.left + a.frame.width, b.frame.left + b.frame.width);
  const bottom = Math.min(a.frame.top + a.frame.height, b.frame.top + b.frame.height);

  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return 0;

  const intersection = width * height;
  const union = a.frame.width * a.frame.height + b.frame.width * b.frame.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
