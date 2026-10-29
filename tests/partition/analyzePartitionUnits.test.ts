import { test } from 'node:test';
import { expect } from '#test-expect';
import { analyzePartitionUnits } from '../../packages/toolchain-core/src/partition/analyzePartitionUnits.js';
import { createPartitionSource } from './createPartitionSource.js';

test('creates one spatial unit per mesh node and computes world bounds', () => {
  const analysis = analyzePartitionUnits(createPartitionSource());

  expect(analysis.units).toHaveLength(4);
  expect(analysis.triangleCount).toBe(4);
  expect(analysis.units.map((unit) => unit.nodeIndices)).toEqual([
    [0], [1], [2], [3],
  ]);
  expect(analysis.units[2]!.bounds.min).toEqual([20, 0, 0]);
  expect(analysis.units[2]!.bounds.max).toEqual([21, 1, 0]);
  expect(analysis.bounds).toEqual({
    min: [0, 0, 0],
    max: [31, 1, 0],
  });
});

test('keeps all nodes sharing one mesh in one atomic unit', () => {
  const analysis = analyzePartitionUnits(createPartitionSource(true));

  expect(analysis.units).toHaveLength(1);
  expect(analysis.units[0]!.nodeIndices).toEqual([0, 1, 2, 3]);
  expect(analysis.units[0]!.meshIndices).toEqual([0]);
  expect(analysis.renderedTriangleCount).toBe(4);
  expect(analysis.units[0]!.bounds).toEqual({
    min: [0, 0, 0],
    max: [31, 1, 0],
  });
});
