#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const defaultModelPath = path.join(root, 'src/assets/models/person-detector.tflite');

const TENSOR_TYPES = {
  0: 'float32',
  1: 'float16',
  2: 'int32',
  3: 'uint8',
  4: 'int64',
  5: 'string',
  6: 'bool',
  7: 'int16',
  8: 'complex64',
  9: 'int8',
  10: 'float64',
  11: 'complex128',
  12: 'uint64',
  13: 'resource',
  14: 'variant',
  15: 'uint32',
  16: 'uint16',
  17: 'int4',
};

function createReader(data) {
  const field = (table, index) => {
    const vtable = table - data.readInt32LE(table);
    const vtableLength = data.readUInt16LE(vtable);
    const position = 4 + index * 2;
    if (position >= vtableLength) return null;
    const offset = data.readUInt16LE(vtable + position);
    return offset === 0 ? null : table + offset;
  };

  const indirect = (position) => position + data.readUInt32LE(position);

  const vector = (position) => {
    const start = indirect(position);
    return { start: start + 4, count: data.readUInt32LE(start) };
  };

  return { field, indirect, vector };
}

function describeTensor(data, reader, tensorsStart, index) {
  const tensor = reader.indirect(tensorsStart + index * 4);

  const shapePosition = reader.field(tensor, 0);
  let shape = [];
  if (shapePosition !== null) {
    const { start, count } = reader.vector(shapePosition);
    shape = Array.from({ length: count }, (_, i) => data.readInt32LE(start + i * 4));
  }

  const typePosition = reader.field(tensor, 1);
  const code = typePosition === null ? 0 : data.readInt8(typePosition);

  return { shape, dtype: TENSOR_TYPES[code] ?? `type#${code}` };
}

function elementCount(shape) {
  return shape.reduce((total, value) => total * (value > 0 ? value : 1), 1);
}

function inspect(modelPath) {
  const data = fs.readFileSync(modelPath);

  console.log(`file: ${path.relative(root, modelPath) || modelPath}`);
  console.log(`size: ${data.length.toLocaleString()} bytes`);

  if (data.length < 8) {
    return ['file is too small to be a TFLite model'];
  }

  const identifier = data.subarray(4, 8).toString('binary');
  if (identifier !== 'TFL3') {
    console.log(`magic: ${JSON.stringify(identifier)} (expected "TFL3")`);
    console.log(`head:  ${data.subarray(0, 40).toString('utf8').trim()}`);
    return ['not a TFLite FlatBuffer'];
  }

  const reader = createReader(data);
  const model = reader.indirect(0);

  const subgraphsPosition = reader.field(model, 2);
  if (subgraphsPosition === null) return ['model has no subgraphs'];
  const subgraphs = reader.vector(subgraphsPosition);
  if (subgraphs.count < 1) return ['model has no subgraphs'];

  const subgraph = reader.indirect(subgraphs.start);
  const tensorsPosition = reader.field(subgraph, 0);
  const inputsPosition = reader.field(subgraph, 1);
  const outputsPosition = reader.field(subgraph, 2);
  if (tensorsPosition === null || inputsPosition === null || outputsPosition === null) {
    return ['subgraph is missing tensors, inputs or outputs'];
  }

  const tensors = reader.vector(tensorsPosition);
  const inputs = reader.vector(inputsPosition);
  const outputs = reader.vector(outputsPosition);
  const problems = [];

  console.log('');

  if (inputs.count !== 1) {
    problems.push(`model has ${inputs.count} inputs, expected 1`);
  }

  for (let i = 0; i < inputs.count; i += 1) {
    const index = data.readInt32LE(inputs.start + i * 4);
    const { shape, dtype } = describeTensor(data, reader, tensors.start, index);
    console.log(`input  ${i}: [${shape}] ${dtype}`);
    if (i > 0) continue;

    if (shape.length !== 4 || shape[3] !== 3) {
      problems.push(`input shape is [${shape}], expected [1, size, size, 3]`);
    } else if (shape[1] !== shape[2] || shape[1] <= 0) {
      problems.push(`input must be square, got ${shape[2]}x${shape[1]}`);
    } else {
      console.log(`       input size resolves to ${shape[1]}`);
    }

    if (dtype !== 'uint8' && dtype !== 'int8' && dtype !== 'float32') {
      problems.push(`input dtype is ${dtype}, expected uint8, int8 or float32`);
    }
  }

  let boxes = -1;
  let count = -1;
  const pair = [];
  let undeclared = 0;

  for (let i = 0; i < outputs.count; i += 1) {
    const index = data.readInt32LE(outputs.start + i * 4);
    const { shape, dtype } = describeTensor(data, reader, tensors.start, index);
    console.log(`output ${i}: [${shape}] ${dtype}`);

    if (shape.length === 0) {
      undeclared += 1;
    } else if (shape.length === 3 && shape[shape.length - 1] === 4) {
      boxes = i;
    } else if (elementCount(shape) === 1) {
      count = i;
    } else if (shape.length === 2) {
      pair.push(i);
    }
  }

  if (boxes >= 0 && count >= 0 && pair.length === 2) {
    console.log('');
    console.log(`plan:  boxes=${boxes} count=${count} scores/classes=${pair[0]},${pair[1]}`);
    return problems;
  }

  if (undeclared === 4 && outputs.count === 4) {
    console.log('');
    console.log('note:  all four output shapes are dynamic, which is the normal signature for');
    console.log('       TFLite_Detection_PostProcess. They resolve when the interpreter');
    console.log('       allocates tensors, and the loader falls back to the conventional');
    console.log('       order: boxes=0 classes=1 scores=2 count=3.');
    return problems;
  }

  if (boxes < 0) {
    problems.push('no [1, N, 4] box tensor found, and the outputs are not the 4 dynamic tensors of TFLite_Detection_PostProcess');
  }
  if (count < 0) {
    problems.push('no scalar detection-count tensor found');
  }
  if (pair.length !== 2) {
    problems.push(`found ${pair.length} [1, N] tensors, expected exactly 2 (scores and classes)`);
  }

  return problems;
}

function main() {
  const target = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : defaultModelPath;

  let problems;
  try {
    problems = inspect(target);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`FAIL: no such file: ${target}`);
      return 2;
    }
    console.log(`FAIL: could not parse as TFLite (${error.name}: ${error.message})`);
    return 2;
  }

  console.log('');
  if (problems.length === 0) {
    console.log('PASS: matches the contract in src/services/person/model.ts');
    return 0;
  }

  for (const problem of problems) {
    console.log(`FAIL: ${problem}`);
  }
  return 1;
}

process.exit(main());
