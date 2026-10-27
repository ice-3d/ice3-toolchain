import type { ICESourceDocument } from '../../packages/toolchain-core/src/index.js';

const grid = (wave: boolean) => {
  const cells = 8;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= cells; y += 1) {
    for (let x = 0; x <= cells; x += 1) {
      positions.push(
        x / cells,
        y / cells,
        wave ? Math.sin(x * Math.PI / 2) * Math.cos(y * Math.PI / 2) : 0,
      );
    }
  }
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      const a = y * (cells + 1) + x;
      const b = a + 1;
      const c = a + cells + 1;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint16Array(indices),
  };
};

export function createAdaptiveLodPartitionSource(): ICESourceDocument {
  const simple = grid(false);
  const complex = grid(true);
  const positionBytes = simple.positions.byteLength + complex.positions.byteLength;
  const indexBytes = simple.indices.byteLength + complex.indices.byteLength;
  const bytes = new Uint8Array(positionBytes + indexBytes);
  bytes.set(new Uint8Array(simple.positions.buffer), 0);
  bytes.set(
    new Uint8Array(complex.positions.buffer),
    simple.positions.byteLength,
  );
  bytes.set(new Uint8Array(simple.indices.buffer), positionBytes);
  bytes.set(
    new Uint8Array(complex.indices.buffer),
    positionBytes + simple.indices.byteLength,
  );
  const view = (
    byteOffset: number,
    byteLength: number,
  ) => ({ buffer: 0, byteOffset, byteLength });
  return {
    baseDirectory: '.',
    buffers: [bytes],
    json: {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0, 1] }],
      nodes: [
        { name: 'simple-grid', mesh: 0, translation: [0, 0, 0] },
        { name: 'complex-grid', mesh: 1, translation: [10, 0, 0] },
      ],
      meshes: [0, 1].map((index) => ({
        primitives: [{
          attributes: { POSITION: index },
          indices: index + 2,
          material: 0,
          mode: 4,
          extras: { ice3: { id: `source/mesh/${index}/primitive/0` } },
        }],
      })),
      materials: [{ name: 'steel' }],
      buffers: [{ byteLength: bytes.byteLength }],
      bufferViews: [
        view(0, simple.positions.byteLength),
        view(simple.positions.byteLength, complex.positions.byteLength),
        view(positionBytes, simple.indices.byteLength),
        view(
          positionBytes + simple.indices.byteLength,
          complex.indices.byteLength,
        ),
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: simple.positions.length / 3,
          type: 'VEC3',
          min: [0, 0, 0],
          max: [1, 1, 0],
        },
        {
          bufferView: 1,
          componentType: 5126,
          count: complex.positions.length / 3,
          type: 'VEC3',
          min: [0, 0, -1],
          max: [1, 1, 1],
        },
        {
          bufferView: 2,
          componentType: 5123,
          count: simple.indices.length,
          type: 'SCALAR',
        },
        {
          bufferView: 3,
          componentType: 5123,
          count: complex.indices.length,
          type: 'SCALAR',
        },
      ],
    },
  };
}
