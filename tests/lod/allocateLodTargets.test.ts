import { expect, test } from 'node-test';
import { allocateLodTargets } from '../../packages/toolchain-core/src/lod/allocateLodTargets.js';

const unit = (index: number, triangleCount: number) => ({
  nodeIndices: [index],
  meshIndices: [index],
  bounds: { min: [index, 0, 0], max: [index + 1, 1, 1] } as const,
  triangleCount,
});

test('keeps every unit at or above the minimum', () => {
  const targets = allocateLodTargets(
    [unit(0, 1000), unit(1, 8), unit(2, 1)],
    {
      ratio: 0.15,
      maxTrianglesPerProxy: 500,
      minTrianglesPerUnit: 8,
    },
  );

  expect(targets[0]!.targetTriangles).toBe(150);
  expect(targets[1]!.targetTriangles).toBe(8);
  expect(targets[2]!.targetTriangles).toBe(1);
});

test('lets device minimums exceed the node soft cap', () => {
  const targets = allocateLodTargets(
    Array.from({ length: 4 }, (_, index) => unit(index, 100)),
    {
      ratio: 0.15,
      maxTrianglesPerProxy: 16,
      minTrianglesPerUnit: 8,
    },
  );

  expect(targets.map((entry) => entry.targetTriangles)).toEqual([
    8, 8, 8, 8,
  ]);
});
