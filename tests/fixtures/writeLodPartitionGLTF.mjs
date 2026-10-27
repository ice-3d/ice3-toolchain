import { writeFileSync } from 'node:fs';

const cells = 4;
const positions = [];
const indices = [];
for (let y = 0; y <= cells; y += 1) {
  for (let x = 0; x <= cells; x += 1) {
    positions.push(
      x / cells,
      y / cells,
      Math.sin((x / cells) * Math.PI) * Math.sin((y / cells) * Math.PI) * 0.35,
    );
  }
}
const stride = cells + 1;
for (let y = 0; y < cells; y += 1) {
  for (let x = 0; x < cells; x += 1) {
    const a = y * stride + x;
    const b = a + 1;
    const c = a + stride;
    const d = c + 1;
    indices.push(a, b, c, b, d, c);
  }
}

const positionData = new Float32Array(positions);
const indexData = new Uint16Array(indices);
const indexOffset = positionData.byteLength;
const binary = Buffer.alloc(indexOffset + indexData.byteLength);
Buffer.from(positionData.buffer).copy(binary, 0);
Buffer.from(indexData.buffer).copy(binary, indexOffset);
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
    byteLength: binary.byteLength,
    uri: `data:application/octet-stream;base64,${binary.toString('base64')}`,
  }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: positionData.byteLength },
    { buffer: 0, byteOffset: indexOffset, byteLength: indexData.byteLength },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: positionData.length / 3,
      type: 'VEC3',
      min: [0, 0, 0],
      max: [1, 1, 0.35],
    },
    {
      bufferView: 1,
      componentType: 5123,
      count: indexData.length,
      type: 'SCALAR',
    },
  ],
};
if (!process.argv[2]) throw new Error('output path is required');
writeFileSync(process.argv[2], JSON.stringify(document, null, 2));
