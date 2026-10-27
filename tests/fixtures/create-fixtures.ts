import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const directory = resolve('tests/fixtures');
mkdirSync(directory, { recursive: true });

const positions = new Float32Array([
  0, 0, 0,
  1, 0, 0,
  0, 1, 0,
]);
const indices = new Uint16Array([0, 1, 2]);
const binary = Buffer.alloc(42);
Buffer.from(positions.buffer).copy(binary, 0);
Buffer.from(indices.buffer).copy(binary, 36);
writeFileSync(resolve(directory, 'minimal.bin'), binary);

const document = {
  asset: { version: '2.0' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'triangle' }],
  meshes: [{
    primitives: [{
      attributes: { POSITION: 0 },
      indices: 1,
      material: 0,
      mode: 4,
    }],
  }],
  materials: [{
    name: 'steel',
    pbrMetallicRoughness: { baseColorFactor: [0.2, 0.5, 0.9, 1] },
  }],
  buffers: [{ uri: 'minimal.bin', byteLength: 42 }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: 36 },
    { buffer: 0, byteOffset: 36, byteLength: 6 },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: 3,
      type: 'VEC3',
      min: [0, 0, 0],
      max: [1, 1, 0],
    },
    {
      bufferView: 1,
      componentType: 5123,
      count: 3,
      type: 'SCALAR',
    },
  ],
};

writeFileSync(
  resolve(directory, 'minimal.gltf'),
  JSON.stringify(document, null, 2),
);

const embeddedDocument = {
  ...document,
  buffers: [{ byteLength: 42 }],
};
const jsonChunk = Buffer.from(JSON.stringify(embeddedDocument), 'utf8');
const jsonLength = Math.ceil(jsonChunk.length / 4) * 4;
const binaryLength = Math.ceil(binary.length / 4) * 4;
const validGlb = Buffer.alloc(12 + 8 + jsonLength + 8 + binaryLength);
validGlb.writeUInt32LE(0x46546c67, 0);
validGlb.writeUInt32LE(2, 4);
validGlb.writeUInt32LE(validGlb.length, 8);
validGlb.writeUInt32LE(jsonLength, 12);
validGlb.writeUInt32LE(0x4e4f534a, 16);
validGlb.fill(0x20, 20, 20 + jsonLength);
jsonChunk.copy(validGlb, 20);
const binaryChunkHeader = 20 + jsonLength;
validGlb.writeUInt32LE(binaryLength, binaryChunkHeader);
validGlb.writeUInt32LE(0x004e4942, binaryChunkHeader + 4);
binary.copy(validGlb, binaryChunkHeader + 8);
writeFileSync(resolve(directory, 'minimal.glb'), validGlb);

const truncated = Buffer.alloc(24);
truncated.writeUInt32LE(0x46546c67, 0);
truncated.writeUInt32LE(2, 4);
truncated.writeUInt32LE(24, 8);
truncated.writeUInt32LE(64, 12);
truncated.writeUInt32LE(0x4e4f534a, 16);
writeFileSync(resolve(directory, 'truncated.glb'), truncated);

const cubePositions = new Float32Array([
  -1, -1, 1,
  1, -1, 1,
  1, 1, 1,
  -1, 1, 1,
  -1, -1, -1,
  1, -1, -1,
  1, 1, -1,
  -1, 1, -1,
]);
const cubeIndices = new Uint16Array([
  0, 1, 2, 0, 2, 3,
  5, 4, 7, 5, 7, 6,
  4, 0, 3, 4, 3, 7,
  1, 5, 6, 1, 6, 2,
  3, 2, 6, 3, 6, 7,
  4, 5, 1, 4, 1, 0,
]);
const cubeBinary = Buffer.alloc(96 + 72);
Buffer.from(cubePositions.buffer).copy(cubeBinary, 0);
Buffer.from(cubeIndices.buffer).copy(cubeBinary, 96);
writeFileSync(resolve(directory, 'cube.bin'), cubeBinary);
writeFileSync(
  resolve(directory, 'cube.gltf'),
  JSON.stringify({
    ...document,
    nodes: [{ mesh: 0, name: 'prepared-cube' }],
    buffers: [{ uri: 'cube.bin', byteLength: 168 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 96 },
      { buffer: 0, byteOffset: 96, byteLength: 72 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 8,
        type: 'VEC3',
        min: [-1, -1, -1],
        max: [1, 1, 1],
      },
      {
        bufferView: 1,
        componentType: 5123,
        count: 36,
        type: 'SCALAR',
      },
    ],
  }, null, 2),
);
