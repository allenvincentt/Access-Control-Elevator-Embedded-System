import { Asset } from 'expo-asset';
import type { Tensor, TensorflowModel } from 'react-native-fast-tflite';

import { AppError } from '@/lib/errors';
import {
  PERSON_MODEL_FAILURE_MESSAGES,
  type PersonModelFailureCode,
} from '@/services/person/constants';

type LoadModel = (
  source: number | { url: string },
  delegates: ('metal' | 'core-ml' | 'nnapi' | 'android-gpu')[],
) => Promise<TensorflowModel>;

export class PersonModelError extends AppError {
  readonly failure: PersonModelFailureCode;
  readonly detail: string | null;

  constructor(failure: PersonModelFailureCode, detail: string | null = null) {
    super(failure, PERSON_MODEL_FAILURE_MESSAGES[failure].admin);
    this.name = 'PersonModelError';
    this.failure = failure;
    this.detail = detail;
  }
}

export type PersonModelState =
  | { ready: true; inputSize: number; quantized: boolean }
  | { ready: false; failure: PersonModelFailureCode; detail: string | null };

export type OutputPlan = {
  boxes: number;
  count: number;
  pair: [number, number];
};

export type LoadedPersonModel = {
  model: TensorflowModel;
  inputSize: number;
  quantized: boolean;
  plan: OutputPlan;
};

let modelPromise: Promise<LoadedPersonModel> | null = null;

function describe(error: unknown): string | null {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return null;
}

function resolveLoader(): LoadModel {
  try {
    const module = require('react-native-fast-tflite') as { loadTensorflowModel: LoadModel };
    if (typeof module?.loadTensorflowModel !== 'function') {
      throw new Error('missing loadTensorflowModel');
    }
    return module.loadTensorflowModel;
  } catch (error) {
    throw new PersonModelError('PERSON_MODEL_UNAVAILABLE', describe(error));
  }
}

async function resolveModelUrl(): Promise<string> {
  let asset: Asset;
  try {
    asset = Asset.fromModule(require('../../assets/models/person-detector.tflite'));
    await asset.downloadAsync();
  } catch (error) {
    throw new PersonModelError('PERSON_MODEL_MISSING', describe(error));
  }

  const url = asset.localUri ?? asset.uri;
  if (!url || !url.includes(':')) {
    throw new PersonModelError(
      'PERSON_MODEL_MISSING',
      `The asset resolved to "${url ?? 'null'}", which is not a readable URL.`,
    );
  }
  return url;
}

function elementCount(tensor: Tensor): number {
  return tensor.shape.reduce((total, value) => total * (value > 0 ? value : 1), 1);
}

function planOutputs(outputs: Tensor[]): OutputPlan {
  let boxes = -1;
  let count = -1;
  const pair: number[] = [];

  outputs.forEach((tensor, index) => {
    const shape = tensor.shape;
    if (shape.length === 3 && shape[shape.length - 1] === 4) {
      boxes = index;
      return;
    }
    if (shape.length > 0 && elementCount(tensor) === 1) {
      count = index;
      return;
    }
    if (shape.length === 2) {
      pair.push(index);
    }
  });

  if (boxes >= 0 && count >= 0 && pair.length === 2) {
    return { boxes, count, pair: [pair[0], pair[1]] };
  }

  if (outputs.length === 4) {
    return { boxes: 0, count: 3, pair: [1, 2] };
  }

  throw new PersonModelError(
    'PERSON_MODEL_UNSUPPORTED',
    `outputs: ${outputs.map((tensor) => `${tensor.name}${JSON.stringify(tensor.shape)}`).join(', ')}`,
  );
}

function resolveInputSize(input: Tensor | undefined): number {
  if (!input || input.shape.length !== 4) {
    throw new PersonModelError(
      'PERSON_MODEL_UNSUPPORTED',
      `input shape ${JSON.stringify(input?.shape ?? [])} is not [1, size, size, 3]`,
    );
  }
  const height = input.shape[1];
  const width = input.shape[2];
  if (height <= 0 || width <= 0 || height !== width) {
    throw new PersonModelError(
      'PERSON_MODEL_UNSUPPORTED',
      `input must be square, got ${width}x${height}`,
    );
  }
  return height;
}

export async function loadPersonModel(): Promise<LoadedPersonModel> {
  if (!modelPromise) {
    const loadTensorflowModel = resolveLoader();
    modelPromise = resolveModelUrl()
      .then((url) => loadTensorflowModel({ url }, []))
      .then((model) => {
        const input = model.inputs[0];
        const inputSize = resolveInputSize(input);
        const quantized = input.dataType === 'uint8' || input.dataType === 'int8';
        return { model, inputSize, quantized, plan: planOutputs(model.outputs) };
      })
      .catch((error: unknown) => {
        modelPromise = null;
        if (error instanceof PersonModelError) throw error;
        throw new PersonModelError('PERSON_MODEL_LOAD_FAILED', describe(error));
      });
  }
  return modelPromise;
}

export async function warmUpPersonModel(): Promise<PersonModelState> {
  try {
    const loaded = await loadPersonModel();
    return { ready: true, inputSize: loaded.inputSize, quantized: loaded.quantized };
  } catch (error) {
    if (error instanceof PersonModelError) {
      return { ready: false, failure: error.failure, detail: error.detail };
    }
    return {
      ready: false,
      failure: 'PERSON_MODEL_LOAD_FAILED',
      detail: describe(error),
    };
  }
}
