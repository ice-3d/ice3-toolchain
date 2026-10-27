import { expect, test } from 'node-test';
import { collectFitSamples } from '../../../packages/toolchain-core/src/lod/semanticProxy/collectFitSamples.js';
import { fitProxyGeometry } from '../../../packages/toolchain-core/src/lod/semanticProxy/fitProxyGeometry.js';

const symmetricBox = (): { positions: Float32Array; indices: Uint32Array } => {
  const half = [4, 2, 1] as const;
  const cells = 3;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let axis = 0; axis < 3; axis += 1) {
    for (const side of [-1, 1]) {
      const start = positions.length / 3;
      const first = (axis + 1) % 3;
      const second = (axis + 2) % 3;
      for (let b = 0; b <= cells; b += 1) {
        for (let a = 0; a <= cells; a += 1) {
          const point = [0, 0, 0];
          point[axis] = half[axis]! * side;
          point[first] = -half[first]! + 2 * half[first]! * a / cells;
          point[second] = -half[second]! + 2 * half[second]! * b / cells;
          positions.push(...point);
        }
      }
      const stride = cells + 1;
      for (let b = 0; b < cells; b += 1) {
        for (let a = 0; a < cells; a += 1) {
          const p = start + b * stride + a;
          const q = p + 1;
          const r = p + stride;
          const s = r + 1;
          indices.push(p, q, r, q, s, r);
        }
      }
    }
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
};

test('uses unique surface vertices to avoid rotating symmetric box axes', () => {
  const source = symmetricBox();
  const obb = fitProxyGeometry(collectFitSamples([source]))
    .candidates.find((candidate) => candidate.kind === 'obb')!;

  expect(obb.volume).toBeCloseTo(64, 2);
});

test('fits an oriented box with twelve triangles', () => {
  const result = fitProxyGeometry({
    vertices: new Float32Array([
      -2, -1, -1,
      2, -1, -1,
      -2, 1, -1,
      2, 1, -1,
      -2, -1, 1,
      2, -1, 1,
      -2, 1, 1,
      2, 1, 1,
    ]),
    centroids: new Float32Array([-2, 0, 0, 2, 0, 0]),
    areas: new Float32Array([1, 1]),
    bounds: { min: [-2, -1, -1], max: [2, 1, 1] },
  });
  const obb = result.candidates.find((candidate) => candidate.kind === 'obb')!;

  expect(obb.triangleCount).toBe(12);
  expect(obb.axisStable).toBe(true);
  expect(obb.positions.length).toBe(24);
  expect(obb.indices.length).toBe(36);
});

test('fits a cylinder for an elongated radial shape', () => {
  const values: number[] = [];
  for (let segment = 0; segment < 16; segment += 1) {
    const angle = segment / 16 * Math.PI * 2;
    values.push(
      Math.cos(angle),
      -3,
      Math.sin(angle),
      Math.cos(angle),
      3,
      Math.sin(angle),
    );
  }
  const result = fitProxyGeometry({
    vertices: new Float32Array(values),
    centroids: new Float32Array([0, -3, 0, 0, 3, 0]),
    areas: new Float32Array([1, 1]),
    bounds: { min: [-1, -3, -1], max: [1, 3, 1] },
  });
  const cylinder = result.candidates.find(
    (candidate) => candidate.kind === 'cylinder',
  )!;

  expect(cylinder.triangleCount).toBe(64);
  expect(cylinder.axisStable).toBe(true);
});

test('centers a cylinder on an off-origin device', () => {
  const values: number[] = [];
  for (let segment = 0; segment < 16; segment += 1) {
    const angle = segment / 16 * Math.PI * 2;
    values.push(
      10 + Math.cos(angle),
      -3,
      5 + Math.sin(angle),
      10 + Math.cos(angle),
      3,
      5 + Math.sin(angle),
    );
  }
  const result = fitProxyGeometry({
    vertices: new Float32Array(values),
    centroids: new Float32Array([10, -3, 5, 10, 3, 5]),
    areas: new Float32Array([1, 1]),
    bounds: { min: [9, -3, 4], max: [11, 3, 6] },
  });
  const cylinder = result.candidates.find(
    (candidate) => candidate.kind === 'cylinder',
  )!;
  const xs = Array.from(
    { length: cylinder.positions.length / 3 },
    (_value, index) => cylinder.positions[index * 3]!,
  );
  const zs = Array.from(
    { length: cylinder.positions.length / 3 },
    (_value, index) => cylinder.positions[index * 3 + 2]!,
  );

  expect(Math.min(...xs)).toBeCloseTo(9, 5);
  expect(Math.max(...xs)).toBeCloseTo(11, 5);
  expect(Math.min(...zs)).toBeCloseTo(4, 5);
  expect(Math.max(...zs)).toBeCloseTo(6, 5);
  expect(cylinder.volume).toBeLessThan(30);
});

test('rejects an isotropic or zero covariance fit', () => {
  const result = fitProxyGeometry({
    vertices: new Float32Array([1, 1, 1]),
    centroids: new Float32Array([1, 1, 1]),
    areas: new Float32Array([1]),
    bounds: { min: [1, 1, 1], max: [1, 1, 1] },
  });

  expect(result.candidates).toEqual([]);
  expect(result.rejectionReasons).toContain('degenerate_covariance');
});
