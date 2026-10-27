import type { ICESourceDocument } from '../../packages/toolchain-core/src/index.js';

export function createPartitionSource(
  sharedMesh = false,
): ICESourceDocument {
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]);
  const indices = new Uint16Array([0, 1, 2]);
  const binary = new Uint8Array(42);
  binary.set(new Uint8Array(positions.buffer), 0);
  binary.set(new Uint8Array(indices.buffer), 36);
  const nodeCount = 4;

  return {
    baseDirectory: '.',
    buffers: [binary],
    json: {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0, 1, 2, 3] }],
      nodes: Array.from({ length: nodeCount }, (_, index) => ({
        name: `equipment-${index}`,
        mesh: sharedMesh ? 0 : index,
        translation: [index * 10, 0, 0],
      })),
      meshes: Array.from(
        { length: sharedMesh ? 1 : nodeCount },
        () => ({
          primitives: [{
            attributes: { POSITION: 0 },
            indices: 1,
            material: 0,
            mode: 4,
          }],
        }),
      ),
      materials: [{
        name: 'steel',
        pbrMetallicRoughness: {
          baseColorFactor: [0.2, 0.5, 0.9, 1],
        },
      }],
      buffers: [{ byteLength: 42 }],
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
    },
  };
}
