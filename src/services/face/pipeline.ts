import { decode as decodeBase64 } from 'base64-arraybuffer';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode as decodeJpeg } from 'jpeg-js';

import { AppError } from '@/lib/errors';
import {
  FACE_ENROLLMENT_SUBJECT_RULES,
  FACE_INPUT_SIZE,
  FACE_ISSUE_MESSAGES,
  FACE_QUALITY_GATES,
  type FaceQualityGates,
  type FaceQualityIssue,
  type FaceSubjectRules,
} from '@/services/face/constants';
import { detectSingleFace, faceCropRect } from '@/services/face/detector';
import { computeEmbedding } from '@/services/face/embedder';

export type CapturedPhoto = {
  uri: string;
  width: number;
  height: number;
};

export type FaceCapture = {
  embedding: number[];
  quality: number;
  cropUri: string;
  cropBase64: string;
};

export type FacePhoto = {
  cropUri: string;
  cropBase64: string;
  geometryScore: number;
};

export type FaceCaptureOutcome =
  | { ok: true; capture: FaceCapture }
  | { ok: false; issue: FaceQualityIssue; message: string };

export type FacePhotoOutcome =
  | { ok: true; photo: FacePhoto }
  | { ok: false; issue: FaceQualityIssue; message: string };

export type FaceCaptureOptions = {
  gates?: FaceQualityGates;
  rules?: FaceSubjectRules;
  messages?: Record<FaceQualityIssue, string>;
};

export type FacePhotoOptions = FaceCaptureOptions & {
  outputSize?: number;
  cropMarginRatio?: number;
};

export async function captureFacePhoto(
  photo: CapturedPhoto,
  {
    gates = FACE_QUALITY_GATES,
    rules = FACE_ENROLLMENT_SUBJECT_RULES,
    messages = FACE_ISSUE_MESSAGES,
    outputSize = FACE_INPUT_SIZE,
    cropMarginRatio,
  }: FacePhotoOptions = {},
): Promise<FacePhotoOutcome> {
  const fail = (issue: FaceQualityIssue): FacePhotoOutcome => ({
    ok: false,
    issue,
    message: messages[issue],
  });

  if (!photo?.uri || !photo.width || !photo.height) {
    return fail('CaptureFailed');
  }

  const detection = await detectSingleFace(photo.uri, photo.width, photo.height, gates, rules);
  if (!detection.ok) {
    return fail(detection.issue);
  }

  const rect = faceCropRect(
    detection.detected.face,
    photo.width,
    photo.height,
    cropMarginRatio ?? gates.cropMarginRatio,
  );
  if (rect.width < 24 || rect.height < 24) {
    return fail('FaceTooSmall');
  }

  try {
    const context = ImageManipulator.manipulate(photo.uri);
    context.crop(rect).resize({ width: outputSize, height: outputSize });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: 1,
      base64: true,
    });
    release(rendered);
    release(context);
    if (!saved.base64) {
      return fail('CaptureFailed');
    }
    return {
      ok: true,
      photo: {
        cropUri: saved.uri,
        cropBase64: saved.base64,
        geometryScore: detection.detected.geometryScore,
      },
    };
  } catch {
    return fail('CaptureFailed');
  }
}

export async function captureFaceFromPhoto(
  photo: CapturedPhoto,
  {
    gates = FACE_QUALITY_GATES,
    rules = FACE_ENROLLMENT_SUBJECT_RULES,
    messages = FACE_ISSUE_MESSAGES,
  }: FaceCaptureOptions = {},
): Promise<FaceCaptureOutcome> {
  const fail = (issue: FaceQualityIssue): FaceCaptureOutcome => ({
    ok: false,
    issue,
    message: messages[issue],
  });

  const cropped = await captureFacePhoto(photo, { gates, rules, messages });
  if (!cropped.ok) {
    return { ok: false, issue: cropped.issue, message: cropped.message };
  }

  const { cropUri, cropBase64, geometryScore } = cropped.photo;

  let rgba: Uint8Array;
  try {
    const bytes = new Uint8Array(decodeBase64(cropBase64));
    const decoded = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true });
    if (decoded.width !== FACE_INPUT_SIZE || decoded.height !== FACE_INPUT_SIZE) {
      return fail('CaptureFailed');
    }
    rgba = decoded.data;
  } catch {
    return fail('CaptureFailed');
  }

  const image = analysePixels(rgba, FACE_INPUT_SIZE);

  if (image.meanLuma < gates.minMeanLuma || image.meanLuma > gates.maxMeanLuma) {
    return fail('PoorLighting');
  }
  if (image.lumaSpread < gates.minLumaSpread) {
    return fail('PoorLighting');
  }
  if (image.sharpness < gates.minSharpness) {
    return fail('Blurry');
  }

  let embedding: number[];
  try {
    embedding = await computeEmbedding(rgba);
  } catch (error) {
    if (error instanceof AppError) throw error;
    return fail('ModelUnavailable');
  }

  const sharpnessScore = Math.min(1, image.sharpness / gates.targetSharpness);
  const lightingScore = 1 - Math.min(1, Math.abs(image.meanLuma - 132) / 100);
  const quality = round4(
    clamp01(geometryScore * 0.5 + lightingScore * 0.25 + sharpnessScore * 0.25),
  );

  return { ok: true, capture: { embedding, quality, cropUri, cropBase64 } };
}

type ImageStatistics = {
  meanLuma: number;
  lumaSpread: number;
  sharpness: number;
};

function analysePixels(rgba: Uint8Array, size: number): ImageStatistics {
  const pixelCount = size * size;
  const luma = new Float32Array(pixelCount);

  let sum = 0;
  let sumOfSquares = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const value = 0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2];
    luma[index] = value;
    sum += value;
    sumOfSquares += value * value;
  }

  const meanLuma = sum / pixelCount;
  const lumaSpread = Math.sqrt(Math.max(0, sumOfSquares / pixelCount - meanLuma * meanLuma));

  let laplacianSum = 0;
  let laplacianSumOfSquares = 0;
  let samples = 0;
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const index = y * size + x;
      const value =
        4 * luma[index] -
        luma[index - size] -
        luma[index + size] -
        luma[index - 1] -
        luma[index + 1];
      laplacianSum += value;
      laplacianSumOfSquares += value * value;
      samples += 1;
    }
  }

  const laplacianMean = laplacianSum / samples;
  const sharpness = Math.max(
    0,
    laplacianSumOfSquares / samples - laplacianMean * laplacianMean,
  );

  return { meanLuma, lumaSpread, sharpness };
}

function release(target: { release: () => void }) {
  try {
    target.release();
  } catch {
    return;
  }
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}
