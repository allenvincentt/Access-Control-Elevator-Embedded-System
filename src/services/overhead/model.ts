import { Asset } from 'expo-asset';
import type { Tensor, TensorflowModel } from 'react-native-fast-tflite';

import { AppError } from '@/lib/errors';
import {
  OVERHEAD_MODEL_FAILURES,
  type OverheadModelFailure,
} from '@/services/overhead/constants';

type LoadModel = (source: { url: string }, delegates: []) => Promise<TensorflowModel>;

export class OverheadModelError extends AppError {
  readonly failure: OverheadModelFailure;
  readonly detail: string | null;

  constructor(failure: OverheadModelFailure, detail: string | null = null) {
    super(failure, OVERHEAD_MODEL_FAILURES[failure].admin);
    this.name = 'OverheadModelError';
    this.failure = failure;
    this.detail = detail;
  }
}

export type OverheadModel = {
  model: TensorflowModel;
  inputSize: number;
  channelsFirstInput: boolean;
  channels: number;
  anchors: number;
  channelsFirstOutput: boolean;
};

export type OverheadModelState =
  | { ready: true; inputSize: number; classes: number }
  | { ready: false; failure: OverheadModelFailure; detail: string | null };

let pending: Promise<OverheadModel> | null = null;

function describe(error: unknown): string | null {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return null;
}

function loader(): LoadModel {
  try {
    const module = require('react-native-fast-tflite') as { loadTensorflowModel?: LoadModel };
    if (typeof module?.loadTensorflowModel !== 'function') throw new Error('missing loadTensorflowModel');
    return module.loadTensorflowModel;
  } catch (error) {
    throw new OverheadModelError('OVERHEAD_MODEL_UNAVAILABLE', describe(error));
  }
}

async function modelUrl(): Promise<string> {
  try {
    const asset = Asset.fromModule(require('../../assets/models/person-detector.tflite'));
    await asset.downloadAsync();
    const url = asset.localUri ?? asset.uri;
    if (!url || !url.includes(':')) throw new Error(`asset resolved to "${url ?? 'null'}"`);
    return url;
  } catch (error) {
    throw new OverheadModelError('OVERHEAD_MODEL_MISSING', describe(error));
  }
}

function readInput(input: Tensor | undefined) {
  const shape = input?.shape ?? [];
  if (!input || shape.length !== 4 || input.dataType !== 'float32') {
    throw new OverheadModelError(
      'OVERHEAD_MODEL_UNSUPPORTED',
      `input ${JSON.stringify(shape)} ${input?.dataType ?? 'none'}`,
    );
  }
  const channelsFirstInput = shape[1] === 3 && shape[3] !== 3;
  const height = channelsFirstInput ? shape[2] : shape[1];
  const width = channelsFirstInput ? shape[3] : shape[2];
  if (height <= 0 || height !== width) {
    throw new OverheadModelError('OVERHEAD_MODEL_UNSUPPORTED', `input must be square, got ${width}x${height}`);
  }
  return { inputSize: height, channelsFirstInput };
}

function readOutput(outputs: Tensor[]) {
  const output = outputs[0];
  const shape = output?.shape ?? [];
  if (outputs.length !== 1 || shape.length !== 3 || output.dataType !== 'float32') {
    throw new OverheadModelError(
      'OVERHEAD_MODEL_UNSUPPORTED',
      outputs.map((tensor) => `${tensor.name}${JSON.stringify(tensor.shape)} ${tensor.dataType}`).join(', '),
    );
  }
  const channelsFirstOutput = shape[1] < shape[2];
  const channels = channelsFirstOutput ? shape[1] : shape[2];
  const anchors = channelsFirstOutput ? shape[2] : shape[1];
  if (channels < 5 || anchors <= 0) {
    throw new OverheadModelError('OVERHEAD_MODEL_UNSUPPORTED', `output ${JSON.stringify(shape)}`);
  }
  return { channels, anchors, channelsFirstOutput };
}

export function loadOverheadModel(): Promise<OverheadModel> {
  if (!pending) {
    const load = loader();
    pending = modelUrl()
      .then((url) => load({ url }, []))
      .then((model) => ({ model, ...readInput(model.inputs[0]), ...readOutput(model.outputs) }))
      .catch((error: unknown) => {
        pending = null;
        if (error instanceof OverheadModelError) throw error;
        throw new OverheadModelError('OVERHEAD_MODEL_LOAD_FAILED', describe(error));
      });
  }
  return pending;
}

export async function warmUpOverheadModel(): Promise<OverheadModelState> {
  try {
    const loaded = await loadOverheadModel();
    return { ready: true, inputSize: loaded.inputSize, classes: loaded.channels - 4 };
  } catch (error) {
    if (error instanceof OverheadModelError) {
      return { ready: false, failure: error.failure, detail: error.detail };
    }
    return { ready: false, failure: 'OVERHEAD_MODEL_LOAD_FAILED', detail: describe(error) };
  }
}
