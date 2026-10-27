import type { ICESourceDocument } from '../../packages/toolchain-core/src/index.js';

export function createLodPartitionSource(): ICESourceDocument {
  const cells = 4;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= cells; y += 1) {
    for (let x = 0; x <= cells; x += 1) {
      positions.push(x / cells, y / cells, 0);
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
  const binary = new Uint8Array(indexOffset + indexData.byteLength);
  binary.set(new Uint8Array(positionData.buffer));
  binary.set(new Uint8Array(indexData.buffer), indexOffset);

  return {
    baseDirectory: '.',
    buffers: [binary],
    json: {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0, 1, 2, 3] }],
      nodes: Array.from({ length: 4 }, (_, index) => ({
        name: `equipment-${index}`,
        mesh: index,
        translation: [index * 10, 0, 0],
      })),
      meshes: Array.from({ length: 4 }, (_value, index) => ({
        primitives: [{
          attributes: { POSITION: 0 },
          indices: 1,
          material: 0,
          mode: 4,
          extras: { ice3: { id: `source/mesh/${index}/primitive/0` } },
        }],
      })),
      materials: [{
        name: 'steel',
        pbrMetallicRoughness: {
          baseColorFactor: [0.2, 0.5, 0.9, 1],
        },
      }],
      buffers: [{ byteLength: binary.byteLength }],
      bufferViews: [
        {
          buffer: 0,
          byteOffset: 0,
          byteLength: positionData.byteLength,
        },
        {
          buffer: 0,
          byteOffset: indexOffset,
          byteLength: indexData.byteLength,
        },
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: positionData.length / 3,
          type: 'VEC3',
          min: [0, 0, 0],
          max: [1, 1, 0],
        },
        {
          bufferView: 1,
          componentType: 5123,
          count: indexData.length,
          type: 'SCALAR',
        },
      ],
    },
  };
}
