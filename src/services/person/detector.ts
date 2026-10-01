import { decode as decodeBase64 } from 'base64-arraybuffer';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode as decodeJpeg } from 'jpeg-js';

import {
  HEAD_CLASS_INDEX,
  PERSON_CLASS_INDEX,
  PERSON_DETECTION,
  PERSON_MAX_DETECTIONS,
  PERSON_ROI_WIDE,
  PERSON_SCOPES_BY_TARGET,
  type PersonModelKind,
  type PersonTarget,
  type PersonRoi,
  type PersonScope,
  type PersonScopeAnchor,
} from '@/services/person/constants';
import {
  intersectionOverSmaller,
  intersectionOverUnion,
  rectArea,
  unionRect,
  type Rect,
} from '@/services/person/geometry';
import {
  loadPersonModel,
  PersonModelError,
  type InputLayout,
  type InputType,
  type SsdPlan,
  type YoloPlan,
} from '@/services/person/model';

export type PersonBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  score: number;
  inRoi: boolean;
  strong: boolean;
  scope: PersonScopeAnchor | null;
  fit: Rect;
};

export type DetectionFrame = {
  uri: string;
  width: number;
  height: number;
};

export type DetectionStats = {
  reported: number;
  scanned: number;
  decoded: number;
  merged: number;
  accepted: number;
  topScore: number;
  kind: PersonModelKind;
  target: PersonTarget;
  minScore: number;
  sustainScore: number;
};

export type DetectionOutcome =
  | { ok: true; boxes: PersonBox[]; stats: DetectionStats }
  | { ok: false; reason: 'frame' | 'model' };

type Pixels = {
  rgba: Uint8Array;
  width: number;
  height: number;
  uri: string;
};

let scoresFirst: boolean | null = null;

export function resetRoleResolution() {
  scoresFirst = null;
}

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

function createTensor(inputType: InputType, total: number) {
  if (inputType === 'uint8') return new Uint8Array(total);
  if (inputType === 'int8') return new Int8Array(total);
  return new Float32Array(total);
}

function pixelEncoder(inputType: InputType, kind: PersonModelKind): (value: number) => number {
  if (inputType === 'uint8') return (value) => value;
  if (inputType === 'int8') return (value) => value - 128;
  if (kind === 'yolo') return (value) => value / 255;
  return (value) => (value - 127.5) / 127.5;
}

function buildTensor(
  pixels: Pixels,
  inputSize: number,
  inputType: InputType,
  inputLayout: InputLayout,
  kind: PersonModelKind,
) {
  const padX = Math.max(0, Math.floor((inputSize - pixels.width) / 2));
  const padY = Math.max(0, Math.floor((inputSize - pixels.height) / 2));
  const plane = inputSize * inputSize;
  const tensor = createTensor(inputType, plane * 3);
  const encode = pixelEncoder(inputType, kind);
  const channelStride = inputLayout === 'nchw' ? plane : 1;
  const pixelStride = inputLayout === 'nchw' ? 1 : 3;

  for (let y = 0; y < pixels.height; y += 1) {
    const targetRow = (y + padY) * inputSize;
    const sourceRow = y * pixels.width;
    for (let x = 0; x < pixels.width; x += 1) {
      const source = (sourceRow + x) * 4;
      const target = (targetRow + x + padX) * pixelStride;
      tensor[target] = encode(pixels.rgba[source]);
      tensor[target + channelStride] = encode(pixels.rgba[source + 1]);
      tensor[target + channelStride * 2] = encode(pixels.rgba[source + 2]);
    }
  }

  return { tensor, padX, padY };
}

function asFloat32(value: unknown): Float32Array {
  if (value instanceof Float32Array) return value;

  if (value instanceof ArrayBuffer) {
    return new Float32Array(value, 0, Math.floor(value.byteLength / 4));
  }

  if (ArrayBuffer.isView(value) && typeof (value as { length?: number }).length === 'number') {
    return Float32Array.from(value as unknown as ArrayLike<number>);
  }

  return new Float32Array(0);
}

function integral(values: Float32Array, limit: number): boolean {
  for (let index = 0; index < limit; index += 1) {
    if (Math.abs(values[index] - Math.round(values[index])) > 1e-3) return false;
  }
  return true;
}

function bounded(values: Float32Array, limit: number): boolean {
  for (let index = 0; index < limit; index += 1) {
    const value = values[index];
    if (!Number.isFinite(value) || value < 0 || value > 1) return false;
  }
  return true;
}

function resolveRoles(first: Float32Array, second: Float32Array, limit: number) {
  const conventional = { scores: second, classes: first };
  const flipped = { scores: first, classes: second };

  if (limit > 0) {
    const firstBounded = bounded(first, limit);
    const secondBounded = bounded(second, limit);

    if (firstBounded !== secondBounded) {
      scoresFirst = firstBounded;
      return firstBounded ? flipped : conventional;
    }

    const firstIntegral = integral(first, limit);
    const secondIntegral = integral(second, limit);

    if (firstIntegral !== secondIntegral) {
      scoresFirst = secondIntegral;
      return secondIntegral ? flipped : conventional;
    }
  }

  return scoresFirst === true ? flipped : conventional;
}

function withinScope(
  box: PersonBox,
  roi: PersonRoi,
  scope: PersonScope,
  frameAspect: number,
): boolean {
  if (box.score < Math.min(scope.minScore, scope.sustainScore)) return false;

  const width = box.right - box.left;
  const height = box.bottom - box.top;
  if (width < scope.minBoxWidth) return false;
  if (height < scope.minBoxHeight) return false;
  if (width * height > scope.maxArea) return false;

  if (frameAspect > 0 && width > 0) {
    const aspect = height / width / frameAspect;
    if (aspect < scope.minAspect) return false;
    if (aspect > scope.maxAspect) return false;
  }

  const centreX = (box.left + box.right) / 2;
  if (centreX < roi.left || centreX > roi.right) return false;

  if (scope.anchor === 'foot') {
    return box.bottom >= roi.top && box.bottom <= roi.bottom;
  }

  const centreY = (box.top + box.bottom) / 2;
  return centreY >= roi.top && centreY <= roi.bottom;
}

export function acceptedBy(
  box: PersonBox,
  roi: PersonRoi,
  scopes: readonly PersonScope[],
  frameAspect: number,
): PersonScope | null {
  for (const scope of scopes) {
    if (withinScope(box, roi, scope, frameAspect)) return scope;
  }
  return null;
}

function loosestGate(scopes: readonly PersonScope[]) {
  return scopes.reduce(
    (gate, scope) => ({
      minScore: Math.min(gate.minScore, scope.minScore, scope.sustainScore),
      minBoxWidth: Math.min(gate.minBoxWidth, scope.minBoxWidth),
      minBoxHeight: Math.min(gate.minBoxHeight, scope.minBoxHeight),
    }),
    {
      minScore: Number.POSITIVE_INFINITY,
      minBoxWidth: Number.POSITIVE_INFINITY,
      minBoxHeight: Number.POSITIVE_INFINITY,
    },
  );
}

export function dropGroupBoxes(boxes: PersonBox[]): PersonBox[] {
  if (boxes.length < 3) return boxes;

  return boxes.filter((outer) => {
    const outerArea = rectArea(outer);
    const members = boxes.filter(
      (inner) =>
        inner !== outer &&
        rectArea(inner) < outerArea &&
        rectArea(inner) >= outerArea * PERSON_DETECTION.groupMemberMinShare &&
        intersectionOverSmaller(outer, inner) >= PERSON_DETECTION.containmentThreshold,
    );

    const holdsTwoPeople = members.some((first, index) =>
      members
        .slice(index + 1)
        .some(
          (second) =>
            intersectionOverSmaller(first, second) < PERSON_DETECTION.groupSplitOverlap,
        ),
    );

    return !holdsTwoPeople;
  });
}

export function suppressDuplicates(boxes: PersonBox[]): PersonBox[] {
  if (boxes.length < 2) return boxes;

  const ordered = dropGroupBoxes(boxes).sort((a, b) => b.score - a.score);
  const kept: PersonBox[] = [];

  for (const candidate of ordered) {
    let absorbed = false;

    for (let index = 0; index < kept.length; index += 1) {
      const winner = kept[index];
      const overlaps =
        intersectionOverUnion(winner, candidate) >= PERSON_DETECTION.nmsIouThreshold;
      const nested =
        intersectionOverSmaller(winner, candidate) >= PERSON_DETECTION.containmentThreshold;
      if (!overlaps && !nested) continue;

      const merged = unionRect(winner, candidate);
      if (!nested && rectArea(merged) > rectArea(winner) * PERSON_DETECTION.maxMergeGrowth) {
        continue;
      }

      kept[index] = { ...winner, ...merged };
      absorbed = true;
      break;
    }

    if (!absorbed) kept.push(candidate);
  }

  return kept;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

type Letterbox = {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
};

type Gate = ReturnType<typeof loosestGate>;

type Decoded = {
  candidates: PersonBox[];
  reported: number;
  scanned: number;
  topScore: number;
};

function candidateBox(
  score: number,
  top: number,
  left: number,
  bottom: number,
  right: number,
  letterbox: Letterbox,
  gate: Gate,
): PersonBox | null {
  const boxTop = clamp01((top - letterbox.offsetY) * letterbox.scaleY);
  const boxLeft = clamp01((left - letterbox.offsetX) * letterbox.scaleX);
  const boxBottom = clamp01((bottom - letterbox.offsetY) * letterbox.scaleY);
  const boxRight = clamp01((right - letterbox.offsetX) * letterbox.scaleX);

  if (boxRight - boxLeft < gate.minBoxWidth) return null;
  if (boxBottom - boxTop < gate.minBoxHeight) return null;

  return {
    left: boxLeft,
    top: boxTop,
    right: boxRight,
    bottom: boxBottom,
    score,
    inRoi: false,
    strong: false,
    scope: null,
    fit: { left: boxLeft, top: boxTop, right: boxRight, bottom: boxBottom },
  };
}

function decodeSsd(
  outputs: unknown[],
  plan: SsdPlan,
  letterbox: Letterbox,
  gate: Gate,
): Decoded {
  const boxTensor = asFloat32(outputs[plan.boxes]);
  const countTensor = asFloat32(outputs[plan.count]);
  const firstPair = asFloat32(outputs[plan.pair[0]]);
  const secondPair = asFloat32(outputs[plan.pair[1]]);

  const available = Math.min(
    PERSON_MAX_DETECTIONS,
    Math.floor(boxTensor.length / 4),
    firstPair.length,
    secondPair.length,
  );

  const reported = Math.trunc(countTensor[0] ?? 0);
  const limit = reported > 0 ? Math.min(reported, available) : available;

  const roles = resolveRoles(firstPair, secondPair, limit);
  const candidates: PersonBox[] = [];
  let topScore = 0;

  for (let index = 0; index < limit; index += 1) {
    const score = roles.scores[index];
    if (!Number.isFinite(score)) continue;

    const classIndex = Math.round(roles.classes[index]);
    if (!Number.isFinite(classIndex) || classIndex !== PERSON_CLASS_INDEX) continue;

    if (score > topScore) topScore = score;
    if (score < gate.minScore) continue;

    const box = candidateBox(
      score,
      boxTensor[index * 4],
      boxTensor[index * 4 + 1],
      boxTensor[index * 4 + 2],
      boxTensor[index * 4 + 3],
      letterbox,
      gate,
    );
    if (box) candidates.push(box);
  }

  return { candidates, reported, scanned: limit, topScore };
}

export function nonMaxSuppression(boxes: PersonBox[], threshold: number): PersonBox[] {
  const ordered = [...boxes].sort((a, b) => b.score - a.score);
  const kept: PersonBox[] = [];

  for (const candidate of ordered) {
    if (kept.some((winner) => intersectionOverUnion(winner, candidate) >= threshold)) continue;
    kept.push(candidate);
    if (kept.length >= PERSON_MAX_DETECTIONS) break;
  }

  return kept;
}

function decodeYolo(
  outputs: unknown[],
  plan: YoloPlan,
  inputSize: number,
  letterbox: Letterbox,
  gate: Gate,
): Decoded {
  const raw = asFloat32(outputs[plan.output]);
  const { channels, anchors, channelsFirst } = plan;
  const scanned = Math.min(anchors, Math.floor(raw.length / channels));
  const classIndex = plan.target === 'head' ? HEAD_CLASS_INDEX : PERSON_CLASS_INDEX;
  const scoreChannel = 4 + Math.min(classIndex, channels - 5);

  const read = channelsFirst
    ? (channel: number, anchor: number) => raw[channel * anchors + anchor]
    : (channel: number, anchor: number) => raw[anchor * channels + channel];

  const passed: PersonBox[] = [];
  let topScore = 0;

  for (let anchor = 0; anchor < scanned; anchor += 1) {
    const score = read(scoreChannel, anchor);
    if (!Number.isFinite(score)) continue;
    if (score > topScore) topScore = score;
    if (score < gate.minScore) continue;

    const centreX = read(0, anchor);
    const centreY = read(1, anchor);
    const width = read(2, anchor);
    const height = read(3, anchor);
    const unit = Math.max(centreX, centreY, width, height) > 1.5 ? inputSize : 1;

    const box = candidateBox(
      score,
      (centreY - height / 2) / unit,
      (centreX - width / 2) / unit,
      (centreY + height / 2) / unit,
      (centreX + width / 2) / unit,
      letterbox,
      gate,
    );
    if (box) passed.push(box);
  }

  return {
    candidates: nonMaxSuppression(dropGroupBoxes(passed), PERSON_DETECTION.yoloNmsIouThreshold),
    reported: passed.length,
    scanned,
    topScore,
  };
}

export async function detectPeople(
  frame: DetectionFrame,
  roi: PersonRoi = PERSON_ROI_WIDE,
  override?: readonly PersonScope[],
): Promise<DetectionOutcome> {
  let loaded;
  try {
    loaded = await loadPersonModel();
  } catch (error) {
    if (error instanceof PersonModelError) throw error;
    return { ok: false, reason: 'model' };
  }

  const { model, kind, target, inputSize, inputLayout, inputType, plan } = loaded;
  const scopes = override ?? PERSON_SCOPES_BY_TARGET[target];

  const pixels = await toPixels(frame, inputSize);
  if (!pixels) return { ok: false, reason: 'frame' };

  const { tensor, padX, padY } = buildTensor(pixels, inputSize, inputType, inputLayout, kind);
  discardFile(pixels.uri);

  let outputs: unknown[];
  try {
    outputs = (await model.run([tensor.buffer as ArrayBuffer])) as unknown[];
  } catch {
    return { ok: false, reason: 'model' };
  }

  const letterbox: Letterbox = {
    scaleX: inputSize / pixels.width,
    scaleY: inputSize / pixels.height,
    offsetX: padX / inputSize,
    offsetY: padY / inputSize,
  };
  const gate = loosestGate(scopes);

  const decoded =
    plan.kind === 'yolo'
      ? decodeYolo(outputs, plan, inputSize, letterbox, gate)
      : decodeSsd(outputs, plan, letterbox, gate);

  const boxes = kind === 'yolo' ? decoded.candidates : suppressDuplicates(decoded.candidates);
  const frameAspect = frame.height > 0 ? frame.width / frame.height : 0;
  let accepted = 0;

  for (const box of boxes) {
    const scope = acceptedBy(box, roi, scopes, frameAspect);
    box.inRoi = scope !== null;
    box.strong = scopes.some(
      (candidate) =>
        box.score >= candidate.minScore && withinScope(box, roi, candidate, frameAspect),
    );
    box.scope = scope ? scope.anchor : null;
    if (scope) accepted += 1;
  }

  return {
    ok: true,
    boxes,
    stats: {
      reported: decoded.reported,
      scanned: decoded.scanned,
      decoded: decoded.candidates.length,
      merged: boxes.length,
      accepted,
      topScore: decoded.topScore,
      kind,
      target,
      minScore: Math.min(...scopes.map((scope) => scope.minScore)),
      sustainScore: Math.min(...scopes.map((scope) => scope.sustainScore)),
    },
  };
}
