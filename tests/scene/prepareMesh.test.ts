import { test } from 'node:test';
import { expect } from '#test-expect';
import { prepareMesh } from '../../packages/toolchain-core/src/scene/prepareMesh.js';

const quadPositions = new Float32Array([
  -1, -1, 0,
  1, -1, 0,
  -1, 1, 0,
  1, 1, 0,
]);
const quadIndices = new Uint32Array([0, 1, 2, 3]);

test('triangulates a triangle strip into six indices', () => {
  const prepared = prepareMesh(quadPositions, quadIndices, 30, { mode: 5 });
  expect([...prepared.indices]).toEqual([0, 1, 2, 2, 1, 3]);
  expect(prepared.edgeIndices).toHaveLength(8);
});

test('keeps cube boundary and crease edges but drops face diagonals', () => {
  const positions = new Float32Array([
    -1, -1, 1,
    1, -1, 1,
    1, 1, 1,
    -1, 1, 1,
    -1, -1, -1,
    1, -1, -1,
    1, 1, -1,
    -1, 1, -1,
  ]);
  const indices = new Uint32Array([
    0, 1, 2, 0, 2, 3,
    5, 4, 7, 5, 7, 6,
    4, 0, 3, 4, 3, 7,
    1, 5, 6, 1, 6, 2,
    3, 2, 6, 3, 6, 7,
    4, 5, 1, 4, 1, 0,
  ]);

  const prepared = prepareMesh(positions, indices, 30);
  expect(prepared.edgeIndices).toHaveLength(24);
  expect(prepared.bounds).toEqual({
    min: [-1, -1, -1],
    max: [1, 1, 1],
  });
});

test('rejects non-finite positions', () => {
  const positions = new Float32Array([0, 0, 0, 1, Number.NaN, 0, 0, 1, 0]);
  expect(() => prepareMesh(positions, new Uint32Array([0, 1, 2]), 30)).toThrow(
    /ICE3_TOOL_INVALID_GEOMETRY/,
  );
});
