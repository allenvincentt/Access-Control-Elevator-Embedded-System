import { decode as decodeBase64 } from 'base64-arraybuffer';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode as decodeJpeg } from 'jpeg-js';

import {
  PERSON_CLASS_INDEX,
  PERSON_DETECTION,
  PERSON_MAX_DETECTIONS,
  PERSON_ROI,
  type PersonRoi,
} from '@/services/person/constants';
import { loadPersonModel, PersonModelError } from '@/services/person/model';

export type PersonBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  score: number;
  inRoi: boolean;
};

export type DetectionFrame = {
  uri: string;
  width: number;
  height: number;
};

export type DetectionOutcome =
  | { ok: true; boxes: PersonBox[] }
  | { ok: false; reason: 'frame' | 'model' };

type Pixels = {
  rgba: Uint8Array;
  width: number;
  height: number;
  uri: string;
};

let scoresFirst: boolean | null = null;

function release(target: { release: () => void }) {
  try {
    target.release();
  } catch {
    return;
  }
}

export function discardFile(uri: string) {
  if (!uri.startsWith('file:')) return;
  try {
    new File(uri).delete();
  } catch {
    return;
  }
}

async function toPixels(frame: DetectionFrame, inputSize: number): Promise<Pixels | null> {
  const longest = Math.max(frame.width, frame.height);
  if (longest <= 0) return null;

  const scale = inputSize / longest;
  const width = Math.max(1, Math.min(inputSize, Math.round(frame.width * scale)));
  const height = Math.max(1, Math.min(inputSize, Math.round(frame.height * scale)));

  try {
    const context = ImageManipulator.manipulate(frame.uri);
    context.resize({ width, height });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: 1,
      base64: true,
    });
    release(rendered);
    release(context);

    if (!saved.base64) return null;
    const bytes = new Uint8Array(decodeBase64(saved.base64));
    const decoded = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true });
    return { rgba: decoded.data, width: decoded.width, height: decoded.height, uri: saved.uri };
  } catch {
    return null;
  }
}

function buildTensor(pixels: Pixels, inputSize: number, quantized: boolean) {
  const padX = Math.max(0, Math.floor((inputSize - pixels.width) / 2));
  const padY = Math.max(0, Math.floor((inputSize - pixels.height) / 2));
  const total = inputSize * inputSize * 3;
  const tensor = quantized ? new Uint8Array(total) : new Float32Array(total);

  for (let y = 0; y < pixels.height; y += 1) {
    const targetRow = (y + padY) * inputSize;
    const sourceRow = y * pixels.width;
    for (let x = 0; x < pixels.width; x += 1) {
      const source = (sourceRow + x) * 4;
      const target = (targetRow + x + padX) * 3;
      if (quantized) {
        tensor[target] = pixels.rgba[source];
        tensor[target + 1] = pixels.rgba[source + 1];
        tensor[target + 2] = pixels.rgba[source + 2];
      } else {
        tensor[target] = (pixels.rgba[source] - 127.5) / 127.5;
        tensor[target + 1] = (pixels.rgba[source + 1] - 127.5) / 127.5;
        tensor[target + 2] = (pixels.rgba[source + 2] - 127.5) / 127.5;
      }
    }
  }

  return { tensor, padX, padY };
}

function asFloat32(value: unknown): Float32Array {
  if (value instanceof Float32Array) return value;
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return new Float32Array(view.buffer, view.byteOffset, view.byteLength / 4);
  }
  return new Float32Array(value as ArrayBuffer);
}

function integral(values: Float32Array, limit: number): boolean {
  for (let index = 0; index < limit; index += 1) {
    if (Math.abs(values[index] - Math.round(values[index])) > 1e-3) return false;
  }
  return true;
}

function bounded(values: Float32Array, limit: number): boolean {
  for (let index = 0; index < limit; index += 1) {
    if (values[index] < 0 || values[index] > 1) return false;
  }
  return true;
}

function resolveRoles(first: Float32Array, second: Float32Array, limit: number) {
  if (scoresFirst === null && limit > 0) {
    const firstIntegral = integral(first, limit);
    const secondIntegral = integral(second, limit);
    if (firstIntegral !== secondIntegral) {
      scoresFirst = secondIntegral;
    } else if (bounded(first, limit) !== bounded(second, limit)) {
      scoresFirst = bounded(first, limit);
    }
  }

  return scoresFirst === true
    ? { scores: first, classes: second }
    : { scores: second, classes: first };
}

function insideRoi(box: PersonBox, roi: PersonRoi): boolean {
  const centreX = (box.left + box.right) / 2;
  const footY = box.bottom;
  return (
    centreX >= roi.left && centreX <= roi.right && footY >= roi.top && footY <= roi.bottom
  );
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export async function detectPeople(
  frame: DetectionFrame,
  roi: PersonRoi = PERSON_ROI,
): Promise<DetectionOutcome> {
  let loaded;
  try {
    loaded = await loadPersonModel();
  } catch (error) {
    if (error instanceof PersonModelError) throw error;
    return { ok: false, reason: 'model' };
  }

  const { model, inputSize, quantized, plan } = loaded;

  const pixels = await toPixels(frame, inputSize);
  if (!pixels) return { ok: false, reason: 'frame' };

  const { tensor, padX, padY } = buildTensor(pixels, inputSize, quantized);
  discardFile(pixels.uri);

  let outputs: unknown[];
  try {
    outputs = (await model.run([tensor.buffer as ArrayBuffer])) as unknown[];
  } catch {
    return { ok: false, reason: 'model' };
  }

  const boxTensor = asFloat32(outputs[plan.boxes]);
  const countTensor = asFloat32(outputs[plan.count]);
  const reported = Math.trunc(countTensor[0] || 0);
  const roles = resolveRoles(
    asFloat32(outputs[plan.pair[0]]),
    asFloat32(outputs[plan.pair[1]]),
    Math.min(PERSON_MAX_DETECTIONS, Math.max(0, reported)),
  );

  const available = Math.min(
    PERSON_MAX_DETECTIONS,
    Math.floor(boxTensor.length / 4),
    roles.scores.length,
  );
  const limit = reported > 0 ? Math.min(reported, available) : available;

  const scaleX = inputSize / pixels.width;
  const scaleY = inputSize / pixels.height;
  const offsetX = padX / inputSize;
  const offsetY = padY / inputSize;

  const boxes: PersonBox[] = [];
  for (let index = 0; index < limit; index += 1) {
    const score = roles.scores[index];
    if (!Number.isFinite(score) || score < PERSON_DETECTION.minScore) continue;
    if (Math.round(roles.classes[index]) !== PERSON_CLASS_INDEX) continue;

    const top = clamp01((boxTensor[index * 4] - offsetY) * scaleY);
    const left = clamp01((boxTensor[index * 4 + 1] - offsetX) * scaleX);
    const bottom = clamp01((boxTensor[index * 4 + 2] - offsetY) * scaleY);
    const right = clamp01((boxTensor[index * 4 + 3] - offsetX) * scaleX);

    if (right - left < PERSON_DETECTION.minBoxWidth) continue;
    if (bottom - top < PERSON_DETECTION.minBoxHeight) continue;

    const box: PersonBox = { left, top, right, bottom, score, inRoi: false };
    box.inRoi = insideRoi(box, roi);
    boxes.push(box);
  }

  return { ok: true, boxes };
}
