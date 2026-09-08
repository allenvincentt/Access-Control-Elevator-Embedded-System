import { decode as decodeBase64 } from 'base64-arraybuffer';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode as decodeJpeg } from 'jpeg-js';

import { AppError } from '@/lib/errors';
import {
  FACE_INPUT_SIZE,
  FACE_ISSUE_MESSAGES,
  FACE_QUALITY_GATES,
  type FaceQualityIssue,
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

export type FaceCaptureOutcome =
  | { ok: true; capture: FaceCapture }
  | { ok: false; issue: FaceQualityIssue; message: string };

function fail(issue: FaceQualityIssue): FaceCaptureOutcome {
  return { ok: false, issue, message: FACE_ISSUE_MESSAGES[issue] };
}

export async function captureFaceFromPhoto(photo: CapturedPhoto): Promise<FaceCaptureOutcome> {
  if (!photo?.uri || !photo.width || !photo.height) {
    return fail('CaptureFailed');
  }

  const detection = await detectSingleFace(photo.uri, photo.width, photo.height);
  if (!detection.ok) {
    return fail(detection.issue);
  }

  const rect = faceCropRect(detection.detected.face, photo.width, photo.height);
  if (rect.width < 24 || rect.height < 24) {
    return fail('FaceTooSmall');
  }

  let cropUri: string;
  let cropBase64: string;
  try {
    const context = ImageManipulator.manipulate(photo.uri);
    context.crop(rect).resize({ width: FACE_INPUT_SIZE, height: FACE_INPUT_SIZE });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: 1,
      base64: true,
    });
    if (!saved.base64) {
      return fail('CaptureFailed');
    }
    cropUri = saved.uri;
    cropBase64 = saved.base64;
  } catch {
    return fail('CaptureFailed');
  }

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

  if (image.meanLuma < FACE_QUALITY_GATES.minMeanLuma || image.meanLuma > FACE_QUALITY_GATES.maxMeanLuma) {
    return fail('PoorLighting');
  }
  if (image.lumaSpread < FACE_QUALITY_GATES.minLumaSpread) {
    return fail('PoorLighting');
  }
  if (image.sharpness < FACE_QUALITY_GATES.minSharpness) {
    return fail('Blurry');
  }

  let embedding: number[];
  try {
    embedding = await computeEmbedding(rgba);
  } catch (error) {
    if (error instanceof AppError) throw error;
    return fail('ModelUnavailable');
  }

  const sharpnessScore = Math.min(1, image.sharpness / FACE_QUALITY_GATES.targetSharpness);
  const lightingScore = 1 - Math.min(1, Math.abs(image.meanLuma - 132) / 100);
  const quality = round4(
    clamp01(detection.detected.geometryScore * 0.5 + lightingScore * 0.25 + sharpnessScore * 0.25),
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

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}
