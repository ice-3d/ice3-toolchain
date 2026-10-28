import { test } from 'node:test';
import { expect } from '#test-expect';
import { bakeLocalMatrix } from '../../packages/toolchain-core/src/scene/bakeMatrix.js';

test('bakes source TRS into a local matrix', () => {
  expect(
    bakeLocalMatrix(undefined, [2, 3, 4], [0, 0, 0, 1], [1, 1, 1]),
  ).toEqual([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    2, 3, 4, 1,
  ]);
});

test('preserves a source matrix without decomposing it', () => {
  const source = [
    0, 1, 0, 0,
    -1, 0, 0, 0,
    0, 0, 1, 0,
    7, 8, 9, 1,
  ];
  expect(bakeLocalMatrix(source)).toEqual(source);
});

test('composes rotation around the Y axis in column-major order', () => {
  const result = bakeLocalMatrix(
    undefined,
    [0, 0, 0],
    [0, Math.SQRT1_2, 0, Math.SQRT1_2],
    [1, 1, 1],
  );

  expect(result[0]).toBeCloseTo(0);
  expect(result[2]).toBeCloseTo(-1);
  expect(result[8]).toBeCloseTo(1);
  expect(result[10]).toBeCloseTo(0);
});
