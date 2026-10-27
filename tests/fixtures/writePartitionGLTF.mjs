import { writeFileSync } from 'node:fs';

const positions = new Float32Array([
  0, 0, 0,
  1, 0, 0,
  0, 1, 0,
]);
const indices = new Uint16Array([0, 1, 2]);
const binary = Buffer.alloc(42);
Buffer.from(positions.buffer).copy(binary, 0);
Buffer.from(indices.buffer).copy(binary, 36);
const document = {
  asset: { version: '2.0' },
  scene: 0,
  scenes: [{ nodes: [0, 1, 2, 3] }],
  nodes: [0, 1, 2, 3].map((index) => ({
    name: `equipment-${index}`,
    mesh: index,
    translation: [index * 10, 0, 0],
  })),
  meshes: [0, 1, 2, 3].map(() => ({
    primitives: [{
      attributes: { POSITION: 0 },
      indices: 1,
      material: 0,
      mode: 4,
    }],
  })),
  materials: [{
    name: 'steel',
    pbrMetallicRoughness: { baseColorFactor: [0.2, 0.5, 0.9, 1] },
  }],
  buffers: [{
    byteLength: 42,
    uri: `data:application/octet-stream;base64,${
      binary.toString('base64')
    }`,
  }],
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
if (!process.argv[2]) throw new Error('output path is required');
writeFileSync(process.argv[2], JSON.stringify(document, null, 2));
