import { test } from 'node:test';
import { expect } from '#test-expect';
import { classifyAdaptiveUnits } from '../../packages/toolchain-core/src/lod/classifyAdaptiveUnits.js';

test('returns only units outside the dominant ratio tolerance', () => {
  expect(classifyAdaptiveUnits(
    ['a', 'b', 'c', 'd'],
    [0.4, 0.4, 0.2, 0.398],
  )).toEqual(['c']);
});

test('returns no outliers when every ratio is within tolerance', () => {
  expect(classifyAdaptiveUnits(
    ['a', 'b', 'c'],
    [0.402, 0.4, 0.391],
  )).toEqual([]);
});
