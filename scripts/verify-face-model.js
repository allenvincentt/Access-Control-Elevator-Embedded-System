#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const constantsPath = path.join(root, 'src/services/face/constants.ts');
const defaultModelPath = path.join(root, 'src/assets/models/mobilefacenet.tflite');

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

function readContract() {
  const fallback = { inputSize: 112, embeddingSize: 128 };
  let source;
  try {
    source = fs.readFileSync(constantsPath, 'utf8');
  } catch {
    return fallback;
  }

  const inputSize = source.match(/FACE_INPUT_SIZE\s*=\s*(\d+)/);
  const embeddingSize = source.match(/FACE_EMBEDDING_SIZE\s*=\s*(\d+)/);

  return {
    inputSize: inputSize ? Number(inputSize[1]) : fallback.inputSize,
    embeddingSize: embeddingSize ? Number(embeddingSize[1]) : fallback.embeddingSize,
  };
}

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

function sameShape(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function inspect(modelPath, contract) {
  const data = fs.readFileSync(modelPath);
  const expectedInput = [1, contract.inputSize, contract.inputSize, 3];
  const expectedOutput = [1, contract.embeddingSize];

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

  for (let i = 0; i < inputs.count; i += 1) {
    const index = data.readInt32LE(inputs.start + i * 4);
    const { shape, dtype } = describeTensor(data, reader, tensors.start, index);
    console.log(`input  ${i}: [${shape}] ${dtype}`);
    if (i > 0) continue;
    if (!sameShape(shape, expectedInput)) {
      problems.push(`input shape is [${shape}], expected [${expectedInput}]`);
    }
    if (dtype !== 'float32') {
      problems.push(`input dtype is ${dtype}, expected float32 (quantized models will not work)`);
    }
  }

  for (let i = 0; i < outputs.count; i += 1) {
    const index = data.readInt32LE(outputs.start + i * 4);
    const { shape, dtype } = describeTensor(data, reader, tensors.start, index);
    console.log(`output ${i}: [${shape}] ${dtype}`);
    if (i > 0) continue;
    if (dtype !== 'float32') {
      problems.push(`output dtype is ${dtype}, expected float32`);
    }
    if (!sameShape(shape, expectedOutput)) {
      if (shape.length === 2 && shape[0] === 1) {
        problems.push(
          `output is ${shape[1]}-dimensional but the app expects ${contract.embeddingSize}. ` +
            'Change FACE_EMBEDDING_SIZE, the extensions.vector() column in ' +
            'supabase/migrations/0004_biometrics_and_logs.sql and embedding_dimensions in ' +
            'app_config together, then re-enrol every staff member.',
        );
      } else {
        problems.push(`output shape is [${shape}], expected [${expectedOutput}]`);
      }
    }
  }

  if (inputs.count !== 1) {
    problems.push(`model has ${inputs.count} inputs, expected 1`);
  }

  return problems;
}

function main() {
  const target = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : defaultModelPath;
  const contract = readContract();

  let problems;
  try {
    problems = inspect(target, contract);
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
    console.log('PASS: matches the contract in src/services/face/constants.ts');
    return 0;
  }

  for (const problem of problems) {
    console.log(`FAIL: ${problem}`);
  }
  return 1;
}

process.exit(main());
