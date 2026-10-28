import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  allocateAdaptiveLod,
  type ICELodUnitCurve,
} from '../../packages/toolchain-core/src/lod/allocateAdaptiveLod.js';

const curve = (
  unitId: string,
  samples: readonly [number, number][],
): ICELodUnitCurve => ({
  unitId,
  sourceTriangles: samples.at(-1)![0],
  samples: samples.map(([actualTriangles, errorMeters]) => ({
    targetTriangles: actualTriangles,
    actualTriangles,
    errorMeters,
    preservedSource: false,
    replacement: {
      kind: 'primitives',
      primitives: [],
    },
  })),
});

test('spends the next triangle where normalized error reduction is highest', () => {
  const result = allocateAdaptiveLod({
    maxTriangles: 70,
    nodeDiagonalMeters: 10,
    curves: [
      curve('simple', [[10, 1], [20, 0.9], [100, 0.8]]),
      curve('complex', [[10, 2], [40, 0.5], [100, 0.1]]),
    ],
  });

  expect(result.allocatedTriangles).toBeLessThanOrEqual(70);
  expect(result.selections.find((entry) => entry.unitId === 'complex'))
    .toMatchObject({ sampleIndex: 1, actualTriangles: 40 });
  expect(result.selections.find((entry) => entry.unitId === 'simple'))
    .toMatchObject({ sampleIndex: 1, actualTriangles: 20 });
});

test('rejects an adaptive node when device minimums exceed its budget', () => {
  expect(() => allocateAdaptiveLod({
    maxTriangles: 15,
    nodeDiagonalMeters: 10,
    curves: [
      curve('a', [[8, 1], [100, 0]]),
      curve('b', [[8, 1], [100, 0]]),
    ],
  })).toThrow(/ICE3_TOOL_LOD_BUDGET_INVALID/);
});

test('uses stable unit IDs when marginal benefits are equal', () => {
  const result = allocateAdaptiveLod({
    maxTriangles: 40,
    nodeDiagonalMeters: 10,
    curves: [
      curve('b', [[10, 1], [20, 0]]),
      curve('a', [[10, 1], [20, 0]]),
    ],
  });

  expect(result.selections.map((entry) => entry.unitId)).toEqual(['a', 'b']);
  expect(result.selections.map((entry) => entry.actualTriangles)).toEqual([
    20, 20,
  ]);
});

test('skips zero-cost plateau steps without dividing by zero', () => {
  const result = allocateAdaptiveLod({
    maxTriangles: 20,
    nodeDiagonalMeters: 10,
    curves: [curve('plateau', [[10, 0], [10, 0], [20, 0]])],
  });

  expect(result.allocatedTriangles).toBe(10);
  expect(result.selections[0]!.sampleIndex).toBe(0);
});
