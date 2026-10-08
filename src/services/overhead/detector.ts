import { decode as decodeBase64 } from 'base64-arraybuffer';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode as decodeJpeg } from 'jpeg-js';

import { OVERHEAD_DETECTION } from '@/services/overhead/constants';
import { iou, type Detection } from '@/services/overhead/geometry';
import { loadOverheadModel, OverheadModelError, type OverheadModel } from '@/services/overhead/model';

export type CameraFrame = {
  uri: string;
  width: number;
  height: number;
};

export type DetectResult = { ok: true; detections: Detection[] } | { ok: false; reason: 'frame' | 'model' };

type Resized = {
  rgba: Uint8Array;
  width: number;
  height: number;
};

export function deleteFrame(uri: string) {
  if (!uri.startsWith('file:')) return;
  try {
    new File(uri).delete();
  } catch {
    return;
  }
}

function free(target: { release: () => void }) {
  try {
    target.release();
  } catch {
    return;
  }
}

async function resize(frame: CameraFrame, size: number): Promise<Resized | null> {
  const ratio = size / Math.max(frame.width, frame.height);
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  const width = Math.max(1, Math.min(size, Math.round(frame.width * ratio)));
  const height = Math.max(1, Math.min(size, Math.round(frame.height * ratio)));

  try {
    const context = ImageManipulator.manipulate(frame.uri);
    context.resize({ width, height });
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 1, base64: true });
    free(image);
    free(context);
    deleteFrame(saved.uri);
    if (!saved.base64) return null;
    const decoded = decodeJpeg(new Uint8Array(decodeBase64(saved.base64)), {
      useTArray: true,
      formatAsRGBA: true,
    });
    return { rgba: decoded.data, width: decoded.width, height: decoded.height };
  } catch {
    return null;
  }
}

function letterbox(image: Resized, loaded: OverheadModel) {
  const size = loaded.inputSize;
  const plane = size * size;
  const tensor = new Float32Array(plane * 3).fill(OVERHEAD_DETECTION.letterboxFill / 255);
  const padX = Math.floor((size - image.width) / 2);
  const padY = Math.floor((size - image.height) / 2);
  const channelStep = loaded.channelsFirstInput ? plane : 1;
  const pixelStep = loaded.channelsFirstInput ? 1 : 3;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const source = (y * image.width + x) * 4;
      const target = ((y + padY) * size + x + padX) * pixelStep;
      tensor[target] = image.rgba[source] / 255;
      tensor[target + channelStep] = image.rgba[source + 1] / 255;
      tensor[target + channelStep * 2] = image.rgba[source + 2] / 255;
    }
  }

  return { tensor, padX, padY };
}

function suppress(candidates: Detection[]): Detection[] {
  const ordered = [...candidates].sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  for (const candidate of ordered) {
    if (kept.some((winner) => iou(winner, candidate) >= OVERHEAD_DETECTION.nmsIou)) continue;
    kept.push(candidate);
    if (kept.length >= OVERHEAD_DETECTION.maxDetections) break;
  }
  return kept;
}

function asFloats(value: unknown): Float32Array {
  if (value instanceof Float32Array) return value;
  if (value instanceof ArrayBuffer) return new Float32Array(value, 0, Math.floor(value.byteLength / 4));
  if (ArrayBuffer.isView(value)) {
    return new Float32Array(value.buffer, value.byteOffset, Math.floor(value.byteLength / 4));
  }
  return new Float32Array(0);
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function decode(
  raw: Float32Array,
  loaded: OverheadModel,
  image: Resized,
  padX: number,
  padY: number,
): Detection[] {
  const { channels, anchors, channelsFirstOutput, inputSize } = loaded;
  const read = channelsFirstOutput
    ? (channel: number, anchor: number) => raw[channel * anchors + anchor]
    : (channel: number, anchor: number) => raw[anchor * channels + channel];
  const scoreChannel = 4 + Math.min(OVERHEAD_DETECTION.personClass, channels - 5);
  const candidates: Detection[] = [];

  for (let anchor = 0; anchor < anchors; anchor += 1) {
    const score = read(scoreChannel, anchor);
    if (!(score >= OVERHEAD_DETECTION.confidence)) continue;

    const cx = read(0, anchor);
    const cy = read(1, anchor);
    const w = read(2, anchor);
    const h = read(3, anchor);
    const unit = Math.max(cx, cy, w, h) > 1.5 ? 1 : inputSize;

    candidates.push({
      left: clamp((cx * unit - (w * unit) / 2 - padX) / image.width),
      top: clamp((cy * unit - (h * unit) / 2 - padY) / image.height),
      right: clamp((cx * unit + (w * unit) / 2 - padX) / image.width),
      bottom: clamp((cy * unit + (h * unit) / 2 - padY) / image.height),
      score,
    });
  }

  return suppress(candidates).filter((box) => box.right > box.left && box.bottom > box.top);
}

export async function detectPeople(frame: CameraFrame): Promise<DetectResult> {
  let loaded: OverheadModel;
  try {
    loaded = await loadOverheadModel();
  } catch (error) {
    if (error instanceof OverheadModelError) throw error;
    return { ok: false, reason: 'model' };
  }

  const image = await resize(frame, loaded.inputSize);
  if (!image) return { ok: false, reason: 'frame' };

  const { tensor, padX, padY } = letterbox(image, loaded);

  let outputs: ArrayBuffer[];
  try {
    outputs = await loaded.model.run([tensor.buffer as ArrayBuffer]);
  } catch {
    return { ok: false, reason: 'model' };
  }

  const raw = asFloats(outputs[0]);
  if (raw.length < loaded.channels * loaded.anchors) return { ok: false, reason: 'model' };

  return { ok: true, detections: decode(raw, loaded, image, padX, padY) };
}
