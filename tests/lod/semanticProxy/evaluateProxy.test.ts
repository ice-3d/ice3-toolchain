import { expect, test } from 'node-test';
import { evaluateProxyCandidates } from '../../../packages/toolchain-core/src/lod/semanticProxy/evaluateProxy.js';

test('evaluates large vertex sets without argument spreading', () => {
  const vertexCount = 200_000;
  const vertices = new Float32Array(vertexCount * 3);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    vertices[vertex * 3] = vertex % 2 === 0 ? -1 : 1;
    vertices[vertex * 3 + 1] = vertex % 4 < 2 ? -1 : 1;
  }
  const evaluations = evaluateProxyCandidates({
    vertices,
    centroids: new Float32Array([0, 0, 0]),
    areas: new Float32Array([1]),
    bounds: { min: [-1, -1, 0], max: [1, 1, 0] },
  }, [{
    id: 'obb',
    kind: 'obb',
    positions: new Float32Array([
      -1, -1, -1,
      1, -1, -1,
      -1, 1, -1,
      1, 1, -1,
      -1, -1, 1,
      1, -1, 1,
      -1, 1, 1,
      1, 1, 1,
    ]),
    indices: new Uint32Array([
      0, 2, 1, 1, 2, 3,
      4, 5, 6, 5, 7, 6,
      0, 1, 4, 1, 5, 4,
      2, 6, 3, 3, 6, 7,
      0, 4, 2, 2, 4, 6,
      1, 3, 5, 3, 7, 5,
    ]),
    triangleCount: 12,
    volume: 8,
    axisStable: true,
  }], 1_600_000);

  expect(evaluations).toHaveLength(1);
  expect(Number.isFinite(evaluations[0]!.normalizedMaximumDeviation)).toBe(true);
});

test('rejects an obb for a highly elongated device', () => {
  const positions = new Float32Array([
    0, 0, 0,
    20, 0, 0,
    0, 1, 0,
    20, 1, 0,
    0, 0, 1,
    20, 0, 1,
    0, 1, 1,
    20, 1, 1,
  ]);
  const evaluations = evaluateProxyCandidates({
    vertices: positions,
    centroids: new Float32Array([10, 0.5, 0.5]),
    areas: new Float32Array([1]),
    bounds: { min: [0, 0, 0], max: [20, 1, 1] },
  }, [{
    id: 'obb',
    kind: 'obb',
    positions,
    indices: new Uint32Array([
      0, 2, 1, 1, 2, 3,
      4, 5, 6, 5, 7, 6,
      0, 1, 4, 1, 5, 4,
      2, 6, 3, 3, 6, 7,
      0, 4, 2, 2, 4, 6,
      1, 3, 5, 3, 7, 5,
    ]),
    triangleCount: 12,
    volume: 20,
    axisStable: true,
  }], 160);

  expect(evaluations[0]).toMatchObject({
    accepted: false,
    rejectionReason: 'obb_aspect_ratio',
  });
});
