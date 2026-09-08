import { Asset } from 'expo-asset';
import type { TensorflowModel } from 'react-native-fast-tflite';

import { AppError } from '@/lib/errors';
import {
  FACE_EMBEDDING_SIZE,
  FACE_INPUT_SIZE,
  FACE_MODEL_FAILURE_MESSAGES,
  type FaceModelFailureCode,
} from '@/services/face/constants';

type LoadModel = (
  source: number | { url: string },
  delegates: ('metal' | 'core-ml' | 'nnapi' | 'android-gpu')[],
) => Promise<TensorflowModel>;

export class FaceModelError extends AppError {
  readonly failure: FaceModelFailureCode;
  readonly detail: string | null;

  constructor(failure: FaceModelFailureCode, detail: string | null = null) {
    super(failure, FACE_MODEL_FAILURE_MESSAGES[failure].admin);
    this.name = 'FaceModelError';
    this.failure = failure;
    this.detail = detail;
  }
}

export type FaceModelState =
  | { ready: true }
  | { ready: false; failure: FaceModelFailureCode; detail: string | null };

let modelPromise: Promise<TensorflowModel> | null = null;

function resolveLoader(): LoadModel {
  try {
    const module = require('react-native-fast-tflite') as { loadTensorflowModel: LoadModel };
    if (typeof module?.loadTensorflowModel !== 'function') {
      throw new Error('missing loadTensorflowModel');
    }
    return module.loadTensorflowModel;
  } catch (error) {
    throw new FaceModelError('FACE_MODEL_UNAVAILABLE', describe(error));
  }
}

async function resolveModelUrl(): Promise<string> {
  let asset: Asset;
  try {
    asset = Asset.fromModule(require('../../assets/models/mobilefacenet.tflite'));
    await asset.downloadAsync();
  } catch (error) {
    throw new FaceModelError('FACE_MODEL_MISSING', describe(error));
  }

  const url = asset.localUri ?? asset.uri;
  if (!url || !url.includes(':')) {
    throw new FaceModelError(
      'FACE_MODEL_MISSING',
      `The asset resolved to "${url ?? 'null'}", which is not a readable URL.`,
    );
  }
  return url;
}

function describe(error: unknown): string | null {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return null;
}

export async function loadFaceModel(): Promise<TensorflowModel> {
  if (!modelPromise) {
    const loadTensorflowModel = resolveLoader();
    modelPromise = resolveModelUrl()
      .then((url) => loadTensorflowModel({ url }, []))
      .catch((error: unknown) => {
        modelPromise = null;
        if (error instanceof FaceModelError) throw error;
        throw new FaceModelError('FACE_MODEL_LOAD_FAILED', describe(error));
      });
  }
  return modelPromise;
}

export async function warmUpFaceModel(): Promise<FaceModelState> {
  try {
    await loadFaceModel();
    return { ready: true };
  } catch (error) {
    if (error instanceof FaceModelError) {
      return { ready: false, failure: error.failure, detail: error.detail };
    }
    return { ready: false, failure: 'FACE_MODEL_LOAD_FAILED', detail: describe(error) };
  }
}

export function buildInputTensor(rgba: Uint8Array): Float32Array {
  const pixels = FACE_INPUT_SIZE * FACE_INPUT_SIZE;
  if (rgba.length < pixels * 4) {
    throw new AppError('FACE_PIXELS_INVALID', 'The face crop could not be decoded.');
  }

  const tensor = new Float32Array(pixels * 3);
  for (let index = 0; index < pixels; index += 1) {
    const source = index * 4;
    const target = index * 3;
    tensor[target] = (rgba[source] - 127.5) / 128;
    tensor[target + 1] = (rgba[source + 1] - 127.5) / 128;
    tensor[target + 2] = (rgba[source + 2] - 127.5) / 128;
  }
  return tensor;
}

export async function computeEmbedding(rgba: Uint8Array): Promise<number[]> {
  const model = await loadFaceModel();
  const tensor = buildInputTensor(rgba);

  const outputs = await model.run([tensor.buffer as ArrayBuffer]);
  const first = outputs?.[0];
  if (!first) {
    throw new AppError('FACE_MODEL_NO_OUTPUT', 'The face model returned no output.');
  }

  const raw = first instanceof Float32Array ? first : new Float32Array(first as ArrayBuffer);
  if (raw.length !== FACE_EMBEDDING_SIZE) {
    throw new AppError(
      'FACE_EMBEDDING_SIZE',
      `The model produced a ${raw.length}-dimension embedding but the database expects ${FACE_EMBEDDING_SIZE}. Update embedding_dimensions in app_config and the vector column, or use a ${FACE_EMBEDDING_SIZE}-d MobileFaceNet model.`,
    );
  }

  return normalise(raw);
}

function normalise(values: Float32Array): number[] {
  let sumOfSquares = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!Number.isFinite(value)) {
      throw new AppError('FACE_EMBEDDING_INVALID', 'The face model produced an invalid embedding.');
    }
    sumOfSquares += value * value;
  }

  const norm = Math.sqrt(sumOfSquares);
  if (!Number.isFinite(norm) || norm < 1e-6) {
    throw new AppError('FACE_EMBEDDING_INVALID', 'The face model produced an invalid embedding.');
  }

  const result = new Array<number>(values.length);
  for (let index = 0; index < values.length; index += 1) {
    result[index] = values[index] / norm;
  }
  return result;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
  }
  return dot;
}
